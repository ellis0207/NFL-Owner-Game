// Game-day conditions: the weather at open-air stadiums, and the rest and
// travel each team brings in. Wind takes away the deep ball and long field
// goals, cold makes the ball hard to throw and catch, rain and snow put it on
// the ground, and Denver's thin air carries kicks. Teams on a short week, a
// long trip or a West Coast body clock at a 1 PM East Coast kickoff play a
// little flat; a team off its bye is a little fresher. None of it decides a
// game on its own: the effects are about the size the betting markets give
// them.
import { SCHEDULE } from "./league";
import { daysBetween } from "./dates";
import { gaussian, rngFor } from "./rng";
import { STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, ScheduledGame } from "./types";

export interface Weather {
  indoor: boolean;
  /** Degrees Fahrenheit at kickoff. */
  temp: number;
  /** Sustained wind, miles per hour. */
  wind: number;
  precip: "none" | "rain" | "snow";
}

export interface Conditions {
  weather: Weather;
  /** Rating points added to each team's form for rest and travel. */
  edge: { away: number; home: number };
  /** Completion percentage points taken off by depth of throw. */
  comp: { screen: number; short: number; inter: number; deep: number };
  /** How much less often offenses throw deep. */
  deepMult: number;
  /** Yards taken off (or added to) a kicker's range, and points off his accuracy. */
  kickRange: number;
  kickAcc: number;
  fumbleMult: number;
}

// Kickoff-time normals for each open-air home city, September through January
// (average high, degrees F), typical wind, the share of game days with rain or
// snow, and how much of December and January's wet weather is snow. From
// public climate normals, rounded. Domes and retractable roofs play indoors.
const CLIMATE: Record<string, { temp: [number, number, number, number, number]; wind: number; wet: number; snow: number }> = {
  BUF: { temp: [70, 58, 47, 36, 31], wind: 12, wet: 0.35, snow: 0.6 },
  MIA: { temp: [89, 85, 80, 77, 76], wind: 9, wet: 0.3, snow: 0 },
  NE: { temp: [74, 63, 52, 41, 36], wind: 10, wet: 0.3, snow: 0.35 },
  NYJ: { temp: [77, 65, 54, 44, 39], wind: 10, wet: 0.3, snow: 0.25 },
  NYG: { temp: [77, 65, 54, 44, 39], wind: 10, wet: 0.3, snow: 0.25 },
  BAL: { temp: [79, 67, 56, 46, 42], wind: 9, wet: 0.28, snow: 0.15 },
  CIN: { temp: [80, 68, 55, 44, 39], wind: 8, wet: 0.3, snow: 0.2 },
  CLE: { temp: [74, 62, 50, 39, 34], wind: 12, wet: 0.35, snow: 0.45 },
  PIT: { temp: [76, 64, 52, 41, 36], wind: 9, wet: 0.33, snow: 0.35 },
  JAX: { temp: [87, 80, 73, 67, 65], wind: 8, wet: 0.3, snow: 0 },
  TEN: { temp: [84, 73, 61, 51, 48], wind: 8, wet: 0.28, snow: 0.05 },
  DEN: { temp: [79, 66, 53, 44, 45], wind: 9, wet: 0.15, snow: 0.6 },
  KC: { temp: [80, 68, 55, 43, 39], wind: 11, wet: 0.25, snow: 0.3 },
  PHI: { temp: [79, 67, 56, 46, 41], wind: 9, wet: 0.28, snow: 0.2 },
  WAS: { temp: [80, 69, 58, 48, 44], wind: 8, wet: 0.27, snow: 0.12 },
  CHI: { temp: [75, 62, 48, 36, 31], wind: 13, wet: 0.3, snow: 0.5 },
  GB: { temp: [71, 58, 44, 30, 25], wind: 11, wet: 0.3, snow: 0.65 },
  CAR: { temp: [83, 73, 63, 53, 51], wind: 7, wet: 0.27, snow: 0.05 },
  TB: { temp: [90, 85, 78, 73, 71], wind: 8, wet: 0.3, snow: 0 },
  SF: { temp: [82, 77, 67, 59, 59], wind: 9, wet: 0.15, snow: 0 },
  SEA: { temp: [70, 60, 51, 45, 47], wind: 8, wet: 0.45, snow: 0.05 },
};
// International regular-season games: a European autumn, near enough.
const ABROAD = { temp: [66, 58, 50, 45, 43] as [number, number, number, number, number], wind: 10, wet: 0.35, snow: 0 };

// Hours behind Eastern time at each home stadium (Arizona's clocks match the Pacific in the fall).
const ZONE: Record<string, number> = {
  DEN: 2, ARI: 3, LV: 3, LAC: 3, LA: 3, SF: 3, SEA: 3,
  CHI: 1, GB: 1, MIN: 1, DAL: 1, HOU: 1, KC: 1, NO: 1, TEN: 1,
};

function monthIndex(date: string): number {
  const m = Number(date.slice(5, 7));
  return m >= 9 ? m - 9 : m <= 2 ? 4 : 0; // August plays like September, February like January
}

export function weatherFor(state: GameState, g: ScheduledGame, home: string): Weather {
  const stadium = STADIUM_BY_TEAM[home];
  const abroad = g.neutral && g.type === "REG";
  const climate = abroad ? ABROAD : g.neutral ? undefined : CLIMATE[home];
  if (!climate || (!abroad && stadium?.roof !== "open")) return { indoor: true, temp: 70, wind: 0, precip: "none" };
  const rng = rngFor(state.seed, `weather:${g.id}`);
  const mi = monthIndex(g.date);
  const august = g.date.slice(5, 7) === "08" ? 4 : 0;
  const night = g.timeET >= "19:00" ? -6 : 0;
  const temp = Math.round(climate.temp[mi] + august + night + gaussian(rng) * 7);
  const wind = Math.max(0, Math.round(climate.wind + gaussian(rng) * 5));
  // Most wet days aren't wet for all three hours of a game.
  const wet = rng() < climate.wet * 0.45;
  const snowShare = mi >= 3 ? climate.snow : mi === 2 ? climate.snow / 2 : 0;
  const precip = !wet ? "none" : temp <= 34 && rng() < snowShare * 1.4 ? "snow" : temp <= 30 ? "none" : "rain";
  return { indoor: false, temp, wind, precip };
}

/** The last game a team played before a date this season, if any. */
function lastGame(team: string, date: string): ScheduledGame | undefined {
  let best: ScheduledGame | undefined;
  for (const g of SCHEDULE) {
    if (g.date >= date || (g.away !== team && g.home !== team)) continue;
    if (!best || g.date > best.date) best = g;
  }
  return best;
}

/** Rest and travel, in rating points of form. */
function restEdge(state: GameState, g: ScheduledGame, team: string, side: "away" | "home", home: string): number {
  if (g.type === "PRE") return 0;
  let edge = 0;
  const prev = g.type === "POST" ? undefined : lastGame(team, g.date);
  // In the playoffs only the top seeds come in rested, off the wild card bye.
  if (g.type === "POST" && g.round === "DIV" && Object.values(state.seeds ?? {}).some((s) => s[0] === team)) edge += 0.3;
  if (prev && prev.type !== "PRE") {
    const rest = daysBetween(prev.date, g.date);
    if (rest <= 4) edge -= side === "away" ? 0.5 : 0.35; // the Thursday game after a Sunday
    else if (rest >= 12) edge += 0.3; // off the bye
  }
  if (side === "away" && !g.neutral) {
    const gap = (ZONE[team] ?? 0) - (ZONE[home] ?? 0);
    if (gap >= 2 && g.timeET < "14:00") edge -= 0.35; // a West Coast body clock at 10 AM
    else if (Math.abs(gap) >= 2) edge -= 0.15;
  }
  return edge;
}

export function gameConditions(state: GameState, g: ScheduledGame, away: string, home: string): Conditions {
  const w = weatherFor(state, g, home);
  const windy = Math.max(0, w.wind - 10) / 10;
  const cold = Math.max(0, 40 - w.temp) / 20;
  const rain = w.precip === "rain" ? 1 : 0;
  const snow = w.precip === "snow" ? 1 : 0;
  const all = 0.012 * cold + 0.015 * rain + 0.03 * snow;
  return {
    weather: w,
    edge: { away: restEdge(state, g, away, "away", home), home: restEdge(state, g, home, "home", home) },
    comp: { screen: all * 0.5, short: all + 0.008 * windy, inter: all + 0.025 * windy, deep: all + 0.05 * windy },
    deepMult: Math.max(0.5, 1 - 0.15 * windy - 0.25 * snow - 0.05 * rain),
    kickRange: 3.5 * windy + 2 * cold + 1 * rain + 3 * snow - (home === "DEN" && !g.neutral ? 3 : 0),
    kickAcc: 0.02 * windy + 0.02 * rain + 0.04 * snow,
    fumbleMult: 1 + 0.1 * cold + 0.25 * rain + 0.4 * snow,
  };
}

export function weatherLine(w: Weather): string {
  if (w.indoor) return "Indoors";
  const sky = w.precip === "snow" ? "snow" : w.precip === "rain" ? "rain" : w.temp >= 80 ? "hot" : "dry";
  return `${w.temp}°F, wind ${w.wind} mph, ${sky}`;
}

/** Weather worth a sentence in the game story. */
export function notableWeather(w: Weather): string | null {
  if (w.indoor) return null;
  if (w.precip === "snow") return `It was played in the snow, ${w.temp} degrees at kickoff.`;
  if (w.wind >= 20) return `A ${w.wind}-mph wind shaped the game plans on both sides.`;
  if (w.precip === "rain" && w.wind >= 14) return `Wind and rain made it a sloppy afternoon.`;
  if (w.precip === "rain") return "It rained most of the game.";
  if (w.temp <= 20) return `It was ${w.temp} degrees at kickoff.`;
  return null;
}
