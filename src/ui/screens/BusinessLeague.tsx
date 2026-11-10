// The Business page's League tab: our share of the national pools, what's
// been paid and what the spring audit settles, the media renewals ahead, and
// what changing revenue sharing would do to each club.
import { useState } from "react";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { teamLabel } from "../../engine/league";
import { decideDispute, distributionForecast, distributionStatus, leagueHealth, leagueMoney, nextRenewal, poolsFor, sharingImpact, WITHHELD } from "../../engine/leaguemoney";
import { LEAGUE_RULES } from "../../engine/rules";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Evidence, Range } from "../Help";

export function LeagueMoney({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const year = leagueYear(game.date);
  const p = poolsFor(game, year);
  const st = distributionStatus(game, year);
  const lm = leagueMoney(game);
  const next = nextRenewal(game);
  const fc = distributionForecast(game, 6);
  const health = leagueHealth(game);
  const [plan, setPlan] = useState({ gate: 0.4, premium: 0.15 });
  const impact = sharingImpact(game, plan.gate, plan.premium);
  const ours = impact.find((r) => r.team === game.userTeam);
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Our share of national revenue, {year}</h3>
          <dl className="kv">
            <dt>National media</dt><dd>{money(p.media)}</dd>
            <dt>League sponsorship</dt><dd>{money(p.sponsorship)}</dd>
            <dt>Licensing</dt><dd>{money(p.licensing)}</dd>
            <dt>Other league business</dt><dd>{money(p.other)}</dd>
            <dt>League office costs, off the top</dt><dd>-{money(p.costs)}</dd>
            <dt>Our share</dt><dd><strong>{money(p.net)}</strong> <Evidence kind="estimate" /></dd>
          </dl>
          <span className="muted">Earned over the league year; paid monthly as a preliminary estimate with {Math.round(WITHHELD * 100)}% held back. Paid so far: {money(st.paid)} (held back {money(st.withheld)}). The league's audit settles the rest around {shortDate(st.dueAfterAudit)}.</span>
          {lm.dispute && lm.dispute.contested === undefined && (
            <div className="btn-row">
              <span>Our finance staff questions {money(lm.dispute.amount)} of the league's {lm.dispute.year} deductions.</span>
              <button className="btn small" onClick={() => { setMsg(decideDispute(game, true)); changed(); }}>Contest it</button>
              <button className="btn small" onClick={() => { setMsg(decideDispute(game, false) ?? "We accepted the league's numbers."); changed(); }}>Let it go</button>
            </div>
          )}
          {lm.dispute?.resolves && <span className="muted">Our dispute over {lm.dispute.year} is with an independent auditor until {shortDate(lm.dispute.resolves)}.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Media deals and the years ahead</h3>
          {lm.tv.renewals.map((r) => <span key={r.from}>{r.text}</span>)}
          {next && <span className="muted">Next decision on the national deals: {shortDate(next.decide)}, for {next.from} on.</span>}
          <span className="muted">League business: {health > 0.005 ? "growing faster than usual" : health < -0.005 ? "under some strain" : "steady"}. Every club's share moves with it, rival or not. <Evidence kind="opinion" /></span>
          <div className="table-wrap"><table>
            <thead><tr><th>Year</th><th>Expected share</th></tr></thead>
            <tbody>{fc.map((f) => <tr key={f.year}><td>{f.year}{f.unsigned ? " (deals not yet signed)" : ""}</td><td><Range mid={f.mid} low={f.low} high={f.high} /></td></tr>)}</tbody>
          </table></div>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Revenue sharing</h3>
        <span className="muted">Today: {Math.round(LEAGUE_RULES.gateShare * 100)}% of each visiting gate is pooled{LEAGUE_RULES.premiumPool ? `, and ${Math.round(LEAGUE_RULES.premiumPool * 100)}% of premium seating` : "; premium seating isn't shared"}. Changes go to the owners at the March meeting. Compare a plan:</span>
        <div className="btn-row">
          <label className="row">Gate pooled <select value={plan.gate} onChange={(e) => setPlan({ ...plan, gate: Number(e.target.value) })}>{[0.34, 0.4].map((g) => <option key={g} value={g}>{Math.round(g * 100)}%</option>)}</select></label>
          <label className="row">Premium pooled <select value={plan.premium} onChange={(e) => setPlan({ ...plan, premium: Number(e.target.value) })}>{[0, 0.15].map((g) => <option key={g} value={g}>{Math.round(g * 100)}%</option>)}</select></label>
        </div>
        {ours && <span>For us: {ours.transfer >= 0 ? "we'd gain" : "we'd pay"} about {money(Math.abs(ours.transfer))} a year, worth about {money(Math.abs(ours.value))} in franchise value. <Evidence kind="estimate" /></span>}
        <span className="muted">Biggest winners: {impact.slice(0, 4).map((r) => `${teamLabel(r.team)} ${money(r.transfer)}`).join(", ")}. Biggest payers: {impact.slice(-4).reverse().map((r) => `${teamLabel(r.team)} ${money(-r.transfer)}`).join(", ")}. Money that moves to small markets is money they can spend competing.</span>
      </div>
    </div>
  );
}
