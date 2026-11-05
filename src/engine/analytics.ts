// Play value: expected points, EPA, success rate and win probability.
//
// Expected points is what a down, distance and spot is worth on average to
// the team with the ball: about +0.4 at its own 25 on first down, near +4.5
// at the opponent's 20, and below zero deep in its own end on a long third
// down. A play's EPA is the change in expected points it caused, counting any
// points scored. A play is a success when its EPA is positive. Win
// probability comes from the score, the time left and the expected points of
// the drive in progress, with a small home edge. These are the public numbers
// every club and broadcaster can compute from the play-by-play; what a club's
// analysts do with them is in strategy.ts.
//
// This module only reads numbers, so the sim and the feed can both import it.

/** Expected points for the offense at a down, distance and spot (yards from its own goal line). */
export function expectedPoints(down: number, dist: number, ydl: number): number {
  const y = Math.max(1, Math.min(99, ydl));
  const d = Math.max(1, Math.min(20, dist));
  // Fourth down is worth whatever the best choice is worth: go, punt or kick.
  if (down >= 4) {
    const v = fourthDownValues(d, y, genericFg(117 - y));
    return Math.max(v.go, v.punt, v.fg);
  }
  // Second and third down cost what the shrinking chance of a first down costs.
  const adj = down <= 1 ? 0 : down === 2 ? (d <= 4 ? 0 : -0.11 * (d - 4)) : -0.5 - 0.125 * (d - 1.5);
  return Math.max(-2.5, Math.min(6.6, firstDown(y) + adj));
}

/**
 * Expected points on first and ten at a spot: the average next score in the
 * half (for minus against) from that spot, measured from this game's own
 * simulated seasons so EPA averages near zero, as it does in the real league.
 */
const FIRST_DOWN: [number, number][] = [[1, -0.45], [5, -0.13], [15, 0.4], [25, 0.8], [35, 1.43], [45, 2.11], [55, 2.91], [65, 3.66], [75, 4.25], [85, 4.78], [95, 5.93], [99, 6.47]];
function firstDown(y: number): number {
  for (let i = 1; i < FIRST_DOWN.length; i++) {
    const [y1, v1] = FIRST_DOWN[i];
    if (y <= y1) {
      const [y0, v0] = FIRST_DOWN[i - 1];
      return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
    }
  }
  return FIRST_DOWN[FIRST_DOWN.length - 1][1];
}

/** A league-average kicker's chance from a distance. */
function genericFg(distance: number): number {
  return 0.985 / (1 + Math.exp((distance - 62.5) / 6));
}

/** Seconds left in regulation; overtime counts its own clock. */
export function secondsLeft(q: number, clock: number): number {
  return q <= 4 ? (4 - q) * 900 + clock : clock;
}

function normalCdf(z: number): number {
  // Abramowitz and Stegun 7.1.26.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** The home team's chance to win, from the margin, time left and the possession in progress. */
export function winProbHome(q: number, clock: number, homeMargin: number, homeHasBall: boolean, ep: number, over = false): number {
  if (over) return homeMargin > 0 ? 1 : homeMargin < 0 ? 0 : 0.5;
  const t = Math.max(0, secondsLeft(q, clock));
  const lead = homeMargin + (homeHasBall ? ep : -ep) * Math.min(1, 0.4 + t / 3600) + 1.5 * (t / 3600);
  const sd = 13.5 * Math.sqrt(Math.max(t, 15) / 3600);
  return Math.min(0.999, Math.max(0.001, normalCdf(lead / sd)));
}

/** How often a team converts a fourth down at a given distance. */
export function conversionChance(dist: number): number {
  return Math.max(0.18, Math.min(0.72, 0.7 - 0.055 * (dist - 1)));
}

/**
 * The expected-points value of each fourth-down choice, for the offense.
 * fgChance is the kicker's make chance from here.
 */
export function fourthDownValues(dist: number, ydl: number, fgChance: number): { go: number; punt: number; fg: number } {
  const p = conversionChance(dist);
  const made = Math.min(99, ydl + dist);
  const go = p * (made >= 100 ? 7 : firstDown(made)) - (1 - p) * firstDown(100 - ydl);
  const landing = Math.min(80, ydl + 42);
  const punt = -firstDown(100 - landing);
  const fg = fgChance * (3 - 0.6) - (1 - fgChance) * firstDown(Math.max(20, 100 - ydl));
  return { go, punt, fg: ydl >= 50 ? fg : -9 };
}

/** One side's numbers in a game or a season: plays, EPA total and successes, split by pass and run. */
export interface Adv {
  /** Plays, EPA and successes on all scrimmage plays. */
  n: number;
  epa: number;
  s: number;
  /** Dropbacks (passes, sacks, scrambles). */
  pn: number;
  pe: number;
  ps: number;
  /** Designed runs. */
  rn: number;
  re: number;
  rs: number;
  /** Plays of 20+ yards. */
  x: number;
}

export function emptyAdv(): Adv {
  return { n: 0, epa: 0, s: 0, pn: 0, pe: 0, ps: 0, rn: 0, re: 0, rs: 0, x: 0 };
}

export function addAdv(into: Adv, from: Adv | undefined): void {
  if (!from) return;
  for (const k of Object.keys(into) as (keyof Adv)[]) into[k] += from[k] ?? 0;
}

export function perPlay(epa: number, n: number): number {
  return n ? epa / n : 0;
}
