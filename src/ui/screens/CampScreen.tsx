import { useState } from "react";
import { battleStandings, campNote } from "../../engine/camp";
import { teamPlayerIds } from "../../engine/cap";
import { shortDate } from "../../engine/dates";
import { answerDecision, openDecisions } from "../../engine/discipline";
import { PLAYER_BY_ID, RULES, teamLabel } from "../../engine/league";
import { veteranReportDate } from "../../engine/season";
import type { GameState, SpringPlan } from "../../engine/types";
import { POSITION_NAMES } from "../format";
import { useUi } from "../ui";

const REASON: Record<NonNullable<SpringPlan["reason"]>, string> = {
  contract: "Staying away over his contract",
  training: "Training on his own",
  personal: "Excused for personal reasons",
};

const MINICAMP: Record<NonNullable<SpringPlan["minicamp"]>, string> = {
  present: "Reported", absent: "Skipped", excused: "Skipped (excused)", fined: "Skipped (fined)",
};

/** Where the team is in its year, for the screen's heading. */
function phase(game: GameState): string {
  const k = RULES.keyDates;
  const d = game.date;
  if (d >= k.regularSeasonStart) return "The regular season";
  if (d >= veteranReportDate(game.userTeam)) return "Training camp and the preseason";
  if (k.minicampStart && d >= k.minicampStart) return "Summer break";
  if (k.otasStart && d >= k.otasStart) return "OTAs";
  return "The offseason program";
}

export function CampScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [said, setSaid] = useState<string | null>(null);
  const team = game.userTeam;
  const p = game.program?.season === RULES.season ? game.program : undefined;
  const decisions = openDecisions(game);
  const battles = (p?.battles ?? []).filter((b) => b.team === team);
  const roster = teamPlayerIds(game, team).filter((id) => ["camp", "active"].includes(game.players[id].status));
  const notes = roster
    .map((id) => [id, campNote(game, team, id)] as const)
    .filter(([, n]) => n === "Strong camp" || n === "Rough camp");
  const spring = roster.filter((id) => p?.spring[id]).map((id) => [id, p!.spring[id]] as const);
  const ours = (p?.incidents ?? []).filter((i) => i.team === team);
  const league = (p?.incidents ?? []).filter((i) => i.team !== team && i.kind !== "minicamp").slice(-12).reverse();
  const suspended = Object.entries(game.players).filter(([, s]) => s.suspended && s.team).map(([id, s]) => ({ id, team: s.team!, games: s.suspended!.games }));

  function decide(id: string, key: string) {
    setSaid(answerDecision(game, id, key));
    changed();
  }
  const link = (id: string) => <button className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>;

  return (
    <section className="stack">
      <h2>Camp</h2>
      <p className="muted">
        {phase(game)}.{" "}
        {game.date < RULES.keyDates.otasStart && `OTAs open ${shortDate(RULES.keyDates.otasStart)} and minicamp ${shortDate(RULES.keyDates.minicampStart)}. `}
        {game.date < veteranReportDate(team) ? `Veterans report to camp ${shortDate(veteranReportDate(team))}.` : `Veterans reported ${shortDate(veteranReportDate(team))}; the cutdown to 53 is ${shortDate(RULES.keyDates.rosterCutdown)}.`}
      </p>
      {said && <p className="notice">{said}</p>}

      {decisions.length > 0 && (
        <section className="panel stack tight">
          <h3>Your call</h3>
          {decisions.map((d) => (
            <div key={d.id} className="report">
              <strong>{d.title}</strong>
              <span>{d.body}</span>
              <span className="muted">Decide by {shortDate(d.expires)}.</span>
              <div className="btn-row">
                {d.options.map((o, i) => (
                  <button key={o.key} className={`btn${i === 0 ? " primary" : ""}`} onClick={() => decide(d.id, o.key)}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel stack tight">
        <h3>Camp battles</h3>
        {battles.length === 0 ? (
          <p className="muted">{game.date < veteranReportDate(team) ? "The head coach names the open spots when camp opens." : "No starting spots were open this camp."}</p>
        ) : battles.map((b) => {
          const order = battleStandings(game, b);
          return (
            <div key={b.pos} className="report">
              <strong>{POSITION_NAMES[b.pos]}</strong>
              <span>
                {b.winner ? <>{link(b.winner)} won the job{order.find((x) => x !== b.winner) ? <> over {link(order.find((x) => x !== b.winner)!)}</> : null}.</>
                  : order.length >= 2 ? <>{link(order[0])} leads {link(order[1])} for now.</> : "Undecided."}
              </span>
              <span className="muted">{b.winner ? `Decided ${shortDate(b.decided!)}.` : "The head coach's Monday camp reports have the details."}</span>
            </div>
          );
        })}
      </section>

      {notes.length > 0 && (
        <section className="panel stack tight">
          <h3>How camp is going</h3>
          {notes.map(([id, n]) => (
            <span key={id}>{link(id)} <span className="muted">{PLAYER_BY_ID[id].position}</span> · <span className={n === "Strong camp" ? "good" : "bad"}>{n}</span></span>
          ))}
        </section>
      )}

      <section className="panel stack tight">
        <h3>Spring attendance</h3>
        {!p?.springSet ? <p className="muted">{game.date < RULES.keyDates.otasStart ? "OTAs haven't started this year." : "This year's spring program was over before you took over."}</p>
          : spring.length === 0 ? <p className="muted">Everyone took part in the voluntary program.</p>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Player</th><th>Pos</th><th>OTAs</th><th>Why</th><th>Minicamp</th></tr></thead>
                <tbody>
                  {spring.map(([id, s]) => (
                    <tr key={id}>
                      <td>{link(id)}</td><td>{PLAYER_BY_ID[id].position}</td>
                      <td>{s.plan === "away" ? "Absent" : "Some sessions"}</td>
                      <td className="muted">{s.reason ? REASON[s.reason] : ""}</td>
                      <td>{s.minicamp ? MINICAMP[s.minicamp] : "Reported"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <section className="panel stack tight">
        <h3>Discipline</h3>
        {ours.length === 0 ? <p className="muted">Nothing on our side this year.</p> : ours.map((i, n) => (
          <span key={n}>{shortDate(i.date)} · {link(i.player)}: {i.text}.</span>
        ))}
        {suspended.length > 0 && (
          <>
            <h4>Suspended around the league</h4>
            {suspended.map((s) => <span key={s.id}>{link(s.id)} <span className="muted">{teamLabel(s.team)}</span> · {s.games} game{s.games === 1 ? "" : "s"} left</span>)}
          </>
        )}
        {league.length > 0 && (
          <>
            <h4>Around the league</h4>
            {league.map((i, n) => <span key={n} className="muted">{shortDate(i.date)} · {PLAYER_BY_ID[i.player].name} ({teamLabel(i.team)}): {i.text}.</span>)}
          </>
        )}
      </section>
    </section>
  );
}
