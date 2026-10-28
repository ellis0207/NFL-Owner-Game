// Free agency. Every unsigned player is on the market all year: the real
// pool of unsigned veterans when camps open, the players cut at the cutdown
// once they clear waivers, and everyone released after that.
//
// During the season free agents sign one-year deals for the weeks that are
// left, mostly near the minimum: teams sign them to fill injuries, to upgrade
// a weak spot, or for the practice squad. Once a team's season is over it can
// sign reserve/future deals for next year.
//
// From the negotiating window, every team can make offers to every
// unrestricted free agent. Players weigh money, guarantees and length, then
// winning, role, scheme, city and loyalty, and the agent shops the best offer
// to the other bidders. Top players go in the first days; the rest see their
// prices fall the longer they wait. CPU teams bid within their own cap room
// and needs; the owner bids through contract talks.
import { agentFor, agentHidden, changeMorale, changeTrust, priorities, trustOf } from "./agents";
import { capHit, capSummary, invalidateRosters, teamPlayerIds, yearsExpIn } from "./cap";
import { dealCapHit, dealOf, leagueYear, minimumSalary, prorateFirstYear, REG_WEEKS, writeDeal, writeMinimumDeal } from "./contracts";
import { addDays, ageOn, daysBetween, weekday } from "./dates";
import { payCash } from "./finance";
import { gradeDeal } from "./grades";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { capScale, invalidateMarket, marketPrice, marketView, teamValue } from "./market";
import { offerValue, STARTERS, teamQuality } from "./negotiation";
import { faClass, isOffseason, NEXT, off, plannedSpace, tenderCompensation } from "./offseason";
import { gaussian, rngFor } from "./rng";
import { claimView, depthChart, logMove, practiceSquad, releasePlayer, rosterRoom, rosterStatusNow, weakestOnRoster } from "./roster";
import { perceivedAbility, schemeFit, staffEffects, teamStaff } from "./staff";
import type { Deal, FaOffer, FreeAgent, GameState, OfferTerms, Position } from "./types";
import { lockMatchedSheet, transferOwnPick } from "./trades";
import { onWaivers } from "./waivers";

const KEY = RULES.keyDates;

/** Roster depth a front office wants at each position before the draft. */
const DEPTH: Record<Position, number> = { QB: 2, RB: 3, FB: 0, WR: 5, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1 };

export function market(state: GameState): Record<string, FreeAgent> {
  return (state.fa ??= {});
}

export function isMarketOpen(date: string): boolean {
  return date >= KEY.negotiatingWindowOpens;
}

/** Before the league year opens, agreements wait to be signed. */
export function inWindow(date: string): boolean {
  return date >= KEY.negotiatingWindowOpens && date < KEY.newLeagueYear;
}

/**
 * The league year a free agent signs for today: this season until the
 * regular season ends, then next year (reserve/future deals, then free agency).
 */
export function marketYear(date: string): number {
  return date > KEY.regularSeasonEnd && leagueYear(date) === RULES.season ? NEXT : leagueYear(date);
}

/** Camp and the season: the street market, where unsigned players take one-year deals at a discount. */
export function isStreetMarket(date: string): boolean {
  return leagueYear(date) === RULES.season && date <= KEY.regularSeasonEnd;
}

/** Nobody signed them for the full year: in camp and during the season, the street pays a fraction of a market deal. */
export const STREET_SCALE = 0.5;

function minFor(id: string, year: number): number {
  return minimumSalary(yearsExpIn(id, year), year);
}

function minNext(id: string): number {
  return minFor(id, NEXT);
}

function faYear(fa: FreeAgent): number {
  return fa.year ?? NEXT;
}

// ---- Entering the market ----

function enter(state: GameState, id: string, from: string | null): FreeAgent {
  const year = marketYear(state.date);
  const street = isStreetMarket(state.date);
  const price = marketPrice(state, id, year);
  const ah = agentHidden(agentFor(id).id);
  const pr = priorities(id);
  const min = minFor(id, year);
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 27;
  const base = Math.max(min, price.apy * (street ? STREET_SCALE * (age >= 31 ? 0.8 : 1) : 1));
  // What the player will settle for on the open market, before any team's pull.
  const reservation = Math.max(0.72, Math.min(1.05, 0.84 + 0.12 * pr.money + 0.04 * pr.ego - (state.players[id]?.injury?.seasonEnding ? 0.06 : 0)));
  const floor = Math.max(min, base * reservation);
  const fa: FreeAgent = {
    player: id, year, from, since: state.date, status: "open",
    base, floor, floor0: floor,
    ask: Math.max(floor * 1.03, base * (1.04 + 0.14 * ah.aggression + 0.05 * pr.ego + 0.04 * ah.power)),
    askYears: street ? 1 : price.years,
    askGuarantee: Math.max(street ? 0 : 0.03, Math.min(0.8, price.guaranteeShare * (street ? 0.25 : 0.9 + 0.25 * ah.guaranteeFocus))),
    offers: [],
  };
  market(state)[id] = fa;
  return fa;
}

/** The yearly salary a free agent would sign for today (one-year terms), before any team's pull. */
export function freeAgentPrice(state: GameState, id: string): number {
  const fa = market(state)[id];
  if (fa?.status === "open" && faYear(fa) === marketYear(state.date)) return fa.floor;
  if (state.players[id]?.status !== "fa") return Infinity;
  return enter(state, id, state.players[id].lastTeam ?? null).floor;
}

/**
 * Unsigned players are on the market all year (once they clear waivers), and
 * re-price when the year they'd sign for changes. Pending free agents join
 * when the negotiating window opens.
 */
function admit(state: GameState): void {
  const m = market(state);
  const opening = state.date === KEY.negotiatingWindowOpens;
  const year = marketYear(state.date);
  for (const [id, ps] of Object.entries(state.players)) {
    const cur = m[id];
    if (ps.status === "fa") {
      if (onWaivers(state, id)) continue;
      if (!cur || cur.status === "signed") enter(state, id, ps.lastTeam ?? null);
      else if (cur.status === "open" && faYear(cur) !== year) {
        // Nobody signed him all season: the market for next year starts well below his old number.
        const fa = enter(state, id, ps.lastTeam ?? null);
        const min = minFor(id, year);
        fa.base = Math.max(min, fa.base * 0.55);
        fa.floor = fa.floor0 = Math.max(min, fa.floor * 0.55);
        fa.ask = Math.max(fa.floor * 1.03, fa.ask * 0.55);
        fa.askYears = Math.min(fa.askYears, 2);
        fa.since = cur.since;
      }
      continue;
    }
    if (!isMarketOpen(state.date)) continue;
    if (!ps.team) continue;
    const last = dealOf(state, id)?.years.filter((y) => !y.void).pop()?.year ?? null;
    const expiring = last === null || last < NEXT;
    // Re-signed (or tagged) before the league year: off the market.
    if (cur?.status === "open" && !expiring) cur.status = "signed";
    else if (opening && !cur && expiring && faClass(id) === "UFA") enter(state, id, ps.team);
  }
}

// ---- What a team means to a player ----

function cityPref(id: string, team: string): number {
  return Math.max(-1, Math.min(1, gaussian(rngFor(20260728, `city:${id}:${team}`)) * 0.6));
}

/** Would the player start there? Judged the way the public sees players. */
function roleAt(state: GameState, id: string, team: string): number {
  const pos = PLAYER_BY_ID[id].position;
  const n = STARTERS[pos] ?? 1;
  const mine = marketView(state, id);
  const others = teamPlayerIds(state, team)
    .filter((x) => x !== id && PLAYER_BY_ID[x].position === pos && dealCapHit(dealOf(state, x), NEXT) > 0)
    .map((x) => marketView(state, x)).sort((a, b) => b - a);
  return others.length < n || mine > others[n - 1] ? 1 : mine > (others[n] ?? 0) ? 0 : -0.6;
}

/** How much more (or less) a deal from this team is worth to the player than the money alone. */
export function teamPull(state: GameState, id: string, team: string, from: string | null): number {
  const pr = priorities(id);
  const ah = agentHidden(agentFor(id).id);
  const fit = Math.max(-1, Math.min(1, schemeFit(state, id, team) / 4));
  const role = roleAt(state, id, team);
  return 0.06 * pr.winning * (teamQuality(state, team) - 0.5) * 2
    + 0.03 * pr.scheme * fit
    + (0.04 * pr.role + 0.03 * pr.playingTime) * role
    + 0.03 * pr.city * cityPref(id, team)
    + (team === from ? 0.05 * pr.loyalty : 0)
    + 0.05 * ah.memory * (trustOf(state, agentFor(id).id, team) / 100);
}

export function utility(state: GameState, fa: FreeAgent, team: string, t: OfferTerms): number {
  return offerValue(fa, t) * (1 + teamPull(state, fa.player, team, fa.from));
}

/** The best offer from anyone but `except`, in the player's eyes. */
export function bestRival(state: GameState, id: string, except: string): { offer: FaOffer; u: number } | null {
  const fa = market(state)[id];
  if (!fa) return null;
  let best: { offer: FaOffer; u: number } | null = null;
  for (const o of fa.offers) {
    if (o.team === except || o.sheet) continue;
    const u = utility(state, fa, o.team, o.terms);
    if (!best || u > best.u) best = { offer: o, u };
  }
  return best;
}

// ---- Signing ----

function firstYearHit(state: GameState, id: string, team: string, t: OfferTerms): number {
  const deal = writeDeal({ ...t }, { team, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: yearsExpIn(id, NEXT) });
  return dealCapHit(deal, NEXT);
}

/** A free agent's contract from agreed terms, starting in the year the market is signing for. */
function faDeal(state: GameState, id: string, team: string, t: OfferTerms, year: number): Deal {
  const deal = writeDeal({ ...t }, { team, date: state.date, kind: "veteran", firstYear: year, yearsExp: yearsExpIn(id, year) });
  return prorateFirstYear(deal, state.date);
}

/** Cap already promised by a team: window agreements not yet signed. */
export function committed(state: GameState, team: string): number {
  let total = 0;
  for (const fa of Object.values(market(state))) {
    if (fa.status === "agreed" && fa.agreed?.team === team) total += firstYearHit(state, fa.player, team, fa.agreed.terms);
  }
  return total;
}

/**
 * A free agent agrees to terms. In the negotiating window the deal is reported
 * and signed when the league year opens; after that it is signed today.
 */
export function signFreeAgent(state: GameState, id: string, team: string, t: OfferTerms): void {
  const fa = market(state)[id] ?? enter(state, id, state.players[id]?.lastTeam ?? state.players[id]?.team ?? null);
  const p = PLAYER_BY_ID[id];
  const year = isMarketOpen(state.date) ? NEXT : marketYear(state.date);
  const deal = faDeal(state, id, team, t, year);
  const reSigned = fa.from === team;
  const grades = gradeDeal(state, { player: id, team, date: state.date, years: t.years, apy: deal.apy, guaranteed: deal.guaranteedAtSigning, total: deal.total }, year, reSigned);
  state.signings.unshift({
    id: `${state.date}-${id}`, player: id, team, date: state.date, kind: "free-agent",
    years: t.years, total: deal.total, apy: deal.apy, guaranteed: deal.guaranteedAtSigning,
    grades, valueAtSigning: teamValue(state, team, id, year),
  });
  fa.offers = [];
  delete fa.lastLook;
  const verb = inWindow(state.date) ? "agrees to terms with" : reSigned ? "re-signs with" : "signs with";
  if (deal.apy >= 4_000_000 || team === state.userTeam) {
    news(state, `${p.position} ${p.name} ${verb} the ${teamLabel(team)}: ${t.years} year${t.years === 1 ? "" : "s"}, ${money(deal.total)}, ${money(deal.guaranteedAtSigning)} guaranteed`);
  }
  changeMorale(state, id, 6);
  changeTrust(state, agentFor(id).id, team, 4);
  if (inWindow(state.date)) {
    fa.status = "agreed";
    fa.agreed = { team, terms: { ...t }, date: state.date };
  } else install(state, id, team, deal);
  endOtherTalks(state, id, team);
}

/** Anyone else still talking to the player hears it's over. */
function endOtherTalks(state: GameState, id: string, team: string): void {
  const p = PLAYER_BY_ID[id];
  const neg = state.negotiations[id];
  if (neg && neg.status === "open" && neg.team !== team) {
    neg.status = "ended";
    neg.pending = undefined;
    neg.notes.unshift({ date: state.date, text: `${p.name} chose the ${teamLabel(team)}.` });
    if (neg.team === state.userTeam) {
      send(state, "transaction", `${agentFor(id).name}, agent`, `${p.name} signs elsewhere`,
        `${p.name} has decided to sign with the ${teamLabel(team)}. Thank you for your interest.`);
    }
  }
}

function install(state: GameState, id: string, team: string, deal = dealOf(state, id)!): void {
  const fa = market(state)[id];
  state.contracts[id] = deal;
  const ps = state.players[id];
  // After the regular season, deals for next year are reserve/future contracts until the offseason starts.
  const future = !isOffseason(state.date) && deal.years[0]?.year > leagueYear(state.date);
  state.players[id] = { ...ps, team, status: future ? "future" : rosterStatusNow(state) };
  delete state.players[id].lastTeam;
  delete state.players[id].elevations;
  if (state.psPlans) delete state.psPlans[id];
  if (fa) fa.status = "signed";
  countDeparture(state, id, team, deal.apy);
  endOtherTalks(state, id, team);
  payCash(state, team, deal.signingBonus, deal.years[0]?.year ?? NEXT);
  invalidateRosters(state);
  const p = PLAYER_BY_ID[id];
  logMove(state, team, id, future ? "future" : "signed", `signed ${p.position} ${p.name}${future ? " to a reserve/future deal" : ""}`);
}

/** An unrestricted free agent signing elsewhere in the spring counts toward next year's compensatory picks. */
function countDeparture(state: GameState, id: string, team: string, apy: number): void {
  const league = state.league;
  const from = league?.expiring?.[id];
  if (!league || !from || !league.cfaYear) return;
  delete league.expiring![id];
  if (from === team) return;
  ((league.cfa ??= {})[league.cfaYear] ??= []).push({ player: id, from, to: team, apy });
}

/** At 4 PM on the first day of the league year, the window's agreements become contracts. */
function signAgreed(state: GameState): void {
  for (const fa of Object.values(market(state))) {
    if (fa.status !== "agreed" || !fa.agreed) continue;
    const { team, terms } = fa.agreed;
    const deal = writeDeal({ ...terms }, { team, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: yearsExpIn(fa.player, NEXT) });
    install(state, fa.player, team, deal);
  }
  invalidateMarket(state);
}

// ---- The street: camp, the season, and reserve/future deals ----

/**
 * Signs a free agent to a one-year deal at what the player will take today
 * (at least the minimum), for the weeks left in the season. A veteran
 * minimum deal counts like a two-year player's minimum on the cap.
 */
export function signStreetFreeAgent(state: GameState, team: string, id: string, opts: { guaranteedWeeks?: number; salary?: number } = {}): void {
  const year = marketYear(state.date);
  const price = Math.max(minFor(id, year), opts.salary ?? freeAgentPrice(state, id));
  const min = minFor(id, year);
  let deal: Deal;
  if (price <= min * 1.02) {
    deal = writeMinimumDeal(team, state.date, yearsExpIn(id, year), { year });
  } else {
    const total = Math.round(price / 10_000) * 10_000;
    deal = faDeal(state, id, team, { years: 1, total, signingBonus: 0, guaranteed: 0, injuryGuaranteed: 0, voidYears: 0, shape: "flat" }, year);
  }
  if (opts.guaranteedWeeks) {
    const y = deal.years[0];
    y.guaranteed = Math.max(y.guaranteed, Math.round((y.base * opts.guaranteedWeeks) / REG_WEEKS));
    deal.guaranteedAtSigning = Math.max(deal.guaranteedAtSigning, y.guaranteed);
  }
  if (price > min * 1.3) {
    state.signings.unshift({
      id: `${state.date}-${id}`, player: id, team, date: state.date, kind: "free-agent",
      years: 1, total: deal.total, apy: deal.apy, guaranteed: deal.guaranteedAtSigning,
      grades: gradeDeal(state, { player: id, team, date: state.date, years: 1, apy: deal.apy, guaranteed: deal.guaranteedAtSigning, total: deal.total }, year, false),
      valueAtSigning: teamValue(state, team, id, year),
    });
    if (deal.total >= 3_000_000) news(state, `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} signs with the ${teamLabel(team)}: one year, ${money(deal.total)}`);
  }
  changeMorale(state, id, 4);
  install(state, id, team, deal);
}

/** The minimum a free agent can be signed for today, by the year the deal covers. */
export function minimumToday(state: GameState, id: string): number {
  return minFor(id, marketYear(state.date));
}

/**
 * The GM's estimate of what a free agent will cost on a one-year deal: what
 * agents are saying around the league, read as well as the GM reads them.
 */
export function priceEstimate(state: GameState, team: string, id: string): number {
  const price = freeAgentPrice(state, id);
  if (!Number.isFinite(price)) return price;
  const err = gaussian(rngFor(state.seed, `price:${team}:${id}`)) * Math.max(0.03, (100 - staffEffects(team).gmEval) / 400);
  const min = minimumToday(state, id);
  const est = price * (1 + err);
  return est <= min * 1.08 ? min : Math.round(est / 50_000) * 50_000;
}

/** The owner signs a free agent to a one-year minimum deal on the spot, if his agent will take it. */
export function canSignAtMinimum(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  if (state.players[id]?.status !== "fa") return { ok: false, reason: "Not a free agent." };
  if (onWaivers(state, id)) return { ok: false, reason: "On waivers: claim him, or wait until he clears." };
  if (isMarketOpen(state.date)) return { ok: false, reason: "Free agency is open: make an offer through contract talks." };
  const fa = market(state)[id] ?? (freeAgentPrice(state, id), market(state)[id]);
  if (!fa || fa.status !== "open") return { ok: false, reason: "Not available." };
  const year = marketYear(state.date);
  const future = year > leagueYear(state.date);
  if (future && stillPlaying(state, team)) return { ok: false, reason: "Reserve/future deals can be signed once our season is over." };
  if (!future && rosterRoom(state, team) <= 0) return { ok: false, reason: "The roster is full: release someone first." };
  const min = minimumToday(state, id);
  if (state.settings.capRules === "real" && !future && capSummary(state, team).space < min) return { ok: false, reason: "Not enough cap space." };
  if (!streetAccepts(state, team, id, min)) return { ok: false, reason: "His agent wants more than the minimum: open contract talks." };
  return { ok: true };
}

export function signAtMinimum(state: GameState, team: string, id: string): void {
  if (!canSignAtMinimum(state, team, id).ok) return;
  const year = marketYear(state.date);
  if (year > leagueYear(state.date)) {
    install(state, id, team, writeMinimumDeal(team, state.date, yearsExpIn(id, year), { year }));
    return;
  }
  signStreetFreeAgent(state, team, id, { salary: minimumToday(state, id) });
}

/** Would the player sign a one-year deal with this team at this salary today? */
export function streetAccepts(state: GameState, team: string, id: string, salary: number): boolean {
  const fa = market(state)[id];
  if (!fa || fa.status !== "open") return false;
  return salary * (1 + teamPull(state, id, team, fa.from)) >= fa.floor * 0.999;
}

/** During the season, unsigned players' prices drift down week by week. */
function streetDecay(state: GameState): void {
  if (weekday(state.date) !== "Tuesday") return;
  for (const fa of Object.values(market(state))) {
    if (fa.status !== "open") continue;
    const min = minFor(fa.player, faYear(fa));
    fa.floor = Math.max(min, fa.floor * 0.95);
    fa.ask = Math.max(fa.floor * 1.03, fa.ask * 0.96);
  }
}

/**
 * Tuesdays in camp and the season: CPU front offices look over the street for
 * a clear upgrade at a position, and sign one if it fits under the cap.
 */
function cpuStreetSignings(state: GameState): void {
  if (weekday(state.date) !== "Tuesday" || !isStreetMarket(state.date)) return;
  const year = marketYear(state.date);
  const open = Object.values(market(state)).filter((fa) => fa.status === "open" && faYear(fa) === year && !onWaivers(state, fa.player) && state.players[fa.player]?.status === "fa");
  if (!open.length) return;
  // The public's best available: front offices only look hard at the top of the list.
  const board = open.map((fa) => ({ fa, v: marketView(state, fa.player) })).sort((a, b) => b.v - a.v).slice(0, 80);
  for (const t of TEAMS) {
    const team = t.id;
    if (team === state.userTeam) continue;
    const rng = rngFor(state.seed, `street:${team}:${state.date}`);
    if (rng() > 0.35) continue;
    const space = state.settings.capRules === "real" ? capSummary(state, team).space - 2_000_000 : Infinity;
    if (space < 1_000_000) continue;
    const chart = depthChart(state, team);
    let best: { id: string; gain: number; price: number } | null = null;
    for (const { fa } of board) {
      const id = fa.player;
      const pos = PLAYER_BY_ID[id].position;
      const starters = STARTERS[pos] ?? 1;
      const room = chart[pos] ?? [];
      const weakest = room[Math.min(room.length, starters) - 1];
      const gain = claimView(state, team, id) - (weakest ? claimView(state, team, weakest) : 40);
      if (gain < 3 + rng() * 2) continue;
      const price = Math.max(fa.floor, minFor(id, year));
      if (price > space) continue;
      // What the front office will pay for a short-term fix.
      if (price > Math.max(minFor(id, year) * 1.5, teamValue(state, team, id, year) * STREET_SCALE * 1.2)) continue;
      if (!streetAccepts(state, team, id, price)) continue;
      if (!best || gain > best.gain) best = { id, gain, price };
    }
    if (!best) continue;
    if (rosterRoom(state, team) <= 0) {
      const cut = weakestOnRoster(state, team, PLAYER_BY_ID[best.id].position);
      if (!cut) continue;
      releasePlayer(state, cut);
    }
    signStreetFreeAgent(state, team, best.id);
  }
}

/**
 * Before the cutdown, a team that loses a player for the season (or is below
 * 90) signs a camp body at the position.
 */
function cpuCampBodies(state: GameState): void {
  if (state.date >= KEY.rosterCutdown || leagueYear(state.date) !== RULES.season) return;
  for (const t of TEAMS) {
    const team = t.id;
    if (rosterRoom(state, team) <= 1) continue;
    const rng = rngFor(state.seed, `camp:${team}:${state.date}`);
    if (rng() > 0.25) continue;
    const need = needs(state, team, RULES.season);
    const pos = (Object.entries(need) as [Position, Need][])
      .map(([pos, n]) => ({ pos, gap: n.depth + 2 - n.have })).sort((a, b) => b.gap - a.gap)[0]?.pos;
    if (!pos) continue;
    const pick = Object.values(market(state))
      .filter((fa) => fa.status === "open" && PLAYER_BY_ID[fa.player].position === pos && state.players[fa.player]?.status === "fa" && !onWaivers(state, fa.player) && fa.floor <= minFor(fa.player, RULES.season) * 1.05)
      .map((fa) => ({ id: fa.player, v: claimView(state, team, fa.player) + rng() * 3 }))
      .sort((a, b) => b.v - a.v)[0];
    if (!pick) continue;
    signStreetFreeAgent(state, team, pick.id);
    if (team === state.userTeam) {
      send(state, "transaction", gmName(state), "Camp signing",
        `With an open spot on the 90 I signed ${pos} ${PLAYER_BY_ID[pick.id].name} to a one-year minimum deal for depth in camp.`);
    }
  }
}

/** Reserve/future deals: once its season is over, a team signs players for next year from the street. */
function cpuFutures(state: GameState): void {
  if (state.date < KEY.reserveFutureSigningsOpen || state.date >= KEY.newLeagueYear) return;
  for (const t of TEAMS) {
    const team = t.id;
    if (team === state.userTeam || stillPlaying(state, team)) continue;
    const rng = rngFor(state.seed, `futures:${team}:${state.date}`);
    if (rng() > 0.3) continue;
    // Most reserve/future deals go to a team's own practice squad (about three in four stay on); the street tops it up.
    const futures = teamPlayerIds(state, team).filter((id) => {
      const d = dealOf(state, id);
      return state.players[id].status === "future" || (d?.kind === "minimum" && d.signed > KEY.regularSeasonEnd && d.years[0]?.year === NEXT);
    }).length;
    const target = 9 + Math.floor(rngFor(state.seed, `futures-target:${team}`)() * 5);
    if (futures + 0.75 * practiceSquad(state, team).length >= target) continue;
    const pick = Object.values(market(state))
      .filter((fa) => fa.status === "open" && state.players[fa.player]?.status === "fa" && !onWaivers(state, fa.player) && fa.floor <= minNext(fa.player) * 1.05 && PLAYER_BY_ID[fa.player].yearsExp <= 4)
      .map((fa) => ({ id: fa.player, v: claimView(state, team, fa.player) + rng() * 4 }))
      .sort((a, b) => b.v - a.v)[0];
    if (!pick) continue;
    install(state, pick.id, team, writeMinimumDeal(team, state.date, yearsExpIn(pick.id, NEXT), { year: NEXT }));
  }
}

/** Teams still alive in the playoffs (or the regular season). */
export function stillPlaying(state: GameState, team: string): boolean {
  if (state.date <= KEY.regularSeasonEnd) return true;
  if (isOffseason(state.date)) return false;
  const seeds = state.seeds;
  if (!seeds || ![...seeds.AFC, ...seeds.NFC].includes(team)) return false;
  for (const [gid, m] of Object.entries(state.playoffTeams)) {
    const r = state.results[gid];
    if (!r || (m.away !== team && m.home !== team)) continue;
    if ((r.home === team) !== (r.homeScore > r.awayScore)) return false;
  }
  return true;
}

// ---- CPU teams ----

interface Need { have: number; starters: number; depth: number; starterView: number }

function needs(state: GameState, team: string, year = NEXT): Record<string, Need> {
  const eye = staffEffects(team).gmEval;
  const byPos: Record<string, number[]> = {};
  for (const id of teamPlayerIds(state, team)) {
    if (capHit(id, year, state) <= 0 && dealOf(state, id)?.years.every((y) => y.year < year)) continue;
    (byPos[PLAYER_BY_ID[id].position] ??= []).push(perceivedAbility(state, id, `gm:${team}`, eye));
  }
  for (const fa of Object.values(market(state))) {
    if (fa.status === "agreed" && fa.agreed?.team === team) (byPos[PLAYER_BY_ID[fa.player].position] ??= []).push(perceivedAbility(state, fa.player, `gm:${team}`, eye));
  }
  const out: Record<string, Need> = {};
  for (const pos of Object.keys(DEPTH) as Position[]) {
    const views = (byPos[pos] ?? []).sort((a, b) => b - a);
    const starters = STARTERS[pos] ?? 1;
    out[pos] = { have: views.length, starters, depth: DEPTH[pos], starterView: views[starters - 1] ?? 0 };
  }
  return out;
}

function offerTerms(state: GameState, fa: FreeAgent, apy: number, rng: () => number): OfferTerms {
  const age = ageOn(PLAYER_BY_ID[fa.player].birthDate, state.date) ?? 27;
  let years = Math.max(1, Math.round(fa.askYears + (rng() < 0.3 ? -1 : 0)));
  if (age >= 31) years = Math.min(years, 2);
  if (apy < 2_500_000) years = Math.min(years, 2);
  const total = Math.round((apy * years) / 50_000) * 50_000;
  const gShare = Math.min(0.75, marketPrice(state, fa.player, NEXT).guaranteeShare * (0.85 + 0.2 * rng()));
  const guaranteed = Math.round((gShare * total) / 50_000) * 50_000;
  const signingBonus = Math.round((Math.min(guaranteed, total * 0.3)) / 50_000) * 50_000;
  return { years, total, signingBonus, guaranteed: Math.max(guaranteed, signingBonus), injuryGuaranteed: 0, voidYears: 0, shape: "rising" };
}

function cpuBids(state: GameState, day: number): void {
  const m = market(state);
  const open = Object.values(m).filter((fa) => fa.status === "open" && fa.base >= minNext(fa.player) * 1.4 && !(fa.lastLook && fa.lastLook.until >= state.date));
  if (!open.length) return;
  const perTeam = day <= 1 ? 3 : day <= 6 ? 2 : 1;
  const active = day <= 6 ? 1 : Math.max(0.25, 0.6 - day * 0.01);
  // Amounts in later years follow the cap.
  const least = 1_500_000 * capScale(state, NEXT);
  for (const t of TEAMS) {
    const team = t.id;
    if (team === state.userTeam) continue;
    const rng = rngFor(state.seed, `fa-bid:${team}:${state.date}`);
    if (rng() > active) continue;
    // Offers already out count against the budget.
    let budget = plannedSpace(state, team) - committed(state, team) - 2 * least;
    for (const fa of open) for (const o of fa.offers) if (o.team === team) budget -= o.hit;
    if (budget < least) continue;
    const need = needs(state, team);
    const eye = staffEffects(team).gmEval;
    const aggr = Math.min(1, Math.max(0, budget / (40 * least))) * 0.5 + rngFor(state.seed, `fa-aggr:${team}`)() * 0.5;
    const scored = open.map((fa) => {
      const pos = PLAYER_BY_ID[fa.player].position;
      const n = need[pos];
      if (!n) return null;
      // Only players the budget can reach (a rising deal's first year runs under its average).
      if (fa.floor * 0.7 > budget && !fa.offers.some((o) => o.team === team)) return null;
      const view = perceivedAbility(state, fa.player, `gm:${team}`, eye);
      const upgrade = view - n.starterView;
      // A clear upgrade on a starter is always worth a call; depth only when the room is thin.
      if (upgrade <= 1 && n.have >= n.depth) return null;
      const weight = n.have < n.starters ? 1.6 : upgrade > 1 ? 1 + Math.min(0.8, upgrade / 12) : n.have < n.depth ? 0.45 : 0.15;
      // Nobody chases a player whose price is past what they think he's worth.
      const v = teamValue(state, team, fa.player, NEXT);
      if (v * 1.15 < fa.floor) return null;
      return { fa, weight, v };
    }).filter((x): x is { fa: FreeAgent; weight: number; v: number } => !!x)
      .sort((a, b) => b.v * b.weight - a.v * a.weight)
      .slice(0, 8);
    let made = 0;
    for (const { fa, weight, v } of scored) {
      if (made >= perTeam || budget < least) break;
      if (weight < 0.4 && rng() > 0.25) continue;
      // The first days of free agency run hot: teams stretch to land their targets.
      const max = v * (0.95 + 0.2 * aggr + (day <= 3 ? 0.06 : 0)) * (weight >= 1 ? 1 : 0.9);
      const mine = fa.offers.find((o) => o.team === team);
      const rival = bestRival(state, fa.player, team);
      let apy: number;
      if (mine) {
        // The agent tells every bidder roughly where the top offer stands, and a lone bidder that it isn't enough yet.
        const u = utility(state, fa, team, mine.terms);
        if (rival && rival.u > u) {
          if (rng() > 0.65) continue;
          apy = Math.min(max, rival.offer.apy * (1.03 + 0.04 * rng()));
        } else if (!rival && u < fa.floor && day >= 1) {
          if (rng() > 0.5) continue;
          apy = Math.min(max, mine.apy * (1.04 + 0.04 * rng()));
        } else continue;
        if (apy <= mine.apy * 1.01) continue;
      } else {
        // In the first days teams open near the market to get in the door.
        const open0 = day <= 2 ? 0.95 + 0.1 * rng() : 0.88 + 0.12 * rng();
        apy = rival ? Math.min(max, rival.offer.apy * (1.02 + 0.05 * rng())) : Math.min(max, fa.base * open0);
        if (apy < minNext(fa.player) * 1.1) continue;
      }
      const terms = offerTerms(state, fa, apy, rng);
      const hit = firstYearHit(state, fa.player, team, terms);
      if (hit > budget + (mine?.hit ?? 0)) continue;
      fa.offers = fa.offers.filter((o) => o.team !== team);
      fa.offers.push({ team, terms, apy: terms.total / terms.years, hit, date: state.date });
      budget -= hit - (mine?.hit ?? 0);
      made++;
    }
  }
}

// ---- The players decide ----

function decide(state: GameState, day: number): void {
  const user = state.userTeam;
  for (const fa of Object.values(market(state))) {
    if (fa.status !== "open") continue;
    if (fa.lastLook && fa.lastLook.until >= state.date) continue;
    // Teams move on from offers that sit for a week.
    fa.offers = fa.offers.filter((o) => daysBetween(o.date, state.date) <= 7);
    if (!fa.offers.length) continue;
    let best: { o: FaOffer; u: number } | null = null;
    for (const o of fa.offers) {
      if (o.sheet) continue;
      const u = utility(state, fa, o.team, o.terms);
      if (!best || u > best.u) best = { o, u };
    }
    if (!best) continue;
    const rng = rngFor(state.seed, `fa-decide:${fa.player}:${state.date}`);
    const onMarket = daysBetween(fa.since, state.date);
    // The best players let the bidding run a day or two.
    const wait = fa.base >= 15_000_000 ? 1 + (rng() < 0.5 ? 1 : 0) : fa.base >= 6_000_000 ? (rng() < 0.5 ? 1 : 0) : 0;
    const good = best.u >= fa.ask * 0.985;
    const fair = best.u >= fa.floor && onMarket >= wait && (fa.offers.length === 1 || day >= 1 || rng() < 0.5);
    if (!good && !fair) continue;
    if (onMarket < wait && fa.offers.length > 1 && day < 2) continue;
    // If the owner is in talks and close, the agent gives one last look.
    const neg = state.negotiations[fa.player];
    if (neg && neg.status === "open" && neg.team === user && best.o.team !== user && !fa.lastLook) {
      const ours = [...neg.rounds].reverse().find((r) => r.from === "team");
      const close = ours && utility(state, fa, user, ours.terms) >= best.u * 0.9;
      const ah = agentHidden(agentFor(fa.player).id);
      if (close || ah.memory > 0.6 || trustOf(state, agentFor(fa.player).id, user) > 10) {
        fa.lastLook = { until: addDays(state.date, 1), apy: best.o.apy, team: best.o.team };
        const reported = best.o.apy * (1 + Math.abs(gaussian(rng)) * (agentFor(fa.player).style === "leaker" ? 0.08 : 0.03));
        send(state, "transaction", `${agentFor(fa.player).name}, agent`, `${PLAYER_BY_ID[fa.player].name}: last look`,
          `${PLAYER_BY_ID[fa.player].name} has an offer from another team worth about ${money(reported)} a year. ` +
          "Out of respect for our talks I'm giving you until tomorrow to make your best offer.");
        neg.notes.unshift({ date: state.date, text: `The agent says there's an offer elsewhere around ${money(reported)} a year; we have until tomorrow.` });
        continue;
      }
    }
    signFreeAgent(state, fa.player, best.o.team, best.o.terms);
  }
}

/** Prices fall for players nobody is paying. */
function decay(state: GameState): void {
  for (const fa of Object.values(market(state))) {
    if (fa.status !== "open") continue;
    const onMarket = daysBetween(fa.since, state.date);
    if (onMarket < 2) continue;
    const min = minNext(fa.player);
    const slow = fa.offers.length ? 0.4 : 1;
    fa.ask = Math.max(fa.floor * 1.02, fa.ask * (1 - 0.025 * slow));
    if (onMarket >= 3) fa.floor = Math.max(min, Math.max(fa.base * 0.4, fa.floor * (1 - 0.015 * slow)));
  }
}

/** Teams fill out the roster with minimum deals once the big money is spent. */
function fillRosters(state: GameState): void {
  const start = addDays(KEY.newLeagueYear, 4);
  if (state.date < start) return;
  const progress = Math.min(1, daysBetween(start, state.date) / Math.max(1, daysBetween(start, KEY.draftStart)));
  const target = Math.round(58 + 16 * progress);
  const pool = Object.values(market(state)).filter((fa) => fa.status === "open" && fa.ask <= Math.max(minNext(fa.player) * 1.35, 1_500_000 * capScale(state, NEXT)));
  if (!pool.length) return;
  for (const t of TEAMS) {
    const team = t.id;
    const user = team === state.userTeam;
    const count = teamPlayerIds(state, team).length;
    if (count >= target) continue;
    // A team still getting under the cap doesn't add bodies it would have to cut.
    if (!user && state.settings.capRules === "real" && capSummary(state, team).space < 0) continue;
    const signed: string[] = [];
    const need = needs(state, team);
    const eye = staffEffects(team).gmEval;
    const rng = rngFor(state.seed, `fill:${team}:${state.date}`);
    for (let k = 0; k < Math.min(2, target - count); k++) {
      const pick = pool.filter((fa) => fa.status === "open")
        .map((fa) => {
          const n = need[PLAYER_BY_ID[fa.player].position];
          const gap = n ? Math.max(0, n.depth - n.have) : 0;
          return { fa, score: perceivedAbility(state, fa.player, `gm:${team}`, eye) + gap * 4 + rng() * 3 };
        })
        .sort((a, b) => b.score - a.score)[0];
      if (!pick) break;
      const id = pick.fa.player;
      const deal = writeMinimumDeal(team, state.date, yearsExpIn(id, NEXT));
      install(state, id, team, deal);
      need[PLAYER_BY_ID[id].position].have++;
      signed.push(id);
    }
    // Our GM handles depth signings at the minimum and tells the owner.
    if (user && signed.length) {
      send(state, "transaction", gmName(state), signed.length === 1 ? "Depth signing" : "Depth signings",
        `To fill out the offseason roster I signed ${signed.map((id) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name}`).join(" and ")} to a one-year minimum deal${signed.length === 1 ? "" : "s"}.`);
    }
  }
}

// ---- Offer sheets ----

/** Rarely, a team signs another team's restricted free agent to an offer sheet. */
function cpuOfferSheets(state: GameState): void {
  if (state.date < KEY.newLeagueYear) return;
  const o = off(state);
  for (const [id, tender] of Object.entries(o.tenders)) {
    if (tender.level === "erfa" || tender.level === "first" || o.sheets.some((s) => s.player === id)) continue;
    if (state.players[id]?.team !== tender.team) continue;
    const rng = rngFor(state.seed, `sheet:${id}:${state.date}`);
    if (rng() > 0.02) continue;
    const bidder = TEAMS.map((t) => t.id).filter((t) => t !== tender.team && t !== state.userTeam)
      .map((t) => ({ t, v: teamValue(state, t, id, NEXT), space: plannedSpace(state, t) - committed(state, t) }))
      .filter((x) => x.v >= tender.amount * 1.8 && x.space > x.v)
      .sort((a, b) => b.v - a.v)[0];
    if (!bidder) continue;
    const fa = market(state)[id] ?? enter(state, id, tender.team);
    fa.status = "open";
    const terms = offerTerms(state, fa, bidder.v * 0.95, rng);
    if (terms.total / terms.years < Math.max(fa.floor, tender.amount * 1.3)) continue;
    o.sheets.push({
      player: id, from: tender.team, to: bidder.t, terms, date: state.date, decideBy: addDays(state.date, 5),
      compensation: tenderCompensation(id, tender.level),
    });
    const p = PLAYER_BY_ID[id];
    news(state, `${p.name} signs an offer sheet with the ${teamLabel(bidder.t)}; the ${teamLabel(tender.team)} have five days to match`);
    if (tender.team === state.userTeam) {
      send(state, "transaction", gmName(state), `Offer sheet: ${p.name}`,
        `${p.name} signed an offer sheet with the ${teamLabel(bidder.t)}: ${terms.years} years, ${money(terms.total)}, ${money(terms.guaranteed)} guaranteed. ` +
        `We have until ${addDays(state.date, 5)} to match on the Contracts page. If we don't, ` +
        (tenderCompensation(id, tender.level) ? `we get their ${compLabel(tenderCompensation(id, tender.level)!)} pick.` : "we get nothing back."));
    }
  }
}

export function compLabel(c: string): string {
  return c === "first" ? "first-round" : c === "second" ? "second-round" : `round ${c.replace("round", "")}`;
}

function gmName(state: GameState): string {
  const gm = teamStaff(state.userTeam).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

export function resolveSheet(state: GameState, player: string, match: boolean): void {
  const o = off(state);
  const sheet = o.sheets.find((s) => s.player === player);
  if (!sheet) return;
  o.sheets = o.sheets.filter((s) => s !== sheet);
  delete o.tenders[player];
  const team = match ? sheet.from : sheet.to;
  const p = PLAYER_BY_ID[player];
  const deal = writeDeal({ ...sheet.terms }, { team, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: yearsExpIn(player, NEXT) });
  install(state, player, team, deal);
  if (!match && sheet.compensation) {
    // The signing team's own pick in this year's draft goes to the old team.
    const round = sheet.compensation === "first" ? 1 : sheet.compensation === "second" ? 2 : Number(sheet.compensation.replace("round", ""));
    if (!transferOwnPick(state, NEXT, round, sheet.to, sheet.from)) o.picksOwed.push({ from: sheet.to, to: sheet.from, pick: sheet.compensation, player });
  }
  if (match) lockMatchedSheet(state, player, sheet.to);
  news(state, match
    ? `The ${teamLabel(sheet.from)} match the offer sheet and keep ${p.name}`
    : `The ${teamLabel(sheet.from)} decline to match; ${p.name} joins the ${teamLabel(sheet.to)}${sheet.compensation ? ` for a ${compLabel(sheet.compensation)} pick` : ""}`);
}

function sheetsDue(state: GameState): void {
  for (const s of [...off(state).sheets]) {
    if (s.from === state.userTeam) {
      if (state.date >= s.decideBy) resolveSheet(state, s.player, false);
      continue;
    }
    if (state.date < addDays(s.date, 2)) continue;
    const v = teamValue(state, s.from, s.player, NEXT);
    const apy = s.terms.total / s.terms.years;
    resolveSheet(state, s.player, v >= apy * 0.95 && plannedSpace(state, s.from) > apy);
  }
}

// ---- Reports ----

/** What the public hears: interest in the top free agents. */
function rumors(state: GameState): void {
  const rng = rngFor(state.seed, `fa-rumor:${state.date}`);
  for (const fa of Object.values(market(state))) {
    if (fa.status !== "open" || fa.base < 10_000_000 || fa.offers.length < 2 || rng() > 0.35) continue;
    const teams = fa.offers.map((o) => teamLabel(o.team));
    news(state, `Report: ${PLAYER_BY_ID[fa.player].name} is drawing interest from the ${teams.slice(0, 3).join(", the ")}${teams.length > 3 ? " and others" : ""}`);
  }
}

/** The agent's account of the market for a player, to a team asking. Rounded, and sometimes spun. */
export function interestReport(state: GameState, id: string, team: string): string {
  const fa = market(state)[id];
  if (!fa || fa.status !== "open") return "";
  const n = fa.offers.filter((o) => o.team !== team).length;
  const agent = agentFor(id);
  const leaker = agent.style === "leaker" || agent.style === "hardball";
  const said = leaker ? Math.max(n, n + 1 + (n === 0 ? 1 : 0)) : n;
  if (!said) return `${agent.name} says several teams have called but nobody has made an offer yet.`;
  const rival = bestRival(state, id, team);
  const top = rival ? rival.offer.apy * (leaker ? 1.08 : 1.02) : 0;
  return `${agent.name} says ${said === 1 ? "one other team has" : `${said} other teams have`} made offers${top ? `, the best around ${money(Math.round(top / 100_000) * 100_000)} a year` : ""}.`;
}

// ---- Each day ----

export function faDaily(state: GameState): void {
  if (state.date >= KEY.draftStart) return;
  if (!isMarketOpen(state.date)) {
    admit(state);
    if (isStreetMarket(state.date)) {
      streetDecay(state);
      cpuCampBodies(state);
      cpuStreetSignings(state);
    }
    cpuFutures(state);
    return;
  }
  const day = daysBetween(KEY.negotiatingWindowOpens, state.date);
  if (state.date === KEY.newLeagueYear) signAgreed(state);
  admit(state);
  cpuBids(state, day);
  decide(state, day);
  decay(state);
  fillRosters(state);
  cpuOfferSheets(state);
  sheetsDue(state);
  rumors(state);
  invalidateMarket(state);
}

