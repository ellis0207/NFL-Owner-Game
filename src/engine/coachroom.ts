// The coach's room: where the owner's voice reaches the football staff
// without taking over. The owner can ask how preseason snaps are shared out,
// sit in on the roster-bubble meeting before cuts, see the contingency plan
// for each position, and choose the special teams plan with the coordinator.
//
// Preseason: "rest" keeps the starters out of every preseason game, "long"
// gives them extra series, and the focus decides whether the backups' snaps
// go to veterans, young players or the bubble. Bubble meeting: five days
// before the cutdown, the GM, the head coach and the analysts each rank the
// players fighting for the last spots; the owner may ask to keep up to three,
// which the GM honors at the cut. Contingency lineup: the order backups step
// in when a starter is out, which the depth chart follows.
import { addDays } from "./dates";
import { send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { keepValue, proposeFinal53 } from "./roster";
import { coachView, perceivedAbility, staffEffects, teamStaff } from "./staff";
import { teamPlayerIds } from "./cap";
import type { StPlan } from "./simtactics";
import type { GameState, Position } from "./types";

export type PreseasonPlan = "rest" | "standard" | "long";
export type PreseasonFocus = "veterans" | "balanced" | "young";

export interface BubbleRow { id: string; pos: Position; gm: number; coach: number; analytics: number; split: boolean }

export interface CoachRoomState {
  preseason?: PreseasonPlan;
  focus?: PreseasonFocus;
  st?: StPlan;
  /** The order backups step in, by position (player ids). */
  contingency?: Partial<Record<Position, string[]>>;
  /** The bubble meeting before this season's cutdown, and the players the owner asked to keep. */
  bubble?: { season: number; date: string; rows: BubbleRow[]; keep: string[] };
}

export const PRESEASON_LABEL: Record<PreseasonPlan, string> = {
  rest: "Rest the starters every preseason game",
  standard: "The head coach decides (a series or two at most)",
  long: "Starters play into the second quarter",
};
export const FOCUS_LABEL: Record<PreseasonFocus, string> = {
  veterans: "Backup snaps to the veterans",
  balanced: "Share them out",
  young: "Backup snaps to the rookies and young players on the bubble",
};

/** Starters per position in the contingency view. */
export const STARTERS_AT: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };

export function coachRoom(state: GameState): CoachRoomState {
  return (state.coachRoom ??= {});
}

export function setPreseason(state: GameState, plan: PreseasonPlan, focus: PreseasonFocus): void {
  Object.assign(coachRoom(state), { preseason: plan, focus });
}

export function setStPlan(state: GameState, plan: StPlan): void {
  coachRoom(state).st = plan;
}

/** Series the starters play in a preseason game, when the owner has asked for something (else the coach decides). */
export function preseasonSeries(state: GameState, team: string, week: number): number | null {
  if (team !== state.userTeam) return null;
  const p = state.coachRoom?.preseason;
  if (!p || p === "standard") return null;
  return p === "rest" ? 0 : week === 3 ? 1 : 3;
}

/**
 * Preseason order of the backups: with a focus on youth, rookies and
 * second-year players move ahead of veteran backups; with a focus on
 * veterans, the other way. Starters stay first.
 */
export function preseasonOrder(state: GameState, team: string, chart: Record<Position, string[]>): void {
  if (team !== state.userTeam) return;
  const f = state.coachRoom?.focus;
  if (!f || f === "balanced") return;
  for (const pos of Object.keys(chart) as Position[]) {
    const n = STARTERS_AT[pos] ?? 1;
    const backups = chart[pos].slice(n);
    const young = (id: string) => (state.players[id]?.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 0) <= 1;
    backups.sort((a, b) => (f === "young" ? Number(young(b)) - Number(young(a)) : Number(young(a)) - Number(young(b))));
    chart[pos] = [...chart[pos].slice(0, n), ...backups];
  }
}

// ---- Contingency lineup ----

export function setContingency(state: GameState, pos: Position, order: string[]): void {
  (coachRoom(state).contingency ??= {})[pos] = order;
}

/** Puts the owner's next-man-up order on the backups of a sorted depth chart. */
export function applyContingency(state: GameState, team: string, chart: Record<Position, string[]>): void {
  if (team !== state.userTeam) return;
  const plan = state.coachRoom?.contingency;
  if (!plan) return;
  for (const [pos, order] of Object.entries(plan) as [Position, string[]][]) {
    const list = chart[pos];
    if (!list || !order?.length) continue;
    const n = STARTERS_AT[pos] ?? 1;
    // Starters missing today are already off the list, so the first backups in the plan fill in.
    const healthyStarters = list.slice(0, n).filter((id) => !order.includes(id) || order.indexOf(id) < n);
    const rest = list.filter((id) => !healthyStarters.includes(id));
    rest.sort((a, b) => (order.includes(a) ? order.indexOf(a) : 99) - (order.includes(b) ? order.indexOf(b) : 99));
    chart[pos] = [...healthyStarters, ...rest];
  }
}

/** Who steps in at each position if a starter goes down, for the owner's view. */
export function contingencyView(chart: Record<Position, string[]>): { pos: Position; starters: string[]; next: string[] }[] {
  return (Object.keys(STARTERS_AT) as Position[]).map((pos) => {
    const n = STARTERS_AT[pos] ?? 1;
    return { pos, starters: chart[pos]?.slice(0, n) ?? [], next: chart[pos]?.slice(n, n + 2) ?? [] };
  });
}

// ---- The bubble meeting ----

/**
 * The players on either side of the line for the 53: the GM's view (talent
 * and upside), the head coach's (what he sees in practice), and the
 * analysts' (production and cost). Where they rank a player far apart, the
 * row is marked split.
 */
export function bubbleBoard(state: GameState, team = state.userTeam): BubbleRow[] {
  const plan = proposeFinal53(state, team);
  const keep = new Set(plan);
  const ids = teamPlayerIds(state, team).filter((id) => ["camp", "active"].includes(state.players[id].status));
  const value = Object.fromEntries(ids.map((id) => [id, keepValue(state, team, id)]));
  const line = [...plan].sort((a, b) => value[a] - value[b]).slice(0, 8);
  const out = ids.filter((id) => !keep.has(id)).sort((a, b) => value[b] - value[a]).slice(0, 8);
  const level = state.analytics?.level ?? 1;
  return [...line, ...out].map((id) => {
    const gm = perceivedAbility(state, id, `gm:${team}`, staffEffects(team).gmEval);
    const coach = coachView(state, team, id);
    // The analysts read production and practice data; a bigger department reads it closer to the truth.
    const analytics = perceivedAbility(state, id, `an:${team}`, 50 + level * 12);
    const vals = [gm, coach, analytics];
    return { id, pos: PLAYER_BY_ID[id].position, gm: Math.round(gm), coach: Math.round(coach), analytics: Math.round(analytics), split: Math.max(...vals) - Math.min(...vals) >= 6 };
  });
}

/** The owner asks the GM to keep a bubble player (at most three). */
export function askToKeep(state: GameState, id: string, keep: boolean): string | null {
  const b = coachRoom(state).bubble;
  if (!b || b.season !== RULES.season) return "The bubble meeting hasn't happened yet.";
  if (keep) {
    if (b.keep.includes(id)) return null;
    if (b.keep.length >= 3) return "You've already asked for three. The staff will take more than that as running the roster yourself.";
    b.keep.push(id);
  } else b.keep = b.keep.filter((x) => x !== id);
  return null;
}

/** Players the owner asked to keep this year, still on the roster. */
export function ownerKeeps(state: GameState): string[] {
  const b = state.coachRoom?.bubble;
  return b && b.season === RULES.season ? b.keep.filter((id) => state.players[id]?.team === state.userTeam) : [];
}

export function coachRoomDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date !== addDays(K.rosterCutdown, -5)) return;
  const rows = bubbleBoard(state);
  coachRoom(state).bubble = { season: RULES.season, date: state.date, rows, keep: [] };
  const split = rows.filter((r) => r.split);
  const hc = teamStaff(state.userTeam).HC?.name ?? "The head coach";
  send(state, "staff", `${teamStaff(state.userTeam).GM?.name ?? "General Manager"}, general manager`, "Roster-bubble meeting",
    `${hc}, the analysts and I went through the players fighting for the last spots on the ${TEAM_BY_ID[state.userTeam].name}' 53. ` +
    `${rows.length} names are on the board in the Coach's room on the Camp page. ` +
    (split.length ? `We don't agree on ${split.map((r) => `${r.pos} ${PLAYER_BY_ID[r.id].name}`).join(", ")}. ` : "We mostly agree. ") +
    "If there's anyone you want kept, say so before the cutdown; you can ask for up to three.");
}
