// Per-game roster bonuses, workout bonuses, the rookie escalator and the
// league's minimum cash spending rule.
//
// Many veteran deals pay part of the salary as a per-game roster bonus: a
// set amount for each game the player is on the game-day roster. The cap
// counts it as likely for the games he dressed for the year before, and the
// difference is settled after the season like an incentive. A workout bonus
// pays for taking part in the spring program; skipping it forfeits the money,
// and the cap gets it back the next year.
//
// The proven performance escalator: a player drafted in rounds 3 to 7 who
// played at least 35% of his team's snaps in two of his first three seasons
// sees his fourth-year salary rise to the restricted free agent original-round
// tender.
//
// The CBA's cash floor: over each four-year period every club must pay its
// players at least 89% of the salary caps in cash. A club below it pays the
// shortfall to its players after the period's last season. In the game the
// periods start with 2027, the first league year a save sees from March on
// (the 2026 bonuses were paid before the game begins).
import { dealOf, leagueYear, minimumSalary, salaryCap } from "./contracts";
import { addDays } from "./dates";
import { cashPaid, payCash } from "./finance";
import { money, news, send } from "./inbox";
import { seasonOf } from "./incentives";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { capScale, rfaTender } from "./market";
import { rngFor } from "./rng";
import type { Deal, DealYear, GameState } from "./types";

const REG_GAMES = 17;
/** The share of the salary caps each club must pay in cash over a period. */
export const CASH_FLOOR = 0.89;
export const PERIOD_YEARS = 4;

/** What the owner wrote into an offer: per-game share of salary, workout bonus and escalator per year. */
export interface BonusAsk { perGame?: number; workout?: number; escalator?: number }

/** The snap share an escalator asks for. */
export const ESCALATOR_SHARE = 0.65;
/** Most of a year's salary the owner can pay per game. */
export const MAX_PER_GAME_SHARE = 0.25;

/** True when the offer spells out any of the bonus terms (otherwise the front office writes them). */
export function asksBonuses(t: BonusAsk | undefined): boolean {
  return !!t && (t.perGame !== undefined || t.workout !== undefined || t.escalator !== undefined);
}

/**
 * Writes per-game and workout bonuses, and escalators, into a new veteran
 * deal's unguaranteed years. With an ask, the owner's terms; without one,
 * the front office's usual habits for a player like him.
 */
export function attachBonuses(state: GameState, id: string, deal: Deal, fromYear: number, ask?: BonusAsk): void {
  if (deal.kind !== "veteran" && deal.kind !== "extension") return;
  const p = PLAYER_BY_ID[id];
  if (!p) return;
  const rng = rngFor(state.seed, `bonuses:${id}:${state.date}`);
  const age = fromYear - Number((p.birthDate ?? `${fromYear - 27}`).slice(0, 4));
  const owner = asksBonuses(ask);
  let share = 0, wk = 0, esc = 0;
  if (owner) {
    share = Math.max(0, Math.min(MAX_PER_GAME_SHARE, ask!.perGame ?? 0));
    wk = Math.max(0, ask!.workout ?? 0);
    esc = Math.max(0, ask!.escalator ?? 0);
  } else {
    const perGame = rng() < (age >= 28 ? 0.5 : 0.3);
    const workout = rng() < 0.3;
    // Front offices give younger players a raise they can play their way into.
    const escalate = age <= 27 && rng() < 0.15;
    share = perGame ? 0.06 + 0.06 * rng() : 0;
    wk = workout ? Math.round((100_000 + 400_000 * rng()) * capScale(state, fromYear) / 5000) * 5000 : 0;
    esc = escalate ? Math.round(deal.apy * (0.03 + 0.05 * rng()) / 50_000) * 50_000 : 0;
  }
  if (!share && !wk && !esc) return;
  const lastGames = Math.min(REG_GAMES, Number(seasonOf(state, id, fromYear - 1)?.line.g ?? 0));
  const real = deal.years.filter((y) => !y.void);
  const last = real[real.length - 1]?.year;
  for (const y of real) {
    if (y.year < fromYear) continue;
    // An escalator raises the next year, so it can't sit on the last one.
    if (esc && y.year < last) y.escalator = { amount: esc, share: ESCALATOR_SHARE };
    if (y.guaranteed > 0 || y.injuryGuaranteed > 0) continue;
    const floor = minimumSalary(p.yearsExp + Math.max(0, y.year - BASE_SEASON), y.year);
    if (share) {
      const per = Math.round((y.base * share) / REG_GAMES / 1000) * 1000;
      if (per >= 5000 && y.base - per * REG_GAMES >= floor) {
        y.base -= per * REG_GAMES;
        y.perGame = per;
        y.perGameLikely = y.year === fromYear ? lastGames : REG_GAMES;
      }
    }
    if (wk && y.base - wk >= floor) {
      y.base -= wk;
      y.workout = wk;
    }
  }
}

/** The share of games an agent expects his client to miss: the last two seasons, and his age. */
export function missRisk(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  const season = RULES.season;
  // Seasons he was a regular in (a backup's few games say nothing about his health).
  const games = [season, season - 1].map((y) => Number(seasonOf(state, id, y)?.line.g ?? 0)).filter((g) => g >= 4);
  const played = games.length ? games.reduce((a, b) => a + b, 0) / games.length : 14;
  const age = season - Number((p?.birthDate ?? `${season - 27}`).slice(0, 4));
  return Math.max(0.04, Math.min(0.5, 1 - played / REG_GAMES + Math.max(0, age - 30) * 0.02));
}

/**
 * What the bonus terms are worth to the player per year, against the same
 * money in salary: per-game money is lost for every game he misses, workout
 * money costs him his spring, and an escalator is a raise he may not reach.
 */
export function bonusTermsValue(t: { years: number; total: number } & BonusAsk, risk: number): number {
  const apy = t.total / Math.max(1, t.years);
  const perGame = -(t.perGame ?? 0) * apy * (risk + 0.03);
  const workout = -(t.workout ?? 0) * 0.08;
  const esc = (t.escalator ?? 0) * 0.35 * Math.max(0, t.years - 1) / Math.max(1, t.years);
  return perGame + workout + esc;
}

function adjust(state: GameState, team: string, year: number, amount: number): void {
  if (!amount) return;
  const adj = ((state.league ??= { caps: {} }).incentiveAdj ??= {});
  (adj[team] ??= {})[year] = (adj[team][year] ?? 0) + amount;
}

/** After the season: per-game bonuses earned, next year's likely games, and rookie escalators. */
function settleSeason(state: GameState): void {
  const season = RULES.season;
  const ourLines: string[] = [];
  for (const id of Object.keys(state.players)) {
    const deal = dealOf(state, id);
    if (!deal) continue;
    const y = deal.years.find((x) => x.year === season && !x.void);
    if (y?.perGame && y.perGameSettled === undefined) {
      const games = Math.min(REG_GAMES, Number(seasonOf(state, id, season)?.line.g ?? 0));
      payCash(state, deal.team, y.perGame * games, season);
      adjust(state, deal.team, season + 1, ((y.perGameLikely ?? REG_GAMES) - games) * y.perGame);
      y.perGameSettled = games;
      const next = deal.years.find((x) => x.year === season + 1 && !x.void);
      if (next?.perGame) next.perGameLikely = games;
      if (deal.team === state.userTeam) ourLines.push(`${PLAYER_BY_ID[id].name}: ${games} of ${REG_GAMES} games, ${money(y.perGame * games)}`);
    }
    if (y?.escalator && y.escalator.met === undefined) settleEscalator(state, id, deal, y);
    if (deal.kind === "rookie") escalator(state, id, deal);
  }
  if (ourLines.length) {
    send(state, "transaction", "Cap office", "Per-game roster bonuses for the season",
      `${ourLines.join(". ")}. Games missed come back as cap credit next year; games played beyond what the cap counted are charged next year.`);
  }
  cashFloor(state);
}

/** A veteran escalator: met if he played the share of snaps, and next year's salary rises. */
function settleEscalator(state: GameState, id: string, deal: Deal, y: DealYear): void {
  const esc = y.escalator!;
  const share = seasonOf(state, id, y.year)?.share ?? 0;
  esc.met = share >= esc.share;
  const next = deal.years.find((x) => x.year === y.year + 1 && !x.void);
  if (!esc.met || !next) return;
  next.base += esc.amount;
  if (deal.team === state.userTeam) {
    send(state, "transaction", "Cap office", `${PLAYER_BY_ID[id].name}'s escalator is met`,
      `${PLAYER_BY_ID[id].name} played ${Math.round(share * 100)}% of the snaps, so his ${next.year} salary rises by ${money(esc.amount)}.`);
  }
}

/** Counts the seasons a mid-round rookie played enough, and raises his fourth year when he qualifies. */
function escalator(state: GameState, id: string, deal: Deal): void {
  const round = PLAYER_BY_ID[id]?.draft.round ?? 0;
  const real = deal.years.filter((y) => !y.void);
  if (round < 3 || real.length < 4 || deal.ppe?.done) return;
  const first3 = real.slice(0, 3).map((y) => y.year);
  if (!first3.includes(RULES.season)) return;
  const ppe = (deal.ppe ??= { seasons: 0 });
  // Seasons before the save began come from the real snap counts.
  if (ppe.counted === undefined) {
    for (const yr of first3) if (yr < RULES.season && (seasonOf(state, id, yr)?.share ?? 0) >= 0.35) ppe.seasons++;
  }
  if (ppe.counted !== RULES.season) {
    ppe.counted = RULES.season;
    if ((seasonOf(state, id, RULES.season)?.share ?? 0) >= 0.35) ppe.seasons++;
  }
  if (RULES.season !== first3[2]) return;
  ppe.done = true;
  if (ppe.seasons < 2) return;
  const fourth = real[3];
  const tender = rfaTender(state, "original", fourth.year);
  if (tender <= fourth.base) return;
  const raise = tender - fourth.base;
  fourth.base = tender;
  if (deal.team === state.userTeam) {
    send(state, "transaction", "Cap office", `${PLAYER_BY_ID[id].name}'s salary escalates`,
      `${PLAYER_BY_ID[id].name} played at least 35% of our snaps in two of his first three seasons, so the CBA's proven performance escalator lifts his ${fourth.year} salary to ${money(tender)} (up ${money(raise)}).`);
  }
}

/** Workout bonuses after the mandatory minicamp: paid if he took part, credited back next year if not. */
function settleWorkouts(state: GameState): void {
  const year = leagueYear(state.date);
  const missed: string[] = [];
  for (const id of Object.keys(state.players)) {
    const deal = dealOf(state, id);
    const y = deal?.years.find((x) => x.year === year && !x.void);
    if (!deal || !y?.workout || y.workoutEarned !== undefined) continue;
    const ps = state.players[id];
    const earned = ps.team === deal.team && state.program?.spring[id]?.plan !== "away" && !ps.holdout;
    y.workoutEarned = earned;
    if (earned) payCash(state, deal.team, y.workout, year);
    else {
      adjust(state, deal.team, year + 1, y.workout);
      if (deal.team === state.userTeam) missed.push(PLAYER_BY_ID[id].name);
    }
  }
  if (missed.length) {
    send(state, "transaction", "Cap office", "Workout bonuses forfeited",
      `${missed.join(", ")} skipped the offseason program and gave up ${missed.length === 1 ? "his workout bonus" : "their workout bonuses"}. The money comes back as cap credit next year.`);
  }
}

// ---- The cash floor ----

/** The four-year period a league year falls in. */
export function periodOf(year: number): [number, number] {
  const first = BASE_SEASON + 1;
  const start = first + Math.floor(Math.max(0, year - first) / PERIOD_YEARS) * PERIOD_YEARS;
  return [start, start + PERIOD_YEARS - 1];
}

/** A club's cash spending so far in the current period, against the caps. */
export function cashSpending(state: GameState, team: string, year = leagueYear(state.date)): { from: number; to: number; paid: number; caps: number; floor: number; share: number } {
  const [from, to] = periodOf(year);
  let paid = 0, caps = 0;
  for (let y = from; y <= Math.min(year, to); y++) {
    paid += cashPaid(state, team, y);
    caps += salaryCap(state, y);
  }
  return { from, to, paid, caps, floor: caps * CASH_FLOOR, share: caps ? paid / caps : 1 };
}

/** After the last season of a period, clubs under the floor pay the difference to their players. */
function cashFloor(state: GameState): void {
  const season = RULES.season;
  const [, to] = periodOf(season);
  if (season !== to) return;
  for (const { id: team } of TEAMS) {
    const s = cashSpending(state, team, season);
    const short = Math.round(s.floor - s.paid);
    if (short <= 0) continue;
    // The shortfall is paid to the players on the roster, as the CBA directs.
    payCash(state, team, short, season);
    if (team === state.userTeam) {
      send(state, "league", "League office", "Minimum cash spending",
        `Over ${s.from}-${s.to} we paid players ${Math.round(s.share * 100)}% of the salary caps in cash, below the CBA's ${Math.round(CASH_FLOOR * 100)}% floor. The ${money(short)} shortfall is paid to the players on our roster.`);
    } else if (short > 5_000_000) {
      news(state, `The ${teamLabel(team)} fell short of the CBA's cash spending floor for ${s.from}-${s.to} and will pay ${money(short)} to their players.`);
    }
  }
}

export function bonusesDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date === addDays(K.superBowl, 2)) settleSeason(state);
  if (K.minicampStart && state.date === addDays(K.minicampStart, 3)) settleWorkouts(state);
}
