// The tutorial's coach: a panel atop every page in a practice game. It names
// the lesson, how the system works and the one decision to make, takes the
// owner to the right page, and shows what the decision moved: each measure
// when the lesson opened, when it was finished, and now.
import { useState } from "react";
import { LESSONS, finishLesson, lessonView, startLesson } from "../engine/tutorial";
import type { GameState } from "../engine/types";
import type { Screen } from "./nav";

const ARROW = { up: "▲", down: "▼", same: "·" } as const;

export function TutorialCoach({ game, act, go, onLeave }: { game: GameState; act: (fn: (s: GameState) => void) => void; go: (s: Screen, tab?: string) => void; onLeave: () => void }) {
  const [open, setOpen] = useState(true);
  const [list, setList] = useState(false);
  const t = game.tutorial!;
  const v = lessonView(game, t.lesson);
  const l = v.lesson;
  const last = t.lesson === LESSONS.length - 1;
  const doneCount = Object.values(t.marks).filter((m) => m.done).length;
  return (
    <section className="panel kit-tut" aria-label="Tutorial">
      <div className="kit-tut-head">
        <span className="kit-tut-kicker">Tutorial · lesson {t.lesson + 1} of {LESSONS.length} · {doneCount} done</span>
        <strong>{l.title}</strong>
        <span className="btn-row">
          <button className="btn small" onClick={() => setOpen(!open)}>{open ? "Fold" : "Open"}</button>
          <button className="btn small" onClick={() => setList(!list)}>All lessons</button>
          <button className="btn small" onClick={onLeave}>Leave tutorial</button>
        </span>
      </div>
      {list && (
        <ol className="kit-tut-list">
          {LESSONS.map((x, i) => (
            <li key={x.id}>
              <button className="link" aria-current={i === t.lesson} onClick={() => { act((s) => startLesson(s, i)); setList(false); go(x.page as Screen, x.tab); }}>
                {t.marks[x.id]?.done ? "✓ " : ""}{x.title}
              </button>
            </li>
          ))}
        </ol>
      )}
      {open && (
        <div className="stack tight">
          <p>{l.how}</p>
          <p><strong>Your move:</strong> {l.task}</p>
          {v.rows.length > 0 && (
            <table className="kit-tut-table">
              <thead><tr><th>What it moved</th><th>Before</th>{v.rows.some((r) => r.after) && <th>When you finished</th>}<th>Now</th><th aria-label="Direction" /></tr></thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}{r.hidden && <span className="muted"> (staff's word)</span>}</td>
                    <td>{r.before}</td>{v.rows.some((x) => x.after) && <td>{r.after ?? ""}</td>}<td>{r.now}</td>
                    <td className={`kit-tut-${r.dir}`}>{ARROW[r.dir]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">{v.ready ? `Done. ${l.watch}` : l.watch} Keep playing and this table keeps updating, so effects that take days show up here too.</p>
          <div className="btn-row">
            <button className="btn" onClick={() => go(l.page as Screen, l.tab)}>Take me there</button>
            {!v.done && (v.ready
              ? <button className="btn primary" onClick={() => act((s) => finishLesson(s, "made"))}>{last ? "Finish the tutorial" : "Next lesson"}</button>
              : <button className="btn" onClick={() => act((s) => finishLesson(s, "skipped"))}>{last ? "Finish" : "Mark done and move on"}</button>)}
            {v.done && !last && <button className="btn primary" onClick={() => act((s) => startLesson(s, s.tutorial!.lesson + 1))}>Next lesson</button>}
            {v.done && last && <span className="muted">That's the whole tour. Keep playing this practice game, or leave and start a real one.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
