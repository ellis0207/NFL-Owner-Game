// Contract incentives: playing-time, statistical, playoff and honors bonuses
// written into a year of a veteran deal. About a third of real-money veteran
// deals carry some. They are most common on short "prove it" deals, deals for
// players over 30 and deals for players coming off a lost season, where the
// usual package is two to four escalating thresholds worth 15 to 45 percent
// of the salary. Mid-priced starters get a smaller playing-time or stat
// package. Highly paid players seldom get performance money; what they get is
// a Pro Bowl or All-Pro incentive, a few percent of the salary, repeated in
// every year of the deal.
//
// The cap rule follows the CBA. An incentive is "likely to be earned" (LTBE)
// when the player reached the threshold last season: a team incentive when
// his new team did it and he played the snaps, an honors incentive when he
// was voted in on the original ballot. A likely incentive counts on the cap
// in its year; an unlikely one (NLTBE) doesn't. Each later year of a deal is
// judged again on the season just finished, so a big year turns next year's
// incentives likely. After the season the books are squared on next year's
// cap: a likely incentive he missed comes back as a credit, an unlikely one
// he reached is charged. Earned incentives are paid in cash after the Super
// Bowl to whichever team holds the contract then.
import { dealOf, leagueYear, salaryCap } from "./contracts";
import { honors } from "./honors";
import { addDays } from "./dates";
import { money, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { addStory } from "./outlets";
import { byline } from "./media/corps";
import { payCash } from "./finance";
import { rngFor, type Rng } from "./rng";
import { teamSnapTotals } from "./seasons";
import { seasonTotals } from "./stats";
import type { Deal, DealYear, GameState, Incentive, IncentiveKind, Position } from "./types";
import { PACK } from "./pack";

// The 14 playoff teams of the 2025 season (the last 14 picks of the real 2026 draft order).
const PLAYOFFS_2025 = new Set(["CAR", "GB", "PIT", "LAC", "PHI", "JAX", "CHI", "SF", "HOU", "BUF", "LA", "DEN", "NE", "SEA"]);

// Thresholds as contracts write them: round numbers that step up.
type StatKind = Exclude<IncentiveKind, "playoffs" | "proBowl" | "allPro">;
const LADDER: Record<StatKind, number[]> = {
  snaps: [0.35, 0.5, 0.6, 0.7, 0.8, 0.9],
  passYds: [3000, 3500, 4000, 4500, 5000],
  passTd: [20, 25, 30, 35],
  rushYds: [600, 800, 1000, 1200, 1400],
  rushTd: [6, 8, 10, 12],
  rec: [40, 50, 60, 70, 80, 90, 100],
  recYds: [500, 600, 800, 1000, 1200, 1400],
  recTd: [4, 6, 8, 10, 12],
  sacks: [4, 6, 8, 10, 12, 14],
  tackles: [80, 100, 120, 140],
  defInt: [2, 3, 4, 5, 6],
};

// The statistical incentives each position's deals use; everyone can have playing time and playoffs.
const STATS: Partial<Record<Position, IncentiveKind[]>> = {
  QB: ["passYds", "passTd"], RB: ["rushYds", "rushTd", "rec"], WR: ["rec", "recYds", "recTd"], TE: ["rec", "recYds", "recTd"],
  EDGE: ["sacks"], IDL: ["sacks"], LB: ["tackles", "sacks"], CB: ["defInt"], S: ["defInt", "tackles"],
};

const DEFENSE = new Set<Position>(["EDGE", "IDL", "LB", "CB", "S"]);
const SPECIALISTS = new Set<Position>(["K", "P", "LS"]);

export const INCENTIVE_LABEL: Record<IncentiveKind, string> = {
  snaps: "of snaps played", passYds: "passing yards", passTd: "touchdown passes", rushYds: "rushing yards", rushTd: "rushing touchdowns",
  rec: "receptions", recYds: "receiving yards", recTd: "receiving touchdowns", sacks: "sacks", tackles: "tackles", defInt: "interceptions",
  playoffs: "team makes the playoffs", proBowl: "Pro Bowl", allPro: "All-Pro",
};

export function describeIncentive(i: Incentive): string {
  if (i.kind === "snaps") return `${Math.round(i.threshold * 100)}% ${INCENTIVE_LABEL.snaps}`;
  if (i.kind === "playoffs") return `Playoffs, playing ${Math.round(i.threshold * 100)}% of snaps`;
  if (i.kind === "proBowl") return "Pro Bowl (original ballot)";
  if (i.kind === "allPro") return i.threshold >= 1 ? "First-team All-Pro" : "All-Pro, first or second team";
  return `${i.threshold.toLocaleString("en-US")} ${INCENTIVE_LABEL[i.kind]}`;
}

/** Likely incentives count on the cap in their year. */
export function likelyIncentives(y: DealYear | undefined): number {
  return y?.incentives?.reduce((s, i) => s + (i.likely ? i.amount : 0), 0) ?? 0;
}

/** The most a year's incentives can pay. */
export function incentiveMax(y: DealYear | undefined): number {
  return y?.incentives?.reduce((s, i) => s + i.amount, 0) ?? 0;
}

export function dealIncentiveMax(deal: Deal | null): number {
  return deal?.years.reduce((s, y) => s + incentiveMax(y), 0) ?? 0;
}

// ---- What a player did ----

export interface Season {
  line: Record<string, number>;
  share: number;
  team: string | null;
}

function shareOf(pos: Position, off: number, def: number): number {
  return DEFENSE.has(pos) ? def : off;
}

/** A season's stats and snap share. The season just played once its regular season is over, otherwise the one before. */
export function seasonOf(state: GameState, id: string, season: number): Season | null {
  const pos = PLAYER_BY_ID[id].position;
  if (season === RULES.season) {
    const row = seasonTotals(state, "REG")[id];
    if (!row) return null;
    const ts = teamSnapTotals(state)[row.team] ?? [1, 1, 1];
    const l = row.line as Record<string, number>;
    return { line: l, share: shareOf(pos, (l.offSnaps ?? 0) / Math.max(1, ts[0]), (l.defSnaps ?? 0) / Math.max(1, ts[1])), team: row.team };
  }
  const p = PLAYER_BY_ID[id];
  const stats = p.stats.find((s) => s.season === season);
  const snaps = p.snaps[String(season)];
  if (!stats && !snaps) return null;
  const line: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats ?? {})) if (typeof v === "number") line[k] = v;
  return { line, share: snaps ? shareOf(pos, snaps.offShare, snaps.defShare) : 0, team: (stats?.team as string) ?? null };
}

function value(kind: IncentiveKind, s: Season): number {
  if (kind === "snaps") return s.share;
  if (kind === "tackles") return (s.line.tklSolo ?? 0) + (s.line.tklAst ?? 0);
  return s.line[kind] ?? 0;
}

/**
 * Whether an incentive's threshold was reached in a season, as the CBA reads
 * it: the player's own numbers, his team's playoff spot with the snaps to go
 * with it, or the original Pro Bowl ballot and the All-Pro teams.
 */
function reached(state: GameState, id: string, team: string, i: Pick<Incentive, "kind" | "threshold">, season: number, s: Season): boolean {
  if (i.kind === "playoffs") return madePlayoffs(state, team, season) && s.share >= i.threshold;
  if (i.kind === "proBowl") return (honors(state).proBowl[season] ?? []).includes(id);
  if (i.kind === "allPro") {
    const a = honors(state).allPro[season];
    return !!a && (a.first.includes(id) || (i.threshold < 1 && a.second.includes(id)));
  }
  return value(i.kind, s) >= i.threshold;
}

export function madePlayoffs(state: GameState, team: string, season: number): boolean {
  if (season === RULES.season) return Object.values(state.seeds ?? {}).some((teams) => teams.includes(team));
  if (season === BASE_SEASON - 1) return (PACK?.rules.lastPlayoffs ?? [...PLAYOFFS_2025]).includes(team);
  return state.history?.seasons.find((s) => s.season === season)?.playoffs[team] !== undefined;
}

/** The last finished season on a date. */
function lastSeasonFor(state: GameState): number {
  return state.date > RULES.keyDates.regularSeasonEnd ? RULES.season : RULES.season - 1;
}

// ---- Writing incentives into a deal ----

/**
 * The kind of package a deal gets. A "prove it" deal (short, for an older
 * player or one coming off a lost season) carries a big performance package;
 * an ordinary deal a smaller one; a star's deal only honors money.
 */
type Style = "proveIt" | "standard" | "star";

/** How often a deal of this kind carries incentives, how big the package runs against the salary, and its style. */
function profile(state: GameState, id: string, deal: Deal, year: number): { odds: number; share: [number, number]; style: Style } {
  const p = PLAYER_BY_ID[id];
  const age = year - Number((p.birthDate ?? `${year - 26}`).slice(0, 4));
  const real = deal.years.filter((y) => !y.void && y.year >= year).length;
  const capShare = deal.apy / salaryCap(state, year);
  const last = seasonOf(state, id, lastSeasonFor(state));
  const lostSeason = !last || (last.line.g ?? 0) < 8 || last.share < 0.3;
  const ext = deal.kind === "extension";
  // A market-level deal: performance money would only be a discount he didn't need to give,
  // but a Pro Bowl or All-Pro incentive is a common sweetener on top.
  if (capShare >= 0.045) return { odds: Math.max(0.05, 0.3 + (age >= 30 ? 0.08 : 0) - (ext ? 0.1 : 0)), share: [0.015, 0.05], style: "star" };
  let odds = 0.15;
  if (real <= 2) odds += 0.15;
  if (age >= 30) odds += 0.1;
  if (lostSeason && p.yearsExp >= 2) odds += 0.18;
  if (capShare < 0.008) odds -= 0.1; // deals near the minimum seldom bother
  if (ext) odds -= 0.1;
  const proveIt = real <= 2 && (lostSeason || age >= 30);
  return { odds: Math.max(0.02, Math.min(0.65, odds)), share: proveIt ? [0.15, 0.45] : [0.06, 0.2], style: proveIt ? "proveIt" : "standard" };
}

/** The first rungs on a ladder near what he did last season: some at or below it (likely), most above it. */
function rungs(ladder: number[], last: number, rng: Rng, n: number): number[] {
  let i = ladder.findIndex((t) => t >= last * (0.85 + 0.15 * rng()));
  if (i < 0) i = ladder.length - 1;
  i = Math.max(0, Math.min(i, ladder.length - n));
  return ladder.slice(i, i + n);
}

/** Incentives worth up to `total`, built for this player's position, last season and the style of deal. */
function packageFor(state: GameState, id: string, team: string, total: number, rng: Rng, style: Style): Incentive[] {
  const pos = PLAYER_BY_ID[id].position;
  const lastSeason = lastSeasonFor(state);
  const last = seasonOf(state, id, lastSeason) ?? { line: {}, share: 0, team: null };
  const items: Omit<Incentive, "amount">[] = [];
  const add = (kind: IncentiveKind, threshold: number) => items.push({ kind, threshold, likely: reached(state, id, team, { kind, threshold }, lastSeason, last) });
  if (style === "star") {
    // Honors: the Pro Bowl, an All-Pro step above it, now and then a playoff bonus for a quarterback.
    if (rng() < 0.8) add("proBowl", 0);
    if (!items.length || rng() < 0.55) add("allPro", rng() < 0.5 ? 1 : 0);
    if (pos === "QB" && rng() < 0.3) add("playoffs", 0.5);
  } else {
    const stats = STATS[pos] ?? [];
    // Playing time is the most common incentive in the league, and the only one most linemen get.
    if (!SPECIALISTS.has(pos) && (stats.length === 0 || rng() < 0.65)) {
      for (const t of rungs(LADDER.snaps, last.share, rng, stats.length ? 2 : 3)) add("snaps", t);
    }
    if (stats.length) {
      const kind = stats[Math.floor(rng() * stats.length)] as StatKind;
      for (const t of rungs(LADDER[kind], value(kind, last), rng, items.length ? 2 : 3)) add(kind, t);
    }
    if (rng() < (SPECIALISTS.has(pos) ? 0.8 : 0.35)) add("playoffs", SPECIALISTS.has(pos) ? 0 : 0.5);
    // A starter's deal often tops the ladder with a Pro Bowl bonus; kickers' deals nearly always do.
    if (rng() < (SPECIALISTS.has(pos) ? 0.6 : style === "standard" ? 0.25 : 0.12)) add("proBowl", 0);
  }
  if (!items.length) return [];
  // Higher rungs pay more: weights 1, 1.4, 1.8...
  const weights = items.map((_, i) => 1 + 0.4 * i);
  const wsum = weights.reduce((a, b) => a + b, 0);
  return items.map((it, i) => ({ ...it, amount: Math.max(25_000, Math.round((total * weights[i]) / wsum / 25_000) * 25_000) }));
}

/**
 * Writes incentives into a new deal's real years from `fromYear`, before the
 * season starts. `ask` is the most per year the owner offered (0 for none);
 * left out, the signing team's front office decides, as CPU teams do.
 */
export function attachIncentives(state: GameState, id: string, deal: Deal, fromYear: number, ask?: number): void {
  const p = PLAYER_BY_ID[id];
  if (!p || deal.kind === "rookie" || deal.kind === "minimum" || deal.kind === "practice") return;
  // A deal signed once this season's games have begun carries incentives only from next year on. (In the spring
  // the applied season is still last year's, so its key dates say nothing about the league year being signed.)
  if (RULES.season === fromYear && leagueYear(state.date) === fromYear && state.date >= RULES.keyDates.regularSeasonStart) fromYear++;
  const years = deal.years.filter((y) => !y.void && y.year >= fromYear && !y.incentives);
  if (!years.length || ask === 0) return;
  const rng = rngFor(state.seed, `incentives:${id}:${state.date}`);
  let perYear: number;
  let style: Style = "standard";
  let span = years.length;
  if (ask !== undefined) perYear = ask;
  else {
    const prof = profile(state, id, deal, fromYear);
    if (rng() >= prof.odds) return;
    style = prof.style;
    perYear = deal.apy * (prof.share[0] + (prof.share[1] - prof.share[0]) * rng());
    // Performance money sits in the first couple of years, while the player still has something to prove;
    // honors incentives run the length of the deal.
    if (style !== "star") span = 2;
  }
  perYear = Math.min(perYear, 0.04 * salaryCap(state, fromYear));
  if (perYear < 100_000) return;
  for (const y of years.slice(0, span)) {
    const pkg = packageFor(state, id, deal.team, perYear, rng, style);
    if (pkg.length) y.incentives = pkg;
  }
}

/**
 * Each league year's incentives are judged on the season just finished: once
 * it's over, next year's are marked likely or not again, so their cap count
 * follows what the player did, as the league's cap office does it.
 */
function reclassify(state: GameState, season: number): void {
  for (const id of Object.keys(state.players)) {
    const deal = dealOf(state, id);
    const y = deal?.years.find((x) => x.year === season + 1 && !x.void);
    if (!deal || !y?.incentives || y.incentives.some((i) => i.earned !== undefined)) continue;
    const s = seasonOf(state, id, season) ?? { line: {}, share: 0, team: null };
    for (const i of y.incentives) i.likely = reached(state, id, deal.team, i, season, s);
  }
}

/** How an agent prices incentives against salary: well below a guaranteed dollar, less still for hardball agents. */
export function incentiveWorth(guaranteeFocus: number, creativity: number): number {
  return 0.22 + 0.15 * creativity - 0.1 * guaranteeFocus;
}

// ---- Squaring the books after the season ----

function settleDate(): string {
  return addDays(RULES.keyDates.superBowl, 2);
}

/** Next year's cap adjustment from this year's incentives: credits less charges. */
export function incentiveAdjustment(state: GameState | undefined, team: string, year: number): number {
  return state?.league?.incentiveAdj?.[team]?.[year] ?? 0;
}

export function incentivesDaily(state: GameState): void {
  if (state.date !== settleDate()) return;
  const season = RULES.season;
  const next = season + 1;
  const adj = ((state.league ??= { caps: {} }).incentiveAdj ??= {});
  const ours: string[] = [];
  const big: { id: string; team: string; earned: number }[] = [];
  let ourNet = 0;
  for (const id of Object.keys(state.players)) {
    const deal = dealOf(state, id);
    const y = deal?.years.find((x) => x.year === season && !x.void);
    if (!deal || !y?.incentives || y.incentives.every((i) => i.earned !== undefined)) continue;
    const s = seasonOf(state, id, season) ?? { line: {}, share: 0, team: null };
    let earned = 0;
    let net = 0;
    for (const i of y.incentives) {
      i.earned = reached(state, id, deal.team, i, season, s);
      if (i.earned) earned += i.amount;
      if (i.earned && !i.likely) net -= i.amount;
      if (!i.earned && i.likely) net += i.amount;
    }
    payCash(state, deal.team, earned, season);
    if (net) (adj[deal.team] ??= {})[next] = (adj[deal.team][next] ?? 0) + net;
    if (deal.team === state.userTeam) {
      ourNet += net;
      ours.push(`${PLAYER_BY_ID[id].name}: ${earned ? `earned ${money(earned)} of ${money(incentiveMax(y))}` : `none of ${money(incentiveMax(y))}`}`);
    }
    if (earned >= 1_500_000) big.push({ id, team: deal.team, earned });
  }
  reclassify(state, season);
  if (ours.length) {
    send(state, "transaction", "Cap office", "Incentives settled for the season",
      `${ours.join(". ")}. ${ourNet > 0 ? `Likely incentives that weren't reached come back as a ${money(ourNet)} credit on the ${next} cap.` : ourNet < 0 ? `Unlikely incentives that were reached add ${money(-ourNet)} to the ${next} cap.` : `Nothing carries over to the ${next} cap.`}`);
  }
  big.sort((a, b) => b.earned - a.earned);
  if (big.length) {
    const lines = big.slice(0, 4).map((b) => `${PLAYER_BY_ID[b.id].name} (${TEAM_BY_ID[b.team].name}) earned ${money(b.earned)}`);
    addStory(state, {
      outlet: "capspace", by: byline(state, "capspace", "insider"), kind: "trend", teams: big.slice(0, 4).map((b) => b.team), players: big.slice(0, 4).map((b) => b.id),
      headline: "The incentive payouts are in",
      body: `With the season over, the incentive bills come due. ${lines.join("; ")}. Bonuses the cap didn't expect land on next year's books.`,
    });
  }
}
