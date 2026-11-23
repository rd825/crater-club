import { useGame, useVersion } from './ctx.tsx';

export function GameOver(): React.JSX.Element | null {
  const g = useGame();
  useVersion();
  const r = g.store.overResult;
  if (!r) return null;
  return (
    <div className="overlay open" role="dialog" aria-modal="true" aria-label="Final result">
      <div className="sheet">
        <h2 style={{ color: r.color }}>{r.title}</h2>
        <div className="finals">
          {r.rows.map((row, i) => (
            <div key={i} className="final" style={{ ['--c' as string]: row.color }}>
              <b>{row.name}<small>{row.sub}</small></b>
              <span>{row.score}</span>
            </div>
          ))}
        </div>
        <div className="go">
          <button type="button" className="primary" onClick={() => g.rematch()}>Rematch</button>
          <button type="button" className="ghost" onClick={() => g.showMenu()}>Setup</button>
        </div>
      </div>
    </div>
  );
}
