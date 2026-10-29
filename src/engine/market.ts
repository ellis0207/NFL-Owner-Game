// The player market: what deals cost by position, tags and tenders, age
// curves, comparable contracts, and what a player is really worth to a team.
//
// Asking prices use only what the league can see (a consensus read of the
// player, public stats, age, injury history and recent contracts). True value
// uses hidden ability and each team's scheme, read through that team's staff.
import { dealOf, leagueYear, originalDeal, salaryCap } from "./contracts";
import { ageOn } from "./dates";
import { BASE_SEASON, HIDDEN_RATINGS, PLAYER_BY_ID, PLAYERS, RULES } from "./league";
import { ability, perceivedAbility, schemeFit, staffEffects } from "./staff";
import { seasonTotals } from "./stats";
import type { Deal, GameState, Position } from "./types";

// ---- Tags, tenders and options ----

export type TagGroup = "QB" | "RB" | "WR" | "TE" | "OL" | "DE" | "DT" | "LB" | "CB" | "S" | "ST";

export const TAG_GROUP: Record<Position, TagGroup> = {
  QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", OT: "OL", OG: "OL", C: "OL",
  EDGE: "DE", IDL: "DT", LB: "LB", CB: "CB", S: "S", K: "ST", P: "ST", LS: "ST",
};

/**
 * Franchise and transition tag amounts: 2026 as set by the league, 2027 as
 * projected by OverTheCap (assuming a cap near $327M); later years follow the cap.
 * https://overthecap.com/franchise-transition-and-rfa-tenders
 */
const TAGS: Record<number, Record<TagGroup, [number, number]>> = {
  2026: {
    QB: [43_895_000, 37_833_000], WR: [27_298_000, 23_852_000], DT: [27_127_000, 22_521_000], LB: [26_865_000, 21_925_000],
    OL: [25_773_000, 23_392_000], DE: [24_434_000, 21_512_000], CB: [21_161_000, 18_119_000], S: [20_149_000, 16_012_000],
    TE: [15_045_000, 12_687_000], RB: [14_293_000, 11_323_000], ST: [6_649_000, 6_006_000],
  },
  2027: {
    QB: [50_308_000, 43_763_000], WR: [30_914_000, 26_544_000], OL: [30_125_000, 27_474_000], DT: [29_925_000, 24_806_000],
    LB: [29_902_000, 25_028_000], DE: [27_958_000, 23_367_000], CB: [23_119_000, 19_562_000], S: [22_625_000, 17_914_000],
    TE: [17_479_000, 14_703_000], RB: [15_113_000, 12_497_000], ST: [7_233_000, 6_461_000],
  },
};
const PROJECTED_CAP_2027 = 327_000_000;

const RFA_TENDERS: Record<number, { first: number; second: number; original: number }> = {
  2026: { first: 8_046_000, second: 5_767_000, original: 3_520_000 },
  2027: { first: 8_735_000, second: 6_261_000, original: 3_822_000 },
};

/** Later years' amounts follow the cap from the 2027 projection. */
export function capScale(state: GameState | undefined, year: number): number {
  if (year <= BASE_SEASON) return 1;
  return salaryCap(state, year) / PROJECTED_CAP_2027;
}

function tagRow(year: number): Record<TagGroup, [number, number]> {
  return TAGS[year] ?? TAGS[2027];
}

export function franchiseTag(state: GameState | undefined, pos: Position, year: number, opts: { exclusive?: boolean; priorSalary?: number; timesTagged?: number } = {}): number {
  const base = tagRow(year)[TAG_GROUP[pos]][0] * capScale(state, year);
  // The exclusive tag uses the current top five instead of a five-year average: a little higher.
  const amount = opts.exclusive ? base * 1.06 : base;
  const repeat = opts.timesTagged === 1 ? 1.2 : opts.timesTagged && opts.timesTagged >= 2 ? 1.44 : 1.2;
  return Math.round(Math.max(amount, (opts.priorSalary ?? 0) * repeat) / 1000) * 1000;
}

export function transitionTag(state: GameState | undefined, pos: Position, year: number, priorSalary = 0): number {
  const base = tagRow(year)[TAG_GROUP[pos]][1] * capScale(state, year);
  return Math.round(Math.max(base, priorSalary * 1.2) / 1000) * 1000;
}

export type TenderLevel = "first" | "second" | "original";

export function rfaTender(state: GameState | undefined, level: TenderLevel, year: number, priorSalary = 0): number {
  const row = RFA_TENDERS[year] ?? RFA_TENDERS[2027];
  const scale = capScale(state, year);
  return Math.round(Math.max(row[level] * scale, priorSalary * 1.1) / 1000) * 1000;
}

/** Fifth-year option tiers as a share of the franchise tag, from the 2027 option amounts. */
const OPTION_BASIC: Record<TagGroup, number> = {
  QB: 0.51, RB: 0.72, WR: 0.66, TE: 0.54, OL: 0.74, DE: 0.565, DT: 0.512, LB: 0.6, CB: 0.595, S: 0.58, ST: 0.6,
};
export type OptionTier = "twoProBowls" | "oneProBowl" | "playingTime" | "basic";

export function fifthYearOption(state: GameState | undefined, pos: Position, year: number, tier: OptionTier, pick: number): number {
  const tag = franchiseTag(state, pos, year);
  if (tier === "twoProBowls") return tag;
  if (tier === "oneProBowl") return transitionTag(state, pos, year);
  const basic = OPTION_BASIC[TAG_GROUP[pos]] * (pick <= 10 ? 1.05 : 1);
  return Math.round(tag * (tier === "playingTime" ? basic * 1.1 : basic) / 1000) * 1000;
}

// ---- Age curves ----

/** Age at which decline starts, and how fast (share of value lost per year after). */
const AGE_CURVE: Record<Position, [number, number]> = {
  QB: [34, 0.09], RB: [26, 0.17], FB: [28, 0.12], WR: [29, 0.11], TE: [29, 0.1], OT: [31, 0.09], OG: [31, 0.09], C: [31, 0.09],
  EDGE: [29, 0.1], IDL: [30, 0.1], LB: [28, 0.12], CB: [28, 0.13], S: [29, 0.11], K: [37, 0.06], P: [37, 0.06], LS: [37, 0.05],
};

export function ageFactor(pos: Position, age: number): number {
  const [peak, drop] = AGE_CURVE[pos];
  return age <= peak ? 1 : Math.max(0.25, 1 - drop * (age - peak) * (1 + 0.15 * (age - peak - 1)));
}

/** Years a player can expect to stay near their current level, the basis for contract length. */
export function primeYearsLeft(pos: Position, age: number): number {
  return Math.max(0, AGE_CURVE[pos][0] - age + 1);
}

// ---- The public read of a player ----

const KEY_STAT: Partial<Record<Position, (s: Record<string, number>) => number>> = {
  QB: (s) => (s.passYds ?? 0) + 20 * (s.passTd ?? 0) - 45 * (s.int ?? 0) + (s.rushYds ?? 0),
  RB: (s) => (s.rushYds ?? 0) + (s.recYds ?? 0) + 6 * ((s.rushTd ?? 0) + (s.recTd ?? 0)),
  WR: (s) => (s.recYds ?? 0) + 6 * (s.recTd ?? 0),
  TE: (s) => (s.recYds ?? 0) + 6 * (s.recTd ?? 0),
  EDGE: (s) => 10 * (s.sacks ?? 0) + 3 * (s.qbHits ?? 0) + 2 * (s.tfl ?? 0),
  IDL: (s) => 10 * (s.sacks ?? 0) + 3 * (s.qbHits ?? 0) + 2 * (s.tfl ?? 0),
  LB: (s) => (s.tklSolo ?? 0) + 0.5 * (s.tklAst ?? 0) + 8 * (s.sacks ?? 0) + 10 * (s.defInt ?? 0),
  CB: (s) => 3 * (s.pd ?? 0) + 12 * (s.defInt ?? 0) + 0.3 * (s.tklSolo ?? 0),
  S: (s) => 3 * (s.pd ?? 0) + 12 * (s.defInt ?? 0) + 0.5 * (s.tklSolo ?? 0),
};

const prodCache = new WeakMap<object, Record<string, number>>();

/** How this season's numbers move the market: a breakout year raises the price, a bad one lowers it. */
export function productionBump(state: GameState, id: string): number {
  const totals = seasonTotals(state, "REG");
  let bumps = prodCache.get(totals);
  if (!bumps) {
    bumps = {};
    const byPos: Record<string, [string, number, number][]> = {};
    for (const [pid, { line }] of Object.entries(totals)) {
      const pos = PLAYER_BY_ID[pid]?.position;
      const f = pos && KEY_STAT[pos];
      if (!f || !line.g) continue;
      (byPos[pos] ??= []).push([pid, f(line as Record<string, number>) / line.g, line.g]);
    }
    for (const list of Object.values(byPos)) {
      list.sort((a, b) => b[1] - a[1]);
      const starters = list.slice(0, 32);
      const avg = starters.reduce((s, x) => s + x[1], 0) / Math.max(1, starters.length);
      for (const [pid, perGame, g] of list) {
        if (avg <= 0) continue;
        bumps[pid] = Math.max(-3, Math.min(4, (perGame / avg - 0.85) * 5)) * Math.min(1, g / 8);
      }
    }
    prodCache.set(totals, bumps);
  }
  return bumps[id] ?? 0;
}

/** How well the league as a whole reads players: 32 front offices and the tape are hard to fool for long. */
const MARKET_EYE = 88;

/** The league's consensus read of a player: roughly right, but not exactly. */
export function marketView(state: GameState, id: string): number {
  return perceivedAbility(state, id, "market", MARKET_EYE) + productionBump(state, id);
}

/** Public injury history: recent seasons cut short, and an injury right now. */
export function injuryDiscount(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  const recent = p.stats.filter((s) => s.season >= RULES.season - 3 && Number(s.g ?? 0) > 0);
  const short = recent.filter((s) => Number(s.g) < 10).length;
  const inj = state.players[id]?.injury;
  const now = inj?.seasonEnding ? 0.12 : inj ? 0.03 : 0;
  return Math.max(0.6, 1 - 0.05 * short - now);
}

// ---- Market curves ----

interface Curve { views: number[]; shares: number[]; top: number; spill: number; ceiling: number }
const curveCache = new WeakMap<GameState, Record<string, Curve>>();

const VETERAN_KINDS = new Set(["veteran", "extension", "franchise", "transition"]);

/** Call after any veteran contract is signed, so the market sees it. */
export function invalidateMarket(state: GameState): void {
  curveCache.delete(state);
}

/**
 * The cap a contract's APY is measured against. Real deals use the cap of the
 * year they were signed, the way the public trackers report them. Deals
 * signed in the game use the cap of their first new league year, the same cap
 * they were priced on: an extension signed in the season is priced on next
 * year's cap, and measuring it on this year's would read every new deal as a
 * bigger share than it is and push each market up year after year.
 */
function capAtSigning(state: GameState, deal: Deal): number {
  const y = Number(deal.signed.slice(0, 4));
  if (y < BASE_SEASON || deal.signed <= `${BASE_SEASON}-03-15`) return capAt(y);
  const signedIn = leagueYear(deal.signed);
  const first = deal.kind === "extension" ? signedIn + 1 : deal.years.find((x) => !x.void && x.year >= signedIn)?.year ?? signedIn;
  return salaryCap(state, first);
}

/**
 * Price curve per position: veteran deals' APY as a share of the cap, against
 * the consensus view of the players who hold them. The curve is the going rate
 * for players the league sees a certain way (a monotone fit of share on view),
 * not a rank-for-rank match, so a player who reads like a mid-tier starter is
 * priced like the mid-tier starters actually are. Live contracts are used, so
 * a new top deal resets the market.
 */
function curves(state: GameState): Record<string, Curve> {
  let c = curveCache.get(state);
  if (c) return c;
  const pts: Record<string, { v: number; s: number }[]> = {};
  for (const p of PLAYERS) {
    const deal = dealOf(state, p.id);
    if (!deal || !VETERAN_KINDS.has(deal.kind) || !deal.apy || isStreetDeal(deal)) continue;
    if (Number(deal.signed.slice(0, 4)) < RULES.season - 4) continue;
    (pts[p.position] ??= []).push({ v: perceivedAbility(state, p.id, "market", MARKET_EYE), s: deal.apy / capAtSigning(state, deal) });
  }
  c = {};
  const ceilings = baselineCeilings(state);
  for (const [pos, list] of Object.entries(pts)) {
    const { views, shares } = goingRate(list);
    const top = Math.max(...list.map((x) => x.s));
    c[pos] = { views, shares, top, spill: 1, ceiling: ceilings[pos] ?? top * 1.1 };
  }
  // Spillover: when the top of one market jumps, agents at neighboring positions point to it.
  const base = baselineTops(state);
  const heat = (pos: string) => {
    const now = c![pos] ? topFive(pts[pos].map((x) => x.s).sort((a, b) => a - b)) : 0;
    return base[pos] && now ? Math.max(0.9, Math.min(1.3, now / base[pos])) : 1;
  };
  for (const [pos, curve] of Object.entries(c)) {
    const near = NEIGHBORS[pos as Position] ?? [];
    if (near.length) curve.spill = 1 + 0.25 * near.reduce((sum, n) => sum + heat(n) - 1, 0) / near.length;
  }
  curveCache.set(state, c);
  return c;
}

/** Pool-adjacent-violators: the average share paid at each level of view, never falling as the view rises. */
function goingRate(list: { v: number; s: number }[]): { views: number[]; shares: number[] } {
  const blocks: { v: number; s: number; n: number }[] = [];
  for (const x of [...list].sort((a, b) => a.v - b.v)) {
    blocks.push({ v: x.v, s: x.s, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].n > blocks[blocks.length - 1].s / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      const a = blocks[blocks.length - 1];
      a.v += b.v;
      a.s += b.s;
      a.n += b.n;
    }
  }
  return { views: blocks.map((b) => b.v / b.n), shares: blocks.map((b) => b.s / b.n) };
}

/** A one-year deal signed off the street in camp or during the season: not a market price. */
export function isStreetDeal(deal: Deal): boolean {
  return deal.signed > RULES.keyDates.franchiseTagExtensionDeadline && deal.signed <= RULES.keyDates.regularSeasonEnd
    && deal.years.filter((y) => !y.void).length === 1 && deal.kind === "veteran";
}

/** Positions whose markets move together. */
const NEIGHBORS: Partial<Record<Position, Position[]>> = {
  WR: ["TE"], TE: ["WR"], OT: ["OG"], OG: ["OT", "C"], C: ["OG"],
  EDGE: ["IDL"], IDL: ["EDGE"], LB: ["S"], CB: ["S"], S: ["CB", "LB"],
};

function topFive(sorted: number[]): number {
  const top = sorted.slice(-5);
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
}

let baseline: Record<string, number> | null = null;
let ceilingsAtStart: Record<string, number> | null = null;

/** The top of each market when the game starts, from the real contracts. */
function baselineTops(state: GameState): Record<string, number> {
  if (baseline) return baseline;
  const pts = baselineShares(state);
  baseline = {};
  for (const [pos, list] of Object.entries(pts)) baseline[pos] = topFive(list);
  return baseline;
}

/**
 * The most any player can command at a position: the biggest real deal when
 * the game starts, as a share of the cap. Top-of-market shares of the cap barely move
 * in the real league (the best quarterback deal has been about a fifth of the
 * cap for years), so they shouldn't climb without limit here either.
 */
function baselineCeilings(state: GameState): Record<string, number> {
  if (ceilingsAtStart) return ceilingsAtStart;
  ceilingsAtStart = {};
  for (const [pos, list] of Object.entries(baselineShares(state))) ceilingsAtStart[pos] = list[list.length - 1];
  return ceilingsAtStart;
}

function baselineShares(state: GameState): Record<string, number[]> {
  const pts: Record<string, number[]> = {};
  for (const p of PLAYERS) {
    const deal = originalDeal(p.id);
    if (!deal || !VETERAN_KINDS.has(deal.kind) || !deal.apy) continue;
    if (Number(deal.signed.slice(0, 4)) < BASE_SEASON - 4) continue;
    (pts[p.position] ??= []).push(deal.apy / capAtSigning(state, deal));
  }
  for (const list of Object.values(pts)) list.sort((a, b) => a - b);
  return pts;
}

/** Real caps for the years before the game starts. */
function capAt(year: number): number {
  const caps: Record<number, number> = { 2021: 182_500_000, 2022: 208_200_000, 2023: 224_800_000, 2024: 255_400_000, 2025: 279_200_000 };
  return caps[year] ?? RULES.salaryCap;
}

/** The cap share a player with a given consensus view commands at a position. */
export function shareFor(state: GameState, pos: Position, view: number): number {
  const c = curves(state)[pos];
  if (!c || !c.views.length) return 0.003;
  const n = c.views.length;
  if (view <= c.views[0]) return c.shares[0];
  // A player better than everyone already paid gets a little more than the going rate at the top, up to the ceiling.
  if (view >= c.views[n - 1]) return Math.min(c.ceiling, c.shares[n - 1] * c.spill * Math.min(1.06, 1 + 0.015 * (view - c.views[n - 1])));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c.views[mid] <= view) lo = mid; else hi = mid;
  }
  const t = (view - c.views[lo]) / Math.max(1e-6, c.views[hi] - c.views[lo]);
  return Math.min(c.ceiling, (c.shares[lo] + t * (c.shares[hi] - c.shares[lo])) * c.spill);
}

/** The biggest APY the position commands in a league year: the ceiling share of that year's cap. */
export function marketCeiling(state: GameState, pos: Position, year: number): number {
  return (curves(state)[pos]?.ceiling ?? 1) * salaryCap(state, year);
}

export function topOfMarket(state: GameState, pos: Position): number {
  return curves(state)[pos]?.top ?? 0;
}

// ---- Prices ----

export interface MarketPrice {
  /** APY for the first new league year, dollars. */
  apy: number;
  years: number;
  /** Share of total value guaranteed at signing. */
  guaranteeShare: number;
  /** Share of the cap. */
  share: number;
}

/** What the market says a player should get on a new deal starting in a league year. */
export function marketPrice(state: GameState, id: string, startYear: number): MarketPrice {
  const p = PLAYER_BY_ID[id];
  const age = (ageOn(p.birthDate, state.date) ?? 26) + Math.max(0, startYear - leagueYear(state.date) - 0.5);
  const view = marketView(state, id);
  let share = shareFor(state, p.position, view) * ageFactor(p.position, Math.round(age)) * injuryDiscount(state, id);
  const minShare = 1_200_000 / RULES.salaryCap;
  share = Math.max(minShare, share);
  const apy = Math.round((share * salaryCap(state, startYear)) / 50_000) * 50_000;
  const prime = primeYearsLeft(p.position, Math.round(age));
  const years = Math.max(1, Math.min(5, share > 0.04 ? Math.round(2 + prime * 0.6) : share > 0.012 ? Math.min(3, 1 + Math.round(prime * 0.4)) : 1));
  const guaranteeShare = Math.min(0.72, 0.12 + share * 3);
  return { apy, years, guaranteeShare, share };
}

// ---- Comparable contracts ----

export interface Comp {
  id: string;
  name: string;
  team: string;
  signed: string;
  years: number;
  apy: number;
  guaranteed: number;
  share: number;
}

/** Recent veteran deals at the position with the closest public profile: the agent's ammunition and yours. */
export function comps(state: GameState, id: string, count = 6): Comp[] {
  const p = PLAYER_BY_ID[id];
  const view = marketView(state, id);
  const out: (Comp & { score: number })[] = [];
  for (const q of PLAYERS) {
    if (q.id === id || q.position !== p.position) continue;
    const deal = dealOf(state, q.id);
    if (!deal || !VETERAN_KINDS.has(deal.kind) || deal.kind === "franchise" || deal.kind === "transition" || !deal.apy || isStreetDeal(deal)) continue;
    const signedYear = Number(deal.signed.slice(0, 4));
    if (signedYear < RULES.season - 3) continue;
    const cap = capAtSigning(state, deal);
    const score = Math.abs(perceivedAbility(state, q.id, "market", MARKET_EYE) - view) + (RULES.season - signedYear) * 1.5;
    out.push({
      id: q.id, name: q.name, team: state.players[q.id]?.team ?? deal.team, signed: deal.signed,
      years: deal.years.filter((y) => !y.void).length, apy: deal.apy, guaranteed: deal.guaranteedAtSigning,
      share: deal.apy / cap, score,
    });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, count).sort((a, b) => b.apy - a.apy).map(({ score: _s, ...c }) => c);
}

// ---- What a player is really worth to a team (engine only) ----

/**
 * The APY a team's front office thinks a player is worth to them: the market
 * price for the ability they believe the player has, plus scheme fit, with
 * their own age and durability judgment. Staff skill sets how close it is to the truth.
 */
export function teamValue(state: GameState, team: string, id: string, startYear: number): number {
  const p = PLAYER_BY_ID[id];
  const fx = staffEffects(team);
  // Front offices anchor to the market and adjust by their own scouting; better evaluators trust their eye more.
  const own = Math.max(0.5, Math.min(0.9, 0.5 + (fx.gmEval - 50) / 100));
  const view = own * (perceivedAbility(state, id, `gm:${team}`, fx.gmEval) + productionBump(state, id)) + (1 - own) * marketView(state, id) + 0.35 * schemeFit(state, id, team);
  const age = (ageOn(p.birthDate, state.date) ?? 26) + Math.max(0, startYear - leagueYear(state.date) - 0.5);
  const dur = HIDDEN_RATINGS[id]?.durability ?? 70;
  const durability = Math.max(0.65, Math.min(1.05, 0.7 + dur / 250));
  const share = shareFor(state, p.position, view) * ageFactor(p.position, Math.round(age)) * durability;
  return Math.round((share * salaryCap(state, startYear)) / 50_000) * 50_000;
}

/** The true value, for grading deals after the fact. */
export function trueValue(state: GameState, id: string, startYear: number): number {
  const p = PLAYER_BY_ID[id];
  const age = (ageOn(p.birthDate, state.date) ?? 26) + Math.max(0, startYear - leagueYear(state.date) - 0.5);
  const share = shareFor(state, p.position, ability(state, id)) * ageFactor(p.position, Math.round(age));
  return Math.round(share * salaryCap(state, startYear));
}

export function isVeteranDeal(deal: Deal | null): boolean {
  return !!deal && VETERAN_KINDS.has(deal.kind);
}

/** For tests: the original data deal's share of the cap at signing. */
export function dataShare(id: string): number {
  const d = originalDeal(id);
  return d.apy / capAt(Number(d.signed.slice(0, 4)));
}
