// Cap moves beyond a plain release: post-June 1 designations and pay cuts.
//
// A team can designate two releases a league year as post-June 1, from the
// new league year through June 1. The player is gone right away, but his full
// cap hit stays on the books until June 2; then only this year's share of the
// dead money stays and the rest moves to next year.
//
// A pay cut is a request: the player compares the new salary with what he
// thinks the open market would pay him, and agrees, names his own number, or
// would rather be released. Nobody likes being asked.
import { agentFor, changeMorale, changeTrust, morale, priorities } from "./agents";
import { addDeadMoney, capHit, capSummary, releaseCost } from "./cap";
import { dealOf, dealYear, isPostJune1, leagueYear, minimumSalary } from "./contracts";
import { ageOn } from "./dates";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { invalidateMarket, marketPrice } from "./market";
import { comply, isOffseason, NEXT } from "./offseason";
import { gaussian, rngFor } from "./rng";
import { releasePlayer } from "./roster";
import type { GameState, June1Release, PayCutAsk } from "./types";

export const JUNE1_PER_YEAR = 2;

function june1List(state: GameState): June1Release[] {
  const league = (state.league ??= { caps: {} });
  return (league.june1 ??= []);
}

/** Designations a team has left this league year. */
export function june1Left(state: GameState, team: string): number {
  const year = leagueYear(state.date);
  return JUNE1_PER_YEAR - june1List(state).filter((r) => r.team === team && r.year === year).length;
}

export function canJune1(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  if (state.players[id]?.team !== team) return { ok: false, reason: "Not on our roster." };
  if (state.settings.capRules !== "real") return { ok: false, reason: "Cap rules are off." };
  // The window: from the new league year (after the Super Bowl, before it opens, there's none) through June 1.
  if (isPostJune1(state.date) || (state.date > RULES.keyDates.superBowl && state.date < RULES.keyDates.newLeagueYear)) {
    return { ok: false, reason: "Post-June 1 designations open with the new league year and close on June 1." };
  }
  if (june1Left(state, team) <= 0) return { ok: false, reason: `We've used both designations for ${leagueYear(state.date)}.` };
  return { ok: true };
}

/** The cap picture of a post-June 1 release: what counts until June 2, and after. */
export function june1Preview(state: GameState, id: string): { now: number; dead: number; deadNext: number; savingsAfter: number } {
  const year = leagueYear(state.date);
  const hit = capHit(id, year, state);
  const c = releaseCost(id, state, { june1: true });
  return { now: Math.max(hit, c.deadThisYear), dead: c.deadThisYear, deadNext: c.deadNextYear, savingsAfter: hit - c.deadThisYear };
}

export function releaseJune1(state: GameState, id: string): June1Release | null {
  const team = state.players[id]?.team;
  if (!team || !canJune1(state, team, id).ok) return null;
  const year = leagueYear(state.date);
  const pv = june1Preview(state, id);
  releasePlayer(state, id, { june1: true });
  const held = Math.max(0, pv.now - pv.dead);
  addDeadMoney(state, team, year, held);
  const r: June1Release = { team, player: id, year, held, dead: pv.dead, deadNext: pv.deadNext };
  june1List(state).push(r);
  return r;
}

/** June 2: the held cap hits come off the books. */
function june1Daily(state: GameState): void {
  const year = leagueYear(state.date);
  if (state.date !== `${year}-06-02`) return;
  for (const r of june1List(state)) {
    if (r.done || r.year !== year) continue;
    r.done = true;
    addDeadMoney(state, r.team, year, -r.held);
    if (r.team === state.userTeam && r.held > 0) {
      send(state, "transaction", "Cap office", `June 1 savings: ${PLAYER_BY_ID[r.player].name}`,
        `With June 1 behind us, ${money(r.held)} of ${PLAYER_BY_ID[r.player].name}'s cap charge comes off our ${year} books. ` +
        `${money(r.dead)} of dead money stays on ${year} and ${money(r.deadNext)} moves to ${year + 1}.`);
    }
  }
  // Last year's records aren't needed any more.
  const league = state.league!;
  league.june1 = league.june1!.filter((r) => r.year >= year);
  invalidateMarket(state);
}

// ---- Pay cuts ----

/** The league year a pay cut changes: the coming one once the season is over. */
export function payCutYear(state: GameState): number {
  return state.date > RULES.keyDates.superBowl ? NEXT : leagueYear(state.date);
}

export interface PayCutInfo {
  ok: boolean;
  reason?: string;
  year: number;
  base: number;
  guaranteed: number;
  /** The least the salary can go: the guaranteed part or the league minimum. */
  least: number;
}

export function payCutInfo(state: GameState, team: string, id: string): PayCutInfo {
  const year = payCutYear(state);
  const y = dealYear(dealOf(state, id), year);
  const base = y && !y.void ? y.base : 0;
  const guaranteed = y ? Math.min(base, y.guaranteed) : 0;
  const least = Math.max(guaranteed, minimumSalary(PLAYER_BY_ID[id].yearsExp + (year - RULES.season), year));
  const out: PayCutInfo = { ok: false, year, base, guaranteed, least };
  if (state.players[id]?.team !== team) return { ...out, reason: "Not on our roster." };
  if (state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.superBowl) return { ...out, reason: "Pay cuts happen in the offseason." };
  if (!y || y.void) return { ...out, reason: `No contract for ${year}.` };
  if (base - least < 500_000) return { ...out, reason: "There's nothing to cut: the salary is guaranteed or already near the minimum." };
  const asked = state.league?.payCuts?.[id];
  if (asked && asked.year === year && asked.answer === "accepted") return { ...out, reason: `Already took a pay cut for ${year}.` };
  return { ...out, ok: true };
}

/** The least base salary the player takes rather than test the market (engine only). */
function walkAway(state: GameState, id: string, year: number, team: string): number {
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 27;
  const market = marketPrice(state, id, year).apy;
  // Older players know the market dries up; younger ones believe someone will pay.
  const belief = age >= 34 ? 0.68 : age >= 32 ? 0.78 : age >= 30 ? 0.88 : 0.97;
  const pr = priorities(id);
  const loyal = (pr.loyalty ?? 0.5) * 0.12;
  const mood = (70 - morale(state, id)) / 300;
  const z = gaussian(rngFor(state.seed, `paycut:${id}:${year}:${team}`)) * 0.07;
  return Math.max(minimumSalary(PLAYER_BY_ID[id].yearsExp, year), market * (belief - loyal + mood + z));
}

export interface PayCutAnswer {
  answer: PayCutAsk["answer"];
  text: string;
  counter?: number;
}

/** Ask a player to take less this year. */
export function askPayCut(state: GameState, team: string, id: string, newBase: number): PayCutAnswer {
  const info = payCutInfo(state, team, id);
  const name = PLAYER_BY_ID[id].name;
  if (!info.ok) return { answer: "refused", text: info.reason! };
  newBase = Math.max(info.least, Math.round(newBase / 50_000) * 50_000);
  if (newBase >= info.base) return { answer: "refused", text: "That isn't a cut." };
  const league = (state.league ??= { caps: {} });
  const prior = league.payCuts?.[id];
  const again = prior && prior.year === info.year && prior.team === team;
  const floor = Math.min(info.base, walkAway(state, id, info.year, team) * (again ? 1.04 : 1));
  const agent = agentFor(id);
  const record = (a: PayCutAsk) => { (league.payCuts ??= {})[id] = a; };
  if (newBase >= floor) {
    applyPayCut(state, id, info.year, newBase);
    changeMorale(state, id, -4);
    record({ team, year: info.year, date: state.date, asked: newBase, answer: "accepted" });
    if (team === state.userTeam) news(state, `${name} takes a pay cut to stay with the ${teamLabel(team)}`);
    return { answer: "accepted", text: `${agent.name} calls back: ${name} will take ${money(newBase)} for ${info.year}, down from ${money(info.base)}. It saves ${money(info.base - newBase)} on the cap.` };
  }
  changeMorale(state, id, again ? -8 : -5);
  changeTrust(state, agent.id, team, -2);
  // Near enough, the player names his number; far off, he'd rather be let go.
  if (floor <= info.base * 0.95) {
    const counter = Math.ceil(floor / 50_000) * 50_000;
    record({ team, year: info.year, date: state.date, asked: newBase, counter, answer: "countered" });
    return { answer: "countered", counter, text: `${agent.name} says ${name} won't go to ${money(newBase)}, but would play for ${money(counter)} in ${info.year} rather than start over somewhere else.` };
  }
  record({ team, year: info.year, date: state.date, asked: newBase, answer: "refused" });
  return { answer: "refused", text: `${agent.name} says ${name} isn't taking a pay cut. If we can't keep paying the contract, release him and he'll find a team.` };
}

/** Take the player up on the number he named. */
export function acceptCounter(state: GameState, team: string, id: string): PayCutAnswer {
  const ask = state.league?.payCuts?.[id];
  const info = payCutInfo(state, team, id);
  if (!ask || ask.team !== team || ask.answer !== "countered" || !ask.counter || ask.year !== info.year || !info.ok) {
    return { answer: "refused", text: "That offer isn't on the table any more." };
  }
  applyPayCut(state, id, info.year, ask.counter);
  ask.answer = "accepted";
  ask.asked = ask.counter;
  if (team === state.userTeam) news(state, `${PLAYER_BY_ID[id].name} takes a pay cut to stay with the ${teamLabel(team)}`);
  return { answer: "accepted", text: `Done: ${PLAYER_BY_ID[id].name} plays ${info.year} for ${money(ask.counter)}, saving ${money(info.base - ask.counter)}.` };
}

function applyPayCut(state: GameState, id: string, year: number, newBase: number): void {
  const deal = dealOf(state, id)!;
  const copy = { ...deal, years: deal.years.map((y) => ({ ...y })) };
  const y = copy.years.find((x) => x.year === year)!;
  const cut = y.base - newBase;
  y.base = newBase;
  y.guaranteed = Math.min(y.guaranteed, newBase + y.proration + y.bonus);
  y.injuryGuaranteed = Math.min(y.injuryGuaranteed, newBase);
  copy.total -= cut;
  const real = copy.years.filter((x) => !x.void).length || 1;
  copy.apy = Math.round(copy.total / real);
  state.contracts[id] = copy;
  invalidateMarket(state);
}

/**
 * A CPU front office asks an overpaid veteran to take a cut before releasing
 * him. Returns the cap saved (0 if he says no).
 */
export function cpuPayCut(state: GameState, team: string, id: string, worth: number): number {
  const info = payCutInfo(state, team, id);
  if (!info.ok || worth >= info.base * 0.9) return 0;
  const floor = Math.min(info.base, walkAway(state, id, info.year, team));
  const target = Math.max(info.least, worth);
  if (floor > target * 1.08) return 0;
  const salary = Math.max(target, Math.ceil(floor / 50_000) * 50_000);
  if (salary >= info.base - 250_000) return 0;
  applyPayCut(state, id, info.year, salary);
  changeMorale(state, id, -4);
  ((state.league ??= { caps: {} }).payCuts ??= {})[id] = { team, year: info.year, date: state.date, asked: salary, answer: "accepted" };
  news(state, `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} takes a pay cut to stay with the ${teamLabel(team)}`);
  return info.base - salary;
}

export function capMovesDaily(state: GameState): void {
  june1Daily(state);
  // Outside the offseason, where the front offices do their cap work, a CPU team over the cap gets back under it.
  if (state.settings.capRules === "real" && !isOffseason(state.date)) {
    // In season only a real overage forces cuts, and never below a full 53.
    const inSeason = state.date >= RULES.keyDates.regularSeasonStart;
    for (const t of TEAMS) {
      if (t.id === state.userTeam || capSummary(state, t.id).space >= (inSeason ? -5_000_000 : 0)) continue;
      comply(state, t.id, inSeason ? 53 : 60);
    }
  }
  // Pay cut answers are good for the offseason they were asked in.
  const pc = state.league?.payCuts;
  if (pc && state.date === RULES.keyDates.regularSeasonStart) {
    for (const [id, a] of Object.entries(pc)) if (a.year < leagueYear(state.date) || a.answer !== "accepted") delete pc[id];
  }
}
