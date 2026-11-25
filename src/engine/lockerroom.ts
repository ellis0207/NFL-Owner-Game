// The locker room on the field. Every week of camp and the season, each
// player's mood drifts toward what his situation says it should be: whether
// the team is winning, whether he has the role he came for, whether his
// coaches trust him, how the room around him feels and how the head coach
// holds it together. Owner decisions, contracts and the press still move
// moods day to day; this weekly pull is what makes a losing season or a
// benched starter sour over time. Unhappy starters play below themselves
// (`moraleDrag` in staff.ts), split a room's chemistry (`targetChemistry` in
// clubhouse.ts) and, on our club, land on the owner's desk as a memo.
import { agentFor, changeMorale, priorities } from "./agents";
import { teamPlayerIds } from "./cap";
import { clubhouse, clubNote, expectsToStart, starters, trustOf } from "./clubhouse";
import { culture } from "./culture";
import { addDays, weekday } from "./dates";
import { addMemo } from "./delegation";
import { news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { marketPrice, marketView } from "./market";
import { dealOf, leagueYear } from "./contracts";
import { gaussian, rngFor } from "./rng";
import { staffEffects, teamStaff } from "./staff";
import { standings } from "./standings";
import { trades } from "./trades";
import type { GameState, Memo } from "./types";

/** What pulls a player's mood up or down this week, by reason, in morale points. */
export interface MoodPull {
  winning: number;
  role: number;
  trust: number;
  coach: number;
  room: number;
  contract: number;
  unrest: number;
}

export type MoodReason = keyof MoodPull;

const BASE = 70;

/** Where a player's mood is headed and why. */
export function moodPull(state: GameState, id: string, team: string, startersSet?: Set<string>, table = standings(state)): MoodPull {
  const pr = priorities(id);
  const r = table[team];
  const games = r ? r.w + r.l + r.t : 0;
  // Losing wears on everyone, most on the veterans who came to win.
  let winning = games ? ((r.w + r.t / 2) / games - 0.5) * 32 * (0.5 + pr.winning) : 0;
  const streak = r?.streak ?? "";
  if (streak.startsWith("L")) winning -= Math.min(6, Math.max(0, Number(streak.slice(1)) - 2) * 1.5);
  // A player who came to start and doesn't feels it every week; a starter feels wanted.
  const start = (startersSet ?? new Set(starters(state, team))).has(id);
  const role = start ? 3 : expectsToStart(state, id) ? -(8 + 10 * pr.role) * (0.6 + pr.ego) : 0;
  const trust = (trustOf(state, id) - 50) * 0.25;
  // A respected head coach keeps the room steady through bad weeks.
  const coach = (staffEffects(team).leadership - 80) * 0.25;
  const room = ((state.clubhouse?.chem[team] ?? 60) - 60) * 0.12;
  const ps = state.players[id];
  // A starter paid far below what the market says he's worth feels it, the more so if money matters to him.
  let contract = 0;
  const deal = dealOf(state, id);
  if (start && deal && marketView(state, id) >= 80) {
    const underpaid = marketPrice(state, id, leagueYear(state.date)).apy / Math.max(1, deal.apy);
    if (underpaid > 1.3) contract = -Math.min(10, (underpaid - 1.3) * 8 * (0.4 + pr.money));
  }
  const unrest = (ps.holdout ? -10 : 0) + (state.trades?.requests[id] ? -8 : 0);
  return { winning, role, trust, coach, room, contract, unrest };
}

export function moodTarget(p: MoodPull): number {
  return BASE + p.winning + p.role + p.trust + p.coach + p.room + p.contract + p.unrest;
}

/** The pull that hurts the most, for a memo or a story. */
export function worstReason(p: MoodPull): MoodReason {
  return (Object.keys(p) as MoodReason[]).reduce((a, b) => (p[b] < p[a] ? b : a), "winning");
}

/** Share of a team's starters who are unhappy: a room starting to split. */
export function unhappyStarters(state: GameState, team: string): string[] {
  return starters(state, team).filter((id) => (state.players[id]?.morale ?? BASE) < 45);
}

function inWindow(state: GameState): boolean {
  const K = RULES.keyDates;
  return state.date >= addDays(K.rosterCutdown, -35) && state.date <= K.superBowl;
}

/** Tuesdays in camp and the season: every rostered player's mood moves about a third of the way toward its target. */
function weeklyMood(state: GameState): void {
  const rng = rngFor(state.seed, `mood:${state.date}`);
  const table = standings(state);
  for (const team of Object.keys(TEAM_BY_ID)) {
    const start = new Set(starters(state, team));
    for (const id of teamPlayerIds(state, team)) {
      const ps = state.players[id];
      if (ps.status !== "active" && ps.status !== "ir") continue;
      const target = moodTarget(moodPull(state, id, team, start, table));
      const now = ps.morale ?? BASE;
      changeMorale(state, id, (target - now) * 0.3 + gaussian(rng) * 2);
    }
  }
}

export const REASON_TEXT: Record<MoodReason, string> = {
  winning: "the losing",
  role: "his role",
  trust: "how the coaches are using him",
  coach: "the way the room is being run",
  room: "a locker room that isn't together",
  contract: "being paid well below what he's worth",
  unrest: "his contract situation",
};

/**
 * Unhappy starters speak up. Around the league it becomes a story and the
 * room frays a little; on our club the head coach brings it to the owner.
 */
function speakUp(state: GameState): void {
  const c = clubhouse(state);
  c.upset ??= {};
  const rng = rngFor(state.seed, `speak:${state.date}`);
  const season = RULES.season;
  for (const team of Object.keys(TEAM_BY_ID)) {
    for (const id of unhappyStarters(state, team)) {
      const ps = state.players[id];
      if ((ps.morale ?? BASE) >= 38 || c.upset[id] === season) continue;
      if (marketView(state, id) < 75) continue;
      const pr = priorities(id);
      const p = PLAYER_BY_ID[id];
      const why = worstReason(moodPull(state, id, team));
      if (team === state.userTeam) {
        c.upset[id] = season;
        lockerMemo(state, id, why);
        continue;
      }
      if (rng() > 0.1 + 0.3 * pr.ego) continue;
      c.upset[id] = season;
      c.chem[team] = Math.max(15, (c.chem[team] ?? 60) - 3);
      news(state, "log", `Report: ${p.position} ${p.name} frustrated with ${REASON_TEXT[why]} in ${TEAM_BY_ID[team].city}`);
    }
  }
}

/** The tutorial's locker-room call: the best-paid active starter has something on his mind. */
export function forceLockerMemo(state: GameState): string | undefined {
  const us = state.userTeam;
  const id = Object.keys(state.players).filter((x) => state.players[x].team === us && (state.players[x].status === "active" || state.players[x].status === "camp"))
    .sort((a, b) => (state.contracts[b]?.apy ?? 0) - (state.contracts[a]?.apy ?? 0))[0];
  return id ? lockerMemo(state, id, worstReason(moodPull(state, id, us))).id : undefined;
}

function lockerMemo(state: GameState, id: string, why: MoodReason): Memo {
  const p = PLAYER_BY_ID[id];
  const hc = teamStaff(state.userTeam).HC?.name ?? "The head coach";
  const coachSide = why === "role" || why === "trust";
  return addMemo(state, {
    kind: "general", area: "coaching", from: `${hc}, head coach`, title: `${p.name} is unhappy`,
    problem: `${p.name} has gone quiet in meetings and his agent, ${agentFor(id).name}, has called twice. It's about ${REASON_TEXT[why]}. ` +
      "Players notice when a starter checks out, and it spreads if nobody deals with it.",
    proposal: coachSide ? "Let the staff handle it: the depth chart and the plan stay as they are." : "Sit down with him yourself and hear him out.",
    options: [
      { label: "Meet with him yourself", effect: "Usually lifts his mood. If it's about his role, the coaches may feel you went over their heads.", evidence: "opinion" },
      { label: "Back the coaches", effect: "The staff's authority holds and the room sees a line drawn; he may sulk a while longer.", evidence: "opinion" },
      { label: "Put him on the trade block", effect: "The room settles once he's out of the picture; he knows it, and other clubs smell a motivated seller.", evidence: "opinion" },
    ],
    risks: ["An unhappy starter plays below himself, and two or three of them split a room."],
    budget: "No cost.", recommend: coachSide ? 1 : 0, deadline: addDays(state.date, 5),
    ifLate: "The coaches handle it their way.", payload: { locker: id, why },
  });
}

/** The owner's answer to an unhappy-player memo (memos.ts hands it here). */
export function resolveLockerMemo(state: GameState, m: Memo, choice: number): string | null {
  const id = m.payload?.locker as string | undefined;
  if (!id || !state.players[id]) return null;
  const why = m.payload?.why as MoodReason;
  const pr = priorities(id);
  const c = clubhouse(state);
  const cu = culture(state);
  const name = PLAYER_BY_ID[id]?.name ?? "He";
  if (choice === 0) {
    changeMorale(state, id, 8 + 8 * pr.loyalty);
    if (why === "role" || why === "trust") cu.cooperation = Math.max(0, cu.cooperation - 3);
    clubNote(state, `The owner met with ${name}.`);
  } else if (choice === 1) {
    changeMorale(state, id, -3);
    c.trust[id] = Math.min(100, (c.trust[id] ?? 50) + 4);
    cu.cooperation = Math.min(100, cu.cooperation + 2);
    c.chem[state.userTeam] = Math.min(95, (c.chem[state.userTeam] ?? 60) + 1);
  } else {
    changeMorale(state, id, -6);
    const ts = trades(state);
    if (!ts.block.includes(id)) ts.block.push(id);
    c.chem[state.userTeam] = Math.min(95, (c.chem[state.userTeam] ?? 60) + 2);
    send(state, "staff", "General manager", `${name} is on the block`, `Teams will know by tomorrow. We'll bring you any offer worth hearing on the Trades page.`);
  }
  return null;
}

/** A word for where a player's mood is headed, for staff reports. */
export function moodWord(m: number): string {
  return m >= 80 ? "Fired up" : m >= 65 ? "Content" : m >= 50 ? "Restless" : m >= 38 ? "Unhappy" : "Checked out";
}

export function lockerRoomDaily(state: GameState): void {
  if (weekday(state.date) !== "Tuesday" || !inWindow(state)) return;
  weeklyMood(state);
  if (state.date >= RULES.keyDates.regularSeasonStart) speakUp(state);
}

