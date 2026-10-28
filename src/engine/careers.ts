// Careers from one season to the next: how players grow or slip over an
// offseason, and when they stop playing.
//
// Growth comes from the room a player still has (his hidden ceiling over
// where he is now), faster under coaches who develop players well and for
// players who were on the field. Each position has an age where players
// usually start to slip; past it the decline speeds up. None of it is
// certain: some players break out late, some never get there, and some age
// well. Nobody sees a number, only what the players do.
//
// Retirements are decided after the Super Bowl and announced over the next
// weeks, mostly by older players, more often by those who are slipping or
// have no contract. Free agents nobody signs by the spring mostly move on.
import { addDeadMoney, adjustRollover, chargeYear, invalidateRosters, releaseCost } from "./cap";
import { dealOf } from "./contracts";
import { addDays, ageOn } from "./dates";
import { news, send } from "./inbox";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, teamLabel } from "./league";
import { gaussian, rngFor } from "./rng";
import { logMove } from "./roster";
import { staffEffects, teamStaff } from "./staff";
import { seasonTotals } from "./stats";
import type { GameState, Position } from "./types";

/** The age where a position usually starts to slip. */
export const DECLINE_AGE: Record<Position, number> = {
  QB: 33, RB: 28, FB: 29, WR: 30, TE: 31, OT: 31, OG: 31, C: 31,
  EDGE: 30, IDL: 31, LB: 30, CB: 30, S: 30, K: 35, P: 35, LS: 35,
};

const SIDE: Record<Position, "off" | "def" | "st"> = {
  QB: "off", RB: "off", FB: "off", WR: "off", TE: "off", OT: "off", OG: "off", C: "off",
  EDGE: "def", IDL: "def", LB: "def", CB: "def", S: "def", K: "st", P: "st", LS: "st",
};

const round2 = (x: number) => Math.round(x * 100) / 100;

/** A player's true ability now, without the day-to-day of morale (engine only). */
function current(state: GameState, id: string): number {
  return (HIDDEN_RATINGS[id]?.overall ?? 45) + (state.players[id]?.dev ?? 0);
}

/** Share of his side's snaps a player played in the regular season. */
function playingTime(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, row] of Object.entries(seasonTotals(state, "REG"))) {
    const snaps = Math.max(row.line.offSnaps ?? 0, row.line.defSnaps ?? 0, (row.line.stSnaps ?? 0) * 0.25);
    out[id] = Math.min(1, snaps / (17 * 62));
  }
  return out;
}

/**
 * The offseason's growth and decline, once the season's games are done.
 * `season` is the season ahead: ages are taken as of its opening week.
 */
export function progressPlayers(state: GameState, season: number): void {
  const played = playingTime(state);
  const asOf = `${season}-09-01`;
  for (const [id, p] of Object.entries(state.players)) {
    if (p.status === "retired") continue;
    const r = HIDDEN_RATINGS[id];
    const data = PLAYER_BY_ID[id];
    if (!r || !data) continue;
    const rng = rngFor(state.seed, `career:${season}:${id}`);
    const age = ageOn(data.birthDate, asOf) ?? 27;
    const line = DECLINE_AGE[data.position] ?? 30;
    const now = r.overall + (p.dev ?? 0);
    let ceiling = Math.max(now, r.potential + (p.pot ?? 0));
    const fx = p.team ? staffEffects(p.team) : null;
    const side = SIDE[data.position];
    const coachRating = fx ? (side === "off" ? fx.devOffense : side === "def" ? fx.devDefense : fx.devSpecial) : 50;
    const coach = 0.85 + (coachRating - 60) / 100;
    const field = 0.85 + 0.35 * (played[id] ?? 0);

    let change = gaussian(rng) * 1.1;
    // Breakouts and busts: the ceiling itself moves.
    if (age <= 27) {
      const roll = rng();
      if (roll < 0.04) {
        ceiling += 3 + rng() * 4;
        change += 1.5 + rng() * 2;
      } else if (roll < 0.08) {
        ceiling = Math.max(now, ceiling - (3 + rng() * 5));
        change -= rng() * 1.5;
      } else {
        ceiling += gaussian(rng) * 0.8;
      }
    }
    // Growth into the room that's left, slowing in the late twenties.
    const room = Math.max(0, ceiling - now);
    if (room > 0 && age <= 29) {
      const stage = age <= 24 ? 1 : age <= 26 ? 0.85 : 0.55;
      change += room * (0.28 + 0.14 * rng()) * stage * coach * field;
    }
    // A late bloomer now and then.
    if (age >= 26 && age <= 31 && rng() < 0.02) change += 1.5 + rng() * 2;
    // Decline past the position's age, speeding up each year; some age better than others.
    if (age > line) {
      const d = age - line;
      change -= (0.5 + 0.6 * d + 0.1 * d * d) * (0.55 + 0.9 * rng());
    } else if (age >= line - 1) {
      change -= rng() * 0.7;
    }

    const next = Math.max(25, Math.min(99, now + change));
    // By the late twenties a player is about who he'll be.
    if (age >= 28) ceiling = next + Math.max(0, ceiling - next) * 0.35;
    ceiling = Math.max(next, Math.min(99, ceiling));
    p.dev = round2(next - r.overall);
    p.pot = round2(ceiling - r.potential);
  }
}

// ---- Retirements ----

/** How likely a player is to retire this offseason (engine only). */
function retireChance(state: GameState, id: string, date: string): number {
  const p = state.players[id];
  const data = PLAYER_BY_ID[id];
  const age = ageOn(data.birthDate, date) ?? 27;
  const over = age - (DECLINE_AGE[data.position] ?? 30) - 1;
  let chance = 1 / (1 + Math.exp(-(over * 0.6 - 2.0)));
  if (over < -4) chance = 0;
  // Good players keep going; players who are slipping see it coming.
  const q = Math.max(-1, Math.min(1, (current(state, id) - 62) / 22));
  chance *= 1 - 0.45 * q;
  const deal = dealOf(state, id);
  const last = deal?.years.filter((y) => !y.void).pop()?.year ?? null;
  if (!p.team || p.status === "fa") chance *= 1.5;
  else if (last === null || last <= RULES.season) chance *= 1.3;
  else if ((deal?.apy ?? 0) > 10_000_000) chance *= 0.7;
  // Few walk away from bonus money they'd have to give back.
  const owed = deal?.years.filter((y) => y.year > RULES.season).reduce((sum, y) => sum + y.proration, 0) ?? 0;
  if (owed > 0.015 * RULES.salaryCap) chance *= 0.35;
  if (p.injury?.seasonEnding) chance *= 1.4;
  // Now and then a young player walks away.
  return Math.min(0.95, chance + 0.003);
}

/**
 * After the Super Bowl: who will retire this offseason, and when each
 * announces it (between a few days after the game and the eve of free agency).
 */
export function planRetirements(state: GameState): void {
  const league = (state.league ??= { caps: {} });
  const start = addDays(RULES.keyDates.superBowl, 3);
  const window = Math.max(1, Math.round((Date.parse(RULES.keyDates.newLeagueYear) - Date.parse(start)) / 86_400_000) - 2);
  const out: Record<string, string> = {};
  for (const [id, p] of Object.entries(state.players)) {
    if (p.status === "retired" || !PLAYER_BY_ID[id] || !HIDDEN_RATINGS[id]) continue;
    // The unsigned are handled when the spring is over.
    if (!p.team) continue;
    const rng = rngFor(state.seed, `retire:${RULES.season}:${id}`);
    if (rng() >= retireChance(state, id, start)) continue;
    out[id] = addDays(start, Math.floor(rng() * window));
  }
  league.retiring = out;
}

/** Retirements announced today. */
export function careersDaily(state: GameState): void {
  const list = state.league?.retiring;
  if (!list) return;
  for (const [id, date] of Object.entries(list)) {
    if (date !== state.date) continue;
    delete list[id];
    const p = state.players[id];
    // Released or traded since: the plan still holds, wherever the player is.
    if (!p || p.status === "retired") continue;
    retirePlayer(state, id);
  }
}

/**
 * The spring is over: most free agents nobody signed move on, more so the
 * older and the ones out of work for a whole season.
 */
export function retireUnsigned(state: GameState): number {
  const kickoff = RULES.keyDates.regularSeasonStart;
  let n = 0;
  for (const [id, p] of Object.entries(state.players)) {
    if (p.status !== "fa" || p.team || state.waivers?.[id]) continue;
    const data = PLAYER_BY_ID[id];
    if (!data || !HIDDEN_RATINGS[id]) continue;
    const age = ageOn(data.birthDate, state.date) ?? 27;
    const since = state.fa?.[id]?.since;
    const idle = !since || since < kickoff;
    let chance = 0.25 + 0.08 * Math.max(0, age - 25) + (idle ? 0.45 : 0) + (current(state, id) < 55 ? 0.2 : 0);
    if (current(state, id) >= 68) chance *= 0.5;
    if (age >= DECLINE_AGE[data.position] + 2) chance += 0.2;
    if (rngFor(state.seed, `retire-fa:${RULES.season}:${id}`)() < Math.min(0.97, chance)) {
      retirePlayer(state, id, true);
      n++;
    }
  }
  return n;
}

/** A player retires: any contract ends and its remaining bonus money accelerates onto the cap. */
export function retirePlayer(state: GameState, id: string, quiet = false): void {
  const p = state.players[id];
  const data = PLAYER_BY_ID[id];
  const team = p.team;
  if (team) {
    const cost = releaseCost(id, state);
    const year = chargeYear(state);
    // Unpaid salary isn't owed: only the bonus money already paid comes due.
    const dead = Math.max(0, cost.deadThisYear - cost.salaryThisYear);
    addDeadMoney(state, team, year, dead);
    addDeadMoney(state, team, year + 1, Math.max(0, cost.deadNextYear - cost.salaryNextYear));
    adjustRollover(state, team, cost.savingsThisYear + cost.salaryThisYear);
    logMove(state, team, id, "retired", `${data.position} ${data.name} retired`);
  }
  state.contracts[id] = null;
  state.players[id] = { team: null, status: "retired", dev: p.dev, pot: p.pot, exp: p.exp, ...(team || p.lastTeam ? { lastTeam: team ?? p.lastTeam } : {}) };
  if (state.termPay) delete state.termPay[id];
  if (state.psPlans) delete state.psPlans[id];
  if (team && state.psProtect?.[team]) state.psProtect[team] = state.psProtect[team].filter((x) => x !== id);
  if (state.fa?.[id]) delete state.fa[id];
  const neg = state.negotiations[id];
  if (neg?.status === "open") {
    neg.status = "ended";
    neg.pending = undefined;
    neg.notes.unshift({ date: state.date, text: `${data.name} retired.` });
  }
  const hist = state.history;
  if (hist) hist.retired[id] = RULES.season;
  invalidateRosters(state);
  if (quiet) return;
  const age = ageOn(data.birthDate, state.date);
  const notable = current(state, id) >= 70 || (data.yearsExp ?? 0) >= 10;
  if (notable || team === state.userTeam) {
    news(state, `${data.position} ${data.name}${team ? ` of the ${teamLabel(team)}` : ""} retires${age ? ` at ${age}` : ""}${data.yearsExp ? ` after ${data.yearsExp + 1} seasons` : ""}`);
  }
  if (team === state.userTeam) {
    const gm = teamStaff(team).GM;
    send(state, "transaction", gm ? `${gm.name}, general manager` : "General Manager", `${data.name} is retiring`,
      `${data.position} ${data.name} told us today that it's time to retire. The contract comes off our books; ` +
      `any signing bonus money still to be counted moves onto this year's cap. We'll need to account for the spot on the depth chart.`);
  }
}
