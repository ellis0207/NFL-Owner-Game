import { CompareToggle } from "../Comparison";
import { Crossroads } from "../kit";
import { memoComparison } from "../../engine/compare";
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { office } from "../../engine/delegation";
import { EXEC_KEYS, EXEC_ROLES, execRole } from "../../engine/executives";
import { assignTask, consistency, decideMemo, holdMeeting, researchMemo, stability, TASKS } from "../../engine/memos";
import type { GameState, Memo } from "../../engine/types";
import { money } from "../format";
import { FOLLOW_UPS, followUp, memoPriority, type FollowUp } from "../../engine/desk";
import { Evidence } from "../Help";
import { AGENDA_TOPICS, agendaOrder, setAgenda } from "../../engine/people";
import { Chip, Gauge, Hud, HudStat, IconHead, Ring, Spark } from "../gfx";

export function Desk({ game, changed }: { game: GameState; changed: () => void }) {
  const o = office(game);
  // Most urgent first: deadline, money at stake, strategic weight, and calls only the owner holds.
  const open = o.memos.filter((m) => m.status === "open" || m.status === "researching").sort((a, b) => memoPriority(game, b).score - memoPriority(game, a).score);
  const closed = o.memos.filter((m) => m.status === "decided" || m.status === "lapsed").slice(0, 15);
  return (
    <div className="stack">
      {open.length === 0 && <p className="muted kit-none">Nothing waiting on you. Memos arrive when the staff needs a decision you've kept for yourself.</p>}
      {open.map((m) => <MemoCard key={m.id} memo={m} game={game} changed={changed} />)}
      {closed.length > 0 && (
        <div className="panel stack tight">
          <h3>Decided</h3>
          {closed.map((m) => (
            <span key={m.id} className="gx-row"><Chip icon={m.status === "lapsed" ? "clock" : "check"} tone={m.status === "lapsed" ? "warn" : "good"}>{shortDate(m.date)}</Chip> {m.title}: <strong>{m.status === "lapsed" ? m.notes.at(-1) : m.options[m.choice ?? 0]?.label}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoCard({ memo: m, game, changed }: { memo: Memo; game: GameState; changed: () => void }) {
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const urgent = m.deadline <= game.date;
  return (
    <div className="panel stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <IconHead icon="mail" sub={`From ${m.from}, ${shortDate(m.date)}`}>{m.title}</IconHead>
        <span className="btn-row"><Chip icon="clock" tone={urgent ? "bad" : undefined}>Due {shortDate(m.deadline)}</Chip>{m.amount ? <Chip icon="money">{money(m.amount)}</Chip> : null}</span>
      </div>
      <span className="muted">{memoPriority(game, m).why.join(", ")}</span>
      {msg && <p className="notice">{msg}</p>}
      <span style={{ whiteSpace: "pre-line" }}>{m.problem}</span>
      {m.voices?.length ? <Crossroads voices={m.voices} options={m.options} stakes={m.stakes} /> : null}
      <span><strong>Proposal:</strong> {m.proposal}{m.amount ? ` (${money(m.amount)})` : ""}</span>
      {m.cap && <span className="muted">Cap: {m.cap}</span>}
      {m.cash && <span className="muted">Cash: {m.cash.map((c) => `${money(c.amount)} ${c.when}`).join("; ")}</span>}
      {m.comparables?.length ? <span className="muted">Comparables: {m.comparables.join("; ")}</span> : null}
      <span className="muted">Budget: {m.budget}</span>
      <span className="muted"><Chip icon="alert" tone="warn">Risks</Chip> {m.risks.join(" ")}</span>
      {m.conditions && <span className="muted">Why: {m.conditions}</span>}
      {m.notes.map((n, i) => <span key={i}>{n}</span>)}
      <span className="muted">If you don't answer: {m.ifLate}</span>
      <CompareToggle get={() => memoComparison(game, m.id)} recommend={m.kind === "pricing" ? m.recommend : m.kind === "signing" || m.kind === "street" ? 0 : undefined} />
      {m.status === "researching" ? <span className="muted">The staff is looking into it; back {shortDate(m.until!)}.</span> : (
        <>
          <label className="field"><span className="label">Your reason, for the record (optional)</span>
            <input value={why} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <div className="btn-row">
            {m.options.map((op, i) => (
              <button key={i} className={`btn small${i === m.recommend ? " primary" : ""}`} title={op.effect} onClick={() => { setMsg(decideMemo(game, m.id, i, why)); changed(); }}>
                {op.label}{i === m.recommend ? " (recommended)" : ""}
              </button>
            ))}
            <button className="btn small" onClick={() => { setMsg(researchMemo(game, m.id)); changed(); }}>Ask for more research</button>
          </div>
          <div className="btn-row">
            <span className="muted">Follow up:</span>
            {(Object.keys(FOLLOW_UPS) as FollowUp[]).map((k) => <button key={k} className="btn small" onClick={() => { setMsg(followUp(game, m.id, k)); changed(); }}>{FOLLOW_UPS[k]}</button>)}
          </div>
          {m.options.map((op, i) => <span key={i} className="muted">{op.label}: {op.effect} {op.evidence && <Evidence kind={op.evidence} />}</span>)}
        </>
      )}
    </div>
  );
}

export function Meetings({ game, changed }: { game: GameState; changed: () => void }) {
  const o = office(game);
  const [msg, setMsg] = useState<string | null>(null);
  const last = o.meetings[0];
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>Management meeting</h3>
            <button className="btn small" onClick={() => { holdMeeting(game); changed(); }}>Call a meeting now</button>
          </div>
          <Agenda game={game} changed={changed} />
          {!last && <span className="muted">The executives meet on the first of every month.</span>}
          {last && (
            <>
              <span className="muted">{shortDate(last.date)} {last.date.slice(0, 4)}: {last.topics.join(", ")}</span>
              {last.minutes.map((l, i) => <span key={i}>{l}</span>)}
              {last.tasks.length > 0 && <span className="muted">Raised in the meeting: {last.tasks.map((t) => TASKS[t].label.toLowerCase()).join(", ")}.</span>}
            </>
          )}
        </div>
        <div className="panel stack tight">
          <h3>Assign work</h3>
          {Object.entries(TASKS).map(([k, t]) => (
            <div key={k} className="btn-row" style={{ justifyContent: "space-between" }}>
              <span>{t.label} <span className="muted">({t.who === "GM" ? "GM" : EXEC_ROLES[t.who].label}, {t.days} days). {t.what}</span></span>
              <button className="btn small" onClick={() => { setMsg(assignTask(game, k) ?? `Assigned: ${t.label.toLowerCase()}.`); changed(); }}>Assign</button>
            </div>
          ))}
        </div>
      </div>
      {o.tasks.length > 0 && (
        <div className="panel stack tight">
          <h3>Tasks</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Task</th><th>Who</th><th>Set</th><th>Due</th><th>Result</th></tr></thead>
              <tbody>
                {o.tasks.slice(0, 20).map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td><td>{t.who === "GM" ? "GM" : EXEC_ROLES[t.who].label}</td><td>{shortDate(t.set)}</td><td>{shortDate(t.due)}</td>
                    <td className="muted">{t.status === "open" ? "In progress" : t.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {o.meetings.length > 1 && (
        <div className="panel stack tight">
          <h3>Earlier minutes</h3>
          {o.meetings.slice(1, 8).map((mt) => (
            <details key={mt.date}><summary>{shortDate(mt.date)} {mt.date.slice(0, 4)}: {mt.topics.join(", ")}</summary>{mt.minutes.map((l, i) => <p key={i}>{l}</p>)}</details>
          ))}
        </div>
      )}
    </div>
  );
}

export function Record({ game }: { game: GameState }) {
  const o = office(game);
  const st = stability(game);
  const c = consistency(game);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>Consistency with your priorities</h3>
          <Gauge value={c.score / 100} label="This year" text={c.score} sub="of 100" tone={c.score >= 70 ? "good" : c.score < 50 ? "bad" : undefined} zones />
          {c.notes.map((n, i) => <span key={i} className="muted">{n}</span>)}
        </div>
        <div className="panel stack tight">
          <h3>Stability at the top</h3>
          <Hud>
            <HudStat icon="clock" label="Time in the job" value={`${st.avgTenure} yrs`} />
            <HudStat icon="users" label="Departures (2 yrs)" value={st.departures} tone={st.departures > 2 ? "bad" : undefined} />
            <HudStat icon="money" label="What they cost" value={money(st.cost)} />
            <HudStat icon="swap" label="Reorganizations" value={st.reorgs} />
          </Hud>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Executive reviews</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Who</th><th>Reviews (newest first)</th></tr></thead>
            <tbody>
              {EXEC_KEYS.map((r) => {
                const e = execRole(game, r);
                if (!e) return null;
                return <tr key={r}><td>{EXEC_ROLES[r].label}</td><td>{e.name}</td><td>{e.reviews.length ? <span className="gx-row">{e.reviews.slice(0, 3).map((v) => <span key={v.year} className="gx-row" style={{ flexWrap: "nowrap" }} title={v.text}><Ring size={42} value={v.score / 100} text={v.score} sub={v.year} tone={v.score >= 65 ? "good" : v.score < 45 ? "bad" : undefined} /><span className="muted">{v.text}</span></span>)}</span> : <span className="muted">First review at the end of the league year.</span>}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
      {o.trends.length > 0 && (
        <div className="panel stack tight">
          <h3>Month by month</h3>
          <div className="gx-grid">
            {([["Fans", "fans"], ["Press", "media"], ["Head coach", "coach"], ["Executives", "staff"]] as const).map(([l, k]) => {
              const vs = o.trends.slice(-12).map((t) => t[k]);
              const last = vs.at(-1) ?? 50;
              return <div key={k} className="gx-tile"><span className="gx-kicker">{l}</span><span className="gx-big">{last}</span><Spark values={vs} tone={last >= 60 ? "good" : last < 40 ? "bad" : undefined} /></div>;
            })}
          </div>
          <details><summary className="muted">Table</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="num">Fans</th><th className="num">Press</th><th className="num">Head coach</th><th className="num">Executives</th></tr></thead>
              <tbody>
                {o.trends.slice(-12).reverse().map((t) => <tr key={t.month}><td>{t.month}</td><td className="num">{t.fans}</td><td className="num">{t.media}</td><td className="num">{t.coach}</td><td className="num">{t.staff}</td></tr>)}
              </tbody>
            </table>
          </div>
          </details>
          <span className="muted">Confidence readings from the staff's own surveys and conversations, 0 to 100; 50 is ordinary.</span>
        </div>
      )}
      {o.incidents.length > 0 && (
        <div className="panel stack tight">
          <h3>Incidents</h3>
          {o.incidents.slice(0, 12).map((i, k) => <span key={k}>{shortDate(i.date)} {i.date.slice(0, 4)}: {i.text} <span className="muted">({i.kind}, {money(i.cost)})</span></span>)}
        </div>
      )}
      <div className="panel stack tight">
        <h3>Decision record</h3>
        {o.trail.length === 0 && <span className="muted">Every consequential decision lands here: what, who proposed it, who approved it and why.</span>}
        {o.trail.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Area</th><th>Decision</th><th>By</th><th>Approved</th><th className="num">Amount</th><th>Why</th></tr></thead>
              <tbody>
                {o.trail.slice(0, 60).map((t, i) => (
                  <tr key={i}><td>{shortDate(t.date)}</td><td>{t.area}</td><td>{t.what}</td><td className="muted">{t.by}</td><td><Chip icon={t.approved === "owner" ? "user" : t.approved === "delegated" ? "users" : "book"}>{{ owner: "You", delegated: "Delegated", policy: "By default" }[t.approved]}</Chip></td><td className="num">{t.amount ? money(t.amount) : ""}</td><td className="muted">{t.why ?? ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** The owner's agenda: topics in order; the meeting turns only the first three into work. */
function Agenda({ game, changed }: { game: GameState; changed: () => void }) {
  const order = agendaOrder(game, AGENDA_TOPICS);
  const move = (i: number, d: number) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setAgenda(game, next);
    changed();
  };
  return (
    <div className="stack tight">
      <span className="muted">Agenda (the first three topics get the time to become tasks):</span>
      <ol>{order.map((t, i) => <li key={t}>{t} <button className="link" onClick={() => move(i, -1)} aria-label={`Move ${t} up`}>up</button> <button className="link" onClick={() => move(i, 1)} aria-label={`Move ${t} down`}>down</button></li>)}</ol>
    </div>
  );
}
