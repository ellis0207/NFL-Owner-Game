import { capHit, capSummary, deadMoney, practiceSquadCapHit, teamPlayerIds } from "../../engine/cap";
import { leagueYear, salaryCap } from "../../engine/contracts";
import { BASE_SEASON, PLAYER_BY_ID } from "../../engine/league";
import { isOffseason, NEXT } from "../../engine/offseason";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function CapScreen({ game }: { game: GameState }) {
  const team = game.userTeam;
  // After the Super Bowl the owner plans for next season's cap.
  const year = isOffseason(game.date) ? NEXT : leagueYear(game.date);
  const set = !!game.league?.caps[year] || year === BASE_SEASON;
  const cap = capSummary(game, team, year);
  const ids = teamPlayerIds(game, team);
  const top = [...ids].filter((id) => game.players[id].status !== "ps").sort((a, b) => capHit(b, year, game) - capHit(a, year, game)).slice(0, 15);
  const nextYear = ids.reduce((sum, id) => sum + capHit(id, year + 1, game), 0) + deadMoney(game, team, year + 1);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / cap.limit) * 100))}%`;
  const off = game.settings.capRules === "off";

  return (
    <section className="stack">
      <h2>Salary cap</h2>
      {off && <p className="notice">Real salary cap rules are off in this game. Figures are shown for reference only.</p>}
      <div className="split">
        <div className="panel stack">
          <dl className="kv">
            <dt>{year} adjusted cap</dt><dd>{money(cap.limit)}</dd>
            <dt>Players</dt><dd>{money(cap.players)}</dd>
            <dt>Dead money</dt><dd>{money(cap.dead)}</dd>
            <dt>Cap space</dt><dd className={cap.space < 0 ? "bad" : "good"}>{money(cap.space)}</dd>
          </dl>
          <div className="meter" aria-hidden="true">
            <span style={{ width: pct(cap.players), background: "var(--team)" }} />
            <span style={{ width: pct(cap.dead), background: "var(--bad)" }} />
          </div>
          <span className="muted">
            {cap.rule === "top51"
              ? "Offseason accounting: only the 51 largest cap hits count until the regular season starts."
              : `Regular-season accounting: everyone on the 53 counts, and practice squad players count at ${money(practiceSquadCapHit())} each.`}
            {" "}League cap: {money(salaryCap(game, year))}{set ? "" : " (projected; the league sets it in late February)"}. Your adjusted cap includes money carried over from {year - 1}.
          </span>
        </div>
        <div className="panel stack">
          <h3>Looking ahead</h3>
          <dl className="kv">
            <dt>{year + 1} commitments</dt><dd>{money(nextYear)}</dd>
            <dt>{year + 1} dead money</dt><dd>{money(deadMoney(game, team, year + 1))}</dd>
          </dl>
          <span className="muted">The {year + 1} cap hasn't been set yet. Projection: {money(salaryCap(game, year + 1))}.</span>
        </div>
      </div>
      <h3>Biggest cap hits</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">{year} cap hit</th><th className="num">Share of cap</th><th className="num">{year + 1}</th></tr></thead>
          <tbody>
            {top.map((id) => (
              <tr key={id}>
                <td className="name">{PLAYER_BY_ID[id].name}</td>
                <td>{PLAYER_BY_ID[id].position}</td>
                <td className="num">{money(capHit(id, year, game))}</td>
                <td className="num">{((capHit(id, year, game) / cap.limit) * 100).toFixed(1)}%</td>
                <td className="num">{capHit(id, year + 1, game) ? money(capHit(id, year + 1, game)) : "Free agent"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
