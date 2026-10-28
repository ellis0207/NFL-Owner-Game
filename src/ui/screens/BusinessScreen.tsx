import { useState } from "react";
import {
  answerOffer, billions, BUDGET_LEVELS, business, businessChief, cashBalance, CATEGORY, CONCESSION_LABEL, CREDIT_LINE, DEPTS, gateForecast, nationalRevenue,
  operatingEstimate, ownerCash, pnl, PRICING_OPENS, RENEWAL_DEADLINE, revenueEstimate, setBudget, setConcessions, setNextSeasonPrices,
  setParking, setSinglePrice, valuation,
} from "../../engine/business";
import { leagueYear } from "../../engine/contracts";
import { shortDate, weekday } from "../../engine/dates";
import { RULES, SCHEDULE, TEAM_BY_ID, TEAMS, teamLabel } from "../../engine/league";
import { controlOf, MARKETS, STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../../engine/stadiums";
import type { ConcessionTier, Dept, GameState, StadiumEvent } from "../../engine/types";
import { money } from "../format";

const TABS = ["Overview", "Tickets", "Stadium", "Budget", "League"] as const;
type Tab = (typeof TABS)[number];

export function BusinessScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const offers = business(game).events.filter((e) => e.status === "offered").length;
  const [tab, setTab] = useState<Tab>(offers ? "Stadium" : "Overview");
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Business</h2>
        <div className="tabs" role="group" aria-label="Business">
          {TABS.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}{t === "Stadium" && offers ? ` (${offers})` : ""}</button>
          ))}
        </div>
      </div>
      {tab === "Overview" && <Overview game={game} changed={changed} />}
      {tab === "Tickets" && <Tickets game={game} changed={changed} />}
      {tab === "Stadium" && <Stadium game={game} changed={changed} />}
      {tab === "Budget" && <Budget game={game} changed={changed} />}
      {tab === "League" && <League game={game} />}
    </section>
  );
}

export function fanMood(fans: number): string {
  return fans >= 70 ? "Fans are fired up about the team." : fans >= 55 ? "Fans are happy with the direction." : fans >= 45 ? "Fans are steady."
    : fans >= 30 ? "Fans are grumbling." : "Fans are angry at the front office.";
}

function Overview({ game, changed }: { game: GameState; changed: () => void }) {
  const years = [...new Set(business(game).ledger.map((e) => e.year))].sort();
  const [year, setYear] = useState(leagueYear(game.date));
  const p = pnl(game, year);
  const cash = cashBalance(game);
  const [msg, setMsg] = useState<string | null>(null);
  const us = game.userTeam;
  const move = (amount: number) => {
    setMsg(ownerCash(game, amount));
    changed();
  };
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>The bank</h3>
          <dl className="kv">
            <dt>Cash</dt><dd className={cash < 0 ? "bad" : undefined}>{money(cash)}{cash < 0 ? " (on the credit line)" : ""}</dd>
            <dt>Credit line</dt><dd>{money(CREDIT_LINE)}</dd>
            <dt>Franchise value</dt><dd>{billions(valuation(game, us))} <span className="muted">(Gridiron Ledger estimate)</span></dd>
            <dt>Fans</dt><dd>{fanMood(game.pressure.fans)}</dd>
          </dl>
          <span className="muted">
            Player contracts are paid in cash, not cap dollars: signing bonuses go out the day a deal is signed. If the team runs through its credit line,
            {game.settings.finances === "relaxed" ? " it's topped up automatically (relaxed finances)." : " you have to put your own money in."}
          </span>
          <div className="btn-row">
            <button className="btn small" onClick={() => move(25_000_000)}>Put in $25M</button>
            <button className="btn small" onClick={() => move(-25_000_000)}>Take out $25M</button>
          </div>
          {msg && <p className="error">{msg}</p>}
        </div>
        <div className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>{year} league year</h3>
            {years.length > 1 && (
              <div className="tabs" role="group" aria-label="League year">
                {years.map((y) => <button key={y} aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
              </div>
            )}
          </div>
          <dl className="kv">
            <dt>Revenue</dt><dd>{money(p.totalRevenue)}</dd>
            <dt>Expenses</dt><dd>{money(p.totalExpenses)}</dd>
            <dt>Operating income</dt><dd className={p.operating < 0 ? "bad" : "good"}>{money(p.operating)}</dd>
          </dl>
          <span className="muted">The league year runs from mid-March to mid-March. Lines marked "before you took over" are the months before you bought the team.</span>
        </div>
      </div>
      <div className="split">
        <Statement title="Revenue" rows={p.revenue} />
        <Statement title="Expenses" rows={p.expenses} />
      </div>
      {p.financing.length > 0 && <Statement title="Other cash" rows={p.financing} />}
      <Ledger game={game} year={year} />
    </div>
  );
}

function Statement({ title, rows }: { title: string; rows: { cat: keyof typeof CATEGORY; amount: number }[] }) {
  return (
    <div className="panel stack tight">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map((r) => <tr key={r.cat}><td>{CATEGORY[r.cat].label}</td><td className="num">{money(Math.abs(r.amount))}{r.amount < 0 && title === "Revenue" ? " out" : ""}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ledger({ game, year }: { game: GameState; year: number }) {
  const [shown, setShown] = useState(25);
  const rows = business(game).ledger.filter((e) => e.year === year).slice().reverse();
  return (
    <div className="panel stack tight">
      <h3>Ledger</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Item</th><th>Detail</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.slice(0, shown).map((e, i) => (
              <tr key={i}>
                <td>{shortDate(e.date)}</td><td>{CATEGORY[e.cat].label}</td><td className="muted">{e.note ?? ""}</td>
                <td className={`num ${e.amount < 0 ? "bad" : "good"}`}>{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && <button className="btn small" onClick={() => setShown(shown + 50)}>Show more</button>}
    </div>
  );
}

function heatWords(heat: number): string {
  return heat >= 1.6 ? "Resale prices are far above face value" : heat >= 1.15 ? "Resale prices are above face value" : heat >= 0.95 ? "Selling out at face value"
    : heat >= 0.7 ? "Some seats will go unsold" : "Lots of seats will go unsold";
}

function Tickets({ game, changed }: { game: GameState; changed: () => void }) {
  const b = business(game);
  const us = game.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const mk = MARKETS[us];
  const ctrl = controlOf(s);
  const next = SCHEDULE.find((g) => g.home === us && !g.neutral && (g.type === "PRE" || g.type === "REG") && g.date >= game.date && !game.results[g.id]);
  const f = next ? gateForecast(game, next) : null;
  const [season, setSeason] = useState(b.next?.season ?? 1.03);
  const [premium, setPremium] = useState(b.next?.premium ?? 1.03);
  const [msg, setMsg] = useState<string | null>(null);
  const offseason = game.date >= PRICING_OPENS;
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>This season</h3>
          <dl className="kv">
            <dt>Season-ticket holders</dt><dd>{b.holders.toLocaleString("en-US")}</dd>
            <dt>Season-ticket price</dt><dd>${mk.ticket} a game on average (locked for {RULES.season})</dd>
            <dt>Stadium</dt><dd>{s.capacity.toLocaleString("en-US")} seats, about {Math.round(s.capacity * 0.12).toLocaleString("en-US")} in suites and clubs</dd>
          </dl>
          <label className="field">
            <span className="label">Single-game prices: {Math.round(b.prices.single * 100)}% of market (about ${Math.round(mk.ticket * 1.2 * b.prices.single)} a seat)</span>
            <input type="range" min={60} max={180} step={5} value={Math.round(b.prices.single * 100)}
              onChange={(e) => { setSinglePrice(game, Number(e.target.value) / 100); changed(); }} aria-label="Single-game price" />
          </label>
          {f && next && (
            <span className="muted">
              Next home game, {shortDate(next.date)} vs {teamLabel(next.home === us ? next.away! : next.home!)}: the ticket office expects about {Math.min(100, Math.round((f.sold / f.capacity) * 100))}% of seats sold. {heatWords(f.heat)}.
            </span>
          )}
          <label className="field">
            <span className="label">Concessions</span>
            <select value={ctrl.concessions ? b.prices.concessions : "standard"} disabled={!ctrl.concessions}
              onChange={(e) => { setConcessions(game, e.target.value as ConcessionTier); changed(); }}>
              {(Object.keys(CONCESSION_LABEL) as ConcessionTier[]).map((t) => <option key={t} value={t}>{CONCESSION_LABEL[t]}</option>)}
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
          <h3>{RULES.season + 1} season tickets</h3>
          {!offseason && <span className="muted">Season-ticket and suite prices for {RULES.season + 1} are set after the regular season ends ({shortDate(PRICING_OPENS)}). Renewals are due {shortDate(RENEWAL_DEADLINE)}.</span>}
          {offseason && !b.renewal && (
            <>
              <label className="field">
                <span className="label">Season tickets: {season >= 1 ? "+" : ""}{Math.round((season - 1) * 100)}%</span>
                <input type="range" min={90} max={125} step={1} value={Math.round(season * 100)} onChange={(e) => setSeason(Number(e.target.value) / 100)} aria-label="Season-ticket change" />
              </label>
              <label className="field">
                <span className="label">Suites and clubs: {premium >= 1 ? "+" : ""}{Math.round((premium - 1) * 100)}%</span>
                <input type="range" min={90} max={125} step={1} value={Math.round(premium * 100)} onChange={(e) => setPremium(Number(e.target.value) / 100)} aria-label="Premium change" />
              </label>
              <button className="btn primary small" onClick={() => { setMsg(setNextSeasonPrices(game, season, premium)); changed(); }}>
                {b.next?.announced ? "Announce new prices" : "Announce prices"}
              </button>
              {b.next?.announced && <span className="muted">Announced {shortDate(b.next.announced)}. Renewals are due {shortDate(RENEWAL_DEADLINE)}; until then you can change them, though fans notice every change.</span>}
              {!b.next?.announced && <span className="muted">If you don't announce anything, prices go up 3%, as they do most years.</span>}
            </>
          )}
          {b.renewal && (
            <dl className="kv">
              <dt>Renewed</dt><dd>{Math.round(b.renewal.rate * 100)}%</dd>
              <dt>Holders next season</dt><dd>{b.renewal.holders.toLocaleString("en-US")}</dd>
            </dl>
          )}
          {msg && <p className="error">{msg}</p>}
          {b.priceLog.length > 0 && (
            <>
              <span className="label">Price changes</span>
              {b.priceLog.slice(0, 6).map((x, i) => <div key={i} className="muted">{shortDate(x.date)}: {x.text}</div>)}
            </>
          )}
        </div>
      </div>
      <div className="panel stack tight">
        <h3>The gate</h3>
        {b.gates.length === 0 ? <p className="muted">No home games yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Game</th><th className="num">Sold</th><th className="num">Single-game sold</th><th className="num">Price</th><th>Market</th><th className="num">Our take</th></tr></thead>
              <tbody>
                {b.gates.map((g) => (
                  <tr key={g.game}>
                    <td>{shortDate(g.date)}</td>
                    <td>{g.type === "PRE" ? "Preseason" : g.type === "POST" ? "Playoffs" : "Regular season"} vs {TEAM_BY_ID[g.opp]?.name ?? g.opp}</td>
                    <td className="num">{g.sold.toLocaleString("en-US")} <span className="muted">({Math.round((g.sold / g.capacity) * 100)}%)</span></td>
                    <td className="num">{g.type === "POST" ? "League gate" : `${g.singleSold.toLocaleString("en-US")} of ${g.singleSeats.toLocaleString("en-US")}`}</td>
                    <td className="num">{g.price ? `$${g.price}` : "-"}</td>
                    <td className="muted">{g.type === "POST" ? "Sold out" : heatWords(g.heat)}</td>
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
        </span>
      </div>
    </div>
  );
}

const BY_LABEL: Record<StadiumEvent["by"], string> = { offer: "Our booking", landlord: "Booked by the operator", partner: "Booked by our partner", fixed: "Annual event", tenant: "Tenant" };

function Stadium({ game, changed }: { game: GameState; changed: () => void }) {
  const us = game.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const ctrl = controlOf(s);
  const b = business(game);
  const [msg, setMsg] = useState<string | null>(null);
  const offers = b.events.filter((e) => e.status === "offered");
  const upcoming = b.events.filter((e) => e.status === "booked" && e.date >= game.date);
  const past = b.events.filter((e) => e.status === "held" || e.status === "refused").slice().reverse();
  const yes = (x: boolean) => (x ? "Yes" : "No");
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>{s.name}</h3>
          <strong>{STRUCTURE_LABEL[s.structure]}</strong>
          <p>{s.note}</p>
          <dl className="kv">
            <dt>Owner</dt><dd>{s.owner}</dd>
            <dt>Operator</dt><dd>{s.operator}</dd>
            {s.partner && <><dt>{s.structure === "tenant" ? "Landlord" : s.structure === "owned" ? "Tenant" : "Partner"}</dt><dd>{teamLabel(s.partner)}</dd></>}
            {s.leaseThrough && <><dt>Lease runs through</dt><dd>{s.leaseThrough} season</dd></>}
            <dt>Seats</dt><dd>{s.capacity.toLocaleString("en-US")} · {s.roof === "open" ? "open air" : s.roof === "dome" ? "dome" : "retractable roof"} · opened {s.opened}</dd>
          </dl>
        </div>
        <div className="panel stack tight">
          <h3>What we control</h3>
          <dl className="kv">
            <dt>Ticket prices</dt><dd>Yes</dd>
            <dt>Concession prices</dt><dd>{yes(ctrl.concessions)}</dd>
            <dt>Parking</dt><dd>{yes(ctrl.parking)}</dd>
            <dt>Booking other events</dt><dd>{{ full: "Yes, any date we're free", partner: `Yes, with the ${s.partner ? TEAM_BY_ID[s.partner].name : "partner"}' sign-off`, approval: "Yes, with the landlord's approval", none: `No, ${s.operator.split(" for ")[0]} books them` }[ctrl.booking]}</dd>
            <dt>Our share of event money</dt><dd>{Math.round(s.eventShare * 100)}%</dd>
            <dt>Game-day concessions and parking</dt><dd>{Math.round(s.gameDayShare * 100)}% of the commission</dd>
            <dt>Naming rights</dt><dd>{s.naming ? `${money(s.naming)} a year, ${Math.round(s.namingShare * 100)}% ours` : "None sold"}</dd>
            <dt>Rent</dt><dd>{s.rent >= 100 ? `${money(s.rent)} a year` : s.rent ? "$1 a year" : "None"}</dd>
            <dt>Upkeep and repairs</dt><dd>{money(s.upkeep)} a year</dd>
            <dt>Stadium debt</dt><dd>{s.debt ? `${money(s.debt)} a year in debt service` : "None"}</dd>
          </dl>
          {s.blackout?.map((x) => <span key={x.from} className="muted">Unavailable {shortDate(x.from)} to {shortDate(x.to)}: {x.what}.</span>)}
          {s.curfew && <span className="muted">A city curfew rules out weeknight concerts.</span>}
        </div>
      </div>
      {ctrl.booking !== "none" && (
        <div className="panel stack tight">
          <h3>Booking requests</h3>
          {offers.length === 0 && <p className="muted">No open requests. Promoters call every week or two; fewer in winter for an open-air stadium.</p>}
          {offers.map((e) => (
            <div key={e.id} className="stack tight">
              <div><strong>{e.name}</strong> <span className="muted">· {weekday(e.date)}, {shortDate(e.date)} · {e.promoter}</span></div>
              <span className="muted">Stadium nets an estimated {money(e.low)} to {money(e.high)}; our share is {Math.round(s.eventShare * 100)}%. Answer by {shortDate(e.expires!)}.</span>
              <div className="btn-row">
                <button className="btn small primary" onClick={() => { setMsg(answerOffer(game, e.id, true)); changed(); }}>Book it</button>
                <button className="btn small" onClick={() => { answerOffer(game, e.id, false); changed(); }}>Pass</button>
              </div>
            </div>
          ))}
          {msg && <p className="error">{msg}</p>}
        </div>
      )}
      <div className="split">
        <div className="panel stack tight">
          <h3>Coming up</h3>
          {upcoming.length === 0 && <p className="muted">Nothing else on the calendar.</p>}
          {upcoming.slice(0, 20).map((e) => (
            <div key={e.id}><strong>{shortDate(e.date)}</strong> {e.name} <span className="muted">· {BY_LABEL[e.by]}</span></div>
          ))}
        </div>
        <div className="panel stack tight">
          <h3>Held</h3>
          {past.length === 0 && <p className="muted">No events yet.</p>}
          {past.slice(0, 20).map((e) => (
            <div key={e.id}>
              <strong>{shortDate(e.date)}</strong> {e.name}{" "}
              <span className="muted">· {e.status === "refused" ? e.note : `stadium netted ${money(e.net ?? 0)}, ${e.ours ? `${money(e.ours)} to us` : "nothing to us"}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Budget({ game, changed }: { game: GameState; changed: () => void }) {
  const b = business(game);
  return (
    <div className="stack">
      <p className="muted">Department budgets for the year, set with {businessChief(game).split(",")[0]}. Changes take effect from next month (game-day spending, from the next home game).</p>
      {(Object.keys(DEPTS) as Dept[]).map((d) => (
        <div key={d} className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>{DEPTS[d].label}</strong>
            <span className="muted">{money(DEPTS[d].cost[b.budget[d]])}{DEPTS[d].perGame ? " a home game" : " a year"}</span>
          </div>
          <span className="muted">{DEPTS[d].what}</span>
          <div className="tabs" role="group" aria-label={DEPTS[d].label}>
            {BUDGET_LEVELS.map((label, i) => (
              <button key={label} aria-pressed={b.budget[d] === i} onClick={() => { setBudget(game, d, i); changed(); }}>{label}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function League({ game }: { game: GameState }) {
  const rows = TEAMS.map((t) => ({ t, s: STADIUM_BY_TEAM[t.id], rev: revenueEstimate(game, t.id), op: operatingEstimate(game, t.id), value: valuation(game, t.id) }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="stack">
      <p className="muted">Public estimates from business reporters, not the teams' books. Revenue includes each team's {money(nationalRevenue(leagueYear(game.date)))} share of national revenue.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Stadium</th><th>Ownership</th><th className="num">Revenue</th><th className="num">Operating income</th><th className="num">Value</th></tr></thead>
          <tbody>
            {rows.map(({ t, s, rev, op, value }) => (
              <tr key={t.id} style={t.id === game.userTeam ? { fontWeight: 700 } : undefined}>
                <td>{t.city} {t.name}</td><td>{s.name}</td><td className="muted">{STRUCTURE_LABEL[s.structure]}</td>
                <td className="num">{money(rev)}</td><td className="num">{money(op)}</td><td className="num">{billions(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
