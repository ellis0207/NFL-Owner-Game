// What a prospect becomes once he is in the league, which nobody can know on
// draft day. Scouts, the combine and the media all read the player on tape
// (the `overall`, `potential` and traits a class is generated with). The
// player who shows up is that player plus two things no one sees: how his
// game carries over to NFL speed, and how much he still grows.
//
// The carry-over is mostly small, but some players never adjust (the game is
// too fast, the technique doesn't hold up) and a few are better than anyone
// saw. Growth varies far more than scouts think: some top picks are finished
// products at 22, and some late picks keep getting better for years. Only a
// trace of the carry-over shows in college production, so a front office
// that weighs production well finds a little of it (scoutops.ts). Makeup is
// the rest of what can be known: hard workers bust less and bloom more, and
// quick learners carry their game over, so a deep scouting file (character,
// work habits, how fast he picks things up) is worth having. Other clubs'
// boards go by the tape alone.
//
// Tuned so drafts look like real ones (tests/draft-outcomes-report.ts): about
// two in three first-rounders and one in twenty seventh-rounders are starting
// in their third season, and about half of a class's 32 best players come from
// outside the first round.
import type { Prospect, ProspectHidden } from "./prospects";
import { gaussian, rngFor } from "./rng";
import { PHYSICAL } from "./aging";
import type { GameState } from "./types";

/** Spread of the carry-over to NFL speed, in rating points, for an ordinary prospect. */
export const CARRY_SD = 4.8;
/** Share of prospects whose game doesn't carry over, and the range they lose. */
export const BUST_ODDS = 0.15;
export const BUST_LOSS: [number, number] = [3, 9];
/** Share who turn out better than anyone saw, and the range they gain. */
export const GEM_ODDS = 0.07;
export const GEM_GAIN: [number, number] = [4, 10];
/** Spread of growth left over what the tape shows. */
export const GROWTH_SD = 8.5;
/** Late bloomers: growth nobody projected. */
export const BLOOM_ODDS = 0.1;
export const BLOOM_GAIN: [number, number] = [5, 12];

/** The most a prospect gives up to NFL speed in his first year, in rating points. */
export const ENTRY_MAX = 4;

/**
 * Where a class goes from its first season, by how good its tape was (the 2026 ratings by years in the
 * league). First-rounders come in about 79 and settle about 85, with a spread of about ten; second- and
 * third-rounders come in about 75 and stay there on average but scatter widely (one in six becomes a
 * 90, about as many fall out of the league); day-three picks and undrafted players average no growth at
 * all, and only the bloomers and gems among them become starters. So growth can be negative: a player
 * who never takes to the league fades over a few seasons toward the player he really is (careers.ts).
 *
 * `TIER_SHIFT` is growth's mean by tape and `TIER_SPREAD` its spread, both in rating points, read
 * between the listed tapes. Without them the late rounds grew like the early ones and nobody faded, so
 * within a few seasons rosters were deep in near-starters and short of stars: backups nearly as good as
 * the men ahead of them, carries, catches and sacks spread thin, and the league's leaders thinned out.
 */
export const TIER_SHIFT: [number, number][] = [[50, -8], [60, -6.3], [65, -5.9], [75, -5.4], [78, -2.5], [81, 0.3], [84, 1.1], [88, 2]];
export const TIER_SPREAD: [number, number][] = [[52, 6], [58, 9.4], [72, 9.4], [75, 11.6], [78, 11.6], [81, 7.6]];

/** A value read off a table of [x, y] points, held flat past either end. */
function table(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
/**
 * Day-three tape overstates the player a little more than early-round tape: real day-three rookies
 * come in about three and a half points under what their draft slot's tape suggests. The most taken
 * off, at a tape of `DAY3_TAPE`, fading to nothing `DAY3_WIDTH` points either side.
 */
export const DAY3_DROP = 3.5;
export const DAY3_TAPE = 66;
export const DAY3_WIDTH = 10;

/** Rating points of carry-over per sd of how fast he learns, and of growth per sd of work ethic. */
export const MAKEUP_CARRY = 1;
export const MAKEUP_GROWTH = 1.2;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The first draft class each seed draws outcomes for (older saves keep their earlier classes as they were). */
const firstYear = new Map<number, number>();
/** The first class whose growth goes by its tier (`TIER_SHIFT`); older saves get it from a class not yet scouted. */
const tierYear = new Map<number, number>();
let onBind: ((seed: number) => void) | null = null;

/** Set by prospects.ts so a binding change drops the cached classes. */
export function onModelBind(fn: (seed: number) => void): void {
  onBind = fn;
}

/** Whether a class is drawn with unseen NFL outcomes. Seeds no save has bound use it for every class. */
export function modelApplies(seed: number, year: number): boolean {
  return year >= (firstYear.get(seed) ?? 0);
}

/** Whether a class's growth goes by its tier. */
export function tierApplies(seed: number, year: number): boolean {
  return year >= (tierYear.get(seed) ?? 0);
}

/**
 * Binds the save's first class with unseen outcomes. A new game has it from its first class; a save
 * from before this model gets it from the class after the one it is scouting, so no player it has
 * drafted or scouted changes under it.
 */
export function bindDraftModel(state: GameState): void {
  if (state.seed === undefined) return;
  const season = state.season ?? 2026;
  state.draftModelFrom ??= season + 2;
  state.draftTierFrom ??= Math.max(state.draftModelFrom, season + 2);
  if (firstYear.get(state.seed) === state.draftModelFrom && tierYear.get(state.seed) === state.draftTierFrom) return;
  firstYear.set(state.seed, state.draftModelFrom);
  tierYear.set(state.seed, state.draftTierFrom);
  onBind?.(state.seed);
}

/** Draws the NFL player a prospect turns into (engine only). */
export function nflOutcome(seed: number, p: Prospect, h: ProspectHidden, tiered = true): NonNullable<ProspectHidden["nfl"]> {
  const rng = rngFor(seed, `nfl:${p.id}`);
  const special = p.position === "K" || p.position === "P" || p.position === "LS";
  // Makeup is the part of the future a deep scouting file can see (scouting.ts reads it at 50 and 70
  // knowledge): players who work at it bust less and bloom more, and quick learners carry their game over.
  const work = clamp((h.workEthic - 72) / 13, -2.5, 2.5);
  const learn = clamp((h.footballIq - ((h.traits.decisions ?? h.overall) * 0.5 + 36)) / 9, -2.5, 2.5);
  const conduct = clamp((h.character - 72) / 14, -2.5, 1);
  let carry = (gaussian(rng) * CARRY_SD + MAKEUP_CARRY * learn) * (special ? 0.6 : 1);
  const bustOdds = BUST_ODDS * clamp(1 - 0.3 * work - 0.2 * learn - 0.15 * conduct, 0.4, 2);
  const roll = rng();
  if (roll < bustOdds) carry -= BUST_LOSS[0] + rng() * (BUST_LOSS[1] - BUST_LOSS[0]);
  else if (roll < bustOdds + GEM_ODDS) carry += GEM_GAIN[0] + rng() * (GEM_GAIN[1] - GEM_GAIN[0]);
  // The tails would move the class's average; take it back out so the league's talent holds.
  carry -= BUST_ODDS * (BUST_LOSS[0] + BUST_LOSS[1]) / 2 - GEM_ODDS * (GEM_GAIN[0] + GEM_GAIN[1]) / 2;
  let growth = tiered
    ? gaussian(rng) * table(TIER_SPREAD, h.overall) + MAKEUP_GROWTH * work + table(TIER_SHIFT, h.overall)
    : gaussian(rng) * GROWTH_SD + MAKEUP_GROWTH * work - 1.8;
  // The day-three gap is about how tape reads, not the player: no trace in production.
  const adj = tiered ? -DAY3_DROP * Math.max(0, 1 - Math.abs(h.overall - DAY3_TAPE) / DAY3_WIDTH) : 0;
  if (rng() < BLOOM_ODDS * clamp(1 + 0.4 * work, 0.4, 2)) growth += BLOOM_GAIN[0] + rng() * (BLOOM_GAIN[1] - BLOOM_GAIN[0]);
  // Year one in the league is a step up for everyone: the better the tape, the more there is to lose to NFL
  // speed at first (about 4 points for a first-rounder). Most of it comes back as the room to grow, so the
  // classes arrive like real ones (about 15 rookies a year playing at a Pro Bowl level) and the league's talent holds.
  const entry = clamp((h.overall - 65) * 0.18, 0, ENTRY_MAX);
  const overall = Math.round(clamp(h.overall + carry + adj - entry, 35, 94));
  // Under the tiered model the ceiling can sit below where he starts: he fades toward it.
  const potential = Math.round(clamp(h.potential + carry + adj + growth - entry * 0.7, tiered ? 35 : overall, 97));
  // The carry-over is about the game, not the stopwatch: speed and strength are what the combine measured.
  const keys = Object.keys(h.traits);
  const weight = (k: string) => 1 - (PHYSICAL[k] ?? 0.5);
  const total = keys.reduce((s, k) => s + weight(k), 0);
  const even = total < keys.length * 0.3;
  const shift = overall - h.overall;
  const traits: Record<string, number> = {};
  for (const k of keys) traits[k] = Math.round(clamp(h.traits[k] + (even ? shift : shift * weight(k) * keys.length / total), 25, 99));
  return { overall, potential, traits, prod: Math.round(carry * 0.35 * 10) / 10 };
}
