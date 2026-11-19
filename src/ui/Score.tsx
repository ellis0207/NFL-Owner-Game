import { kickoff } from "../engine/dates";
import { GAME_BY_ID } from "../engine/league";
import { gameTypeLabel } from "../engine/season";
import { matchup } from "../engine/standings";
import type { GameState } from "../engine/types";
import { useUi } from "./ui";
import { tip } from "./tip";
import { TEAM_COLORS } from "../engine/teamColors";
import { liveGame, liveRows } from "../engine/clock";
import { castAt } from "../engine/gamecast";

/** A sliver of the club color beside its name on a score tile. */
const swatch = (team: string) => ({ ["--sw" as string]: TEAM_COLORS[team]?.[0] ?? "transparent" });

export function Score({ game, id }: { game: GameState; id: string }) {
  const ui = useUi();
  const g = GAME_BY_ID[id];
  const r = game.results[id];
  const m = matchup(game, g);
  if (!m) return null;
  // Under way: the score and clock as far as the game has run.
  const log = game.pbp?.[id];
  if (!r && liveGame(game, id) && log) {
    const c = castAt(log, liveRows(game, id) ?? 0);
    const when = c.at === 0 ? "Kickoff" : `${c.q <= 4 ? `Q${c.q}` : c.q === 5 ? "OT" : `${c.q - 4}OT`} ${Math.floor(c.clock / 60)}:${String(Math.round(c.clock) % 60).padStart(2, "0")}`;
    return (
      <button className="score clickable live" {...tip("game", id)} onClick={() => ui.openBox(id)} aria-label={`Live: ${m.away} ${c.away}, ${m.home} ${c.home}, ${when}`}>
        <div className="row" style={swatch(m.away)}><span>{m.away}</span><span>{c.away}</span></div>
        <div className="row" style={swatch(m.home)}><span>{g.neutral ? m.home : `@${m.home}`}</span><span>{c.home}</span></div>
        <div className="meta"><span className="pill">Live</span> {when} · {g.label ?? gameTypeLabel(g)}</div>
      </button>
    );
  }
  const awayWin = r && r.awayScore > r.homeScore;
  const homeWin = r && r.homeScore > r.awayScore;
  const body = (
    <>
      <div className={`row ${awayWin ? "win" : ""}`} style={swatch(m.away)}><span {...tip("team", m.away)}>{m.away}</span><span>{r ? r.awayScore : ""}</span></div>
      <div className={`row ${homeWin ? "win" : ""}`} style={swatch(m.home)}><span {...tip("team", m.home)}>{g.neutral ? m.home : `@${m.home}`}</span><span>{r ? r.homeScore : ""}</span></div>
      <div className="meta">{r ? (r.overtime ? "Final/OT" : "Final") : kickoff(g.timeET)} · {g.label ?? gameTypeLabel(g)}{r && game.box[id] ? " · Box score" : ""}</div>
    </>
  );
  if (r) return <button className="score clickable" {...tip("game", id)} onClick={() => ui.openBox(id)} aria-label={`Box score: ${m.away} ${r.awayScore}, ${m.home} ${r.homeScore}`}>{body}</button>;
  return <div className="score" {...tip("game", id)}>{body}</div>;
}
