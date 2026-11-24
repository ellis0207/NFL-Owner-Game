import { cashSpending } from "../../engine/bonuses";
import { termsFor } from "../../engine/cbaterms";
import { incentiveAdjustment } from "../../engine/incentives";
import { capHit, capSummary, deadMoney, practiceSquadCapHit, teamPlayerIds } from "../../engine/cap";
import { leagueYear, salaryCap } from "../../engine/contracts";
import { BASE_SEASON, PLAYER_BY_ID } from "../../engine/league";
import { isOffseason, NEXT } from "../../engine/offseason";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { CapTools } from "./CapTools";
import { Help } from "../Help";
import { tip } from "../tip";
import { useUi } from "../ui";
import { Dials, Donut, Gauge, Stacked } from "../gfx";
import { Meter } from "../kit";

export function CapScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const team = game.userTeam;
  // After the Super Bowl the owner plans for next season's cap.
  const year = isOffseason(game.date) ? NEXT : leagueYear(game.date);
  const set = !!game.league?.caps[year] || year === BASE_SEASON;
  const cap = capSummary(game, team, year);
  const ids = teamPlayerIds(game, team);
  const top = [...ids].filter((id) => game.players[id].status !== "ps").sort((a, b) => capHit(b, year, game) - capHit(a, year, game)).slice(0, 15);
  const nextYear = ids.reduce((sum, id) => sum + capHit(id, year + 1, game), 0) + deadMoney(game, team, year + 1);
  const off = game.settings.capRules === "off";
  // The cap by position group, for the stacked bar.
  const GROUPS: [string, string[]][] = [["QB", ["QB"]], ["Backs", ["RB", "FB"]], ["Receivers", ["WR", "TE"]], ["O-line", ["OT", "OG", "C"]], ["D-line", ["EDGE", "IDL"]], ["Linebackers", ["LB"]], ["Secondary", ["CB", "S"]], ["Specialists", ["K", "P", "LS"]]];
  const groups = GROUPS.map(([label, ps]) => ({ label, value: ids.filter((id) => ps.includes(PLAYER_BY_ID[id].position)).reduce((t, id) => t + capHit(id, year, game), 0) }));

  return (
    <section className="stack rb-ledger">
      {off && <p className="notice">Real salary cap rules are off in this game. Figures are shown for reference only.</p>}
      <div className="split">
        <div className="panel stack">
          <Donut size={150} center={<span style={{ display: "grid" }}><span className={cap.space < 0 ? "bad" : "good"}>{money(cap.space)}</span><span className="muted" style={{ fontSize: "0.65rem" }}>SPACE</span></span>}
            parts={[
              { label: "Players", value: cap.players, text: money(cap.players), color: "var(--team)" },
              { label: "Dead money", value: cap.dead, text: money(cap.dead), color: "var(--bad)" },
              { label: "Space", value: Math.max(0, cap.space), text: money(cap.space), color: "var(--good)" },
            ]} />
          <Stacked label="Cap by position group" parts={groups.map((g) => ({ label: g.label, value: g.value, text: money(g.value) }))} />
          <dl className="kv">
            <dt>{year} adjusted cap</dt><dd>{money(cap.limit)}</dd>
            {incentiveAdjustment(game, team, year) !== 0 && <><dt>Incentive settlement</dt><dd className={incentiveAdjustment(game, team, year) < 0 ? "bad" : "good"}>{money(incentiveAdjustment(game, team, year))}</dd></>}
            <dt>Players</dt><dd {...tip("cap", team, year)}>{money(cap.players)}</dd>
            <dt>Dead money <Help k="deadMoney" /></dt><dd>{money(cap.dead)}</dd>
            <dt>Cap space <Help k="capSpace" /></dt><dd className={cap.space < 0 ? "bad" : "good"} {...tip("cap", team, year)}>{money(cap.space)}</dd>
          </dl>
          <span className="muted">
            {cap.rule === "top51"
              ? "Offseason accounting: only the 51 largest cap hits count until the regular season starts."
              : `Regular-season accounting: everyone on the 53 counts, and practice squad players count at ${money(practiceSquadCapHit())} each.`}
            {" "}League cap: {money(salaryCap(game, year))}{set ? "" : " (projected; the league sets it in late February)"}. Your adjusted cap includes money carried over from {year - 1}, and the credit or charge from {year - 1}'s incentives once the season is settled.
          </span>
        </div>
        <div className="panel stack">
          <h3>Looking ahead</h3>
          <Dials>
            <Gauge value={nextYear / Math.max(1, salaryCap(game, year + 1))} label={`${year + 1} committed`} text={money(nextYear)} sub={`of about ${money(salaryCap(game, year + 1))}`} tone={nextYear > salaryCap(game, year + 1) ? "bad" : undefined} />
            <Gauge value={deadMoney(game, team, year + 1) / Math.max(1, salaryCap(game, year + 1))} label={`${year + 1} dead money`} text={money(deadMoney(game, team, year + 1))} tone="bad" />
          </Dials>
          <dl className="kv">
            <dt>{year + 1} commitments</dt><dd>{money(nextYear)}</dd>
            <dt>{year + 1} dead money</dt><dd>{money(deadMoney(game, team, year + 1))}</dd>
          </dl>
          <span className="muted">The {year + 1} cap hasn't been set yet. Projection: {money(salaryCap(game, year + 1))}.</span>
          {(() => {
            const c = cashSpending(game, team);
            if (leagueYear(game.date) < c.from) return <span className="muted">The CBA's cash spending floor ({Math.round(termsFor(c.to).cashFloor * 100)}% of the salary caps, paid in cash over four years) counts from {c.from} to {c.to}.</span>;
            const due = c.floor / Math.max(1, Math.min(c.to, leagueYear(game.date)) - c.from + 1) * (Math.min(c.to, leagueYear(game.date)) - c.from + 1);
            return <><Meter value={c.paid / Math.max(1, due)} label={`Cash floor ${c.from}-${c.to}: ${money(c.paid)} paid of about ${money(due)} so far`} tone={c.paid >= due ? "good" : "warn"} /><span className="muted">Cash spending {c.from}-{c.to}: {money(c.paid)} paid to players so far. The CBA requires at least {Math.round(termsFor(c.to).cashFloor * 100)}% of the period's four salary caps in cash, about {money(c.floor / Math.max(1, Math.min(c.to, leagueYear(game.date)) - c.from + 1))} a season; a shortfall is paid to the players after {c.to}. Salaries are paid weekly through the season, so the count climbs until January.</span></>;
          })()}
        </div>
      </div>
      <h3>Biggest cap hits</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">{year} cap hit</th><th className="num">Share of cap</th><th className="num">{year + 1}</th></tr></thead>
          <tbody>
            {top.map((id) => (
              <tr key={id}>
                <td className="name"><button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button></td>
                <td><span className="gx-pos">{PLAYER_BY_ID[id].position}</span></td>
                <td className="num">{money(capHit(id, year, game))}</td>
                <td className="num"><span className="rb-share"><span style={{ width: `${Math.min(100, (capHit(id, year, game) / cap.limit) * 100 * 5)}%` }} /></span>{((capHit(id, year, game) / cap.limit) * 100).toFixed(1)}%</td>
                <td className="num">{capHit(id, year + 1, game) ? money(capHit(id, year + 1, game)) : "Free agent"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CapTools game={game} changed={changed} />
    </section>
  );
}
