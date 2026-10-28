// Roster moves: releases, the final cut to 53, the practice squad, injured
// reserve and replacement signings. Every team's decisions are made by its
// own staff from what they believe about players (true ability blurred by
// how good their evaluators are); the owner only sees the outcome.
import { addDeadMoney, capHit, invalidateRosters, releaseCost, signMinimumDeal, teamPlayerIds, chargeYear } from "./cap";
import { addDays } from "./dates";
import { isHurt } from "./injuries";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, SEASON } from "./league";
import { coachView, perceivedAbility, staffEffects } from "./staff";
import type { GameState, Position } from "./types";

export const POSITION_ORDER: Position[] = [
  "QB", "RB", "FB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K", "P", "LS",
];

/** Fewest players a GM keeps at each position on the 53. */
export const MIN_ON_53: Partial<Record<Position, number>> = {
  QB: 2, RB: 3, WR: 5, TE: 3, OT: 4, OG: 3, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1,
};
/** Most a GM keeps at each position on the 53. */
const MAX_ON_53: Partial<Record<Position, number>> = { QB: 3, FB: 1, K: 1, P: 1, LS: 1, RB: 5, TE: 4, C: 3 };

/** What the front office thinks a player is worth keeping: GM and coaches' view, upside, and money already committed. */
export function keepValue(state: GameState, team: string, id: string): number {
  const r = HIDDEN_RATINGS[id];
  const p = PLAYER_BY_ID[id];
  const view = 0.5 * perceivedAbility(state, id, `gm:${team}`, staffEffects(team).gmEval) + 0.5 * coachView(state, team, id);
  const upside = p.yearsExp <= 2 ? 0.35 * (r.potential - r.overall) : 0;
  const committed = Math.min(6, releaseCost(id, state).deadThisYear / 1_000_000); // sunk cost keeps players around
  return view + upside + committed;
}

/** Players counting against the roster limit (90 in camp, 53 after cutdown). */
export function rosterCount(state: GameState, team: string): { roster: number; ps: number; ir: number } {
  let roster = 0;
  let ps = 0;
  let ir = 0;
  for (const id of teamPlayerIds(state, team)) {
    const p = state.players[id];
    if (p.status === "ps") ps++;
    else if (p.status === "ir") ir++;
    else if (p.status === "camp" || p.status === "active") roster++;
  }
  return { roster, ps, ir };
}

/** The GM's plan for the 53: ids to keep, best first. */
export function proposeFinal53(state: GameState, team: string, mustKeep: string[] = []): string[] {
  const ids = teamPlayerIds(state, team).filter((id) => state.players[id].status === "camp" || state.players[id].status === "active");
  const value = Object.fromEntries(ids.map((id) => [id, keepValue(state, team, id)]));
  const byPos = new Map<Position, string[]>();
  for (const id of ids) {
    const pos = PLAYER_BY_ID[id].position;
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  for (const list of byPos.values()) list.sort((a, b) => value[b] - value[a]);

  const keep = new Set<string>(mustKeep.filter((id) => ids.includes(id)));
  const countAt = (pos: Position) => [...keep].filter((id) => PLAYER_BY_ID[id].position === pos).length;
  for (const pos of POSITION_ORDER) {
    for (const id of byPos.get(pos) ?? []) {
      if (keep.size >= RULES.rosterLimits.regularSeason || countAt(pos) >= (MIN_ON_53[pos] ?? 0)) break;
      keep.add(id);
    }
  }
  const rest = ids.filter((id) => !keep.has(id)).sort((a, b) => value[b] - value[a]);
  for (const id of rest) {
    if (keep.size >= RULES.rosterLimits.regularSeason) break;
    const pos = PLAYER_BY_ID[id].position;
    if (countAt(pos) >= (MAX_ON_53[pos] ?? 99)) continue;
    keep.add(id);
  }
  return [...keep].sort((a, b) => value[b] - value[a]);
}

/** The owner's own 53: kept as given, or trimmed to the GM's best 53 if it runs long. */
export function trimPlan(state: GameState, team: string, plan: string[]): string[] {
  return [...plan].sort((a, b) => keepValue(state, team, b) - keepValue(state, team, a)).slice(0, RULES.rosterLimits.regularSeason);
}

export function releasePlayer(state: GameState, id: string): void {
  const p = state.players[id];
  if (!p?.team) return;
  const cost = releaseCost(id, state);
  const year = chargeYear(state);
  addDeadMoney(state, p.team, year, cost.deadThisYear);
  addDeadMoney(state, p.team, year + 1, cost.deadNextYear);
  state.contracts[id] = null;
  state.players[id] = { team: null, status: "fa", injury: p.injury, dev: p.dev };
}

/** Practice squad eligibility, simplified: players with two or fewer accrued seasons, plus up to six veterans. */
const PS_VETERAN_SLOTS = 6;

/** Cut a team to 53 using the given keep list, then sign a practice squad from its own cuts. */
export function applyCutdown(state: GameState, team: string, keepIds: string[]): { cut: string[]; ps: string[] } {
  const keep = new Set(keepIds.slice(0, RULES.rosterLimits.regularSeason));
  const cut: string[] = [];
  for (const id of teamPlayerIds(state, team)) {
    const status = state.players[id].status;
    if (status === "ps" || status === "ir") continue;
    if (keep.has(id)) state.players[id].status = "active";
    else cut.push(id);
  }
  const candidates = cut
    .filter((id) => capHit(id, SEASON, state) < 2_000_000 && !isHurt(state, id))
    .sort((a, b) => HIDDEN_RATINGS[b].potential - HIDDEN_RATINGS[a].potential);
  const ps: string[] = [];
  let veterans = 0;
  for (const id of candidates) {
    if (ps.length >= RULES.rosterLimits.practiceSquad) break;
    const veteran = PLAYER_BY_ID[id].yearsExp >= 3;
    if (veteran && veterans >= PS_VETERAN_SLOTS) continue;
    if (veteran) veterans++;
    ps.push(id);
  }
  const psSet = new Set(ps);
  for (const id of cut) {
    releasePlayer(state, id);
    // Moving to the practice squad still releases the player's contract first.
    if (psSet.has(id)) state.players[id] = { ...state.players[id], team, status: "ps" };
  }
  invalidateRosters(state);
  return { cut: cut.filter((id) => !psSet.has(id)), ps };
}

/**
 * The coaches' depth chart: healthy players by position, best first in the
 * staff's eyes (true ability blurred by their evaluation skill, plus scheme fit).
 */
export function depthChart(state: GameState, team: string, date = state.date): Record<Position, string[]> {
  const chart = Object.fromEntries(POSITION_ORDER.map((p) => [p, [] as string[]])) as Record<Position, string[]>;
  const view: Record<string, number> = {};
  for (const id of teamPlayerIds(state, team)) {
    const status = state.players[id].status;
    if (status !== "active" && status !== "camp") continue;
    if (isHurt(state, id, date)) continue;
    chart[PLAYER_BY_ID[id].position].push(id);
    view[id] = coachView(state, team, id);
  }
  for (const pos of POSITION_ORDER) chart[pos].sort((a, b) => view[b] - view[a]);
  return chart;
}

// ---- Injured reserve and replacements ----

export interface RosterMove {
  team: string;
  text: string;
}

/** Days out that send a player to injured reserve (a four-game minimum stay). */
const IR_THRESHOLD_DAYS = 28;

function bestAvailable(state: GameState, team: string, pos: Position, pool: string[]): string | undefined {
  const gm = staffEffects(team).gmEval;
  let best: string | undefined;
  let bestValue = -Infinity;
  for (const id of pool) {
    if (PLAYER_BY_ID[id].position !== pos || isHurt(state, id)) continue;
    const v = perceivedAbility(state, id, `gm:${team}`, gm);
    if (v > bestValue) {
      bestValue = v;
      best = id;
    }
  }
  return best;
}

let freeAgentCache: { date: string; ids: string[] } | null = null;
function freeAgents(state: GameState): string[] {
  if (freeAgentCache?.date !== state.date) {
    freeAgentCache = { date: state.date, ids: Object.keys(state.players).filter((id) => state.players[id].status === "fa") };
  }
  return freeAgentCache.ids.filter((id) => state.players[id].status === "fa");
}

/** Fills an open spot on the 53 at a position: a practice squad call-up first, otherwise a free agent. */
export function signReplacement(state: GameState, team: string, pos: Position): RosterMove | null {
  const ps = teamPlayerIds(state, team).filter((id) => state.players[id].status === "ps");
  const fromPs = bestAvailable(state, team, pos, ps);
  const id = fromPs ?? bestAvailable(state, team, pos, freeAgents(state));
  if (!id) return null;
  state.players[id] = { ...state.players[id], team, status: "active" };
  invalidateRosters(state);
  signMinimumDeal(state, id, team);
  const name = PLAYER_BY_ID[id].name;
  if (fromPs) {
    // Refill the practice squad spot from the street.
    const refill = bestAvailable(state, team, pos, freeAgents(state).filter((f) => PLAYER_BY_ID[f].yearsExp <= 2));
    if (refill) {
      state.players[refill] = { ...state.players[refill], team, status: "ps" };
      invalidateRosters(state);
    }
    return { team, text: `signed ${pos} ${name} from the practice squad to the 53-man roster` };
  }
  return { team, text: `signed free agent ${pos} ${name}` };
}

/** Moves long-term injured players to IR and signs replacements. Returns what happened. */
export function manageInjuredReserve(state: GameState, team: string): RosterMove[] {
  const moves: RosterMove[] = [];
  const after = state.date > RULES.keyDates.rosterCutdown;
  for (const id of teamPlayerIds(state, team)) {
    const p = state.players[id];
    if (p.status !== "active" && !(p.status === "camp" && !after)) continue;
    if (!p.injury || p.injury.returnDate < addDays(state.date, IR_THRESHOLD_DAYS)) continue;
    // In camp, only season-ending injuries go to IR before the cutdown.
    if (!after && !p.injury.seasonEnding) continue;
    p.status = "ir";
    p.irDate = state.date;
    const pos = PLAYER_BY_ID[id].position;
    moves.push({ team, text: `placed ${pos} ${PLAYER_BY_ID[id].name} on injured reserve (${p.injury.type.toLowerCase()})` });
    if (after) {
      const signed = signReplacement(state, team, pos);
      if (signed) moves.push(signed);
    }
  }
  // Activate healed players whose four-game minimum is up, releasing the weakest player to make room.
  if (after) {
    for (const id of teamPlayerIds(state, team)) {
      const p = state.players[id];
      if (p.status !== "ir" || isHurt(state, id) || !p.irDate || addDays(p.irDate, IR_THRESHOLD_DAYS) > state.date) continue;
      if (p.injury?.seasonEnding) continue;
      const cutId = weakestCuttable(state, team, PLAYER_BY_ID[id].position);
      if (!cutId) continue;
      releasePlayer(state, cutId);
      p.status = "active";
      delete p.irDate;
      moves.push({ team, text: `activated ${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} from injured reserve and released ${PLAYER_BY_ID[cutId].name}` });
    }
  }
  return moves;
}

/** The least valuable healthy player on the 53, preferring the returning player's position. */
function weakestCuttable(state: GameState, team: string, pos: Position): string | undefined {
  const active = teamPlayerIds(state, team).filter((id) => state.players[id].status === "active");
  if (active.length < RULES.rosterLimits.regularSeason) return undefined;
  const counts: Partial<Record<Position, number>> = {};
  for (const id of active) counts[PLAYER_BY_ID[id].position] = (counts[PLAYER_BY_ID[id].position] ?? 0) + 1;
  const cuttable = active.filter((id) => {
    const ppos = PLAYER_BY_ID[id].position;
    return !isHurt(state, id) && (ppos === pos || (counts[ppos] ?? 0) > (MIN_ON_53[ppos] ?? 0));
  });
  cuttable.sort((a, b) => keepValue(state, team, a) - keepValue(state, team, b));
  return cuttable.find((id) => PLAYER_BY_ID[id].position === pos && keepValue(state, team, id) < keepValue(state, team, cuttable[0]) + 3) ?? cuttable[0];
}

/** Keeps a team able to field a lineup: if a position runs out of healthy players, sign one. */
export function fillEmergencies(state: GameState, team: string): RosterMove[] {
  if (state.date <= RULES.keyDates.rosterCutdown) return [];
  const moves: RosterMove[] = [];
  const need: Partial<Record<Position, number>> = { QB: 2, RB: 2, WR: 4, TE: 2, OT: 2, OG: 2, C: 1, EDGE: 3, IDL: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
  const healthy: Partial<Record<Position, number>> = {};
  for (const id of teamPlayerIds(state, team)) {
    if (state.players[id].status !== "active" || isHurt(state, id)) continue;
    const pos = PLAYER_BY_ID[id].position;
    healthy[pos] = (healthy[pos] ?? 0) + 1;
  }
  for (const [pos, min] of Object.entries(need) as [Position, number][]) {
    let have = healthy[pos] ?? 0;
    while (have < min) {
      const cutId = rosterCount(state, team).roster >= RULES.rosterLimits.regularSeason ? weakestCuttable(state, team, pos) : null;
      if (cutId === undefined) break;
      if (cutId) releasePlayer(state, cutId);
      const move = signReplacement(state, team, pos);
      if (!move) break;
      moves.push(move);
      have++;
    }
  }
  return moves;
}
