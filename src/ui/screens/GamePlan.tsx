// The game plan: what the coaches and analysts drew up for the next opponent,
// and how the last few plans went. Shown on Game week (it used to be an
// Analytics tab); the owner reads it, the coaches call it.
import { shortDate } from "../../engine/dates";
import { SCHEDULE, TEAM_BY_ID } from "../../engine/league";
import { matchup } from "../../engine/standings";
import { analytics, gamePlan } from "../../engine/strategy";
import type { GameState } from "../../engine/types";
import { Chip, FormChips, HudStat, Ring, TeamBadge } from "../gfx";

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
      {!plan && <p className="muted kit-none">No game coming up.</p>}
      <div className="panel stack tight">
        <h3>Fourth downs this season</h3>
        <div className="gx-row" style={{ gap: "1.2rem" }}>
          <Ring value={a.advice.advised ? a.advice.followed / a.advice.advised : 0} text={`${a.advice.followed}/${a.advice.advised}`} label="Advice taken" />
          <HudStat icon="target" label="Points lost ignoring it" value={a.advice.lost.toFixed(1)} tone={a.advice.lost > 3 ? "bad" : a.advice.lost > 1 ? "warn" : "good"} />
        </div>
        <span className="muted">{a.advice.advised} calls where the analysts disagreed with the coach's first instinct; the coach took the advice {a.advice.followed} times. Ignored advice cost about {a.advice.lost.toFixed(1)} expected points.</span>
      </div>
      {past.length > 0 && <div className="panel stack tight">
        <h3>Last {past.length > 1 ? "games" : "game"}</h3>
        <div className="gx-grid">
        {past.map((p) => {
          const r = game.results[p.gameId];
          const usHome = r.home === game.userTeam;
          const ours = usHome ? r.homeScore : r.awayScore, theirs = usHome ? r.awayScore : r.homeScore;
          return (
            <div key={p.gameId} className="gx-tile sunk">
              <div className="gx-tile-top"><TeamBadge team={p.opp} size={26} /><span className="gx-kicker">vs {TEAM_BY_ID[p.opp].name}</span><FormChips results={[ours > theirs ? "W" : ours < theirs ? "L" : "T"]} /><span className="gx-big" style={{ fontSize: "1rem" }}>{ours}-{theirs}</span></div>
              <div className="gx-row">
                <Chip icon={p.attack === "run" ? "helmet" : "football"}>{p.attack === "run" ? "Ran the ball" : "Through the air"}</Chip>
                <Chip icon="shield">{p.stop === "pass" ? "Took away the pass" : "Stopped the run"}</Chip>
              </div>
              {p.adjust.map((t, i) => <span key={i} className="muted">{t}</span>)}
              {p.fourth.map(([adv, coach, ok, ev], i) => <div key={i} className="gx-row"><Chip icon={ok ? "check" : "alert"} tone={ok ? "good" : "warn"}>4th down</Chip><span className="muted">{ok ? `Analysts said ${adv}; the coach agreed` : `Analysts said ${adv}; coach chose to ${coach} (−${ev.toFixed(2)} EP)`}</span></div>)}
            </div>
          );
        })}
        </div>
      </div>}
    </div>
  );
}

