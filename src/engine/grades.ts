// Contract grades from made-up media outlets. Each outlet has its own eye for
// talent and its own biases, so the same deal can be an A in one place and a C
// in another. Grades are what the public thinks, not the truth.
import { leagueYear } from "./contracts";
import { daysBetween } from "./dates";
import { marketPrice } from "./market";
import { PLAYER_BY_ID } from "./league";
import { gaussian, rngFor } from "./rng";
import type { GameState, Position, Signing } from "./types";

interface Outlet {
  name: string;
  /** How far their read of a player can be from the consensus. */
  noise: number;
  /** Positions they think are overpaid or underpaid as a group. */
  bias: Partial<Record<Position, number>>;
  /** Penalty per share of the deal guaranteed above 40%. */
  guaranteeTaste: number;
  /** Extra credit for re-signing your own stars. */
  loyaltyTaste: number;
}

export const OUTLETS: Outlet[] = [
  { name: "The Gridiron Ledger", noise: 0.06, bias: { RB: -0.18, LB: -0.1, QB: 0.06, EDGE: 0.05, OT: 0.05 }, guaranteeTaste: 0.1, loyaltyTaste: 0 },
  { name: "Sideline Report", noise: 0.1, bias: { RB: 0.06, WR: 0.04 }, guaranteeTaste: 0, loyaltyTaste: 0.06 },
  { name: "Cap Space Daily", noise: 0.08, bias: {}, guaranteeTaste: 0.35, loyaltyTaste: 0 },
];

const LETTERS: [number, string][] = [
  [1.25, "A+"], [1.15, "A"], [1.08, "A-"], [1.02, "B+"], [0.96, "B"], [0.9, "B-"], [0.85, "C+"], [0.79, "C"], [0.73, "C-"], [0.65, "D"],
];

export function letter(ratio: number): string {
  return LETTERS.find(([min]) => ratio >= min)?.[1] ?? "F";
}

const GRADE_POINTS: Record<string, number> = { "A+": 4.3, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, D: 1, F: 0 };
export function gradePoints(g: string): number {
  return GRADE_POINTS[g] ?? 2;
}

function take(ratio: number, s: Pick<Signing, "apy" | "years" | "guaranteed">, name: string, gShare: number): string {
  if (ratio >= 1.15) return `${name} at this price is a bargain.`;
  if (ratio >= 1.02) return "Fair money for what the team is getting.";
  if (ratio >= 0.9) return gShare > 0.55 ? "The guarantees are steep, but the player is worth a lot of it." : "A little rich, but defensible.";
  if (ratio >= 0.79) return s.years >= 4 ? "Too many years at too much money." : "The team paid a premium here.";
  return "A big overpay that could age badly.";
}

/** Grades a deal from each outlet's point of view, using only public information. */
export function gradeDeal(state: GameState, s: Pick<Signing, "player" | "team" | "date" | "years" | "apy" | "guaranteed" | "total">, startYear: number, reSigned: boolean) {
  const p = PLAYER_BY_ID[s.player];
  // A free agent still unsigned weeks in has told everyone what the market thinks.
  const fa = state.fa?.[s.player];
  const waited = fa && fa.status === "open" ? Math.max(0, daysBetween(fa.since, s.date) - 2) : 0;
  const fair = marketPrice(state, s.player, startYear).apy * Math.max(0.8, 1 - 0.005 * waited);
  const gShare = s.total ? s.guaranteed / s.total : 0;
  return OUTLETS.map((o) => {
    const rng = rngFor(state.seed, `grade:${o.name}:${s.player}:${s.date}`);
    let ratio = (fair / Math.max(1, s.apy)) * (1 + (o.bias[p.position] ?? 0)) * (1 + gaussian(rng) * o.noise);
    ratio -= Math.max(0, gShare - 0.4) * o.guaranteeTaste;
    if (reSigned) ratio += o.loyaltyTaste;
    if (s.apy < 2_000_000) ratio = Math.max(ratio, 0.97);
    return { outlet: o.name, grade: letter(ratio), take: take(ratio, s, p.name.split(" ").slice(-1)[0], gShare) };
  });
}

/** The public re-grade of a deal today: the same outlets, judging with what they know now. */
export function regrade(state: GameState, s: Signing): string {
  const p = PLAYER_BY_ID[s.player];
  if (!p) return "C";
  const fair = marketPrice(state, s.player, leagueYear(state.date)).apy;
  const ratio = fair / Math.max(1, s.apy);
  return letter(ratio);
}
