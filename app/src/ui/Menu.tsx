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
    <div className="overlay open">
      <div className="sheet">
        <h1>Crater Club</h1>
        <p className="lede">Every turn you shape the ground, then fire across it. Dig tunnels, flood craters and bury your rivals.</p>

        <div className="group">
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
                <span className="seatdot" style={{ background: SEATS[i].c }} /> Seat {i + 1}
                <select value={p.type} onChange={(e) => { const players = s.players.map((q, j) => (j === i ? { type: e.target.value as PlayerType } : q)); setPlayers(players); }}>
                  {PLAYER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="group grid2">
          <Field label="Win by" k="mode" value={s.mode} onChange={(v) => set({ mode: v as Settings['mode'] })} />
          <label className="field"><span>{amountLabel}</span>
            <input type="number" min={s.mode === 'health' ? 20 : 1} max={s.mode === 'health' ? 999 : 60}
              value={s[amountField]} onChange={(e) => set({ [amountField]: +e.target.value } as Partial<Settings>)} />
          </label>
          <Field label="Weapons" k="deal" value={s.deal} onChange={(v) => set({ deal: v as Settings['deal'] })} />
          <Field label="Confirm shots" k="confirm" value={s.confirm} onChange={(v) => set({ confirm: v as Settings['confirm'] })} />
          <Field label="Sides" k="teams" value={s.teams} onChange={(v) => set({ teams: v as Settings['teams'] })} />
        </div>

        <div className="group grid2">
          <Field label="Terrain" k="biome" value={s.biome} onChange={(v) => set({ biome: v })} />
          <Field label="Size" k="size" value={s.size} onChange={(v) => set({ size: v })} />
          <Field label="Time" k="time" value={s.time} onChange={(v) => set({ time: v })} />
          <Field label="Weather" k="weather" value={s.weather} onChange={(v) => set({ weather: v })} />
          <Field label="Wind" k="wind" value={s.wind} onChange={(v) => set({ wind: v })} />
        </div>

        <div className="go">
          <button type="button" className="primary" onClick={() => g.startMatch()}>Start match</button>
          <button type="button" className="ghost" onClick={() => g.startPlayground()}>Playground</button>
        </div>
        <details className="howto">
          <summary>How to play</summary>
          <p>Arrow keys aim and set power, <kbd>Q</kbd>/<kbd>E</kbd> switch weapon, <kbd>A</kbd>/<kbd>D</kbd> drive, <kbd>Z</kbd>/<kbd>X</kbd>/<kbd>C</kbd>/<kbd>V</kbd> dig, burrow, wall, bridge. <kbd>Space</kbd> arms the shot, then confirm. You can also drag from your tank to aim.</p>
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
