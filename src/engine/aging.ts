// How each skill ages on its own. A player's overall development (`dev`)
// still sets how good he is; this module decides which of his traits carry
// that change. Each trait keeps its own offset from `dev` in `tdev`, and the
// offsets always average to zero across the player's traits, so his overall
// ability is the same as before: only its make-up shifts.
//
// The pattern follows published NFL aging studies (GPS and combine retests,
// and production curves by age):
//   * Top speed, quickness and burst peak around 24-26 and slip every year
//     after about 27, faster once a player is past his position's prime.
//     Running backs and corners, who live on them, fall off first.
//   * Strength and power hold a few years longer, into the late twenties.
//   * Arm strength fades in the mid thirties; a quarterback's reads and
//     decisions keep improving into his thirties (interception rate falls
//     and completion rate holds while scramble yards drop from the late
//     twenties).
//   * Catching, route running and blocking technique are learned: receivers'
//     catch rates hold or rise into their early thirties while yards after
//     the catch fall, and linemen play on technique into their mid thirties.
// So a 34-year-old receiver can have the surest hands of his career and
// still lose two steps, and a young player's technique grows faster than his
// already near-peak speed. Nobody sees a number: staff reports say when a
// player has lost a step but kept his craft.
import { HIDDEN_RATINGS } from "./league";
import { gaussian, type Rng } from "./rng";
import type { GameState } from "./types";

/**
 * How much of a trait is body rather than craft (1 = pure athleticism,
 * 0 = pure skill). Physical traits carry most of the decline with age;
 * skill traits carry most of the learning.
 */
export const PHYSICAL: Record<string, number> = {
  speed: 1, agility: 1, burst: 1, mobility: 0.9, kickPower: 0.8,
  deep: 0.75, yac: 0.75, arm: 0.7, power: 0.7, range: 0.7,
  strength: 0.6, man: 0.6, press: 0.5, passRush: 0.5, runBlock: 0.45,
  runStop: 0.4, blitz: 0.4, blocking: 0.4, box: 0.35, coverage: 0.35,
  passBlock: 0.3, receiving: 0.25, zone: 0.2, routes: 0.2, accuracy: 0.2,
  vision: 0.15, kickAccuracy: 0.15, placement: 0.1, hands: 0.05, decisions: 0,
};

const physOf = (t: string) => PHYSICAL[t] ?? 0.5;
const round2 = (x: number) => Math.round(x * 100) / 100;
/** No trait drifts more than this far from the player's overall development. */
const MAX_TILT = 25;

/**
 * The year's tilt between body and craft, in rating points per unit of
 * physical share. Positive moves value from physical traits to skill traits.
 * `growth` and `decline` are the parts of the year's overall change that came
 * from learning and from age (both as positive numbers); `line` is the age
 * where the position usually starts to slip.
 */
export function yearTilt(age: number, line: number, growth: number, decline: number): number {
  // Practice and film build technique faster than a young body changes.
  const learn = 0.3 + 0.35 * Math.max(0, growth);
  // Speed starts slipping a few years before the player as a whole does.
  const fade = 0.45 * Math.max(0, age - (line - 3));
  // When age does take its toll, the body takes most of it.
  return TILT_SCALE * (learn + fade + 1.4 * Math.max(0, decline));
}

/**
 * How hard the tilt runs, set against the real ratings the game starts from:
 * across the 2026 league, players over 30 carry about 2 to 5 points more
 * craft than body compared with players under 24 at the skill positions, and
 * none at all on the lines. At full strength the tilt built 10 to 40 points
 * over a career, so within a few seasons every veteran quarterback read
 * defenses better than anyone in 2026 and every lineman blocked on technique
 * alone: sacks and interceptions thinned out and ten-sack seasons all but
 * disappeared. A quarter of it keeps the shape and matches the data.
 */
export const TILT_SCALE = 0.25;

/**
 * Moves each trait's offset by the tilt: physical traits down, skill traits up,
 * averaging to zero so the player's overall stays where `dev` put it. `noise`
 * lets one player's hands age better than another's.
 */
export function tiltTraits(state: GameState, id: string, tilt: number, rng?: Rng, noise = 0): void {
  const r = HIDDEN_RATINGS[id];
  const p = state.players[id];
  if (!r || !p || !tilt) return;
  const names = Object.keys(r.traits);
  if (names.length < 2) return;
  const mean = names.reduce((s, t) => s + physOf(t), 0) / names.length;
  const moves = names.map((t) => (mean - physOf(t)) * tilt + (rng && noise ? gaussian(rng) * noise : 0));
  const center = moves.reduce((s, m) => s + m, 0) / moves.length;
  const tdev = (p.tdev ??= {});
  names.forEach((t, i) => {
    const v = Math.max(-MAX_TILT, Math.min(MAX_TILT, (tdev[t] ?? 0) + moves[i] - center));
    tdev[t] = round2(v);
  });
}

/**
 * How far a player's body has fallen behind his craft since the save began
 * (engine only): the gap between his skill traits' offsets and his physical
 * traits' offsets. Read by staff reports.
 */
export function bodyVsCraft(state: GameState, id: string): number {
  const r = HIDDEN_RATINGS[id];
  const tdev = state.players[id]?.tdev;
  if (!r || !tdev) return 0;
  let body = 0, bw = 0, craft = 0, cw = 0;
  for (const t of Object.keys(r.traits)) {
    const ph = physOf(t);
    body += ph * (tdev[t] ?? 0);
    bw += ph;
    craft += (1 - ph) * (tdev[t] ?? 0);
    cw += 1 - ph;
  }
  return (cw ? craft / cw : 0) - (bw ? body / bw : 0);
}
