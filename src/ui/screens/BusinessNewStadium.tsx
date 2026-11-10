// The new-stadium path on the Business page: studies, site and design, the
// public talks (politics.ts), financing, bids and contracts, permits and the
// build, with the approval milestones and the public commitments.
import { useState } from "react";
import {
  awardContract, baseCost, closeFinancing, commissionStudies, construction, CONTRACTS, type ContractKind, designPlan, fundingGap, leagueLimit,
  type Model, MODELS, ourShareOf, overrun, pslEstimate, type Roof, ROOFS, setFunding, shelvePlan, submitDesign,
} from "../../engine/construction";
import { shortDate } from "../../engine/dates";
import { addCommitment, afterRejection, answerRival, answerSponsor, commissionImpact, lobby, politics, voterSupport } from "../../engine/politics";
import { STADIUM_BY_TEAM } from "../../engine/stadiums";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function NewStadium({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const say = (t: string | null) => { setSaid(t); changed(); };
  const c = construction(game);
  const p = c.plan;
  const pol = politics(game);
  const t = pol.talks;
  const [ask, setAsk] = useState(0);
  const [fund, setFund] = useState({ equity: 0, loan: 0, psl: 0 });
  const [pick, setPick] = useState<{ contractor: string; kind: ContractKind }>({ contractor: "", kind: "gmp" });
  const s = STADIUM_BY_TEAM[game.userTeam];
  const q = pol.question;
  const cpu = c.cpu.filter((b) => !b.failed);
  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      {q && !q.answered && (
        <section className="panel stack tight">
          <strong>{q.partner} asks where we'll be playing before it renews.</strong>
          <div className="btn-row">
            <button className="btn small" onClick={() => say(answerSponsor(game, true))}>Brief them on the plan</button>
            <button className="btn small" onClick={() => say(answerSponsor(game, false))}>Keep it private for now</button>
          </div>
        </section>
      )}
      <section className="panel stack tight">
        <h3>A new stadium</h3>
        <span className="muted">{s.name} opened in {s.opened}. A new building takes three to four years from the first study to opening day and costs $1.5-3B in today's money.</span>
        {c.temporary && <span>We're playing at {c.temporary.name} until {shortDate(c.temporary.until)}.</span>}
        {(!p || p.stage === "shelved" || p.stage === "open") && (
          <div className="btn-row">
            <button className="btn primary small" onClick={() => say(commissionStudies(game))}>Commission feasibility studies ($4M)</button>
            {p?.stage === "open" && <span className="muted">{p.name} opened {shortDate(p.milestones.opened!)} at {money(p.cost ?? 0)}.</span>}
          </div>
        )}
        {p?.stage === "study" && <span>The consultants report back around {shortDate(p.studyDue!)}.</span>}
        {p && p.study && p.stage === "design" && (
          <div className="stack tight">
            <span>Studies: demand about {Math.round((p.study.demand - 1) * 100)}% above today's; {money(p.study.low)} to {money(p.study.high)}. {p.study.engineering} {p.study.access} {p.study.financing}</span>
            <div className="table-wrap"><table>
              <thead><tr><th>Site</th><th className="num">Land</th><th className="num">Transit</th><th className="num">Parking</th><th className="num">Demand</th><th className="num">Environmental risk</th><th className="num">Development room</th><th></th></tr></thead>
              <tbody>{p.sites.map((x) => (
                <tr key={x.id}><td>{x.name}{x.kind === "current" ? " (we'd play elsewhere while it's built)" : ""}</td><td className="num">{money(x.land)}</td><td className="num">{pct(x.transit)}</td><td className="num">{pct(x.parking)}</td>
                  <td className="num">{x.reach >= 1 ? "+" : ""}{Math.round((x.reach - 1) * 100)}%</td><td className="num">{pct(x.envRisk)}</td><td className="num">{pct(x.development)}</td>
                  <td><button className="btn small" aria-pressed={p.site === x.id} onClick={() => say(designPlan(game, { site: x.id }))}>{p.site === x.id ? "Chosen" : "Choose"}</button></td></tr>
              ))}</tbody>
            </table></div>
            <label className="field"><span className="label">Roof</span>
              <select value={p.roof} onChange={(x) => say(designPlan(game, { roof: x.target.value as Roof }))}>
                {(Object.keys(ROOFS) as Roof[]).map((k) => <option key={k} value={k}>{ROOFS[k].label}</option>)}
              </select>
            </label>
            <span className="muted">{ROOFS[p.roof].what} Running costs {money(ROOFS[p.roof].run)} a year more than open air.</span>
            <label className="field"><span className="label">Ownership</span>
              <select value={p.model} onChange={(x) => say(designPlan(game, { model: x.target.value as Model }))}>
                {(Object.keys(MODELS) as Model[]).map((k) => <option key={k} value={k}>{MODELS[k].label}</option>)}
              </select>
            </label>
            <span className="muted">{MODELS[p.model].what}</span>
            <label className="field"><span className="label">Seats: {p.capacity.toLocaleString("en-US")}</span>
              <input type="range" min={55000} max={80000} step={1000} value={p.capacity} onChange={(x) => say(designPlan(game, { capacity: Number(x.target.value) }))} /></label>
            <label className="field"><span className="label">Invest in the district around it (hotels, restaurants, retail): {money(p.district)}</span>
              <input type="range" min={0} max={400_000_000} step={25_000_000} value={p.district} onChange={(x) => say(designPlan(game, { district: Number(x.target.value) }))} /></label>
            <div className="btn-row">
              {(["jobs", "local", "access"] as const).map((k) => (
                <label key={k}><input type="checkbox" checked={p.benefits[k]} onChange={(x) => say(designPlan(game, { benefits: { [k]: x.target.checked } }))} /> {{ jobs: "Local hiring", local: "Local contractors", access: "Community use" }[k]}</label>
              ))}
            </div>
            <span>Estimated cost today: {money(baseCost(game, p))}. The public side could go up to {money(Math.round(baseCost(game, p) * MODELS[p.model].publicMax))} under this model.</span>
            <label className="field"><span className="label">Public money to ask for: {money(ask)}</span>
              <input type="range" min={0} max={Math.round(baseCost(game, p) * MODELS[p.model].publicMax)} step={25_000_000} value={ask} onChange={(x) => setAsk(Number(x.target.value))} /></label>
            <div className="btn-row">
              <button className="btn primary small" disabled={!p.site} onClick={() => say(submitDesign(game, ask))}>{ask > 0 ? "Take it to the public side" : "Go ahead with private money"}</button>
              <button className="btn small" onClick={() => say(shelvePlan(game))}>Shelve the plan</button>
            </div>
          </div>
        )}
        {p?.stage === "politics" && t && (
          <div className="stack tight">
            <span>Asking for {money(t.ask)}: {money(t.parts.bonds)} in bonds, {money(t.parts.infra)} for roads and utilities, {money(t.parts.grants)} in grants{t.parts.district ? `, ${money(t.parts.district)} from a tax district (needs a referendum)` : ""}.</span>
            <span>Voter support today: about {voterSupport(game)}%. {t.council ? `Council vote ${t.council.yes}-${t.council.no}.` : `Council vote around ${shortDate(t.councilDate)}.`}{t.referendum?.date && t.referendum.yes === undefined ? ` Referendum ${shortDate(t.referendum.date)}.` : ""}</span>
            {t.impact && <span className="muted">Our study: {money(t.impact.claim)} a year in new activity, {t.impact.jobs.toLocaleString("en-US")} jobs.</span>}
            {t.independent && <span className="muted">The city's study: {t.independent.text}</span>}
            {t.env && <span className="muted">{t.env.text}</span>}
            {t.status === "talks" && (
              <div className="btn-row">
                {!t.impact && <button className="btn small" onClick={() => say(commissionImpact(game))}>Commission our impact study ($1.5M)</button>}
                <button className="btn small" onClick={() => say(lobby(game))}>Lobby the council</button>
                {(["jobs", "local", "access"] as const).filter((k) => !p.benefits[k]).map((k) => (
                  <button key={k} className="btn small" onClick={() => say(addCommitment(game, k))}>Commit to {{ jobs: "local hiring", local: "local contractors", access: "community use" }[k]}</button>
                ))}
              </div>
            )}
            {t.rival && !t.rival.used && (
              <div className="btn-row">
                <span>{t.rival.name} offers {money(t.rival.subsidy)} and a site.</span>
                <button className="btn small" onClick={() => say(answerRival(game, "leverage"))}>Use it as leverage</button>
                <button className="btn small" onClick={() => say(answerRival(game, "accepted"))}>Take it</button>
                <button className="btn small" onClick={() => say(answerRival(game, "declined"))}>Turn it down</button>
              </div>
            )}
            {t.status === "rejected" && (
              <div className="btn-row">
                <button className="btn small" onClick={() => say(afterRejection(game, "private"))}>Fund it privately</button>
                <button className="btn small" onClick={() => say(afterRejection(game, "renegotiate"))}>Try again with a smaller ask</button>
                <button className="btn small" onClick={() => say(afterRejection(game, "renovate"))}>Renovate instead</button>
                <button className="btn small" onClick={() => say(afterRejection(game, "relocate"))}>Explore other markets</button>
              </div>
            )}
          </div>
        )}
        {p?.stage === "finance" && (
          <div className="stack tight">
            <span>Our share to raise: {money(ourShareOf(game, p))} plus a 5% contingency. The league's stadium program lends up to {money(leagueLimit(game))}; seat licenses could raise about {money(pslEstimate(game, p))}.</span>
            {(["equity", "loan", "psl"] as const).map((k) => (
              <label key={k} className="field"><span className="label">{{ equity: "Owner's equity", loan: "Stadium loan (30 years)", psl: "Seat licenses" }[k]}: {money(fund[k])}</span>
                <input type="range" min={0} max={k === "psl" ? pslEstimate(game, p) : 2_500_000_000} step={25_000_000} value={fund[k]} onChange={(x) => { const f = { ...fund, [k]: Number(x.target.value) }; setFund(f); setFunding(game, f); changed(); }} /></label>
            ))}
            <span>{fundingGap(game, p) > 0 ? `Still ${money(fundingGap(game, p))} short.` : "The package covers it."}</span>
            <button className="btn primary small" onClick={() => say(closeFinancing(game))}>Close the financing</button>
          </div>
        )}
        {p?.stage === "bids" && (
          <div className="stack tight">
            <div className="table-wrap"><table>
              <thead><tr><th>Contractor</th><th className="num">Price</th><th className="num">Months</th><th className="num">Record on time and budget</th><th></th></tr></thead>
              <tbody>{p.bids.map((b) => <tr key={b.contractor}><td>{b.contractor}</td><td className="num">{money(b.price)}</td><td className="num">{b.months}</td><td className="num">{pct(b.record)}</td>
                <td><button className="btn small" aria-pressed={pick.contractor === b.contractor} onClick={() => setPick({ ...pick, contractor: b.contractor })}>Pick</button></td></tr>)}</tbody>
            </table></div>
            <label className="field"><span className="label">Contract</span>
              <select value={pick.kind} onChange={(x) => setPick({ ...pick, kind: x.target.value as ContractKind })}>
                {(Object.keys(CONTRACTS) as ContractKind[]).map((k) => <option key={k} value={k}>{CONTRACTS[k].label}</option>)}
              </select>
            </label>
            <span className="muted">{CONTRACTS[pick.kind].what}</span>
            <button className="btn primary small" disabled={!pick.contractor} onClick={() => say(awardContract(game, pick.contractor, pick.kind))}>Award the contract</button>
          </div>
        )}
        {p?.stage === "permits" && <span>Zoning, building and environmental permits are due around {shortDate(p.permitsDue!)}.</span>}
        {p?.stage === "build" && (
          <div className="stack tight">
            <span>{p.contractor!.contractor} is building {p.name} under a {CONTRACTS[p.contract!].label.toLowerCase()} contract. Cost so far {money(p.cost ?? 0)} against {money(p.price ?? 0)} ({Math.round(overrun(p) * 100)}% over); we've paid {money(p.paid)} of our {money(p.ours ?? 0)}. Opens {shortDate(p.opens!)}.</span>
            {p.events.slice(0, 5).map((e, i) => <span key={i} className="muted">{shortDate(e.date)}: {e.text} ({money(e.cost)}{e.months ? `, ${e.months} mo` : ""})</span>)}
          </div>
        )}
        {p && (
          <>
            <h4>Approvals</h4>
            <span className="muted">Political: {mile(p.milestones.political)}. Contractual: {mile(p.milestones.contractual)}. Financial: {mile(p.milestones.financial)}. Permits: {mile(p.milestones.permits)}. Opened: {mile(p.milestones.opened)}.</span>
            {p.commitments.length > 0 && <><h4>Public commitments</h4>{p.commitments.map((x, i) => <span key={i} className="muted">{x}</span>)}</>}
          </>
        )}
        {[...c.log, ...pol.log].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}
      </section>
      <section className="panel stack tight">
        <h3>Around the league</h3>
        {cpu.length === 0 ? <span className="muted">No other clubs are building.</span> : cpu.map((b) => (
          <span key={b.team + b.announced} className="muted">{b.team}: {b.name}, {ROOFS[b.roof].label.toLowerCase()}, {money(b.cost)}{b.approved ? `, approved, opens ${b.opens}` : ", seeking approval"}.</span>
        ))}
      </section>
    </div>
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function mile(d?: string): string {
  return d ? shortDate(d) : "not yet";
}
