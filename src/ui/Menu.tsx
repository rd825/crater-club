import { useGame, useVersion } from './ctx.tsx';
import { OPTS, type Settings } from '../data/options.ts';
import { MAXP, SEATS, type PlayerType } from '../engine/constants.ts';

const PLAYER_OPTS: [PlayerType, string][] = [
  ['human', 'Human'],
  ['rookie', 'Rookie computer'],
  ['regular', 'Regular computer'],
  ['veteran', 'Veteran computer'],
  ['ace', 'Ace computer'],
];

export function Menu(): React.JSX.Element {
  const g = useGame();
  useVersion();
  const s = g.settings;

  const set = (patch: Partial<Settings>) => g.saveSettings({ ...s, ...patch, players: patch.players ?? s.players });
  const setPlayers = (players: { type: PlayerType }[]) => g.saveSettings({ ...s, players });
  const setCount = (d: number) => {
    const next = Math.max(2, Math.min(MAXP, s.players.length + d));
    const players = s.players.slice(0, next);
    while (players.length < next) players.push({ type: players.length === 0 ? 'human' : 'regular' });
    setPlayers(players);
  };

  const amountField = s.mode === 'health' ? 'health' : 'volleys';
  const amountLabel = s.mode === 'health' ? 'Starting health' : 'Volleys each';

  return (
    <div className="overlay open" role="dialog" aria-modal="true" aria-label="Game setup">
      <div className="sheet setup">
        <h1>Crater Club</h1>
        <p className="lede">Every turn you shape the ground, then fire across it. Dig tunnels, flood craters and bury your rivals.</p>

        <div className="setup-grid">
          <div className="group tanks">
            <div className="grow"><strong>Tanks</strong>
              <div className="stepper">
                <button type="button" onClick={() => setCount(-1)} disabled={s.players.length <= 2}>−</button>
                <span>{s.players.length}</span>
                <button type="button" onClick={() => setCount(1)} disabled={s.players.length >= MAXP}>+</button>
              </div>
            </div>
            <div className="playerRows">
              {s.players.map((p, i) => (
                <label key={i} className="prow">
                  <span className="seatdot" style={{ background: SEATS[i].c, color: SEATS[i].c }} /> Seat {i + 1}
                  <select value={p.type} onChange={(e) => { const players = s.players.map((q, j) => (j === i ? { type: e.target.value as PlayerType } : q)); setPlayers(players); }}>
                    {PLAYER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="group">
            <h3 className="group-h">Match rules</h3>
            <div className="grid2">
              <Field label="Win by" k="mode" value={s.mode} onChange={(v) => set({ mode: v as Settings['mode'] })} />
              <label className="field"><span>{amountLabel}</span>
                <input type="number" min={s.mode === 'health' ? 20 : 1} max={s.mode === 'health' ? 999 : 60}
                  value={s[amountField]} onChange={(e) => set({ [amountField]: +e.target.value } as Partial<Settings>)} />
              </label>
              <Field label="Weapons" k="deal" value={s.deal} onChange={(v) => set({ deal: v as Settings['deal'] })} />
              <Field label="Confirm shots" k="confirm" value={s.confirm} onChange={(v) => set({ confirm: v as Settings['confirm'] })} />
              <Field label="Sides" k="teams" value={s.teams} onChange={(v) => set({ teams: v as Settings['teams'] })} />
            </div>
          </div>

          <div className="group">
            <h3 className="group-h">Battlefield</h3>
            <div className="grid2">
              <Field label="Terrain" k="biome" value={s.biome} onChange={(v) => set({ biome: v })} />
              <Field label="Size" k="size" value={s.size} onChange={(v) => set({ size: v })} />
              <Field label="Time" k="time" value={s.time} onChange={(v) => set({ time: v })} />
              <Field label="Weather" k="weather" value={s.weather} onChange={(v) => set({ weather: v })} />
              <Field label="Wind" k="wind" value={s.wind} onChange={(v) => set({ wind: v })} />
            </div>
          </div>
        </div>

        {g.store.hasResume && (
          <div className="go resume">
            <button type="button" className="primary" onClick={() => g.resumeLast()}>Resume last match</button>
            <button type="button" className="ghost" onClick={() => g.clearResume()} aria-label="Discard the saved match">Discard</button>
          </div>
        )}
        <div className="go">
          <button type="button" className="primary" onClick={() => g.startMatch()}>Start match</button>
          <button type="button" className="ghost" onClick={() => g.startPlayground()}>Playground</button>
        </div>
        <details className="howto">
          <summary>How to play</summary>
          <p><kbd>←</kbd><kbd>→</kbd> aim the barrel (even below level, to shoot downhill) and <kbd>↑</kbd><kbd>↓</kbd> set power. <kbd>Q</kbd><kbd>E</kbd> switch weapon, <kbd>Space</kbd> fires. <kbd>A</kbd><kbd>D</kbd> switch shaping tool and <kbd>Enter</kbd> shapes the ground; <kbd>Z</kbd><kbd>X</kbd> drive. You can also drag from your tank to aim.</p>
        </details>
      </div>
    </div>
  );
}

function Field({ label, k, value, onChange }: { label: string; k: string; value: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {OPTS[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
