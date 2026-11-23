import { useGame, useVersion } from './ctx.tsx';
import { WEAPONS } from '../data/weapons.ts';
import { iconSrc } from '../render/sprites.ts';

export function Picker(): React.JSX.Element | null {
  const g = useGame();
  useVersion();
  const S = g.engine.S;
  if (!S?.sandbox) return null;
  const t = g.engine.cur();
  return (
    <div className="overlay open" role="dialog" aria-modal="true" aria-label="Weapon picker">
      <div className="sheet wide">
        <h2>All 50 weapons</h2>
        <p className="lede">Pick one to load it. Nothing runs out in the playground.</p>
        <div className="cards">
          {t.weapons.map((id, i) => {
            const w = WEAPONS[id];
            return (
              <button key={id} type="button" className="card" style={i === t.sel ? { ['--c' as string]: t.color } : undefined}
                onClick={() => { g.selectWeapon(i); g.closePicker(); }}>
                <img src={iconSrc(id)} alt="" width={32} height={32} />
                <b>{w.name}</b>
                <small>{w.desc}</small>
              </button>
            );
          })}
        </div>
        <div className="go"><button type="button" className="ghost" onClick={() => g.closePicker()}>Close</button></div>
      </div>
    </div>
  );
}
