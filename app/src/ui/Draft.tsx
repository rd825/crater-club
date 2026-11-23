import { useGame, useVersion } from './ctx.tsx';
import { WEAPONS } from '../data/weapons.ts';
import { iconSrc } from '../render/sprites.ts';

export function Draft(): React.JSX.Element | null {
  const g = useGame();
  useVersion();
  const d = g.store.draftView;
  if (!d) return null;
  return (
    <div className="overlay open">
      <div className="sheet wide">
        <h2 style={{ color: d.whoColor }}>{d.whoIsAI ? `${d.whoName} is choosing` : `${d.whoName}, pick a weapon`}</h2>
        <p className="lede">Take turns until everyone holds {d.per}. {d.whoName} has {d.whoCount} so far.</p>
        <div className="cards">
          {d.pool.map((c, i) => {
            const w = WEAPONS[c.id];
            const taken = c.by >= 0;
            const disabled = taken || d.whoIsAI || !d.legal[i];
            return (
              <button key={i} type="button" className="card" disabled={disabled}
                style={taken ? { ['--c' as string]: d.colors[c.by] } : undefined}
                onClick={() => g.pickDraft(i)}>
                <img src={iconSrc(c.id)} alt="" width={32} height={32} />
                <b>{w.name}{taken && <em> · {d.names[c.by]}</em>}</b>
                <small>{w.desc}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
