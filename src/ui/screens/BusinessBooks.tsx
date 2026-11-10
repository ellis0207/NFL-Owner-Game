import { useState } from "react";
import { balanceSheet, books, budgetVsActual, cashFlow, fixedAssets, forecast, forecastBias, incomeStatement, planTotals, ratios, reserveTarget, setReserve } from "../../engine/books";
import { business, cashBalance, CATEGORY } from "../../engine/business";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { creditLimit } from "../../engine/debt";
import type { GameState, LedgerCat } from "../../engine/types";
import { money } from "../format";

/** The statements: accrual income statement, balance sheet, cash flow, ratios, with any line opening its ledger entries. */
export function Books({ game }: { game: GameState }) {
  const years = [...new Set(business(game).ledger.map((e) => e.year))].sort();
  const [year, setYear] = useState(leagueYear(game.date));
  const [drill, setDrill] = useState<LedgerCat | null>(null);
  const inc = incomeStatement(game, year);
  const bs = balanceSheet(game);
  const cf = cashFlow(game, year);
  const current = year === leagueYear(game.date);
  const line = (cat: LedgerCat, amount: number) => (
    <tr key={cat}>
      <td><button className="link" onClick={() => setDrill(drill === cat ? null : cat)}>{CATEGORY[cat].label}</button></td>
      <td className={`num ${amount < 0 ? "bad" : ""}`}>{money(amount)}</td>
    </tr>
  );
  return (
    <div className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="muted" style={{ margin: 0 }}>The {year} league year{current ? " so far" : ""}. Click any cash line to see the payments behind it.</p>
        {years.length > 1 && (
          <div className="tabs" role="group" aria-label="League year">
            {years.map((y) => <button key={y} aria-pressed={y === year} onClick={() => { setYear(y); setDrill(null); }}>{y}</button>)}
          </div>
        )}
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Income statement</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>Revenue</td><td className="num">{money(inc.revenue)}</td></tr>
                <tr><td>Player pay, as the cap counts it</td><td className="num bad">{money(inc.players)}</td></tr>
                <tr><td>Everything else the club spends</td><td className="num bad">{money(inc.otherExpenses)}</td></tr>
                <tr><td><strong>Operating income before depreciation</strong></td><td className="num"><strong>{money(inc.ebitda)}</strong></td></tr>
                <tr><td>Depreciation of stadium and facility work</td><td className="num bad">{money(inc.depreciation)}</td></tr>
                <tr><td>Interest and loan fees</td><td className="num bad">{money(inc.interest)}</td></tr>
                <tr><td>Income tax</td><td className="num muted">None at the club</td></tr>
                <tr><td><strong>Net income</strong></td><td className={`num ${inc.net < 0 ? "bad" : "good"}`}><strong>{money(inc.net)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <span className="muted">
            On the accrual basis: a signing bonus is counted over the contract's years the way the cap counts it ({money(inc.playersCash)} went to players in cash),
            season tickets count as the games are played, and buildings are written off over their lives. The club is a pass-through: you pay the income tax (Owner page).
            On the cash basis, operating income was {money(inc.cashOperating)}.
          </span>
        </div>
        <div className="panel stack tight">
          <h3>Balance sheet today</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {bs.assets.map((a) => <tr key={a.label}><td>{a.label}</td><td className="num">{money(a.amount)}</td></tr>)}
                <tr><td><strong>What the club owns</strong></td><td className="num"><strong>{money(bs.totalAssets)}</strong></td></tr>
                {bs.liabilities.map((a) => <tr key={a.label}><td>{a.label}</td><td className="num bad">{money(-a.amount)}</td></tr>)}
                <tr><td><strong>What the club owes</strong></td><td className="num"><strong>{money(-bs.totalLiabilities)}</strong></td></tr>
                <tr><td>Your capital: equity at purchase, plus what you put in, less what you took out</td><td className="num">{money(bs.contributed)}</td></tr>
                <tr><td>Earnings kept in the club since</td><td className="num">{money(bs.retained)}</td></tr>
                <tr><td><strong>Owner's equity</strong></td><td className="num"><strong>{money(bs.equity)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <span className="muted">Book values, not market value: the franchise is carried at what you paid. Player guarantees not yet earned aren't debts until the season's played.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Cash flow</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>Cash at the start of the year</td><td className="num">{money(cf.begin)}</td></tr>
                <tr><td><strong>From operations</strong></td><td className="num"><strong>{money(cf.totals.operating)}</strong></td></tr>
                {cf.operating.filter((r) => r.cat === "deposits").map((r) => line(r.cat, r.amount))}
                <tr><td><strong>Invested in buildings</strong></td><td className="num"><strong>{money(cf.totals.investing)}</strong></td></tr>
                {cf.investing.map((r) => line(r.cat, r.amount))}
                <tr><td><strong>Loans and the owner's money</strong></td><td className="num"><strong>{money(cf.totals.financing)}</strong></td></tr>
                {cf.financing.map((r) => line(r.cat, r.amount))}
                <tr><td><strong>Cash at {current ? "today" : "the end of the year"}</strong></td><td className="num"><strong>{money(cf.end)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          {current && <span className={cf.reconciled ? "muted" : "bad"}>{cf.reconciled ? "Ties to the bank balance." : `Doesn't tie to the bank balance of ${money(cashBalance(game))}.`} Profit isn't cash: deposits and loans move cash without being income.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Ratios</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Measure</th><th className="num">Us</th><th className="num">League</th></tr></thead>
              <tbody>{ratios(game, year).map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.value}</td><td className="num muted">{r.league ?? ""}</td></tr>)}</tbody>
            </table>
          </div>
          <span className="muted">League figures are the median of reporters' estimates.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Operating cash by line</h3>
        <div className="table-wrap">
          <table><tbody>{cf.operating.filter((r) => r.cat !== "deposits").map((r) => line(r.cat, r.amount))}</tbody></table>
        </div>
      </div>
      {drill && <Drill game={game} year={year} cat={drill} />}
      <Assets game={game} />
    </div>
  );
}

function Drill({ game, year, cat }: { game: GameState; year: number; cat: LedgerCat }) {
  const rows = business(game).ledger.filter((e) => e.year === year && e.cat === cat).slice().reverse();
  const total = rows.reduce((t, e) => t + e.amount, 0);
  return (
    <div className="panel stack tight">
      <h3>{CATEGORY[cat].label}: {rows.length} payments, {money(total)}</h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.slice(0, 80).map((e, i) => (
              <tr key={i}><td>{shortDate(e.date)}</td><td className="muted">{e.note ?? ""}</td><td className={`num ${e.amount < 0 ? "bad" : "good"}`}>{money(e.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Assets({ game }: { game: GameState }) {
  const fa = fixedAssets(game);
  if (!fa.rows.length) return null;
  return (
    <div className="panel stack tight">
      <h3>Buildings and improvements</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Project</th><th className="num">Cost</th><th className="num">Book value</th><th>Written off over</th></tr></thead>
          <tbody>{fa.rows.map((r) => <tr key={r.id}><td>{r.title}{r.opened ? "" : " (under construction)"}</td><td className="num">{money(r.cost)}</td><td className="num">{money(r.net)}</td><td>{r.life} years</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

const MONTHLY_LINES = new Set<LedgerCat>(["national", "sponsorship", "localMedia", "naming", "staff", "staffOwed", "businessOps", "marketing", "community", "medical", "facilities", "scouts", "benefits", "league", "stadium", "rent", "debt"]);

/** The approved budget against what happened, the reserve policy and the multiyear forecast. */
export function Plan({ game, changed }: { game: GameState; changed: () => void }) {
  const year = leagueYear(game.date);
  const rows = budgetVsActual(game, year);
  const plan = planTotals(books(game).plan[year] ?? {});
  const [span, setSpan] = useState(5);
  const fc = forecast(game, span);
  const bias = forecastBias(game);
  const b = books(game);
  const reserve = reserveTarget(game);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>{year} budget</h3>
          <dl className="kv">
            <dt>Planned revenue</dt><dd>{money(plan.revenue)}</dd>
            <dt>Planned costs</dt><dd>{money(plan.expenses)}</dd>
            <dt>Planned operating income</dt><dd>{money(plan.operating)}</dd>
          </dl>
          <span className="muted">Approved at the start of the league year from the contracts, budgets, schedule and loans then in place. Department envelopes are a twelfth of the year each month.</span>
        </div>
        <div className="panel stack tight">
          <h3>Cash reserve</h3>
          <dl className="kv">
            <dt>Policy</dt><dd>{b.reserveMonths} month{b.reserveMonths === 1 ? "" : "s"} of costs and debt service</dd>
            <dt>Keep on hand</dt><dd>{money(reserve)}</dd>
            <dt>Cash now</dt><dd className={cashBalance(game) < reserve ? "bad" : "good"}>{money(cashBalance(game))}</dd>
          </dl>
          <div className="tabs" role="group" aria-label="Reserve">
            {[0, 1, 2, 3, 4, 6].map((m) => <button key={m} aria-pressed={b.reserveMonths === m} onClick={() => { setReserve(game, m); changed(); }}>{m ? `${m} mo` : "None"}</button>)}
          </div>
          <span className="muted">Nothing goes out to you if it would leave less than the reserve. Payroll, bonuses and loan payments come out of it in a bad month.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Budget against actual</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Line</th><th className="num">Year's budget</th><th className="num">A month</th><th className="num">Budget to date</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Year on this pace</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.plan || r.actual).map((r) => (
                <tr key={r.cat}>
                  <td>{CATEGORY[r.cat].label}</td>
                  <td className="num">{money(r.plan)}</td>
                  <td className="num muted">{MONTHLY_LINES.has(r.cat) ? money(r.plan / 12) : ""}</td>
                  <td className="num">{money(r.toDate)}</td>
                  <td className="num">{money(r.actual)}</td>
                  <td className={`num ${r.variance < -0.05 * Math.abs(r.toDate) - 100_000 ? "bad" : r.variance > 0.05 * Math.abs(r.toDate) + 100_000 ? "good" : ""}`}>{money(r.variance)}</td>
                  <td className="num">{money(r.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted">Positive variance is better than budget: more revenue or less spending.</span>
      </div>
      <div className="panel stack tight">
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h3>Forecast</h3>
          <div className="tabs" role="group" aria-label="Years">
            {[5, 10, 20].map((n) => <button key={n} aria-pressed={span === n} onClick={() => setSpan(n)}>{n} years</button>)}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>League year</th><th className="num">Revenue</th><th className="num">Revenue range</th><th className="num">Players</th><th className="num">Other costs</th><th className="num">Operating</th><th className="num">Construction</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Cash at year end</th><th className="num">Range</th></tr></thead>
            <tbody>
              {fc.map((f) => (
                <tr key={f.year}>
                  <td>{f.year}{f.year === year ? " (rest of year)" : ""}</td>
                  <td className="num">{money(f.revenue)}</td><td className="num">{money(f.revLow)} to {money(f.revHigh)}</td><td className="num">{money(f.players)}</td><td className="num">{money(-f.otherCosts)}</td>
                  <td className={`num ${f.operating < 0 ? "bad" : ""}`}>{money(f.operating)}</td><td className="num">{f.capex ? money(f.capex) : ""}</td>
                  <td className="num">{f.interest ? money(f.interest) : ""}</td><td className="num">{f.principal ? money(f.principal) : ""}</td>
                  <td className={`num ${f.cash < 0 ? "bad" : ""}`}>{money(f.cash)}</td>
                  <td className={`num ${f.shortfall ? "bad" : "muted"}`}>{money(f.low)} to {money(f.high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted">
          National money grows with the cap; local prices about 4% a year; local deals that run out are assumed renewed. Players are paid about what the cap allows.
          The range widens each year for ticket demand, renewals, construction overruns and floating rates.
          {fc.some((f) => f.shortfall) ? ` In the low case we'd need ${money(Math.max(...fc.map((f) => f.shortfall)))} beyond the ${money(creditLimit(game))} credit line.` : ""}
        </span>
      </div>
      {bias.length > 0 && (
        <div className="panel stack tight">
          <h3>How the budgets held up</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>League year</th><th className="num">Budgeted operating income</th><th className="num">Actual</th><th className="num">Miss</th></tr></thead>
              <tbody>{bias.map((x) => <tr key={x.year}><td>{x.year}</td><td className="num">{money(x.plan)}</td><td className="num">{money(x.actual)}</td><td className={`num ${x.miss < 0 ? "bad" : "good"}`}>{money(x.miss)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
