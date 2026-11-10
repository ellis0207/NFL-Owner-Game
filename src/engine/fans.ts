// The fan base and the market. Each team's metro area has a population that
// grows (or shrinks) at its own rate, a household income level against the
// national figure, and other big-league teams competing for the same money.
// The numbers are approximate 2025 figures, rounded. On top of the market
// sit the people who buy: casual fans, season-ticket subscribers, families,
// corporate clients and premium buyers, each with their own satisfaction and
// price sensitivity. Brand trust moves with how the club treats them, and
// part of any damage lasts for years. Core loyalty is generational: it moves
// a little each season with winning and losing. Post-game surveys read the
// building. The league-wide economy and each market's other entertainment
// move ticket demand, price sensitivity and sponsors.
import { adopted } from "./analysts";
import { business } from "./business";
import { merchLift } from "./clubhouse";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { execBoost } from "./executives";
import { send } from "./inbox";
import { BASE_SEASON, RULES, SCHEDULE, TEAM_BY_ID } from "./league";
import { projectEffects } from "./projects";
import { gaussian, rngFor } from "./rng";
import { DRAW, MARKETS, STADIUM_BY_TEAM } from "./stadiums";
import { standings, winPct } from "./standings";
import type { FanSegment, FanState, GameState, ScheduledGame, Survey, SurveyItem } from "./types";

interface Metro {
  /** Metro population in millions, and the wider region the team draws from. */
  pop: number;
  region: number;
  /** Yearly population growth. */
  growth: number;
  /** Median household income against the national median. */
  income: number;
  /** Other big-league teams (NFL, MLB, NBA, NHL, MLS) in the market. */
  rivals: number;
}

/** Approximate 2025 metro figures. */
export const METRO: Record<string, Metro> = {
  ARI: { pop: 5.1, region: 7.4, growth: 0.018, income: 1.05, rivals: 4 },
  ATL: { pop: 6.3, region: 9.5, growth: 0.015, income: 1.08, rivals: 4 },
  BAL: { pop: 2.85, region: 4.5, growth: 0.003, income: 1.12, rivals: 1 },
  BUF: { pop: 1.16, region: 2.6, growth: -0.001, income: 0.9, rivals: 1 },
  CAR: { pop: 2.8, region: 6.5, growth: 0.02, income: 1.0, rivals: 2 },
  CHI: { pop: 9.4, region: 12, growth: -0.001, income: 1.07, rivals: 5 },
  CIN: { pop: 2.27, region: 3.6, growth: 0.004, income: 0.98, rivals: 2 },
  CLE: { pop: 2.16, region: 3.7, growth: -0.002, income: 0.88, rivals: 2 },
  DAL: { pop: 8.3, region: 11, growth: 0.02, income: 1.08, rivals: 4 },
  DEN: { pop: 3.0, region: 4.5, growth: 0.01, income: 1.18, rivals: 4 },
  DET: { pop: 4.3, region: 6.2, growth: 0.0, income: 0.95, rivals: 3 },
  GB: { pop: 0.33, region: 5.9, growth: 0.005, income: 0.98, rivals: 0 },
  HOU: { pop: 7.5, region: 9.5, growth: 0.02, income: 1.0, rivals: 3 },
  IND: { pop: 2.15, region: 4.5, growth: 0.011, income: 0.98, rivals: 1 },
  JAX: { pop: 1.7, region: 3, growth: 0.018, income: 0.98, rivals: 0 },
  KC: { pop: 2.2, region: 4, growth: 0.007, income: 1.0, rivals: 2 },
  LV: { pop: 2.4, region: 3, growth: 0.016, income: 0.95, rivals: 2 },
  LAC: { pop: 12.9, region: 18.5, growth: -0.002, income: 1.12, rivals: 7 },
  LA: { pop: 12.9, region: 18.5, growth: -0.002, income: 1.12, rivals: 7 },
  MIA: { pop: 6.2, region: 7.5, growth: 0.006, income: 0.95, rivals: 3 },
  MIN: { pop: 3.7, region: 5.8, growth: 0.006, income: 1.15, rivals: 4 },
  NE: { pop: 4.95, region: 8, growth: 0.003, income: 1.3, rivals: 4 },
  NO: { pop: 1.25, region: 3.5, growth: -0.005, income: 0.85, rivals: 1 },
  NYG: { pop: 19.5, region: 23, growth: 0.0, income: 1.15, rivals: 9 },
  NYJ: { pop: 19.5, region: 23, growth: 0.0, income: 1.15, rivals: 9 },
  PHI: { pop: 6.25, region: 8, growth: 0.003, income: 1.1, rivals: 4 },
  PIT: { pop: 2.42, region: 4.5, growth: -0.003, income: 0.98, rivals: 2 },
  SF: { pop: 6.6, region: 9.5, growth: 0.001, income: 1.45, rivals: 5 },
  SEA: { pop: 4.1, region: 6, growth: 0.01, income: 1.3, rivals: 3 },
  TB: { pop: 3.4, region: 5, growth: 0.017, income: 0.95, rivals: 2 },
  TEN: { pop: 2.1, region: 4.5, growth: 0.017, income: 1.02, rivals: 2 },
  WAS: { pop: 6.4, region: 8.5, growth: 0.006, income: 1.4, rivals: 4 },
};

export const SEGMENT_LABEL: Record<FanSegment, string> = {
  casual: "Casual fans", subscribers: "Season-ticket subscribers", families: "Families", corporate: "Corporate clients", premium: "Premium buyers",
};
/** How hard each segment pulls back when prices rise, against a typical single-game buyer. */
export const SEGMENT_ELASTICITY: Record<FanSegment, number> = { casual: 1.15, subscribers: 0.7, families: 1.35, corporate: 0.6, premium: 0.5 };
/** A typical year's spending per household (tickets, food, parking, merchandise) in 2026 dollars, as a multiple of the market's season-ticket price. */
const SEGMENT_SPEND: Record<FanSegment, number> = { casual: 4, subscribers: 28, families: 7, corporate: 45, premium: 120 };
export const SURVEY_LABEL: Record<SurveyItem, string> = { parking: "Parking", lines: "Lines and entry", concessions: "Concessions", cleanliness: "Cleanliness", service: "Staff and service", value: "Value for money" };
const SAT0 = 62;
const TRUST0 = 60;

export function metroPop(team: string, year: number): number {
  const m = METRO[team];
  return m.pop * Math.pow(1 + m.growth, year - BASE_SEASON);
}

export function fanBase(state: GameState): FanState {
  return (state.fans ??= newFans(state));
}

function newFans(state: GameState): FanState {
  const team = state.userTeam;
  const pull = MARKETS[team].pull;
  const brand = Math.pow(DRAW[team] ?? 1, 6);
  const m = METRO[team];
  const national = Math.round(1_500_000 * brand);
  return {
    economy: 1, competition: 1, trust: TRUST0, scar: 0,
    core: Math.round(Math.max(30, Math.min(75, 50 + (pull - 1) * 120))), core0: Math.round(Math.max(30, Math.min(75, 50 + (pull - 1) * 120))),
    sat: { casual: SAT0, subscribers: SAT0, families: SAT0, corporate: SAT0, premium: SAT0 },
    reach: { local: Math.round(m.pop * 1e6 * 0.32 * pull), region: Math.round((m.region - m.pop) * 1e6 * 0.15 * pull), national, intl: Math.round(150_000 * brand) },
    national0: national,
    surveys: [], crm: { season: RULES.season, complaints: 0, upgrades: 0, contacts: 0, newSubs: 0, newBuyers: 0 },
    seasons: [], log: [],
  };
}

/**
 * Ticket demand from the market and the fan base, 1 when nothing has
 * changed since the owner took over. Other teams feel only the market's
 * growth and the economy.
 */
export function fanDemand(state: GameState, team: string): number {
  const year = leagueYear(state.date);
  const f = state.fans;
  const market = Math.pow(metroPop(team, year) / metroPop(team, BASE_SEASON), 0.6) * Math.pow(f?.economy ?? 1, 0.8);
  if (team !== state.userTeam || !f) return market;
  const trust = 1 + ((f.trust - TRUST0) / 100) * 0.15;
  const core = 1 + (f.core - f.core0) / 300;
  const sat = 1 + ((f.sat.casual + f.sat.families) / 2 - SAT0) / 500;
  // A promotion the analysts tested and the club adopted (analysts.ts).
  return market * trust * core * sat * (2 - f.competition) * (1 + adopted(state, "promotion"));
}

/** How strongly single-game buyers respond to price: the segment mix, local incomes, other entertainment and the economy. */
export function priceSensitivity(state: GameState, team: string, familyShare = 0.3): number {
  const m = METRO[team];
  const f = state.fans;
  const mix = (0.6 * SEGMENT_ELASTICITY.casual + familyShare * SEGMENT_ELASTICITY.families + (0.4 - familyShare) * SEGMENT_ELASTICITY.corporate) / 1.155;
  const econ = f && team === state.userTeam ? 1 + (1 - f.economy) * 2 + (f.competition - 1) : 1 + (1 - (f?.economy ?? 1)) * 2;
  return mix * Math.pow(m.income, -0.3) * (1 + (m.rivals - 3) * 0.015) * econ;
}

/** Jerseys and the team store: our stars and how far the brand reaches. */
export function reachLift(state: GameState): number {
  const f = state.fans;
  if (!f) return 1;
  return Math.pow((f.reach.national + f.reach.intl) / (f.national0 + f.national0 / 10), 0.3);
}

export function trustHit(state: GameState, delta: number, scar = 0, why?: string): void {
  const f = fanBase(state);
  f.trust = Math.max(0, Math.min(100, f.trust + delta));
  f.scar = Math.min(40, f.scar + scar);
  if (why) {
    f.log.unshift({ date: state.date, text: why });
    f.log.length = Math.min(f.log.length, 30);
  }
}

export function trustWord(t: number): string {
  return t >= 75 ? "Strong" : t >= 60 ? "Solid" : t >= 45 ? "Shaky" : t >= 30 ? "Poor" : "Broken";
}

// ---- Surveys ----

/** After each regular-season home game, a sample of the crowd rates the day. */
export function survey(state: GameState, g: ScheduledGame, attendance: number, singleMult: number, rng: () => number, adj: Partial<Record<SurveyItem, number>> = {}): Survey {
  const f = fanBase(state);
  const b = business(state);
  const s = STADIUM_BY_TEAM[state.userTeam];
  const pe = projectEffects(state).gate;
  const crowd = attendance / s.capacity;
  const age = Math.max(0, leagueYear(state.date) - s.opened);
  const n = () => gaussian(rng) * 0.35;
  const clamp = (x: number) => Math.round(Math.max(1, Math.min(10, x)) * 10) / 10;
  const tier = { value: 7.6, standard: 7, premium: 6.4 }[b.prices.concessions];
  const scores: Record<SurveyItem, number> = {
    parking: clamp(7.2 - (b.prices.parking - 1) * 3 - Math.max(0, crowd - 0.9) * 6 + b.budget.gameday * 0.2 + n()),
    lines: clamp(7.4 - Math.max(0, crowd - 0.92) * 10 + b.budget.gameday * 0.4 + ((pe.perCap ?? 1) - 1) * 4 + n()),
    concessions: clamp(tier + ((pe.perCap ?? 1) - 1) * 6 + b.budget.gameday * 0.15 + n()),
    cleanliness: clamp(7.4 + (b.budget.facilities - 1) * 0.45 - Math.min(1.5, age / 25) + ((pe.demand ?? 1) - 1) * 8 + n()),
    service: clamp(6.9 + (b.budget.gameday - 1) * 0.5 + execBoost(state, "COO") * 0.3 + n()),
    value: clamp(7.1 - (singleMult - 1) * 5 - ((b.index?.season ?? 1) - 1) * 4 + (tier - 7) * 0.6 + n()),
  };
  // What happened at the venue that day: lines, faults, delays, the plan (venue.ts).
  for (const [k, d] of Object.entries(adj) as [SurveyItem, number][]) scores[k] = clamp(scores[k] + d);
  const overall = Math.round((Object.values(scores).reduce((a, x) => a + x, 0) / 6) * 10) / 10;
  const out: Survey = { game: g.id, date: g.date, scores, overall };
  f.surveys.unshift(out);
  f.surveys.length = Math.min(f.surveys.length, 20);
  // How the segments feel: subscribers weigh the whole day, families the value and the lines, corporate and premium buyers the service.
  const move = (k: FanSegment, x: number) => { f.sat[k] = Math.max(0, Math.min(100, f.sat[k] + x)); };
  move("subscribers", (overall - 7) * 0.8);
  move("casual", (overall - 7) * 0.6);
  move("families", ((scores.value + scores.lines) / 2 - 7) * 0.8);
  move("corporate", ((scores.service + scores.cleanliness) / 2 - 7) * 0.6);
  move("premium", ((scores.service + scores.cleanliness) / 2 - 7) * 0.6);
  // Satisfaction drifts back toward normal between games.
  for (const k of Object.keys(f.sat) as FanSegment[]) f.sat[k] += (SAT0 - f.sat[k]) * 0.03;
  // Bad days become complaints in the customer records.
  const low = Object.values(scores).filter((x) => x < 5.5).length;
  f.crm.complaints += Math.round(attendance * 0.0015 * (1 + low));
  return out;
}

export function surveyAverages(state: GameState, season = RULES.season): { scores: Record<SurveyItem, number>; overall: number; games: number } | null {
  const list = fanBase(state).surveys.filter((x) => x.date >= `${season}-08-01` && x.date < `${season + 1}-03-01`);
  if (!list.length) return null;
  const scores = {} as Record<SurveyItem, number>;
  for (const k of Object.keys(SURVEY_LABEL) as SurveyItem[]) scores[k] = Math.round((list.reduce((a, x) => a + x.scores[k], 0) / list.length) * 10) / 10;
  return { scores, overall: Math.round((list.reduce((a, x) => a + x.overall, 0) / list.length) * 10) / 10, games: list.length };
}

// ---- Value of a customer ----

/**
 * What a household in each segment is worth: a year's spending, the share
 * the club keeps, and how many more years it's likely to keep buying
 * (retention over the 8% the club discounts future money at).
 */
export function lifetimeValue(state: GameState): { seg: FanSegment; spend: number; retention: number; value: number }[] {
  const f = fanBase(state);
  const mk = MARKETS[state.userTeam];
  const idx = business(state).index?.season ?? 1;
  const base: Record<FanSegment, number> = { casual: 0.45, subscribers: 0.86, families: 0.6, corporate: 0.82, premium: 0.88 };
  return (Object.keys(SEGMENT_SPEND) as FanSegment[]).map((seg) => {
    const spend = SEGMENT_SPEND[seg] * mk.ticket * idx;
    const retention = Math.max(0.2, Math.min(0.97, base[seg] + (f.sat[seg] - SAT0) / 300 + (f.trust - TRUST0) / 600 + (f.core - 50) / 800));
    return { seg, spend: Math.round(spend), retention, value: Math.round((spend * 0.6 * retention) / (1 + 0.08 - retention)) };
  });
}

// ---- The seasons ----

function yearly(state: GameState): void {
  const f = fanBase(state);
  const year = leagueYear(state.date);
  const rng = rngFor(state.seed, `economy:${year}`);
  // The economy wanders and drifts back toward normal; other entertainment comes and goes.
  f.economy = Math.max(0.93, Math.min(1.06, f.economy + gaussian(rng) * 0.015 - (f.economy - 1) * 0.3));
  const m = METRO[state.userTeam];
  f.competition = Math.max(0.94, Math.min(1.06, 1 + gaussian(rng) * 0.015 + (m.rivals - 3) * 0.003));
  f.crm = { season: RULES.season, complaints: 0, upgrades: 0, contacts: 0, newSubs: 0, newBuyers: 0 };
}

/** When a season ends: loyalty that lasts generations moves a little, and the brand's reach with it. */
function seasonEnd(state: GameState): void {
  const f = fanBase(state);
  if (f.seasons.includes(RULES.season)) return;
  f.seasons.push(RULES.season);
  const us = state.userTeam;
  const r = standings(state)[us];
  if (!r) return;
  const wp = winPct(r.w, r.l, r.t);
  const playoffs = !!state.seeds?.[TEAM_BY_ID[us].conference].includes(us);
  const sb = SCHEDULE.find((g) => g.round === "SB");
  const res = sb && state.results[sb.id];
  const champ = !!res && ((res.home === us && res.homeScore > res.awayScore) || (res.away === us && res.awayScore > res.homeScore));
  const before = f.core;
  f.core = Math.max(10, Math.min(95, f.core + (wp - 0.5) * 6 + (playoffs ? 1.5 : 0) + (champ ? 4 : 0) - (f.core - 50) * 0.02));
  const rate = (wp - 0.5) * 0.15 + (playoffs ? 0.04 : 0) + (champ ? 0.1 : 0) + (merchLift(state) - 1) * 0.5;
  f.reach.national = Math.round(f.reach.national * (1 + rate) + (f.national0 - f.reach.national) * 0.05);
  f.reach.intl = Math.round(f.reach.intl * (1 + rate * 1.3 + (SCHEDULE.some((g) => g.neutral && (g.home === us || g.away === us) && !(g.city ?? "").match(/, [A-Z]{2}$/)) ? 0.08 : 0)));
  const year = leagueYear(state.date);
  const pop = metroPop(us, year) / metroPop(us, year - 1);
  f.reach.local = Math.round(f.reach.local * pop * (1 + (f.core - before) / 200));
  f.reach.region = Math.round(f.reach.region * pop * (1 + (f.core - before) / 300));
  // Lasting damage heals slowly.
  f.scar = Math.max(0, f.scar - 2);
  if (Math.abs(f.core - before) >= 2) {
    send(state, "business", "Fan research", f.core > before ? "The fan base is growing deeper roots" : "Some longtime fans are drifting",
      `Our yearly fan study shows core loyalty ${f.core > before ? "up" : "down"} to ${Math.round(f.core)} out of 100. ` +
      (f.core > before ? "Kids who grow up with a winner stay fans for life." : "A stretch like this costs a generation of fans if it lasts."));
  }
}

export function fansDaily(state: GameState): void {
  const f = fanBase(state);
  // A new season: the economy and the market's other draws for the year ahead.
  if (f.crm.season !== RULES.season) yearly(state);
  // Trust heals toward where the lasting damage leaves it, a little each week.
  if (state.date.endsWith("-01") || state.date.endsWith("-15")) {
    const target = TRUST0 - f.scar + ((state.culture?.rel.community ?? 60) - 60) / 4;
    f.trust += (target - f.trust) * 0.04;
  }
  if (state.date === addDays(RULES.keyDates.superBowl, 1)) seasonEnd(state);
}
