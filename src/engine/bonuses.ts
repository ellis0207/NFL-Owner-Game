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
import type { Deal, GameState } from "./types";

const REG_GAMES = 17;
/** The share of the salary caps each club must pay in cash over a period. */
export const CASH_FLOOR = 0.89;
export const PERIOD_YEARS = 4;

/** Writes per-game and workout bonuses into a new veteran deal's unguaranteed years. */
export function attachBonuses(state: GameState, id: string, deal: Deal, fromYear: number): void {
  if (deal.kind !== "veteran" && deal.kind !== "extension") return;
  const p = PLAYER_BY_ID[id];
  if (!p) return;
  const rng = rngFor(state.seed, `bonuses:${id}:${state.date}`);
  const age = fromYear - Number((p.birthDate ?? `${fromYear - 27}`).slice(0, 4));
  const perGame = rng() < (age >= 28 ? 0.5 : 0.3);
  const workout = rng() < 0.3;
  if (!perGame && !workout) return;
  const lastGames = Math.min(REG_GAMES, Number(seasonOf(state, id, fromYear - 1)?.line.g ?? 0));
  const share = 0.06 + 0.06 * rng();
  const wk = Math.round((100_000 + 400_000 * rng()) * capScale(state, fromYear) / 5000) * 5000;
  for (const y of deal.years) {
    if (y.void || y.year < fromYear || y.guaranteed > 0 || y.injuryGuaranteed > 0) continue;
    const floor = minimumSalary(p.yearsExp + Math.max(0, y.year - BASE_SEASON), y.year);
    if (perGame) {
      const per = Math.round((y.base * share) / REG_GAMES / 1000) * 1000;
      if (per >= 5000 && y.base - per * REG_GAMES >= floor) {
        y.base -= per * REG_GAMES;
        y.perGame = per;
        y.perGameLikely = y.year === fromYear ? lastGames : REG_GAMES;
      }
    }
    if (workout && y.base - wk >= floor) {
      y.base -= wk;
      y.workout = wk;
    }
  }
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
    if (deal.kind === "rookie") escalator(state, id, deal);
  }
  if (ourLines.length) {
    send(state, "transaction", "Cap office", "Per-game roster bonuses for the season",
      `${ourLines.join(". ")}. Games missed come back as cap credit next year; games played beyond what the cap counted are charged next year.`);
  }
  cashFloor(state);
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
