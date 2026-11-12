import { useState } from "react";
import { billions, valuation } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { LEAGUE_DEBT_LIMIT } from "../../engine/debt";
import {
  appraise, controller, fairPrice, franchise, placeBid, pursue, REASONS, setFinancing, sources, submitDeal, walkAway,
} from "../../engine/franchisemarket";
import { TERMS } from "../../engine/investors";
import { TEAM_BY_ID, TEAMS } from "../../engine/league";
import { buyMore, tenure } from "../../engine/takeover";
import type { ClubDeal, GameState, StakeTerms } from "../../engine/types";
import { wealth } from "../../engine/wealth";
import { money } from "../format";

type Say = (msg: string | null, ok?: string) => void;
const big = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : money(x));
const name = (t: string) => `${TEAM_BY_ID[t].city} ${TEAM_BY_ID[t].name}`;

const STAGE: Record<ClubDeal["stage"], string> = {
  diligence: "Due diligence", bidding: "Bidding", exclusive: "Exclusive: lining up the money", league: "League review and vote", closed: "Closed", failed: "Fell through",
};

/** The Deals tab: clubs for sale, appraisals, and the player's own purchase from first look to closing. */
export function Deals({ game, say }: { game: GameState; say: Say }) {
  const f = franchise(game);
  const t = tenure(game);
  const open = f.listings.filter((l) => l.status === "open");
  const [look, setLook] = useState(open[0]?.team ?? TEAMS.find((x) => x.id !== game.userTeam)!.id);
  const a = appraise(game, look);
  const deal = f.deal && f.deal.stage !== "closed" && f.deal.stage !== "failed" ? f.deal : undefined;
  return (
    <div className="stack">
      <p className="muted">
        {t.role === "control" ? `You control the ${name(game.userTeam)}. Buying another club means selling this one at closing; the league allows one controlling interest.`
          : t.role === "buyer" ? `You're in the market. The ${name(game.userTeam)} is for sale by ${t.controller}; you can buy it or any club whose owner will sell.`
          : `You hold ${Math.round((t.stake ?? 0) * 100)}% of the ${name(game.userTeam)}; ${t.controller} controls it.`}
      </p>
      {t.role === "minority" && <BuyMore game={game} say={say} />}
      {deal && <DealPanel game={game} deal={deal} say={say} />}
      <div className="panel stack">
        <h3>Clubs for sale</h3>
        {open.length === 0 && <p className="muted">No club is formally for sale. You can still make an offer for one; an owner who isn't selling needs a price well above what the club is worth.</p>}
        {open.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Club</th><th>Seller</th><th>Why</th><th className="num">Asking</th><th>Bids close</th><th /></tr></thead>
              <tbody>
                {open.map((l) => (
                  <tr key={l.team + l.since}>
                    <td>{name(l.team)}</td><td>{l.seller}</td><td>{REASONS[l.reason]}</td><td className="num">{big(l.ask)}</td><td>{shortDate(l.closes)}</td>
                    <td><button className="link" data-view onClick={() => setLook(l.team)}>Appraise</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel stack">
        <h3>Appraisal</h3>
        <label className="field" data-view><span className="label">Club</span>
          <select value={look} onChange={(e) => setLook(e.target.value)}>
            {TEAMS.map((x) => <option key={x.id} value={x.id}>{x.city} {x.name}</option>)}
          </select>
        </label>
        <dl className="kv">
          <dt>Controlled by</dt><dd>{controller(game, look)}</dd>
          <dt>What it's worth</dt><dd>{big(a.value)} ({a.multiple.toFixed(1)}x revenue)</dd>
          <dt>Revenue</dt><dd>{big(a.revenue)}: {big(a.national)} shared national money, {big(a.local)} local</dd>
          <dt>Operating income</dt><dd>{big(a.operating)}</dd>
          <dt>Market</dt><dd>{a.market}</dd>
          <dt>Stadium</dt><dd>{a.stadium}</dd>
          <dt>Debt (estimate)</dt><dd>{big(a.debt)}</dd>
          <dt>Equity</dt><dd>{big(a.equity)}</dd>
          <dt>Comparable sales</dt><dd>{a.comps || "None yet"}</dd>
        </dl>
        {!deal && look !== game.userTeam && (
          <div className="btn-row">
            <button className="btn primary" onClick={() => say(pursue(game, look), `Your advisers have started diligence on the ${name(look)}.`)}>
              Pursue the {TEAM_BY_ID[look].name}
            </button>
            <span className="muted">Diligence takes a month and costs about {money(Math.max(2_000_000, a.value * 0.0015))}.</span>
          </div>
        )}
        {!deal && look === game.userTeam && t.role !== "control" && (
          <div className="btn-row">
            <button className="btn primary" onClick={() => say(pursue(game, look), `Your advisers have started diligence on the ${name(look)}.`)}>Pursue control of this club</button>
          </div>
        )}
      </div>
      {f.deals.length > 0 && (
        <div className="panel stack">
          <h3>Your past deals</h3>
          <ul className="plain">{f.deals.slice(0, 8).map((d, i) => <li key={i}>{shortDate(d.opened)}: {name(d.team)}. {d.outcome}</li>)}</ul>
        </div>
      )}
      <div className="panel stack">
        <h3>Changes of control</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Club</th><th>Buyer</th><th className="num">Price</th></tr></thead>
            <tbody>
              {[...f.sales].reverse().slice(0, 12).map((s, i) => (
                <tr key={i}><td>{s.date.slice(0, 4)}</td><td>{TEAM_BY_ID[s.team]?.name ?? s.team}</td><td>{s.buyer}</td><td className="num">{big(s.price)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {f.log.length > 0 && <ul className="plain muted">{f.log.slice(0, 6).map((l, i) => <li key={i}>{shortDate(l.date)}: {l.text}</li>)}</ul>}
      </div>
    </div>
  );
}

function DealPanel({ game, deal, say }: { game: GameState; deal: ClubDeal; say: Say }) {
  const value = valuation(game, deal.team);
  const fair = deal.stage === "diligence" ? value : fairPrice(game, deal);
  const [price, setPrice] = useState(Math.round(fair / 25e6) * 25e6);
  const [cond, setCond] = useState(false);
  const fin = deal.financing ?? { lp: 0.2, pe: 0, debt: 0, trust: 0, terms: "standard" as StakeTerms };
  const [lp, setLp] = useState(fin.lp);
  const [pe, setPe] = useState(fin.pe);
  const [debtAmt, setDebt] = useState(fin.debt);
  const [trust, setTrust] = useState(fin.trust);
  const [terms, setTerms] = useState<StakeTerms>(fin.terms);
  const trial = { ...deal, financing: { lp, pe, debt: debtAmt, trust, terms } };
  const s = deal.stage === "exclusive" || deal.stage === "league" ? sources(game, trial) : undefined;
  const trustHeld = wealth(game).trust;
  return (
    <div className="panel stack">
      <h3>Your bid for the {name(deal.team)}</h3>
      <dl className="kv">
        <dt>Stage</dt><dd>{STAGE[deal.stage]}{deal.stage !== "bidding" || deal.bid ? `, until ${shortDate(deal.due)}` : ""}</dd>
        <dt>Spent so far</dt><dd>{money(deal.costs)} on advisers</dd>
        {deal.stage !== "diligence" && <><dt>Advisers' price</dt><dd>{big(fair)} after what diligence found</dd></>}
        {deal.bid && <><dt>Your bid</dt><dd>{big(deal.bid.price)}{deal.bid.financingOut ? ", subject to financing" : ", no financing condition"}</dd></>}
        {deal.vote && <><dt>Owners' vote</dt><dd>{deal.vote.yes} yes, {deal.vote.needed} needed</dd></>}
      </dl>
      {deal.stage === "diligence" && <p className="muted">The accountants, lawyers and engineers are going through the club. Their findings come in when diligence ends.</p>}
      {deal.findings.length > 0 && (
        <div className="stack tight">
          <strong>What diligence found</strong>
          <ul className="plain">{deal.findings.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
        </div>
      )}
      {deal.findings.length === 0 && deal.stage !== "diligence" && <p className="muted">Diligence found nothing beyond what the books show.</p>}
      {deal.rivals.length > 0 && (
        <div className="stack tight">
          <strong>Rival groups</strong>
          <ul className="plain">{deal.rivals.map((r) => <li key={r.name}>{r.name}: {r.note.toLowerCase()}{deal.stage !== "bidding" ? `, about ${big(r.price)}` : ""}</li>)}</ul>
        </div>
      )}
      {deal.stage === "bidding" && !deal.bid && (
        <div className="stack tight">
          <label className="field"><span className="label">Your bid (whole club, debt included)</span>
            <select value={price} onChange={(e) => setPrice(Number(e.target.value))}>
              {[0.85, 0.9, 0.95, 1, 1.03, 1.06, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5].map((k) => {
                const v = Math.round(fair * k / 25e6) * 25e6;
                return <option key={k} value={v}>{big(v)} ({Math.round(k * 100)}% of the advisers' price)</option>;
              })}
            </select>
          </label>
          <label className="field"><span className="label">Financing condition</span>
            <select value={cond ? "1" : "0"} onChange={(e) => setCond(e.target.value === "1")}>
              <option value="0">None: the seller likes the certainty</option>
              <option value="1">Subject to financing: you can walk if the lenders do</option>
            </select>
          </label>
          <div className="btn-row">
            <button className="btn primary" onClick={() => say(placeBid(game, price, cond), "Bid sent. The seller answers within ten days.")}>Place bid</button>
          </div>
        </div>
      )}
      {deal.stage === "exclusive" && s && (
        <div className="stack tight">
          <strong>The money</strong>
          <div className="split">
            <label className="field"><span className="label">Limited partners</span>
              <select value={lp} onChange={(e) => setLp(Number(e.target.value))}>{[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}</select>
            </label>
            <label className="field"><span className="label">Private-equity fund</span>
              <select value={pe} onChange={(e) => setPe(Number(e.target.value))}>{[0, 0.05, 0.1].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}</select>
            </label>
            <label className="field"><span className="label">Acquisition debt</span>
              <select value={debtAmt} onChange={(e) => setDebt(Number(e.target.value))}>{[0, 100, 200, 300, 400, 500].map((m) => m * 1e6).filter((v) => v <= LEAGUE_DEBT_LIMIT).map((v) => <option key={v} value={v}>{money(v)}</option>)}</select>
            </label>
            <label className="field"><span className="label">From the family trust</span>
              <select value={trust} onChange={(e) => setTrust(Number(e.target.value))}>{[0, 0.25, 0.5, 1].map((k) => Math.round(trustHeld * k)).filter((v, i, xs) => xs.indexOf(v) === i).map((v) => <option key={v} value={v}>{money(v)}</option>)}</select>
            </label>
            <label className="field"><span className="label">Partner terms</span>
              <select value={terms} onChange={(e) => setTerms(e.target.value as StakeTerms)}>{Object.entries(TERMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </label>
          </div>
          <Sources s={s} />
          <div className="btn-row">
            <button className="btn" onClick={() => say(setFinancing(game, { lp, pe, debt: debtAmt, trust, terms }), "Financing lined up.")}>Line up this financing</button>
            <button className="btn primary" disabled={!deal.financing} onClick={() => say(submitDeal(game), "Sent to the league. The finance committee vets you, then the owners vote.")}>Send to the league</button>
          </div>
        </div>
      )}
      {deal.stage === "league" && s && <Sources s={s} />}
      {deal.stage !== "league" && (
        <div className="btn-row">
          <button className="btn danger" onClick={() => say(walkAway(game), "You walked away from the deal.")}>Walk away</button>
        </div>
      )}
    </div>
  );
}

function Sources({ s }: { s: ReturnType<typeof sources> }) {
  return (
    <dl className="kv">
      <dt>Price for the equity</dt><dd>{big(s.equityPrice)} (after {big(s.assumed)} of debt and {big(s.claims)} of claims you take on, plus {big(s.cash)} of club cash)</dd>
      <dt>Deal costs</dt><dd>{money(s.costs)}</dd>
      <dt>Partners</dt><dd>{big(s.lp + s.pe)}</dd>
      <dt>Debt</dt><dd>{big(s.debt)}</dd>
      {s.trust > 0 && <><dt>Family trust</dt><dd>{big(s.trust)}</dd></>}
      {s.proceeds > 0 && <><dt>From selling your club</dt><dd>{big(s.proceeds)} after tax</dd></>}
      <dt>Your own money</dt><dd>{big(s.owner)} of {big(s.available)} you could raise{s.short > 0 ? `: ${big(s.short)} short` : ""}</dd>
    </dl>
  );
}

function BuyMore({ game, say }: { game: GameState; say: Say }) {
  const t = tenure(game);
  const room = Math.max(0, 0.49 - (t.stake ?? 0));
  return (
    <div className="panel stack">
      <h3>Your stake</h3>
      <p>You hold {Math.round((t.stake ?? 0) * 100)}%. {t.controller} pays you a share of each April's distribution. You can buy more from them, up to 49%, if they'll sell; control takes a full purchase.</p>
      <div className="btn-row">
        {[0.05, 0.1].filter((p) => p <= room + 1e-9).map((p) => (
          <button key={p} className="btn" onClick={() => say(buyMore(game, p), `You bought another ${Math.round(p * 100)}%.`)}>Buy {Math.round(p * 100)}% more</button>
        ))}
        {room < 0.05 && <span className="muted">You hold as much as a partner can.</span>}
      </div>
    </div>
  );
}
