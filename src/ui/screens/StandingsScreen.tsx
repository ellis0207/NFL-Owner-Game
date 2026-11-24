import { TEAM_BY_ID } from "../../engine/league";
import { divisionStandings, matchup } from "../../engine/standings";
import { SCHEDULE } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import type { GameState } from "../../engine/types";
import { Score } from "../Score";
import { tip } from "../tip";
import { TEAM_COLORS } from "../../engine/teamColors";
import { FormChips, TeamBadge } from "../gfx";
import { recentForm } from "../gfxdata";

export function StandingsScreen({ game }: { game: GameState }) {
  const divisions = divisionStandings(game);
  const post = SCHEDULE.filter((g) => g.type === "POST" && matchup(game, g));
  return (
    <section className="stack">
      {game.seeds && (
        <div className="split">
          {(["AFC", "NFC"] as const).map((c) => (
            <div key={c} className="panel stack">
              <h2>{c} playoff seeds</h2>
              <ol className="lg-seeds">
                {game.seeds![c].map((t, i) => (
                  <li key={t} className={t === game.userTeam ? "ours" : undefined} {...tip("team", t)} style={{ ["--sw" as string]: TEAM_COLORS[t]?.[0] }}>
                    <span className="lg-seed">{i + 1}</span><TeamBadge team={t} size={22} noTip />{TEAM_BY_ID[t].city} {TEAM_BY_ID[t].name}{i === 0 && <span className="pill">Bye</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {post.length > 0 && (
        <div className="stack">
          <h3>Postseason</h3>
          <div className="scores">{post.map((g) => <Score key={g.id} game={game} id={g.id} />)}</div>
          <span className="muted">{post.map((g) => gameTypeLabel(g)).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</span>
        </div>
      )}
      <div className="divisions lg-wall">
        {divisions.map((d) => (
          <div key={d.conference + d.division} className="table-wrap lg-board">
            <table>
              <thead>
                <tr><th>{d.conference} {d.division}</th><th className="num">W</th><th className="num">L</th><th className="num">T</th><th className="num">Diff</th><th className="num">Div</th><th>Last 5</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.team} className={r.team === game.userTeam ? "mine" : undefined}>
                    <td className="name"><span className="gx-teamtag"><TeamBadge team={r.team} size={22} noTip /><span {...tip("team", r.team)}>{TEAM_BY_ID[r.team].name}</span></span></td>
                    <td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.t}</td>
                    <td className="num" title={`${r.pf} scored, ${r.pa} allowed`}><span className={`lg-diff ${r.pf - r.pa > 0 ? "good" : r.pf - r.pa < 0 ? "bad" : ""}`}>{r.pf - r.pa > 0 ? "+" : ""}{r.pf - r.pa}</span></td>
                    <td className="num">{r.divW}-{r.divL}{r.divT ? `-${r.divT}` : ""}</td>
                    <td title={r.streak ? `Streak ${r.streak}` : undefined}><FormChips results={recentForm(game, r.team, 5)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
