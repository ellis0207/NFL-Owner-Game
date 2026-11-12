import { useState } from "react";
import { billions } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { marketRate } from "../../engine/debt";
import { owner, repayPersonal } from "../../engine/ownership";
import type { GameState, Holding, WealthState } from "../../engine/types";
import {
  borrow, borrowLimit, concentrationWord, FOCUS, fundTrust, giveToFoundation, HOLDING_KEYS, HOLDINGS, invest, netWorth, opportunityCost, profileWord,
  sellHolding, setFamilyOffice, setFocus, setVisibility, syncHoldings, wealth,
} from "../../engine/wealth";
import { money } from "../format";

const M = 1_000_000;
const big = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : money(x));
const pc = (x: number) => `${Math.round(x * 100)}%`;

/** Owner > Money: the owner's own wealth, outside the club's books. */
export function OwnerMoney({ game, say }: { game: GameState; say: (msg: string | null) => void }) {
  syncHoldings(game);
  const o = owner(game);
  const w = wealth(game);
  const nw = netWorth(game);
  const opp = opportunityCost(game);
  const [step, setStep] = useState(100 * M);
  const outside = Math.max(1, o.outside);
  const rate = marketRate(game);
  return (
    <>
      <div className="split">
        <div className="panel stack tight">
          <h3>What you're worth</h3>
          <dl className="kv">
            <dt>Your stake in the team</dt><dd>{big(nw.team)}</dd>
            <dt>Cash on hand</dt><dd>{big(nw.liquid)}</dd>
            <dt>Other holdings</dt><dd>{big(nw.outside)}</dd>
            {nw.pending > 0 && <><dt>Sales closing</dt><dd>{big(nw.pending)}</dd></>}
            {nw.debt > 0 && <><dt>Personal debt</dt><dd className="bad">{big(nw.debt)}</dd></>}
            <dt>Net worth</dt><dd><strong>{big(nw.total)}</strong></dd>
          </dl>
          <span className={nw.concentration >= 0.65 ? "bad" : ""}>{concentrationWord(nw.concentration)}: {pc(nw.concentration)} of your net worth.</span>
          {nw.concentration >= 0.65 && <span className="muted">Advisers would spread it out: a minority stake sale on the Ownership page turns part of the team into cash.</span>}
        </div>
        <div className="panel stack tight">
          <h3>The team against the market</h3>
          <dl className="kv">
            <dt>Your stake now</dt><dd>{big(opp.stake)}</dd>
            <dt>The same money in stocks</dt><dd>{big(opp.alt)}</dd>
            <dt>Difference</dt><dd className={opp.gap >= 0 ? "good" : "bad"}>{opp.gap >= 0 ? "+" : ""}{big(opp.gap)}</dd>
            <dt>Taxes paid on the club</dt><dd>{money(o.taxesPaid)}</dd>
            {o.carryforward > 0 && <><dt>Losses carried forward</dt><dd>{money(o.carryforward)}</dd></>}
          </dl>
          <span className="muted">What the money you put into the club would be worth had it gone into the stock market instead, counting what you put in and took out since.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Your holdings</h3>
        <div className="btn-row">
          <span className="label">Amount</span>
          <select aria-label="Amount" value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {[25, 100, 250, 1000].map((x) => <option key={x} value={x * M}>{big(x * M)}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Holding</th><th className="num">Value</th><th className="num">Share</th><th>Selling</th><th /></tr></thead>
            <tbody>
              {HOLDING_KEYS.map((k: Holding) => (
                <tr key={k}>
                  <td>{HOLDINGS[k].label}</td><td className="num">{big(w.holdings[k])}</td><td className="num">{pc(w.holdings[k] / outside)}</td>
                  <td className="muted">{HOLDINGS[k].what}</td>
                  <td>
                    <div className="btn-row">
                      <button className="btn small" onClick={() => say(sellHolding(game, k, step))}>Sell</button>
                      {k !== "business" && <button className="btn small" onClick={() => say(invest(game, k, step))}>Buy</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {w.pending.length > 0 && <span className="muted">Closing: {w.pending.map((p) => `${big(p.proceeds)} of ${HOLDINGS[p.kind].label.toLowerCase()} on ${shortDate(p.date)}`).join("; ")}.</span>}
        <span className="muted">Holdings move with the economy month by month: stocks and your businesses fall in recessions, bonds pay the going rate, property follows real-estate prices. None of it touches the club's books or the cap.</span>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Personal debt</h3>
          <dl className="kv">
            <dt>Owed</dt><dd>{money(o.personalDebt)}</dd>
            <dt>Rate</dt><dd>{((rate + 0.02) * 100).toFixed(1)}%</dd>
            <dt>Lenders would go to</dt><dd>{big(borrowLimit(game))}</dd>
          </dl>
          <div className="btn-row">
            <button className="btn small" onClick={() => say(borrow(game, step))}>Borrow {big(step)}</button>
            {o.personalDebt > 0 && <button className="btn small" onClick={() => say(repayPersonal(game) ?? "Paid down your personal debt.")}>Pay it down</button>}
          </div>
          <span className="muted">Borrowing is secured by your stocks, bonds and property. If prices fall far enough, a margin call sells stocks for you.</span>
        </div>
        <div className="panel stack tight">
          <h3>Family</h3>
          <dl className="kv">
            <dt>Family office</dt><dd>{w.familyOffice ? "Managing your holdings" : "None"}</dd>
            <dt>Family trust</dt><dd>{big(w.trust)}</dd>
          </dl>
          <div className="btn-row">
            <button className="btn small" onClick={() => { setFamilyOffice(game, !w.familyOffice); say(null); }}>{w.familyOffice ? "Close the family office" : "Hire a family office"}</button>
            <button className="btn small" onClick={() => say(fundTrust(game, step))}>Move {big(step)} into the trust</button>
          </div>
          <span className="muted">A family office costs about 0.75% of your holdings a year and runs them a little steadier and better. Money in the trust stays in the family but is no longer yours to put into the club.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Your foundation</h3>
          <dl className="kv">
            <dt>Endowment</dt><dd>{big(w.foundation.endowment)}</dd>
            <dt>Granted so far</dt><dd>{big(w.foundation.granted)}</dd>
            <dt>Given this year</dt><dd>{money(w.foundation.givenThisYear)}</dd>
          </dl>
          <label className="field"><span className="label">Focus</span>
            <select value={w.foundation.focus} onChange={(e) => { setFocus(game, e.target.value as WealthState["foundation"]["focus"]); say(null); }}>
              {(Object.keys(FOCUS) as WealthState["foundation"]["focus"][]).map((f) => <option key={f} value={f}>{FOCUS[f]}</option>)}
            </select>
          </label>
          <div className="btn-row"><button className="btn small" onClick={() => say(giveToFoundation(game, step))}>Give {big(step)}</button></div>
          <span className="muted">Separate from the club's foundation. Gifts come off your taxable income up to 30% of it; the foundation pays out 5% a year in grants, which builds your public standing, and in the club's city its goodwill.</span>
        </div>
        <div className="panel stack tight">
          <h3>Public profile</h3>
          <dl className="kv"><dt>How the public sees you</dt><dd>{profileWord(w.profile)}</dd></dl>
          <label className="field"><span className="label">How public you are</span>
            <select value={w.visibility} onChange={(e) => { setVisibility(game, e.target.value as WealthState["visibility"]); say(null); }}>
              <option value="private">Private: rarely seen or quoted</option>
              <option value="engaged">Engaged: the usual owner's profile</option>
              <option value="spotlight">In the spotlight: a public figure</option>
            </select>
          </label>
          <span className="muted">A public owner helps with sponsors and draws more of the press's attention; a private one the reverse. Winning and giving raise your standing; scandals lower it.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Conflicts with your businesses</h3>
          {w.conflicts.length ? <ul>{w.conflicts.slice(0, 8).map((c, i) => <li key={i}>{shortDate(c.date)} {c.date.slice(0, 4)}: {c.what}. <span className="muted">{c.outcome}</span></li>)}</ul>
            : <span className="muted">None so far. When one of your companies crosses paths with the club, counsel sends a memo.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Notes</h3>
          {w.log.length ? <ul>{w.log.slice(0, 10).map((l, i) => <li key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.text}</li>)}</ul> : <span className="muted">Nothing yet.</span>}
          {w.history.length > 1 && <span className="muted">Net worth a year ago: {big(w.history[Math.max(0, w.history.length - 13)].worth)}.</span>}
        </div>
      </div>
    </>
  );
}
