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

/** Rating points of carry-over per sd of how fast he learns, and of growth per sd of work ethic. */
export const MAKEUP_CARRY = 1;
export const MAKEUP_GROWTH = 1.2;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The first draft class each seed draws outcomes for (older saves keep their earlier classes as they were). */
const firstYear = new Map<number, number>();
let onBind: ((seed: number) => void) | null = null;

/** Set by prospects.ts so a binding change drops the cached classes. */
export function onModelBind(fn: (seed: number) => void): void {
  onBind = fn;
}

/** Whether a class is drawn with unseen NFL outcomes. Seeds no save has bound use it for every class. */
export function modelApplies(seed: number, year: number): boolean {
  return year >= (firstYear.get(seed) ?? 0);
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
  if (firstYear.get(state.seed) === state.draftModelFrom) return;
  firstYear.set(state.seed, state.draftModelFrom);
  onBind?.(state.seed);
}

/** Draws the NFL player a prospect turns into (engine only). */
export function nflOutcome(seed: number, p: Prospect, h: ProspectHidden): NonNullable<ProspectHidden["nfl"]> {
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
  let growth = gaussian(rng) * GROWTH_SD + MAKEUP_GROWTH * work - 1.8;
  if (rng() < BLOOM_ODDS * clamp(1 + 0.4 * work, 0.4, 2)) growth += BLOOM_GAIN[0] + rng() * (BLOOM_GAIN[1] - BLOOM_GAIN[0]);
  // Year one in the league is a step up for everyone: the better the tape, the more there is to lose to NFL
  // speed at first (about 4 points for a first-rounder). Most of it comes back as the room to grow, so the
  // classes arrive like real ones (about 15 rookies a year playing at a Pro Bowl level) and the league's talent holds.
  const entry = clamp((h.overall - 65) * 0.18, 0, ENTRY_MAX);
  const overall = Math.round(clamp(h.overall + carry - entry, 35, 94));
  const potential = Math.round(clamp(h.potential + carry + growth - entry * 0.7, overall, 97));
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
