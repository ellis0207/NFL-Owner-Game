// The analytics department as people and tools: the analysts on staff by
// name, the data the club buys, the models they build (contracts, demand,
// availability), the optimizers (cap structure, trading down), and
// experiments that measure what a change really does before the club
// commits to it.
//
// Analysts: the staff level sets the head count; each analyst has a skill
// (engine only) and the department's average shifts every effect of the
// level a little either way. Data: each feed is bought by the year and
// sharpens one kind of work. Experiments: every change worth testing has a
// true effect, hidden and fixed for the save; a test measures it with noise
// that a bigger, better staff shrinks. Adopting a change applies the true
// effect, whatever the test said. Names are made up from the shared lists.
import { capHit, releaseCost, teamPlayerIds } from "./cap";
import { careerLines } from "./careerstats";
import { dealOf, leagueYear, minimumSalary } from "./contracts";
import { addDays } from "./dates";
import { ELITE, production } from "./honors";
import { send } from "./inbox";
import { post } from "./business";
import { PLAYER_BY_ID, RULES } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor } from "./rng";
import { chartValue, pickOverall, trades } from "./trades";
import type { GameState } from "./types";

export type AnalystRole = "director" | "football" | "quant" | "engineer" | "research";
export interface Analyst { name: string; role: AnalystRole; skill: number; since: number }

export const ANALYST_ROLE: Record<AnalystRole, string> = { director: "Director of analytics", football: "Football analyst", quant: "Quantitative analyst", engineer: "Data engineer", research: "Research scientist" };

/** Head count by staff level: none, small, established, leading. */
const ROSTER: AnalystRole[][] = [
  [],
  ["football", "quant", "engineer"],
  ["director", "football", "football", "quant", "engineer", "engineer"],
  ["director", "football", "football", "quant", "quant", "engineer", "engineer", "research", "research", "football"],
];

export const DATA_FEEDS = {
  tracking: { label: "Player-tracking feed", cost: 600_000, what: "Every player's position on every snap: sharper game plans and fourth-down calls." },
  film: { label: "Film-tagging system", cost: 350_000, what: "Tagged film of every team: better advance reports and draft tape." },
  college: { label: "College data service", cost: 250_000, what: "Charting of every college game: the analysts' draft model gets sharper." },
  injury: { label: "Injury and availability database", cost: 300_000, what: "League-wide injury histories: sharper diagnoses and availability forecasts." },
  fans: { label: "Fan and ticketing data", cost: 200_000, what: "Who buys, who comes back: experiments on promotions read cleaner." },
} as const;
export type Feed = keyof typeof DATA_FEEDS;

export const EXPERIMENTS = {
  practice: { label: "A new practice-teaching method on half the roster", weeks: 8, what: "Measures how much faster players develop." },
  conditioning: { label: "A new conditioning plan on half the roster", weeks: 8, what: "Measures soft-tissue injuries in each group." },
  promotion: { label: "A new ticket promotion on half the home games", weeks: 10, what: "Measures attendance and single-game sales." },
  services: { label: "A player-services pilot with half the roster", weeks: 8, what: "Measures how players feel about the club." },
} as const;
export type ExperimentKind = keyof typeof EXPERIMENTS;

export interface Experiment { kind: ExperimentKind; started: string; ends: string; measured?: number; margin?: number; adopted?: boolean; dropped?: boolean }

export interface AnalystsState {
  staff: Analyst[];
  feeds: Partial<Record<Feed, boolean>>;
  experiments: Experiment[];
  hires: number;
}

function analyst(state: GameState, role: AnalystRole, n: number): Analyst {
  const rng = rngFor(state.seed, `analyst:${n}`);
  return { name: `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`, role, skill: Math.round(45 + rng() * 45), since: RULES.season };
}

export function analysts(state: GameState): AnalystsState {
  const x = (state.analysts ??= { staff: [], feeds: {}, experiments: [], hires: 0 });
  // Head count follows the staff level the owner set.
  const level = state.analytics?.level ?? 1;
  const want = ROSTER[level] ?? [];
  if (x.staff.length !== want.length) {
    const kept: Analyst[] = [];
    const pool = [...x.staff];
    for (const role of want) {
      const i = pool.findIndex((a) => a.role === role);
      if (i >= 0) kept.push(pool.splice(i, 1)[0]);
      else kept.push(analyst(state, role, x.hires++));
    }
    x.staff = kept;
  }
  return x;
}

/** The department's quality around its level: better analysts add up to about half a level, weak ones take it away. */
export function analystEdge(state: GameState): number {
  const s = state.analysts?.staff;
  if (!s?.length) return 0;
  const avg = s.reduce((t, a) => t + a.skill, 0) / s.length;
  return (avg - 65) / 45 + (state.analysts!.feeds.tracking ? 0.3 : 0);
}

export function hasFeed(state: GameState, f: Feed): boolean {
  return !!state.analysts?.feeds[f];
}

export function setFeed(state: GameState, f: Feed, on: boolean): void {
  analysts(state).feeds[f] = on;
}

export function feedsCost(state: GameState): number {
  return Object.entries(state.analysts?.feeds ?? {}).reduce((t, [k, on]) => t + (on ? DATA_FEEDS[k as Feed].cost : 0), 0);
}

export function replaceAnalyst(state: GameState, index: number): Analyst | null {
  const x = analysts(state);
  const old = x.staff[index];
  if (!old) return null;
  const fresh = analyst(state, old.role, x.hires++);
  x.staff[index] = fresh;
  return fresh;
}

// ---- Models ----

/**
 * The contract model: what a player's production is worth on the market,
 * from his last two seasons against a Pro Bowl season at his position,
 * priced against the top of the position's market. The error shrinks with
 * the department.
 */
export function contractModel(state: GameState, id: string): { apy: number; range: [number, number]; basis: string } | null {
  const p = PLAYER_BY_ID[id];
  if (!p) return null;
  const lines = careerLines(state, id, true).filter((s) => s.season >= RULES.season - 1);
  const prod = lines.length ? lines.reduce((t, s) => t + Math.max(0, production(p.position, s as unknown as Record<string, number>)), 0) / lines.length / ELITE[p.position] : 0;
  const year = leagueYear(state.date);
  const top = Math.max(...Object.values(PLAYER_BY_ID).filter((x) => x.position === p.position).map((x) => dealOf(state, x.id)?.apy ?? 0));
  const min = minimumSalary(p.yearsExp, year);
  const apy = Math.max(min, Math.min(top, top * Math.pow(Math.min(1.4, prod), 1.6) * 0.85));
  const level = state.analytics?.level ?? 0;
  const err = 0.35 - level * 0.07 - analystEdge(state) * 0.04;
  return { apy: Math.round(apy / 50_000) * 50_000, range: [Math.round(apy * (1 - err) / 50_000) * 50_000, Math.round(apy * (1 + err) / 50_000) * 50_000], basis: `${lines.length} recent season${lines.length === 1 ? "" : "s"} at ${Math.round(prod * 100)}% of a Pro Bowl level` };
}

/** The availability model: games a player is likely to miss next season, from his age, position and injury history. */
export function availabilityModel(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 0;
  const age = RULES.season - Number((p.birthDate ?? "1995").slice(0, 4));
  const lines = careerLines(state, id).slice(-3);
  const missed = lines.length ? lines.reduce((t, s) => t + Math.max(0, 17 - Number(s.g ?? 0)), 0) / lines.length : 3;
  const base = 2 + Math.max(0, age - 28) * 0.4 + missed * 0.4;
  return Math.round(base * (hasFeed(state, "injury") ? 1 : 1 + gaussian(rngFor(state.seed, `avail:${id}:${RULES.season}`)) * 0.15) * 10) / 10;
}

// ---- Optimizers ----

/**
 * The cap optimizer: contracts where a restructure (base salary above the
 * minimum turned into a bonus spread over the years left) or a release
 * frees the most room this year, against what it costs later.
 */
export function capOptimizer(state: GameState, team = state.userTeam): { id: string; move: "restructure" | "release"; saves: number; later: number }[] {
  const year = leagueYear(state.date);
  const out: { id: string; move: "restructure" | "release"; saves: number; later: number }[] = [];
  for (const id of teamPlayerIds(state, team)) {
    const deal = dealOf(state, id);
    const y = deal?.years.find((x) => x.year === year);
    if (!deal || !y || y.void) continue;
    const left = deal.years.filter((x) => x.year >= year && !x.void).length;
    const convert = Math.max(0, y.base - minimumSalary(PLAYER_BY_ID[id].yearsExp, year));
    if (left >= 2 && convert > 2_000_000) {
      const spread = Math.min(5, left);
      out.push({ id, move: "restructure", saves: Math.round(convert - convert / spread), later: Math.round(convert - convert / spread) });
    }
    const cut = releaseCost(id, state);
    if (cut.savingsThisYear > 3_000_000 && cut.savingsThisYear > cut.deadNextYear) out.push({ id, move: "release", saves: cut.savingsThisYear, later: cut.deadNextYear });
  }
  return out.sort((a, b) => b.saves - a.saves).slice(0, 10);
}

/** Share of a player's cap hit that his production would earn, for the cap-efficiency list. */
export function capEfficiency(state: GameState, team = state.userTeam): { id: string; hit: number; worth: number }[] {
  const year = leagueYear(state.date);
  return teamPlayerIds(state, team).map((id) => {
    const m = contractModel(state, id);
    return { id, hit: capHit(id, year, state), worth: m?.apy ?? 0 };
  }).filter((r) => r.hit > 2_000_000).sort((a, b) => (a.worth - a.hit) - (b.worth - b.hit)).slice(0, 8);
}

/**
 * Trading down from our next pick: for each of the next few slots, what the
 * trade chart says the team there would owe us to move up, in later picks.
 */
export function tradeDownOptions(state: GameState): { from: number; to: number; owe: number; equals: string }[] {
  const year = RULES.season + 1;
  const ours = Object.entries(trades(state).picks).filter(([id, owner]) => owner === state.userTeam && id.startsWith(`${year}-`)).map(([id]) => pickOverall(state, id)).filter((x): x is number => !!x).sort((a, b) => a - b);
  const mine = ours[0];
  if (!mine) return [];
  const out: { from: number; to: number; owe: number; equals: string }[] = [];
  for (const step of [3, 6, 10, 16]) {
    const to = mine + step;
    if (to > 256) break;
    const owe = chartValue(mine) - chartValue(to);
    // The later pick that makes up the difference.
    let eq = to + 1;
    while (eq < 256 && chartValue(eq) > owe) eq++;
    out.push({ from: mine, to, owe: Math.round(owe), equals: `about the No. ${eq} pick` });
  }
  return out;
}

// ---- Experiments ----

/** The true effect of each change for this save (engine only): most help a little, some don't, a few hurt. */
function trueEffect(state: GameState, kind: ExperimentKind): number {
  return Math.round((0.012 + gaussian(rngFor(state.seed, `experiment:${kind}`)) * 0.025) * 1000) / 1000;
}

export function startExperiment(state: GameState, kind: ExperimentKind): string | null {
  const x = analysts(state);
  if ((state.analytics?.level ?? 0) === 0) return "There are no analysts to design and read an experiment.";
  if (x.experiments.some((e) => e.kind === kind && !e.adopted && !e.dropped)) return "That experiment is already running or waiting on your decision.";
  x.experiments.unshift({ kind, started: state.date, ends: addDays(state.date, EXPERIMENTS[kind].weeks * 7) });
  return null;
}

export function decideExperiment(state: GameState, kind: ExperimentKind, adopt: boolean): void {
  const e = analysts(state).experiments.find((x) => x.kind === kind && x.measured !== undefined && !x.adopted && !x.dropped);
  if (!e) return;
  if (adopt) e.adopted = true;
  else e.dropped = true;
}

/** The true effect of an adopted change, read by the systems it touches (0 if not adopted). */
export function adopted(state: GameState, kind: ExperimentKind): number {
  return state.analysts?.experiments.some((e) => e.kind === kind && e.adopted) ? trueEffect(state, kind) : 0;
}

// ---- Daily ----

export function analystsDaily(state: GameState): void {
  if (!state.analysts && !state.analytics) return;
  const x = analysts(state);
  // Data feeds are paid monthly, on the research line.
  if (state.date.endsWith("-01")) {
    const cost = feedsCost(state);
    if (cost && state.business) post(state, "research", -cost / 12, "Analytics data feeds");
  }
  for (const e of x.experiments) {
    if (e.measured !== undefined || state.date < e.ends) continue;
    const level = state.analytics?.level ?? 1;
    const sd = 0.04 / (1 + level + Math.max(0, analystEdge(state))) * (e.kind === "promotion" && hasFeed(state, "fans") ? 0.7 : 1);
    e.measured = Math.round((trueEffect(state, e.kind) + gaussian(rngFor(state.seed, `exp-read:${e.kind}:${e.started}`)) * sd) * 1000) / 1000;
    e.margin = Math.round(sd * 2 * 1000) / 1000;
    const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    send(state, "staff", "Analytics department", `Experiment result: ${EXPERIMENTS[e.kind].label.toLowerCase()}`,
      `${EXPERIMENTS[e.kind].what} The test group came out ${pct(e.measured)} against the control group, give or take ${pct(e.margin).replace("+", "")}. ` +
      `${Math.abs(e.measured) < e.margin ? "That's inside the noise: we can't say it works." : e.measured > 0 ? "We'd adopt it." : "We'd drop it."} Your call on the Analytics page.`);
  }
}
