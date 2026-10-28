import { capHit, capSummary, deadMoney, practiceSquadCapHit, teamPlayerIds } from "../../engine/cap";
import { PLAYER_BY_ID, RULES, SEASON } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function CapScreen({ game }: { game: GameState }) {
  const team = game.userTeam;
  const cap = capSummary(game, team);
  const ids = teamPlayerIds(game, team);
  const top = [...ids].filter((id) => game.players[id].status !== "ps").sort((a, b) => capHit(b, SEASON, game) - capHit(a, SEASON, game)).slice(0, 15);
  const nextYear = ids.reduce((sum, id) => sum + capHit(id, SEASON + 1, game), 0) + deadMoney(game, team, SEASON + 1);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / cap.limit) * 100))}%`;
  const off = game.settings.capRules === "off";

  return (
    <section className="stack">
      <h2>Salary cap</h2>
      {off && <p className="notice">Real salary cap rules are off in this game. Figures are shown for reference only.</p>}
      <div className="split">
        <div className="panel stack">
          <dl className="kv">
            <dt>Adjusted cap</dt><dd>{money(cap.limit)}</dd>
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
            {" "}League cap: {money(RULES.salaryCap)}. Your adjusted cap includes money carried over from 2025.
          </span>
        </div>
        <div className="panel stack">
          <h3>Looking ahead</h3>
          <dl className="kv">
            <dt>{SEASON + 1} commitments</dt><dd>{money(nextYear)}</dd>
            <dt>{SEASON + 1} dead money</dt><dd>{money(deadMoney(game, team, SEASON + 1))}</dd>
          </dl>
          <span className="muted">The {SEASON + 1} cap hasn't been set yet.</span>
        </div>
      </div>
      <h3>Biggest cap hits</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">{SEASON} cap hit</th><th className="num">Share of cap</th><th className="num">{SEASON + 1}</th></tr></thead>
          <tbody>
            {top.map((id) => (
              <tr key={id}>
                <td className="name">{PLAYER_BY_ID[id].name}</td>
                <td>{PLAYER_BY_ID[id].position}</td>
                <td className="num">{money(capHit(id, SEASON, game))}</td>
                <td className="num">{((capHit(id, SEASON, game) / cap.limit) * 100).toFixed(1)}%</td>
                <td className="num">{capHit(id, SEASON + 1, game) ? money(capHit(id, SEASON + 1, game)) : "Free agent"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
