import { useState } from "react";
import { teamPlayerIds } from "../../engine/cap";
import { dealOf, dealYearsLeft, leagueYear, projectedCap } from "../../engine/contracts";
import { ageOn, shortDate } from "../../engine/dates";
import { cashNextYear, cashPaid, REVENUE_ESTIMATE } from "../../engine/finance";
import { regrade } from "../../engine/grades";
import { PLAYER_BY_ID, PLAYERS, TEAM_BY_ID } from "../../engine/league";
import { franchiseTag, rfaTender, TAG_GROUP, transitionTag, type TagGroup } from "../../engine/market";
import { extensionEligibility, startYearFor } from "../../engine/negotiation";
import { teamValue } from "../../engine/market";
import type { GameState, Position } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";

type Tab = "talks" | "extensions" | "league" | "ours" | "market";
const TABS: [Tab, string][] = [["talks", "Our talks"], ["extensions", "Extension candidates"], ["league", "League deals"], ["ours", "Our deals"], ["market", "Market"]];

const GROUP_POS: Record<TagGroup, Position> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", OL: "OT", DE: "EDGE", DT: "IDL", LB: "LB", CB: "CB", S: "S", ST: "K" };
const GROUP_NAME: Record<TagGroup, string> = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", OL: "Offensive line", DE: "Defensive end", DT: "Defensive tackle", LB: "Linebacker", CB: "Cornerback", S: "Safety", ST: "Kicker / punter" };

export function ContractsScreen({ game }: { game: GameState }) {
  const [tab, setTab] = useState<Tab>("talks");
  const ui = useUi();
  const us = game.userTeam;
  const year = leagueYear(game.date);
  const talks = Object.values(game.negotiations).filter((n) => n.team === us)
    .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.opened.localeCompare(a.opened));

  return (
    <section className="stack">
      <h2>Contracts</h2>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "talks" && (
        talks.length === 0
          ? <p className="muted">No contract talks yet. Open talks from a player's page or from Extension candidates.</p>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Player</th><th>Pos</th><th>Opened</th><th>Status</th><th>At the table</th><th>Latest</th></tr></thead>
                <tbody>
                  {talks.map((n) => {
                    const last = n.rounds[n.rounds.length - 1];
                    const status = n.status === "agreed" ? "Signed" : n.status === "ended" ? "Ended" : n.pending ? `Waiting on agent${n.replyOn ? ` (by ${shortDate(n.replyOn)})` : ""}` : last.from === "agent" ? "Our move" : "Open";
                    return (
                      <tr key={n.player} className="clickable" onClick={() => ui.openTalks(n.player)}>
                        <td className="name">{PLAYER_BY_ID[n.player].name}</td>
                        <td>{PLAYER_BY_ID[n.player].position}</td>
                        <td>{shortDate(n.opened)}</td>
                        <td>{status}</td>
                        <td>{n.handler === "gm" ? "GM" : "You"}</td>
                        <td className="num">{money(last.terms.total / last.terms.years)}/yr · {last.terms.years} yrs</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {tab === "extensions" && <Extensions game={game} />}

      {tab === "league" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Player</th><th>Team</th><th className="num">Years</th><th className="num">Total</th><th className="num">Per year</th><th className="num">Guaranteed</th><th>Grades</th></tr></thead>
            <tbody>
              {game.signings.slice(0, 200).map((s) => (
                <tr key={s.id} className="clickable" onClick={() => ui.openPlayer(s.player)}>
                  <td>{shortDate(s.date)}</td>
                  <td className="name">{PLAYER_BY_ID[s.player].name} <span className="muted">{PLAYER_BY_ID[s.player].position}</span></td>
                  <td>{s.team}</td>
                  <td className="num">{s.years}</td><td className="num">{money(s.total)}</td><td className="num">{money(s.apy)}</td><td className="num">{money(s.guaranteed)}</td>
                  <td title={s.grades.map((g) => `${g.outlet}: ${g.grade}. ${g.take}`).join("\n")}>{s.grades.map((g) => g.grade).join(" · ")}</td>
                </tr>
              ))}
              {game.signings.length === 0 && <tr><td colSpan={8} className="muted">No new contracts signed yet this season.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "ours" && <OurDeals game={game} />}

      {tab === "market" && (
        <div className="split">
          <div className="stack tight">
            <h3>{year + 1} tags and tenders (projected)</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Position</th><th className="num">Franchise</th><th className="num">Transition</th></tr></thead>
                <tbody>
                  {(Object.keys(GROUP_POS) as TagGroup[]).map((g) => (
                    <tr key={g}><td>{GROUP_NAME[g]}</td><td className="num">{money(franchiseTag(game, GROUP_POS[g], year + 1))}</td><td className="num">{money(transitionTag(game, GROUP_POS[g], year + 1))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="muted">
              RFA tenders: first round {money(rfaTender(game, "first", year + 1))}, second round {money(rfaTender(game, "second", year + 1))}, right of first refusal {money(rfaTender(game, "original", year + 1))}.
              {" "}The league projects a {year + 1} cap of about {money(projectedCap(year + 1))}; the real number is set in late February.
            </span>
          </div>
          <TopContracts game={game} />
        </div>
      )}

      <div className="panel stack tight">
        <h3>Cash</h3>
        <dl className="kv">
          <dt>Paid to players in {year}</dt><dd>{money(cashPaid(game, us, year))}</dd>
          <dt>Owed in {year + 1} under current deals</dt><dd>{money(cashNextYear(game, us))}</dd>
          <dt>Estimated team revenue</dt><dd>{money(REVENUE_ESTIMATE[us])} a year</dd>
        </dl>
        <span className="muted">Cash is not the cap: signing bonuses are paid when the deal is signed even though the cap spreads them over up to five years. Revenue is a public estimate until the business side is built.</span>
      </div>
    </section>
  );
}

function Extensions({ game }: { game: GameState }) {
  const ui = useUi();
  const us = game.userTeam;
  const year = leagueYear(game.date);
  const rows = teamPlayerIds(game, us)
    .filter((id) => game.players[id].status !== "ps")
    .map((id) => ({ id, deal: dealOf(game, id), elig: extensionEligibility(game, id) }))
    .filter((r) => r.deal && dealYearsLeft(r.deal, year) <= 2)
    .map((r) => ({ ...r, value: teamValue(game, us, r.id, startYearFor(game, r.id, "extension")) }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="stack tight">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">Years left</th><th className="num">Current per year</th><th className="num">GM's value</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ id, deal, elig, value }) => {
              const n = game.negotiations[id];
              const status = n?.team === us ? (n.status === "open" ? "In talks" : n.status === "agreed" ? "Signed" : "Talks ended") : elig.ok ? "Eligible" : elig.reason;
              return (
                <tr key={id} className="clickable" onClick={() => ui.openTalks(id)}>
                  <td className="name">{PLAYER_BY_ID[id].name}{game.players[id].holdout ? <span className="pill inj" style={{ marginLeft: 6 }}>{game.players[id].holdout!.kind === "holdout" ? "Holdout" : "Hold-in"}</span> : null}</td>
                  <td>{PLAYER_BY_ID[id].position}</td>
                  <td className="num">{ageOn(PLAYER_BY_ID[id].birthDate, game.date) ?? ""}</td>
                  <td className="num">{dealYearsLeft(deal, year)}</td>
                  <td className="num">{money(deal!.apy)}</td>
                  <td className="num">{money(Math.round(value / 500_000) * 500_000)}</td>
                  <td className={elig.ok ? undefined : "muted"}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="muted">Players with two or fewer years left. GM's value is what your GM thinks a new deal is worth to us, only as good as the GM's eye.</span>
    </div>
  );
}

function OurDeals({ game }: { game: GameState }) {
  const ui = useUi();
  const mine = game.signings.filter((s) => s.team === game.userTeam);
  const year = leagueYear(game.date);
  const dead = Object.entries(game.deadMoney[game.userTeam] ?? {}).sort();
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Signed</th><th>Player</th><th className="num">Years</th><th className="num">Per year</th><th>Grades at signing</th><th>Public view now</th></tr></thead>
          <tbody>
            {mine.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => ui.openPlayer(s.player)}>
                <td>{shortDate(s.date)}</td>
                <td className="name">{PLAYER_BY_ID[s.player].name}</td>
                <td className="num">{s.years}</td><td className="num">{money(s.apy)}</td>
                <td title={s.grades.map((g) => `${g.outlet}: ${g.take}`).join("\n")}>{s.grades.map((g) => g.grade).join(" · ")}</td>
                <td>{regrade(game, s)}</td>
              </tr>
            ))}
            {mine.length === 0 && <tr><td colSpan={6} className="muted">You haven't signed anyone to a new contract yet. Your record as owner builds here: every deal, how it was graded, and how it looks now.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="stack tight">
        <h3>Dead money</h3>
        <p className="muted">
          {TEAM_BY_ID[game.userTeam].cap2026.deadMoney ? `${money(TEAM_BY_ID[game.userTeam].cap2026.deadMoney)} from moves made before you took over. ` : ""}
          {dead.length ? dead.map(([y, v]) => `${money(v)} in ${y} from your releases`).join("; ") + "." : "None from your own moves yet."}
          {dead.some(([y]) => Number(y) > year) ? " Money pushed into next year is a hangover the next cap has to carry." : ""}
        </p>
      </div>
    </div>
  );
}

function TopContracts({ game }: { game: GameState }) {
  const [pos, setPos] = useState<Position>("QB");
  const list = PLAYERS.filter((p) => p.position === pos)
    .map((p) => ({ p, d: dealOf(game, p.id) }))
    .filter((x) => x.d && x.d.kind !== "rookie" && game.players[x.p.id]?.team)
    .sort((a, b) => b.d!.apy - a.d!.apy).slice(0, 12);
  return (
    <div className="stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3>Top of the market</h3>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position)}>
          {(Object.keys(TAG_GROUP) as Position[]).map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Team</th><th className="num">Per year</th><th className="num">Guaranteed</th><th>Signed</th></tr></thead>
          <tbody>
            {list.map(({ p, d }) => (
              <tr key={p.id}><td className="name">{p.name}</td><td>{game.players[p.id].team}</td><td className="num">{money(d!.apy)}</td><td className="num">{money(d!.guaranteedAtSigning)}</td><td>{d!.signed.slice(0, 4)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
