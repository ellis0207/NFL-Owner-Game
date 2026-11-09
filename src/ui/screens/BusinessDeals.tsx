import { useState } from "react";
import { leagueYear } from "../../engine/contracts";
import { categories, dealFor, dealValue, localDeals, localIncome, LOCAL_CATS, par, passLocalCategory, signLocalOffer, sponsorHeat } from "../../engine/commerce";
import { dropPartner, INVENTORY, keepPartner, namingIncome, receivables, rightsConflict, sponsorRetention } from "../../engine/sponsors";
import { tix } from "../../engine/ticketing";
import { RULES } from "../../engine/league";
import { shortDate } from "../../engine/dates";
import { PROJECTS, projects, projectTerms, startProject } from "../../engine/projects";
import { STADIUM_BY_TEAM } from "../../engine/stadiums";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function Sponsors({ game, changed }: { game: GameState; changed: () => void }) {
  const l = localDeals(game);
  const year = leagueYear(game.date);
  const income = localIncome(game, year);
  const [msg, setMsg] = useState<string | null>(null);
  const cats = [...new Set(l.offers.map((o) => o.cat))];
  return (
    <div className="stack">
      <p className="muted">
        Local partners pay {money(income.sponsors)} this league year, and local radio and TV {money(income.media)}, counting dozens of smaller partners the sales staff signs.
        Deals rise 3% a year; when one runs out, what companies will pay depends on how the team is doing and how fans feel.
      </p>
      {msg && <p className="notice">{msg}</p>}
      {cats.length > 0 && l.window && (
        <section className="panel stack tight">
          <h3>Offers for {year + 1}</h3>
          <span className="muted">Pick one in each category by {shortDate(l.window.closes)}, or the business staff takes the best one. A long deal locks in today's price.</span>
          {cats.map((c) => (
            <div key={c} className="report">
              <strong>{LOCAL_CATS[c].label}</strong>
              {rightsConflict(game, c, false) && <span className="muted">{rightsConflict(game, c, false)}</span>}
              {l.offers.filter((o) => o.cat === c).map((o) => (
                <div key={o.id} className="btn-row" style={{ justifyContent: "space-between" }}>
                  <span>{o.partner}{o.incumbent ? " (current partner)" : ""}: {money(o.value)} a year for {o.years} years{o.exclusive ? ", exclusive in its category" : ""}</span>
                  <button className="btn small" onClick={() => { setMsg(signLocalOffer(game, o.id) ?? `Signed ${o.partner}.`); changed(); }}>Sign</button>
                </div>
              ))}
              <div><button className="btn small" onClick={() => { passLocalCategory(game, c); setMsg(`We'll leave ${LOCAL_CATS[c].label.toLowerCase()} open for a year.`); changed(); }}>Turn them all down</button></div>
            </div>
          ))}
        </section>
      )}
      <section className="panel stack tight">
        <h3>Our partners</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Partner</th><th className="num">This year</th><th>Through</th><th>Relationship</th><th className="num">Delivered</th></tr></thead>
            <tbody>
              {categories(game).map((c) => {
                const d = dealFor(game, c, year);
                const next = dealFor(game, c, year + 1);
                const del = d?.delivered?.[year] ?? d?.delivered?.[year - 1];
                return (
                  <tr key={c}>
                    <td>{LOCAL_CATS[c].label}{d?.exclusive ? <span className="muted"> (exclusive)</span> : null}</td>
                    <td>{d?.partner ?? <span className="muted">None</span>}{next && next !== d ? <span className="muted">{next.partner === d?.partner ? ` (renewed through ${next.start + next.years - 1})` : ` (then ${next.partner})`}</span> : null}
                      {d?.scandal && (
                        <div className="btn-row"><span className="bad">In the news</span>
                          <button className="btn small" onClick={() => { setMsg(dropPartner(game, c) ?? `We ended the partnership with ${d.partner}.`); changed(); }}>End it</button>
                          <button className="btn small" onClick={() => { keepPartner(game, c); setMsg(`We're standing by ${d.partner}.`); changed(); }}>Stand by them</button>
                        </div>
                      )}
                    </td>
                    <td className="num">{d ? money(c === "naming" ? namingIncome(game, year) : dealValue(d, year)) : "—"}</td>
                    <td>{d ? d.start + d.years - 1 : "—"}</td>
                    <td>{d ? relWord(d.rel ?? 60) : ""}</td>
                    <td className="num">{del != null ? `${Math.round(del * 100)}%` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <span className="muted">League years run from March to March. Exclusive partners pay about a fifth more, but they keep their rivals out, and with them some smaller deals. "Delivered" is the crowds, audiences and hospitality the partner got against what the deal promised; short of 93% we owe make-goods. Partner companies and stations are made up.</span>
      </section>
      <div className="split">
        <section className="panel stack tight">
          <h3>What we sell</h3>
          {INVENTORY.filter((x) => x.cats.some((c) => categories(game).includes(c))).map((x) => {
            const sold = x.cats.filter((c) => dealFor(game, c, year)).length;
            const of = x.cats.filter((c) => categories(game).includes(c)).length;
            return <div key={x.asset}>{x.asset} <span className="muted">({sold} of {of} sold)</span></div>;
          })}
          {!categories(game).includes("naming") && <span className="muted">The stadium's name isn't ours to sell at {STADIUM_BY_TEAM[game.userTeam].name}.</span>}
        </section>
        <section className="panel stack tight">
          <h3>Accounts</h3>
          <span>Fees billed and not yet paid: {money(receivables(game).reduce((a, r) => a + r.amount + r.overdue, 0))}{receivables(game).some((r) => r.overdue) ? `, ${money(receivables(game).reduce((a, r) => a + r.overdue, 0))} of it late` : ""}.</span>
          {sponsorRetention(game).slice(0, 5).map((r) => (
            <div key={r.year} className="muted">{r.year}: {r.renewed} of {r.up} expiring partners renewed; the categories went from {money(r.before)} to {money(r.after)} a year.</div>
          ))}
          {tix(game).research?.season === RULES.season && (
            <>
              <span className="label">What the pricing study says each category is worth now</span>
              {categories(game).map((c) => <div key={c} className="muted">{LOCAL_CATS[c].label}: about {money(par(game, c, year + 1) * sponsorHeat(game))} a year</div>)}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function relWord(r: number): string {
  return r >= 75 ? "Excellent" : r >= 60 ? "Good" : r >= 45 ? "Strained" : "Poor";
}

export function Projects({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const s = STADIUM_BY_TEAM[game.userTeam];
  const ours = projects(game);
  return (
    <div className="stack">
      <p className="muted">
        Improvements to {s.name} and the team facility. Work starts between February and May and is done before the preseason; the biggest jobs take two offseasons.
        Construction is paid from cash (a deposit, then monthly) and doesn't count against operating income.
      </p>
      {msg && <p className="notice">{msg}</p>}
      {PROJECTS.map((p) => {
        const t = projectTerms(game, p.id);
        const mine = ours.find((x) => x.id === p.id);
        return (
          <div key={p.id} className="panel stack tight">
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{p.title}</strong>
              <span className="muted">{money(t.cost)}{t.payer ? `; ${t.payer}` : ""}{p.build === 2 ? ", two offseasons" : ""}</span>
            </div>
            <span className="muted">{p.what}</span>
            {mine ? <span className={mine.opened ? "good" : ""}>{mine.opened ? `Opened ${shortDate(mine.opens)}.` : `Under way: ${money(mine.paid)} of ${money(mine.cost)} paid, opens ${shortDate(mine.opens)}.`}</span>
              : t.blocked ? <span className="muted">{t.blocked}</span>
              : <div><button className="btn small primary" onClick={() => { setMsg(startProject(game, p.id)); changed(); }}>Start it ({money(t.ours)} our share)</button></div>}
          </div>
        );
      })}
    </div>
  );
}
