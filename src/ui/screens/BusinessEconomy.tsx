// The economy and the club's risks: national and local conditions, past
// years in today's and 2026 dollars, a scenario tool, insurance cover and
// claims, stadium disruptions, and financial distress.
import { Fragment, useState } from "react";
import { pnl } from "../../engine/business";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { corporateFactor, demandFactor, economy, outlook, realDollars, scenario } from "../../engine/economy";
import { openLoans } from "../../engine/debt";
import { COVERS, type Cover, DISTRESS_OPTIONS, distressOption, premium, riskScore, setFlood, setPolicy, settleClaim, shocks } from "../../engine/shocks";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Evidence } from "../Help";

export function EconomyRisk({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const say = (t: string | null) => { setSaid(t); changed(); };
  const e = economy(game);
  const s = shocks(game);
  const year = leagueYear(game.date);
  const closed = game.books?.closed ?? [];
  const [sc, setSc] = useState({ growth: 0, rate: 0.035, price: 0, attendance: 0 });
  const last = pnl(game, Math.max(year - 1, 2026));
  const line = (k: string) => last.revenue.find((l) => l.cat === k)?.amount ?? 0;
  const lines = {
    tickets: line("tickets"), premium: line("premium"), sponsorship: line("sponsorship"), concessions: line("concessions") + line("parking"), merch: line("merch"),
    other: last.totalRevenue - line("tickets") - line("premium") - line("sponsorship") - line("concessions") - line("parking") - line("merch"),
    costs: last.totalRevenue - last.operating, floatingDebt: openLoans(game).filter((l) => l.kind === "floating").reduce((t, l) => t + l.balance, 0),
  };
  const result = scenario(game, sc, lines);
  const base = scenario(game, { growth: 0, rate: 0.035, price: 0, attendance: 0 }, lines);
  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      <div className="split">
        <section className="panel stack tight">
          <h3>The economy</h3>
          <dl className="kv">{outlook(game).map((o) => <Fragment key={o.label}><dt>{o.label}</dt><dd>{o.value}</dd></Fragment>)}</dl>
          <span className="muted">Our market: ticket and store demand {pct(demandFactor(game, game.userTeam))}, corporate budgets for sponsors and suites {pct(corporateFactor(game, game.userTeam))} against normal. <Evidence kind="estimate" /></span>
          {e.recessions.length > 0 && <span className="muted">Recessions: {e.recessions.map((r) => `${r.start}${r.end ? ` to ${r.end}` : " (now)"}`).join(", ")}.</span>}
          {e.log.slice(0, 4).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}
          <h4>Past years in 2026 dollars</h4>
          {closed.length === 0 ? <span className="muted">Closed years appear here after the first audit.</span> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Year</th><th className="num">Revenue</th><th className="num">In 2026 dollars</th><th className="num">Operating</th><th className="num">In 2026 dollars</th></tr></thead>
              <tbody>{closed.map((c) => <tr key={c.year}><td>{c.year}</td><td className="num">{money(c.revenue)}</td><td className="num">{money(realDollars(game, c.revenue, c.year))}</td><td className="num">{money(c.operating)}</td><td className="num">{money(realDollars(game, c.operating, c.year))}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className="panel stack tight">
          <h3>Scenarios</h3>
          <span className="muted">Last year's lines under different conditions. A rough model for testing plans, not a forecast.</span>
          <label className="field"><span className="label">Economy against trend: {sc.growth}%</span><input type="range" min={-6} max={3} step={0.5} value={sc.growth} onChange={(x) => setSc({ ...sc, growth: Number(x.target.value) })} /></label>
          <label className="field"><span className="label">Base rate: {(sc.rate * 100).toFixed(1)}%</span><input type="range" min={0.01} max={0.08} step={0.0025} value={sc.rate} onChange={(x) => setSc({ ...sc, rate: Number(x.target.value) })} /></label>
          <label className="field"><span className="label">Ticket prices: {Math.round(sc.price * 100)}%</span><input type="range" min={-0.15} max={0.2} step={0.01} value={sc.price} onChange={(x) => setSc({ ...sc, price: Number(x.target.value) })} /></label>
          <label className="field"><span className="label">Attendance: {Math.round(sc.attendance * 100)}%</span><input type="range" min={-0.15} max={0.1} step={0.01} value={sc.attendance} onChange={(x) => setSc({ ...sc, attendance: Number(x.target.value) })} /></label>
          <dl className="kv">
            <dt>Revenue</dt><dd>{money(result.revenue)} ({signed(result.revenue - base.revenue)})</dd>
            <dt>Operating income</dt><dd>{money(result.operating)} ({signed(result.operating - base.operating)})</dd>
          </dl>
          {result.notes.map((n, i) => <span key={i} className="muted">{n}</span>)}
        </section>
      </div>
      <div className="split">
        <section className="panel stack tight">
          <h3>Insurance</h3>
          <span className="muted">Insurers rate our risk at {riskScore(game).toFixed(2)} (1 is typical): the stadium's condition, security, compliance staffing, financial controls and recent claims. <Evidence kind="estimate" /></span>
          {(Object.keys(COVERS) as Cover[]).map((k) => {
            const p = s.policies[k];
            return (
              <div key={k} className="stack tight">
                <span><strong>{COVERS[k].label}</strong>: <span className="muted">{COVERS[k].what}</span></span>
                <div className="btn-row">
                  <label><input type="checkbox" checked={p.on} onChange={(x) => say(setPolicy(game, k, { on: x.target.checked }))} /> Covered</label>
                  <select value={p.limit} onChange={(x) => say(setPolicy(game, k, { limit: Number(x.target.value) }))} aria-label="Limit">
                    {[0.5, 1, 1.5, 2].map((f) => { const v = Math.round(limitBase(k) * f); return <option key={v} value={v}>Limit {money(v)}</option>; })}
                  </select>
                  <select value={p.deductible} onChange={(x) => say(setPolicy(game, k, { deductible: Number(x.target.value) }))} aria-label="Deductible">
                    {[0.25, 0.5, 1, 2, 4].map((f) => { const v = Math.round(dedBase(k) * f); return <option key={v} value={v}>Deductible {money(v)}</option>; })}
                  </select>
                  <span className="muted">{money(premium(game, k))} a year</span>
                </div>
              </div>
            );
          })}
          <label><input type="checkbox" checked={s.flood} onChange={(x) => { setFlood(game, x.target.checked); say(null); }} /> Flood rider on the property cover (flood is excluded without it)</label>
          <h4>Claims</h4>
          {s.claims.length === 0 && <span className="muted">No claims.</span>}
          {s.claims.slice(0, 6).map((c) => (
            <span key={c.id} className="muted">{shortDate(c.filed)}: {COVERS[c.cover].label}, {money(c.loss)} loss, {money(c.covered)} covered. {c.status === "paid" ? `Paid ${money(c.paid ?? 0)}.` : c.status === "disputed" ? <>Disputed. <button className="link" onClick={() => say(settleClaim(game, c.id) ?? "Settled.")}>Take the insurer's offer</button></> : c.status === "denied" ? "Denied." : `Due about ${shortDate(c.due)}.`}</span>
          ))}
        </section>
        <section className="panel stack tight">
          <h3>Shocks</h3>
          {s.disruptions.length === 0 && <span className="muted">No stadium emergencies so far. A serious one hits a club about once a decade.</span>}
          {s.disruptions.slice(0, 5).map((d) => <span key={d.id} className="muted">{shortDate(d.date)}: {d.text}; repairs {money(d.repair)}, game money lost {money(d.lost)}{d.until >= game.date ? `, until about ${shortDate(d.until)}` : ""}.</span>)}
          {s.log.slice(0, 6).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}
          <h4>Financial health</h4>
          {!s.distress || s.distress.stage === "recovered" ? <span className="muted">The club can meet its obligations{s.distress ? " (supervision ended)" : ""}.</span> : (
            <div className="stack tight">
              <span className="bad">{s.distress.stage === "supervised" ? "Under league supervision" : "In financial distress"} since {shortDate(s.distress.since)}.</span>
              {s.distress.plan?.map((p, i) => <span key={i} className="muted">{p}</span>)}
              {Object.entries(DISTRESS_OPTIONS).map(([k, v]) => <button key={k} className="btn small" onClick={() => say(distressOption(game, k))}>{v.split(":")[0]}</button>)}
              <span className="muted">{Object.values(DISTRESS_OPTIONS).join(" ")}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function pct(x: number): string {
  const d = Math.round((x - 1) * 1000) / 10;
  return `${d >= 0 ? "+" : ""}${d}%`;
}
function signed(x: number): string {
  return `${x >= 0 ? "+" : "-"}${money(Math.abs(x))}`;
}
function limitBase(k: Cover): number {
  return { property: 500_000_000, liability: 100_000_000, interruption: 60_000_000 }[k];
}
function dedBase(k: Cover): number {
  return { property: 2_000_000, liability: 250_000, interruption: 1_000_000 }[k];
}
