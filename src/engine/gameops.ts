// Game-day operations at the owner's home games, and officiating questions
// put to the league office.
//
// Clubs host the officials, the chain and ball crews, the visiting team, the
// broadcasters and the crowd under league game-operations rules. Here the
// stadium operations staff runs one check before every home game. It covers
// the field, game balls and uniforms, the officials' locker room and liaison,
// the chain and ball crews, sideline credentials, the coach-to-player radios and
// booths, the broadcast setup and stadium security. A good operations director
// and a real game-day budget make problems rarer. Most problems are fixed
// before kickoff; a few become incidents that cost money or draw a league fine.
//
// After a game, a club can ask the league office about a call that went
// against it. The league answers within a few days with its own finding.
import { addDays } from "./dates";
import { business, post } from "./business";
import { execBoost, execRole } from "./executives";
import { send } from "./inbox";
import { GAME_BY_ID, TEAM_BY_ID } from "./league";
import { prunePlayLogs } from "./playlog";
import { rngFor } from "./rng";
import type { GameOpsCheck, GameOpsState, GameResult, GameState, ScheduledGame } from "./types";

const K = 1000;

/** The areas of the check, what goes wrong in each, and what it costs when it does. */
const AREAS: { area: string; minor: string[]; problem: string[]; cost: number; fine?: number }[] = [
  { area: "Field and grounds", minor: ["Re-sodded a worn patch between the hashes", "Re-painted faded yard numbers"], problem: ["Divots kept coming up all game; the league's field inspector filed a report"], cost: 120 * K },
  { area: "Game balls and uniforms", minor: ["One game ball was replaced at the officials' inspection", "A player's jersey number was fixed before warmups"], problem: ["The kicking balls missed the league's chain of custody; the league is looking into it"], cost: 0, fine: 100 * K },
  { area: "Officials' locker room and liaison", minor: ["The officials' locker room air conditioning was repaired before arrival"], problem: ["The officials' liaison was late with the pregame paperwork; the league office noted it"], cost: 10 * K },
  { area: "Chain and ball crews", minor: ["A backup chain crew member filled in"], problem: ["The chain crew lost the down marker's spot on a measurement; the officials had to re-spot it"], cost: 5 * K },
  { area: "Sideline credentials", minor: ["Turned away guests with the wrong wristbands"], problem: ["Someone without a credential reached the sideline; the league fined the club"], cost: 0, fine: 50 * K },
  { area: "Coach radios and booths", minor: ["Swapped a coaching booth headset during warmups"], problem: ["The coach-to-player radio went down for a series; league rules shut off the other side's too"], cost: 25 * K },
  { area: "Broadcast setup", minor: ["Re-ran a camera cable in the end zone"], problem: ["A power problem in the TV compound delayed the broadcast's start; the network billed the club"], cost: 150 * K },
  { area: "Security and gates", minor: ["Opened two more gates when the lines grew"], problem: ["Gate lines backed up past kickoff; thousands were still outside for the first quarter"], cost: 40 * K },
];

export function gameOps(state: GameState): GameOpsState {
  return (state.gameOps ??= { checks: [], inquiries: [] });
}

/** Runs the operations check at one of the owner's home games, after it's played. */
export function gameDayOps(state: GameState, g: ScheduledGame, r: GameResult): void {
  if (r.home !== state.userTeam || g.neutral) return;
  const ops = gameOps(state);
  if (ops.checks.some((c) => c.gameId === g.id)) return;
  const rng = rngFor(state.seed, `gameops:${g.id}`);
  const budget = business(state).budget.gameday ?? 1;
  // How sharp the operation is: the director's skill and the game-day budget.
  const sharp = execBoost(state, "SOD") * 0.6 + execBoost(state, "COO") * 0.2 + (budget - 1) * 0.25;
  const box = state.box[g.id];
  const wet = box?.weather && box.weather.precip !== "none";
  const check: GameOpsCheck = { gameId: g.id, date: g.date, areas: [], incidents: [], cost: 0 };
  let fines = 0;
  for (const a of AREAS) {
    const weather = a.area === "Field and grounds" && wet ? 2 : 1;
    const pMinor = Math.max(0.03, 0.16 * weather - sharp * 0.06);
    const pProblem = Math.max(0.002, (0.016 * weather) * (1 - sharp * 0.5));
    const roll = rng();
    if (roll < pProblem) {
      const text = a.problem[Math.floor(rng() * a.problem.length)];
      check.areas.push([a.area, "problem", text]);
      check.incidents.push(text);
      check.cost += a.cost;
      fines += a.fine ?? 0;
    } else if (roll < pProblem + pMinor) check.areas.push([a.area, "minor", a.minor[Math.floor(rng() * a.minor.length)]]);
    else check.areas.push([a.area, "ready", "Ready"]);
  }
  if (check.cost) post(state, "stadium", -check.cost, "Game-day operations problems");
  if (fines) {
    post(state, "fines", -fines, "Game-day operations fine");
    check.cost += fines;
  }
  ops.checks.unshift(check);
  if (ops.checks.length > 40) ops.checks.length = 40;
  if (check.incidents.length) {
    const sod = execRole(state, "SOD");
    send(state, "business", sod ? `${sod.name}, stadium operations` : "Stadium operations", "Game-day problem",
      `${check.incidents.join(" ")} ${check.cost ? `It cost the club $${Math.round(check.cost / K)}K.` : ""} The full check is with the game's play-by-play.`, g.id);
  }
}

/** Asks the league office about a call that went against us. */
export function askLeague(state: GameState, gameId: string, call: number): string | null {
  const box = state.box[gameId];
  const c = box?.calls?.[call];
  if (!c) return "That call isn't on record.";
  if (c.team !== state.userTeam) return "Only the club the call went against can ask about it.";
  const ops = gameOps(state);
  if (ops.inquiries.some((q) => q.gameId === gameId && q.call === call)) return "Already asked.";
  ops.inquiries.push({ gameId, call, asked: state.date });
  return null;
}

export function inquiryFor(state: GameState, gameId: string, call: number) {
  return state.gameOps?.inquiries.find((q) => q.gameId === gameId && q.call === call);
}

/** Daily: the league answers questions about calls, and old play-by-play is dropped. */
export function gameOpsDaily(state: GameState): void {
  prunePlayLogs(state);
  const ops = state.gameOps;
  if (!ops) return;
  for (const q of ops.inquiries) {
    if (q.answer || addDays(q.asked, 3) > state.date) continue;
    const c = state.box[q.gameId]?.calls?.[q.call];
    const g = GAME_BY_ID[q.gameId];
    const opp = g && state.results[q.gameId] ? (state.results[q.gameId].home === state.userTeam ? state.results[q.gameId].away : state.results[q.gameId].home) : "";
    q.answer = !c ? "The league office had no record of the play."
      : c.wrong ? `The league office agrees the officials got it wrong ("${c.text}"). The crew's grade for the game reflects it; the result stands.`
        : `The league office reviewed it and says the officials got it right ("${c.text}").`;
    q.answered = state.date;
    send(state, "league", "League officiating department", `Your question about a call${opp ? ` against ${TEAM_BY_ID[opp]?.name ?? opp}` : ""}`, q.answer, q.gameId);
  }
  if (ops.inquiries.length > 60) ops.inquiries.splice(0, ops.inquiries.length - 60);
}
