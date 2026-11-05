// Contract incentives: playing-time, statistical and playoff bonuses written
// into a year of a veteran deal. They are most common on short "prove it"
// deals, deals for players over 30 and deals for players coming off a lost
// season; a market-setting star seldom has any. The usual package is two to
// four escalating thresholds worth 10 to 40 percent of the salary.
//
// The cap rule follows the CBA. An incentive is "likely to be earned" when
// the player reached the threshold last season (a team incentive, when the
// team did), and a likely incentive counts on this year's cap from the day it
// is signed; an unlikely one doesn't. After the season the books are squared
// on next year's cap: a likely incentive he missed comes back as a credit, an
// unlikely one he reached is charged. Earned incentives are paid in cash
// after the Super Bowl to whichever team holds the contract then.
import { dealOf, leagueYear, salaryCap } from "./contracts";
import { addDays } from "./dates";
import { money, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { MEDIA_BY_ID, addStory } from "./outlets";
import { payCash } from "./finance";
import { rngFor, type Rng } from "./rng";
import { teamSnapTotals } from "./seasons";
import { seasonTotals } from "./stats";
import type { Deal, DealYear, GameState, Incentive, IncentiveKind, Position } from "./types";

// The 14 playoff teams of the 2025 season (the last 14 picks of the real 2026 draft order).
const PLAYOFFS_2025 = new Set(["CAR", "GB", "PIT", "LAC", "PHI", "JAX", "CHI", "SF", "HOU", "BUF", "LA", "DEN", "NE", "SEA"]);

// Thresholds as contracts write them: round numbers that step up.
const LADDER: Record<Exclude<IncentiveKind, "playoffs">, number[]> = {
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
  playoffs: "team makes the playoffs",
};

export function describeIncentive(i: Incentive): string {
  if (i.kind === "snaps") return `${Math.round(i.threshold * 100)}% ${INCENTIVE_LABEL.snaps}`;
  if (i.kind === "playoffs") return `Playoffs, playing ${Math.round(i.threshold * 100)}% of snaps`;
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

export function madePlayoffs(state: GameState, team: string, season: number): boolean {
  if (season === RULES.season) return Object.values(state.seeds ?? {}).some((teams) => teams.includes(team));
  if (season === 2025) return PLAYOFFS_2025.has(team);
  return state.history?.seasons.find((s) => s.season === season)?.playoffs[team] !== undefined;
}

/** The last finished season on a date. */
function lastSeasonFor(state: GameState): number {
  return state.date > RULES.keyDates.regularSeasonEnd ? RULES.season : RULES.season - 1;
}

// ---- Writing incentives into a deal ----

/** How often a deal of this kind carries incentives, and how big the package runs against the salary. */
function profile(state: GameState, id: string, deal: Deal, year: number): { odds: number; share: [number, number] } {
  const p = PLAYER_BY_ID[id];
  const age = year - Number((p.birthDate ?? `${year - 26}`).slice(0, 4));
  const real = deal.years.filter((y) => !y.void && y.year >= year).length;
  const capShare = deal.apy / salaryCap(state, year);
  const last = seasonOf(state, id, lastSeasonFor(state));
  const lostSeason = !last || (last.line.g ?? 0) < 8 || last.share < 0.3;
  let odds = 0.2;
  if (real <= 2) odds += 0.2;
  if (age >= 30) odds += 0.15;
  if (lostSeason && p.yearsExp >= 2) odds += 0.2;
  if (capShare > 0.08) odds -= 0.12;
  if (capShare < 0.006) odds -= 0.06; // minimum-salary deals seldom bother
  if (deal.kind === "extension") odds -= 0.08;
  const proveIt = real <= 2 && (lostSeason || age >= 30);
  return { odds: Math.max(0.02, Math.min(0.6, odds)), share: proveIt ? [0.15, 0.45] : [0.05, 0.2] };
}

/** The first rungs on a ladder near what he did last season: some at or below it (likely), most above it. */
function rungs(ladder: number[], last: number, rng: Rng, n: number): number[] {
  let i = ladder.findIndex((t) => t >= last * (0.85 + 0.15 * rng()));
  if (i < 0) i = ladder.length - 1;
  i = Math.max(0, Math.min(i, ladder.length - n));
  return ladder.slice(i, i + n);
}

/** Two to four incentives worth up to `total`, built for this player's position and last season. */
function packageFor(state: GameState, id: string, team: string, total: number, rng: Rng): Incentive[] {
  const pos = PLAYER_BY_ID[id].position;
  const last = seasonOf(state, id, lastSeasonFor(state)) ?? { line: {}, share: 0, team: null };
  const lastSeason = lastSeasonFor(state);
  const items: Omit<Incentive, "amount">[] = [];
  const stats = STATS[pos] ?? [];
  // Playing time is the most common incentive in the league, and the only one most linemen get.
  if (!SPECIALISTS.has(pos) && (stats.length === 0 || rng() < 0.65)) {
    for (const t of rungs(LADDER.snaps, last.share, rng, stats.length ? 2 : 3)) items.push({ kind: "snaps", threshold: t, likely: last.share >= t });
  }
  if (stats.length) {
    const kind = stats[Math.floor(rng() * stats.length)];
    const ladder = LADDER[kind as keyof typeof LADDER];
    const have = value(kind, last);
    for (const t of rungs(ladder, have, rng, items.length ? 2 : 3)) items.push({ kind, threshold: t, likely: have >= t });
  }
  if (rng() < (SPECIALISTS.has(pos) ? 0.8 : 0.35)) {
    const t = SPECIALISTS.has(pos) ? 0 : 0.5;
    items.push({ kind: "playoffs", threshold: t, likely: madePlayoffs(state, team, lastSeason) && last.share >= t });
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
  if (state.date >= RULES.keyDates.regularSeasonStart && leagueYear(state.date) === fromYear) fromYear++;
  const years = deal.years.filter((y) => !y.void && y.year >= fromYear && !y.incentives);
  if (!years.length || ask === 0) return;
  const rng = rngFor(state.seed, `incentives:${id}:${state.date}`);
  let perYear: number;
  if (ask !== undefined) perYear = ask;
  else {
    const { odds, share } = profile(state, id, deal, fromYear);
    if (rng() >= odds) return;
    perYear = deal.apy * (share[0] + (share[1] - share[0]) * rng());
  }
  perYear = Math.min(perYear, 0.04 * salaryCap(state, fromYear));
  if (perYear < 100_000) return;
  // Long deals carry them only in the first couple of years, when the player still has something to prove.
  for (const y of years.slice(0, ask !== undefined ? years.length : 2)) {
    const pkg = packageFor(state, id, deal.team, perYear, rng);
    if (pkg.length) y.incentives = pkg;
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
      i.earned = i.kind === "playoffs" ? madePlayoffs(state, deal.team, season) && s.share >= i.threshold : value(i.kind, s) >= i.threshold;
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
  if (ours.length) {
    send(state, "transaction", "Cap office", "Incentives settled for the season",
      `${ours.join(". ")}. ${ourNet > 0 ? `Likely incentives that weren't reached come back as a ${money(ourNet)} credit on the ${next} cap.` : ourNet < 0 ? `Unlikely incentives that were reached add ${money(-ourNet)} to the ${next} cap.` : `Nothing carries over to the ${next} cap.`}`);
  }
  big.sort((a, b) => b.earned - a.earned);
  if (big.length) {
    const lines = big.slice(0, 4).map((b) => `${PLAYER_BY_ID[b.id].name} (${TEAM_BY_ID[b.team].name}) earned ${money(b.earned)}`);
    addStory(state, {
      outlet: "capspace", by: MEDIA_BY_ID.capspace.insider, kind: "trend", teams: big.slice(0, 4).map((b) => b.team), players: big.slice(0, 4).map((b) => b.id),
      headline: "The incentive payouts are in",
      body: `With the season over, the incentive bills come due. ${lines.join("; ")}. Bonuses the cap didn't expect land on next year's books.`,
    });
  }
}
