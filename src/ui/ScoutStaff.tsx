import { useState } from "react";
import { EMPHASES, GROUPS, LEANS, REPLACE_COST, replaceScout, scouts, setEmphasis, type Emphasis } from "../engine/scouts";
import type { GameState } from "../engine/types";
import { money } from "./format";

/** Our college scouts, their beats and leans, and the department's emphasis. */
export function ScoutStaff({ game, changed }: { game: GameState; changed: () => void }) {
  const s = scouts(game);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>What we weigh</h3>
        <div className="tabs" role="group" aria-label="Scouting emphasis">
          {(Object.keys(EMPHASES) as Emphasis[]).map((e) => <button key={e} aria-pressed={s.emphasis === e} onClick={() => { setEmphasis(game, e); changed(); }}>{EMPHASES[e].label}</button>)}
        </div>
        <span className="muted">{EMPHASES[s.emphasis].what}</span>
      </div>
      <div className="panel stack tight">
        <h3>Area and position scouts</h3>
        <span className="muted">Each covers a group of positions and sharpens our reads there. Every scout has a lean; the reports say when it colors a grade.</span>
        <table>
          <thead><tr><th>Scout</th><th>Covers</th><th>Tendency</th><th>Since</th><th></th></tr></thead>
          <tbody>
            {s.staff.map((x) => (
              <tr key={x.id}>
                <td className="name">{x.name}</td><td>{GROUPS[x.group]}</td><td>{LEANS[x.lean]}</td><td>{x.since}</td>
                <td>{confirm === x.id
                  ? <><button className="link" onClick={() => { replaceScout(game, x.id); setConfirm(null); changed(); }}>Replace ({money(REPLACE_COST)})</button> <button className="link" onClick={() => setConfirm(null)}>keep</button></>
                  : <button className="link" onClick={() => setConfirm(x.id)}>replace</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
