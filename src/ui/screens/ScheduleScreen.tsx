import { kickoff, shortDate } from "../../engine/dates";
import { SCHEDULE, TEAM_BY_ID, teamLabel } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";

export function ScheduleScreen({ game }: { game: GameState }) {
  const us = game.userTeam;
  const games = SCHEDULE.filter((g) => {
    const m = matchup(game, g);
    return m && (m.away === us || m.home === us);
  });
  let w = 0, l = 0, t = 0;
  return (
    <section className="stack">
      <h2>{TEAM_BY_ID[us].name} 2026 schedule</h2>
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
                <tr key={g.id} className={isToday ? "mine" : undefined}>
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
      <p className="muted">Playoff games appear here once the bracket is set. All times Eastern.</p>
    </section>
  );
}
