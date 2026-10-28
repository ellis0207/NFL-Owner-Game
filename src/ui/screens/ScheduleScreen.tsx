import { kickoff, shortDate } from "../../engine/dates";
import { RULES, SCHEDULE, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import { scheduleReleaseDate, scheduleReleased } from "../../engine/seasons";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";
import { useUi } from "../ui";

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
        <h2>{TEAM_BY_ID[us].name} {RULES.season} schedule</h2>
        <p className="muted">The league releases the {RULES.season} schedule on {shortDate(scheduleReleaseDate())}. We know who we play, from the division rotation and last season's finish, but not when or where.</p>
      </section>
    );
  }
  return (
    <section className="stack">
      <h2>{TEAM_BY_ID[us].name} {RULES.season} schedule</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Week</th><th>Date</th><th>Opponent</th><th>Kickoff</th><th>Site</th><th className="num">Result</th><th className="num">Record</th></tr>
          </thead>
          <tbody>
            {games.map((g) => {
              const m = matchup(game, g)!;
              const home = m.home === us;
              const opp = home ? m.away : m.home;
              const r = game.results[g.id];
              let result = "";
              let cls = "";
              if (r) {
                const ours = home ? r.homeScore : r.awayScore;
                const theirs = home ? r.awayScore : r.homeScore;
                const res = ours > theirs ? "W" : ours < theirs ? "L" : "T";
                cls = res === "W" ? "good" : res === "L" ? "bad" : "";
                result = `${res} ${ours}-${theirs}${r.overtime ? " OT" : ""}`;
                if (g.type === "REG") { if (res === "W") w++; else if (res === "L") l++; else t++; }
              }
              const isToday = g.date === game.date;
              return (
                <tr key={g.id} className={`${isToday ? "mine" : ""} ${r ? "clickable" : ""}`} onClick={r ? () => ui.openBox(g.id) : undefined}>
                  <td>{g.type === "REG" ? g.week : gameTypeLabel(g)}</td>
                  <td className="num">{g.weekday.slice(0, 3)} {shortDate(g.date)}</td>
                  <td className="name">{g.neutral ? "vs" : home ? "vs" : "at"} {teamLabel(opp)}</td>
                  <td className="num">{kickoff(g.timeET)}</td>
                  <td>{g.stadium}{g.city ? `, ${g.city}` : ""}</td>
                  <td className={`num ${cls}`}>{result}</td>
                  <td className="num">{r && g.type === "REG" ? `${w}-${l}${t ? `-${t}` : ""}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Tap a result for the box score. Playoff games appear here once the bracket is set. All times Eastern.</p>
    </section>
  );
}
