// Compliance, crises and legal: the compliance office and league
// investigations, the crisis playbook, and the club's legal side (club
// companies, counsel's review, disputes and the exposure report).
import { useState } from "react";
import {
  appealCase, CASE_KINDS, certify, compliance, fundingRequired, futureGuarantees, holdTraining, LETTER_FEE, ourCases, respondCase, sanctionsIn, setComplianceStaff, setFunding, STAFF_LEVELS, trainedNow,
} from "../../engine/compliance";
import { CRISIS_ROLES, crises, decideCrisis, fundRemediation, PLAYBOOK, setCrisisTeam } from "../../engine/crisis";
import { shortDate } from "../../engine/dates";
import { RULES, teamLabel } from "../../engine/league";
import { authorization, entities, exposure, legal, openMatters, setLegalPolicy, settleMatter, TERMS } from "../../engine/legal";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Evidence } from "../Help";

type Tab = "compliance" | "crisis" | "legal";

export function LegalScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("compliance");
  const [said, setSaid] = useState<string | null>(null);
  const say = (t: string | null) => { setSaid(t); changed(); };
  return (
    <section className="stack">
      <h2>Compliance and legal</h2>
      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={tab === "compliance"} onClick={() => setTab("compliance")}>Compliance</button>
        <button aria-pressed={tab === "crisis"} onClick={() => setTab("crisis")}>Crises</button>
        <button aria-pressed={tab === "legal"} onClick={() => setTab("legal")}>Legal</button>
      </div>
      {said && <p className="notice">{said}</p>}
      {tab === "compliance" && <Compliance game={game} say={say} />}
      {tab === "crisis" && <Crises game={game} say={say} />}
      {tab === "legal" && <Legal game={game} say={say} />}
    </section>
  );
}

function Compliance({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const c = compliance(game);
  const cases = ourCases(game);
  const league = c.leagueCases.filter((k) => k.team !== game.userTeam).slice(0, 10);
  return (
    <div className="split">
      <section className="panel stack tight">
        <h3>Our compliance office</h3>
        <span>{STAFF_LEVELS[c.staff].label}{c.staff ? `, led by ${c.officer}` : ""}: <span className="muted">{STAFF_LEVELS[c.staff].what}</span></span>
        <div className="btn-row">
          <select value={c.staff} onChange={(e) => say(setComplianceStaff(game, Number(e.target.value)))} aria-label="Compliance staffing">
            {STAFF_LEVELS.map((l, i) => <option key={i} value={i}>{l.label} ({money(l.cost)} a year)</option>)}
          </select>
          <button className="btn small" onClick={() => say(holdTraining(game) ?? "Training done and documented.")}>Hold league-rules training</button>
        </div>
        <span className="muted">Training: {trainedNow(game) ? `current (${shortDate(c.trained!)})` : "none in the last year"}. Violations on record: {c.strikes ? `${c.strikes}, which raise scrutiny and penalties` : "none"}.</span>
        <div className="btn-row">
          <span>{RULES.season} policy acknowledgments and conflict disclosures: {c.certified.includes(RULES.season) ? "certified" : "not yet certified"}</span>
          {!c.certified.includes(RULES.season) && <button className="btn small primary" onClick={() => say(certify(game) ?? "Certified and filed.")}>Sign and file</button>}
        </div>
        <h4>Guaranteed pay funding</h4>
        <span>Guarantees owed in later years: {money(futureGuarantees(game))}; the league requires {money(fundingRequired(game))} funded. <Evidence kind="confirmed" /></span>
        <div className="btn-row">
          <button className={`btn small${c.funding === "letter" ? " primary" : ""}`} onClick={() => say(setFunding(game, "letter"))}>Letter of credit ({(LETTER_FEE * 100).toFixed(2)}% a year)</button>
          <button className={`btn small${c.funding === "cash" ? " primary" : ""}`} onClick={() => say(setFunding(game, "cash"))}>Cash in escrow</button>
        </div>
        <span className="muted">In escrow now: {money(c.escrow)}. Cash ties up money we could spend; a letter of credit costs a fee but keeps the cash.</span>
        <h4>Filings</h4>
        {c.filings.slice(0, 6).map((f) => <span key={f.id} className="muted">{shortDate(f.due)}: {f.kind}{f.late ? `, late (fined ${money(f.fine ?? 0)})` : ", on time"}</span>)}
        <h4>Cap audits</h4>
        {c.audits.length ? c.audits.slice(0, 4).map((a) => <span key={a.year} className="muted">{a.year}: {a.findings.length ? `${a.findings.join("; ")}. ${money(a.capCharge)} cap charge, ${money(a.fine)} fine.` : "clean"}</span>) : <span className="muted">The league audits each club's books in June.</span>}
        <h4>Trade physicals</h4>
        {c.physicals.length ? c.physicals.slice(0, 5).map((p, i) => <span key={i} className="muted">{shortDate(p.date)}: {p.note}</span>) : <span className="muted">Players in a trade with us pass a physical with their new club before it is final.</span>}
      </section>
      <section className="panel stack tight">
        <h3>League investigations</h3>
        {cases.length === 0 && <span className="muted">No inquiries into the club.</span>}
        {cases.map((k) => (
          <div key={k.id} className="stack tight">
            <span><strong>{CASE_KINDS[k.kind]?.label ?? k.kind}</strong> (opened {shortDate(k.opened)}): {k.text} Stage: {k.stage}.{k.sanction ? ` Sanction: ${k.sanction}.` : ""}{k.outcome ? ` ${k.outcome}.` : ""}</span>
            {(k.stage === "inquiry" || k.stage === "interviews") && (
              <div className="btn-row">
                {(["cooperate", "limited", "contest"] as const).map((r) => (
                  <button key={r} className={`btn small${k.response === r ? " primary" : ""}`} onClick={() => say(respondCase(game, k.id, r))}>{r === "cooperate" ? "Cooperate fully" : r === "limited" ? "Only what's required" : "Contest it"}</button>
                ))}
              </div>
            )}
            {k.stage === "sanctioned" && !k.appealed && <button className="btn small" onClick={() => say(appealCase(game, k.id))}>Appeal to the commissioner</button>}
          </div>
        ))}
        <h4>Around the league</h4>
        <span className="muted">Sanctions this season: {sanctionsIn(game, RULES.season).length}.</span>
        {league.map((k) => <span key={k.id} className="muted">{shortDate(k.opened)}: {teamLabel(k.team)}, {CASE_KINDS[k.kind]?.label.toLowerCase()}: {k.outcome ?? k.stage}</span>)}
        {c.log.length > 0 && <><h4>Compliance log</h4>{c.log.slice(0, 8).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}</>}
      </section>
    </div>
  );
}

function Crises({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const c = crises(game);
  const [amount, setAmount] = useState(1_000_000);
  return (
    <div className="split">
      <section className="panel stack tight">
        <h3>Crisis team</h3>
        {Object.entries(CRISIS_ROLES).map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={c.team.includes(k)} onChange={(e) => { setCrisisTeam(game, e.target.checked ? [...c.team, k] : c.team.filter((x) => x !== k), c.firm); say(null); }} /> {label}</label>
        ))}
        <label><input type="checkbox" checked={c.firm} onChange={(e) => { setCrisisTeam(game, c.team, e.target.checked); say(null); }} /> An outside crisis firm on retainer</label>
        <span className="muted">Trust comes back with years of clean conduct and real fixes, not with advertising. <Evidence kind="opinion" /></span>
        {c.log.length > 0 && <><h4>Past crises</h4>{c.log.slice(0, 6).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}</>}
      </section>
      <section className="panel stack tight">
        <h3>Open crises</h3>
        {c.crises.filter((x) => x.stage !== "resolved" || (x.findings && !x.remediation && x.fault > 0.5)).length === 0 && <span className="muted">Nothing open.</span>}
        {c.crises.filter((x) => x.stage !== "resolved" || (x.findings && !x.remediation && x.fault > 0.5)).map((x) => (
          <div key={x.id} className="stack tight">
            <span><strong>{x.title}</strong> ({shortDate(x.date)}): {x.text}.{x.findings ? ` ${x.findings} ${x.outcome}` : x.reviewDue ? ` Findings due ${shortDate(x.reviewDue)}.` : ""}</span>
            {x.stage !== "resolved" && PLAYBOOK.map((s) => (
              <div key={s.key} className="btn-row">
                <span>{s.label}:</span>
                {x.plan[s.key] ? <span className="muted">{s.options[x.plan[s.key]]}</span> : Object.entries(s.options).map(([k, label]) => <button key={k} className="btn small" title={label} onClick={() => say(decideCrisis(game, x.id, s.key, k))}>{label.split(":")[0]}</button>)}
              </div>
            ))}
            {x.findings && !x.remediation && x.fault > 0.5 && (
              <div className="btn-row">
                <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Remediation">
                  {[500_000, 1_000_000, 3_000_000, 8_000_000].map((v) => <option key={v} value={v}>{money(v)}</option>)}
                </select>
                <button className="btn small primary" onClick={() => say(fundRemediation(game, x.id, amount))}>Fund the fixes</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function Legal({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const l = legal(game);
  const exp = exposure(game);
  return (
    <div className="split">
      <section className="panel stack tight">
        <h3>Club companies</h3>
        {entities(game).map((e) => <span key={e.name}><strong>{e.name}</strong>: <span className="muted">{e.holds}</span></span>)}
        <h4>Policies</h4>
        <label><input type="checkbox" checked={l.review} onChange={(e) => { setLegalPolicy(game, { review: e.target.checked }); say(null); }} /> Counsel reviews major signings before they're final (league, labor and conflict checks)</label>
        <div className="btn-row"><span>Privileged material:</span>
          <button className={`btn small${l.access === "strict" ? " primary" : ""}`} onClick={() => { setLegalPolicy(game, { access: "strict" }); say(null); }}>Need to know ($150K a year)</button>
          <button className={`btn small${l.access === "broad" ? " primary" : ""}`} onClick={() => { setLegalPolicy(game, { access: "broad" }); say(null); }}>Broad access</button>
        </div>
        <div className="btn-row"><span>Records:</span>
          <button className={`btn small${l.retention === "full" ? " primary" : ""}`} onClick={() => { setLegalPolicy(game, { retention: "full" }); say(null); }}>Seven years and litigation holds ($120K a year)</button>
          <button className={`btn small${l.retention === "minimal" ? " primary" : ""}`} onClick={() => { setLegalPolicy(game, { retention: "minimal" }); say(null); }}>Minimum the law requires</button>
        </div>
        <span className="muted">Missing records weaken us in audits, investigations and court. <Evidence kind="opinion" /></span>
        <h4>Who signs off</h4>
        <span className="muted">A $5M deal: {authorization(game, 5_000_000).join(", then ")}. A $50M deal: {authorization(game, 50_000_000).join(", then ")}. New debt: {authorization(game, 50_000_000, "debt").join(", then ")}.</span>
        <h4>How agreements end and renew</h4>
        {Object.entries(TERMS).map(([k, t]) => <span key={k} className="muted"><strong>{k}:</strong> {t.exit}. Renewal: {t.renewal}. Disputes: {t.dispute}.</span>)}
        {l.reviews.length > 0 && <><h4>Counsel's reviews</h4>{l.reviews.slice(0, 5).map((r, i) => <span key={i} className="muted">{shortDate(r.date)}: {r.what}. Checked: {r.checks.map((c) => c.split(":")[0]).join(", ")}.</span>)}</>}
        {l.amendments.length > 0 && <><h4>Amendments</h4>{l.amendments.slice(0, 5).map((a, i) => <span key={i} className="muted">{shortDate(a.date)}: {a.party}: {a.what}</span>)}</>}
      </section>
      <section className="panel stack tight">
        <h3>Exposure report</h3>
        {exp.length === 0 && <span className="muted">No open disputes.</span>}
        {exp.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Matter</th><th>Stage</th><th className="num">Likely loss</th><th className="num">Range</th><th className="num">Spent</th><th className="num">To settle</th><th></th></tr></thead>
            <tbody>{exp.map((e) => (
              <tr key={e.id}><td>{e.kind}{e.insured ? ` (${Math.round(e.insured * 100)}% insured)` : ""}</td><td>{e.stage}</td><td className="num">{money(e.mid)}</td><td className="num">{money(e.low)} to {money(e.high)}</td><td className="num">{money(e.spent)}</td><td className="num">{money(e.demand)}</td>
                <td><button className="btn small" onClick={() => say(settleMatter(game, e.id) ?? "Settled.")}>Settle</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
        <span className="muted">Estimates from counsel; courts and arbitrators are uncertain. <Evidence kind="estimate" /></span>
        <h4>Closed</h4>
        {l.matters.filter((m) => !openMatters(game).includes(m)).slice(0, 6).map((m) => <span key={m.id} className="muted">{shortDate(m.opened)}: {m.kind} ({m.party}): {m.result}</span>)}
        {l.breaches.length > 0 && <><h4>Confidentiality breaches</h4>{l.breaches.slice(0, 4).map((b, i) => <span key={i} className="muted">{shortDate(b.date)}: {b.text}</span>)}</>}
      </section>
    </div>
  );
}
