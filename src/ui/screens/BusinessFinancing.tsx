import { CompareToggle } from "../Comparison";
import { acceptLoanTracked, financingComparison } from "../../engine/compare";
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import {
  coverage, debt, debtRoom, distributionsBlocked, drawn, earningsBase, facilityRate, LEAGUE_DEBT_LIMIT, LENDERS, leverage, loanRate, marketRate,
  openLoans, prepay, pushLender, rateExposure, requestLoan, resizeFacility, trustWord, type LoanRequest,
} from "../../engine/debt";
import type { GameState, LoanKind } from "../../engine/types";
import { money } from "../format";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function Financing({ game, changed }: { game: GameState; changed: () => void }) {
  const d = debt(game);
  const f = d.facility;
  const [msg, setMsg] = useState<string | null>(null);
  const [req, setReq] = useState<LoanRequest>({ amount: 100_000_000, years: 7, kind: "fixed", purpose: "general" });
  const act = (m: string | null, ok: string) => { setMsg(m ?? ok); changed(); };
  const loans = openLoans(game);
  const exp = rateExposure(game);
  const rates = Object.entries(d.rates).sort().slice(-24);
  const cov = coverage(game);
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Credit line</h3>
          <dl className="kv">
            <dt>Bank</dt><dd>{f.lender}</dd>
            <dt>Size</dt><dd>{money(f.limit)}</dd>
            <dt>Drawn</dt><dd className={drawn(game) ? "bad" : undefined}>{money(drawn(game))}</dd>
            <dt>Rate on what's drawn</dt><dd>{pct(facilityRate(game))} (market + {pct(f.spread)})</dd>
            <dt>Fee on the unused part</dt><dd>{pct(f.commitment)} a year</dd>
            <dt>Renews</dt><dd>{shortDate(f.matures)} {f.matures.slice(0, 4)}</dd>
          </dl>
          <div className="btn-row">
            <button className="btn small" onClick={() => act(resizeFacility(game, f.limit + 50_000_000), "The bank raised the line.")}>Ask for $50M more</button>
            <button className="btn small" onClick={() => act(resizeFacility(game, f.limit - 50_000_000), "Line cut; the fee on unused money goes down.")}>Cut it by $50M</button>
          </div>
          <span className="muted">Cash below zero is drawn on the line. Past the line, you have to put money in.</span>
        </div>
        <div className="panel stack tight">
          <h3>How lenders see us</h3>
          <dl className="kv">
            <dt>Standing</dt><dd>{trustWord(d.trust)}</dd>
            <dt>Earnings they count</dt><dd>{money(earningsBase(game))} a year</dd>
            <dt>Coverage</dt><dd>{cov >= 99 ? "No debt service" : `${cov.toFixed(2)} times debt service`}</dd>
            <dt>Debt to earnings</dt><dd>{leverage(game).toFixed(2)} times</dd>
            <dt>League debt room</dt><dd>{money(Math.max(0, debtRoom(game, "general")))} of {money(LEAGUE_DEBT_LIMIT)} (more for stadium projects)</dd>
            <dt>Market rate</dt><dd>{pct(marketRate(game))}</dd>
          </dl>
          {distributionsBlocked(game) && <span className="bad">A covenant is broken: no distributions to you until we pass a test.</span>}
          <span className="muted">Lenders count the last twelve months of operating income (the public estimate in your first year). Capital calls and broken covenants cost standing; clean tests earn it back.</span>
        </div>
      </div>

      <div className="panel stack tight">
        <h3>Loans</h3>
        {loans.length === 0 ? <span className="muted">No term loans.</span> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lender</th><th>Purpose</th><th className="num">Balance</th><th>Rate</th><th>Repayment</th><th>Due</th><th>Covenants</th><th>Security</th><th></th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td>{l.lender}</td><td>{l.purpose}</td><td className="num">{money(l.balance)}</td>
                    <td>{pct(loanRate(game, l))} {l.kind === "floating" ? "floating" : "fixed"}{l.stepUp ? ` (+${pct(l.stepUp)} waiver)` : ""}</td>
                    <td>{l.amort === "amortizing" ? `${money(l.amount / (l.years * 12))} a month` : "All at maturity"}</td>
                    <td className={l.accelerated ? "bad" : undefined}>{l.accelerated ? `Called: ${shortDate(l.accelerated)}` : shortDate(l.maturity) + " " + l.maturity.slice(0, 4)}</td>
                    <td>Coverage {l.minCoverage}x, debt {l.maxLeverage}x{l.breaches ? <span className="bad"> · in breach</span> : ""}</td>
                    <td className="muted">{l.security}</td>
                    <td><button className="btn small" onClick={() => act(prepay(game, l.id, Math.min(l.balance, 50_000_000)), "Paid down $50M.")}>Pay down $50M</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className="muted">Fixed-rate loans charge 1% on early repayment. Covenants are tested on the first of January, April, July and October.</span>
      </div>

      <div className="panel stack tight">
        <h3>Borrow</h3>
        <div className="btn-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <label className="field"><span className="label">Amount</span>
            <select value={req.amount} onChange={(e) => setReq({ ...req, amount: Number(e.target.value) })}>
              {[50, 100, 150, 200, 300, 400, 500].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Years</span>
            <select value={req.years} onChange={(e) => setReq({ ...req, years: Number(e.target.value) })}>
              {[3, 5, 7, 10, 12, 15].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Rate</span>
            <select value={req.kind} onChange={(e) => setReq({ ...req, kind: e.target.value as LoanKind })}>
              <option value="fixed">Fixed</option><option value="floating">Floating</option>
            </select>
          </label>
          <label className="field"><span className="label">For</span>
            <select value={req.purpose} onChange={(e) => setReq({ ...req, purpose: e.target.value as LoanRequest["purpose"] })}>
              <option value="general">General purposes</option><option value="projects">Stadium and facility projects</option>
            </select>
          </label>
          <button className="btn" onClick={() => act(requestLoan(game, req), "")}>Ask lenders for terms</button>
        </div>
        <span className="muted">{LENDERS.map((l) => `${l.name}: ${l.what}`).join(" ")}</span>
        {d.offers.length > 0 && <CompareToggle get={() => financingComparison(game, d.offers)} label="Compare the offers: payments, rate risk, covenants in a recession" />}
        {d.offers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lender</th><th className="num">Amount</th><th>Rate</th><th>Years</th><th>Repayment</th><th>Fee</th><th>Covenants</th><th>Good until</th><th></th></tr></thead>
              <tbody>
                {d.offers.map((o) => (
                  <tr key={o.id}>
                    <td>{o.lender}{o.purpose === "refinance" ? " (refinancing)" : ""}</td><td className="num">{money(o.amount)}</td>
                    <td>{o.kind === "fixed" ? `${pct(o.rate)} fixed` : `market + ${pct(o.rate)} (${pct(loanRate(game, o))} now)`}</td>
                    <td>{o.years}</td><td>{o.amort === "amortizing" ? "Monthly" : "At maturity"}</td><td>{pct(o.fee)} ({money(o.amount * o.fee)})</td>
                    <td>Coverage {o.minCoverage}x, debt {o.maxLeverage}x</td><td>{shortDate(o.expires)}</td>
                    <td className="btn-row">
                      <button className="btn small primary" onClick={() => act(acceptLoanTracked(game, o.id), `Signed with ${o.lender}. ${money(o.amount)} is in the bank.`)}>Sign</button>
                      {!o.pushed && <button className="btn small" onClick={() => act(pushLender(game, o.id), "")}>Push for better</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>If rates rise</h3>
          <dl className="kv">
            <dt>Floating debt</dt><dd>{money(exp.floating)}</dd>
            <dt>One point higher</dt><dd>{money(exp.plus1)} more interest a year</dd>
            <dt>Two points higher</dt><dd>{money(exp.plus2)} more a year</dd>
          </dl>
          {exp.refinancing.map((r) => <span key={r.lender + r.date} className="muted">{r.lender}: {money(r.balance)} refinances by {shortDate(r.date)} {r.date.slice(0, 4)}, at about {pct(r.then)} today against {pct(r.now)} now.</span>)}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="num">Market rate</th></tr></thead>
              <tbody>{rates.slice(-12).reverse().map(([m, r]) => <tr key={m}><td>{m}</td><td className="num">{pct(r)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Covenant tests and lender notes</h3>
          {d.tests.length === 0 && d.log.length === 0 && <span className="muted">Nothing yet.</span>}
          {d.tests.slice(0, 8).map((t, i) => <span key={i} className={t.ok ? "muted" : "bad"}>{shortDate(t.date)}: coverage {t.coverage}x, debt {t.leverage}x, {t.ok ? "passed" : "failed"}</span>)}
          {d.log.slice(0, 10).map((l, i) => <span key={`l${i}`}>{shortDate(l.date)}: {l.text}</span>)}
        </div>
      </div>
    </div>
  );
}
