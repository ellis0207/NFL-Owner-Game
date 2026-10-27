import { kickoff } from "../engine/dates";
import { GAME_BY_ID } from "../engine/league";
import { gameTypeLabel } from "../engine/season";
import { matchup } from "../engine/standings";
import type { GameState } from "../engine/types";

export function Score({ game, id }: { game: GameState; id: string }) {
  const g = GAME_BY_ID[id];
  const r = game.results[id];
  const m = matchup(game, g);
  if (!m) return null;
  const awayWin = r && r.awayScore > r.homeScore;
  const homeWin = r && r.homeScore > r.awayScore;
  return (
    <div className="score">
      <div className={`row ${awayWin ? "win" : ""}`}><span>{m.away}</span><span>{r ? r.awayScore : ""}</span></div>
      <div className={`row ${homeWin ? "win" : ""}`}><span>{g.neutral ? m.home : `@${m.home}`}</span><span>{r ? r.homeScore : ""}</span></div>
      <div className="meta">{r ? (r.overtime ? "Final/OT" : "Final") : kickoff(g.timeET)} · {g.label ?? gameTypeLabel(g)}</div>
    </div>
  );
}
