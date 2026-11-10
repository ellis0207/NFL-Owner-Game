import { useState } from "react";
import {
  answerOffer, billions, BUDGET_LEVELS, business, businessChief, cashBalance, CATEGORY, deptCost, DEPTS, nationalRevenue,
  operatingEstimate, ownerCash, pnl, revenueEstimate, setBudget,
  valuation,
} from "../../engine/business";
import { leagueYear } from "../../engine/contracts";
import { creditLimit, openLoans } from "../../engine/debt";
import { projectedYear } from "../../engine/books";
import { shortDate, weekday } from "../../engine/dates";
import { RULES, TEAM_BY_ID, TEAMS, teamLabel } from "../../engine/league";
import { controlOf, STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../../engine/stadiums";
import { acceptLease, counterLease, lease, leaseSummary, walkAway } from "../../engine/leases";
import type { Dept, GameState, StadiumEvent } from "../../engine/types";
import { money } from "../format";
import { Projects, Sponsors } from "./BusinessDeals";
import { Tickets } from "./BusinessTickets";
import { Fans } from "./BusinessFans";
import { Store } from "./BusinessStore";
import { Media } from "./BusinessMedia";
import { GameDay } from "./BusinessVenue";
import { Buildings } from "./BusinessBuildings";
import { Community } from "./BusinessCommunity";
import { Books, Plan } from "./BusinessBooks";
import { Financing } from "./BusinessFinancing";
import { Journal, Treasury } from "./BusinessTreasury";
import { expectLabel } from "../../engine/review";

const TABS = ["Overview", "Books", "Journal", "Treasury", "Plan", "Financing", "Tickets", "Fans", "Store", "Media", "Game day", "Buildings", "Community", "Stadium", "Sponsors", "Projects", "Budget", "League"] as const;
type Tab = (typeof TABS)[number];

export function BusinessScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const offers = business(game).events.filter((e) => e.status === "offered").length;
  const deals = new Set(business(game).local?.offers.map((o) => o.cat)).size;
  const [tab, setTab] = useState<Tab>(offers ? "Stadium" : "Overview");
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Business</h2>
        <div className="tabs" role="group" aria-label="Business">
          {TABS.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}{t === "Stadium" && offers ? ` (${offers})` : t === "Sponsors" && deals ? ` (${deals})` : ""}</button>
          ))}
        </div>
      </div>
      {tab === "Overview" && <Overview game={game} changed={changed} />}
      {tab === "Books" && <Books game={game} />}
      {tab === "Journal" && <Journal game={game} />}
      {tab === "Treasury" && <Treasury game={game} changed={changed} />}
      {tab === "Plan" && <Plan game={game} changed={changed} />}
      {tab === "Financing" && <Financing game={game} changed={changed} />}
      {tab === "Tickets" && <Tickets game={game} changed={changed} />}
      {tab === "Fans" && <Fans game={game} />}
      {tab === "Store" && <Store game={game} changed={changed} />}
      {tab === "Media" && <Media game={game} changed={changed} />}
      {tab === "Game day" && <GameDay game={game} changed={changed} />}
      {tab === "Buildings" && <Buildings game={game} changed={changed} />}
      {tab === "Community" && <Community game={game} changed={changed} />}
      {tab === "Stadium" && <Stadium game={game} changed={changed} />}
      {tab === "Sponsors" && <Sponsors game={game} changed={changed} />}
      {tab === "Projects" && <Projects game={game} changed={changed} />}
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
            <dt>Credit line</dt><dd>{money(creditLimit(game))}</dd>
            <dt>Loans</dt><dd>{money(openLoans(game).reduce((t, l) => t + l.balance, 0))}{(() => { const n = openLoans(game).slice().sort((x, y) => (x.accelerated ?? x.maturity).localeCompare(y.accelerated ?? y.maturity))[0]; return n ? <span className="muted"> (next due {shortDate(n.accelerated ?? n.maturity)} {(n.accelerated ?? n.maturity).slice(0, 4)})</span> : null; })()}</dd>
            <dt>This year</dt><dd>{(() => { const p = projectedYear(game); return `${money(p.operating)} operating income on ${money(p.revenue)} of revenue, on the current pace`; })()}</dd>
            <dt>Franchise value</dt><dd>{billions(valuation(game, us))} <span className="muted">(Gridiron Ledger estimate)</span></dd>
            <dt>Fans</dt><dd>{fanMood(game.pressure.fans)}</dd>
            {game.review?.expect && game.review.season === RULES.season && <><dt>They expect</dt><dd>About {game.review.expect.wins} wins. {expectLabel(game.review.expect.wins)}.</dd></>}
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
          <Lease game={game} changed={changed} />
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
            <span className="muted">{money(deptCost(d, b.budget[d], leagueYear(game.date)))}{DEPTS[d].perGame ? " a home game" : " a year"}</span>
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

function Lease({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const l = lease(game);
  const summary = leaseSummary(game);
  if (!l || !summary) return null;
  const act = (r: { ok: boolean; text: string }) => { setMsg(r.text); changed(); };
  const t = l.talks;
  return (
    <div className="stack tight">
      <h4 style={{ margin: 0 }}>Our lease</h4>
      <span>{summary}</span>
      {t && (
        <div className="report">
          <strong>Their offer: {t.offer.years} years, {money(t.offer.rent)} a year in rent, {money(t.offer.publicMoney)} in public money for renovations</strong>
          {t.waiting ? <span className="muted">We asked for {t.waiting.ask === "money" ? "more public money" : "a lower rent"}; waiting on their answer.</span> : (
            <div className="btn-row">
              <button className="btn primary small" onClick={() => act(acceptLease(game))}>Sign it</button>
              <button className="btn small" onClick={() => act(counterLease(game, "money"))}>Ask for more public money</button>
              <button className="btn small" onClick={() => act(counterLease(game, "rent"))}>Ask for a lower rent</button>
              <button className="btn small" onClick={() => act(walkAway(game))}>Walk away for this year</button>
            </div>
          )}
          <span className="muted">Pushing can get more, but each push wears on their patience; if they break off, talks wait until next spring.</span>
        </div>
      )}
      {msg && <span className="muted">{msg}</span>}
      {l.log.slice(0, 3).map((x, i) => <span key={i} className="muted">{x.date}: {x.text}</span>)}
    </div>
  );
}
