import { CompareToggle } from "../Comparison";
import { setPricesTracked, ticketComparison } from "../../engine/compare";
import { useState } from "react";
import { business, CONCESSION_LABEL, gateForecast, PRICING_OPENS, RENEWAL_DEADLINE, setConcessions, setParking, setSinglePrice } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { RULES, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { controlOf, MARKETS, STADIUM_BY_TEAM } from "../../engine/stadiums";
import {
  ACCESSIBLE, buyResearch, churnForecast, demandCurve, launchPSL, nextHomeGame, PREMIUM, PROMO_LABEL, PSL_PRICES, recommendedIncrease, revPAS, seasonPremiumUse,
  setPromo, setTicketOption, setTierPrice, setTransfers, setZonePrice, TIER_LABEL, tix, ZONES,
} from "../../engine/ticketing";
import type { ConcessionTier, GameState, GameTier, Promo, Zone } from "../../engine/types";
import { money } from "../format";

function heatWords(heat: number): string {
  return heat >= 1.6 ? "Resale prices are far above face value" : heat >= 1.15 ? "Resale prices are above face value" : heat >= 0.95 ? "Selling out at face value"
    : heat >= 0.7 ? "Some seats will go unsold" : "Lots of seats will go unsold";
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export function Tickets({ game, changed }: { game: GameState; changed: () => void }) {
  const b = business(game);
  const t = tix(game);
  const us = game.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const mk = MARKETS[us];
  const ctrl = controlOf(s);
  const next = nextHomeGame(game);
  const f = next ? gateForecast(game, next) : null;
  const rec = recommendedIncrease(game);
  const [season, setSeason] = useState(b.next?.season ?? 1 + rec);
  const [premium, setPremium] = useState(b.next?.premium ?? 1.03);
  const [psl, setPsl] = useState(PSL_PRICES[1]);
  const [msg, setMsg] = useState<string | null>(null);
  const offseason = game.date >= PRICING_OPENS;
  const churn = churnForecast(game);
  const rp = revPAS(game);
  const use = seasonPremiumUse(game);
  const acq = t.acquisition[0];
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>This season</h3>
          <dl className="kv">
            <dt>Season-ticket holders</dt><dd>{b.holders.toLocaleString("en-US")}</dd>
            <dt>Season-ticket price</dt><dd>${Math.round(mk.ticket * (b.index?.season ?? 1))} a game on average (locked for {RULES.season})</dd>
            <dt>Stadium</dt><dd>{s.capacity.toLocaleString("en-US")} seats, about {Math.round(s.capacity * 0.12).toLocaleString("en-US")} in suites and clubs, {Math.round(s.capacity * ACCESSIBLE).toLocaleString("en-US")} accessible</dd>
            <dt>Revenue per seat</dt><dd>{rp ? `$${rp} a seat a game (tickets, suites, food, parking, store)` : "After the first home game"}</dd>
            <dt>Suites and clubs in use</dt><dd>{use != null ? `${pct(use)} this season` : "Not measured yet"}; {pct(t.premiumBook)} of the premium seats are leased</dd>
          </dl>
          <label className="field">
            <span className="label">Single-game prices: {Math.round(b.prices.single * 100)}% of market (about ${Math.round(mk.ticket * (b.index?.season ?? 1) * 1.2 * b.prices.single)} a seat on average)</span>
            <input type="range" min={60} max={180} step={5} value={Math.round(b.prices.single * 100)}
              onChange={(e) => { setSinglePrice(game, Number(e.target.value) / 100); changed(); }} aria-label="Single-game price" />
          </label>
          {f && next && (
            <span className="muted">
              Next home game, {shortDate(next.date)} vs {teamLabel(next.home === us ? next.away! : next.home!)} ({TIER_LABEL[f.tier].toLowerCase()} game): the ticket office expects about {Math.min(100, Math.round((f.sold / f.capacity) * 100))}% of seats sold. {heatWords(f.heat)}.
            </span>
          )}
          <label className="field">
            <span className="label">Concessions</span>
            <select value={ctrl.concessions ? b.prices.concessions : "standard"} disabled={!ctrl.concessions}
              onChange={(e) => { setConcessions(game, e.target.value as ConcessionTier); changed(); }}>
              {(Object.keys(CONCESSION_LABEL) as ConcessionTier[]).map((x) => <option key={x} value={x}>{CONCESSION_LABEL[x]}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">Parking: {ctrl.parking ? `$${Math.round(mk.parking * b.prices.parking)} a car` : `set by ${s.operator}`}</span>
            <input type="range" min={50} max={180} step={10} value={Math.round(b.prices.parking * 100)} disabled={!ctrl.parking}
              onChange={(e) => { setParking(game, Number(e.target.value) / 100); changed(); }} aria-label="Parking price" />
          </label>
          {(!ctrl.concessions || !ctrl.parking) && <span className="muted">{s.operator} runs concessions and parking at {s.name}. We get {Math.round(s.gameDayShare * 100)}% of the game-day commission.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Pricing by zone and game</h3>
          <span className="muted">Each zone's price against the usual spread. Cheaper seats have more price-sensitive buyers.</span>
          {(Object.keys(ZONES) as Zone[]).map((z) => (
            <label key={z} className="field">
              <span className="label">{ZONES[z].label}: {signed(t.zones[z] - 1)} (about ${Math.round(mk.ticket * (b.index?.season ?? 1) * 1.2 * b.prices.single * ZONES[z].price * t.zones[z])})</span>
              <input type="range" min={60} max={180} step={5} value={Math.round(t.zones[z] * 100)} onChange={(e) => { setZonePrice(game, z, Number(e.target.value) / 100); changed(); }} aria-label={ZONES[z].label} />
            </label>
          ))}
          <span className="label">Price by game</span>
          <span className="muted">Marquee games (big draws, rivals, prime time) can carry more; value games (cold weather, weak draws) less. All at 0% is one price for every game.</span>
          {(Object.keys(TIER_LABEL) as GameTier[]).map((k) => (
            <label key={k} className="field">
              <span className="label">{TIER_LABEL[k]} games: {signed(t.tiers[k] - 1)}</span>
              <input type="range" min={70} max={150} step={5} value={Math.round(t.tiers[k] * 100)} onChange={(e) => { setTierPrice(game, k, Number(e.target.value) / 100); changed(); }} aria-label={`${TIER_LABEL[k]} games`} />
            </label>
          ))}
          <label className="btn-row"><input type="checkbox" checked={t.dynamic} onChange={(e) => { setTicketOption(game, "dynamic", e.target.checked); changed(); }} /> Dynamic pricing: reprice unsold seats through the week (15% down to 30% up)</label>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Filling seats</h3>
          <label className="btn-row"><input type="checkbox" checked={t.groups} onChange={(e) => { setTicketOption(game, "groups", e.target.checked); changed(); }} /> Group sales: youth teams, churches and companies at 25% off, into seats that would go unsold</label>
          <label className="field">
            <span className="label">Promotion</span>
            <select value={t.promo} onChange={(e) => { setPromo(game, e.target.value as Promo); changed(); }}>
              {(Object.keys(PROMO_LABEL) as Promo[]).map((x) => <option key={x} value={x}>{PROMO_LABEL[x]}</option>)}
            </select>
          </label>
          <span className="muted">A promotion brings in new fans, but some buyers would have paid full price anyway. When games sell out on their own, it only gives money away.</span>
          <label className="btn-row"><input type="checkbox" checked={t.hospitality} onChange={(e) => { setTicketOption(game, "hospitality", e.target.checked); changed(); }} /> Corporate hospitality: sell unused suite nights to companies as client packages</label>
          <label className="field">
            <span className="label">Ticket transfers</span>
            <select value={t.transfers} onChange={(e) => { setTransfers(game, e.target.value as "open" | "official"); changed(); }}>
              <option value="open">Open: holders resell anywhere</option>
              <option value="official">Through the team exchange only (we keep a fee; fans don't like it)</option>
            </select>
          </label>
        </div>
        <div className="panel stack tight">
          <h3>{RULES.season + 1} season tickets</h3>
          {!offseason && <span className="muted">Season-ticket and suite prices for {RULES.season + 1} are set after the regular season ends ({shortDate(PRICING_OPENS)}). Renewals are due {shortDate(RENEWAL_DEADLINE)}.</span>}
          {offseason && !b.renewal && (
            <>
              <label className="field">
                <span className="label">Season tickets: {signed(season - 1)}</span>
                <input type="range" min={90} max={125} step={1} value={Math.round(season * 100)} onChange={(e) => setSeason(Number(e.target.value) / 100)} aria-label="Season-ticket change" />
              </label>
              <label className="field">
                <span className="label">Suites and clubs: {signed(premium - 1)}</span>
                <input type="range" min={90} max={125} step={1} value={Math.round(premium * 100)} onChange={(e) => setPremium(Number(e.target.value) / 100)} aria-label="Premium change" />
              </label>
              <CompareToggle get={() => ticketComparison(game, [...new Set([Math.round((season - 1) * 100) / 100, 0, rec, Math.round((rec + 0.04) * 100) / 100])])} label="Compare price changes" />
              <button className="btn primary small" onClick={() => { setMsg(setPricesTracked(game, season, premium)); changed(); }}>
                {b.next?.announced ? "Announce new prices" : "Announce prices"}
              </button>
              {b.next?.announced && <span className="muted">Announced {shortDate(b.next.announced)}. Renewals are due {shortDate(RENEWAL_DEADLINE)}; until then you can change them, though fans notice every change.</span>}
              {!b.next?.announced && <span className="muted">If you don't announce anything, the business staff raises season tickets {signed(rec)}, from how hot demand was and how long the waiting list is.</span>}
              {!t.psl && (
                <div className="stack tight">
                  <span className="label">Personal seat licenses</span>
                  <span className="muted">A one-time charge for the right to keep a seat, which the holder owns and can sell. It brings in cash outside operating income, costs trust that lasts for years, and some holders give up their seats. Holders who pay renew more often after.</span>
                  <div className="btn-row">
                    <select value={psl} onChange={(e) => setPsl(Number(e.target.value))} aria-label="Seat license price">{PSL_PRICES.map((p) => <option key={p} value={p}>{money(p)} a seat</option>)}</select>
                    <button className="btn small" onClick={() => { setMsg(launchPSL(game, psl) ?? `Seat licenses at ${money(psl)} will be due with the ${RULES.season + 1} renewals.`); changed(); }}>Announce seat licenses</button>
                  </div>
                </div>
              )}
            </>
          )}
          {t.psl && <span className="muted">Seat licenses at {money(t.psl.price)} a seat since {t.psl.season}{t.psl.revenue ? `: ${t.psl.holders.toLocaleString("en-US")} sold for ${money(t.psl.revenue)}` : ", due with the renewals"}.</span>}
          {b.renewal && (
            <dl className="kv">
              <dt>Renewed</dt><dd>{pct(b.renewal.rate)}</dd>
              <dt>Holders next season</dt><dd>{b.renewal.holders.toLocaleString("en-US")}</dd>
            </dl>
          )}
          {!b.renewal && (
            <dl className="kv">
              <dt>Expected to renew</dt><dd>{pct(churn.rate)} ({churn.atRisk.toLocaleString("en-US")} holders at risk)</dd>
              <dt>By tenure</dt><dd>{pct(churn.plan.long)} longtime, {pct(churn.plan.mid)} mid, {pct(churn.plan.recent)} newest</dd>
              <dt>Waiting list</dt><dd>{t.waitlist.toLocaleString("en-US")} deposits</dd>
              <dt>Suites and clubs</dt><dd>{pct(churn.plan.premiumRate)} expected to renew</dd>
            </dl>
          )}
          {b.priceLog.length > 0 && (
            <>
              <span className="label">Price changes</span>
              {b.priceLog.slice(0, 6).map((x, i) => <div key={i} className="muted">{shortDate(x.date)}: {x.text}</div>)}
            </>
          )}
        </div>
      </div>
      <Base game={game} />
      <Intelligence game={game} changed={changed} setMsg={setMsg} />
      <div className="panel stack tight">
        <h3>The gate</h3>
        {b.gates.length === 0 ? <p className="muted">No home games yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Game</th><th className="num">Sold</th><th className="num">In the building</th><th className="num">Single-game sold</th><th className="num">Price</th><th>Resale</th><th className="num">Suites used</th><th className="num">Our take</th></tr></thead>
              <tbody>
                {b.gates.map((g) => (
                  <tr key={g.game}>
                    <td>{shortDate(g.date)}</td>
                    <td>{g.type === "PRE" ? "Preseason" : g.type === "POST" ? "Playoffs" : g.tier ? TIER_LABEL[g.tier] : "Regular season"} vs {TEAM_BY_ID[g.opp]?.name ?? g.opp}</td>
                    <td className="num">{g.sold.toLocaleString("en-US")} <span className="muted">({Math.round((g.sold / g.capacity) * 100)}%)</span></td>
                    <td className="num">{g.attendance ? <>{g.attendance.toLocaleString("en-US")} <span className="muted">({(g.noShows ?? 0).toLocaleString("en-US")} no-shows)</span></> : "-"}</td>
                    <td className="num">{g.type === "POST" ? "League gate" : `${g.singleSold.toLocaleString("en-US")} of ${g.singleSeats.toLocaleString("en-US")}`}{g.groups ? <span className="muted"> +{g.groups.toLocaleString("en-US")} groups</span> : null}</td>
                    <td className="num">{g.price ? `$${g.price}` : "-"}{g.dynamic && g.dynamic !== 1 ? <span className="muted"> ({signed(g.dynamic - 1)})</span> : null}</td>
                    <td className="muted">{g.type === "POST" ? "Sold out" : g.resale ? `${g.resale.sold.toLocaleString("en-US")} resold near $${g.resale.price}` : heatWords(g.heat)}</td>
                    <td className="num">{g.premiumUse != null ? pct(g.premiumUse) : "-"}</td>
                    <td className="num">{money(g.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className="muted">
          34% of general ticket money, after a 15% stadium deduction, goes into a league pool shared by all 32 teams; suites and clubs aren't shared.
          Playoff ticket money goes to the league, and the home team keeps what's sold inside the building.
          {acq && acq.added ? ` Finding new ticket buyers cost about ${money(acq.spend / acq.added)} each in ${acq.season}.` : ""}
        </span>
      </div>
    </div>
  );
}

function Base({ game }: { game: GameState }) {
  const t = tix(game);
  const total = t.tenure.long + t.tenure.mid + t.tenure.recent;
  return (
    <div className="panel stack tight">
      <h3>Season-ticket base</h3>
      <dl className="kv">
        <dt>Longtime holders (10+ years)</dt><dd>{t.tenure.long.toLocaleString("en-US")} ({total ? pct(t.tenure.long / total) : "-"})</dd>
        <dt>Mid (4 to 9 years)</dt><dd>{t.tenure.mid.toLocaleString("en-US")}</dd>
        <dt>Newest (1 to 3 years)</dt><dd>{t.tenure.recent.toLocaleString("en-US")}</dd>
        <dt>Waiting list</dt><dd>{t.waitlist.toLocaleString("en-US")} deposits, filled in order when holders drop</dd>
      </dl>
      {t.renewals.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Season</th><th className="num">Longtime</th><th className="num">Mid</th><th className="num">Newest</th><th className="num">Suites and clubs</th><th className="num">From the list</th><th className="num">New sales</th></tr></thead>
            <tbody>{t.renewals.map((r) => (
              <tr key={r.season}><td>{r.season}</td><td className="num">{pct(r.long)}</td><td className="num">{pct(r.mid)}</td><td className="num">{pct(r.recent)}</td><td className="num">{pct(r.premium)}</td><td className="num">{r.waitlist.toLocaleString("en-US")}</td><td className="num">{r.added.toLocaleString("en-US")}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <span className="muted">Premium seats: {Object.values(PREMIUM).map((p) => `${p.label.toLowerCase()} (${pct(p.share)} of the money)`).join(", ")}.</span>
    </div>
  );
}

function Intelligence({ game, changed, setMsg }: { game: GameState; changed: () => void; setMsg: (m: string | null) => void }) {
  const t = tix(game);
  const b = business(game);
  const next = nextHomeGame(game);
  const have = t.research?.season === RULES.season;
  const last = b.gates.find((g) => g.zones);
  return (
    <div className="panel stack tight">
      <h3>Ticket intelligence</h3>
      {!have && (
        <div className="btn-row">
          <span className="muted">A pricing study shows what fans would pay at other prices, by game, and what sponsors and premium buyers would pay. About {money(150_000)} a season.</span>
          <button className="btn small" onClick={() => { setMsg(buyResearch(game) ?? "The study is in."); changed(); }}>Commission the study</button>
        </div>
      )}
      {have && next && (
        <div className="table-wrap">
          <span className="label">Next home game at other single-game prices</span>
          <table>
            <thead><tr><th className="num">Price</th><th className="num">Seats sold</th><th className="num">Ticket money</th></tr></thead>
            <tbody>{demandCurve(game, next).map((r) => (
              <tr key={r.mult}><td className="num">{Math.round(r.mult * 100)}% of market</td><td className="num">{r.sold.toLocaleString("en-US")}</td><td className="num">{money(r.revenue)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {last?.zones && (
        <div className="table-wrap">
          <span className="label">Last home game by zone</span>
          <table>
            <thead><tr><th>Zone</th><th className="num">Single seats sold</th><th className="num">Price</th></tr></thead>
            <tbody>{(Object.keys(ZONES) as Zone[]).map((z, i) => (
              <tr key={z}><td>{ZONES[z].label}</td><td className="num">{last.zones![i].sold.toLocaleString("en-US")} of {last.zones![i].seats.toLocaleString("en-US")}</td><td className="num">${last.zones![i].price}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
