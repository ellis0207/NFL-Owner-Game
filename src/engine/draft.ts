// The NFL draft each spring: the order (with compensatory picks), mock drafts during
// the season, underclassmen declaring, the combine, the three days of the
// draft itself, draft-day trades, and the undrafted free agent rush after it.
//
// The draft runs at the owner's pace: nothing happens until the owner
// advances a pick, skips to our next pick, or runs to the end of the day. Our
// GM makes any pick of ours the owner skips. On the clock, the GM, head coach
// and both coordinators each recommend a player, from what our scouts know and
// through their own eyes (their hidden evaluation skill and what they care
// about). Nobody ever sees a rating.
//
// Every front office drafts from its own board: what its scouts learned during
// the season, blended with the public consensus where it knows less, plus
// positional value, team needs and scheme fit.
import { invalidateRosters } from "./cap";
import { mediaBoard, mediaRank } from "./college";
import { schoolName } from "./collegeData";
import { minimumSalary, rookieScale, salaryCap as salaryCapFor } from "./contracts";
import { addDays } from "./dates";
import { payCash } from "./finance";
import { letter, OUTLETS } from "./grades";
import { news, send } from "./inbox";
import { HIDDEN_RATINGS, HIDDEN_STAFF, onSeasonChange, PLAYER_BY_ID, PLAYERS, RULES, TEAMS, teamLabel } from "./league";
import { marketView } from "./market";
import { STARTERS } from "./negotiation";
import { draftStanding, draftOrder, off, OFFSEASON_START } from "./offseason";
import { draftClass, type Prospect } from "./prospects";
import { gaussian, rngFor } from "./rng";
import { depthChart, logMove, MIN_ON_53, POSITION_ORDER, releasePlayer, rosterCount, weakestOnRoster } from "./roster";
import { DEFENSE_LABEL, OFFENSE_LABEL } from "./schemes";
import { fitRead, knowledge, perceivedValue, scoutReport } from "./scouting";
import { perceivedAbility, staffEffects, teamSchemes, teamStaff } from "./staff";
import {
  chartValue, checkTrade, completeTrade, describe, parsePick, pickId, pickOverall, pickOwner, picksOf, projectedSlot, trades,
} from "./trades";
import type { Deal, DraftSelection, DraftState, GameState, MockDraft, PlayerData, Position, StaffPerson, TradeDeal } from "./types";

const KEY = RULES.keyDates;
export let DRAFT_YEAR = 0;
/** Day 1 is the first round, Day 2 rounds two and three, Day 3 rounds four through seven. */
export let DRAFT_DAYS: string[] = [];
export const DAY_ROUNDS = [[1], [2, 3], [4, 5, 6, 7]];
/** The day after the draft: the league moves on to the next season. */
export let DRAFT_OVER = "";
/** Underclassmen have until mid-January to declare. */
export let DECLARE_DEADLINE = "";
/** The league announces compensatory picks in early March. */
export let COMP_DATE = "";
export let COMBINE_DATE = "";
/** The first mock of the season comes out the day before opening night. */
export let FIRST_MOCK = "";
let LAST_MOCK = "";
onSeasonChange(() => {
  DRAFT_YEAR = RULES.season + 1;
  DRAFT_DAYS = [KEY.draftStart, addDays(KEY.draftStart, 1), addDays(KEY.draftStart, 2)];
  DRAFT_OVER = addDays(KEY.draftStart, 3);
  DECLARE_DEADLINE = `${DRAFT_YEAR}-01-15`;
  COMP_DATE = addDays(KEY.newLeagueYear, -6);
  COMBINE_DATE = KEY.scoutingCombineStart;
  FIRST_MOCK = addDays(KEY.regularSeasonStart, -1);
  LAST_MOCK = addDays(KEY.draftStart, -1);
});
const ROSTER_MAX = RULES.rosterLimits.offseason;

/**
 * The 2027 compensatory picks: NFL.com's projection from the real 2026 free
 * agency (net losses of unrestricted free agents, valued by contract), 32 picks
 * in rounds 3-7. Within a round they go in order of the lost player's contract.
 * No team was projected a special third-round pick for a minority hire.
 */
const COMP_2027: [team: string, round: number, lost: string, signedWith: string][] = [
  ["PHI", 3, "Jaelan Phillips", "CAR"], ["CIN", 3, "Trey Hendrickson", "BAL"], ["LAC", 3, "Odafe Oweh", "WAS"], ["GB", 3, "Malik Willis", "MIA"],
  ["DEN", 4, "John Franklin-Myers", "TEN"], ["SEA", 4, "Boye Mafe", "CIN"], ["NYG", 4, "Wan'Dale Robinson", "TEN"], ["GB", 4, "Romeo Doubs", "NE"],
  ["KC", 4, "Jaylen Watson", "LA"], ["IND", 4, "Kwity Paye", "LV"], ["BUF", 4, "David Edwards", "NO"], ["JAX", 4, "Devin Lloyd", "CAR"],
  ["SEA", 5, "Kenneth Walker III", "KC"], ["GB", 5, "Quay Walker", "LV"], ["BAL", 5, "Isaiah Likely", "NYG"], ["SEA", 5, "Coby Bryant", "CHI"],
  ["BAL", 5, "Dre'Mont Jones", "NE"], ["JAX", 5, "Travis Etienne", "NO"], ["SEA", 5, "Riq Woolen", "PHI"], ["MIN", 5, "Jalen Nailor", "LV"], ["ATL", 5, "Kaden Elliss", "NO"],
  ["GB", 6, "Kingsley Enagbare", "NYJ"], ["BAL", 6, "Charlie Kolar", "LAC"], ["JAX", 6, "Greg Newsome II", "NYG"], ["DET", 6, "Amik Robertson", "WAS"],
  ["ATL", 6, "Tyler Allgeier", "ARI"], ["DET", 6, "Roy Lopez", "ARI"],
  ["KC", 7, "Marquise Brown", "PHI"], ["IND", 7, "Neville Gallimore", "CHI"], ["MIA", 7, "Larry Borom", "DET"], ["KC", 7, "Charles Omenihu", "WAS"], ["DEN", 7, "P.J. Locke", "DAL"],
];

export function draftState(state: GameState): DraftState {
  return (state.draft ??= { made: [], mocks: [], daysDone: [], nextMock: FIRST_MOCK });
}

function gmOf(team: string): string {
  const gm = teamStaff(team).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

const OFFENSE_POS = new Set<Position>(["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C"]);
const DEFENSE_POS = new Set<Position>(["EDGE", "IDL", "LB", "CB", "S"]);

// ---- The order ----

/** Round 1 order with tied teams rotating each round, as the league does. */
function roundOrder(r1: string[], st: ReturnType<typeof draftStanding>, round: number): string[] {
  const out = [...r1];
  for (let i = 0; i < r1.length;) {
    let j = i;
    while (j + 1 < r1.length && st[r1[j + 1]].lost === st[r1[i]].lost && st[r1[j + 1]].pct === st[r1[i]].pct) j++;
    const group = r1.slice(i, j + 1);
    const k = (round - 1) % group.length;
    out.splice(i, group.length, ...group.slice(k), ...group.slice(0, k));
    i = j + 1;
  }
  return out;
}

/** Every pick in the draft, in order, from the final standings plus the compensatory picks at the end of rounds 3-7. */
export function buildOrder(state: GameState): string[] {
  const st = draftStanding(state);
  const r1 = off(state).draftOrder ?? draftOrder(state);
  const comp = state.draft?.comp ?? [];
  const ids: string[] = [];
  for (let round = 1; round <= 7; round++) {
    for (const t of roundOrder(r1, st, round)) ids.push(pickId(DRAFT_YEAR, round, t));
    for (const c of comp) if (parsePick(c.pick).round === round) ids.push(c.pick);
  }
  return ids;
}

/** The order as it stands, or as the media projects it before the season is over. */
export function projectedOrder(state: GameState, rounds = 7): string[] {
  const order = state.draft?.order;
  if (order) return order.filter((id) => parsePick(id).round <= rounds);
  const teams = TEAMS.map((t) => t.id).sort((a, b) => projectedSlot(state, a, DRAFT_YEAR) - projectedSlot(state, b, DRAFT_YEAR));
  const ids: string[] = [];
  for (let round = 1; round <= rounds; round++) for (const t of teams) ids.push(pickId(DRAFT_YEAR, round, t));
  return ids;
}

function awardCompPicks(state: GameState, quiet = false): void {
  const d = draftState(state);
  const count: Record<string, number> = {};
  const list = DRAFT_YEAR === 2027 ? COMP_2027 : compFormula(state);
  d.comp = list.map(([team, round, player, to]) => {
    const n = (count[`${team}-${round}`] = (count[`${team}-${round}`] ?? 0) + 1);
    return { pick: `${DRAFT_YEAR}-${round}-${team}-c${n}`, player, to };
  });
  d.order = buildOrder(state);
  if (quiet) return;
  news(state, `The league awards ${d.comp.length} compensatory picks for the ${DRAFT_YEAR} draft`);
  const lines = [3, 4, 5, 6, 7].map((r) => `Round ${r}: ${d.comp!.filter((c) => parsePick(c.pick).round === r)
    .map((c) => `${parsePick(c.pick).from} (No. ${pickOverall(state, c.pick)}, for ${c.player})`).join(", ")}`);
  const ours = d.comp.filter((c) => parsePick(c.pick).from === state.userTeam);
  send(state, "league", "League Office", `${DRAFT_YEAR} compensatory picks`,
    "Compensatory picks go to teams that lost more or better unrestricted free agents than they signed last March. " +
    `They come at the end of rounds 3 through 7 and can be traded.\n\n${lines.join("\n")}\n\n` +
    (ours.length ? `We get ${ours.length}: ${ours.map((c) => `No. ${pickOverall(state, c.pick)} for ${c.player}`).join(", ")}.` : "We didn't qualify for any."));
}

/**
 * The compensatory formula, simplified the way the league runs it: every
 * unrestricted free agent whose contract ran out and who signed elsewhere in
 * the spring is valued by his new contract's APY against the cap; each one a
 * team signs cancels one it lost of the same or the next lower value; what's
 * left becomes picks in rounds 3-7. At most four a team and 32 in all.
 */
function compFormula(state: GameState): [team: string, round: number, lost: string, signedWith: string][] {
  const moves = state.league?.cfa?.[DRAFT_YEAR] ?? [];
  const cap = salaryCapFor(state, DRAFT_YEAR - 1);
  const roundOf = (apy: number) => {
    const share = apy / cap;
    return share >= 0.08 ? 3 : share >= 0.045 ? 4 : share >= 0.025 ? 5 : share >= 0.012 ? 6 : share >= 0.006 ? 7 : 0;
  };
  const lost: Record<string, { player: string; to: string; apy: number; round: number }[]> = {};
  const gained: Record<string, number[]> = {};
  for (const m of moves) {
    const round = roundOf(m.apy);
    if (!round) continue;
    (lost[m.from] ??= []).push({ player: m.player, to: m.to, apy: m.apy, round });
    (gained[m.to] ??= []).push(round);
  }
  const out: { team: string; round: number; player: string; to: string; apy: number }[] = [];
  for (const [team, ls] of Object.entries(lost)) {
    const left = [...ls].sort((a, b) => b.apy - a.apy);
    for (const g of (gained[team] ?? []).sort((a, b) => a - b)) {
      // A signing cancels a loss of the same round, or else the best one below it.
      let i = left.findIndex((l) => l.round === g);
      if (i < 0) i = left.findIndex((l) => l.round > g);
      if (i >= 0) left.splice(i, 1);
    }
    for (const l of left.slice(0, 4)) out.push({ team, round: l.round, player: PLAYER_BY_ID[l.player]?.name ?? l.player, to: l.to, apy: l.apy });
  }
  out.sort((a, b) => b.apy - a.apy);
  return out.slice(0, 32).sort((a, b) => a.round - b.round || b.apy - a.apy).map((c) => [c.team, c.round, c.player, c.to]);
}

// ---- Who can be drafted ----

/** Prospects still on the board: not drafted, not signed as a free agent, not back in school. */
export function draftPool(state: GameState): string[] {
  const d = state.draft;
  const taken = new Set(d?.made.map((m) => m.player) ?? []);
  const back = new Set(d?.returned ?? []);
  const udfa = d?.udfa ?? {};
  return draftClass(state.seed).prospects.filter((p) => !taken.has(p.id) && !back.has(p.id) && !(p.id in udfa)).map((p) => p.id);
}

export function selectionOf(state: GameState, id: string): DraftSelection | undefined {
  return state.draft?.made.find((m) => m.player === id);
}

// ---- How teams value prospects ----

/** Value of a position in the draft, in board points: passers and pass rushers go early, specialists late. */
const PREMIUM: Record<Position, number> = {
  QB: 2.5, EDGE: 1.5, OT: 1.2, CB: 0.8, WR: 0.5, IDL: 0.4, TE: -0.6, S: -0.6, LB: -0.8, OG: -0.5, C: -0.8, RB: -1, FB: -8, K: -2.5, P: -2.5, LS: -4,
};

/** Positional value for a team: a team with its quarterback doesn't spend a high pick on another. */
function premium(pos: Position, need: number): number {
  if (pos === "QB" && need < 1) return -1.5;
  return PREMIUM[pos];
}

function needWeight(round: number): number {
  return round === 1 ? 0.9 : round <= 3 ? 1 : 1.1;
}

/** The public's value of a prospect: the media's buzz. */
function publicValue(state: GameState, id: string): number {
  return state.college?.hype[id] ?? draftClass(state.seed).hidden[id].value;
}

const boardCache = new WeakMap<GameState, { key: string; boards: Record<string, Record<string, number>> }>();

/** A team's board value for a prospect: its own scouting where it knows him, the consensus where it doesn't. */
export function boardValue(state: GameState, team: string, id: string): number {
  const key = `${state.date}:${state.draft?.combine ? 1 : 0}:${state.userTeam}`;
  let c = boardCache.get(state);
  if (!c || c.key !== key) boardCache.set(state, (c = { key, boards: {} }));
  const board = (c.boards[team] ??= {});
  if (!(id in board)) {
    const k = knowledge(state, id, team);
    const w = 0.35 + 0.6 * Math.min(1, k / 80);
    board[id] = w * perceivedValue(state, id, team) + (1 - w) * publicValue(state, id);
  }
  return board[id];
}

/** Our board as the owner sees it: our scouts' value of each player, with positional value. */
export function ourBoardValue(state: GameState, id: string): number {
  return boardValue(state, state.userTeam, id) + PREMIUM[draftClass(state.seed).byId[id].position];
}

/** A team's read of how a prospect fits its schemes, sharper the more it knows him. */
function fitEstimate(state: GameState, team: string, id: string): number {
  const k = knowledge(state, id, team);
  if (k < 20) return 0;
  return fitRead(state, id, team) + gaussian(rngFor(state.seed, `fitread:${team}:${id}`)) * 3 * (1 - k / 110);
}

/**
 * How badly a team needs help at each position, 0 (set) to about 3 (a hole):
 * its starters' quality as its GM sees them (or as the public does, for mocks),
 * thin depth, and what it has already drafted this year.
 */
export function teamNeeds(state: GameState, team: string, eye: "gm" | "public"): Record<Position, number> {
  const chart = depthChart(state, team);
  const gmEval = staffEffects(team).gmEval;
  const drafted = (state.draft?.made ?? []).filter((m) => m.team === team);
  const out = {} as Record<Position, number>;
  for (const pos of POSITION_ORDER) {
    const n = pos === "FB" ? 0 : STARTERS[pos] ?? 1;
    if (!n) {
      out[pos] = 0;
      continue;
    }
    let need = 0;
    for (let i = 0; i < n; i++) {
      const id = chart[pos][i];
      const v = id ? (eye === "public" ? marketView(state, id) : perceivedAbility(state, id, `gm:${team}`, gmEval)) : 50;
      need += Math.max(0, Math.min(3, (79 - v) / 3.5));
    }
    need /= n;
    const min = MIN_ON_53[pos] ?? 1;
    if (chart[pos].length < min + 1) need += 0.35 * (min + 1 - chart[pos].length);
    for (const m of drafted) {
      if (PLAYER_BY_ID[m.player]?.position === pos) need -= parsePick(m.pick).round <= 3 ? 1.2 : 0.6;
    }
    out[pos] = Math.max(0, Math.min(3.2, need));
  }
  return out;
}

/** What a CPU front office thinks of a prospect for a pick in this round. */
function cpuScore(state: GameState, team: string, id: string, need: Record<Position, number>, round: number): number {
  const pos = draftClass(state.seed).byId[id].position;
  return boardValue(state, team, id) + premium(pos, need[pos]) + need[pos] * needWeight(round) + 0.25 * fitEstimate(state, team, id) +
    gaussian(rngFor(state.seed, `cpupick:${team}:${id}`)) * 0.7;
}

function bestFor(state: GameState, team: string, pool: string[], round: number, need = teamNeeds(state, team, "gm")): string | undefined {
  let best: string | undefined;
  let top = -Infinity;
  for (const id of topOfPool(state, pool, 90)) {
    const s = cpuScore(state, team, id, need, round);
    if (s > top) {
      top = s;
      best = id;
    }
  }
  return best;
}

/** The best prospects left by consensus, plus anyone a front office might be higher on. */
function topOfPool(state: GameState, pool: string[], n: number): string[] {
  return [...pool].sort((a, b) => publicValue(state, b) - publicValue(state, a)).slice(0, n);
}

// ---- The clock ----

/** Which day of the draft a date is (1-3), or 0. */
export function draftDayOf(date: string): number {
  return DRAFT_DAYS.indexOf(date) + 1;
}

export function dayOfRound(round: number): number {
  return DAY_ROUNDS.findIndex((rs) => rs.includes(round)) + 1;
}

export interface Slot {
  pick: string;
  overall: number;
  round: number;
  /** Pick within the round. */
  inRound: number;
  team: string;
}

export function slotAt(state: GameState, index: number): Slot | null {
  const order = state.draft?.order;
  if (!order || index >= order.length) return null;
  const pick = order[index];
  const round = parsePick(pick).round;
  let inRound = 1;
  for (let i = index - 1; i >= 0 && parsePick(order[i]).round === round; i--) inRound++;
  return { pick, overall: index + 1, round, inRound, team: pickOwner(state, pick) };
}

/** The pick on the clock right now, if the draft is on today. */
export function currentSlot(state: GameState): Slot | null {
  const day = draftDayOf(state.date);
  const d = state.draft;
  if (!day || !d?.order) return null;
  const s = slotAt(state, d.made.length);
  if (!s || dayOfRound(s.round) > day) return null;
  return s;
}

export function onTheClock(state: GameState): boolean {
  return currentSlot(state)?.team === state.userTeam;
}

export function dayDone(state: GameState, day = draftDayOf(state.date)): boolean {
  return !!state.draft?.daysDone.includes(day);
}

/** Our picks still to come in the draft. */
export function ourPicksLeft(state: GameState): Slot[] {
  const d = state.draft;
  if (!d?.order) return [];
  const out: Slot[] = [];
  for (let i = d.made.length; i < d.order.length; i++) {
    const s = slotAt(state, i)!;
    if (s.team === state.userTeam) out.push(s);
  }
  return out;
}

// ---- Making picks ----

/** Rookie scale contract: four years (a fifth-year option for first-rounders), set by the slot. */
export function rookieDeal(team: string, overall: number, date: string): Deal {
  const sc = rookieScale(overall, DRAFT_YEAR);
  const mins = [0, 1, 2, 3].map((i) => minimumSalary(i, DRAFT_YEAR + i));
  const extra = Math.max(0, sc.total - sc.signingBonus - mins.reduce((a, b) => a + b, 0));
  const shape = [0.16, 0.22, 0.27, 0.35];
  const proration = Math.round(sc.signingBonus / 4);
  const years = mins.map((m, i) => {
    const base = m + Math.round(extra * shape[i]);
    // First-rounders are fully guaranteed; early second-rounders get most of it; everyone else gets the bonus.
    const guaranteed = overall <= 32 || (overall <= 48 && i < 2) || (overall <= 64 && i === 0) ? base : 0;
    return { year: DRAFT_YEAR + i, base, proration, bonus: 0, guaranteed, injuryGuaranteed: 0 };
  });
  const total = sc.signingBonus + years.reduce((s, y) => s + y.base, 0);
  return {
    team, signed: date, kind: "rookie", signingBonus: sc.signingBonus, total, apy: Math.round(total / 4),
    guaranteedAtSigning: sc.signingBonus + years.reduce((s, y) => s + y.guaranteed, 0), years,
  };
}

/** Undrafted free agents get three-year minimum deals and a small signing bonus. */
function udfaDeal(team: string, date: string, bonus: number): Deal {
  const proration = Math.round(bonus / 3);
  const years = [0, 1, 2].map((i) => ({ year: DRAFT_YEAR + i, base: minimumSalary(i, DRAFT_YEAR + i), proration, bonus: 0, guaranteed: 0, injuryGuaranteed: 0 }));
  const total = bonus + years.reduce((s, y) => s + y.base, 0);
  return { team, signed: date, kind: "rookie", signingBonus: bonus, total, apy: Math.round(total / 3), guaranteedAtSigning: bonus, years };
}

// Drafted players join the league's player list for this session; the save
// rebuilds them from its draft class on load.
const registered = new Set<string>();

export function clearDraftees(): void {
  if (!registered.size) return;
  for (const id of registered) {
    delete PLAYER_BY_ID[id];
    delete HIDDEN_RATINGS[id];
  }
  for (let i = PLAYERS.length - 1; i >= 0; i--) if (registered.has(PLAYERS[i].id)) PLAYERS.splice(i, 1);
  registered.clear();
}

function register(state: GameState, id: string, team: string, pick: { round: number; overall: number } | null, year = DRAFT_YEAR, hw?: [number, number]): void {
  if (registered.has(id) && PLAYER_BY_ID[id]) return;
  const dc = draftClass(state.seed, year);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  if (!p || !h) return;
  const [first, ...rest] = p.name.split(" ");
  const combine = year === DRAFT_YEAR ? state.draft?.combine?.[id] ?? state.draft?.proDay?.[id] : undefined;
  const data: PlayerData = {
    id, name: p.name, firstName: first, lastName: rest.join(" "), team: null, position: p.position, depthChartPosition: p.position,
    jersey: null, birthDate: p.birthDate, heightIn: hw?.[0] ?? combine?.heightIn ?? p.heightIn, weightLb: hw?.[1] ?? combine?.weightLb ?? p.weightLb,
    college: schoolName(p.school), yearsExp: 0, rookieYear: year,
    draft: { team: pick ? team : null, round: pick?.round ?? null, overall: pick?.overall ?? null },
    contract: {
      source: "estimated-minimum", signedYear: year, years: pick ? 4 : 3, totalValue: null, apy: null, guaranteed: null, apyCapPct: null,
      type: pick ? "Drafted" : "UDFA", otcTeam: team, seasons: [],
    },
    ids: { pfr: null, espn: null, sleeper: null }, headshotUrl: null, stats: [], snaps: {},
  };
  PLAYERS.push(data);
  PLAYER_BY_ID[id] = data;
  HIDDEN_RATINGS[id] = { overall: h.overall, potential: h.potential, durability: h.durability, traits: { ...h.traits } };
  registered.add(id);
}

/** Puts this save's draftees back in the league's player list (after loading a save): past drafts, then this one. */
export function restoreDraftees(state: GameState): void {
  clearDraftees();
  for (const a of state.history?.drafts ?? []) {
    for (const [id, team, round, overall, h, w] of a.picks) register(state, id, team, { round, overall }, a.year, [h, w]);
    for (const [id, team] of a.udfa) register(state, id, team, null, a.year);
  }
  const d = state.draft;
  if (!d) return;
  for (const m of d.made) register(state, m.player, m.team, { round: parsePick(m.pick).round, overall: m.overall });
  for (const [id, team] of Object.entries(d.udfa ?? {})) register(state, id, team, null);
}

/** Makes the pick on the clock. Returns an error, or null. */
export function makePick(state: GameState, player: string, by: DraftSelection["by"]): string | null {
  const slot = currentSlot(state);
  if (!slot) return "Nobody is on the clock.";
  if (!draftPool(state).includes(player)) return "That player isn't available.";
  if (by !== "cpu" && slot.team !== state.userTeam) return "We aren't on the clock.";
  const d = draftState(state);
  const p = draftClass(state.seed).byId[player];
  const need = teamNeeds(state, slot.team, "gm")[p.position];
  register(state, player, slot.team, { round: slot.round, overall: slot.overall });
  state.players[player] = { team: slot.team, status: "camp" };
  state.contracts[player] = rookieDeal(slot.team, slot.overall, state.date);
  // The rookie's signing bonus is paid when he signs, even though the cap spreads it over four years.
  payCash(state, slot.team, state.contracts[player]!.signingBonus);
  invalidateRosters(state);
  d.made.push({ pick: slot.pick, overall: slot.overall, team: slot.team, player, by, need: Math.round(need * 100) / 100 });
  logMove(state, slot.team, player, "drafted", `drafted ${p.position} ${p.name} (${schoolName(p.school)}), round ${slot.round}, No. ${slot.overall}`);
  if (slot.round === 1) news(state, `Round 1, No. ${slot.overall}: the ${teamLabel(slot.team)} select ${p.position} ${p.name}, ${schoolName(p.school)}`);
  // Calls about this pick are over.
  for (const o of trades(state).offers) if (o.status === "open" && o.id.startsWith(`draft-${slot.overall}-`)) o.status = "expired";
  const next = slotAt(state, d.made.length);
  const day = draftDayOf(state.date);
  if (!next || dayOfRound(next.round) > day) finishDay(state, day);
  else prepareClock(state);
  return null;
}

/** A CPU team on the clock: it might trade down first, then picks. Our pick, skipped: the GM picks. */
export function advancePick(state: GameState): void {
  prepareClock(state);
  let slot = currentSlot(state);
  if (!slot) return;
  if (slot.team === state.userTeam) {
    const rec = staffRecommendations(state).find((r) => r.role === "GM") ?? staffRecommendations(state)[0];
    if (rec) makePick(state, rec.player, "gm");
    return;
  }
  tryTradeUp(state, slot);
  slot = currentSlot(state)!;
  const pick = bestFor(state, slot.team, draftPool(state), slot.round);
  if (pick) makePick(state, pick, "cpu");
}

/** Runs the draft until we're on the clock (our GM makes the pick if we already are), or the day ends. */
export function advanceToOurPick(state: GameState): void {
  if (onTheClock(state)) advancePick(state);
  for (let i = 0; i < 300; i++) {
    const s = currentSlot(state);
    if (!s || s.team === state.userTeam) return;
    advancePick(state);
  }
}

/** Runs today's rounds to the end. Our GM makes our picks. */
export function advanceToEndOfDay(state: GameState): void {
  for (let i = 0; i < 300 && currentSlot(state); i++) advancePick(state);
  // A save that skipped a day (or an older save) catches up on its earlier rounds too.
  const day = draftDayOf(state.date);
  if (day && !dayDone(state, day) && !currentSlot(state)) finishDay(state, day);
}

// ---- Staff recommendations ----

export interface StaffRec {
  role: "GM" | "HC" | "OC" | "DC";
  name: string;
  title: string;
  player: string;
  reason: string;
}

const ROLE_TITLE = { GM: "general manager", HC: "head coach", OC: "offensive coordinator", DC: "defensive coordinator" };
const recCache = new WeakMap<GameState, { key: string; recs: StaffRec[] }>();

function evalSkill(person: StaffPerson | undefined): number {
  return (person && HIDDEN_STAFF[person.id]?.evaluation) ?? 60;
}

const POS_NOUN: Record<Position, string> = {
  QB: "quarterback", RB: "running back", FB: "fullback", WR: "receiver", TE: "tight end", OT: "tackle", OG: "guard", C: "center",
  EDGE: "edge rusher", IDL: "interior lineman", LB: "linebacker", CB: "corner", S: "safety", K: "kicker", P: "punter", LS: "long snapper",
};

/** What the GM, head coach and both coordinators want with our pick on the clock. */
export function staffRecommendations(state: GameState): StaffRec[] {
  const slot = currentSlot(state);
  const us = state.userTeam;
  const d = state.draft;
  const key = `${state.date}:${d?.made.length}:${slot?.team}`;
  const hit = recCache.get(state);
  if (hit?.key === key) return hit.recs;
  const round = slot?.round ?? 1;
  const pool = topOfPool(state, draftPool(state), 120);
  const need = teamNeeds(state, us, "gm");
  const dc = draftClass(state.seed);
  const staff = teamStaff(us);
  const schemes = teamSchemes(us);
  const recs: StaffRec[] = [];
  for (const role of ["GM", "HC", "OC", "DC"] as const) {
    const person = staff[role];
    if (!person) continue;
    const sd = (100 - evalSkill(person)) / 12;
    const hcSide = role === "HC" ? person.side : null;
    const rows: { id: string; score: number; needC: number; fitC: number; base: number }[] = [];
    for (const id of pool) {
      const p = dc.byId[id];
      if (role === "OC" && !OFFENSE_POS.has(p.position)) continue;
      if (role === "DC" && !DEFENSE_POS.has(p.position)) continue;
      if (role !== "GM" && ["K", "P", "LS"].includes(p.position) && round < 5) continue;
      const base = boardValue(state, us, id) + gaussian(rngFor(state.seed, `rec:${person.id}:${id}`)) * sd;
      let needW = needWeight(round);
      let fitW = 0.25;
      let side = 0;
      if (role === "HC") {
        needW *= 1.15;
        fitW = 0.6;
        if (hcSide === "offense" && OFFENSE_POS.has(p.position)) side = 0.6;
        if (hcSide === "defense" && DEFENSE_POS.has(p.position)) side = 0.6;
      } else if (role !== "GM") fitW = 0.8;
      const needC = need[p.position] * needW;
      const fitC = fitEstimate(state, us, id) * fitW;
      // Coaches want help now; the GM thinks about the long run.
      const h = dc.hidden[id];
      const now = role === "GM" ? 0 : 0.25 * (h.overall - h.value) * Math.min(1, knowledge(state, id, us) / 50);
      rows.push({ id, score: base + premium(p.position, need[p.position]) + needC + fitC + side + now, needC, fitC, base });
    }
    rows.sort((a, b) => b.score - a.score);
    const top = rows[0];
    if (!top) continue;
    const lead = top.score - (rows[1]?.score ?? top.score);
    const p = dc.byId[top.id];
    const last = p.name.split(" ").slice(-1)[0];
    const report = scoutReport(state, top.id);
    const scheme = (OFFENSE_POS.has(p.position) ? OFFENSE_LABEL[schemes.offense] : DEFENSE_LABEL[schemes.defense]).toLowerCase();
    const h = dc.hidden[top.id];
    let reason: string;
    if (top.needC >= 1.5) reason = `${cap(POS_NOUN[p.position])} is the biggest hole we have, and ${last} is the best one left on my board.`;
    else if (top.fitC >= 1 && !["K", "P", "LS"].includes(p.position)) reason = `Made for our ${scheme}. ${last} does exactly what we ask of the position.`;
    else if (lead >= 3) reason = `${last} is the best player left on my board, and it isn't close.`;
    else if (role === "HC" && report.role?.startsWith("Day-one")) reason = `${last} can start for us this season.`;
    else if (role === "GM" && h.potential - h.overall >= 7 && knowledge(state, top.id, us) >= 50) reason = `The ceiling on ${last} is as high as anyone's left. Give him a year or two.`;
    else if (top.needC >= 0.8) reason = `Best player available at a spot where we can use help.`;
    else if (role === "OC") reason = ["OT", "OG", "C"].includes(p.position) ? `Protect the quarterback. ${last} is the best lineman left.` : `${last} would give us something we don't have on offense.`;
    else if (role === "DC") reason = ["CB", "S"].includes(p.position) ? `${last} is the best cover player left on my board.` : `${last} is the best front-seven player left on my board.`;
    else if (role === "HC") reason = `${last} fits how we want to play, and he's the best of what's left for us.`;
    else reason = `Best player on our board. We take the talent and sort out the depth chart later.`;
    recs.push({ role, name: person.name, title: ROLE_TITLE[role], player: top.id, reason });
  }
  recCache.set(state, { key, recs });
  return recs;
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

// ---- Draft-day trades ----

/** Chart value of a pick: its slot this year, the middle of its round for future years (worth less). */
function chartPick(state: GameState, id: string): number {
  const { year, round } = parsePick(id);
  const overall = pickOverall(state, id);
  if (overall && year === DRAFT_YEAR) return chartValue(overall);
  return chartValue((round - 1) * 32 + 16) * Math.pow(0.75, year - DRAFT_YEAR);
}

/**
 * How badly a team picking later wants to jump to this slot: the gap between
 * its favorite prospect and the best one it expects to still be there.
 */
function eagerness(state: GameState, team: string, gap: number, round: number): number {
  const pool = topOfPool(state, draftPool(state), 60);
  const need = teamNeeds(state, team, "gm");
  const scored = pool.map((id, rank) => ({ id, rank, s: cpuScore(state, team, id, need, round) })).sort((a, b) => b.s - a.s);
  const top = scored[0];
  if (!top || top.rank >= gap + 4) return 0; // he'll likely last anyway
  const fallback = scored.find((x) => x.rank >= gap);
  return top.s - (fallback?.s ?? top.s);
}

/** A package of a team's picks worth about `target` chart points, starting with the pick it moves. */
function package_(state: GameState, team: string, first: string, target: number, exclude: Set<string>): string[] | null {
  const out = [first];
  let have = chartPick(state, first);
  const avail = picksOf(state, team).filter((id) => id !== first && !exclude.has(id) && parsePick(id).year <= DRAFT_YEAR + 1);
  for (let i = 0; i < 3 && have < target; i++) {
    const left = target - have;
    const rest = avail.filter((id) => !out.includes(id)).map((id) => ({ id, v: chartPick(state, id) }));
    const cover = rest.filter((x) => x.v >= left).sort((a, b) => a.v - b.v)[0];
    const next = cover ?? rest.filter((x) => x.v < left).sort((a, b) => b.v - a.v)[0];
    if (!next) return null;
    out.push(next.id);
    have += next.v;
  }
  if (have < target || have > target * 1.6 + 5) return null;
  return out;
}

/** The team on the clock may take a call from a team that wants to move up. */
function tryTradeUp(state: GameState, slot: Slot): void {
  const rng = rngFor(state.seed, `draftcall:${slot.overall}`);
  const chance = slot.round === 1 ? 0.2 : slot.round <= 3 ? 0.13 : 0.07;
  if (rng() > chance) return;
  const d = state.draft!;
  const seller = slot.team;
  const hard = (staffEffects(seller).gmNegotiation - 50) / 50;
  const value = chartPick(state, slot.pick);
  const buyers: { team: string; pick: string; e: number }[] = [];
  const seen = new Set([seller, state.userTeam]);
  for (let i = d.made.length + 1; i < Math.min(d.order!.length, d.made.length + 16); i++) {
    const s = slotAt(state, i)!;
    if (seen.has(s.team)) continue;
    seen.add(s.team);
    const e = eagerness(state, s.team, i - d.made.length, slot.round);
    if (e >= (slot.round === 1 ? 1.4 : 1.1)) buyers.push({ team: s.team, pick: s.pick, e });
  }
  buyers.sort((a, b) => b.e - a.e);
  for (const b of buyers.slice(0, 2)) {
    const pkg = package_(state, b.team, b.pick, value * (1.04 + 0.04 * hard + 0.06 * rng()), new Set([slot.pick]));
    if (!pkg) continue;
    const deal: TradeDeal = { teams: [seller, b.team], send: [[{ kind: "pick", pick: slot.pick }], pkg.map((pick) => ({ kind: "pick" as const, pick }))] };
    if (!checkTrade(state, deal).ok) continue;
    completeTrade(state, deal);
    return;
  }
}

/** When we're on the clock, teams behind us call to move up. Their offers last until we pick. */
export function prepareClock(state: GameState): void {
  const slot = currentSlot(state);
  const d = state.draft;
  if (!slot || !d || slot.team !== state.userTeam || d.callsFor === slot.overall) return;
  d.callsFor = slot.overall;
  const rng = rngFor(state.seed, `ourcalls:${slot.overall}`);
  const value = chartPick(state, slot.pick);
  const seen = new Set([state.userTeam]);
  const ts = trades(state);
  let made = 0;
  for (let i = d.made.length + 1; i < Math.min(d.order!.length, d.made.length + 20) && made < 3; i++) {
    const s = slotAt(state, i)!;
    if (seen.has(s.team)) continue;
    seen.add(s.team);
    const e = eagerness(state, s.team, i - d.made.length, slot.round);
    if (e < 0.8 || rng() > 0.75) continue;
    const pkg = package_(state, s.team, s.pick, value * (1.0 + 0.1 * rng()), new Set());
    if (!pkg) continue;
    const deal: TradeDeal = { teams: [s.team, state.userTeam], send: [pkg.map((pick) => ({ kind: "pick" as const, pick })), [{ kind: "pick", pick: slot.pick }]] };
    if (!checkTrade(state, deal).ok) continue;
    ts.offers.push({
      ...deal, id: `draft-${slot.overall}-${s.team}`, date: state.date, expires: state.date, status: "open",
      note: `The ${teamLabel(s.team)} want to move up to No. ${slot.overall}. They'd give ${describe(state, deal.send[0], s.team)}.`,
    });
    made++;
  }
}

/** Draft-day calls to us about the pick we're on the clock with. */
export function draftCalls(state: GameState) {
  const slot = currentSlot(state);
  if (!slot) return [];
  return trades(state).offers.filter((o) => o.status === "open" && o.id.startsWith(`draft-${slot.overall}-`));
}

// ---- After each day ----

/** Our GM's board for the whole class, as it stood when the draft began (for grades): each prospect's rank. */
function gmBoard(state: GameState): Record<string, number> {
  const us = state.userTeam;
  const gm = teamStaff(us).GM;
  const sd = (100 - evalSkill(gm)) / 12;
  const back = new Set(state.draft?.returned ?? []);
  const view: Record<string, number> = {};
  for (const p of draftClass(state.seed).prospects) {
    if (back.has(p.id)) continue;
    view[p.id] = boardValue(state, us, p.id) + gaussian(rngFor(state.seed, `rec:${gm?.id ?? us}:${p.id}`)) * sd + PREMIUM[p.position];
  }
  const ids = Object.keys(view).sort((a, b) => view[b] - view[a]);
  return Object.fromEntries(ids.map((id, i) => [id, i + 1]));
}

/**
 * Our GM grades each pick by where the player sat on our board against where
 * he went: a player we had 10th taken 30th is a steal, the reverse a reach.
 * Filling a need helps. The GM goes a little easy on his own picks.
 */
function gradeDay(state: GameState, day: number): DraftSelection[] {
  const d = state.draft!;
  const rank = gmBoard(state);
  const today = d.made.filter((m) => dayOfRound(parsePick(m.pick).round) === day);
  for (const m of today) {
    const r = rank[m.player] ?? 400;
    // Smoothed, so a few spots at the top of the draft don't swing a grade as much as they would later.
    const value = Math.log((m.overall + 8) / (r + 8));
    const need = m.need ?? 0;
    const ours = m.team === state.userTeam ? 0.04 : 0;
    m.grade = letter(0.99 + 0.18 * value + 0.03 * Math.min(3, need) + ours);
    const words = value >= 0.9 ? "A steal: we had him going much earlier." : value >= 0.3 ? "Good value here." : value >= -0.3 ? "Right about where we had him."
      : value >= -0.9 ? "A bit of a reach." : "A big reach: we had him much later.";
    m.note = `${words} We had him No. ${r} on our board.` + (need >= 1.5 ? " Fills a real need." : need < 0.3 && value < 0 ? " Not a spot they needed." : "");
  }
  return today;
}

function finishDay(state: GameState, day: number): void {
  const d = draftState(state);
  if (!day || d.daysDone.includes(day)) return;
  d.daysDone.push(day);
  const graded = gradeDay(state, day);
  const us = state.userTeam;
  const dc = draftClass(state.seed);
  const line = (m: DraftSelection) => {
    const p = dc.byId[m.player];
    return `No. ${m.overall} ${p.position} ${p.name}, ${schoolName(p.school)}`;
  };
  const ours = graded.filter((m) => m.team === us);
  const sorted = [...graded].sort((a, b) => gradeRank(b.grade!) - gradeRank(a.grade!));
  const best = sorted.filter((m) => m.team !== us).slice(0, 3);
  const worst = sorted.filter((m) => m.team !== us).slice(-3).reverse();
  const rounds = DAY_ROUNDS[day - 1];
  const label = rounds.length === 1 ? "Round 1" : `Rounds ${rounds[0]}-${rounds[rounds.length - 1]}`;
  send(state, "staff", gmOf(us), `Draft Day ${day} grades`,
    (ours.length ? `Our picks:\n${ours.map((m) => `${line(m)}: ${m.grade}. ${m.note}`).join("\n")}` : `We didn't pick in ${label.toLowerCase()}.`) +
    `\n\nBest value around the league:\n${best.map((m) => `${m.team} ${line(m)}: ${m.grade}`).join("\n")}` +
    `\n\nBiggest reaches:\n${worst.map((m) => `${m.team} ${line(m)}: ${m.grade}`).join("\n")}` +
    `\n\nI graded every pick from ${label.toLowerCase()} on the Draft page.` +
    (day < 3 ? ` Day ${day + 1} starts tomorrow.` : ""));
  news(state, `Day ${day} of the ${DRAFT_YEAR} draft is complete (${label.toLowerCase()})`);
  if (state.day?.date === state.date) state.day.done.draft = ours.length ? `We drafted ${ours.map((m) => `${dc.byId[m.player].position} ${dc.byId[m.player].name}`).join(", ")}.` : "Day complete.";
  if (day === 3) udfaRush(state);
}

function gradeRank(g: string): number {
  return ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"].indexOf(g);
}

/** Right after the last pick, every team signs undrafted free agents to fill out its 90. */
function udfaRush(state: GameState): void {
  const d = draftState(state);
  d.udfa ??= {};
  const rng = rngFor(state.seed, "udfa");
  const teams = TEAMS.map((t) => t.id).sort(() => rng() - 0.5);
  const want: Record<string, number> = {};
  for (const t of teams) want[t] = Math.max(4, Math.min(16, ROSTER_MAX + 4 - rosterCount(state, t).roster));
  const signed: Record<string, string[]> = {};
  for (let pass = 0; pass < 16; pass++) {
    const pool = draftPool(state);
    for (const team of teams) {
      if ((signed[team]?.length ?? 0) >= want[team]) continue;
      const id = bestFor(state, team, pool, 7);
      if (!id) continue;
      pool.splice(pool.indexOf(id), 1);
      const bonus = Math.round((pass < 3 ? 40_000 + rng() * 160_000 : 5_000 + rng() * 25_000) / 1000) * 1000;
      register(state, id, team, null);
      d.udfa[id] = team;
      state.players[id] = { team, status: "camp" };
      state.contracts[id] = udfaDeal(team, state.date, bonus);
      payCash(state, team, bonus);
      const p = draftClass(state.seed).byId[id];
      logMove(state, team, id, "signed", `signed undrafted free agent ${p.position} ${p.name} (${schoolName(p.school)})`);
      (signed[team] ??= []).push(id);
    }
  }
  invalidateRosters(state);
  // Teams over 90 let veterans go.
  const cut: string[] = [];
  for (const team of teams) {
    for (let i = 0; i < 25 && rosterCount(state, team).roster > ROSTER_MAX; i++) {
      const id = weakestOnRoster(state, team, "WR");
      if (!id) break;
      releasePlayer(state, id);
      if (team === state.userTeam) cut.push(id);
    }
  }
  const total = Object.values(signed).reduce((s, x) => s + x.length, 0);
  news(state, `Teams sign ${total} undrafted free agents after the draft`);
  const ours = signed[state.userTeam] ?? [];
  const dc = draftClass(state.seed);
  send(state, "transaction", gmOf(state.userTeam), "Undrafted free agents",
    `We signed ${ours.length} undrafted free agents as soon as the draft ended: ` +
    `${ours.map((id) => `${dc.byId[id].position} ${dc.byId[id].name} (${schoolName(dc.byId[id].school)})`).join(", ")}.` +
    (cut.length ? `\n\nTo stay at ${ROSTER_MAX} we released ${cut.map((id) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name}`).join(", ")}.` : "") +
    `\n\nWe're at ${rosterCount(state, state.userTeam).roster} players.`);
}

// ---- During the season: mocks, declarations, the combine ----

const ANALYSTS: Record<string, string> = {
  "The Gridiron Ledger": "Dana Whitfield",
  "Sideline Report": "Marcus Bell",
  "Cap Space Daily": "Priya Raman",
};

/** Rounds in a mock: just the first early on, growing to four by draft week. */
export function mockRounds(date: string): number {
  if (date < DECLARE_DEADLINE) return 1;
  if (date < COMBINE_DATE) return 2;
  if (date < `${DRAFT_YEAR}-04-01`) return 3;
  return 4;
}

/** Days to the next mock: about a month early in the season, every two weeks by spring. */
function mockGap(state: GameState, date: string): number {
  const r = rngFor(state.seed, `mockgap:${date}`)();
  if (date < `${DRAFT_YEAR - 1}-11-01`) return 28;
  if (date < `${DRAFT_YEAR}-01-01`) return 21 + Math.round(r * 7);
  if (date < `${DRAFT_YEAR}-03-01`) return 14 + Math.round(r * 7);
  return 14;
}

export function releaseMock(state: GameState, quiet = false): MockDraft {
  const d = draftState(state);
  const rounds = mockRounds(state.date);
  const outlet = OUTLETS[d.mocks.length % OUTLETS.length];
  const version = d.mocks.filter((m) => m.outlet === outlet.name).length + 1;
  const slots = projectedOrder(state, rounds);
  const pool = topOfPool(state, draftPool(state), Math.round(slots.length * 1.8));
  const dc = draftClass(state.seed);
  const needs: Record<string, Record<Position, number>> = {};
  const teams: string[] = [];
  const players: string[] = [];
  slots.forEach((pick, i) => {
    const team = pickOwner(state, pick);
    const need = (needs[team] ??= teamNeeds(state, team, "public"));
    const round = parsePick(pick).round;
    let best = "";
    let top = -Infinity;
    for (const id of pool.slice(0, i + 40)) {
      const pos = dc.byId[id].position;
      const s = publicValue(state, id) + premium(pos, need[pos]) + need[pos] * needWeight(round) +
        gaussian(rngFor(state.seed, `mock:${outlet.name}:${state.date}:${id}`)) * 1.1 + gaussian(rngFor(state.seed, `mock:${state.date}:${team}:${id}`)) * 0.5;
      if (s > top) {
        top = s;
        best = id;
      }
    }
    pool.splice(pool.indexOf(best), 1);
    need[dc.byId[best].position] = Math.max(0, need[dc.byId[best].position] - (round <= 3 ? 1.2 : 0.6));
    teams.push(team);
    players.push(best);
  });
  const mock: MockDraft = { date: state.date, outlet: outlet.name, analyst: ANALYSTS[outlet.name] ?? "Staff", version, rounds, slots, teams, players };
  d.mocks.unshift(mock);
  if (d.mocks.length > 40) d.mocks.length = 40;
  let next = addDays(state.date, mockGap(state, state.date));
  if (state.date < LAST_MOCK && next > LAST_MOCK) next = LAST_MOCK;
  d.nextMock = state.date >= LAST_MOCK ? "9999-12-31" : next;
  if (!quiet) {
    news(state, `${outlet.name} releases ${ANALYSTS[outlet.name]}'s mock draft ${version}.0 (${rounds === 1 ? "first round" : `${rounds} rounds`})`);
    const ours = slots.map((s, i) => [s, i] as const).filter(([, i]) => teams[i] === state.userTeam).slice(0, 4);
    if (ours.length) {
      send(state, "media", `${mock.analyst}, ${outlet.name}`, `Mock draft ${version}.0`,
        ours.map(([s, i]) => {
          const p = dc.byId[players[i]];
          const slot = state.draft?.order ? `No. ${i + 1}` : `Round ${parsePick(s).round}, projected No. ${i + 1}`;
          return `${slot}: ${p.position} ${p.name}, ${schoolName(p.school)}`;
        }).join("\n") + "\n\nThe full mock is on the Draft page.");
    }
  }
  return mock;
}

/** Underclassmen decide: the ones projected to go high declare, many of the rest go back to school. */
function declarations(state: GameState, quiet = false): void {
  const d = draftState(state);
  d.declared = true;
  const returned: string[] = [];
  let declared = 0;
  for (const p of draftClass(state.seed).prospects) {
    if (!["JR", "RS JR", "RS SO"].includes(p.classYear) || p.back) continue;
    const rank = mediaRank(state, p.id);
    const stay = rank <= 50 ? 0.02 : rank <= 120 ? 0.12 : rank <= 250 ? 0.35 : 0.6;
    if (rngFor(state.seed, `declare:${p.id}`)() < stay) returned.push(p.id);
    else declared++;
  }
  d.returned = returned;
  if (quiet) return;
  news(state, `The underclassman deadline passes: ${declared} declare for the ${DRAFT_YEAR} draft, ${returned.length} go back to school`);
  const tracked = returned.filter((id) => knowledge(state, id) >= 30);
  const dc = draftClass(state.seed);
  const col = teamStaff(state.userTeam).COL;
  send(state, "staff", `${col?.name ?? "Director of college scouting"}, director of college scouting`, "Underclassmen have declared",
    `${declared} underclassmen declared for the draft by today's deadline and ${returned.length} are going back to school. ` +
    (tracked.length ? `Players we'd done work on who are staying in school: ${tracked.slice(0, 10).map((id) => `${dc.byId[id].position} ${dc.byId[id].name} (${schoolName(dc.byId[id].school)})`).join(", ")}${tracked.length > 10 ? " and others" : ""}.` : "None of them were players we'd spent time on."));
}

/** The combine in Indianapolis: measurements and workouts everyone sees. */
function combine(state: GameState, quiet = false): void {
  const d = draftState(state);
  const dc = draftClass(state.seed);
  const invited = mediaBoard(state).slice(0, 330);
  const results: Record<string, { heightIn: number; weightLb: number; forty?: number; vertical?: number; bench?: number }> = {};
  for (const id of invited) {
    const p = dc.byId[id];
    const h = dc.hidden[id];
    const rng = rngFor(state.seed, `combine:${id}`);
    const special = ["K", "P", "LS"].includes(p.position);
    const r: (typeof results)[string] = { heightIn: h.heightIn, weightLb: h.weightLb + Math.round(gaussian(rng) * 2) };
    if (!special && rng() < 0.82) r.forty = Math.round((h.forty + gaussian(rng) * 0.03) * 100) / 100;
    if (!special && rng() < 0.8) r.vertical = Math.round(((h.traits.agility ?? h.overall) * 0.35 + (h.traits.speed ?? h.overall) * 0.15 + 2 + gaussian(rng) * 2) * 2) / 2;
    if (!special && rng() < 0.7) r.bench = Math.max(4, Math.round(((h.traits.strength ?? h.overall) - 40) * 0.45 + (h.weightLb - 200) * 0.06 + gaussian(rng) * 2.5));
    results[id] = r;
  }
  d.combine = results;
  // Workouts move the boards: fast times for the position help, slow ones hurt.
  const byPos: Record<string, number[]> = {};
  for (const [id, r] of Object.entries(results)) if (r.forty) (byPos[dc.byId[id].position] ??= []).push(r.forty);
  const avg = Object.fromEntries(Object.entries(byPos).map(([pos, xs]) => [pos, xs.reduce((a, b) => a + b, 0) / xs.length]));
  const hype = state.college!.hype;
  for (const [id, r] of Object.entries(results)) {
    if (r.forty) hype[id] = Math.round((hype[id] + Math.max(-1.5, Math.min(1.5, (avg[dc.byId[id].position] - r.forty) * 8))) * 10) / 10;
  }
  // Every team's scouts are in the building: everyone learns a little about every invitee.
  const s = state.college!.scouting;
  for (const id of invited) {
    s.know[id] = Math.min(100, (s.know[id] ?? 0) + 4);
    for (const arr of Object.values(s.cpu)) arr[dc.index[id]] = Math.min(92, (arr[dc.index[id]] ?? 0) + 4);
  }
  if (quiet) return;
  const fastest = Object.entries(results).filter(([, r]) => r.forty).sort((a, b) => a[1].forty! - b[1].forty!).slice(0, 5);
  news(state, `${invited.length} prospects work out at the scouting combine`);
  const col = teamStaff(state.userTeam).COL;
  send(state, "staff", `${col?.name ?? "Director of college scouting"}, director of college scouting`, "Combine wrap-up",
    `${invited.length} prospects were invited to Indianapolis. Official heights, weights and workout numbers are on each prospect's page now.\n\n` +
    `Fastest 40s:\n${fastest.map(([id, r]) => `${dc.byId[id].position} ${dc.byId[id].name}: ${r.forty!.toFixed(2)}`).join("\n")}`);
}

/** Everything the draft calendar does on a day, run as the day ends. */
export function draftDaily(state: GameState): void {
  const d = draftState(state);
  const date = state.date;
  if (date === DECLARE_DEADLINE) declarations(state);
  if (date === COMBINE_DATE) combine(state);
  if (date === OFFSEASON_START) d.order = buildOrder(state);
  if (date === COMP_DATE) awardCompPicks(state);
  if (d.nextMock && date >= d.nextMock && date < KEY.draftStart) releaseMock(state);
}

/** Older saves and saves past these dates catch up on the draft calendar. */
export function ensureDraft(state: GameState): void {
  const d = draftState(state);
  d.daysDone ??= [];
  d.mocks ??= [];
  d.made ??= [];
  const date = state.date;
  if (!d.declared && date > DECLARE_DEADLINE) declarations(state, true);
  if (!d.combine && date > COMBINE_DATE && state.college) combine(state, true);
  if (!d.order && date > OFFSEASON_START) d.order = buildOrder(state);
  if (!d.comp && date > COMP_DATE) awardCompPicks(state, true);
  if (!d.mocks.length && date > FIRST_MOCK && date <= KEY.draftStart && state.college) releaseMock(state, true);
  if (!d.nextMock) d.nextMock = date <= FIRST_MOCK ? FIRST_MOCK : addDays(date, 14);
  restoreDraftees(state);
}

// ---- What the owner sees ----

export function dayLabel(day: number): string {
  const rounds = DAY_ROUNDS[day - 1];
  return `Day ${day}: ${rounds.length === 1 ? "Round 1" : `Rounds ${rounds[0]}-${rounds[rounds.length - 1]}`}`;
}

/** "Round 2, pick 7 (No. 39)" */
export function slotLabel(s: Pick<Slot, "round" | "inRound" | "overall">): string {
  return `Round ${s.round}, pick ${s.inRound} (No. ${s.overall})`;
}

/** Where the latest mock has a prospect going, if it has him. */
export function mockSpot(state: GameState, id: string): { mock: MockDraft; overall: number; team: string } | null {
  const mock = state.draft?.mocks[0];
  if (!mock) return null;
  const i = mock.players.indexOf(id);
  return i < 0 ? null : { mock, overall: i + 1, team: mock.teams[i] };
}

export function prospectOf(state: GameState, id: string): Prospect {
  return draftClass(state.seed).byId[id];
}

/** Our picks this year, with the money each one costs on the rookie scale. */
export function ourClass(state: GameState): { m: DraftSelection; deal: Deal | null }[] {
  return (state.draft?.made ?? []).filter((m) => m.team === state.userTeam).map((m) => ({ m, deal: state.contracts[m.player] ?? null }));
}

export function teamDraftCount(state: GameState, team: string): number {
  return (state.draft?.made ?? []).filter((m) => m.team === team).length;
}

