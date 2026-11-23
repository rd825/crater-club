import { useGame, useVersion } from './ctx.tsx';
import { WEAPONS, TRACER } from '../data/weapons.ts';
import { SHAPES } from '../data/shapes.ts';
import { LEVELS } from '../data/levels.ts';
import { WEATHER } from '../data/weather.ts';
import { iconSrc } from '../render/sprites.ts';
import { clamp, aimText } from '../engine/math.ts';
import { AMIN, AMAX } from '../engine/constants.ts';

const chipName = (lastId: string | null, id: string): string =>
  id === 'encore' ? 'Encore (' + WEAPONS[lastId || 'shell'].name + ')' : WEAPONS[id].name;

/** A row of keyboard-hint caps, e.g. <Keys cap="↑ ↓" /> or <Keys cap="A D" />. */
const Keys = ({ caps, title }: { caps: string[]; title?: string }): React.JSX.Element => (
  <span className="keys" aria-hidden="true" title={title}>{caps.map((c, i) => <kbd key={i}>{c}</kbd>)}</span>
);

export function Hud(): React.JSX.Element | null {
  const g = useGame();
  useVersion();
  const S = g.engine.S;
  if (!S) return null;

  const t = g.engine.cur();
  const mine = g.engine.canHuman();
  const tracer = S.tracerRound && S.phase !== 'draft';
  const n = S.cfg.volleys;
  const live = S.phase === 'aim' || S.phase === 'flight';
  const w = S.wind;
  const shotNo = clamp(n - S.shots[t.id] + (S.phase === 'aim' ? 1 : 0), 1, n);
  const roundLabel =
    S.phase === 'draft' ? 'Weapon draft'
      : S.phase === 'over' ? 'Final result'
      : S.sandbox ? 'Playground'
      : S.tracerRound ? 'Tracer round'
      : S.health ? `Round ${S.round}`
      : `Volley ${shotNo} of ${n}`;
  const windLabel = w === 0 ? 'No wind' : `Wind ${w < 0 ? '← ' : ''}${Math.abs(w)}${w > 0 ? ' →' : ''}`;
  const envLabel = [S.pal.label, S.sky.label, S.env.weather === 'clear' ? '' : WEATHER[S.env.weather].label].filter(Boolean).join(' · ');
  const canShape = mine && (!t.shaped || S.sandbox) && !tracer;
  const bur = g.engine.isBuried(t);
  const selId = t.weapons[t.sel];

  let humans = 0;
  return (
    <>
      <header className="bar">
        <div className="seats">
          {S.tanks.map((k) => {
            const base = k.isAI
              ? S.sandbox ? 'Target' : `${LEVELS[k.level!].label} computer`
              : `Player ${(k.isAI ? humans : ++humans)}`;
            const role = k.dead ? 'Out' : S.health || S.sandbox ? base : `${base} · ${S.shots[k.id]} left`;
            const score = S.health ? Math.max(0, Math.ceil(k.hp)) : S.sandbox && k.isAI ? S.taken[k.id] || 0 : S.scores[k.id];
            const unit = S.sandbox ? (k.isAI ? 'taken' : 'dealt') : '';
            const cls = ['pcard', live && k === t ? 'active' : '', k.dead ? 'dead' : ''].filter(Boolean).join(' ');
            return (
              <div key={k.id} className={cls} style={{ ['--c' as string]: k.color }}>
                <div className="pcard-id"><span className="dot" /><span className="pname">{k.name}</span></div>
                <small className="prole" title={role}>{role}</small>
                <div className="pscore"><b>{score}</b>{unit && <span className="unit">{unit}</span>}</div>
                {S.health && <div className="hpbar"><i style={{ width: clamp((100 * k.hp) / S.cfg.health, 0, 100) + '%' }} /></div>}
              </div>
            );
          })}
        </div>
        <div className="meta">
          <span className="round">{roundLabel}</span>
          <span className="wind">{windLabel}</span>
          <span className="env">{envLabel}</span>
          {S.teams && !S.health && <span className="teamline">Left <b>{teamTotal(g, 0)}</b> · Right <b>{teamTotal(g, 1)}</b></span>}
        </div>
        <div className="barbtns">
          <button type="button" className="ghost" aria-pressed={g.store.soundState !== 'off'} onClick={() => g.toggleSound()}>Sound {g.store.soundState}</button>
          <button type="button" className="ghost" onClick={() => g.showMenu()}>Menu</button>
        </div>
      </header>

      <section className="dock" aria-label="Controls">
        <div className="shape">
          <div className="lab">
            <div className="labtop"><strong>Shape the ground</strong>{canShape && <Keys caps={['A', 'D', '↵']} title="A / D switch tool · Enter to shape" />}</div>
            <span>{shapeNote(S, t, canShape, tracer, bur)}</span>
          </div>
          <div className="toolrow">
            {Object.keys(SHAPES).map((k) => (
              <button key={k} type="button" disabled={!canShape}
                className={g.selTool === k ? 'sel' : ''} aria-pressed={g.selTool === k}
                onClick={() => g.shapeNow(k)}
                onPointerEnter={() => g.hoverTool(k)} onPointerLeave={() => g.hoverTool(null)}
                onFocus={() => g.hoverTool(k)} onBlur={() => g.hoverTool(null)}>
                <img src={iconSrc(k)} alt="" width={18} height={18} />
                {SHAPES[k as keyof typeof SHAPES].name}
              </button>
            ))}
          </div>
          <div className="driverow">
            <button type="button" aria-label="Drive left" disabled={!mine || (t.fuel <= 0 && !S.sandbox) || bur} onClick={() => g.drive(-1)}>◀</button>
            <span>{bur ? 'Buried' : S.sandbox ? 'Free driving' : `${t.fuel} ${t.fuel === 1 ? 'move' : 'moves'} left`}</span>
            <button type="button" aria-label="Drive right" disabled={!mine || (t.fuel <= 0 && !S.sandbox) || bur} onClick={() => g.drive(1)}>▶</button>
            <Keys caps={['Z', 'X']} title="Z / X to drive" />
          </div>
        </div>

        <div className="arsenal">
          <div className="lab">
            <div className="labtop"><strong style={{ color: t.color }}>{t.name}'s arsenal</strong>{mine && !tracer && <Keys caps={['Q', 'E']} title="Q / E switch weapon" />}</div>
            <span>{tracer ? TRACER.desc : selId ? WEAPONS[selId].desc : S.phase === 'over' ? '' : 'No weapons left.'}</span>
          </div>
          {tracer ? (
            <div className="chips">
              <button type="button" className="chip on" disabled={!mine}><img src={iconSrc('tracer')} alt="" width={16} height={16} />{TRACER.name}</button>
            </div>
          ) : S.sandbox ? (
            <div className="sandrow">
              <button type="button" className="weapon-now" disabled={!mine} onClick={() => g.openPicker()}
                aria-label={`Loaded weapon: ${selId ? WEAPONS[selId].name : 'none'}. Browse all 50.`}>
                <img src={iconSrc(selId || 'shell')} alt="" width={22} height={22} />
                <span className="wn-name">{selId ? WEAPONS[selId].name : 'Pick a weapon'}</span>
                <span className="wn-chg">Browse all 50</span>
              </button>
              <button type="button" className="newmap" onClick={() => g.newMap()}>New map</button>
            </div>
          ) : (
            <div className="chips">
              {t.weapons.map((id, i) => (
                <button key={i} type="button" className={'chip' + (i === t.sel ? ' on' : '')} disabled={!mine}
                  aria-pressed={i === t.sel} title={WEAPONS[id].desc} onClick={() => g.selectWeapon(i)}>
                  <img src={iconSrc(id)} alt="" width={16} height={16} />{chipName(S.lastId, id)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="aim">
          <div className="gauge">
            <label><span>Angle <Keys caps={['←', '→']} title="Left / right to aim" /></span><output>{aimText(t.angle)}</output></label>
            <div className="slide">
              <button type="button" aria-label="Rotate barrel left" disabled={!mine} onClick={() => g.nudge(1, 0)}>◀</button>
              <input type="range" min={180 - AMAX} max={180 - AMIN} step={1} value={180 - Math.round(t.angle)} disabled={!mine}
                aria-label="Barrel angle" aria-valuetext={aimText(t.angle)} onChange={(e) => g.setAngle(+e.target.value)} />
              <button type="button" aria-label="Rotate barrel right" disabled={!mine} onClick={() => g.nudge(-1, 0)}>▶</button>
            </div>
          </div>
          <div className="gauge">
            <label><span>Power <Keys caps={['↑', '↓']} title="Up / down for power" /></span><output>{Math.round(t.power)}</output></label>
            <div className="slide">
              <button type="button" aria-label="Less power" disabled={!mine} onClick={() => g.nudge(0, -1)}>−</button>
              <input type="range" min={5} max={100} step={1} value={Math.round(t.power)} disabled={!mine}
                aria-label="Shot power" onChange={(e) => g.setPower(+e.target.value)} />
              <button type="button" aria-label="More power" disabled={!mine} onClick={() => g.nudge(0, 1)}>+</button>
            </div>
          </div>
        </div>

        <div className="act">
          <button type="button" className={'fire' + (g.engine.isArmed() ? ' armed' : '')} disabled={!mine} onClick={() => g.pressFire()}>
            <span>{g.engine.isArmed() ? 'Confirm' : 'Fire'}</span>
            {mine && <span className="firekey" aria-hidden="true">Space</span>}
          </button>
          {g.engine.isArmed() && <button type="button" className="cancel" onClick={() => g.unarm()}>Cancel</button>}
        </div>
      </section>
    </>
  );
}

function teamTotal(g: ReturnType<typeof useGame>, k: number): number {
  const S = g.engine.S;
  return S.tanks.reduce((n, t) => n + (S.teamOf[t.id] === k ? S.scores[t.id] : 0), 0);
}
function shapeNote(S: ReturnType<typeof useGame>['engine']['S'], t: { shaped: boolean }, _canShape: boolean, tracer: boolean, bur: boolean): string {
  return S.sandbox ? 'As often as you like here' : tracer ? 'Opens after the tracer round' : t.shaped ? 'Done for this turn' : bur ? 'Buried: Dig gets you out' : 'One per turn, before you fire';
}
