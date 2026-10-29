/**
 * Training camp: the coaches learn who can play by watching practice, camp
 * battles for starting spots, and the head coach's reports on how camp is going.
 */
import { teamPlayerIds } from "./cap";
import { addDays, daysBetween, weekday } from "./dates";
import { send, news } from "./inbox";
import { isHurt } from "./injuries";
import { surname } from "./media";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { STARTERS } from "./negotiation";
import { rngFor } from "./rng";
import { depthChart, isHoldingOut, isSuspended } from "./roster";
import { veteranReportDate } from "./season";
import { campChange, coachView, teamStaff } from "./staff";
import type { GameState, Position, PositionBattle, ProgramState } from "./types";

const KEY = RULES.keyDates;

/** This season's program: created the first time it's needed after each rollover. */
export function program(state: GameState): ProgramState {
  const season = RULES.season;
  let p = state.program;
  if (!p || p.season !== season) {
    // What the coaches learned about a player last year still counts for something.
    const reps: Record<string, number> = {};
    for (const [k, v] of Object.entries(p?.reps ?? {})) if (v * 0.4 >= 1) reps[k] = Math.round(v * 4) / 10;
    p = state.program = { season, spring: {}, reps, battles: [], decisions: [], incidents: [] };
  }
  return p;
}

/** Adds practice reps for a player with his current team. */
export function addReps(state: GameState, team: string, id: string, n: number): void {
  const reps = program(state).reps;
  const key = `${team}:${id}`;
  reps[key] = Math.round(((reps[key] ?? 0) + n) * 10) / 10;
}

/** Teams that played a game today. */
function playedToday(state: GameState): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const r = state.results[g.id];
    if (r) out.set(r.away, g.type).set(r.home, g.type);
  }
  return out;
}

function practicing(state: GameState, id: string): boolean {
  const ps = state.players[id];
  return (ps.status === "camp" || ps.status === "active") && !isHurt(state, id) && !isHoldingOut(state, id);
}

/**
 * Reps: every camp practice and preseason game is a look at a player; in the
 * season the coaches keep learning, more slowly, from the games.
 */
function countReps(state: GameState): void {
  const date = state.date;
  const played = playedToday(state);
  for (const { id: team } of TEAMS) {
    const report = veteranReportDate(team);
    if (date < report) continue;
    const type = played.get(team);
    let gain = 0;
    if (date < KEY.regularSeasonStart) {
      if (type) gain = 1.5;
      else if (daysBetween(report, date) % 6 !== 5) gain = 1;
    } else if (type && type !== "PRE") gain = 0.5;
    if (!gain) continue;
    for (const id of teamPlayerIds(state, team)) if (practicing(state, id)) addReps(state, team, id, gain);
  }
}

// ---- Camp battles ----

const POS_WORDS: Record<Position, string> = {
  QB: "quarterback", RB: "running back", FB: "fullback", WR: "receiver", TE: "tight end", OT: "tackle", OG: "guard", C: "center",
  EDGE: "edge rusher", IDL: "defensive tackle", LB: "linebacker", CB: "cornerback", S: "safety", K: "kicker", P: "punter", LS: "long snapper",
};

function isTopRookie(id: string): boolean {
  const p = PLAYER_BY_ID[id];
  return p.rookieYear === RULES.season && (p.draft.round ?? 9) <= 2;
}

/** At the start of camp, the starting spots that are up for grabs on every team. */
function openBattles(state: GameState): void {
  const p = program(state);
  if (p.battles.length) return;
  for (const { id: team } of TEAMS) {
    const chart = depthChart(state, team);
    const found: (PositionBattle & { gap: number })[] = [];
    for (const [pos, n] of Object.entries(STARTERS) as [Position, number][]) {
      const list = chart[pos];
      if (list.length <= n) continue;
      const a = list[n - 1];
      const b = list[n];
      const gap = coachView(state, team, a) - coachView(state, team, b);
      // A close call, or a high pick the coaches want to see against the incumbent.
      if (gap < (pos === "QB" ? 3 : 2) || (isTopRookie(b) && gap < 5)) found.push({ team, pos, ids: [a, b], opened: state.date, gap });
    }
    found.sort((x, y) => (x.pos === "QB" ? -1 : 0) - (y.pos === "QB" ? -1 : 0) || x.gap - y.gap);
    for (const { gap, ...b } of found.slice(0, 4)) {
      void gap;
      p.battles.push(b);
    }
  }
  const ours = p.battles.filter((b) => b.team === state.userTeam);
  if (ours.length) {
    send(state, "staff", hcLine(state), "Camp battles",
      "These are the spots I consider open going into camp:\n" +
      ours.map((b) => `${cap(POS_WORDS[b.pos])}: ${b.ids.map(name).join(" and ")}`).join("\n") +
      "\n\nI'll let you know how they're going every Monday, and we'll settle them before the cutdown.");
  }
}

/** The contenders still in a battle, best first in the coaches' eyes right now. */
export function battleStandings(state: GameState, b: PositionBattle): string[] {
  return b.ids
    .filter((id) => state.players[id]?.team === b.team && !isSuspended(state, id, KEY.regularSeasonStart))
    .sort((x, y) => standing(state, b.team, y) - standing(state, b.team, x));
}

/** Hurt players lose ground: they can't win a job from the training room. */
function standing(state: GameState, team: string, id: string): number {
  return coachView(state, team, id) - (isHurt(state, id) || isHoldingOut(state, id) ? 3 : 0);
}

/** "has a slight edge on": how far apart two players look to the coaches, in words. */
function margin(state: GameState, b: PositionBattle, lead: string, next: string): string {
  const gap = standing(state, b.team, lead) - standing(state, b.team, next);
  return gap < 0.75 ? "is neck and neck with" : gap < 2 ? "has a slight edge on" : "has pulled ahead of";
}

/** A line about how a battle is going, from the coaches' read of the two players' practices. */
function campLine(state: GameState, team: string, lead: string, next: string): string {
  const rng = rngFor(state.seed, `campline:${state.date}:${lead}`);
  const one = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];
  const a = campChange(state, team, lead);
  const b = campChange(state, team, next);
  const l = surname(name(lead));
  const n = surname(name(next));
  if (a > 0.8) return one([`${l} has stacked good days.`, `${l} has been sharp in team periods.`, `${l} keeps showing up on the tape.`, `${l} has made the most of his reps.`]);
  if (b > 0.8) return one([`${n} is closing.`, `${n} has had a good couple of weeks.`]);
  if (a < -0.8 && b < -0.8) return one(["Neither has grabbed the job.", "Neither has made enough plays to take it."]);
  return one(["Both have done enough to keep it open.", "Nobody has separated yet."]);
}

/** The Monday camp report: the battles, who has stood out, and how the new schemes are coming along. */
function campReport(state: GameState): void {
  const team = state.userTeam;
  const p = program(state);
  const lines: string[] = [];
  for (const b of p.battles.filter((x) => x.team === team && !x.winner)) {
    const [lead, next] = battleStandings(state, b);
    if (!lead || !next) continue;
    lines.push(`${cap(POS_WORDS[b.pos])}: ${name(lead)} ${margin(state, b, lead, next)} ${name(next)}. ${campLine(state, team, lead, next)}`);
  }
  const inBattle = new Set(p.battles.filter((b) => b.team === team).flatMap((b) => b.ids));
  const reps = (id: string) => p.reps[`${team}:${id}`] ?? 0;
  const roster = teamPlayerIds(state, team).filter((id) => practicing(state, id) && !inBattle.has(id) && reps(id) >= 4);
  const changes = roster.map((id) => [id, campChange(state, team, id)] as const);
  const up = changes.filter(([, c]) => c >= 1.5).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const down = changes.filter(([, c]) => c <= -1.5).sort((a, b) => a[1] - b[1]).slice(0, 2);
  if (up.length) lines.push(`Standing out: ${up.map(([id]) => `${name(id)} (${PLAYER_BY_ID[id].position})`).join(", ")}.`);
  if (down.length) lines.push(`Disappointing so far: ${down.map(([id]) => `${name(id)} (${PLAYER_BY_ID[id].position})`).join(", ")}.`);
  const inst = state.staff?.install[team];
  for (const side of ["offense", "defense"] as const) {
    const v = inst?.[side] ?? 1;
    if (v < 0.75) lines.push(`The new ${side} ${v < 0.45 ? "is still a work in progress; there are a lot of busts in team periods" : "is starting to click, but it isn't second nature yet"}.`);
  }
  if (!lines.length) return;
  send(state, "staff", hcLine(state), "Camp report", lines.join("\n\n"));
}

/** Before the cutdown, the head coach names the winners. */
function decideBattles(state: GameState): void {
  const p = program(state);
  const ours: string[] = [];
  for (const b of p.battles) {
    if (b.winner) continue;
    const [lead, next] = battleStandings(state, b);
    if (!lead) continue;
    b.winner = lead;
    b.decided = state.date;
    if (b.team === state.userTeam) {
      ours.push(`${cap(POS_WORDS[b.pos])}: ${name(lead)}${next ? ` over ${name(next)}` : ""}.`);
    } else if (b.pos === "QB" && next) {
      news(state, `${name(lead)} wins the ${teamLabel(b.team)} starting quarterback job over ${name(next)}`);
    }
  }
  if (ours.length) send(state, "staff", hcLine(state), "Camp battles decided", `Here's where we landed:\n${ours.join("\n")}\n\nThe depth chart on the Roster page reflects it.`);
}

// ---- Notes for the roster page ----

/** A short note on a player's camp for the roster and cutdown pages, or undefined. Never a number. */
export function campNote(state: GameState, team: string, id: string): string | undefined {
  const ps = state.players[id];
  if (ps?.suspended) return `Suspended ${ps.suspended.games} game${ps.suspended.games === 1 ? "" : "s"}`;
  const p = state.program;
  if (!p || p.season !== RULES.season || state.date >= KEY.regularSeasonStart) return undefined;
  const b = p.battles.find((x) => x.team === team && x.ids.includes(id));
  if (b?.winner) return b.winner === id ? "Won the starting job" : "Lost the camp battle";
  if (b) return "In a camp battle";
  if ((p.reps[`${team}:${id}`] ?? 0) >= 4) {
    const c = campChange(state, team, id);
    if (c >= 1.5) return "Strong camp";
    if (c <= -1.5) return "Rough camp";
  }
  const sp = p.spring[id];
  if (sp?.reason === "contract" && sp.plan === "away") return "Skipped OTAs";
  return undefined;
}

// ---- Each day ----

export function campDaily(state: GameState): void {
  const date = state.date;
  if (date < KEY.regularSeasonStart && date >= veteranReportDate(state.userTeam)) {
    openBattles(state);
    if (weekday(date) === "Monday" && date < addDays(KEY.rosterCutdown, -3)) campReport(state);
    if (date === addDays(KEY.rosterCutdown, -3)) decideBattles(state);
  }
  countReps(state);
}

function name(id: string): string {
  return PLAYER_BY_ID[id]?.name ?? "Unknown";
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function hcLine(state: GameState): string {
  const hc = teamStaff(state.userTeam).HC;
  return hc ? `${hc.name}, head coach` : "Head Coach";
}
