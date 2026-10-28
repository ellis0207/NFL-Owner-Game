// Trades: players and draft picks between teams, under the league's rules.
//
// The window runs from the new league year to the trade deadline (4 PM ET on
// the Tuesday after Week 9). Between the deadline and the end of the season
// nothing moves; after the Super Bowl teams can agree to deals, and they
// become official when the new league year opens. Every team has to be under
// the cap once a trade is processed, and inside its roster limit.
//
// The money follows the CBA: the team that acquires a player takes on the
// rest of his salary and its guarantees for the weeks that are left. The
// signing bonus stays with the team that paid it: this year's proration stays
// on its cap and later years' accelerate as dead money (onto next year for a
// trade after June 1). Practice squad players are free agents and can't be
// traded, nor can a player on a reserve/future deal before it starts, a
// tagged or tendered player who hasn't signed, a player with a no-trade clause
// who won't waive it, or a matched offer-sheet player to the team that made
// the sheet within a year.
//
// Teams judge trades by what they believe (their GM's eye, not the truth):
// how good a player is and will be, what his contract costs against what he's
// worth, whether he'd start for them, and where the team is headed. Contenders
// pay for now; rebuilders want picks and youth. Draft picks are valued on a
// draft value chart at the slot the team is projected to pick, a year out
// worth less than this year's.
import { agentFor, changeMorale, morale, priorities } from "./agents";
import { addDeadMoney, capHit, capLimit, deadMoney, invalidateRosters, isTop51, psCapHit, teamPlayerIds } from "./cap";
import { dealCapHit, dealOf, lastYear, leagueYear, REG_WEEKS, salaryCap, tradeCharges, tradedDeal, weeksPaid } from "./contracts";
import { addDays, ageOn, daysBetween, shortDate } from "./dates";
import { OUTLETS, letter } from "./grades";
import { gradeLean } from "./outlets";
import { money, news, send } from "./inbox";
import { HIDDEN_RATINGS, onSeasonChange, PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { ageFactor, marketView, productionBump, shareFor } from "./market";
import { STARTERS } from "./negotiation";
import { isOffseason, NEXT, off, OFFSEASON_START } from "./offseason";
import { gaussian, rngFor } from "./rng";
import { depthChart, logMove, releasePlayer, rosterLimit, rosterStatusNow, signReplacement, weakestOnRoster } from "./roster";
import { ability, perceivedAbility, schemeFit, staffEffects, teamStaff, upside } from "./staff";
import { standings } from "./standings";
import type { GameState, Position, TradeAsset, TradeDeal, TradeOffer, TradeRecord, TradeState } from "./types";

const KEY = RULES.keyDates;
/** Picks in the next three drafts can be traded. */
// (From the league data, not offseason.ts: this module is in an import cycle with it.)
export let PICK_YEARS: number[] = [];
export const ROUNDS = 7;
/** The next draft: picks in it are valued at their projected slot, later ones less. */
let DRAFT_YEAR = 0;
onSeasonChange(() => {
  PICK_YEARS = [RULES.season + 1, RULES.season + 2, RULES.season + 3];
  DRAFT_YEAR = RULES.season + 1;
});

/**
 * Picks traded before the game starts (2027 first-rounders): Green Bay's to
 * Dallas in the Micah Parsons trade, Indianapolis's to the Jets for Sauce
 * Gardner, and Dallas's own to the Jets for Quinnen Williams.
 */
const PRE_TRADED: Record<string, string> = { "2027-1-GB": "DAL", "2027-1-IND": "NYJ", "2027-1-DAL": "NYJ" };

/** Players whose contracts have a no-trade clause: they have to agree to any deal. */
const NO_TRADE_CLAUSE = new Set(["00-0033077" /* Dak Prescott */, "00-0033537" /* Deshaun Watson */]);

export function trades(state: GameState): TradeState {
  return (state.trades ??= { picks: { ...PRE_TRADED }, log: [], offers: [], block: [], requests: {}, talks: {} });
}

// ---- Draft picks ----

export function pickId(year: number, round: number, from: string): string {
  return `${year}-${round}-${from}`;
}

/** Compensatory picks carry a suffix: "2027-5-SEA-c2". */
export function parsePick(id: string): { year: number; round: number; from: string; comp: boolean } {
  const [y, r, from, c] = id.split("-");
  return { year: Number(y), round: Number(r), from, comp: !!c };
}

/** A pick already used in the draft. */
export function pickUsed(state: GameState, id: string): boolean {
  const d = state.draft;
  if (!d?.order || parsePick(id).year !== DRAFT_YEAR) return false;
  const i = d.order.indexOf(id);
  return i >= 0 && i < d.made.length;
}

/** Overall number of a pick in this year's draft, once the order is set. */
export function pickOverall(state: GameState, id: string): number | null {
  const i = state.draft?.order?.indexOf(id) ?? -1;
  return i >= 0 ? i + 1 : null;
}

export function pickOwner(state: GameState, id: string): string {
  return trades(state).picks[id] ?? parsePick(id).from;
}

/** Every pick a team holds, its own and others', soonest first. */
export function picksOf(state: GameState, team: string): string[] {
  const out: string[] = [];
  const comp = (state.draft?.comp ?? []).map((c) => c.pick);
  for (const year of PICK_YEARS) {
    for (let round = 1; round <= ROUNDS; round++) {
      for (const t of TEAMS) {
        const id = pickId(year, round, t.id);
        if (pickOwner(state, id) === team && !pickUsed(state, id)) out.push(id);
      }
      for (const id of comp) {
        const p = parsePick(id);
        if (p.year === year && p.round === round && pickOwner(state, id) === team && !pickUsed(state, id)) out.push(id);
      }
    }
  }
  // Once the draft order is set, this year's picks go in the order they come up.
  return state.draft?.order ? out.sort((a, b) => (pickOverall(state, a) ?? 999) - (pickOverall(state, b) ?? 999) || a.localeCompare(b)) : out;
}

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** "2027 1st", "2027 1st (GB)" for a pick that came from another team, "2027 5th (No. 170, comp)" once the order is set. */
export function pickLabel(state: GameState, id: string, holder = pickOwner(state, id)): string {
  const { year, round, from, comp } = parsePick(id);
  const notes: string[] = [];
  const overall = pickOverall(state, id);
  if (overall) notes.push(`No. ${overall}`);
  if (from !== holder) notes.push(from);
  if (comp) notes.push("comp");
  return `${year} ${ORD[round]}${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

/** Moves a team's own pick to another team, if it still has it (offer-sheet compensation). */
export function transferOwnPick(state: GameState, year: number, round: number, from: string, to: string): boolean {
  const id = pickId(year, round, from);
  if (pickOwner(state, id) !== from) return false;
  trades(state).picks[id] = to;
  return true;
}

// ---- How good teams look ----

const POS_WEIGHT: Partial<Record<Position, number>> = { QB: 3, EDGE: 1.3, OT: 1.1, WR: 1, CB: 1, IDL: 1, S: 0.8, LB: 0.8, TE: 0.8, OG: 0.8, C: 0.8, RB: 0.6, K: 0.3, P: 0.2 };
const strengthCache = new WeakMap<GameState, { date: string; wp: Record<string, number>; rank: string[] }>();

/**
 * Where each team looks headed this season, as the league sees it: the record
 * so far plus a read of the healthy starters for the games that are left.
 * After the season it is the final record.
 */
export function outlook(state: GameState): Record<string, number> {
  const hit = strengthCache.get(state);
  if (hit?.date === state.date) return hit.wp;
  const strength: Record<string, number> = {};
  for (const t of TEAMS) {
    const chart = depthChart(state, t.id);
    let sum = 0;
    let w = 0;
    for (const [pos, ids] of Object.entries(chart) as [Position, string[]][]) {
      const n = STARTERS[pos] ?? 1;
      const pw = POS_WEIGHT[pos] ?? 0;
      for (let i = 0; i < n; i++) {
        sum += pw * (ids[i] ? marketView(state, ids[i]) : 60);
        w += pw;
      }
    }
    strength[t.id] = sum / w;
  }
  const vals = Object.values(strength);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  const table = standings(state);
  const wp: Record<string, number> = {};
  for (const t of TEAMS) {
    const prior = Math.max(0.22, Math.min(0.78, 0.5 + ((strength[t.id] - mean) / sd) * 0.12));
    const r = table[t.id];
    const g = r ? Math.min(17, r.w + r.l + r.t) : 0;
    wp[t.id] = r ? (r.w + 0.5 * r.t + prior * (17 - g)) / 17 : prior;
  }
  const rank = TEAMS.map((t) => t.id).sort((a, b) => wp[a] - wp[b] || a.localeCompare(b));
  strengthCache.set(state, { date: state.date, wp, rank });
  return wp;
}

/** Where a team's pick in a draft is expected to land, 1-32. */
export function projectedSlot(state: GameState, from: string, year: number): number {
  let slot: number;
  const order = off(state).draftOrder;
  if (order && isOffseason(state.date)) slot = order.indexOf(from) + 1;
  else {
    outlook(state);
    slot = strengthCache.get(state)!.rank.indexOf(from) + 1;
  }
  if (year === DRAFT_YEAR) return slot;
  // Further out, nobody knows: picks regress to the middle of the round.
  const shrink = year === DRAFT_YEAR + 1 ? 0.35 : 0.12;
  return Math.round(16.5 + (slot - 16.5) * shrink);
}

export type Direction = "contend" | "middle" | "rebuild";

export function direction(state: GameState, team: string): Direction {
  const wp = outlook(state)[team];
  return wp >= 0.58 ? "contend" : wp <= 0.42 ? "rebuild" : "middle";
}

// ---- What things are worth ----

/** A draft value chart in the style teams use: the first pick is 1000 points. */
const CHART: [number, number][] = [
  [1, 1000], [2, 717], [3, 627], [5, 527], [8, 451], [10, 409], [16, 325], [24, 262], [32, 213], [40, 178], [50, 145],
  [64, 111], [80, 82], [96, 61], [128, 33], [160, 18], [192, 9], [224, 3], [260, 1],
];

export function chartValue(overall: number): number {
  for (let i = 1; i < CHART.length; i++) {
    const [p1, v1] = CHART[i - 1];
    const [p2, v2] = CHART[i];
    if (overall <= p2) {
      const t = (overall - p1) / (p2 - p1);
      return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1)));
    }
  }
  return 1;
}

/** How a team discounts the seasons ahead, and how much it wants picks. */
const OUTLOOK: Record<Direction, { years: number[]; picks: number }> = {
  contend: { years: [1.3, 0.82, 0.68, 0.55, 0.45, 0.38], picks: 0.85 },
  middle: { years: [1.0, 0.85, 0.72, 0.6, 0.5, 0.42], picks: 1 },
  rebuild: { years: [0.55, 0.9, 0.85, 0.75, 0.65, 0.55], picks: 1.2 },
};

export function pickValue(state: GameState, team: string, id: string): number {
  const { year, round, from } = parsePick(id);
  const out = Math.max(0, year - DRAFT_YEAR);
  // Once the order is set, a pick is worth its exact slot on the chart.
  const overall = pickOverall(state, id) ?? (round - 1) * 32 + projectedSlot(state, from, year);
  return chartValue(overall) * Math.pow(0.8, out) * OUTLOOK[direction(state, team)].picks;
}

/** Whose eyes: a team's front office, the press (the consensus), or the truth (for grading later). */
export type Eye = "gm" | "public" | "truth";

/** Dollars of value over a contract for one point on the chart. */
const DOLLARS_PER_POINT = 220_000;

// Views are steady within a day; trades price hundreds of players, so they're kept until the date changes.
const viewCache = new WeakMap<GameState, { date: string; views: Map<string, number> }>();

function viewFor(state: GameState, eye: Eye, team: string, id: string): number {
  let c = viewCache.get(state);
  if (c?.date !== state.date) {
    c = { date: state.date, views: new Map() };
    viewCache.set(state, c);
  }
  const key = `${eye}:${team}:${id}`;
  let v = c.views.get(key);
  if (v === undefined) {
    v = computeView(state, eye, team, id);
    c.views.set(key, v);
  }
  return v;
}

function computeView(state: GameState, eye: Eye, team: string, id: string): number {
  if (eye === "truth") return ability(state, id) + 0.35 * schemeFit(state, id, team);
  if (eye === "public") return marketView(state, id);
  const fx = staffEffects(team);
  const own = Math.max(0.5, Math.min(0.9, 0.5 + (fx.gmEval - 50) / 100));
  return own * (perceivedAbility(state, id, `gm:${team}`, fx.gmEval) + productionBump(state, id)) + (1 - own) * marketView(state, id) + 0.35 * schemeFit(state, id, team);
}

/** A front office's read of how much better a young player will get. */
function growthFor(state: GameState, eye: Eye, team: string, id: string): number {
  const r = HIDDEN_RATINGS[id];
  if (!r || PLAYER_BY_ID[id].yearsExp > 3) return 0;
  const gap = upside(state, id);
  if (eye === "truth") return gap;
  const skill = eye === "gm" ? staffEffects(team).gmEval : 80;
  const z = gaussian(rngFor(state.seed, `potential:${eye}:${team}:${id}`));
  return Math.max(0, gap + z * (100 - skill) / 10);
}

/** Starter, key backup, or depth, in this team's eyes, with some players gone. */
function roleFor(state: GameState, eye: Eye, team: string, id: string, without: Set<string>): number {
  const pos = PLAYER_BY_ID[id].position;
  const mine = viewFor(state, eye, team, id);
  let better = 0;
  for (const x of teamPlayerIds(state, team)) {
    if (x === id || without.has(x) || PLAYER_BY_ID[x].position !== pos) continue;
    const ps = state.players[x];
    if (ps.status === "ps" || ps.status === "future" || ps.injury?.seasonEnding) continue;
    if (viewFor(state, eye, team, x) > mine) better++;
  }
  const starters = STARTERS[pos] ?? 1;
  if (better < starters) return 1;
  if (better < starters + 1) return pos === "QB" ? 0.3 : 0.5;
  return 0.22;
}

export interface Valuation {
  /** Chart points. */
  points: number;
  /** The yearly value the team sees in the player at his role, and what he costs this year (for the GM's notes). */
  worth: number;
  cost: number;
  role: number;
}

/**
 * What a player is worth to a team in a trade, in chart points: for each
 * season he's under contract, what he'd be worth on the market for the
 * ability the team sees (stars are worth more than any contract can pay
 * them), at the role he'd have, minus what he costs, weighted by how much the
 * team cares about that season. A player whose deal is about to run out
 * comes with the right to re-sign him first.
 */
export function playerValue(state: GameState, eye: Eye, team: string, id: string, opts: { without?: Set<string>; date?: string } = {}): Valuation {
  const p = PLAYER_BY_ID[id];
  const date = opts.date ?? state.date;
  const deal0 = dealOf(state, id);
  if (!deal0) return { points: 0, worth: 0, cost: 0, role: 0 };
  const deal = tradedDeal(deal0, team, date);
  const year = leagueYear(date);
  const w = OUTLOOK[direction(state, team)].years;
  const view = viewFor(state, eye, team, id);
  const growth = growthFor(state, eye, team, id);
  const age = ageOn(p.birthDate, date) ?? 26;
  const role = roleFor(state, eye, team, id, opts.without ?? new Set());
  const dur = HIDDEN_RATINGS[id]?.durability ?? 70;
  const durability = eye === "public" ? 1 : Math.max(0.75, Math.min(1.05, 0.75 + dur / 300));
  // Weeks of football left this season, and how many of them the player can play.
  const inSeason = date > KEY.regularSeasonStart && leagueYear(date) === RULES.season;
  const weeksLeft = inSeason ? Math.max(0, REG_WEEKS - weeksPaid(date)) : REG_WEEKS;
  const inj = state.players[id]?.injury;
  let playable = weeksLeft;
  if (inj && inj.returnDate > date) playable = inj.seasonEnding ? 0 : Math.max(0, weeksLeft - Math.ceil(daysBetween(date, inj.returnDate) / 7));
  const holdout = state.players[id]?.holdout?.kind === "holdout" ? 0.85 : 1;

  let total = 0;
  let worth0 = 0;
  const real = deal.years.filter((y) => y.year >= year && !y.void);
  const seasonWorth = (k: number) => {
    const a = view + Math.min(k + (inSeason ? 0.5 : 0), 3) * growth * 0.22;
    const cap = salaryCap(state, year + k);
    const market = shareFor(state, p.position, a) * cap * ageFactor(p.position, Math.round(age + k));
    // Specialists are cheap to replace: nobody pays a premium for one.
    if (p.position === "K" || p.position === "P" || p.position === "LS") return { market, star: market * 0.6 };
    const q = Math.max(0, Math.min(1, (a - 88) / 11));
    return { market, star: market * (1 + 0.6 * q * q) * durability };
  };
  for (let k = 0; k < real.length && k < w.length; k++) {
    const s = seasonWorth(k);
    const frac = k === 0 ? playable / REG_WEEKS : 1;
    const hit = dealCapHit(deal, real[k].year);
    const value = s.star * role * frac * (k === 0 ? holdout : 1) - hit;
    if (k === 0) worth0 = s.star * role;
    total += w[k] * value;
  }
  // Rights to re-sign: two more seasons at a market price keep only the part a contract can't pay for.
  const end = real.length;
  if (age + end <= 31) {
    for (let j = 0; j < 2 && end + j < w.length; j++) {
      const s = seasonWorth(end + j);
      total += w[end + j] * 0.55 * role * Math.max(0, s.star - s.market);
    }
  }
  return { points: total / DOLLARS_PER_POINT, worth: worth0, cost: dealCapHit(deal, year), role };
}

export function assetValue(state: GameState, eye: Eye, team: string, a: TradeAsset, opts: { without?: Set<string>; date?: string } = {}): number {
  return a.kind === "pick" ? pickValue(state, team, a.pick) : playerValue(state, eye, team, a.id, opts).points;
}

function playersIn(assets: TradeAsset[]): string[] {
  return assets.filter((a): a is { kind: "player"; id: string } => a.kind === "player").map((a) => a.id);
}

/** What a trade is worth to one of its teams: what comes in, minus what goes out (teams overrate their own a little). */
export function tradeBalance(state: GameState, eye: Eye, deal: TradeDeal, side: 0 | 1): { gain: number; inValue: number; outValue: number } {
  const team = deal.teams[side];
  const out = deal.send[side];
  const inc = deal.send[1 - side];
  const date = officialDate(state);
  const without = new Set(playersIn(out));
  let outValue = 0;
  for (const a of out) {
    const v = assetValue(state, eye, team, a, { date });
    // Teams overrate their own a little, unless the player has asked out: then they're motivated sellers.
    const own = eye !== "gm" ? 1 : a.kind === "player" && trades(state).requests[a.id] ? 0.85 : 1.05;
    outValue += v > 0 ? v * own : v;
  }
  let inValue = 0;
  for (const a of inc) inValue += assetValue(state, eye, team, a, { without, date });
  return { gain: inValue - outValue, inValue, outValue };
}

// ---- The rules ----

export interface Window {
  open: boolean;
  /** False after the Super Bowl: deals are agreed now and processed at the new league year. */
  official: boolean;
  text: string;
}

const windowCache = new Map<string, Window>();

export function tradeWindow(state: GameState): Window {
  let w = windowCache.get(state.date);
  if (!w) windowCache.set(state.date, (w = windowOn(state.date)));
  return w;
}

function windowOn(d: string): Window {
  if (d <= KEY.tradeDeadline) return { open: true, official: true, text: `Trades are open until the deadline, 4 PM ET on ${shortDate(KEY.tradeDeadline)}.` };
  if (d < OFFSEASON_START) return { open: false, official: false, text: `The trade deadline passed on ${shortDate(KEY.tradeDeadline)}. Trading reopens after the Super Bowl.` };
  if (d < KEY.newLeagueYear) return { open: true, official: false, text: `Trades agreed now become official when the new league year opens on ${shortDate(KEY.newLeagueYear)}. Players whose contracts expire can't be included.` };
  return { open: true, official: true, text: "The new league year is open: trades are processed the day they're agreed." };
}

/** The day a trade agreed today is processed. */
function officialDate(state: GameState): string {
  return tradeWindow(state).official || state.date >= KEY.newLeagueYear ? state.date : KEY.newLeagueYear;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

/** Can this player be traded now (to a given team)? */
export function canTradePlayer(state: GameState, id: string, to?: string): Check {
  const ps = state.players[id];
  const p = PLAYER_BY_ID[id];
  if (!ps?.team || ps.status === "fa") return { ok: false, reason: "Not under contract." };
  if (ps.status === "ps") return { ok: false, reason: "Practice squad players are free agents: they can be signed, not traded." };
  if (ps.status === "future") return { ok: false, reason: "His reserve/future contract doesn't start until the new league year." };
  const deal = dealOf(state, id);
  if (!deal) return { ok: false, reason: "Not under contract." };
  if (["franchise", "transition", "rfa", "erfa"].includes(deal.kind) && deal.signed >= OFFSEASON_START) {
    return { ok: false, reason: `${p.name} hasn't signed his ${deal.kind === "franchise" || deal.kind === "transition" ? "tag" : "tender"}, and a player has to sign it before he can be traded.` };
  }
  if (!tradeWindow(state).official && (lastYear(deal) ?? 0) < NEXT) return { ok: false, reason: "His contract expires when the league year ends." };
  const lock = trades(state).noTradeTo?.[id];
  if (to && lock && lock.team === to && lock.until > state.date) {
    return { ok: false, reason: `We matched the ${teamLabel(to)}'s offer sheet: he can't be traded to them until ${shortDate(lock.until)}.` };
  }
  return { ok: true };
}

export function hasNoTradeClause(id: string): boolean {
  return NO_TRADE_CLAUSE.has(id);
}

/** A player with a no-trade clause waives it for a place he wants to go. */
function waivesNoTrade(state: GameState, id: string, to: string): boolean {
  if (!NO_TRADE_CLAUSE.has(id)) return true;
  const rng = rngFor(state.seed, `ntc:${id}:${to}:${state.date}`);
  const unhappy = morale(state, id) < 45 || !!trades(state).requests[id];
  return unhappy ? rng() < 0.8 : outlook(state)[to] >= 0.6 && rng() < 0.35;
}

export interface CapCheck {
  /** Cap space after the trade, in the league year it's processed. */
  space: number;
  before: number;
  /** Dead money the trade adds this year and next. */
  dead: number;
  deadNext: number;
  year: number;
}

/** A team's cap after a trade: who leaves (and the dead money they leave behind) and who arrives on what contract. */
export function capAfter(state: GameState, deal: TradeDeal, side: 0 | 1): CapCheck {
  const team = deal.teams[side];
  const date = officialDate(state);
  const year = leagueYear(date);
  const out = new Set(playersIn(deal.send[side]));
  const inc = playersIn(deal.send[1 - side]);
  let dead = 0;
  let deadNext = 0;
  for (const id of out) {
    const c = tradeCharges(dealOf(state, id), date);
    dead += c.thisYear;
    deadNext += c.nextYear;
  }
  const top51 = year > leagueYear(state.date) || isTop51(date);
  const hitOf = (id: string) => (state.players[id].status === "ps" ? psCapHit(state, id, year) : capHit(id, year, state));
  const before = teamPlayerIds(state, team).map(hitOf);
  const after = teamPlayerIds(state, team).filter((id) => !out.has(id)).map(hitOf);
  for (const id of inc) after.push(dealCapHit(tradedDeal(dealOf(state, id)!, team, date), year));
  const sum = (hits: number[]) => (top51 ? [...hits].sort((a, b) => b - a).slice(0, 51) : hits).reduce((a, b) => a + b, 0);
  const limit = capLimit(team, year, state);
  const deadNow = deadMoney(state, team, year);
  return {
    year, dead, deadNext,
    before: limit - sum(before) - deadNow,
    space: limit - sum(after) - deadNow - dead,
  };
}

/** Roster count after a trade, against the limit for the day it's processed. */
function rosterAfter(state: GameState, deal: TradeDeal, side: 0 | 1): { count: number; before: number; limit: number } {
  const team = deal.teams[side];
  const date = officialDate(state);
  const counts = (id: string) => ["camp", "active"].includes(state.players[id].status);
  const out = playersIn(deal.send[side]).filter(counts).length;
  const inc = playersIn(deal.send[1 - side]).filter(counts).length;
  const now = teamPlayerIds(state, team).filter(counts).length;
  return { count: now - out + inc, before: now, limit: rosterLimit(state, date) };
}

export interface Legality {
  ok: boolean;
  problems: string[];
  cap: [CapCheck, CapCheck];
  roster: [{ count: number; before: number; limit: number }, { count: number; before: number; limit: number }];
}

/** Every rule a trade has to pass. Roster overflow is a problem only for the owner's team: CPU teams release someone. */
export function checkTrade(state: GameState, deal: TradeDeal): Legality {
  const problems: string[] = [];
  const w = tradeWindow(state);
  if (!w.open) problems.push(w.text);
  if (deal.teams[0] === deal.teams[1]) problems.push("A team can't trade with itself.");
  if (!deal.send[0].length || !deal.send[1].length) problems.push("Each side has to send something.");
  const seen = new Set<string>();
  for (const side of [0, 1] as const) {
    const team = deal.teams[side];
    const other = deal.teams[1 - side];
    for (const a of deal.send[side]) {
      const key = a.kind === "player" ? a.id : a.pick;
      if (seen.has(key)) problems.push("The same asset appears twice.");
      seen.add(key);
      if (a.kind === "player") {
        const p = PLAYER_BY_ID[a.id];
        if (state.players[a.id]?.team !== team) problems.push(`${p.name} isn't on the ${teamLabel(team)}.`);
        else {
          const c = canTradePlayer(state, a.id, other);
          if (!c.ok) problems.push(c.reason!);
        }
      } else {
        const { year } = parsePick(a.pick);
        if (pickOwner(state, a.pick) !== team) problems.push(`The ${teamLabel(team)} don't own the ${pickLabel(state, a.pick, team)} pick.`);
        if (!PICK_YEARS.includes(year)) problems.push("Only picks in the next three drafts can be traded.");
        if (pickUsed(state, a.pick)) problems.push(`The ${pickLabel(state, a.pick, team)} pick has already been used.`);
      }
    }
  }
  const cap: [CapCheck, CapCheck] = [capAfter(state, deal, 0), capAfter(state, deal, 1)];
  const roster: Legality["roster"] = [rosterAfter(state, deal, 0), rosterAfter(state, deal, 1)];
  if (state.settings.capRules === "real") {
    for (const side of [0, 1] as const) {
      // A trade that leaves a team over the cap can't be processed; one that saves room always can.
      if (cap[side].space < 0 && cap[side].space < cap[side].before) {
        problems.push(`The ${teamLabel(deal.teams[side])} would be ${money(-cap[side].space)} over the ${cap[side].year} cap.`);
      }
    }
  }
  for (const side of [0, 1] as const) {
    if (deal.teams[side] === state.userTeam && roster[side].count > roster[side].limit && roster[side].count > roster[side].before) {
      problems.push(`We'd have ${roster[side].count} players, over the ${roster[side].limit}-man limit: release someone first.`);
    }
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], cap, roster };
}

// ---- Front office behavior ----

function gmOf(team: string): string {
  const gm = teamStaff(team).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

/** The margin a GM wants before saying yes: tougher negotiators want more. */
function margin(team: string, outValue: number): number {
  const hard = (staffEffects(team).gmNegotiation - 50) / 50;
  return Math.max(6, 4 + Math.max(0, outValue) * (0.05 + 0.04 * hard));
}

/** Recently acquired or signed: front offices don't flip them right away. */
function justArrived(state: GameState, id: string): boolean {
  const deal = dealOf(state, id);
  if (deal && daysBetween(deal.signed, state.date) < 30 && deal.signed <= state.date) return true;
  return trades(state).log.some((t) => t.status === "done" && daysBetween(t.date, state.date) < 30 && (playersIn(t.send[0]).includes(id) || playersIn(t.send[1]).includes(id)));
}

/** A rookie drafted in the first three rounds this year: teams almost never give up on one this fast. */
function freshDraftee(state: GameState, id: string): boolean {
  const p = PLAYER_BY_ID[id];
  return p.rookieYear === leagueYear(state.date) && (p.draft.round ?? 9) <= 3;
}

/** A player a team builds around: it won't move him without a clear overpay. */
function cornerstone(state: GameState, team: string, id: string): boolean {
  if (trades(state).requests[id]) return false;
  const p = PLAYER_BY_ID[id];
  const age = ageOn(p.birthDate, state.date) ?? 26;
  const v = playerValue(state, "gm", team, id);
  if (direction(state, team) === "rebuild" && age >= 28) return false;
  if (p.position === "QB" && v.role === 1 && age <= 34 && v.points >= 120) return true;
  return v.points >= 330 && age <= 27;
}

export interface Answer {
  verdict: "accept" | "counter" | "reject";
  text: string;
  counter?: TradeDeal;
}

/** How a CPU team answers a proposal (side 1 is the CPU team). */
export function cpuAnswer(state: GameState, deal: TradeDeal, side: 0 | 1 = 1): Answer {
  const team = deal.teams[side];
  const name = teamStaff(team).GM?.name ?? `The ${teamLabel(team)} GM`;
  const legal = checkTrade(state, deal);
  if (!legal.ok) return { verdict: "reject", text: legal.problems[0] };
  for (const id of playersIn(deal.send[side])) {
    if (justArrived(state, id)) return { verdict: "reject", text: `${name}: "We just brought ${PLAYER_BY_ID[id].name} in. He isn't going anywhere."` };
  }
  for (const id of playersIn(deal.send[0]).concat(playersIn(deal.send[1]))) {
    const to = deal.teams[playersIn(deal.send[0]).includes(id) ? 1 : 0];
    if (!waivesNoTrade(state, id, to)) return { verdict: "reject", text: `${PLAYER_BY_ID[id].name} has a no-trade clause and won't waive it for a move to the ${teamLabel(to)}.` };
  }
  const bal = tradeBalance(state, "gm", deal, side);
  let need = margin(team, bal.outValue);
  const stars = playersIn(deal.send[side]).filter((id) => cornerstone(state, team, id));
  if (stars.length) need = Math.max(need, 0.35 * bal.outValue);
  if (bal.gain >= need) return { verdict: "accept", text: `${name}: "You've got a deal."` };
  // Close enough: see what would get it done from the other side's assets.
  const counter = completeDeal(state, deal, side, need - bal.gain);
  if (counter) {
    const added = counter.send[1 - side].filter((a) => !deal.send[1 - side].some((b) => sameAsset(a, b)));
    return {
      verdict: "counter",
      text: `${name}: "${stars.length ? `We'd need a lot to move ${PLAYER_BY_ID[stars[0]].name}, but` : "We're close."} Add ${describe(state, added, deal.teams[1 - side])} and we'll do it."`,
      counter,
    };
  }
  if (stars.length) return { verdict: "reject", text: `${name}: "${PLAYER_BY_ID[stars[0]].name} isn't available."` };
  return { verdict: "reject", text: `${name}: "That doesn't work for us. ${bal.gain < -0.4 * Math.max(20, bal.outValue) ? "We're not close." : "We're not there."}"` };
}

function sameAsset(a: TradeAsset, b: TradeAsset): boolean {
  return a.kind === b.kind && (a.kind === "player" ? a.id === (b as { id: string }).id : a.pick === (b as { pick: string }).pick);
}

/** Assets a team could add to a trade, with what the other team sees in each and what it costs this one. */
function candidates(state: GameState, deal: TradeDeal, payerSide: 0 | 1): { a: TradeAsset; rv: number; pv: number }[] {
  const payer = deal.teams[payerSide];
  const receiver = deal.teams[1 - payerSide];
  const used = new Set([...deal.send[0], ...deal.send[1]].map((a) => (a.kind === "player" ? a.id : a.pick)));
  const date = officialDate(state);
  const without = new Set(playersIn(deal.send[1 - payerSide]));
  const out: { a: TradeAsset; rv: number; pv: number }[] = [];
  for (const pick of picksOf(state, payer)) {
    if (used.has(pick)) continue;
    const a: TradeAsset = { kind: "pick", pick };
    out.push({ a, rv: pickValue(state, receiver, pick), pv: pickValue(state, payer, pick) });
  }
  for (const id of teamPlayerIds(state, payer)) {
    if (used.has(id) || !canTradePlayer(state, id, receiver).ok || NO_TRADE_CLAUSE.has(id)) continue;
    // Only players a team would really put in a deal: not its quarterback, not someone it just got.
    if (payer !== state.userTeam && (justArrived(state, id) || cornerstone(state, payer, id))) continue;
    const mine = playerValue(state, "gm", payer, id, { date });
    // CPU teams build packages from picks and spare parts, not their starters or the rookies they just drafted.
    if (payer !== state.userTeam && (mine.role > 0.5 || freshDraftee(state, id))) continue;
    const rv = playerValue(state, "gm", receiver, id, { without, date }).points;
    if (rv < 8) continue;
    // A player in a deal is a harder sell than a pick: physicals, fit, one more thing to agree on.
    out.push({ a: { kind: "player", id }, rv: rv * 0.8, pv: Math.max(mine.points, 0) * 1.05 });
  }
  return out;
}

/**
 * Adds the payer's assets to a deal until the receiving side (1 - payerSide is
 * the payer's partner) gets `deficit` more points, cheapest for the payer first.
 * Returns null if nothing reasonable closes the gap.
 */
function completeDeal(state: GameState, deal: TradeDeal, receiverSide: 0 | 1, deficit: number, budget = Infinity): TradeDeal | null {
  const payerSide = (1 - receiverSide) as 0 | 1;
  const pool = candidates(state, deal, payerSide);
  const next: TradeDeal = { teams: deal.teams, send: [[...deal.send[0]], [...deal.send[1]]] };
  let left = deficit;
  let spent = 0;
  for (let i = 0; i < 4 && left > 0; i++) {
    const avail = pool.filter((c) => !next.send[payerSide].some((a) => sameAsset(a, c.a)));
    if (!avail.length) return null;
    const players = next.send[payerSide].filter((a) => a.kind === "player").length - deal.send[payerSide].filter((a) => a.kind === "player").length;
    const allowed = deal.teams[payerSide] === state.userTeam ? avail : avail.filter((c) => c.a.kind === "pick" || players < 1);
    const covering = allowed.filter((c) => c.rv >= left).sort((a, b) => a.pv - b.pv)[0];
    const pick = covering ?? allowed.filter((c) => c.pv <= c.rv * 1.4).sort((a, b) => b.rv - a.rv)[0];
    if (!pick) return null;
    next.send[payerSide].push(pick.a);
    left -= pick.rv;
    spent += pick.pv;
    if (spent > budget) return null;
  }
  if (left > 0) return null;
  // The extra pieces may be what tips the cap or roster: check the whole thing again.
  return checkTrade(state, next).ok ? next : null;
}

// ---- What the owner hears ----

/** The owner's GM on a trade, in words: as sharp as the GM's eye. */
export function gmRead(state: GameState, deal: TradeDeal): string {
  const side = deal.teams[0] === state.userTeam ? 0 : 1;
  const bal = tradeBalance(state, "gm", deal, side as 0 | 1);
  const scale = Math.max(25, bal.outValue, bal.inValue);
  const r = bal.gain / scale;
  if (r > 0.35) return "I'd take this in a heartbeat. We'd be getting a lot more than we give.";
  if (r > 0.12) return "I like it. We come out ahead.";
  if (r > -0.05) return "About even in my book. It comes down to what we need.";
  if (r > -0.25) return "We'd be paying a little more than I'd like.";
  if (r > -0.5) return "That's an overpay. I wouldn't do it.";
  return "I'd hang up. We'd be giving away far too much.";
}

/** "WR Davante Adams, the 2027 2nd (GB) and the 2028 5th" */
export function describe(state: GameState, assets: TradeAsset[], holder: string): string {
  const parts = assets.map((a) => {
    if (a.kind === "player") {
      const p = PLAYER_BY_ID[a.id];
      return `${p.position} ${p.name}`;
    }
    const m = pickLabel(state, a.pick, holder).match(/^(\d+ \d\w\w)(?: \((.+)\))?$/)!;
    return `a ${m[1]}-round pick${m[2] ? ` (${m[2]})` : ""}`;
  });
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---- Making it happen ----

/** Neither side looks fleeced to the public eye. */
function looksSane(state: GameState, deal: TradeDeal): boolean {
  for (const side of [0, 1] as const) {
    const bal = tradeBalance(state, "public", deal, side);
    if (bal.gain < -Math.max(20, 0.25 * Math.max(bal.inValue, bal.outValue))) return false;
  }
  return true;
}

/** Moves everything in a trade. The deal must already have passed checkTrade. */
function execute(state: GameState, deal: TradeDeal): void {
  const date = state.date;
  const year = leagueYear(date);
  const ts = trades(state);
  for (const side of [0, 1] as const) {
    const from = deal.teams[side];
    const to = deal.teams[1 - side];
    for (const a of deal.send[side]) {
      if (a.kind === "pick") {
        ts.picks[a.pick] = to;
        continue;
      }
      const id = a.id;
      const old = dealOf(state, id)!;
      const c = tradeCharges(old, date);
      addDeadMoney(state, from, year, c.thisYear);
      addDeadMoney(state, from, year + 1, c.nextYear);
      state.contracts[id] = tradedDeal(old, to, date);
      const ps = state.players[id];
      const status = ps.status === "ir" ? "ir" : rosterStatusNow(state);
      const requested = !!ts.requests[id];
      state.players[id] = { ...ps, team: to, status };
      delete state.players[id].holdout;
      delete state.players[id].elevatedFor;
      delete state.players[id].keepUntil;
      delete ts.requests[id];
      ts.block = ts.block.filter((x) => x !== id);
      // The owner's cut plan keeps the players we trade for and drops the ones we trade away.
      if (state.cutPlan) state.cutPlan = to === state.userTeam ? [...state.cutPlan, id] : state.cutPlan.filter((x) => x !== id);
      const neg = state.negotiations[id];
      if (neg?.status === "open") {
        neg.status = "ended";
        neg.pending = undefined;
        neg.notes.unshift({ date, text: `Traded to the ${teamLabel(to)}.` });
      }
      // A fresh start: players who wanted out are happy, others take the move as it comes.
      const pr = priorities(id);
      const better = (outlook(state)[to] ?? 0.5) - (outlook(state)[from] ?? 0.5);
      changeMorale(state, id, requested ? 18 : 6 * pr.winning * better * 4 - 3 * pr.loyalty);
      const p = PLAYER_BY_ID[id];
      logMove(state, to, id, "traded", `acquired ${p.position} ${p.name} from the ${teamLabel(from)}`);
    }
  }
  invalidateRosters(state);
  // CPU teams over the roster limit release their least valuable player.
  for (const team of deal.teams) {
    if (team === state.userTeam) continue;
    const limit = rosterLimit(state);
    const count = () => teamPlayerIds(state, team).filter((id) => ["camp", "active"].includes(state.players[id].status)).length;
    for (let i = 0; i < 4 && count() > limit; i++) {
      const incoming = playersIn(deal.send[deal.teams[0] === team ? 1 : 0]);
      const cut = weakestOnRoster(state, team, PLAYER_BY_ID[incoming[0] ?? ""]?.position ?? "WR");
      if (!cut || incoming.includes(cut)) break;
      releasePlayer(state, cut);
    }
    // In the season a team that sent out more players than it got fills the 53 back up.
    if (!isOffseason(state.date) && state.date > KEY.rosterCutdown) {
      const gone = playersIn(deal.send[deal.teams[0] === team ? 0 : 1]).map((id) => PLAYER_BY_ID[id].position);
      for (let i = 0; i < gone.length && count() < limit; i++) signReplacement(state, team, gone[i]);
    }
  }
}

/** Grades from the three outlets for each side, judged with public information. */
function gradeTrade(state: GameState, deal: TradeDeal, id: string): TradeRecord["grades"] {
  const out: NonNullable<TradeRecord["grades"]> = {};
  for (const side of [0, 1] as const) {
    const team = deal.teams[side];
    const bal = tradeBalance(state, "public", deal, side);
    const scale = Math.max(30, bal.outValue, bal.inValue);
    out[team] = OUTLETS.map((o) => {
      const rng = rngFor(state.seed, `trade-grade:${o.name}:${id}:${team}`);
      const r = 1 + (bal.gain / scale) * 0.6 + gaussian(rng) * o.noise * 1.5 + gradeLean(state, o.name, team);
      const g = letter(r);
      const takes = r >= 1.15 ? "A clear win." : r >= 1.02 ? "Good business." : r >= 0.9 ? "Fair enough for both sides." : r >= 0.79 ? "They paid a steep price." : "Hard to see what they were thinking.";
      return { outlet: o.name, grade: g, take: takes };
    });
  }
  return out;
}

function isBlockbuster(state: GameState, deal: TradeDeal): boolean {
  const firsts = [...deal.send[0], ...deal.send[1]].filter((a) => a.kind === "pick" && parsePick(a.pick).round === 1).length;
  const star = [...playersIn(deal.send[0]), ...playersIn(deal.send[1])].some((id) => marketView(state, id) >= 95 && (ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 30) <= 30);
  return firsts >= 2 || (star && firsts >= 1);
}

/** "The Cowboys acquire EDGE Micah Parsons from the Packers for two 2027 1st-round picks" */
export function headline(state: GameState, deal: TradeDeal): string {
  // Lead with the side that gets the biggest name.
  const lead = (side: 0 | 1) => Math.max(0, ...playersIn(deal.send[1 - side]).map((id) => marketView(state, id)));
  const s: 0 | 1 = lead(0) >= lead(1) ? 0 : 1;
  const team = deal.teams[s];
  const other = deal.teams[1 - s];
  return `The ${teamLabel(team)} acquire ${describe(state, deal.send[1 - s], other)} from the ${teamLabel(other)} for ${describe(state, deal.send[s], team)}`;
}

/** Records and (if the window allows) processes a trade both sides have agreed to. */
export function completeTrade(state: GameState, deal: TradeDeal): TradeRecord {
  const ts = trades(state);
  const official = tradeWindow(state).official;
  const id = `trade-${state.date}-${ts.log.length}`;
  const rec: TradeRecord = {
    ...deal, send: [[...deal.send[0]], [...deal.send[1]]], id, date: state.date, status: official ? "done" : "agreed",
    blockbuster: isBlockbuster(state, deal), grades: gradeTrade(state, deal, id),
    edge: Object.fromEntries(([0, 1] as const).map((s) => [deal.teams[s], Math.round(tradeBalance(state, "truth", deal, s).gain)])),
  };
  ts.log.unshift(rec);
  const text = headline(state, deal);
  if (official) execute(state, deal);
  news(state, `${rec.blockbuster ? "Blockbuster: " : "Trade: "}${text}${official ? "" : `, pending the new league year`}`);
  // Offers to the owner that involve anything that just moved are off the table.
  const moved = new Set([...deal.send[0], ...deal.send[1]].map((a) => (a.kind === "player" ? a.id : a.pick)));
  for (const o of ts.offers) {
    if (o.status === "open" && [...o.send[0], ...o.send[1]].some((a) => moved.has(a.kind === "player" ? a.id : a.pick))) o.status = "withdrawn";
  }
  if (deal.teams.includes(state.userTeam)) {
    const us = deal.teams[0] === state.userTeam ? 0 : 1;
    const got = describe(state, deal.send[1 - us], deal.teams[1 - us]);
    const gave = describe(state, deal.send[us], state.userTeam);
    const cap = official ? null : capAfter(state, deal, us as 0 | 1);
    send(state, "transaction", gmOf(state.userTeam), official ? "Trade completed" : "Trade agreed",
      `${official ? "It's official" : "We have a deal"}: we get ${got} from the ${teamLabel(deal.teams[1 - us])} for ${gave}. ` +
      (official ? "The league has processed the trade and the players report to their new teams today." : `The league will process it on ${shortDate(KEY.newLeagueYear)}${cap ? `, which leaves us ${money(cap.space)} under the ${cap.year} cap` : ""}.`));
  } else if (rec.blockbuster) {
    send(state, "league", "League Office", "Blockbuster trade", text + ".");
  }
  return rec;
}

/** Agreed trades become official when the new league year opens, if they still pass. */
function processAgreed(state: GameState): void {
  for (const rec of [...trades(state).log].reverse()) {
    if (rec.status !== "agreed") continue;
    const check = checkTrade(state, rec);
    if (!check.ok) {
      rec.status = "voided";
      news(state, `The trade between the ${teamLabel(rec.teams[0])} and the ${teamLabel(rec.teams[1])} falls through: ${check.problems[0]}`);
      continue;
    }
    rec.status = "done";
    execute(state, rec);
    news(state, `The league processes the trade: ${headline(state, rec)}`);
  }
}

// ---- The owner's moves ----

/** The owner puts a trade to a CPU team. teams[0] must be the owner's team. */
export function proposeTrade(state: GameState, deal: TradeDeal): Answer & { record?: TradeRecord } {
  const team = deal.teams[1];
  const t = (trades(state).talks[team] ??= { strikes: 0 });
  if (t.coolingUntil && t.coolingUntil > state.date) {
    return { verdict: "reject", text: `The ${teamLabel(team)} aren't taking our calls until ${shortDate(t.coolingUntil)}. Too many lowballs.` };
  }
  const answer = cpuAnswer(state, deal, 1);
  if (answer.verdict === "accept") {
    t.strikes = Math.max(0, t.strikes - 1);
    return { ...answer, record: completeTrade(state, deal) };
  }
  const bal = tradeBalance(state, "gm", deal, 1);
  if (answer.verdict === "reject" && bal.gain < -0.4 * Math.max(20, bal.outValue)) {
    t.strikes++;
    if (t.strikes >= 3) {
      t.coolingUntil = addDays(state.date, 7);
      t.strikes = 0;
      return { ...answer, text: `${answer.text} They've had enough of these calls for a week.` };
    }
  }
  return answer;
}

/** "What would it take?": the CPU team names its price for what we want, from our assets. */
export function askPrice(state: GameState, partner: string, want: TradeAsset[]): Answer {
  const deal: TradeDeal = { teams: [state.userTeam, partner], send: [[], want] };
  const name = teamStaff(partner).GM?.name ?? `The ${teamLabel(partner)} GM`;
  const w = tradeWindow(state);
  if (!w.open) return { verdict: "reject", text: w.text };
  for (const a of want) {
    if (a.kind === "player") {
      const c = canTradePlayer(state, a.id, state.userTeam);
      if (!c.ok) return { verdict: "reject", text: c.reason! };
      if (justArrived(state, a.id)) return { verdict: "reject", text: `${name}: "We just brought ${PLAYER_BY_ID[a.id].name} in."` };
    }
  }
  const bal = tradeBalance(state, "gm", deal, 1);
  let need = margin(partner, bal.outValue) - bal.gain;
  if (playersIn(want).some((id) => cornerstone(state, partner, id))) need = Math.max(need, bal.outValue * 1.35 - bal.inValue);
  if (need <= 0) return { verdict: "accept", text: `${name}: "Take it, it's yours for a late pick." `, counter: completeDeal(state, deal, 1, 1) ?? undefined };
  const counter = completeDeal(state, deal, 1, need);
  if (!counter) return { verdict: "reject", text: `${name}: "I don't see anything on your roster that gets this done."` };
  return { verdict: "counter", text: `${name}: "For that, we'd want ${describe(state, counter.send[0], state.userTeam)}."`, counter };
}

export function acceptOffer(state: GameState, offerId: string): { ok: boolean; text: string } {
  const o = trades(state).offers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return { ok: false, text: "That offer is no longer on the table." };
  const check = checkTrade(state, o);
  if (!check.ok) return { ok: false, text: check.problems[0] };
  o.status = "accepted";
  completeTrade(state, o);
  return { ok: true, text: "Done. The trade is in." };
}

export function declineOffer(state: GameState, offerId: string): void {
  const o = trades(state).offers.find((x) => x.id === offerId);
  if (o?.status === "open") o.status = "declined";
}

export function toggleBlock(state: GameState, id: string): void {
  const ts = trades(state);
  ts.block = ts.block.includes(id) ? ts.block.filter((x) => x !== id) : [...ts.block, id];
}

// ---- CPU trades ----

/** Expected league-wide trades per day: steady in camp and the season, a rush before the deadline, busy in March. */
function tradeRate(date: string): number {
  if (date <= KEY.tradeDeadline) {
    const toDeadline = daysBetween(date, KEY.tradeDeadline);
    if (toDeadline === 0) return 3.5;
    if (toDeadline <= 7) return 1.1;
    if (toDeadline <= 21) return 0.45;
    if (date >= addDays(KEY.rosterCutdown, -5) && date <= addDays(KEY.rosterCutdown, 1)) return 0.5;
    return 0.13;
  }
  if (date < OFFSEASON_START) return 0;
  if (date < KEY.newLeagueYear) return 0.05;
  return 0.35;
}

/** Why a team might move a player, and how strongly. */
function sellReasons(state: GameState, id: string, dir: Direction): number {
  const ps = state.players[id];
  if (!canTradePlayer(state, id).ok || NO_TRADE_CLAUSE.has(id) || justArrived(state, id)) return 0;
  if (ps.injury?.seasonEnding) return 0;
  const p = PLAYER_BY_ID[id];
  const age = ageOn(p.birthDate, state.date) ?? 26;
  let w = 0;
  if (trades(state).requests[id]) w += 6;
  if (ps.holdout) w += 1.5;
  if (dir === "rebuild" && age >= 27) w += 1.6;
  if (dir === "middle" && age >= 29) w += 0.4;
  if (dir === "contend") w += 0.12;
  return w;
}

/**
 * One try at a trade between CPU teams: a seller with a reason to move a
 * player, a buyer that values him more, and a package of picks and players
 * the seller takes. Most tries go nowhere, as most phone calls do.
 */
function cpuTry(state: GameState, rng: () => number): TradeRecord | null {
  const cpu = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam);
  const dirs = Object.fromEntries(cpu.map((t) => [t, direction(state, t)]));
  // Sellers: rebuilding teams and teams with unhappy players are on the phone most.
  const weights = cpu.map((t) => (dirs[t] === "rebuild" ? 3 : dirs[t] === "middle" ? 1.2 : 0.6) + Object.keys(trades(state).requests).filter((id) => state.players[id]?.team === t).length * 4);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  let seller = cpu[0];
  for (let i = 0; i < cpu.length; i++) {
    r -= weights[i];
    if (r <= 0) { seller = cpu[i]; break; }
  }
  const roster = teamPlayerIds(state, seller).filter((id) => ["camp", "active", "ir"].includes(state.players[id].status));
  const scored = roster.map((id) => ({ id, w: sellReasons(state, id, dirs[seller]) })).filter((x) => x.w > 0);
  if (!scored.length) return null;
  // Teams shop players who matter: weigh by how much the league thinks of them.
  const pool = scored.map((x) => ({ ...x, w: x.w * Math.max(0.05, (marketView(state, x.id) - 76) / 10) })).filter((x) => x.w > 0.05);
  if (!pool.length) return null;
  let pr = rng() * pool.reduce((a, b) => a + b.w, 0);
  let target = pool[0].id;
  for (const x of pool) {
    pr -= x.w;
    if (pr <= 0) { target = x.id; break; }
  }
  const sellerV = playerValue(state, "gm", seller, target).points;
  // Stars move rarely, and only when someone has a reason.
  const star = sellerV >= 300;
  if (star && !trades(state).requests[target] && rng() > 0.18) return null;
  if (cornerstone(state, seller, target)) return null;
  const buyers = cpu.filter((t) => t !== seller && (dirs[t] !== "rebuild" || sellerV < 60));
  const shuffled = buyers.map((t) => ({ t, k: rng() })).sort((a, b) => a.k - b.k).slice(0, 7).map((x) => x.t);
  let best: { deal: TradeDeal; edge: number } | null = null;
  for (const buyer of shuffled) {
    const base: TradeDeal = { teams: [seller, buyer], send: [[{ kind: "player", id: target }], []] };
    if (!canTradePlayer(state, target, buyer).ok) continue;
    const buyerV = playerValue(state, "gm", buyer, target, { date: officialDate(state) }).points;
    const needSeller = Math.max(sellerV, 3) + margin(seller, sellerV);
    if (buyerV < needSeller * 1.02) continue;
    const deal = completeDeal(state, base, 0, needSeller, buyerV - margin(buyer, buyerV) * 0.5);
    if (!deal) continue;
    const buyerBal = tradeBalance(state, "gm", deal, 1);
    const sellerBal = tradeBalance(state, "gm", deal, 0);
    if (buyerBal.gain < margin(buyer, buyerBal.outValue) * 0.5 || sellerBal.gain < margin(seller, sellerBal.outValue) * 0.6) continue;
    // Front offices misjudge players, but a deal the whole league would laugh at doesn't get past an owner.
    if (!looksSane(state, deal)) continue;
    if (!best || buyerBal.gain > best.edge) best = { deal, edge: buyerBal.gain };
  }
  if (!best) return null;
  for (const id of [...playersIn(best.deal.send[0]), ...playersIn(best.deal.send[1])]) {
    const to = best.deal.teams[playersIn(best.deal.send[0]).includes(id) ? 1 : 0];
    if (!waivesNoTrade(state, id, to)) return null;
  }
  return completeTrade(state, best.deal);
}

/** Unhappy starters ask out, and the word gets around. */
function tradeRequests(state: GameState): void {
  if (!tradeWindow(state).open && !isOffseason(state.date)) return;
  const ts = trades(state);
  const rng = rngFor(state.seed, `requests:${state.date}`);
  for (const [id, ps] of Object.entries(state.players)) {
    if (!ps.team || ps.status === "fa" || ps.status === "ps" || ts.requests[id]) continue;
    const m = ps.morale ?? 70;
    // Unhappy players, and stars stuck in a long contract standoff, ask out.
    const standoff = ps.holdout && daysBetween(ps.holdout.since, state.date) >= 21 && marketView(state, id) >= 90;
    if (m >= 35 && !standoff) continue;
    if (marketView(state, id) < 84 || rng() > (standoff ? 0.03 : 0.04)) continue;
    ts.requests[id] = state.date;
    const p = PLAYER_BY_ID[id];
    if (ps.team === state.userTeam) {
      send(state, "staff", gmOf(ps.team), `${p.name} wants a trade`,
        `${p.name}'s agent, ${agentFor(id).name}, called: ${p.name.split(" ").slice(-1)[0]} has asked to be traded. Other teams will hear about it, and they'll offer less knowing we're motivated. ` +
        "We don't have to move him, but an unhappy player can drag on the locker room. The Trades page has the calls.");
      if (!ts.block.includes(id)) ts.block.push(id);
    }
    news(state, `Report: ${p.position} ${p.name} has asked the ${teamLabel(ps.team)} for a trade`);
  }
}

/** CPU teams call the owner: about players on our block, or with a player of their own to move. */
function callsToOwner(state: GameState): void {
  const ts = trades(state);
  const us = state.userTeam;
  for (const o of ts.offers) if (o.status === "open" && o.expires < state.date) o.status = "expired";
  if (!tradeWindow(state).open) return;
  const rng = rngFor(state.seed, `owner-calls:${state.date}`);
  const deadline = daysBetween(state.date, KEY.tradeDeadline);
  const busy = deadline >= 0 && deadline <= 7 ? 3 : 1;
  const open = ts.offers.filter((o) => o.status === "open").length;
  if (open >= 4) return;
  const cpu = TEAMS.map((t) => t.id).filter((t) => t !== us);
  const expires = deadline >= 0 && deadline <= 3 ? KEY.tradeDeadline : addDays(state.date, 3);

  const make = (deal: TradeDeal, note: string) => {
    if (ts.offers.some((o) => o.status === "open" && o.teams[0] === deal.teams[0])) return;
    const offer: TradeOffer = { ...deal, id: `offer-${state.date}-${ts.offers.length}`, date: state.date, expires, note, status: "open" };
    ts.offers.unshift(offer);
    if (ts.offers.length > 60) ts.offers.length = 60;
    const cpuTeam = deal.teams[0];
    send(state, "transaction", gmOf(us), `Trade call: ${teamLabel(cpuTeam)}`,
      `${note} They'd send ${describe(state, deal.send[0], cpuTeam)} for ${describe(state, deal.send[1], us)}. ` +
      `The offer is good until ${shortDate(expires)}; it's on the Trades page under Offers. My read: ${gmRead(state, deal)}`);
  };

  // Buyers for our players on the block (and any of ours who asked out).
  for (const id of ts.block) {
    if (state.players[id]?.team !== us || rng() > 0.22 * busy) continue;
    const buyer = cpu.map((t) => ({ t, v: playerValue(state, "gm", t, id, { date: officialDate(state) }).points })).sort((a, b) => b.v - a.v)[Math.floor(rng() * 3)];
    if (!buyer || buyer.v < 10) continue;
    const base: TradeDeal = { teams: [buyer.t, us], send: [[], [{ kind: "player", id }]] };
    // They pay a bit under what they think he's worth: they know he's available.
    const want = Math.max(5, buyer.v * (0.55 + 0.25 * rng()));
    const deal = completeDeal(state, base, 1, want, buyer.v);
    if (deal) make(deal, `The ${teamLabel(buyer.t)} called about ${PLAYER_BY_ID[id].name}.`);
  }
  // Unsolicited calls: a team wants one of ours, or has one to move.
  if (rng() < 0.05 * busy) {
    const team = cpu[Math.floor(rng() * cpu.length)];
    const ours = teamPlayerIds(state, us).filter((id) => canTradePlayer(state, id, team).ok && !NO_TRADE_CLAUSE.has(id))
      .map((id) => ({ id, v: playerValue(state, "gm", team, id, { date: officialDate(state) }).points }))
      .filter((x) => x.v >= 20).sort((a, b) => b.v - a.v).slice(0, 6);
    const pick = ours[Math.floor(rng() * ours.length)];
    if (pick) {
      const base: TradeDeal = { teams: [team, us], send: [[], [{ kind: "player", id: pick.id }]] };
      const deal = completeDeal(state, base, 1, pick.v * (0.6 + 0.3 * rng()), pick.v);
      if (deal) make(deal, `The ${teamLabel(team)} have interest in ${PLAYER_BY_ID[pick.id].name}.`);
    }
  }
  if (rng() < 0.04 * busy) {
    const seller = cpu[Math.floor(rng() * cpu.length)];
    const dir = direction(state, seller);
    const theirs = teamPlayerIds(state, seller).filter((id) => sellReasons(state, id, dir) > 0 && !cornerstone(state, seller, id))
      .map((id) => ({ id, v: playerValue(state, "gm", seller, id).points, mine: playerValue(state, "gm", us, id, { date: officialDate(state) }).points }))
      .filter((x) => x.mine > x.v && x.mine >= 15).sort((a, b) => b.mine - a.mine).slice(0, 4);
    const pick = theirs[Math.floor(rng() * theirs.length)];
    if (pick) {
      const base: TradeDeal = { teams: [seller, us], send: [[{ kind: "player", id: pick.id }], []] };
      const deal = completeDeal(state, base, 0, Math.max(pick.v, 3) + margin(seller, pick.v) + 4 * rng());
      if (deal) make(deal, `The ${teamLabel(seller)} are shopping ${PLAYER_BY_ID[pick.id].name} and think we'd be a fit.`);
    }
  }
}

/** Everything trade-related for one day, after the day's other business. */
export function tradesDaily(state: GameState): void {
  const ts = trades(state);
  if (state.date === KEY.newLeagueYear) processAgreed(state);
  tradeRequests(state);
  callsToOwner(state);
  const w = tradeWindow(state);
  if (w.open) {
    const rng = rngFor(state.seed, `cpu-trades:${state.date}`);
    const rate = tradeRate(state.date);
    // Each try lands about a third of the time.
    const tries = Math.floor(rate * 3) + (rng() < (rate * 3) % 1 ? 1 : 0);
    for (let i = 0; i < tries; i++) cpuTry(state, rng);
  }
  if (state.date === KEY.tradeDeadline) {
    const week = ts.log.filter((t) => t.status === "done" && daysBetween(t.date, state.date) <= 7).length;
    news(state, `The trade deadline passes at 4 PM ET: ${week} trade${week === 1 ? "" : "s"} in the final week`);
    for (const o of ts.offers) if (o.status === "open") o.status = "expired";
  }
  // Requests are forgotten once a player is happy again.
  for (const id of Object.keys(ts.requests)) {
    const ps = state.players[id];
    if (!ps?.team || ((ps.morale ?? 70) >= 60 && !ps.holdout)) delete ts.requests[id];
  }
}

/** A matched offer sheet: the player can't go to the team that made it for a year. */
export function lockMatchedSheet(state: GameState, player: string, offeringTeam: string): void {
  (trades(state).noTradeTo ??= {})[player] = { team: offeringTeam, until: addDays(state.date, 365) };
}
