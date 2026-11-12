import { initialTab } from "../ui";
import { useState } from "react";
import { Departments } from "./FrontOfficeDepartments";
import { shortDate } from "../../engine/dates";
import { AREA_KEYS, AREAS, apyLimit, mode, office, openMemos, ownerLoad, PRESETS, setAlert, setLimits, setMode, setPreset } from "../../engine/delegation";
import {
  closeExecSearch, deputy, EXEC_KEYS, EXEC_ROLES, execPayrollOver, execRole, execs, execTerms, fireExec, INTERVIEW_TOPICS, interview, offerExec,
  openExecSearch, ownerSpan, promoteDeputy, reputationWord, SEARCH_FIRMS, setReportsTo,
} from "../../engine/executives";
import { RULES } from "../../engine/league";
import type { DecisionArea, DecisionMode, Exec, ExecRole, GameState, OfficeState } from "../../engine/types";
import { money } from "../format";
import { setAreaLimit } from "../../engine/delegation";
import { Desk, Meetings, Record } from "./FrontOfficeDesk";
import { People } from "./FrontOfficePeople";
import { Culture } from "./FrontOfficeCulture";
import { tip } from "../tip";

const TABS = ["Executives", "People", "Decision rights", "Memos", "Meetings", "Culture", "Departments", "Record"] as const;
type Tab = (typeof TABS)[number];

export function FrontOfficeScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const memos = openMemos(game).filter((m) => m.status === "open").length;
  const [tab, setTab] = useState<Tab>(() => initialTab("Front office", TABS, memos ? "Memos" : "Executives"));
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Front office</h2>
        <div className="tabs" role="group" aria-label="Front office">
          {TABS.map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}{t === "Memos" && memos ? ` (${memos})` : ""}</button>)}
        </div>
      </div>
      {tab === "Executives" && <Executives game={game} changed={changed} />}
      {tab === "People" && <People game={game} changed={changed} />}
      {tab === "Decision rights" && <Rights game={game} changed={changed} />}
      {tab === "Memos" && <Desk game={game} changed={changed} />}
      {tab === "Meetings" && <Meetings game={game} changed={changed} />}
      {tab === "Culture" && <Culture game={game} changed={changed} />}
      {tab === "Departments" && <Departments game={game} changed={changed} />}
      {tab === "Record" && <Record game={game} />}
    </section>
  );
}

/** How a person seems to be doing in the job, from the way they carry themselves. */
function moodWord(e: Exec): string {
  return e.satisfaction >= 70 ? "Happy here" : e.satisfaction >= 50 ? "Settled" : e.satisfaction >= 35 ? "Restless" : "Looking around";
}

function readWord(v: number): string {
  return v >= 75 ? "The firm's top candidate" : v >= 62 ? "Strong" : v >= 50 ? "Solid" : v >= 40 ? "Mixed references" : "A risk";
}

function Executives({ game, changed }: { game: GameState; changed: () => void }) {
  const x = execs(game);
  const [msg, setMsg] = useState<string | null>(null);
  const [firm, setFirm] = useState(SEARCH_FIRMS[1].id);
  const run = (fn: () => string | null | void) => { setMsg(fn() ?? null); changed(); };
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="panel stack tight">
        <h3>The executive team</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Who</th><th>Reports to</th><th>Contract</th><th>Last review</th><th>Mood</th><th /></tr></thead>
            <tbody>
              {EXEC_KEYS.map((r) => {
                const e = execRole(game, r);
                const d = deputy(game, r);
                const searching = x.searches.some((s) => s.role === r);
                return (
                  <tr key={r}>
                    <td title={EXEC_ROLES[r].what}><strong>{EXEC_ROLES[r].label}</strong></td>
                    <td>{e ? <><span {...tip("exec", e.id)}>{e.name}</span><br /><span className="muted">{e.resume[0]}</span></> : <span className="muted">{EXEC_ROLES[r].optional ? "Not filled (optional)" : `Vacant${d ? `: ${d.name} acting` : ""}`}</span>}</td>
                    <td>
                      {r === "PRES" ? "You" : !e && EXEC_ROLES[r].optional ? "" : (
                        <select value={x.reportsTo[r]} onChange={(ev) => run(() => setReportsTo(game, r, ev.target.value as ExecRole | "owner"))}>
                          <option value="owner">You</option>
                          {EXEC_KEYS.filter((o) => o !== r && (execRole(game, o) || !EXEC_ROLES[o].optional)).map((o) => <option key={o} value={o}>{EXEC_ROLES[o].label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="muted">{e?.contract ? `${money(e.contract.salary)} through ${e.contract.through}${e.contract.guaranteed ? ", guaranteed" : ""}` : ""}</td>
                    <td className="muted">{e?.reviews[0] ? `${e.reviews[0].year}: ${e.reviews[0].score}` : ""}</td>
                    <td className="muted">{e ? moodWord(e) : ""}</td>
                    <td>
                      <div className="btn-row">
                        {e && <button className="btn small" onClick={() => run(() => fireExec(game, r))}>Let go</button>}
                        {!e && d && !EXEC_ROLES[r].optional && <button className="btn small" onClick={() => run(() => promoteDeputy(game, r))}>Promote {d.name.split(" ")[0]}</button>}
                        {!searching && <button className="btn small" onClick={() => run(() => { const s = openExecSearch(game, r, firm); return typeof s === "string" ? s : `${firm} is bringing a slate for ${EXEC_ROLES[r].label.toLowerCase()}.`; })}>{e ? "Search for a replacement" : "Start a search"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="field"><span className="label">Search firm for new searches</span>
          <select value={firm} onChange={(e) => setFirm(e.target.value)}>
            {SEARCH_FIRMS.map((f) => <option key={f.id} value={f.id}>{f.id}: {Math.round(f.fee * 100)}% of first-year pay. {f.what}</option>)}
          </select>
        </label>
        <dl className="kv">
          <dt>As an employer</dt><dd>{reputationWord(x.reputation)}</dd>
          <dt>Reporting to you directly</dt><dd>{ownerSpan(game)} {ownerSpan(game) > 4 ? <span className="muted">(a wide span: more lands on your desk)</span> : null}</dd>
          <dt>Pay over the business budget</dt><dd>{money(execPayrollOver(game))} a year</dd>
        </dl>
        <span className="muted">Nobody's ability is on paper. You see it in their department's results, their reviews and what other clubs think of them. A vacant job is covered by the deputy.</span>
      </div>
      <div className="panel stack tight">
        <h3>Organization chart</h3>
        <OrgChart game={game} />
      </div>
      {x.searches.map((s) => (
        <div key={s.role} className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>Search: {EXEC_ROLES[s.role].label}</h3>
            <button className="btn small" onClick={() => run(() => closeExecSearch(game, s.role))}>Call it off</button>
          </div>
          <span className="muted">{s.firm}, opened {shortDate(s.opened)}. Three questions per candidate.</span>
          {s.pool.map((id) => {
            const c = x.people[id];
            if (!c) return null;
            const t = execTerms(game, s.role, id);
            const asked = s.asked[id] ?? [];
            const gone = s.declined.includes(id);
            return (
              <div key={id} className="stack tight" style={{ borderTop: "1px solid var(--line, #ddd)", paddingTop: 8 }}>
                <strong {...tip("exec", c.id)}>{c.name}</strong>
                <span className="muted">{RULES.season - c.born} years old; {c.years} years in senior jobs. {c.resume.join("; ")}.</span>
                <span>{s.firm}: {readWord(s.read[id])}.</span>
                {asked.map((a) => <span key={a.topic}><em>{INTERVIEW_TOPICS[a.topic]}</em> {a.answer}</span>)}
                {gone ? <span className="bad">Took another job.</span> : (
                  <>
                    <div className="btn-row">
                      {asked.length < 3 && Object.entries(INTERVIEW_TOPICS).filter(([k]) => !asked.some((a) => a.topic === k)).map(([k, q]) => (
                        <button key={k} className="btn small" onClick={() => run(() => { interview(game, s.role, id, k); })}>{q}</button>
                      ))}
                    </div>
                    <span className="muted">Asking about {money(t.salary)} a year for {t.years} years{t.guaranteed ? ", guaranteed" : ""}{t.authority ? `, and to run ${AREAS[t.authority].label.toLowerCase()}` : ""}.</span>
                    <div className="btn-row">
                      <button className="btn small primary" onClick={() => run(() => offerExec(game, s.role, id, t, (a) => mode(game, a)).text)}>Offer the asking terms</button>
                      <button className="btn small" onClick={() => run(() => offerExec(game, s.role, id, { ...t, salary: Math.round(t.salary * 0.9 / 10_000) * 10_000 }, (a) => mode(game, a)).text)}>Offer 10% less</button>
                      {t.guaranteed && <button className="btn small" onClick={() => run(() => offerExec(game, s.role, id, { ...t, guaranteed: false }, (a) => mode(game, a)).text)}>Offer without the guarantee</button>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {x.log.length > 0 && (
        <div className="panel stack tight">
          <h3>Comings and goings</h3>
          {x.log.slice(0, 12).map((l, i) => <span key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.text}</span>)}
        </div>
      )}
    </div>
  );
}

const MODE_LABEL: { [K in DecisionMode]: string } = { owner: "You decide", approve: "Staff proposes", delegate: "Staff decides" };
const ALERT_LABEL: { [K in OfficeState["alerts"]["signings"]]: string } = { every: "Tell me each time", weekly: "Weekly summary", exceptions: "Only surprises" };

function Rights({ game, changed }: { game: GameState; changed: () => void }) {
  const o = office(game);
  const load = ownerLoad(game);
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>How you want to work</h3>
        <div className="btn-row">
          {Object.entries(PRESETS).map(([k, p]) => <button key={k} className="btn small" title={p.what} onClick={() => { setPreset(game, k); changed(); }}>{p.label}</button>)}
        </div>
        <span className="muted">
          {load >= 0.85 ? "You're keeping most decisions yourself. Ambitious executives won't stay long without real authority, and memos pile up when you're away."
            : load <= 0.25 ? "The staff runs nearly everything. Good people thrive on it; the results are only as good as the people."
              : "A mix: you sign off on the big calls and the staff handles the rest."}
        </span>
      </div>
      <div className="panel stack tight">
        <h3>Decision rights</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              {AREA_KEYS.map((a) => (
                <tr key={a}>
                  <td><strong>{AREAS[a].label}</strong><br /><span className="muted">{AREAS[a].what}</span></td>
                  <td>
                    <div className="tabs" role="group" aria-label={AREAS[a].label}>
                      {(["owner", "approve", "delegate"] as DecisionMode[]).map((m) => <button key={m} aria-pressed={mode(game, a) === m} onClick={() => { setMode(game, a, m); changed(); }}>{MODE_LABEL[m]}</button>)}
                    </div>
                    <span className="muted">{AREAS[a].modes[mode(game, a)]}</span>
                  </td>
                  <td>
                    <select aria-label={`Reports on ${AREAS[a].label}`} value={o.alerts[a]} onChange={(e) => { setAlert(game, a, e.target.value as OfficeState["alerts"]["signings"]); changed(); }}>
                      {Object.entries(ALERT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Limits</h3>
        <label className="field"><span className="label">Biggest contract the GM can offer without you (a year, in {RULES.season} dollars: {money(apyLimit(game))})</span>
          <select value={o.limits.contractApy} onChange={(e) => { setLimits(game, { contractApy: Number(e.target.value) }); changed(); }}>
            {[3, 8, 15, 20, 30, 45].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
          </select>
        </label>
        <label className="field"><span className="label">Biggest loan the CFO can refinance without you</span>
          <select value={o.limits.debt} onChange={(e) => { setLimits(game, { debt: Number(e.target.value) }); changed(); }}>
            {[50, 100, 150, 300, 500].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
          </select>
        </label>
        <h4>Limits by area</h4>
        <span className="muted">A dollar ceiling on what each area may commit on its own: per year for signings, the whole deal for sponsors, the loan for borrowing.</span>
        {(["signings", "sponsors", "financing"] as DecisionArea[]).map((a) => (
          <label key={a} className="field"><span className="label">{AREAS[a].label}</span>
            <select value={o.limits.areas?.[a] ?? ""} onChange={(e) => { setAreaLimit(game, a, e.target.value ? Number(e.target.value) : null); changed(); }}>
              <option value="">No extra limit</option>
              {(a === "signings" ? [2, 5, 10, 20] : a === "sponsors" ? [1, 3, 5, 10, 25] : [25, 75, 150, 300]).map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
            </select>
          </label>
        ))}
        <span className="muted">Anything over a limit comes to you as a memo even when the area is delegated.</span>
      </div>
    </div>
  );
}

/** Who reports to whom, drawn from the owner down, with each person's decision areas. */
function OrgChart({ game }: { game: GameState }) {
  const x = execs(game);
  const filled = (r: ExecRole) => !!execRole(game, r) || !EXEC_ROLES[r].optional;
  const node = (r: ExecRole): JSX.Element => {
    const e = execRole(game, r);
    const d = deputy(game, r);
    const kids = EXEC_KEYS.filter((k) => x.reportsTo[k] === r && filled(k));
    const area = EXEC_ROLES[r].area;
    return (
      <li key={r}>
        <strong>{EXEC_ROLES[r].label}</strong>: {e ? <span {...tip("exec", e.id)}>{e.name}</span> : <span className="muted">vacant{d ? `, ${d.name} acting` : ""}</span>}
        {area && <span className="muted"> · {AREAS[area].label.toLowerCase()}: {mode(game, area) === "delegate" ? "decides" : mode(game, area) === "approve" ? "proposes" : "advises"}</span>}
        {r === "FOPS" && <span className="muted"> · the GM and head coach report here</span>}
        {kids.length > 0 && <ul className="org">{kids.map(node)}</ul>}
      </li>
    );
  };
  const top = EXEC_KEYS.filter((k) => x.reportsTo[k] === "owner" && filled(k));
  return (
    <ul className="org org-root">
      <li>
        <strong>You, the owner</strong>
        <ul className="org">
          {top.map(node)}
          {!execRole(game, "FOPS") && <li><strong>General manager and head coach</strong> <span className="muted">· report to you</span></li>}
        </ul>
      </li>
    </ul>
  );
}
