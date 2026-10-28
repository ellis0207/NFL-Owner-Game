// Roster moves: releases, the final cut to 53, the practice squad, injured
// reserve and replacement signings. Every team's decisions are made by its
// own staff from what they believe about players (true ability blurred by
// how good their evaluators are); the owner only sees the outcome.
import { accruedSeasons, addDeadMoney, adjustRollover, capHit, capSummary, invalidateRosters, releaseCost, teamPlayerIds, chargeYear, yearsExpIn } from "./cap";
import { dealOf, leagueYear, writeMinimumDeal, writePracticeDeal } from "./contracts";
import { addDays } from "./dates";
import { freeAgentPrice, market, minimumToday, signStreetFreeAgent, stillPlaying } from "./freeagency";
import { send } from "./inbox";
import { isHurt } from "./injuries";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, SEASON, TEAMS, teamLabel } from "./league";
import { isOffseason } from "./offseason";
import { rngFor } from "./rng";
import { coachView, perceivedAbility, staffEffects, teamStaff, upside } from "./staff";
import type { GameState, Position, Transaction } from "./types";
import { onWaivers, placeOnWaivers, subjectToWaivers } from "./waivers";

export const POSITION_ORDER: Position[] = [
  "QB", "RB", "FB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K", "P", "LS",
];

/** Fewest players a GM keeps at each position on the 53. */
export const MIN_ON_53: Partial<Record<Position, number>> = {
  QB: 2, RB: 3, WR: 5, TE: 3, OT: 4, OG: 3, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1,
};
/** Most a GM keeps at each position on the 53. */
const MAX_ON_53: Partial<Record<Position, number>> = { QB: 3, FB: 1, K: 1, P: 1, LS: 1, RB: 5, TE: 4, C: 3 };

/** What the front office thinks a player is worth keeping: GM and coaches' view, upside, and money already committed. */
export function keepValue(state: GameState, team: string, id: string): number {
  const p = PLAYER_BY_ID[id];
  const view = 0.5 * perceivedAbility(state, id, `gm:${team}`, staffEffects(team).gmEval) + 0.5 * coachView(state, team, id);
  const up = p.yearsExp <= 2 ? 0.35 * upside(state, id) : 0;
  const committed = Math.min(6, releaseCost(id, state).deadThisYear / 1_000_000); // sunk cost keeps players around
  return view + up + committed;
}

/** Players counting against the roster limit (90 in camp, 53 after cutdown). */
export function rosterCount(state: GameState, team: string): { roster: number; ps: number; ir: number } {
  let roster = 0;
  let ps = 0;
  let ir = 0;
  for (const id of teamPlayerIds(state, team)) {
    const p = state.players[id];
    if (p.status === "ps") ps++;
    else if (p.status === "ir") ir++;
    else if (p.status === "camp" || p.status === "active") roster++;
  }
  return { roster, ps, ir };
}

/** The GM's plan for the 53: ids to keep, best first. */
export function proposeFinal53(state: GameState, team: string, mustKeep: string[] = []): string[] {
  const ids = teamPlayerIds(state, team).filter((id) => state.players[id].status === "camp" || state.players[id].status === "active");
  const value = Object.fromEntries(ids.map((id) => [id, keepValue(state, team, id)]));
  const byPos = new Map<Position, string[]>();
  for (const id of ids) {
    const pos = PLAYER_BY_ID[id].position;
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  for (const list of byPos.values()) list.sort((a, b) => value[b] - value[a]);

  const keep = new Set<string>(mustKeep.filter((id) => ids.includes(id)));
  const countAt = (pos: Position) => [...keep].filter((id) => PLAYER_BY_ID[id].position === pos).length;
  for (const pos of POSITION_ORDER) {
    for (const id of byPos.get(pos) ?? []) {
      if (keep.size >= RULES.rosterLimits.regularSeason || countAt(pos) >= (MIN_ON_53[pos] ?? 0)) break;
      keep.add(id);
    }
  }
  const rest = ids.filter((id) => !keep.has(id)).sort((a, b) => value[b] - value[a]);
  for (const id of rest) {
    if (keep.size >= RULES.rosterLimits.regularSeason) break;
    const pos = PLAYER_BY_ID[id].position;
    if (countAt(pos) >= (MAX_ON_53[pos] ?? 99)) continue;
    keep.add(id);
  }
  return [...keep].sort((a, b) => value[b] - value[a]);
}

/** The owner's own 53: kept as given, or trimmed to the GM's best 53 if it runs long. */
export function trimPlan(state: GameState, team: string, plan: string[]): string[] {
  return [...plan].sort((a, b) => keepValue(state, team, b) - keepValue(state, team, a)).slice(0, RULES.rosterLimits.regularSeason);
}

/** Roster limit today: 90 in the offseason and camp, 53 from the cutdown through the season. */
export function rosterLimit(state: GameState, date = state.date): number {
  return date < RULES.keyDates.rosterCutdown || isOffseason(date) ? RULES.rosterLimits.offseason : RULES.rosterLimits.regularSeason;
}

/** Where a player signed today goes: the 90-man roster before the cutdown and after the season, else the 53. */
export function rosterStatusNow(state: GameState): "camp" | "active" {
  return state.date < RULES.keyDates.rosterCutdown || isOffseason(state.date) ? "camp" : "active";
}

export function rosterRoom(state: GameState, team: string): number {
  return rosterLimit(state) - rosterCount(state, team).roster;
}

/** The league's transaction wire. */
export function logMove(state: GameState, team: string, player: string, kind: Transaction["kind"], text: string): void {
  const list = (state.transactions ??= []);
  list.unshift({ date: state.date, team, player, kind, text });
  if (list.length > 2500) list.length = 2000;
}

/**
 * Releases a player. Dead money lands as the contract says. Players with
 * fewer than four accrued seasons (anyone after the trade deadline) go on
 * waivers, where another team can claim the rest of the contract; vested
 * veterans and practice squad players become free agents at once.
 */
export function releasePlayer(state: GameState, id: string, opts: { psIntent?: boolean; june1?: boolean } = {}): "waivers" | "fa" | null {
  const p = state.players[id];
  if (!p?.team) return null;
  const team = p.team;
  const fromPs = p.status === "ps" || p.status === "future";
  const deal = dealOf(state, id);
  const cost = releaseCost(id, state, { june1: opts.june1 });
  const year = chargeYear(state);
  addDeadMoney(state, team, year, cost.deadThisYear);
  addDeadMoney(state, team, year + 1, cost.deadNextYear);
  // After the season the player's hit is already in the rollover; only the extra acceleration costs more.
  adjustRollover(state, team, cost.savingsThisYear);
  state.contracts[id] = null;
  state.players[id] = { team: null, status: "fa", injury: p.injury, dev: p.dev, pot: p.pot, exp: p.exp, morale: p.morale, lastTeam: team };
  if (state.termPay) delete state.termPay[id];
  if (state.psProtect?.[team]) state.psProtect[team] = state.psProtect[team].filter((x) => x !== id);
  const pd = PLAYER_BY_ID[id];
  if (!fromPs && subjectToWaivers(state, id)) {
    placeOnWaivers(state, id, team, deal, { thisYear: cost.salaryThisYear, nextYear: cost.salaryNextYear }, !!opts.psIntent);
    logMove(state, team, id, "waived", `waived ${pd.position} ${pd.name}`);
    return "waivers";
  }
  if (opts.psIntent) (state.psPlans ??= {})[id] = team;
  logMove(state, team, id, "released", `released ${pd.position} ${pd.name}${fromPs && p.status === "ps" ? " from the practice squad" : ""}${opts.june1 ? " (post-June 1)" : ""}`);
  return "fa";
}

// ---- Practice squad ----

/** Up to six practice squad players can have any number of accrued seasons; the rest two or fewer. */
export const PS_VETERAN_SLOTS = 6;
const PS_SIZE = RULES.rosterLimits.practiceSquad;

function psVeteran(state: GameState, id: string): boolean {
  return accruedSeasons(id, state.date) >= 3;
}

export function practiceSquad(state: GameState, team: string): string[] {
  return teamPlayerIds(state, team).filter((id) => state.players[id].status === "ps");
}

export function psRoom(state: GameState, team: string): number {
  return PS_SIZE - practiceSquad(state, team).length;
}

/** Can this player join this team's practice squad now? */
export function psEligible(state: GameState, team: string, id: string): boolean {
  if (onWaivers(state, id) || state.players[id]?.status !== "fa" && state.players[id]?.team !== team) return false;
  if (!psVeteran(state, id)) return true;
  return practiceSquad(state, team).filter((x) => x !== id && psVeteran(state, x)).length < PS_VETERAN_SLOTS;
}

export function canSignToPracticeSquad(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  const k = RULES.keyDates;
  if (state.date < k.practiceSquadSigningOpens || !stillPlaying(state, team)) {
    return { ok: false, reason: "Practice squads exist from the day after the cutdown until a team's season ends." };
  }
  if (state.players[id]?.status !== "fa") return { ok: false, reason: "Only free agents can be signed to the practice squad." };
  if (onWaivers(state, id)) return { ok: false, reason: "On waivers: he has to clear first." };
  if (psRoom(state, team) <= 0) return { ok: false, reason: `The practice squad is full (${PS_SIZE}).` };
  if (!psEligible(state, team, id)) return { ok: false, reason: `We already have ${PS_VETERAN_SLOTS} veterans on the practice squad.` };
  return { ok: true };
}

export function signToPracticeSquad(state: GameState, team: string, id: string): void {
  state.contracts[id] = writePracticeDeal(team, state.date, accruedSeasons(id, state.date));
  state.players[id] = { ...state.players[id], team, status: "ps" };
  delete state.players[id].lastTeam;
  delete state.players[id].elevations;
  if (state.psPlans) delete state.psPlans[id];
  const m = market(state)[id];
  if (m) m.status = "signed";
  invalidateRosters(state);
  const p = PLAYER_BY_ID[id];
  logMove(state, team, id, "ps", `signed ${p.position} ${p.name} to the practice squad`);
}

/** Signs one of our practice squad players to the 53 on a one-year minimum deal. */
export function promoteFromPracticeSquad(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  if (state.players[id]?.team !== team || state.players[id].status !== "ps") return { ok: false, reason: "Not on our practice squad." };
  if (rosterRoom(state, team) <= 0) return { ok: false, reason: "The 53 is full: release someone first." };
  state.players[id] = { ...state.players[id], status: "active" };
  delete state.players[id].elevatedFor;
  state.contracts[id] = writeMinimumDeal(team, state.date, yearsExpIn(id, leagueYear(state.date)));
  invalidateRosters(state);
  const p = PLAYER_BY_ID[id];
  logMove(state, team, id, "promoted", `signed ${p.position} ${p.name} from the practice squad to the 53-man roster`);
  return { ok: true };
}

/** Can a team sign another team's practice squad player to its 53 now? */
export function canPoach(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  const ps = state.players[id];
  if (ps?.status !== "ps" || !ps.team || ps.team === team) return { ok: false, reason: "Not on another team's practice squad." };
  if (state.date < RULES.keyDates.regularSeasonStart || isOffseason(state.date)) return { ok: false, reason: "Only during the season." };
  if (isProtected(state, ps.team, id)) return { ok: false, reason: `The ${teamLabel(ps.team)} protected him this week.` };
  if (rosterRoom(state, team) <= 0) return { ok: false, reason: "The 53 is full: release someone first." };
  if (state.settings.capRules === "real" && capSummary(state, team).space < minimumToday(state, id)) {
    return { ok: false, reason: "Not enough cap space." };
  }
  return { ok: true };
}

/** How a front office ranks a practice squad candidate: development upside counts for more than today. */
function psValue(state: GameState, team: string, id: string): number {
  const young = accruedSeasons(id, state.date) <= 2;
  return perceivedAbility(state, id, `gm:${team}`, staffEffects(team).gmEval) + (young ? 0.5 * upside(state, id) : -2);
}

/**
 * Fills a team's practice squad: first the players it cut and meant to bring
 * back (if no one claimed them), then the best young free agents.
 */
export function fillPracticeSquad(state: GameState, team: string, target = PS_SIZE - 1): string[] {
  const signed: string[] = [];
  for (const [id, t] of Object.entries(state.psPlans ?? {})) {
    if (t !== team) continue;
    delete state.psPlans![id];
    if (psRoom(state, team) <= 0 || state.players[id]?.status !== "fa" || !psEligible(state, team, id)) continue;
    signToPracticeSquad(state, team, id);
    signed.push(id);
  }
  if (practiceSquad(state, team).length >= target) return signed;
  const pool = freeAgents(state).filter((id) => !isHurt(state, id) && (HIDDEN_RATINGS[id]?.potential ?? 0) > 0)
    .map((id) => ({ id, v: psValue(state, team, id) }))
    .sort((a, b) => b.v - a.v);
  for (const { id } of pool) {
    if (practiceSquad(state, team).length >= target) break;
    if (state.players[id].status !== "fa" || !psEligible(state, team, id)) continue;
    // Practice squad players sign for the weekly minimum: anyone asking for real money passes.
    if (freeAgentPrice(state, id) > minimumFor(id) * 1.2) continue;
    signToPracticeSquad(state, team, id);
    signed.push(id);
  }
  return signed;
}

function minimumFor(id: string): number {
  return 900_000 + 70_000 * Math.min(7, PLAYER_BY_ID[id].yearsExp);
}

/** Practice squads form the day after the cutdown, once waiver claims are in. */
export function formPracticeSquads(state: GameState): void {
  for (const t of TEAMS) {
    const signed = fillPracticeSquad(state, t.id);
    if (t.id === state.userTeam) {
      send(state, "transaction", gmName(state), "Practice squad set",
        `Waiver claims are in and the practice squad is formed: ${signed.length} players, ` +
        `${practiceSquad(state, t.id).filter((id) => psVeteran(state, id)).length} of them veterans. ` +
        "Practice squad players are free agents: other teams can sign any of them to their 53 unless we protect them, up to four a week. " +
        "The head coach can elevate two of them for a game day, three times each per season.");
    }
  }
}

/** Each week a team protects up to four practice squad players from being signed away. */
export function protectPracticeSquads(state: GameState): void {
  const prot = (state.psProtect ??= {});
  for (const t of TEAMS) {
    const ps = practiceSquad(state, t.id);
    if (t.id === state.userTeam && prot[t.id]) {
      prot[t.id] = prot[t.id].filter((id) => ps.includes(id)).slice(0, 4);
      continue;
    }
    prot[t.id] = ps.map((id) => ({ id, v: psValue(state, t.id, id) })).sort((a, b) => b.v - a.v).slice(0, 4).map((x) => x.id);
  }
}

export function isProtected(state: GameState, team: string, id: string): boolean {
  return !!state.psProtect?.[team]?.includes(id);
}

/**
 * Game day: if a position is too thin to field, the head coach elevates
 * practice squad players for the day (two per game, three times per player
 * a season), and they return to the practice squad afterward.
 */
export function gameDayElevations(state: GameState, team: string): string[] {
  const need: Partial<Record<Position, number>> = { QB: 2, RB: 2, WR: 5, TE: 2, OT: 3, OG: 3, C: 1, EDGE: 3, IDL: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
  const healthy: Partial<Record<Position, number>> = {};
  for (const id of teamPlayerIds(state, team)) {
    const ps = state.players[id];
    if (ps.status !== "active" || isHurt(state, id) || isHoldingOut(state, id)) continue;
    healthy[PLAYER_BY_ID[id].position] = (healthy[PLAYER_BY_ID[id].position] ?? 0) + 1;
  }
  const squad = practiceSquad(state, team).filter((id) => !isHurt(state, id) && (state.players[id].elevations ?? 0) < 3);
  const up: string[] = [];
  for (const [pos, min] of Object.entries(need) as [Position, number][]) {
    while ((healthy[pos] ?? 0) < min && up.length < 2) {
      const pick = squad.filter((id) => !up.includes(id) && PLAYER_BY_ID[id].position === pos)
        .sort((a, b) => coachView(state, team, b) - coachView(state, team, a))[0];
      if (!pick) break;
      up.push(pick);
      healthy[pos] = (healthy[pos] ?? 0) + 1;
    }
  }
  // Most weeks a coach also elevates a player or two for special teams depth when the 53 is banged up.
  const gameDay = RULES.rosterLimits.gameDayActive + 2;
  let healthyTotal = Object.values(healthy).reduce((a, b) => a + (b ?? 0), 0);
  const rng = rngFor(state.seed, `elevate:${team}:${state.date}`);
  for (const id of squad.filter((x) => !up.includes(x)).sort((a, b) => coachView(state, team, b) - coachView(state, team, a))) {
    if (up.length >= 2) break;
    // Short-handed teams always do; the rest most weeks, for special teams.
    if (healthyTotal >= gameDay && rng() > (up.length ? 0.35 : 0.65)) break;
    up.push(id);
    healthyTotal++;
  }
  for (const id of up) {
    const ps = state.players[id];
    ps.elevatedFor = state.date;
    ps.elevations = (ps.elevations ?? 0) + 1;
    logMove(state, team, id, "elevated", `elevated ${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} from the practice squad for the game`);
  }
  return up;
}

function gmName(state: GameState): string {
  const gm = teamStaff(state.userTeam).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

/**
 * Termination pay: a vested veteran (four or more accrued seasons) on the
 * roster for the first game is owed his whole season's salary if released
 * later, which is why teams make their veteran cuts before Week 1.
 */
export function applyTerminationPay(state: GameState): void {
  const year = leagueYear(state.date);
  const tp = (state.termPay ??= {});
  for (const [id, ps] of Object.entries(state.players)) {
    if (!ps.team || (ps.status !== "active" && ps.status !== "ir")) continue;
    if (accruedSeasons(id, state.date) >= 4 && dealOf(state, id)?.years.some((y) => y.year === year && !y.void)) tp[id] = year;
  }
}

// ---- Releases and claims ----

/** A front office's read of a player it might add: its GM's eye, plus upside for young players. */
export function claimView(state: GameState, team: string, id: string): number {
  const up = PLAYER_BY_ID[id].yearsExp <= 2 ? 0.35 * upside(state, id) : 0;
  return perceivedAbility(state, id, `gm:${team}`, staffEffects(team).gmEval) + up;
}

/**
 * The player a team would cut to make room: the least valuable healthy
 * player on the roster who isn't needed to stay above a position's minimum,
 * preferring the incoming player's position.
 */
export function weakestOnRoster(state: GameState, team: string, pos: Position): string | undefined {
  const roster = teamPlayerIds(state, team).filter((id) => ["active", "camp"].includes(state.players[id].status));
  // Positions are counted by healthy players, so a team never cuts its only healthy kicker.
  const counts: Partial<Record<Position, number>> = {};
  for (const id of roster) if (!isHurt(state, id)) counts[PLAYER_BY_ID[id].position] = (counts[PLAYER_BY_ID[id].position] ?? 0) + 1;
  const cuttable = roster.filter((id) => {
    const ps = state.players[id];
    const ppos = PLAYER_BY_ID[id].position;
    if (isHurt(state, id) || ps.holdout || (ps.keepUntil && ps.keepUntil > state.date)) return false;
    return (counts[ppos] ?? 0) > (MIN_ON_53[ppos] ?? 0) || (ppos === pos && (counts[ppos] ?? 0) > 1);
  });
  if (!cuttable.length) return undefined;
  const value = Object.fromEntries(cuttable.map((id) => [id, keepValue(state, team, id)]));
  cuttable.sort((a, b) => value[a] - value[b]);
  return cuttable.find((id) => PLAYER_BY_ID[id].position === pos && value[id] < value[cuttable[0]] + 3) ?? cuttable[0];
}

/** Cut a team to 53 using the given keep list, then sign a practice squad from its own cuts. */
export function applyCutdown(state: GameState, team: string, keepIds: string[]): { cut: string[]; ps: string[] } {
  const keep = new Set(keepIds.slice(0, RULES.rosterLimits.regularSeason));
  const cut: string[] = [];
  for (const id of teamPlayerIds(state, team)) {
    const status = state.players[id].status;
    if (status === "ps" || status === "ir") continue;
    if (keep.has(id)) state.players[id].status = "active";
    else cut.push(id);
  }
  // The cuts the team hopes to bring back on the practice squad once they clear waivers.
  const candidates = cut
    .filter((id) => capHit(id, SEASON, state) < 2_000_000 && !isHurt(state, id))
    .sort((a, b) => HIDDEN_RATINGS[b].potential + (state.players[b].pot ?? 0) - HIDDEN_RATINGS[a].potential - (state.players[a].pot ?? 0));
  const ps: string[] = [];
  let veterans = 0;
  for (const id of candidates) {
    if (ps.length >= RULES.rosterLimits.practiceSquad - 1) break;
    const veteran = accruedSeasons(id, state.date) >= 3;
    if (veteran && veterans >= PS_VETERAN_SLOTS) continue;
    if (veteran) veterans++;
    ps.push(id);
  }
  const psSet = new Set(ps);
  for (const id of cut) releasePlayer(state, id, { psIntent: psSet.has(id) });
  invalidateRosters(state);
  return { cut: cut.filter((id) => !psSet.has(id)), ps };
}

/**
 * The coaches' depth chart: healthy players by position, best first in the
 * staff's eyes (true ability blurred by their evaluation skill, plus scheme fit).
 */
/** Holdouts miss everything; hold-ins sit out the preseason. */
export function isHoldingOut(state: GameState, id: string, date = state.date): boolean {
  const h = state.players[id]?.holdout;
  return !!h && (h.kind === "holdout" || date < RULES.keyDates.regularSeasonStart);
}

export function depthChart(state: GameState, team: string, date = state.date): Record<Position, string[]> {
  const chart = Object.fromEntries(POSITION_ORDER.map((p) => [p, [] as string[]])) as Record<Position, string[]>;
  const view: Record<string, number> = {};
  for (const id of teamPlayerIds(state, team)) {
    const ps = state.players[id];
    const elevated = ps.status === "ps" && ps.elevatedFor === date;
    if (ps.status !== "active" && ps.status !== "camp" && !elevated) continue;
    if (isHurt(state, id, date) || isHoldingOut(state, id, date)) continue;
    chart[PLAYER_BY_ID[id].position].push(id);
    view[id] = coachView(state, team, id);
  }
  for (const pos of POSITION_ORDER) chart[pos].sort((a, b) => view[b] - view[a]);
  return chart;
}

// ---- Injured reserve and replacements ----

export interface RosterMove {
  team: string;
  text: string;
}

/** Days out that send a player to injured reserve (a four-game minimum stay). */
const IR_THRESHOLD_DAYS = 28;

function bestAvailable(state: GameState, team: string, pos: Position, pool: string[]): string | undefined {
  const gm = staffEffects(team).gmEval;
  let best: string | undefined;
  let bestValue = -Infinity;
  for (const id of pool) {
    if (PLAYER_BY_ID[id].position !== pos || isHurt(state, id)) continue;
    const v = perceivedAbility(state, id, `gm:${team}`, gm);
    if (v > bestValue) {
      bestValue = v;
      best = id;
    }
  }
  return best;
}

const freeAgentCache = new WeakMap<GameState, { date: string; ids: string[] }>();
/** Unsigned players free to sign today (not on waivers, not already agreed elsewhere). */
export function freeAgents(state: GameState): string[] {
  let cache = freeAgentCache.get(state);
  if (cache?.date !== state.date) {
    cache = { date: state.date, ids: Object.keys(state.players).filter((id) => state.players[id].status === "fa") };
    freeAgentCache.set(state, cache);
  }
  return cache.ids.filter((id) => state.players[id].status === "fa" && !onWaivers(state, id) && market(state)[id]?.status !== "agreed");
}

/** Other teams' practice squad players a team can sign to its 53: everyone not protected this week. */
function poachable(state: GameState, team: string): string[] {
  if (state.date < RULES.keyDates.regularSeasonStart || isOffseason(state.date)) return [];
  const out: string[] = [];
  for (const t of TEAMS) {
    if (t.id === team) continue;
    for (const id of practiceSquad(state, t.id)) if (!isProtected(state, t.id, id)) out.push(id);
  }
  return out;
}

/** Signs another team's practice squad player to the 53: at least three game checks are guaranteed. */
export function poachFromPracticeSquad(state: GameState, team: string, id: string): void {
  const from = state.players[id].team!;
  state.players[id] = { ...state.players[id], team: null, status: "fa", lastTeam: from };
  delete state.players[id].elevatedFor;
  signStreetFreeAgent(state, team, id, { guaranteedWeeks: 3 });
  state.players[id].keepUntil = addDays(state.date, 21);
  const p = PLAYER_BY_ID[id];
  // The signing logged a plain "signed" line; this replaces it.
  const last = state.transactions?.[0];
  if (last && last.player === id && last.kind === "signed") state.transactions!.shift();
  logMove(state, team, id, "poached", `signed ${p.position} ${p.name} off the ${teamLabel(from)} practice squad`);
  if (from === state.userTeam) {
    send(state, "transaction", gmName(state), `${p.name} signed away`,
      `The ${teamLabel(team)} signed ${p.position} ${p.name} off our practice squad to their 53-man roster. ` +
      "Protect the players you can't lose on the Free agents page; we can protect four a week.");
  }
}

/** Fills an open spot on the 53 at a position: a practice squad call-up, a free agent, or another team's practice squad player. */
export function signReplacement(state: GameState, team: string, pos: Position): RosterMove | null {
  const ps = practiceSquad(state, team);
  const budget = state.settings.capRules === "real" ? capSummary(state, team).space - 500_000 : Infinity;
  const fromPs = bestAvailable(state, team, pos, ps);
  const street = bestAvailable(state, team, pos, freeAgents(state).filter((id) => freeAgentPrice(state, id) <= budget));
  const other = bestAvailable(state, team, pos, poachable(state, team));
  const gm = staffEffects(team).gmEval;
  const view = (id: string | undefined) => (id ? perceivedAbility(state, id, `gm:${team}`, gm) : -Infinity);
  // Teams promote their own first unless someone clearly better is out there.
  let id = fromPs;
  let source: "ps" | "fa" | "poach" = "ps";
  if (street && view(street) > view(fromPs) + 0.5) { id = street; source = "fa"; }
  if (other && view(other) > Math.max(view(fromPs), view(street)) + 4) { id = other; source = "poach"; }
  if (!id) return null;
  const name = PLAYER_BY_ID[id].name;
  if (source === "poach") {
    const from = state.players[id].team!;
    poachFromPracticeSquad(state, team, id);
    return { team, text: `signed ${pos} ${name} off the ${teamLabel(from)} practice squad` };
  }
  if (source === "ps") {
    state.players[id] = { ...state.players[id], status: "active" };
    delete state.players[id].elevatedFor;
    state.contracts[id] = writeMinimumDeal(team, state.date, yearsExpIn(id, leagueYear(state.date)));
    invalidateRosters(state);
    logMove(state, team, id, "promoted", `signed ${pos} ${name} from the practice squad to the 53-man roster`);
    // Refill the practice squad spot from the street.
    fillPracticeSquad(state, team, ps.length);
    return { team, text: `signed ${pos} ${name} from the practice squad to the 53-man roster` };
  }
  signStreetFreeAgent(state, team, id);
  return { team, text: `signed free agent ${pos} ${name}` };
}

/** Moves long-term injured players to IR and signs replacements. Returns what happened. */
export function manageInjuredReserve(state: GameState, team: string): RosterMove[] {
  const moves: RosterMove[] = [];
  const after = state.date > RULES.keyDates.rosterCutdown;
  for (const id of teamPlayerIds(state, team)) {
    const p = state.players[id];
    if (p.status !== "active" && !(p.status === "camp" && !after)) continue;
    if (!p.injury || p.injury.returnDate < addDays(state.date, IR_THRESHOLD_DAYS)) continue;
    // In camp, only season-ending injuries go to IR before the cutdown.
    if (!after && !p.injury.seasonEnding) continue;
    p.status = "ir";
    p.irDate = state.date;
    const pos = PLAYER_BY_ID[id].position;
    moves.push({ team, text: `placed ${pos} ${PLAYER_BY_ID[id].name} on injured reserve (${p.injury.type.toLowerCase()})` });
    if (after) {
      const signed = signReplacement(state, team, pos);
      if (signed) moves.push(signed);
    }
  }
  // Activate healed players whose four-game minimum is up, releasing the weakest player to make room.
  if (after) {
    for (const id of teamPlayerIds(state, team)) {
      const p = state.players[id];
      if (p.status !== "ir" || isHurt(state, id) || !p.irDate || addDays(p.irDate, IR_THRESHOLD_DAYS) > state.date) continue;
      if (p.injury?.seasonEnding) continue;
      const cutId = weakestCuttable(state, team, PLAYER_BY_ID[id].position);
      if (!cutId) continue;
      releasePlayer(state, cutId);
      p.status = "active";
      delete p.irDate;
      moves.push({ team, text: `activated ${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} from injured reserve and released ${PLAYER_BY_ID[cutId].name}` });
    }
  }
  return moves;
}

/** The least valuable healthy player on the 53, preferring the returning player's position. */
function weakestCuttable(state: GameState, team: string, pos: Position): string | undefined {
  const active = teamPlayerIds(state, team).filter((id) => state.players[id].status === "active");
  if (active.length < RULES.rosterLimits.regularSeason) return undefined;
  const counts: Partial<Record<Position, number>> = {};
  for (const id of active) counts[PLAYER_BY_ID[id].position] = (counts[PLAYER_BY_ID[id].position] ?? 0) + 1;
  const cuttable = active.filter((id) => {
    const ppos = PLAYER_BY_ID[id].position;
    const keep = state.players[id].keepUntil;
    return !isHurt(state, id) && !(keep && keep > state.date) && (ppos === pos || (counts[ppos] ?? 0) > (MIN_ON_53[ppos] ?? 0));
  });
  cuttable.sort((a, b) => keepValue(state, team, a) - keepValue(state, team, b));
  return cuttable.find((id) => PLAYER_BY_ID[id].position === pos && keepValue(state, team, id) < keepValue(state, team, cuttable[0]) + 3) ?? cuttable[0];
}

/** Keeps a team able to field a lineup: if a position runs out of healthy players, sign one. */
export function fillEmergencies(state: GameState, team: string): RosterMove[] {
  // A team whose season is over has no game to field (a signing now would be a reserve/future deal).
  if (state.date <= RULES.keyDates.rosterCutdown || !stillPlaying(state, team)) return [];
  const moves: RosterMove[] = [];
  const need: Partial<Record<Position, number>> = { QB: 2, RB: 2, WR: 4, TE: 2, OT: 2, OG: 2, C: 1, EDGE: 3, IDL: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
  const healthy: Partial<Record<Position, number>> = {};
  for (const id of teamPlayerIds(state, team)) {
    if (state.players[id].status !== "active" || isHurt(state, id)) continue;
    const pos = PLAYER_BY_ID[id].position;
    healthy[pos] = (healthy[pos] ?? 0) + 1;
  }
  for (const [pos, min] of Object.entries(need) as [Position, number][]) {
    let have = healthy[pos] ?? 0;
    while (have < min) {
      const cutId = rosterCount(state, team).roster >= RULES.rosterLimits.regularSeason ? weakestCuttable(state, team, pos) : null;
      if (cutId === undefined) break;
      if (cutId) releasePlayer(state, cutId);
      const move = signReplacement(state, team, pos);
      if (!move) break;
      moves.push(move);
      have++;
    }
  }
  return moves;
}
