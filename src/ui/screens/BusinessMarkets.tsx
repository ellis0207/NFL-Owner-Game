// Relocation and international growth on the Business page: market
// studies, what leaving would cost, the league's application and vote,
// realignment after a move, and the global markets program with the
// International Player Pathway.
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import {
  answerOffer, applyForRights, gamesAbroad, global, globalSummary, hedge, INTL, joinPathway, LEAGUE_CATEGORIES, marketName, pathwayPlayers, planTrip, rateFor, setActivity, setIntlScouting,
} from "../../engine/global";
import { TEAMS, teamLabel } from "../../engine/league";
import {
  exitCosts, fileRelocation, franchiseMoves, marketById, markets, marketStudy, moveOf, proposeRealign, relocation, relocationFee, windowOpen, withdrawBid,
} from "../../engine/relocation";
import type { GameState } from "../../engine/types";
import { money } from "../format";

const LEVEL = ["None", "Light", "Steady", "Heavy"];

export function Relocation({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const say = (t: string | null) => { setSaid(t); changed(); };
  const r = relocation(game);
  const us = game.userTeam;
  const [pick, setPick] = useState<{ market: string; identity: "keep" | "rename" | "leave"; name: string; staff: "protect" | "minimal"; legacy: boolean }>({ market: "", identity: "keep", name: "", staff: "protect", legacy: true });
  const exit = exitCosts(game);
  const bid = r.bids.find((b) => b.team === us && b.status === "filed");
  const moved = moveOf(game, us);
  const ms = markets(game);
  const chosen = pick.market ? marketById(game, pick.market) : undefined;
  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      <section className="panel stack tight">
        <h3>Markets</h3>
        <span className="muted">A move needs a market study, an application between January 1 and February 15, a review by the league's relocation committee, and {24} owners' votes at the annual meeting. The league charges a relocation fee paid over ten years. Owners look for proof the club tried to stay.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Market</th><th className="num">Metro (M)</th><th>Venue</th><th className="num">Study</th><th></th></tr></thead>
          <tbody>{ms.map((m) => {
            const st = r.studies.find((x) => x.market === m.id);
            return (
              <tr key={m.id}><td>{m.city}{m.incumbent ? ` (second team, with the ${teamLabel(m.incumbent)})` : `, ${m.region}`}</td><td className="num">{m.pop.toFixed(1)}</td>
                <td>{m.venue.name}{m.venue.ready ? "" : " (temporary)"}</td><td className="num">{st ? `${Math.round(st.score * 100)}` : "-"}</td>
                <td><button className="btn small" onClick={() => say(marketStudy(game, m.id))}>{st ? "Restudy" : "Study ($1.5M)"}</button>{" "}
                  <button className="btn small" aria-pressed={pick.market === m.id} onClick={() => setPick({ ...pick, market: m.id })}>Consider</button></td></tr>
            );
          })}</tbody>
        </table></div>
        {r.studies.slice(0, 1).map((st) => (
          <div key={st.date + st.market} className="stack tight">
            <strong>{marketById(game, st.market)?.city}: study of {shortDate(st.date)} (score {Math.round(st.score * 100)}, 50 is about even with here)</strong>
            {st.notes.map((n, i) => <span key={i} className="muted">{n}</span>)}
            <span className="muted">Competition for fans: {st.competition.join(", ")}. Revenue the market could support: about {money(st.revenue)} a year.</span>
          </div>
        ))}
      </section>
      <section className="panel stack tight">
        <h3>Leaving</h3>
        {exit.lines.map((l, i) => <span key={i}>{l}</span>)}
        {game.construction?.exploreRelocation && <span className="muted">We said publicly on {shortDate(game.construction.exploreRelocation)} that other markets are an option.</span>}
        {bid ? (
          <div className="stack tight">
            <span>Our application to move to {marketById(game, bid.market)?.city} is with the league; the owners vote {shortDate(bid.voteDate)}.</span>
            {bid.review && <span className="muted">{bid.review.text}</span>}
            <div className="btn-row"><button className="btn small" onClick={() => say(withdrawBid(game))}>Withdraw the application</button></div>
          </div>
        ) : chosen ? (
          <div className="stack tight">
            <strong>Apply to move to {chosen.city}</strong>
            <span className="muted">Relocation fee about {money(relocationFee(game, chosen))}, paid over ten years, plus moving costs. Local sponsor and media deals end and get rebid there.</span>
            <label className="field"><span className="label">Identity</span>
              <select value={pick.identity} onChange={(x) => setPick({ ...pick, identity: x.target.value as typeof pick.identity })}>
                <option value="keep">Keep the name and colors{exit.trademark ? ` (settlement about ${money(exit.trademark)})` : ""}</option>
                <option value="rename">A new name and look</option>
                <option value="leave">Leave the name and colors with the old city</option>
              </select>
            </label>
            {pick.identity !== "keep" && <label className="field"><span className="label">New name</span><input value={pick.name} onChange={(x) => setPick({ ...pick, name: x.target.value })} /></label>}
            <label className="field"><span className="label">Staff</span>
              <select value={pick.staff} onChange={(x) => setPick({ ...pick, staff: x.target.value as typeof pick.staff })}>
                <option value="protect">Relocation packages and job protections</option>
                <option value="minimal">The legal minimum</option>
              </select>
            </label>
            <label><input type="checkbox" checked={pick.legacy} onChange={(x) => setPick({ ...pick, legacy: x.target.checked })} /> Keep the ring of honor and alumni events in the old city</label>
            <div className="btn-row">
              <button className="btn primary small" disabled={!windowOpen(game.date)} onClick={() => say(fileRelocation(game, chosen.id, pick))}>File the application</button>
              {!windowOpen(game.date) && <span className="muted">Applications open January 1.</span>}
            </div>
          </div>
        ) : <span className="muted">Pick a market above to see what a move there would take.</span>}
      </section>
      {moved && (
        <section className="panel stack tight">
          <h3>After the move</h3>
          <span>We moved from {moved.fromCity} to {moved.toCity} for the {moved.season} season. {r.feeYears > 0 ? `${money(r.feeLeft)} of the relocation fee is still owed over ${r.feeYears} years.` : ""}</span>
          <label className="field"><span className="label">Ask the owners to swap divisions with</span>
            <select defaultValue="" onChange={(x) => x.target.value && say(proposeRealign(game, x.target.value))}>
              <option value="">Choose a club</option>
              {TEAMS.filter((t) => t.id !== us).map((t) => <option key={t.id} value={t.id}>{teamLabel(t.id)}</option>)}
            </select>
          </label>
          {r.realign.map((x, i) => <span key={i} className="muted">Realignment with the {teamLabel(x.with)}: {x.status}{x.yes !== undefined ? ` (${x.yes} votes)` : ""}.</span>)}
        </section>
      )}
      {r.moves.length > 0 && (
        <section className="panel stack tight">
          <h3>Moves around the league</h3>
          {r.moves.map((m, i) => <span key={i}>{m.season}: the {m.fromCity} {m.fromName} became the {m.toCity} {m.toName} (relocation fee {money(m.fee)}).</span>)}
        </section>
      )}
      {r.log.slice(0, 5).map((x, i) => <span key={i} className="muted">{shortDate(x.date)}: {x.text}</span>)}
      {franchiseMoves(game, us).length === 0 && <span className="muted">The franchise's records and history stay with it wherever it plays.</span>}
    </div>
  );
}

export function International({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const say = (t: string | null) => { setSaid(t); changed(); };
  const g = global(game);
  const [want, setWant] = useState<string[]>([]);
  const sum = globalSummary(game);
  const trips = gamesAbroad(game);
  const ours = pathwayPlayers(game);
  return (
    <div className="stack">
      {said && <p className="notice">{said}</p>}
      <section className="panel stack tight">
        <h3>Global markets</h3>
        <span className="muted">The league grants clubs marketing rights in up to three countries for five years (applications September to November, decided December 15). Building an audience abroad takes years; costs come first. {LEAGUE_CATEGORIES.join(", ")} sponsorships stay with the league's partners.</span>
        <span>So far: {money(sum.cost)} spent, {money(sum.income)} earned, about {sum.fans.toLocaleString("en-US")} fans in {sum.markets} market{sum.markets === 1 ? "" : "s"}.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Market</th><th className="num">People (M)</th><th>Other clubs</th><th>Currency</th><th></th></tr></thead>
          <tbody>{INTL.map((m) => {
            const held = g.rights.some((x) => x.market === m.id);
            return (
              <tr key={m.id}><td>{m.name}</td><td className="num">{m.pop}</td><td>{g.others[m.id]?.length ?? 0}</td><td>{m.currency} {rateFor(game, m.currency).toFixed(m.fx < 0.1 ? 4 : 2)}</td>
                <td>{held ? "Ours" : <label><input type="checkbox" checked={want.includes(m.id)} onChange={(x) => setWant(x.target.checked ? [...want, m.id] : want.filter((w) => w !== m.id))} /> Apply</label>}</td></tr>
            );
          })}</tbody>
        </table></div>
        <div className="btn-row">
          <button className="btn small" disabled={!want.length} onClick={() => say(applyForRights(game, want))}>Apply for rights</button>
          <button className="btn small" disabled={!g.rights.length} onClick={() => say(hedge(game))}>Lock exchange rates for a year</button>
          {g.application && <span className="muted">Applied {shortDate(g.application.date)}{g.application.decided ? `; granted ${g.application.granted?.map(marketName).join(", ") || "none"}` : ""}.</span>}
        </div>
      </section>
      {g.rights.map((r) => {
        const h = r.history[0];
        return (
          <section key={r.market} className="panel stack tight">
            <h3>{marketName(r.market)} (through {r.until})</h3>
            <span>{r.fans.toLocaleString("en-US")} fans, engagement {r.engagement}{h ? `; about ${h.viewers.toLocaleString("en-US")} watch our games, ${h.buyers.toLocaleString("en-US")} bought gear, ${h.repeat}% come back to events` : ""}.</span>
            <div className="btn-row">
              <label className="field"><span className="label">Local-language content</span>
                <select value={r.content} onChange={(x) => say(setActivity(game, r.market, { content: Number(x.target.value) }))}>{LEVEL.map((l, i) => <option key={i} value={i}>{l}</option>)}</select></label>
              <label className="field"><span className="label">Fan events and youth programs</span>
                <select value={r.events} onChange={(x) => say(setActivity(game, r.market, { events: Number(x.target.value) }))}>{LEVEL.map((l, i) => <option key={i} value={i}>{l}</option>)}</select></label>
              <label><input type="checkbox" checked={r.merch} onChange={(x) => say(setActivity(game, r.market, { merch: x.target.checked }))} /> Merchandise through the league's licensee</label>
            </div>
          </section>
        );
      })}
      {g.offer && (
        <section className="panel stack tight">
          <strong>{g.offer.partner} ({g.offer.cat}) offers {Math.round(g.offer.value).toLocaleString("en-US")} {INTL.find((m) => m.id === g.offer!.market)?.currency} a year for {g.offer.years} years in {marketName(g.offer.market)}.</strong>
          <div className="btn-row">
            <button className="btn small" onClick={() => say(answerOffer(game, true))}>Sign</button>
            <button className="btn small" onClick={() => say(answerOffer(game, false))}>Pass</button>
          </div>
        </section>
      )}
      {g.deals.map((d, i) => <span key={i} className="muted">{d.partner} in {marketName(d.market)} since {shortDate(d.start)}, {d.years} years.</span>)}
      {trips.length > 0 && (
        <section className="panel stack tight">
          <h3>Games abroad</h3>
          {trips.map((t) => (
            <div key={t.id} className="btn-row">
              <span>{shortDate(t.date)} in {t.city}</span>
              <select value={g.trips[t.id] ?? "standard"} onChange={(x) => say(planTrip(game, t.id, x.target.value as "standard" | "full"))}>
                <option value="standard">Standard trip</option>
                <option value="full">Full program: fan festival, media, community (about $1.5M)</option>
              </select>
            </div>
          ))}
        </section>
      )}
      <section className="panel stack tight">
        <h3>International Player Pathway</h3>
        <span className="muted">Each spring the league places a few overseas athletes with clubs; each gets a practice-squad spot that doesn't count against the limit. Clubs that take part and scout abroad can ask for one.</span>
        <div className="btn-row">
          <label><input type="checkbox" checked={g.pathway.joined} onChange={(x) => { joinPathway(game, x.target.checked); say(null); }} /> Take part (about $300K a year)</label>
          <label className="field"><span className="label">International scouting</span>
            <select value={g.pathway.scouting} onChange={(x) => { setIntlScouting(game, Number(x.target.value)); say(null); }}>
              <option value={0}>None</option><option value={1}>A regional scout ($500K)</option><option value={2}>A small department ($1.2M)</option>
            </select></label>
        </div>
        {ours.map((p) => <span key={p.id}>{p.year}: {p.name}, {p.position}, from {p.country}.</span>)}
      </section>
    </div>
  );
}
