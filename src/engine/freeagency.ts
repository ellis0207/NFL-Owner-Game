// Free agency. From the negotiating window, every team can make offers to
// every unrestricted free agent. Players weigh money, guarantees and length,
// then winning, role, scheme, city and loyalty, and the agent shops the best
// offer to the other bidders. Top players go in the first days; the rest see
// their prices fall the longer they wait. CPU teams bid within their own cap
// room and needs; the owner bids through contract talks.
import { agentFor, agentHidden, changeMorale, changeTrust, priorities, trustOf } from "./agents";
import { capHit, invalidateRosters, teamPlayerIds, yearsExpIn } from "./cap";
import { dealCapHit, dealOf, minimumSalary, writeDeal, writeMinimumDeal } from "./contracts";
import { addDays, ageOn, daysBetween } from "./dates";
import { payCash } from "./finance";
import { gradeDeal } from "./grades";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { invalidateMarket, marketPrice, marketView, teamValue } from "./market";
import { offerValue, STARTERS, teamQuality } from "./negotiation";
import { faClass, NEXT, off, plannedSpace, tenderCompensation } from "./offseason";
import { gaussian, rngFor } from "./rng";
import { perceivedAbility, schemeFit, staffEffects, teamStaff } from "./staff";
import type { FaOffer, FreeAgent, GameState, OfferTerms, Position } from "./types";

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

function minNext(id: string): number {
  return minimumSalary(yearsExpIn(id, NEXT), NEXT);
}

// ---- Entering the market ----

function enter(state: GameState, id: string, from: string | null): FreeAgent {
  const price = marketPrice(state, id, NEXT);
  const ah = agentHidden(agentFor(id).id);
  const pr = priorities(id);
  const min = minNext(id);
  const base = Math.max(min, price.apy);
  // What the player will settle for on the open market, before any team's pull.
  const reservation = Math.max(0.72, Math.min(1.05, 0.84 + 0.12 * pr.money + 0.04 * pr.ego - (state.players[id]?.injury?.seasonEnding ? 0.06 : 0)));
  const floor = Math.max(min, base * reservation);
  const fa: FreeAgent = {
    player: id, from, since: state.date, status: "open",
    base, floor, floor0: floor,
    ask: Math.max(floor * 1.03, base * (1.04 + 0.14 * ah.aggression + 0.05 * pr.ego + 0.04 * ah.power)),
    askYears: price.years,
    askGuarantee: Math.max(0.03, Math.min(0.8, price.guaranteeShare * (0.9 + 0.25 * ah.guaranteeFocus))),
    offers: [],
  };
  market(state)[id] = fa;
  return fa;
}

/** Pending free agents enter the market when the window opens; released players whenever they're cut. */
function admit(state: GameState): void {
  const m = market(state);
  const opening = state.date === KEY.negotiatingWindowOpens;
  for (const [id, ps] of Object.entries(state.players)) {
    const cur = m[id];
    if (ps.status === "fa") {
      if (!cur || cur.status === "signed") enter(state, id, ps.lastTeam ?? null);
      continue;
    }
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
  const deal = writeDeal({ ...t }, { team, date: state.date, kind: "veteran", firstYear: NEXT, yearsExp: yearsExpIn(id, NEXT) });
  const reSigned = fa.from === team;
  const grades = gradeDeal(state, { player: id, team, date: state.date, years: t.years, apy: deal.apy, guaranteed: deal.guaranteedAtSigning, total: deal.total }, NEXT, reSigned);
  state.signings.unshift({
    id: `${state.date}-${id}`, player: id, team, date: state.date, kind: "free-agent",
    years: t.years, total: deal.total, apy: deal.apy, guaranteed: deal.guaranteedAtSigning,
    grades, valueAtSigning: teamValue(state, team, id, NEXT),
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
  // Anyone else still talking to the player hears it's over.
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
  state.players[id] = { ...ps, team, status: "camp" };
  delete state.players[id].lastTeam;
  if (fa) fa.status = "signed";
  payCash(state, team, deal.signingBonus, NEXT);
  invalidateRosters(state);
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

// ---- CPU teams ----

interface Need { have: number; starters: number; depth: number; starterView: number }

function needs(state: GameState, team: string): Record<string, Need> {
  const eye = staffEffects(team).gmEval;
  const byPos: Record<string, number[]> = {};
  for (const id of teamPlayerIds(state, team)) {
    if (capHit(id, NEXT, state) <= 0 && dealOf(state, id)?.years.every((y) => y.year < NEXT)) continue;
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
  const open = Object.values(m).filter((fa) => fa.status === "open" && fa.base >= 1_500_000 && !(fa.lastLook && fa.lastLook.until >= state.date));
  if (!open.length) return;
  const perTeam = day <= 1 ? 3 : day <= 6 ? 2 : 1;
  const active = day <= 6 ? 1 : Math.max(0.25, 0.6 - day * 0.01);
  for (const t of TEAMS) {
    const team = t.id;
    if (team === state.userTeam) continue;
    const rng = rngFor(state.seed, `fa-bid:${team}:${state.date}`);
    if (rng() > active) continue;
    // Offers already out count against the budget.
    let budget = plannedSpace(state, team) - committed(state, team) - 3_000_000;
    for (const fa of open) for (const o of fa.offers) if (o.team === team) budget -= o.hit;
    if (budget < 1_500_000) continue;
    const need = needs(state, team);
    const eye = staffEffects(team).gmEval;
    const aggr = Math.min(1, Math.max(0, budget / 60_000_000)) * 0.5 + rngFor(state.seed, `fa-aggr:${team}`)() * 0.5;
    const scored = open.map((fa) => {
      const pos = PLAYER_BY_ID[fa.player].position;
      const n = need[pos];
      if (!n) return null;
      const view = perceivedAbility(state, fa.player, `gm:${team}`, eye);
      const upgrade = view - n.starterView;
      // A clear upgrade on a starter is always worth a call; depth only when the room is thin.
      if (upgrade <= 1 && n.have >= n.depth) return null;
      const weight = n.have < n.starters ? 1.6 : upgrade > 1 ? 1 + Math.min(0.8, upgrade / 12) : n.have < n.depth ? 0.45 : 0.15;
      return { fa, weight };
    }).filter((x): x is { fa: FreeAgent; weight: number } => !!x)
      .sort((a, b) => b.fa.base * b.weight - a.fa.base * a.weight)
      .slice(0, 8);
    let made = 0;
    for (const { fa, weight } of scored) {
      if (made >= perTeam || budget < 1_500_000) break;
      if (weight < 0.4 && rng() > 0.25) continue;
      const v = teamValue(state, team, fa.player, NEXT);
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
  const pool = Object.values(market(state)).filter((fa) => fa.status === "open" && fa.ask <= Math.max(minNext(fa.player) * 1.35, 1_500_000));
  if (!pool.length) return;
  for (const t of TEAMS) {
    const team = t.id;
    const user = team === state.userTeam;
    const count = teamPlayerIds(state, team).length;
    if (count >= target) continue;
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
  if (!match && sheet.compensation) o.picksOwed.push({ from: sheet.to, to: sheet.from, pick: sheet.compensation, player });
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
  if (!isMarketOpen(state.date) || state.date >= KEY.draftStart) return;
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

