// Injuries: what happens, how long it takes, and how the training staff changes both.
import { addDays, ageOn } from "./dates";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES } from "./league";
import { projectEffects } from "./projects";
import type { Rng } from "./rng";
import { staffEffects } from "./staff";
import type { GameState, Injury } from "./types";

interface InjuryType {
  type: string;
  /** Typical days out, low and high. A season-ending injury uses its recovery time. */
  days: [number, number];
  weight: number;
  /** Soft-tissue and minor injuries that also happen in practice. */
  practice?: boolean;
}

// Shares are loosely based on NFL injury report frequency.
const TYPES: InjuryType[] = [
  { type: "Ankle sprain", days: [3, 14], weight: 13, practice: true },
  { type: "High ankle sprain", days: [14, 42], weight: 5 },
  { type: "Hamstring strain", days: [7, 28], weight: 12, practice: true },
  { type: "Concussion", days: [5, 16], weight: 8 },
  { type: "Knee sprain (MCL)", days: [14, 42], weight: 6 },
  { type: "Torn ACL", days: [270, 330], weight: 2.2 },
  { type: "Torn Achilles", days: [280, 340], weight: 1.1, practice: true },
  { type: "Shoulder sprain", days: [5, 21], weight: 6 },
  { type: "Groin strain", days: [5, 21], weight: 5, practice: true },
  { type: "Calf strain", days: [7, 21], weight: 4, practice: true },
  { type: "Broken hand", days: [21, 42], weight: 1.8 },
  { type: "Broken forearm", days: [42, 77], weight: 0.6 },
  { type: "Rib injury", days: [7, 21], weight: 3 },
  { type: "Back spasms", days: [2, 10], weight: 3, practice: true },
  { type: "Knee bruise", days: [2, 10], weight: 6 },
  { type: "Foot sprain", days: [7, 28], weight: 3, practice: true },
  { type: "Lisfranc injury", days: [56, 98], weight: 0.7 },
  { type: "Turf toe", days: [14, 42], weight: 1.8 },
  { type: "Torn pectoral", days: [120, 170], weight: 0.7 },
  { type: "Torn meniscus", days: [21, 49], weight: 1.3 },
  { type: "Neck stinger", days: [2, 10], weight: 2 },
  { type: "Quad strain", days: [5, 21], weight: 3, practice: true },
  { type: "Elbow sprain", days: [7, 21], weight: 1.3 },
  { type: "Wrist sprain", days: [4, 14], weight: 2 },
  { type: "Hip pointer", days: [3, 10], weight: 2 },
];
const PRACTICE_TYPES = TYPES.filter((t) => t.practice);

function pick(rng: Rng, list: InjuryType[]): InjuryType {
  const total = list.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of list) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

/** The owner's medical and training budget (see business.ts): only our team's changes from league average. */
function medical(state: GameState, team: string): { risk: number; days: number } {
  const lvl = team === state.userTeam ? Math.min(3, (state.business?.budget.medical ?? 1) + projectEffects(state).medical) : 1;
  return { risk: [1.05, 1, 0.97, 0.95][lvl], days: [1.07, 1, 0.96, 0.92][lvl] };
}

/** How likely a player is to get hurt relative to an average player with an average training staff. */
export function injuryRisk(state: GameState, id: string, team: string): number {
  const durability = HIDDEN_RATINGS[id]?.durability ?? 70;
  const prevention = staffEffects(team).injuryPrevention;
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 26;
  return (1.65 - durability / 100) * (1.3 - prevention / 220) * (age >= 31 ? 1.15 : 1) * medical(state, team).risk;
}

/** Creates an injury for a player. Returns the injury and the days out. */
export function injure(state: GameState, id: string, team: string, rng: Rng, practice = false): { injury: Injury; days: number } {
  const t = pick(rng, practice ? PRACTICE_TYPES : TYPES);
  const recovery = staffEffects(team).injuryRecovery;
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 26;
  const base = t.days[0] + (t.days[1] - t.days[0]) * Math.pow(rng(), 1.4);
  const days = Math.max(1, Math.round(base * (1.22 - recovery / 300) * (age >= 30 ? 1.1 : 1) * medical(state, team).days));
  const returnDate = addDays(state.date, days);
  const injury: Injury = {
    type: t.type, date: state.date, returnDate,
    seasonEnding: returnDate > RULES.keyDates.superBowl,
  };
  const p = state.players[id];
  // A new injury on top of an old one keeps the later return date.
  if (!p.injury || p.injury.returnDate < returnDate) p.injury = injury;
  return { injury: p.injury, days };
}

export function isHurt(state: GameState, id: string, date = state.date): boolean {
  const inj = state.players[id]?.injury;
  return !!inj && inj.returnDate > date;
}

/** Owner-facing status for the next game. */
export function injuryStatus(state: GameState, id: string, gameDate: string): "Out" | "Doubtful" | "Questionable" | null {
  const inj = state.players[id]?.injury;
  if (!inj || inj.returnDate <= state.date) return null;
  if (inj.returnDate > gameDate) return "Out";
  return inj.returnDate >= addDays(gameDate, -1) ? "Doubtful" : "Questionable";
}

/** Clears injuries that have healed. */
export function healInjuries(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (p.injury && p.injury.returnDate <= state.date) delete p.injury;
  }
}
