import { useState } from "react";
import { billions, valuation } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { investors, moodWord, pctText, setSuccession, SUCCESSION } from "../../engine/investors";
import { TEAM_BY_ID } from "../../engine/league";
import {
  exemption, giveRole, healthWord, heirReport, INVOLVEMENT, legacyReview, liquidity, nameSuccessor, offerBuyout, ownerAge, premium, saleNet, seekApproval,
  sellClub, setInsurance, setInvolvement, stepDown, succession, TRUSTEES,
} from "../../engine/succession";
import { tenure } from "../../engine/takeover";
import type { GameState, LegacyReview, SuccessionState } from "../../engine/types";
import { money } from "../format";

type Say = (msg: string | null, ok?: string) => void;
const big = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : money(x));

/** The Succession tab: aging, heirs, the estate plan, partner buyouts, selling the club and the legacy so far. */
export function Succession({ game, say }: { game: GameState; say: Say }) {
  const s = succession(game);
  const inv = investors(game);
  const liq = liquidity(game);
  const age = ownerAge(game);
  const [trustee, setTrustee] = useState(s.trustee ?? TRUSTEES[0]);
  const [face, setFace] = useState(Math.round(liq.tax / 50e6) * 50e6);
  const sale = s.sale;
  const selling = sale && !["closed", "failed"].includes(sale.stage);
  const net = saleNet(game, valuation(game, game.userTeam));
  return (
    <div className="stack">
      <div className="panel stack">
        <h3>You</h3>
        <dl className="kv">
          <dt>Age</dt><dd>{age}</dd>
          <dt>Health</dt><dd>{healthWord(s.health)}</dd>
          <dt>Generation</dt><dd>{s.generation === 1 ? "The first of your family to own the club" : `Owner number ${s.generation} in the family`}</dd>
          <dt>Your role</dt><dd>{INVOLVEMENT[s.involvement]}</dd>
        </dl>
        <div className="btn-row">
          {(Object.keys(INVOLVEMENT) as SuccessionState["involvement"][]).filter((k) => k !== s.involvement).map((k) => (
            <button key={k} className="btn small" onClick={() => say(setInvolvement(game, k), "Your role changed.")}>{k === "full" ? "Run it yourself" : k === "chair" ? "Step back to chair" : "Retire from daily duties"}</button>
          ))}
        </div>
      </div>
      <div className="panel stack">
        <h3>Heirs</h3>
        <p className="muted">What the family office, the club president and the GM say about each. Giving an heir a job at the club teaches them and makes the reads more reliable.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th className="num">Age</th><th>Wants</th><th>Business</th><th>Football</th><th>Temper</th><th>Ready</th><th /></tr></thead>
            <tbody>
              {s.heirs.map((h) => {
                const r = heirReport(game, h);
                return (
                  <tr key={h.id}>
                    <td>{h.name}{s.successor === h.id ? " (successor)" : ""}<div className="muted">{h.relation}{h.role ? ", works at the club" : ""}</div></td>
                    <td className="num">{h.age}</td><td>{r.interest}</td><td>{r.business}</td><td>{r.football}</td><td>{r.temper}</td><td>{r.ready}</td>
                    <td>
                      <div className="btn-row">
                        {s.successor !== h.id && <button className="btn small" onClick={() => say(nameSuccessor(game, h.id, trustee), `${h.name} is your named successor.`)}>Name successor</button>}
                        <button className="btn small" onClick={() => say(giveRole(game, h.id, !h.role), h.role ? `${h.name} has a role at the club.` : `${h.name} left the club.`)}>{h.role ? "End role" : "Give a role"}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel stack">
        <h3>The estate plan</h3>
        <label className="field"><span className="label">If you can no longer run the club</span>
          <select value={inv.succession} onChange={(e) => { setSuccession(game, e.target.value as typeof inv.succession); say(null, "Plan updated."); }}>
            {Object.entries(SUCCESSION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">Trustee until the successor is ready</span>
          <select value={trustee} onChange={(e) => { setTrustee(e.target.value); if (s.successor) nameSuccessor(game, s.successor, e.target.value); say(null, "Trustee set."); }}>
            {TRUSTEES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <dl className="kv">
          <dt>Successor</dt><dd>{s.heirs.find((h) => h.id === s.successor)?.name ?? "None named"}</dd>
          <dt>League approval</dt><dd>{s.review ? `Under review until ${shortDate(s.review)}` : s.approved ? "Pre-approved" : "Not yet"}</dd>
        </dl>
        <div className="btn-row">
          <button className="btn" disabled={!s.successor || !!s.review || s.approved} onClick={() => say(seekApproval(game), "Sent to the finance committee; it answers in about two months.")}>Ask the league to approve</button>
          <button className="btn danger" disabled={!s.approved} onClick={() => say(stepDown(game), "You've handed on control. The memo on Today asks how you'll go on.")}>Hand control on now</button>
        </div>
      </div>
      <div className="panel stack">
        <h3>Liquidity for the estate</h3>
        <dl className="kv">
          <dt>Your stake, for tax</dt><dd>{big(liq.stake)} (15% off for being hard to sell)</dd>
          <dt>Everything else</dt><dd>{big(liq.outside)}</dd>
          <dt>Exemption</dt><dd>{big(exemption(game))}</dd>
          <dt>Estate tax at 40%</dt><dd>{big(liq.tax)}</dd>
          {liq.buyouts > 0 && <><dt>Partners who can cash out</dt><dd>{big(liq.buyouts)}</dd></>}
          <dt>Cash and quick assets</dt><dd>{big(liq.cash)}</dd>
          <dt>Life insurance</dt><dd>{big(liq.insurance)}</dd>
          <dt>Shortfall</dt><dd>{liq.short > 0 ? `${big(liq.short)}: the heirs would pay over ten years or sell part of the club` : "Covered"}</dd>
        </dl>
        <div className="btn-row">
          <label className="field"><span className="label">Insurance held in trust</span>
            <select value={face} onChange={(e) => setFace(Number(e.target.value))}>
              {[0, 0.25, 0.5, 1, 1.5].map((k) => Math.round(liq.tax * k / 50e6) * 50e6).filter((v, i, xs) => xs.indexOf(v) === i).map((v) => <option key={v} value={v}>{big(v)} (about {money(premium(game, v))} a year)</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => say(setInsurance(game, face), "Insurance set.")}>Set</button>
        </div>
      </div>
      {inv.partners.length > 0 && (
        <div className="panel stack">
          <h3>Buy out partners</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Partner</th><th className="num">Share</th><th>Mood</th><th className="num">At value</th><th /></tr></thead>
              <tbody>
                {inv.partners.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td className="num">{pctText(p.pct)}</td><td>{moodWord(p.mood)}</td><td className="num">{big(valuation(game, game.userTeam) * p.pct)}</td>
                    <td><div className="btn-row">{[0, 0.05, 0.1].map((k) => <button key={k} className="btn small" onClick={() => say(offerBuyout(game, p.id, k), `You bought out ${p.name}.`)}>{k ? `+${Math.round(k * 100)}%` : "At value"}</button>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">To sell part of your stake instead, use the Stakes tab.</p>
        </div>
      )}
      <div className="panel stack">
        <h3>Sell the club</h3>
        {!sale || sale.stage === "failed" ? (
          <>
            {sale?.failed && <p className="muted">The last try fell through: {sale.failed}</p>}
            <p>At today's value of {big(net.price)} you'd net about {big(net.net)}: less {big(net.debt)} of debt, {money(net.fees)} of fees, {big(net.partners)} to partners and {big(net.tax)} of tax, plus {big(net.cash)} of club cash. That's {net.multiple.toFixed(1)} times the money you put in, {(net.annual * 100).toFixed(1)}% a year.</p>
            <div className="btn-row"><button className="btn danger" disabled={tenure(game).role !== "control"} onClick={() => say(sellClub(game), "The bankers are marketing the club; bids come in about ten weeks.")}>Hire bankers to sell</button></div>
          </>
        ) : sale.stage === "closed" && sale.net ? (
          <p>Sold to {sale.chosen} for {big(sale.net.price)}. You netted {big(sale.net.net)}: {sale.net.multiple.toFixed(1)} times your money, {(sale.net.annual * 100).toFixed(1)}% a year over {sale.net.years.toFixed(1)} years.</p>
        ) : (
          <p>{sale.stage === "marketing" ? `The bankers are marketing the club; bids are due ${shortDate(sale.due)}.` : sale.stage === "bids" ? "Bids are in; the memo is on Today." : `${sale.chosen} is before the league; the owners vote by ${shortDate(sale.due)}.`}</p>
        )}
        {selling && <p className="muted">The club stays yours until the sale closes.</p>}
      </div>
      <div className="panel stack">
        <h3>Your legacy so far</h3>
        <Legacy review={legacyReview(game)} />
      </div>
      {s.history.length > 0 && (
        <div className="panel stack">
          <h3>Family and estate log</h3>
          <ul className="plain muted">{s.history.slice(0, 10).map((h, i) => <li key={i}>{shortDate(h.date)}: {h.text}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function Legacy({ review }: { review: LegacyReview }) {
  return (
    <div className="stack tight">
      <p><strong>{review.verdict}</strong> ({review.overall} of 100){review.clubs.length ? `: ${[...new Set(review.clubs)].join(", ")}` : ""}.</p>
      <div className="table-wrap">
        <table>
          <tbody>{review.parts.map((p) => <tr key={p.area}><td>{p.area}</td><td className="num">{p.score}</td><td>{p.text}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Shown in place of the game once it has ended. */
export function GameOver({ game }: { game: GameState }) {
  const r = game.succession?.ended;
  if (!r) return null;
  return (
    <div className="panel stack">
      <h2>The end of {r.owner}'s years with the {TEAM_BY_ID[game.userTeam].name}</h2>
      <Legacy review={r} />
      <p className="muted">The game is over. You can still look around, or load a save from the Save page.</p>
    </div>
  );
}
