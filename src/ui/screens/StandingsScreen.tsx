import { TEAM_BY_ID } from "../../engine/league";
import { divisionStandings, matchup } from "../../engine/standings";
import { SCHEDULE } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import type { GameState } from "../../engine/types";
import { Score } from "../Score";
import { tip } from "../tip";
import { TEAM_COLORS } from "../../engine/teamColors";

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
                    <span className="lg-seed">{i + 1}</span>{TEAM_BY_ID[t].city} {TEAM_BY_ID[t].name}{i === 0 && <span className="pill">Bye</span>}
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
                <tr><th>{d.conference} {d.division}</th><th className="num">W</th><th className="num">L</th><th className="num">T</th><th className="num">PF</th><th className="num">PA</th><th className="num">Div</th><th className="num">Strk</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.team} className={r.team === game.userTeam ? "mine" : undefined}>
                    <td className="name"><span className="lg-swatch" style={{ background: TEAM_COLORS[r.team]?.[0] }} aria-hidden="true" /><span {...tip("team", r.team)}>{TEAM_BY_ID[r.team].name}</span></td>
                    <td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.t}</td>
                    <td className="num">{r.pf}</td><td className="num">{r.pa}</td>
                    <td className="num">{r.divW}-{r.divL}{r.divT ? `-${r.divT}` : ""}</td>
                    <td className="num">{r.streak}</td>
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
