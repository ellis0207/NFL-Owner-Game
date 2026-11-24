import { kickoff, shortDate } from "../../engine/dates";
import { RULES, SCHEDULE, teamLabel } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import { scheduleReleaseDate, scheduleReleased } from "../../engine/seasons";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";
import { useUi } from "../ui";
import { tip } from "../tip";
import { Chip, Columns, Icon, TeamBadge } from "../gfx";

export function ScheduleScreen({ game }: { game: GameState }) {
  const ui = useUi();
  const us = game.userTeam;
  const games = SCHEDULE.filter((g) => {
    const m = matchup(game, g);
    return m && (m.away === us || m.home === us);
  });
  let w = 0, l = 0, t = 0;
  if (!scheduleReleased(game)) {
    return (
      <section className="stack">
        <p className="muted">The league releases the {RULES.season} schedule on {shortDate(scheduleReleaseDate())}. We know who we play, from the division rotation and last season's finish, but not when or where.</p>
      </section>
    );
  }
  const rows = games.map((g) => {
    const m = matchup(game, g)!;
    const home = m.home === us;
    const opp = home ? m.away : m.home;
    const r = game.results[g.id];
    let res: "W" | "L" | "T" | undefined, ours = 0, theirs = 0;
    if (r) {
      ours = home ? r.homeScore : r.awayScore;
      theirs = home ? r.awayScore : r.homeScore;
      res = ours > theirs ? "W" : ours < theirs ? "L" : "T";
      if (g.type === "REG") { if (res === "W") w++; else if (res === "L") l++; else t++; }
    }
    return { g, home, opp, r, res, ours, theirs, rec: r && g.type === "REG" ? `${w}-${l}${t ? `-${t}` : ""}` : "" };
  });
  const done = rows.filter((x) => x.r && x.g.type !== "PRE");
  return (
    <section className="stack">
      {done.length > 1 && (
        <div className="panel stack tight">
          <h3>Point margin, game by game</h3>
          <Columns values={done.map((x) => x.ours - x.theirs)} labels={done.map((x) => x.opp)} height={110} tone="good" format={(v) => (v > 0 ? `+${v}` : String(v))} />
        </div>
      )}
      <div className="gx-grid tm-sched">
        {rows.map(({ g, home, opp, r, res, ours, theirs, rec }) => {
          const isToday = g.date === game.date;
          return (
            <button key={g.id} type="button" className={`gx-tile tm-game${res ? ` res-${res}` : ""}${isToday ? " today" : ""}`} {...tip("game", g.id)}
              onClick={r ? () => ui.openBox(g.id) : undefined} disabled={!r} aria-label={`${teamLabel(opp)} ${shortDate(g.date)}`}>
              <div className="gx-tile-top">
                <span className="gx-kicker">{g.type === "REG" ? `Week ${g.week}` : gameTypeLabel(g)}</span>
                <Chip icon={g.neutral ? "globe" : home ? "stadium" : "flag"}>{g.neutral ? "Neutral" : home ? "Home" : "Away"}</Chip>
              </div>
              <div className="gx-row">
                <TeamBadge team={opp} size={38} noTip />
                <span className="tm-game-opp"><span className="muted">{g.neutral || home ? "vs" : "at"}</span> <strong>{teamLabel(opp)}</strong>
                  <span className="muted">{g.weekday.slice(0, 3)} {shortDate(g.date)} · {kickoff(g.timeET)}</span></span>
              </div>
              {r ? (
                <div className="gx-row tm-game-result">
                  <span className={`tm-res tm-res-${res}`}>{res}</span>
                  <span className="gx-big">{ours}-{theirs}{r.overtime ? " OT" : ""}</span>
                  {rec && <span className="muted tm-game-rec">{rec}</span>}
                </div>
              ) : <span className="muted tm-game-site"><Icon name="stadium" size={13} /> {g.stadium}{g.city ? `, ${g.city}` : ""}</span>}
            </button>
          );
        })}
      </div>
      <p className="muted">Tap a result for the box score. Playoff games appear here once the bracket is set. All times Eastern.</p>
    </section>
  );
}
