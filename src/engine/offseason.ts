// The offseason, from the day after the Super Bowl to the draft: the season
// ends, the cap for next year is set, teams use their tags and tenders and
// clear cap room, and the new league year turns expiring contracts into free
// agents. Free agency itself is in freeagency.ts.
import { agentFor, changeMorale, changeTrust, priorities } from "./agents";
import { addDeadMoney, capHit, capSummary, invalidateRosters, releaseCost, teamPlayerIds, yearsExpIn } from "./cap";
import { addOneYear, dealCapHit, dealOf, lastYear, leagueYear, minimumSalary, projectedCap, rookieScale } from "./contracts";
import { addDays, ageOn, shortDate } from "./dates";
import { payCash } from "./finance";
import { money, news, send } from "./inbox";
import { onSeasonChange, PLAYER_BY_ID, RULES, SCHEDULE, TEAMS, teamLabel } from "./league";
import { careersDaily, planRetirements } from "./careers";
import { fifthYearOption, franchiseTag, invalidateMarket, rfaTender, teamValue, transitionTag, type TenderLevel } from "./market";
import { gaussian, rngFor } from "./rng";
import { releasePlayer } from "./roster";
import { teamStaff } from "./staff";
import { seasonTotals } from "./stats";
import { standings, winPct } from "./standings";
import type { Deal, GameState, OffseasonState } from "./types";

const KEY = RULES.keyDates;
/** The league year the offseason builds toward. */
export let NEXT = 0;
export let OFFSEASON_START = "";
/** The league announces the cap in late February. */
export let CAP_SET_DATE = "";
/** Teams send their tenders in the days before the league year opens. */
export let CPU_TENDER_DATE = "";
/** CPU teams make most fifth-year option calls just before the draft (the deadline is in early May). */
export let CPU_OPTION_DATE = "";
/** First-round picks whose fifth-year option comes up this spring. */
let OPTION_CLASS = 0;
onSeasonChange(() => {
  NEXT = RULES.season + 1;
  OFFSEASON_START = addDays(KEY.superBowl, 1);
  CAP_SET_DATE = addDays(KEY.franchiseTagWindowOpens, 9);
  CPU_TENDER_DATE = addDays(KEY.newLeagueYear, -3);
  CPU_OPTION_DATE = addDays(KEY.draftStart, -2);
  OPTION_CLASS = NEXT - 3;
});

export function isOffseason(date: string): boolean {
  return date >= OFFSEASON_START;
}

export function off(state: GameState): OffseasonState {
  return (state.offseason ??= { tags: {}, tenders: {}, options: {}, sheets: [], picksOwed: [] });
}

function gmOf(team: string): string {
  const gm = teamStaff(team).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

// ---- Who is a free agent ----

export type FaClass = "UFA" | "RFA" | "ERFA";

/** Accrued seasons after this one decide the kind of free agent: 4+ unrestricted, 3 restricted, fewer exclusive rights. */
export function faClass(id: string): FaClass {
  const accrued = PLAYER_BY_ID[id].yearsExp + 1;
  return accrued >= 4 ? "UFA" : accrued === 3 ? "RFA" : "ERFA";
}

/** Under contract now, with nothing past this league year. */
export function isPendingFreeAgent(state: GameState, id: string): boolean {
  const ps = state.players[id];
  if (!ps?.team || ps.status === "fa") return false;
  const last = lastYear(dealOf(state, id));
  return last === null || last < NEXT;
}

export function pendingFreeAgents(state: GameState, team: string): string[] {
  return teamPlayerIds(state, team).filter((id) => isPendingFreeAgent(state, id));
}

// ---- Tags ----

export type TagKind = "franchise" | "transition";

export function tagCost(state: GameState, id: string, kind: TagKind, exclusive = false): number {
  const p = PLAYER_BY_ID[id];
  const deal = dealOf(state, id);
  const prior = dealCapHit(deal, RULES.season);
  const tagged = deal?.kind === "franchise" ? 1 : 0;
  return kind === "franchise"
    ? franchiseTag(state, p.position, NEXT, { exclusive, priorSalary: prior, timesTagged: tagged })
    : transitionTag(state, p.position, NEXT, prior);
}

export function canTag(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  if (state.date < KEY.franchiseTagWindowOpens) return { ok: false, reason: `Tags can be used from ${shortDate(KEY.franchiseTagWindowOpens)}.` };
  if (state.date > KEY.franchiseTagDeadline) return { ok: false, reason: "The tag deadline has passed." };
  if (state.players[id]?.team !== team || !isPendingFreeAgent(state, id)) return { ok: false, reason: "Only our players with expiring deals can be tagged." };
  if (faClass(id) === "ERFA") return { ok: false, reason: "Exclusive-rights players get a tender, not a tag." };
  if (off(state).tags[team]) return { ok: false, reason: "We've already used our tag this year." };
  return { ok: true };
}

export function applyTag(state: GameState, team: string, id: string, kind: TagKind, exclusive = false): void {
  if (!canTag(state, team, id).ok) return;
  const amount = tagCost(state, id, kind, exclusive);
  const { deal, voided } = addOneYear(dealOf(state, id), team, state.date, kind, amount, NEXT);
  state.contracts[id] = deal;
  addDeadMoney(state, team, NEXT, voided);
  off(state).tags[team] = { player: id, kind, exclusive };
  invalidateMarket(state);
  const p = PLAYER_BY_ID[id];
  const pr = priorities(id);
  // Players want security, not a one-year deal: most dislike the tag, some a lot.
  changeMorale(state, id, -(2 + 10 * pr.ego * pr.money));
  changeTrust(state, agentFor(id).id, team, -2);
  state.signings.unshift({
    id: `${state.date}-${id}`, player: id, team, date: state.date, kind: "tag", years: 1, total: amount, apy: amount,
    guaranteed: amount, grades: [], valueAtSigning: teamValue(state, team, id, NEXT),
  });
  const label = kind === "franchise" ? `${exclusive ? "exclusive " : ""}franchise tag` : "transition tag";
  news(state, `The ${teamLabel(team)} place the ${label} on ${p.position} ${p.name} (${money(amount)} for ${NEXT})`);
  if (team === state.userTeam) {
    const agent = agentFor(id);
    send(state, "transaction", `${agent.name}, agent`, `${p.name} tagged`,
      `${p.name} has the ${label}: ${money(amount)} for ${NEXT}, fully guaranteed once signed. ` +
      (kind === "transition" ? "Other teams can still sign the player to an offer sheet, and we'd have five days to match. " : "") +
      "We can keep working on a long-term deal until July 15. My client would rather have one.");
  }
}

// ---- Tenders ----

export type TenderChoice = TenderLevel | "erfa";

export function tenderCost(state: GameState, id: string, level: TenderChoice): number {
  if (level === "erfa") return minimumSalary(yearsExpIn(id, NEXT), NEXT);
  return rfaTender(state, level, NEXT, dealCapHit(dealOf(state, id), RULES.season));
}

/** Draft pick the old team gets if it doesn't match an offer sheet. */
export function tenderCompensation(id: string, level: TenderLevel): string | undefined {
  if (level === "first") return "first";
  if (level === "second") return "second";
  const round = PLAYER_BY_ID[id].draft.round;
  return round ? `round${round}` : undefined;
}

export function canTender(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  if (!isOffseason(state.date)) return { ok: false, reason: "Tenders go out after the season." };
  if (state.date >= KEY.newLeagueYear) return { ok: false, reason: "The tender deadline has passed." };
  if (state.players[id]?.team !== team || !isPendingFreeAgent(state, id)) return { ok: false, reason: "Only our players with expiring deals can be tendered." };
  if (faClass(id) === "UFA") return { ok: false, reason: "Unrestricted free agents can't be tendered." };
  return { ok: true };
}

export function applyTender(state: GameState, team: string, id: string, level: TenderChoice): void {
  if (!canTender(state, team, id).ok) return;
  const amount = tenderCost(state, id, level);
  const { deal, voided } = addOneYear(dealOf(state, id), team, state.date, level === "erfa" ? "erfa" : "rfa", amount, NEXT);
  state.contracts[id] = deal;
  addDeadMoney(state, team, NEXT, voided);
  off(state).tenders[id] = { team, level, amount };
  const p = PLAYER_BY_ID[id];
  if (level !== "erfa" && amount >= 5_000_000) news(state, `The ${teamLabel(team)} tender restricted free agent ${p.name} at the ${TENDER_LABEL[level]} level`);
}

export const TENDER_LABEL: Record<TenderChoice, string> = {
  first: "first-round", second: "second-round", original: "original-round", erfa: "exclusive-rights",
};

// ---- Fifth-year options ----

export interface OptionInfo {
  eligible: boolean;
  amount: number;
  tier: "playingTime" | "basic";
  year: number;
}

/** A first-round pick's playing time: 75% of snaps in two of the first three seasons earns the higher option tier. */
function playingTimeTier(state: GameState, id: string): boolean {
  const p = PLAYER_BY_ID[id];
  let seasons = 0;
  for (const y of [OPTION_CLASS, OPTION_CLASS + 1]) {
    const s = p.snaps[String(y)];
    if (s && Math.max(s.offShare, s.defShare) >= 0.75) seasons++;
  }
  const line = seasonTotals(state, "REG")[id]?.line;
  const snaps = line ? Math.max(line.offSnaps ?? 0, line.defSnaps ?? 0) : 0;
  if (snaps / (17 * 63) >= 0.75) seasons++;
  return seasons >= 2;
}

export function optionInfo(state: GameState, id: string): OptionInfo {
  const p = PLAYER_BY_ID[id];
  const deal = dealOf(state, id);
  const year = NEXT + 1;
  const eligible = !!deal && deal.kind === "rookie" && p.draft.round === 1 && p.rookieYear === OPTION_CLASS && lastYear(deal) === NEXT;
  const tier = eligible && playingTimeTier(state, id) ? "playingTime" : "basic";
  return { eligible, tier, year, amount: eligible ? fifthYearOption(state, p.position, year, tier, p.draft.overall ?? 32) : 0 };
}

export function decideOption(state: GameState, team: string, id: string, exercise: boolean): void {
  const info = optionInfo(state, id);
  if (!info.eligible || state.players[id]?.team !== team || off(state).options[id]) return;
  off(state).options[id] = exercise ? "exercised" : "declined";
  const deal = dealOf(state, id)!;
  const p = PLAYER_BY_ID[id];
  const next: Deal = { ...deal, years: deal.years.map((y) => ({ ...y })), fifthYearOption: { year: info.year, amount: info.amount, exercised: exercise, declined: !exercise } };
  if (exercise) {
    // Since 2021 an exercised option is fully guaranteed when it is picked up.
    next.years = next.years.filter((y) => !y.void || y.year > info.year);
    next.years.push({ year: info.year, base: info.amount, proration: 0, bonus: 0, guaranteed: info.amount, injuryGuaranteed: 0 });
    next.years.sort((a, b) => a.year - b.year);
  }
  state.contracts[id] = next;
  if (exercise || (p.draft.overall ?? 99) <= 15) {
    news(state, `The ${teamLabel(team)} ${exercise ? "exercise" : "decline"} the fifth-year option on ${p.name} (${money(info.amount)} for ${info.year})`);
  }
}

// ---- Draft order and rookie money ----

/**
 * Where each team stands for the draft: how far it went in the playoffs (0 for
 * non-playoff teams, 5 for the champion), its record, and its strength of
 * schedule (opponents' combined winning percentage, the first tiebreaker).
 */
export function draftStanding(state: GameState): Record<string, { lost: number; pct: number; sos: number }> {
  const table = standings(state);
  const lost: Record<string, number> = {};
  const depth: Record<string, number> = { WC: 1, DIV: 2, CONF: 3, SB: 4 };
  const opps: Record<string, string[]> = {};
  for (const g of SCHEDULE) {
    if (g.type === "REG" && g.away && g.home) {
      (opps[g.away] ??= []).push(g.home);
      (opps[g.home] ??= []).push(g.away);
    }
    if (g.type !== "POST" || !g.round) continue;
    const r = state.results[g.id];
    if (!r) continue;
    const loser = r.homeScore > r.awayScore ? r.away : r.home;
    lost[loser] = depth[g.round];
    if (g.round === "SB") lost[loser === r.home ? r.away : r.home] = 5;
  }
  const pct = (t: string) => winPct(table[t].w, table[t].l, table[t].t);
  const out: Record<string, { lost: number; pct: number; sos: number }> = {};
  for (const t of TEAMS) {
    const os = opps[t.id] ?? [];
    let w = 0;
    let gp = 0;
    for (const o of os) {
      w += table[o].w + 0.5 * table[o].t;
      gp += table[o].w + table[o].l + table[o].t;
    }
    out[t.id] = { lost: lost[t.id] ?? 0, pct: pct(t.id), sos: gp ? w / gp : 0.5 };
  }
  return out;
}

/** 2027 draft order: non-playoff teams worst first, then playoff teams by how far they went; ties go to the easier schedule. */
export function draftOrder(state: GameState): string[] {
  const st = draftStanding(state);
  return TEAMS.map((t) => t.id).sort((a, b) =>
    st[a].lost - st[b].lost || st[a].pct - st[b].pct || st[a].sos - st[b].sos || a.localeCompare(b));
}

/** Cap room a team should keep for its draft class (first-year cap hits under the rookie scale). */
export function rookieReserve(state: GameState, team: string): number {
  const order = off(state).draftOrder ?? draftOrder(state);
  const slot = order.indexOf(team) + 1;
  let total = 0;
  for (let round = 0; round < 3; round++) total += rookieScale(round * 32 + slot, NEXT).total / 4;
  return Math.round(total + 4 * minimumSalary(0, NEXT));
}

// ---- The cap for next year ----

/** Void-year bonus money that will hit next year's cap when expiring deals void. */
export function projectedVoids(state: GameState, team: string): number {
  let total = 0;
  for (const id of teamPlayerIds(state, team)) {
    const deal = dealOf(state, id);
    if (!deal || (lastYear(deal) ?? NEXT) >= NEXT) continue;
    total += deal.years.filter((y) => y.void && y.year >= NEXT).reduce((s, y) => s + y.proration, 0);
  }
  return total;
}

/** Next year's space as a front office plans it: rookies and voided bonuses included. */
export function plannedSpace(state: GameState, team: string): number {
  const space = capSummary(state, team, NEXT).space;
  const voids = state.date < KEY.newLeagueYear ? projectedVoids(state, team) : 0;
  const rookies = state.date < KEY.draftStart ? rookieReserve(state, team) : 0;
  return space - voids - rookies;
}

// ---- Restructures ----

/**
 * Converts this league year's base salary above the minimum into a signing
 * bonus spread over the rest of the deal (void years can stretch it to five).
 * Saves cap now, costs cap later, and the bonus is paid in cash today.
 */
export function restructurePreview(state: GameState, id: string, voidYears = 0): { amount: number; savings: number; deal: Deal } | null {
  const deal = dealOf(state, id);
  const year = leagueYear(state.date);
  if (!deal || state.date >= KEY.regularSeasonStart && year === RULES.season) return null;
  const cur = deal.years.find((y) => y.year === year && !y.void);
  if (!cur) return null;
  const min = minimumSalary(yearsExpIn(id, year), year);
  const amount = Math.floor((cur.base - min) / 10_000) * 10_000;
  const real = deal.years.filter((y) => y.year >= year && !y.void);
  if (amount < 1_000_000 || real.length < 2 && voidYears === 0) return null;
  const next: Deal = { ...deal, years: deal.years.map((y) => ({ ...y })) };
  const lastReal = real[real.length - 1].year;
  for (let v = 1; v <= voidYears; v++) {
    if (!next.years.some((y) => y.year === lastReal + v)) next.years.push({ year: lastReal + v, base: 0, proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0, void: true });
  }
  next.years.sort((a, b) => a.year - b.year);
  const spread = next.years.filter((y) => y.year >= year).slice(0, 5);
  const per = Math.round(amount / spread.length);
  const c = next.years.find((y) => y.year === year)!;
  c.base -= amount;
  c.guaranteed = Math.max(0, c.guaranteed - amount);
  for (const y of spread) y.proration += per;
  next.signingBonus += amount;
  return { amount, savings: amount - per, deal: next };
}

export function restructure(state: GameState, id: string, voidYears = 0): number {
  const r = restructurePreview(state, id, voidYears);
  const team = state.players[id]?.team;
  if (!r || !team) return 0;
  state.contracts[id] = r.deal;
  payCash(state, team, r.amount);
  return r.savings;
}

// ---- CPU front offices ----

function cpuTeams(state: GameState): string[] {
  return TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam);
}

/** Before the market opens, each CPU team decides whether its best expiring player is worth the tag. */
function cpuTags(state: GameState): void {
  for (const team of cpuTeams(state)) {
    if (off(state).tags[team]) continue;
    const rng = rngFor(state.seed, `tag:${team}`);
    // Each team decides on its own day in the last week before the deadline.
    const day = addDays(KEY.franchiseTagDeadline, -Math.floor(rng() * 6));
    if (state.date !== day) continue;
    const best = pendingFreeAgents(state, team)
      .filter((id) => faClass(id) === "UFA" && state.negotiations[id]?.status !== "open")
      .map((id) => ({ id, v: teamValue(state, team, id, NEXT) }))
      .sort((a, b) => b.v - a.v)[0];
    if (!best || best.v < 10_000_000) continue;
    // Teams tag players they can't afford to lose and clear the room later.
    const space = plannedSpace(state, team) + 25_000_000;
    const fCost = tagCost(state, best.id, "franchise");
    const tCost = tagCost(state, best.id, "transition");
    if (best.v >= fCost * 0.8 && space > fCost && rng() < 0.75) applyTag(state, team, best.id, "franchise");
    else if (best.v >= tCost * 0.85 && space > tCost && rng() < 0.3) applyTag(state, team, best.id, "transition");
  }
}

function cpuTenders(state: GameState): void {
  for (const team of cpuTeams(state)) {
    for (const id of pendingFreeAgents(state, team)) {
      const cls = faClass(id);
      if (cls === "UFA") continue;
      const v = teamValue(state, team, id, NEXT);
      if (cls === "ERFA") {
        if (v >= tenderCost(state, id, "erfa") * 1.1) applyTender(state, team, id, "erfa");
        continue;
      }
      const level: TenderLevel | null = v >= tenderCost(state, id, "first") * 1.25 ? "first"
        : v >= tenderCost(state, id, "second") * 1.3 ? "second"
        : v >= tenderCost(state, id, "original") * 1.05 ? "original" : null;
      if (level) applyTender(state, team, id, level);
    }
  }
}

function cpuOptions(state: GameState): void {
  for (const team of cpuTeams(state)) {
    for (const id of teamPlayerIds(state, team)) {
      const info = optionInfo(state, id);
      if (!info.eligible || off(state).options[id]) continue;
      decideOption(state, team, id, teamValue(state, team, id, info.year) >= info.amount * 0.9);
    }
  }
}

/**
 * Teams short of room cut overpaid veterans before the league year, then
 * restructure once it opens. A team still over the cap on the new league year
 * has to get under it.
 */
function cpuCapWork(state: GameState): void {
  const window = state.date >= addDays(KEY.franchiseTagWindowOpens, 3) && state.date <= addDays(KEY.newLeagueYear, 3);
  if (!window) return;
  for (const team of cpuTeams(state)) {
    const rng = rngFor(state.seed, `capwork:${team}:${state.date}`);
    const deadline = state.date === addDays(KEY.newLeagueYear, -1) || state.date === KEY.newLeagueYear;
    if (rng() > 0.3 && !deadline) continue;
    const target = 6_000_000 + rng() * 10_000_000;
    let space = plannedSpace(state, team);
    if (space >= target) continue;
    // Restructures first once the league year opens: they only push money out.
    if (state.date >= KEY.newLeagueYear) {
      const big = teamPlayerIds(state, team).map((id) => ({ id, hit: capHit(id, NEXT, state) })).sort((a, b) => b.hit - a.hit).slice(0, 8);
      for (const b of big) {
        if (space >= target) break;
        space += restructure(state, b.id, rng() < 0.3 ? 2 : 0);
      }
    }
    if (space >= target) continue;
    const mustComply = state.date >= KEY.newLeagueYear && capSummary(state, team, NEXT).space < 0;
    const cands = teamPlayerIds(state, team)
      .map((id) => {
        const hit = capHit(id, NEXT, state);
        const cost = releaseCost(id, state);
        // Before the league year the dead money lands on this year's books instead (and cuts the rollover).
        const saved = state.date < KEY.newLeagueYear ? hit - Math.max(0, cost.deadThisYear - capHit(id, RULES.season, state)) - cost.deadNextYear : cost.savingsThisYear;
        return { id, hit, saved, v: teamValue(state, team, id, NEXT), age: ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 26 };
      })
      .filter((x) => x.hit >= 3_000_000 && x.saved >= 2_500_000 && x.v < x.saved * (mustComply ? 0.9 : 0.55) && x.age >= 26)
      .sort((a, b) => a.v / a.saved - b.v / b.saved);
    for (const c of cands.slice(0, mustComply ? 6 : 2)) {
      if (space >= target && !(mustComply && capSummary(state, team, NEXT).space < 0)) break;
      const dead = releaseOffseason(state, c.id);
      space += c.saved;
      news(state, `The ${teamLabel(team)} release ${PLAYER_BY_ID[c.id].position} ${PLAYER_BY_ID[c.id].name}${dead > 1_000_000 ? `, taking ${money(dead)} in dead money` : ""}`);
    }
  }
}

/** A release in the offseason. Returns the dead money it added. */
export function releaseOffseason(state: GameState, id: string): number {
  const team = state.players[id]?.team;
  if (!team) return 0;
  const year = String(leagueYear(state.date));
  const before = state.deadMoney[team]?.[year] ?? 0;
  releasePlayer(state, id);
  return (state.deadMoney[team]?.[year] ?? 0) - before;
}

// ---- The calendar ----

function startOffseason(state: GameState): void {
  const o = off(state);
  o.draftOrder = draftOrder(state);
  const league = (state.league ??= { caps: {} });
  league.rollover ??= {};
  for (const t of TEAMS) {
    // The season's books are closed: what's left rolls over (adjusted for moves made before the league year).
    league.rollover[t.id] = { [NEXT]: Math.max(0, capSummary(state, t.id, RULES.season).space) };
  }
  for (const t of TEAMS) {
    const ps: string[] = [];
    for (const id of teamPlayerIds(state, t.id)) {
      const p = state.players[id];
      delete p.holdout;
      delete p.irDate;
      delete p.elevations;
      delete p.elevatedFor;
      delete p.keepUntil;
      if (p.status === "ps") ps.push(id);
      else p.status = "camp";
    }
    // Reserve/future deals: teams keep most of their practice squad on minimum deals for next year.
    const rng = rngFor(state.seed, `futures:${t.id}`);
    for (const id of ps) {
      if (rng() < 0.75) {
        state.contracts[id] = futuresDeal(state, t.id, id);
        state.players[id].status = "camp";
      } else {
        state.players[id] = { ...state.players[id], team: null, status: "fa", lastTeam: t.id };
      }
    }
  }
  state.psProtect = {};
  invalidateRosters(state);
  const user = state.userTeam;
  const pending = pendingFreeAgents(state, user);
  const counts = { UFA: 0, RFA: 0, ERFA: 0 };
  for (const id of pending) counts[faClass(id)]++;
  const pick = o.draftOrder.indexOf(user) + 1;
  send(state, "staff", gmOf(user), "The offseason starts now",
    `${pending.length} of our players have contracts that end with this league year: ${counts.UFA} unrestricted, ${counts.RFA} restricted and ${counts.ERFA} exclusive-rights free agents. ` +
    `Key dates: tags from ${shortDate(KEY.franchiseTagWindowOpens)} to ${shortDate(KEY.franchiseTagDeadline)}, the negotiating window on ${shortDate(KEY.negotiatingWindowOpens)}, ` +
    `and the new league year on ${shortDate(KEY.newLeagueYear)}, when free agency opens and unsigned deals expire. Until the window opens, only we can talk to our own free agents. ` +
    `We pick ${ordinal(pick)} in the draft on ${shortDate(KEY.draftStart)}. Projected ${NEXT} cap space is ${money(capSummary(state, user, NEXT).space)}, ` +
    `including ${money(league.rollover[user][NEXT])} of unused ${RULES.season} space we carry over.`);
}

function futuresDeal(state: GameState, team: string, id: string): Deal {
  const base = minimumSalary(yearsExpIn(id, NEXT), NEXT);
  return {
    team, signed: state.date, kind: "minimum", signingBonus: 0, total: base, apy: base, guaranteedAtSigning: 0,
    years: [{ year: NEXT, base, proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0 }],
  };
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/**
 * The cap follows league revenue: the projection is close for 2027, and later
 * years swing more with the business. New national media deals (the current
 * ones can be reopened after the 2029 season) push 2030 up.
 */
function setCap(state: GameState): void {
  const rng = rngFor(state.seed, `cap${NEXT}`);
  const sd = NEXT === 2027 ? 0.012 : 0.02;
  const media = NEXT === 2030 ? 0.03 + rng() * 0.05 : 0;
  const cap = Math.round((projectedCap(NEXT) * (1 + media + Math.max(-0.05, Math.min(0.05, gaussian(rng) * sd)))) / 100_000) * 100_000;
  const league = (state.league ??= { caps: {} });
  league.caps[NEXT] = cap;
  invalidateMarket(state);
  const diff = cap - projectedCap(NEXT);
  if (media) news(state, "The league's new national media deals kick in: rights fees jump, and so does the cap");
  news(state, `The league sets the ${NEXT} salary cap at ${money(cap)}, ${money(Math.abs(diff))} ${diff >= 0 ? "above" : "below"} projections`);
  const space = capSummary(state, state.userTeam, NEXT);
  send(state, "league", "League Office", `${NEXT} salary cap: ${money(cap)}`,
    `The ${NEXT} cap is ${money(cap)} per team. With rollover our adjusted cap is ${money(space.limit)}; ` +
    `we have ${money(space.space)} of room under the Top 51 rule before the draft class and any re-signings.`);
}

/**
 * The unrestricted free agents about to hit the market, with the team each
 * would leave: the ones who sign elsewhere this spring count toward next
 * year's compensatory picks.
 */
function recordExpiring(state: GameState): void {
  const league = (state.league ??= { caps: {} });
  const out: Record<string, string> = {};
  for (const t of TEAMS) for (const id of pendingFreeAgents(state, t.id)) if (faClass(id) === "UFA") out[id] = t.id;
  league.expiring = out;
  league.cfaYear = NEXT + 1;
}

/** Expiring deals end, void years accelerate, and the new league year begins. */
function newLeagueYear(state: GameState): void {
  let expired = 0;
  for (const id of Object.keys(state.players)) {
    const ps = state.players[id];
    if (!ps.team || ps.status === "fa") continue;
    const deal = dealOf(state, id);
    const last = lastYear(deal);
    if (last !== null && last >= NEXT) continue;
    const voids = deal?.years.filter((y) => y.void && y.year >= NEXT).reduce((s, y) => s + y.proration, 0) ?? 0;
    addDeadMoney(state, ps.team, NEXT, voids);
    state.contracts[id] = null;
    state.players[id] = { ...ps, team: null, status: "fa", lastTeam: ps.team };
    delete state.players[id].holdout;
    expired++;
  }
  invalidateRosters(state);
  invalidateMarket(state);
  const cap = capSummary(state, state.userTeam);
  news(state, `The ${NEXT} league year begins: ${expired} contracts expire and free agency opens`);
  send(state, "league", "League Office", `The ${NEXT} league year has begun`,
    `Contracts that ran through ${RULES.season} have expired, and void years on them have accelerated onto ${NEXT} caps. ` +
    `Free agents can sign with any team from 4 PM ET today. Our adjusted cap is ${money(cap.limit)} with ${money(cap.space)} in space; ` +
    `${money(cap.dead)} of it is dead money.`);
}

function reminders(state: GameState): void {
  const user = state.userTeam;
  if (state.date === KEY.franchiseTagWindowOpens) {
    const best = pendingFreeAgents(state, user).filter((id) => faClass(id) !== "ERFA")
      .map((id) => ({ id, v: teamValue(state, user, id, NEXT) })).sort((a, b) => b.v - a.v)[0];
    if (best) {
      const p = PLAYER_BY_ID[best.id];
      const cost = tagCost(state, best.id, "franchise");
      send(state, "staff", gmOf(user), "The tag window is open",
        `We can tag one player until ${shortDate(KEY.franchiseTagDeadline)}. The obvious candidate is ${p.name}: the franchise tag would cost ${money(cost)} for ${NEXT}, ` +
        `and I value the player at about ${money(best.v)} a year. ${best.v >= cost * 0.9 ? "I'd consider it if we can't get a long-term deal done first." : "That's more than I think the player is worth to us."} ` +
        "The Contracts page has the numbers for everyone with an expiring deal.");
    }
  }
  if (state.date === addDays(KEY.newLeagueYear, -4)) {
    const restricted = pendingFreeAgents(state, user).filter((id) => faClass(id) !== "UFA" && !off(state).tenders[id]);
    if (restricted.length) {
      send(state, "staff", gmOf(user), "Tender decisions",
        `${restricted.length} of our restricted and exclusive-rights players need a tender by ${shortDate(KEY.newLeagueYear)} or they become unrestricted free agents: ` +
        `${restricted.slice(0, 8).map((id) => PLAYER_BY_ID[id].name).join(", ")}${restricted.length > 8 ? " and others" : ""}. They're on the Contracts page under Our free agents.`);
    }
  }
  if (state.date === addDays(KEY.draftStart, -10)) {
    const opts = teamPlayerIds(state, user).filter((id) => optionInfo(state, id).eligible && !off(state).options[id]);
    for (const id of opts) {
      const info = optionInfo(state, id);
      send(state, "staff", gmOf(user), `Fifth-year option: ${PLAYER_BY_ID[id].name}`,
        `We have until early May to pick up ${PLAYER_BY_ID[id].name}'s fifth-year option for ${info.year}: ${money(info.amount)}, fully guaranteed when exercised. ` +
        `I value the player at about ${money(teamValue(state, user, id, info.year))} a year for that season.`);
    }
  }
}

/** Everything the offseason does on a given day, for every team. */
export function offseasonDaily(state: GameState): void {
  const d = state.date;
  if (d < OFFSEASON_START) return;
  if (d === OFFSEASON_START) {
    startOffseason(state);
    planRetirements(state);
  }
  careersDaily(state);
  if (d === KEY.negotiatingWindowOpens) recordExpiring(state);
  if (d === CAP_SET_DATE) setCap(state);
  if (d === KEY.newLeagueYear) newLeagueYear(state);
  reminders(state);
  if (d >= KEY.franchiseTagWindowOpens && d <= KEY.franchiseTagDeadline) cpuTags(state);
  if (d === CPU_TENDER_DATE) cpuTenders(state);
  cpuCapWork(state);
  if (d === CPU_OPTION_DATE) cpuOptions(state);
}

