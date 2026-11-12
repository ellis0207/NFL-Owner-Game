import { RULE_ARCHIVE } from "../../engine/eras";
import { RULE_BY_ID } from "../../engine/rules";
import type { GameState } from "../../engine/types";

/** History > Rules: the real rule archive up to the save's start, then the changes this league adopted. */
export function RulesTab({ game }: { game: GameState }) {
  const start = game.era?.start ?? 2026;
  const real = game.era && !game.era.alt;
  const before = RULE_ARCHIVE.filter(([y]) => y <= start && y !== 2026);
  const after = real ? RULE_ARCHIVE.filter(([y]) => y > start && y < 2026) : [];
  const adopted = [...(game.owners?.rules ?? [])].sort((a, b) => a.year - b.year);
  return (
    <div className="stack">
      <section className="panel stack tight">
        <h3>Before this league began</h3>
        <span className="muted">The real rule changes up to the {start} season, the one this game starts from.</span>
        <ul className="plain">{before.map(([y, t], i) => <li key={i}><strong>{y}</strong>: {t}</li>)}</ul>
      </section>
      {after.length > 0 && (
        <section className="panel stack tight">
          <h3>Real history after {start}</h3>
          <span className="muted">With real history on, these come in on their own in their seasons.</span>
          <ul className="plain">{after.map(([y, t], i) => <li key={i}><strong>{y}</strong>: {t}</li>)}</ul>
        </section>
      )}
      <section className="panel stack tight">
        <h3>Adopted by this league's owners</h3>
        {adopted.length === 0 && <span className="muted">No rule changes adopted at the annual meetings yet.</span>}
        <ul className="plain">{adopted.map((a, i) => <li key={i}><strong>{a.year}</strong>: {RULE_BY_ID[a.rule]?.title ?? a.rule}{a.until !== undefined ? ` (a trial through ${a.until})` : ""}</li>)}</ul>
      </section>
    </div>
  );
}
