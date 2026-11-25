// Keeps each position's talent on the league's own scale over many seasons.
//
// The 2026 ratings are a ranking within each position (pipeline/ratings.py turns a player's usage,
// production, contract and draft slot into his percentile at his position, then into a rating), so a
// 90 means "about the tenth-best tackle", whatever year it is. The sim's growth and aging are absolute:
// left alone, small leans add up over many drafts, and a position drifts (its starters bunch together,
// or a whole room gets better than the men across from it). Stats come from those match-ups, so ten
// seasons on the leaders thin out: fewer big sack seasons once tackles outgrow pass rushers, fewer
// 1,000-yard backs once every back is about as good as the starter.
//
// Once a year, after the offseason's growth and aging, each position's best players are pulled part of
// the way back to the 2026 spread at that position: the same average and the same gap between the best
// and the rest. Nobody's place in his position's order changes, so a player who grew more than his
// peers still passes them; only the scale is held. Like `cfbRollover` does for the college field.
import { BASE_SEASON, HIDDEN_RATINGS, PLAYERS, PLAYER_BY_ID, TEAMS } from "./league";
import { liveIds } from "./live";
import { clearFitCache } from "./staff";
import type { GameState, Position } from "./types";

/** Players per club counted at each position (starters plus the first backups), for the scale. */
export const SCALE_DEPTH: Partial<Record<Position, number>> = {
  QB: 2, RB: 2, WR: 5, TE: 3, OT: 3, OG: 3, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 3,
};
/** Share of the gap to the 2026 scale closed each year, and the most one player moves in a year. */
export const SCALE_PULL = 0.5;
export const SCALE_MAX_STEP = 3;

interface Scale { mean: number; sd: number }

function scaleOf(values: number[], n: number): Scale {
  const top = [...values].sort((a, b) => b - a).slice(0, n);
  const mean = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  const sd = Math.sqrt(top.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, top.length));
  return { mean, sd };
}

let reference: Partial<Record<Position, number[]>> | null = null;

/** Each position's ratings in the starting season (players who came with the league, not later draftees). */
function referenceRatings(): Partial<Record<Position, number[]>> {
  if (reference) return reference;
  reference = {};
  for (const p of PLAYERS) {
    if (p.rookieYear && p.rookieYear > BASE_SEASON) continue;
    const r = HIDDEN_RATINGS[p.id];
    if (r && SCALE_DEPTH[p.position]) (reference[p.position] ??= []).push(r.overall);
  }
  return reference;
}

/** Pulls each position's talent back toward the starting season's scale. Run once a year, after growth. */
export function holdTalentScale(state: GameState): void {
  const ref = referenceRatings();
  const by: Partial<Record<Position, string[]>> = {};
  for (const id of liveIds(state)) {
    const pos = state.players[id].pos ?? PLAYER_BY_ID[id]?.position;
    if (pos && SCALE_DEPTH[pos] && HIDDEN_RATINGS[id]) (by[pos] ??= []).push(id);
  }
  const level = (id: string) => HIDDEN_RATINGS[id].overall + (state.players[id].dev ?? 0);
  for (const [pos, ids] of Object.entries(by) as [Position, string[]][]) {
    // The best n at the position now against the best n in the starting season (n grows with the league).
    const n = Math.round(SCALE_DEPTH[pos]! * TEAMS.length);
    if (!ref[pos] || ids.length < 10) continue;
    const want = scaleOf(ref[pos]!, n);
    const now = scaleOf(ids.map(level), n);
    if (now.sd <= 0) continue;
    const stretch = want.sd / now.sd;
    for (const id of ids) {
      const x = level(id);
      const target = want.mean + (x - now.mean) * stretch;
      // Ratings top out at 99, as they do everywhere else (careers.ts).
      const step = Math.max(25 - x, Math.min(99 - x, Math.max(-SCALE_MAX_STEP, Math.min(SCALE_MAX_STEP, (target - x) * SCALE_PULL))));
      if (Math.abs(step) < 0.01) continue;
      const p = state.players[id];
      p.dev = Math.round(((p.dev ?? 0) + step) * 100) / 100;
      // The ceiling moves with him, so the room he had left is what it was.
      p.pot = Math.round(((p.pot ?? 0) + step) * 100) / 100;
    }
  }
  clearFitCache();
}
