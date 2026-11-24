// Small readers the graphics kit shares across pages: a club's recent form
// and the words-on-a-scale used by staff reads. They read only what the
// pages already show (results, the staff's words), never a rating.
import { SCHEDULE } from "../engine/league";
import type { GameState } from "../engine/types";

/** A club's last `n` regular-season and playoff results, oldest first. */
export function recentForm(state: GameState, team: string, n = 5): ("W" | "L" | "T")[] {
  const out: ("W" | "L" | "T")[] = [];
  for (const g of SCHEDULE) {
    if (g.type === "PRE" || (g.home !== team && g.away !== team)) continue;
    const r = state.results[g.id];
    if (!r) continue;
    const us = r.home === team ? r.homeScore : r.awayScore;
    const them = r.home === team ? r.awayScore : r.homeScore;
    out.push(us > them ? "W" : us < them ? "L" : "T");
  }
  return out.slice(-n);
}

/** The GM's trust in the owner, as the five words the culture page uses, worst first. */
export const GM_TRUST_STEPS = ["Stopped talking", "Second-guessed", "Wary", "Good", "Complete"];
export function gmTrustStep(v: number): number {
  return v >= 75 ? 4 : v >= 58 ? 3 : v >= 42 ? 2 : v >= 28 ? 1 : 0;
}

/** How the GM and head coach get along, as the four words of `cooperationWord`, worst first. */
export const COOP_STEPS = ["Pulling apart", "Some disputes", "Work well", "Joined at the hip"];
export function coopStep(v: number): number {
  return v >= 72 ? 3 : v >= 55 ? 2 : v >= 40 ? 1 : 0;
}

/** The head coach's seat, in the three words the pages use, coolest first. */
export const SEAT_STEPS = ["Secure", "Some heat", "Hot seat"];
export function seatStep(hot: number): number {
  return hot > 0.7 ? 2 : hot > 0.45 ? 1 : 0;
}

/** Fans' mood toward the front office, as the five words of `fanMood`, worst first. */
export const FAN_STEPS = ["Angry", "Grumbling", "Steady", "Happy", "Fired up"];
export function fanStep(fans: number): number {
  return fans >= 70 ? 4 : fans >= 55 ? 3 : fans >= 45 ? 2 : fans >= 30 ? 1 : 0;
}

/** Fans' and the press's patience on contracts, as the four words of `publicPulse`, worst first. */
export const PULSE_STEPS = ["Angry", "Restless", "Routine", "Happy"];
export function pulseStep(v: number): number {
  return v >= 65 ? 3 : v >= 45 ? 2 : v >= 30 ? 1 : 0;
}
