// Roster moves: releases, the final cut to 53 and the practice squad.
// Team decisions here are made by each team's GM from true ratings; the
// owner only sees the outcome.
import { addDeadMoney, capHit, releaseCost, teamPlayerIds } from "./cap";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, SEASON } from "./league";
import type { GameState, Position } from "./types";

export const POSITION_ORDER: Position[] = [
  "QB", "RB", "FB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K", "P", "LS",
];

/** Fewest players a GM keeps at each position on the 53. */
const MIN_ON_53: Partial<Record<Position, number>> = {
  QB: 2, RB: 3, WR: 5, TE: 3, OT: 4, OG: 3, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1,
};
/** Most a GM keeps at each position on the 53. */
const MAX_ON_53: Partial<Record<Position, number>> = { QB: 3, FB: 1, K: 1, P: 1, LS: 1, RB: 5, TE: 4, C: 3 };

/** How much a GM values keeping a player: ability now, upside, and money already committed. */
function keepValue(id: string): number {
  const r = HIDDEN_RATINGS[id];
  const p = PLAYER_BY_ID[id];
  const upside = p.yearsExp <= 2 ? 0.35 * (r.potential - r.overall) : 0;
  const committed = Math.min(6, releaseCost(id).deadThisYear / 1_000_000); // sunk cost keeps players around
  return r.overall + upside + committed;
}

export function rosterCount(state: GameState, team: string): { roster: number; ps: number } {
  let roster = 0;
  let ps = 0;
  for (const p of Object.values(state.players)) {
    if (p.team !== team) continue;
    if (p.status === "ps") ps++;
    else if (p.status === "camp" || p.status === "active") roster++;
  }
  return { roster, ps };
}

/** The GM's plan for the 53: ids to keep, best first. */
export function proposeFinal53(state: GameState, team: string, mustKeep: string[] = []): string[] {
  const ids = teamPlayerIds(state, team).filter((id) => state.players[id].status !== "ps");
  const byPos = new Map<Position, string[]>();
  for (const id of ids) {
    const pos = PLAYER_BY_ID[id].position;
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  for (const list of byPos.values()) list.sort((a, b) => keepValue(b) - keepValue(a));

  const keep = new Set<string>(mustKeep.filter((id) => ids.includes(id)));
  const countAt = (pos: Position) => [...keep].filter((id) => PLAYER_BY_ID[id].position === pos).length;
  for (const pos of POSITION_ORDER) {
    for (const id of byPos.get(pos) ?? []) {
      if (keep.size >= RULES.rosterLimits.regularSeason || countAt(pos) >= (MIN_ON_53[pos] ?? 0)) break;
      keep.add(id);
    }
  }
  const rest = ids.filter((id) => !keep.has(id)).sort((a, b) => keepValue(b) - keepValue(a));
  for (const id of rest) {
    if (keep.size >= RULES.rosterLimits.regularSeason) break;
    const pos = PLAYER_BY_ID[id].position;
    if (countAt(pos) >= (MAX_ON_53[pos] ?? 99)) continue;
    keep.add(id);
  }
  return [...keep].sort((a, b) => keepValue(b) - keepValue(a));
}

/** The owner's own 53: kept as given, or trimmed to the GM's best 53 if it runs long. */
export function trimPlan(plan: string[]): string[] {
  return [...plan].sort((a, b) => keepValue(b) - keepValue(a)).slice(0, RULES.rosterLimits.regularSeason);
}

export function releasePlayer(state: GameState, id: string): void {
  const p = state.players[id];
  if (!p?.team) return;
  const cost = releaseCost(id);
  addDeadMoney(state, p.team, SEASON, cost.deadThisYear);
  addDeadMoney(state, p.team, SEASON + 1, cost.deadNextYear);
  state.players[id] = { team: null, status: "fa" };
}

/** Practice squad eligibility, simplified: players with two or fewer accrued seasons, plus up to six veterans. */
const PS_VETERAN_SLOTS = 6;

/** Cut a team to 53 using the given keep list, then sign a practice squad from its own cuts. */
export function applyCutdown(state: GameState, team: string, keepIds: string[]): { cut: string[]; ps: string[] } {
  const keep = new Set(keepIds.slice(0, RULES.rosterLimits.regularSeason));
  const cut: string[] = [];
  for (const id of teamPlayerIds(state, team)) {
    if (state.players[id].status === "ps") continue;
    if (keep.has(id)) state.players[id].status = "active";
    else cut.push(id);
  }
  const candidates = cut
    .filter((id) => capHit(id) < 2_000_000)
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
    if (psSet.has(id)) {
      // Moving to the practice squad still releases the player's contract first.
      releasePlayer(state, id);
      state.players[id] = { team, status: "ps" };
    } else {
      releasePlayer(state, id);
    }
  }
  return { cut: cut.filter((id) => !psSet.has(id)), ps };
}

/** Players a coach would start this week, by position, best first. */
export function depthChart(state: GameState, team: string): Record<Position, string[]> {
  const chart = Object.fromEntries(POSITION_ORDER.map((p) => [p, [] as string[]])) as Record<Position, string[]>;
  for (const id of teamPlayerIds(state, team)) {
    if (state.players[id].status === "ps") continue;
    chart[PLAYER_BY_ID[id].position].push(id);
  }
  for (const pos of POSITION_ORDER) chart[pos].sort((a, b) => HIDDEN_RATINGS[b].overall - HIDDEN_RATINGS[a].overall);
  return chart;
}
