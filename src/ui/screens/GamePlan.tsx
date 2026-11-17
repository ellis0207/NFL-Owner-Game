// The game plan: what the coaches and analysts drew up for the next opponent,
// and how the last few plans went. Shown on Game week (it used to be an
// Analytics tab); the owner reads it, the coaches call it.
import { shortDate } from "../../engine/dates";
import { SCHEDULE, TEAM_BY_ID } from "../../engine/league";
import { matchup } from "../../engine/standings";
import { analytics, gamePlan } from "../../engine/strategy";
import type { GameState } from "../../engine/types";

function nextGame(game: GameState) {
  for (const g of SCHEDULE) {
    if (g.date < game.date || game.results[g.id] || g.type === "PRE") continue;
    const m = matchup(game, g);
    if (m && (m.away === game.userTeam || m.home === game.userTeam)) return { g, opp: m.away === game.userTeam ? m.home : m.away };
  }
  return null;
}

/** The coaches' plan for the next game, the fourth-down record and how the last games went. */
export function GamePlan({ game }: { game: GameState }) {
  const a = analytics(game);
  const next = nextGame(game);
  const plan = next ? gamePlan(game, game.userTeam, next.opp, next.g) : null;
  const past = Object.values(a.plans).filter((p) => game.results[p.gameId]).reverse().slice(0, 6);
  return (
    <div className="stack">
      {plan && next && (
        <div className="panel stack tight">
          <h3>Next: {TEAM_BY_ID[next.opp].name}, {shortDate(next.g.date)}</h3>
          {plan.notes.map((n, i) => <span key={i}>{n}</span>)}
          <span className="muted">The coaches make the plan; you see it, you don't call it. Better coaches, a stronger analytics staff and a full week make better plans.</span>
        </div>
      )}
      {!plan && <p className="muted">No game coming up.</p>}
      <div className="panel stack tight">
        <h3>Fourth downs this season</h3>
        <span>{a.advice.advised} calls where the analysts disagreed with the coach's first instinct; the coach took the advice {a.advice.followed} times. Ignored advice cost about {a.advice.lost.toFixed(1)} expected points.</span>
      </div>
      {past.map((p) => (
        <div key={p.gameId} className="panel stack tight">
          <h3>Last {past.length > 1 ? "games" : "game"}: vs {TEAM_BY_ID[p.opp].name}</h3>
          <span>{p.attack === "run" ? "Attacked with the run." : "Attacked through the air."} {p.stop === "pass" ? "Took away the pass." : "Stopped the run first."}</span>
          {p.adjust.map((t, i) => <span key={i} className="muted">{t}</span>)}
          {p.fourth.map(([adv, coach, ok, ev], i) => <span key={i}>Fourth down: the analysts said {adv}; {ok ? "the coach agreed" : `the coach chose to ${coach} (about ${ev.toFixed(2)} expected points given up)`}.</span>)}
        </div>
      ))}
    </div>
  );
}

