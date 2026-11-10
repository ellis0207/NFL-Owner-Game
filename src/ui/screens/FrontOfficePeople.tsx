// The Front office page's People tab: succession, quality-control coaches,
// promotions from within, coaching agreements, the head coach's job
// security, mandates, working conditions, and what the staff remembers.
import { useState } from "react";
import { analysts, ANALYST_ROLE } from "../../engine/analysts";
import { staff } from "../../engine/coaches";
import { EXEC_KEYS, EXEC_ROLES, execRole } from "../../engine/executives";
import {
  backCoach, conditionWord, extendCoach, hireQc, hotSeat, MANDATES, memoryOf, micromanagement, nameSuccessor, people, promoteAnalyst, promoteQc, promoteScout,
  qcCoaches, qcReadiness, regard, releaseQc, setMandate, severanceOwed, successionPlan, trainingValue, workingConditions, type Mandate,
} from "../../engine/people";
import { ROOMS, ROOM_TITLE } from "../../engine/positionCoaches";
import { scouts } from "../../engine/scouts";
import type { CoachRoom, ExecRole, GameState } from "../../engine/types";
import { money } from "../format";
import { Help } from "../Help";

export function People({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const act = (r: string | null) => { setMsg(r); changed(); };
  const plan = successionPlan(game);
  const qc = qcCoaches(game);
  const p = people(game);
  const cond = workingConditions(game);
  const micro = micromanagement(game);
  const tv = trainingValue(game);
  const hot = hotSeat(game);
  const ours = Object.values(staff(game).people).filter((c) => c.team === game.userTeam && c.role && c.contract);
  const [ext, setExt] = useState<Record<string, { years: number; salary: number; g: number; inc: number }>>({});
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Working conditions</h3>
          <dl className="kv">
            <dt>Staffing</dt><dd>{conditionWord(cond.staffing)}</dd>
            <dt>Workload and hours</dt><dd>{conditionWord(cond.workload)}</dd>
            <dt>Resources</dt><dd>{conditionWord(cond.resources)}</dd>
            <dt>Well-being</dt><dd>{conditionWord(cond.wellbeing)}</dd>
            <dt>How closely you manage <Help k="micromanagement" /></dt><dd className={micro > 0.5 ? "bad" : undefined}>{micro > 0.6 ? "Very closely" : micro > 0.3 ? "Closely" : "Hands off"}</dd>
          </dl>
          {cond.notes.map((n, i) => <span key={i} className="muted">{n}</span>)}
        </div>
        <div className="panel stack tight">
          <h3>Head coach's job security <Help k="hotSeat" /></h3>
          <span>{hot > 0.7 ? "On the hot seat: the staff is coaching for its jobs." : hot > 0.45 ? "Feeling some heat." : "Secure."}</span>
          {p.backed && p.backed.until >= game.date ? <span className="muted">You backed him publicly; firing him before the season turns would be seen as a broken promise.</span>
            : <button className="btn small" onClick={() => act(backCoach(game) ?? "A public vote of confidence is out.")}>Give a public vote of confidence</button>}
          <h4>Staff development</h4>
          <span className="muted">{tv.text} {money(tv.spent)} spent over three years; {tv.promotions} promoted from within and {tv.departures} executive departures in two years.</span>
        </div>
      </div>

      <div className="panel stack tight">
        <h3>Succession</h3>
        <span className="muted">Who could step in from inside, as the staff sees it. Naming a successor tells that person where they stand.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Job</th><th>Now</th><th>Inside candidates</th><th>Named successor</th></tr></thead>
          <tbody>{plan.map((r) => (
            <tr key={r.job}>
              <td>{EXEC_ROLES[r.job as ExecRole]?.label ?? ({ HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", GM: "General manager" } as Record<string, string>)[r.job]}</td>
              <td>{r.incumbent}</td>
              <td>{r.candidates.length ? r.candidates.map((c) => `${c.name} (${c.read.toLowerCase()})`).join("; ") : <span className="muted">Nobody inside</span>}</td>
              <td>
                <select value={p.successors[r.job] ?? ""} onChange={(e) => { nameSuccessor(game, r.job, e.target.value || null); changed(); }}>
                  <option value="">None</option>
                  {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>Quality-control coaches</h3>
          <span className="muted">Film breakdown and self-scouting for the coordinators (a small edge in each game plan), and the coaches of the future. About $160K a year each.</span>
          {qc.map((c) => (
            <span key={c.id}>
              {c.name}, {c.side} ({qcReadiness(game, c.id).toLowerCase()}){" "}
              <select defaultValue="" onChange={(e) => e.target.value && act(promoteQc(game, c.id, e.target.value as CoachRoom))}>
                <option value="">Promote to...</option>
                {ROOMS.filter((r) => r === "ST" || (c.side === "offense") === ["QB", "RB", "WR", "TE", "OL"].includes(r)).map((r) => <option key={r} value={r}>{ROOM_TITLE[r]}</option>)}
              </select>{" "}
              <button className="link" onClick={() => { releaseQc(game, c.id); changed(); }}>Let go</button>
            </span>
          ))}
          <div className="btn-row">
            <button className="btn small" onClick={() => act(hireQc(game, "offense"))}>Hire offensive QC</button>
            <button className="btn small" onClick={() => act(hireQc(game, "defense"))}>Hire defensive QC</button>
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Promote from within</h3>
          <span className="muted">Area scouts can become the national scout; analysts can run the department.</span>
          {scouts(game).staff.slice(0, 6).map((s) => <span key={s.id}>{s.name}, area scout since {s.since} <button className="link" onClick={() => act(promoteScout(game, s.id) ?? `${s.name} is the new national scout.`)}>Make national scout</button></span>)}
          {analysts(game).staff.map((a, i) => a.role !== "director" && <span key={i}>{a.name}, {ANALYST_ROLE[a.role].toLowerCase()} <button className="link" onClick={() => act(promoteAnalyst(game, i) ?? `${a.name} runs analytics now.`)}>Make director</button></span>)}
          {p.promotions.slice(0, 6).map((x, i) => <span key={i} className="muted">{x.date}: {x.who}, {x.from} to {x.to}</span>)}
        </div>
      </div>

      <div className="panel stack tight">
        <h3>Coaching agreements</h3>
        <span className="muted">Extend a coach with part of the salary guaranteed (agents want more salary for less protection) and a bonus for a playoff trip. A fired coach is owed the guaranteed share of what's left. <Help k="severance" /></span>
        <div className="table-wrap"><table>
          <thead><tr><th>Coach</th><th>Through</th><th className="num">Salary</th><th>Guaranteed</th><th className="num">Owed if fired</th><th>Extend</th></tr></thead>
          <tbody>{ours.map((c) => {
            const e = ext[c.id] ?? { years: 2, salary: Math.round(c.contract!.salary / 1e5) / 10, g: 1, inc: 0 };
            const set = (x: Partial<typeof e>) => setExt({ ...ext, [c.id]: { ...e, ...x } });
            return (
              <tr key={c.id}>
                <td className="name">{c.name}, {c.role}</td><td>{c.contract!.through}</td><td className="num">{money(c.contract!.salary)}</td>
                <td>{Math.round((c.contract!.guaranteed ?? 1) * 100)}%{c.contract!.incentive ? `, ${money(c.contract!.incentive)} playoff bonus` : ""}</td>
                <td className="num">{money(severanceOwed(game, c.id))}</td>
                <td>
                  <input type="number" min={1} max={5} value={e.years} style={{ width: "3em" }} onChange={(ev) => set({ years: Number(ev.target.value) })} aria-label="Years" /> yrs{" "}
                  $<input type="number" min={0.2} step={0.1} value={e.salary} style={{ width: "4.5em" }} onChange={(ev) => set({ salary: Number(ev.target.value) })} aria-label="Salary in millions" />M{" "}
                  <select value={e.g} onChange={(ev) => set({ g: Number(ev.target.value) })} aria-label="Guaranteed share">{[1, 0.9, 0.75, 0.5].map((g) => <option key={g} value={g}>{g * 100}% guaranteed</option>)}</select>{" "}
                  <select value={e.inc} onChange={(ev) => set({ inc: Number(ev.target.value) })} aria-label="Playoff bonus">{[0, 0.25, 0.5, 1].map((x) => <option key={x} value={x}>{x ? `$${x}M playoff bonus` : "No bonus"}</option>)}</select>{" "}
                  <button className="btn small" onClick={() => act(extendCoach(game, c.id, e.years, e.salary * 1e6, e.g, e.inc * 1e6).text)}>Offer</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>Mandates</h3>
          <span className="muted">What you expect from each executive this year. Reviews weigh whether the year met it.</span>
          {(["GM", ...EXEC_KEYS.filter((r) => execRole(game, r))] as (ExecRole | "GM")[]).map((r) => (
            <label key={r} className="field"><span className="label">{r === "GM" ? "General manager" : EXEC_ROLES[r].label}</span>
              <select value={p.mandates[r] ?? ""} onChange={(e) => { setMandate(game, r, (e.target.value || null) as Mandate | null); changed(); }}>
                <option value="">No mandate</option>
                {(Object.keys(MANDATES) as Mandate[]).map((m) => <option key={m} value={m}>{MANDATES[m].label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="panel stack tight">
          <h3>What people remember</h3>
          {Object.keys(p.memory).length === 0 && <span className="muted">Nothing notable yet.</span>}
          {Object.entries(p.memory).slice(0, 10).map(([who]) => {
            const r = regard(game, who);
            return <span key={who}><strong>{who}</strong> ({r > 3 ? "warm" : r < -3 ? "sore" : "neutral"}): {memoryOf(game, who).slice(0, 2).map((m) => m.text.toLowerCase()).join("; ")}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
