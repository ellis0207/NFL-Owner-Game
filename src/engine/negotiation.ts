// Contract talks. The team (the owner, or the GM on the owner's behalf, or a
// CPU front office) sends offers; the agent answers a day or a few later with
// an acceptance, a counter, or silence. Behind every agent is a hidden floor
// the player won't go below, a hidden ask that comes down as talks go, and a
// limited supply of patience. Every round moves the player's morale and the
// agent's trust in the front office.
import { agentFor, agentHidden, changeMorale, changeTrust, clientsOnTeam, morale, priorities, trustOf, type AgentHidden, type Priorities } from "./agents";
import { capSummary, teamPlayerIds } from "./cap";
import {
  dealCapHit, dealOf, dealYearsLeft, lastYear, leagueYear, writeDeal, writeExtension, type Terms,
} from "./contracts";
import { addDays, ageOn, daysBetween } from "./dates";
import { payCash } from "./finance";
import { gradeDeal } from "./grades";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { invalidateMarket, marketPrice, teamValue } from "./market";
import { gaussian, rngFor } from "./rng";
import { schemeFit, staffEffects, teamStaff } from "./staff";
import { standings } from "./standings";
import { depthChart } from "./roster";
import type { GameState, Mandate, Position, Negotiation, NegotiationKind, OfferTerms, Signing } from "./types";

// ---- Who can be extended ----

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function extensionEligibility(state: GameState, id: string): Eligibility {
  const ps = state.players[id];
  const p = PLAYER_BY_ID[id];
  if (!ps?.team || ps.status === "fa") return { ok: false, reason: "Not under contract." };
  if (ps.status === "ps") return { ok: false, reason: "Practice squad players sign practice squad deals." };
  const deal = dealOf(state, id);
  if (!deal) return { ok: false, reason: "Not under contract." };
  const year = leagueYear(state.date);
  if ((deal.kind === "franchise" || deal.kind === "transition") && state.date > RULES.keyDates.franchiseTagExtensionDeadline) {
    return { ok: false, reason: "Tagged players can't sign a long-term deal after July 15 until the season ends." };
  }
  const left = dealYearsLeft(deal, year);
  if (left > 2) return { ok: false, reason: `Under contract through ${lastYear(deal)}. Too early to extend.` };
  if (deal.kind === "rookie" && p.yearsExp < 3) return { ok: false, reason: "Drafted players can't extend until after their third season." };
  return { ok: true };
}

/** The first league year a new deal would cover. */
export function startYearFor(state: GameState, id: string, kind: NegotiationKind): number {
  if (kind === "free-agent") return leagueYear(state.date);
  const last = lastYear(dealOf(state, id));
  return Math.max(leagueYear(state.date), (last ?? leagueYear(state.date)) + 1);
}

// ---- The agent's position ----

function teamQuality(state: GameState, team: string): number {
  const row = standings(state)[team];
  const g = row ? row.w + row.l + row.t : 0;
  return row ? (row.w + 0.5 * row.t + 2) / (g + 4) : 0.5;
}

interface Stance { base: number; floor: number; ask: number; askYears: number; askGuarantee: number }

function stance(state: GameState, team: string, id: string, startYear: number): Stance {
  const price = marketPrice(state, id, startYear);
  const agent = agentFor(id);
  const ah = agentHidden(agent.id);
  const pr = priorities(id);
  const same = state.players[id]?.team === team;
  const trust = trustOf(state, agent.id, team);
  const fit = Math.max(-1, Math.min(1, schemeFit(state, id, team) / 4));
  const m = morale(state, id);
  let reservation = 0.84 + 0.12 * pr.money + 0.04 * pr.ego
    - (same ? 0.08 * pr.loyalty : 0)
    - 0.06 * pr.winning * (teamQuality(state, team) - 0.5) * 2
    - 0.03 * pr.scheme * fit
    - 0.05 * ah.memory * (trust / 100)
    + (m < 60 ? (60 - m) * 0.004 : -(m - 60) * 0.001);
  // Agents read the papers: a team under public heat over a deal has less room to say no.
  if (team === state.userTeam && same) {
    const heat = Math.max(0, 50 - (state.pressure.fans + state.pressure.media) / 2);
    reservation += heat * 0.0015 * Math.min(1, price.share / 0.08);
  }
  // Security matters to a player coming off an injury.
  if (state.players[id]?.injury?.seasonEnding) reservation -= 0.06;
  reservation = Math.max(0.7, Math.min(1.08, reservation));
  const ask = price.apy * (1.04 + 0.14 * ah.aggression + 0.05 * pr.ego + 0.04 * ah.power);
  return {
    base: price.apy,
    floor: price.apy * reservation,
    ask: Math.max(ask, price.apy * reservation * 1.03),
    askYears: price.years,
    askGuarantee: Math.max(0.03, Math.min(0.8, price.guaranteeShare * (0.9 + 0.25 * ah.guaranteeFocus))),
  };
}

/** What an offer is worth to the player, as an APY-equivalent: money, guarantees, length and structure. */
export function offerValue(neg: Negotiation, t: OfferTerms): number {
  const ah = agentHidden(agentFor(neg.player).id);
  const years = Math.max(1, t.years);
  const apy = t.total / years;
  const g = t.guaranteed + 0.4 * t.injuryGuaranteed;
  const wantG = neg.askGuarantee * t.total;
  const gAdj = ((g - wantG) / years) * (0.3 + 0.5 * ah.guaranteeFocus);
  const yearGap = Math.abs(years - neg.askYears);
  const yearAdj = -yearGap * apy * 0.035;
  const bonusAdj = (t.signingBonus / Math.max(1, t.total)) * apy * 0.04 * (1 + ah.creativity);
  const voidAdj = t.voidYears * apy * (ah.creativity > 0.7 ? 0.01 : 0);
  return apy + gAdj + yearAdj + bonusAdj + voidAdj;
}

/** Terms written the way an agent would write a counter. */
function agentTerms(ah: AgentHidden, apy: number, years: number, gShare: number): OfferTerms {
  const total = Math.round((apy * years) / 50_000) * 50_000;
  const guaranteed = Math.round((gShare * total) / 50_000) * 50_000;
  const sb = Math.round((Math.min(guaranteed, total * (0.18 + 0.25 * ah.creativity) * Math.min(1, gShare * 2)) / 50_000)) * 50_000;
  return {
    years, total, signingBonus: sb, guaranteed: Math.max(guaranteed, sb), injuryGuaranteed: 0,
    voidYears: ah.creativity > 0.85 && years <= 3 && total > 20_000_000 ? 2 : 0, shape: "rising",
  };
}

// ---- Opening and closing ----

export function openTalks(state: GameState, team: string, id: string, kind: NegotiationKind, handler: "owner" | "gm", mandate?: Mandate): Negotiation {
  const existing = state.negotiations[id];
  if (existing?.status === "open" && existing.team === team) return existing;
  const start = startYearFor(state, id, kind);
  const s = stance(state, team, id, start);
  const ah = agentHidden(agentFor(id).id);
  const neg: Negotiation = {
    player: id, team, kind, opened: state.date, status: "open", handler, mandate,
    rounds: [], notes: [],
    floor: s.floor, ask: s.ask, askYears: s.askYears, askGuarantee: s.askGuarantee,
    patience: 3 + Math.round(ah.patience * 5),
    base: s.base,
  };
  // The agent opens with their number.
  neg.rounds.push({ date: state.date, from: "agent", terms: agentTerms(ah, neg.ask, neg.askYears, neg.askGuarantee), note: openingLine(neg) });
  state.negotiations[id] = neg;
  return neg;
}

function openingLine(neg: Negotiation): string {
  const agent = agentFor(neg.player);
  const name = PLAYER_BY_ID[neg.player].name.split(" ").slice(-1)[0];
  const style = agent.style;
  if (style === "hardball") return `${agent.name} says ${name} knows exactly what the market is and won't take a discount.`;
  if (style === "relationship") return `${agent.name} says ${name} wants to be here and believes a fair deal is close.`;
  if (style === "guarantees") return `${agent.name} says the guaranteed money matters more to them than the headline number.`;
  if (style === "deadline") return `${agent.name} says there's no rush on their end.`;
  if (style === "creative") return `${agent.name} says they're open to structure that helps your cap.`;
  if (style === "leaker") return `${agent.name} says there's plenty of interest in ${name} around the league.`;
  return `${agent.name} lays out what they think ${name} is worth.`;
}

/** The owner (or GM) walks away. */
export function endTalks(state: GameState, id: string, why = "We ended talks."): void {
  const neg = state.negotiations[id];
  if (!neg || neg.status !== "open") return;
  neg.status = "ended";
  neg.pending = undefined;
  note(neg, state.date, why);
  const pr = priorities(id);
  changeMorale(state, id, -(3 + 6 * pr.ego));
  changeTrust(state, agentFor(id).id, neg.team, -4);
}

function note(neg: Negotiation, date: string, text: string): void {
  neg.notes.unshift({ date, text });
}

// ---- Offers ----

export interface OfferCheck {
  ok: boolean;
  reason?: string;
  /** Change to this league year's cap hit if signed today. */
  capChange: number;
  /** Cash due at signing (the signing bonus). */
  cashNow: number;
}

/** What signing these terms would do, and whether the team can do it. */
export function checkOffer(state: GameState, neg: Negotiation, t: OfferTerms): OfferCheck {
  if (t.years < 1 || t.years > 7) return { ok: false, reason: "Contracts run one to seven years.", capChange: 0, cashNow: 0 };
  if (t.total <= 0) return { ok: false, reason: "Enter the contract's total value.", capChange: 0, cashNow: 0 };
  if (t.signingBonus > t.total) return { ok: false, reason: "The signing bonus can't exceed the total.", capChange: 0, cashNow: 0 };
  if (t.guaranteed > t.total) return { ok: false, reason: "Guarantees can't exceed the total.", capChange: 0, cashNow: 0 };
  if (t.guaranteed < t.signingBonus) return { ok: false, reason: "The signing bonus is always guaranteed, so guarantees must be at least that much.", capChange: 0, cashNow: 0 };
  if (t.voidYears < 0 || t.voidYears > 4) return { ok: false, reason: "Up to four void years.", capChange: 0, cashNow: 0 };
  const deal = draftDeal(state, neg, t);
  const year = leagueYear(state.date);
  const capChange = dealCapHit(deal, year) - dealCapHit(dealOf(state, neg.player), year);
  if (state.settings.capRules === "real" && capChange > capSummary(state, neg.team).space) {
    return { ok: false, reason: `Not enough cap space: this adds ${money(capChange)} to this year's cap.`, capChange, cashNow: t.signingBonus };
  }
  return { ok: true, capChange, cashNow: t.signingBonus };
}

/** The contract these terms would produce. */
export function draftDeal(state: GameState, neg: Negotiation, t: OfferTerms) {
  const p = PLAYER_BY_ID[neg.player];
  const terms: Terms = { ...t };
  const current = dealOf(state, neg.player);
  if (neg.kind === "extension" && current) return writeExtension(current, terms, state.date, p.yearsExp);
  return writeDeal(terms, { team: neg.team, date: state.date, kind: "veteran", firstYear: startYearFor(state, neg.player, neg.kind), yearsExp: p.yearsExp });
}

/** Sends an offer. The agent answers in a day or a few. */
export function sendOffer(state: GameState, id: string, t: OfferTerms, noteText = ""): OfferCheck {
  const neg = state.negotiations[id];
  if (!neg || neg.status !== "open") return { ok: false, reason: "Talks aren't open.", capChange: 0, cashNow: 0 };
  if (neg.coolingUntil && state.date < neg.coolingUntil) return { ok: false, reason: "The agent isn't taking calls right now.", capChange: 0, cashNow: 0 };
  if (neg.pending) return { ok: false, reason: "We're still waiting on an answer to the last offer.", capChange: 0, cashNow: 0 };
  const check = checkOffer(state, neg, t);
  if (!check.ok) return check;
  neg.rounds.push({ date: state.date, from: "team", terms: { ...t }, note: noteText });
  neg.pending = { ...t };
  const rng = rngFor(state.seed, `reply:${id}:${neg.rounds.length}`);
  const ah = agentHidden(agentFor(id).id);
  neg.replyOn = addDays(state.date, 1 + Math.floor(rng() * (1 + 3 * ah.patience)));
  return check;
}

// ---- The agent's answer ----

function bestTeamValue(neg: Negotiation, exceptLast: boolean): number {
  const team = neg.rounds.filter((r) => r.from === "team");
  const list = exceptLast ? team.slice(0, -1) : team;
  return list.reduce((m, r) => Math.max(m, offerValue(neg, r.terms)), 0);
}

const CONCEDE: Record<string, number> = { steady: 0.45, relationship: 0.5, hardball: 0.2, leaker: 0.35, deadline: 0.15, guarantees: 0.35, creative: 0.4 };

/** How close a deadline is, in days (Week 1 for extensions in camp, the end of the season otherwise). */
function daysToDeadline(state: GameState, neg: Negotiation): number {
  const d = state.date < RULES.keyDates.regularSeasonStart ? RULES.keyDates.regularSeasonStart : RULES.keyDates.regularSeasonEnd;
  return neg.kind === "extension" ? daysBetween(state.date, d) : 30;
}

function respond(state: GameState, neg: Negotiation): void {
  const t = neg.pending!;
  neg.pending = undefined;
  neg.replyOn = undefined;
  const id = neg.player;
  const agent = agentFor(id);
  const ah = agentHidden(agent.id);
  const pr = priorities(id);
  const name = PLAYER_BY_ID[id].name;
  const rng = rngFor(state.seed, `respond:${id}:${neg.rounds.length}`);

  // The market moves during the season: a big year raises the price.
  const fresh = stance(state, neg.team, id, startYearFor(state, id, neg.kind));
  if (Math.abs(fresh.base / neg.base - 1) > 0.03) {
    const scale = fresh.base / neg.base;
    neg.floor *= scale;
    neg.ask *= scale;
    neg.base = fresh.base;
  }

  const v = offerValue(neg, t);
  const prior = bestTeamValue(neg, true);
  const deadline = daysToDeadline(state, neg);
  const urgent = deadline <= 10;

  if (v >= neg.ask * 0.985 || (v >= neg.floor && (neg.ask - v) / neg.ask < 0.025)) {
    agree(state, neg, t);
    return;
  }
  maybeLeak(state, neg, t, v);

  if (v < neg.floor * 0.82) {
    // A lowball: it stings, and some agents stop taking calls for a while.
    changeMorale(state, id, -(3 + 8 * pr.ego) * (1 - 0.5 * pr.loyalty));
    changeTrust(state, agent.id, neg.team, -(4 + 10 * ah.memory));
    neg.patience -= 2;
    if (agent.style === "hardball" || pr.ego > 0.7) neg.coolingUntil = addDays(state.date, 4 + Math.floor(rng() * 8));
    const counter = agentTerms(ah, neg.ask, neg.askYears, neg.askGuarantee);
    neg.rounds.push({ date: state.date, from: "agent", terms: counter, note: `${agent.name} called the offer "not a serious number" and repeated their ask.` });
  } else {
    if (prior && v > prior * 1.03) {
      // A better offer usually lands well, but some read it as a sign there's more.
      if (agent.style === "hardball" || pr.ego > 0.75) neg.ask = Math.max(neg.ask, neg.ask * (1 + 0.01 * rng()));
      else changeMorale(state, id, Math.min(4, (v / prior - 1) * 40 * (0.4 + pr.loyalty)));
      changeTrust(state, agent.id, neg.team, 2);
    }
    let concede = CONCEDE[agent.style] ?? 0.4;
    if (agent.style === "deadline" && urgent) concede = 0.7;
    if (urgent) concede += 0.1;
    concede *= 1 - 0.3 * (staffEffects(neg.team).gmNegotiation - 65) / 35 * (neg.handler === "gm" ? 1 : 0.3);
    const target = Math.max(neg.floor * 1.01, neg.ask - concede * (neg.ask - v));
    neg.ask = target;
    // Meet halfway on length and guarantees.
    neg.askYears = Math.round((neg.askYears + t.years) / 2);
    const offeredG = t.total ? (t.guaranteed + 0.4 * t.injuryGuaranteed) / t.total : 0;
    neg.askGuarantee = Math.max(offeredG, neg.askGuarantee - (neg.askGuarantee - offeredG) * concede * 0.6);
    neg.patience -= 1;
    if (v < neg.floor && neg.patience <= 0) {
      breakOff(state, neg, `${agent.name} says they're too far apart and ${name} will play out the contract.`);
      return;
    }
    const counter = agentTerms(ah, neg.ask, neg.askYears, neg.askGuarantee);
    const close = v >= neg.floor;
    neg.rounds.push({
      date: state.date, from: "agent", terms: counter,
      note: close ? `${agent.name} came down and thinks a deal is within reach.` : `${agent.name} moved a little but says there's still a gap.`,
    });
  }
  if (neg.team === state.userTeam) {
    const from = neg.handler === "gm" ? gmName(state) : agent.name;
    if (neg.handler === "owner") {
      send(state, "transaction", `${agent.name}, agent`, `${name}: counteroffer`,
        `${neg.rounds[neg.rounds.length - 1].note} Their new number is ${money(neg.ask)} a year over ${neg.askYears} years. Details are on the Contracts page.`);
    } else note(neg, state.date, `${from}: ${agent.name} countered at about ${money(neg.ask)} a year. ${moodRead(state, neg)}`);
  }
}

function breakOff(state: GameState, neg: Negotiation, why: string): void {
  neg.status = "ended";
  neg.pending = undefined;
  note(neg, state.date, why);
  const pr = priorities(neg.player);
  changeMorale(state, neg.player, -(6 + 10 * pr.ego));
  changeTrust(state, agentFor(neg.player).id, neg.team, -6);
  if (neg.team === state.userTeam) {
    send(state, "transaction", gmName(state), `Talks with ${PLAYER_BY_ID[neg.player].name} broke off`, why);
    pressureOnBreak(state, neg);
  }
}

function gmName(state: GameState): string {
  const gm = teamStaff(state.userTeam).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

// ---- Media ----

function maybeLeak(state: GameState, neg: Negotiation, t: OfferTerms, v: number): void {
  const agent = agentFor(neg.player);
  const ah = agentHidden(agent.id);
  const rng = rngFor(state.seed, `leak:${neg.player}:${neg.rounds.length}`);
  const lowball = v < neg.floor * 0.9;
  if (rng() > ah.leak * (lowball ? 1.6 : 1)) return;
  const p = PLAYER_BY_ID[neg.player];
  // Leaks are spun: the number reported isn't always the number offered.
  const reported = (t.total / Math.max(1, t.years)) * (1 + gaussian(rng) * 0.08);
  const team = teamLabel(neg.team);
  const text = lowball
    ? `Report: the ${team} offered ${p.name} about ${money(reported)} a year, well short of what the player's camp wants`
    : `Report: ${p.name} and the ${team} are talking; the latest offer is said to be around ${money(reported)} a year`;
  news(state, text);
  if (neg.team === state.userTeam) {
    state.pressure.media = Math.max(0, state.pressure.media - (lowball ? 4 : 1));
    if (lowball) state.pressure.fans = Math.max(0, state.pressure.fans - (p.position === "QB" ? 4 : 2));
    send(state, "media", "Team communications", `Leak: ${p.name} talks are in the news`,
      `${text}. ${agent.name} is known around the league for using the media.`);
  }
}

function pressureOnBreak(state: GameState, neg: Negotiation): void {
  const hc = teamStaff(neg.team).HC;
  const p = PLAYER_BY_ID[neg.player];
  state.pressure.fans = Math.max(0, state.pressure.fans - 3);
  state.pressure.media = Math.max(0, state.pressure.media - 2);
  if (hc) send(state, "staff", `${hc.name}, head coach`, `About ${p.name}`,
    `I heard talks with ${p.name} broke off. ${p.name.split(" ").slice(-1)[0]} is part of what we're building here, and I hope we can find a way back to the table.`);
}

// ---- Signing ----

function agree(state: GameState, neg: Negotiation, t: OfferTerms): void {
  const id = neg.player;
  const p = PLAYER_BY_ID[id];
  const check = checkOffer(state, neg, t);
  if (!check.ok) {
    note(neg, state.date, `They accepted, but we couldn't sign it: ${check.reason}`);
    neg.rounds.push({ date: state.date, from: "agent", terms: t, note: "They'll sign these terms as soon as we can fit them." });
    return;
  }
  const deal = draftDeal(state, neg, t);
  const start = startYearFor(state, id, neg.kind);
  // Graded against the market as it stood before this deal.
  const grades = gradeDeal(state, { player: id, team: neg.team, date: state.date, years: t.years, apy: deal.apy, guaranteed: deal.guaranteedAtSigning, total: deal.total }, start, neg.kind === "extension");
  const valueAtSigning = teamValue(state, neg.team, id, start);
  state.contracts[id] = deal;
  invalidateMarket(state);
  neg.status = "agreed";
  neg.rounds.push({ date: state.date, from: "agent", terms: t, note: "Agreed." });
  payCash(state, neg.team, deal.signingBonus);
  const pr = priorities(id);
  changeMorale(state, id, 8 + 6 * pr.money);
  changeTrust(state, agentFor(id).id, neg.team, 6);
  if (state.players[id].holdout) delete state.players[id].holdout;
  const signing: Signing = {
    id: `${state.date}-${id}`, player: id, team: neg.team, date: state.date, kind: neg.kind,
    years: t.years, total: deal.total, apy: deal.apy, guaranteed: deal.guaranteedAtSigning,
    grades, valueAtSigning,
  };
  state.signings.unshift(signing);
  const what = neg.kind === "extension" ? `${t.years}-year extension` : `${t.years}-year deal`;
  news(state, `${p.name} agrees to a ${what} with the ${teamLabel(neg.team)}: ${money(deal.total)}, ${money(deal.guaranteedAtSigning)} guaranteed`);
  if (neg.team === state.userTeam) {
    state.pressure.fans = Math.min(100, state.pressure.fans + (p.position === "QB" ? 4 : 2));
    const gradeLine = signing.grades.map((g) => `${g.outlet}: ${g.grade}`).join(" · ");
    send(state, "transaction", neg.handler === "gm" ? gmName(state) : `${agentFor(id).name}, agent`, `${p.name} signs a ${what}`,
      `Done: ${t.years} years, ${money(deal.total)} total, ${money(deal.guaranteedAtSigning)} guaranteed at signing, ${money(deal.signingBonus)} signing bonus paid now. ` +
      `This year's cap hit changes by ${money(check.capChange)}. Early grades: ${gradeLine}.`);
  }
}

// ---- The GM at the table ----

/** The GM's read of where talks stand, in words. Only as accurate as the GM's feel for people. */
export function moodRead(state: GameState, neg: Negotiation): string {
  const fx = staffEffects(neg.team);
  const rng = rngFor(state.seed, `mood:${neg.player}:${neg.rounds.length}:${state.date.slice(0, 7)}`);
  const sd = (100 - (fx.gmNegotiation + fx.gmEval) / 2) / 25;
  const last = [...neg.rounds].reverse().find((r) => r.from === "team");
  const closeness = last ? offerValue(neg, last.terms) / neg.floor - 1 + gaussian(rng) * sd * 0.05 : -0.1;
  const m = morale(state, neg.player) + gaussian(rng) * sd * 8;
  const t = trustOf(state, agentFor(neg.player).id, neg.team) + gaussian(rng) * sd * 15;
  const parts: string[] = [];
  parts.push(closeness > 0.02 ? "I think we're close." : closeness > -0.08 ? "There's a gap, but it's bridgeable." : "We're still far apart.");
  parts.push(m >= 75 ? "The player sounds happy here." : m >= 55 ? "The player seems fine with how this is going." : m >= 40 ? "The player is getting frustrated." : "The player is unhappy, and it's starting to show.");
  parts.push(t >= 25 ? "The agent and I have a good working relationship." : t <= -25 ? "The agent doesn't trust us much right now." : "");
  return parts.filter(Boolean).join(" ");
}

/** How a GM (yours on delegation, or a CPU team's) plays a round. */
function gmMove(state: GameState, neg: Negotiation): void {
  if (neg.coolingUntil && state.date < neg.coolingUntil) return;
  const id = neg.player;
  const fx = staffEffects(neg.team);
  const start = startYearFor(state, id, neg.kind);
  const value = teamValue(state, neg.team, id, start);
  const m: Mandate = neg.mandate ?? { goal: "value" };
  if (m.goal === "walk") {
    endTalks(state, id, "We decided to let the player test the market.");
    return;
  }
  const stretch = m.goal === "sign" ? 1.15 : 1.0;
  let limit = value * stretch;
  if (m.maxApy) limit = Math.min(limit, m.maxApy);
  const lastAgent = [...neg.rounds].reverse().find((r) => r.from === "agent")!;
  const lastTeam = [...neg.rounds].reverse().find((r) => r.from === "team");
  const askApy = lastAgent.terms.total / lastAgent.terms.years;
  // Better negotiators open lower and move in smaller steps.
  const skill = (fx.gmNegotiation - 50) / 50;
  let apy: number;
  if (!lastTeam) apy = Math.min(limit, askApy) * (0.84 - 0.06 * skill);
  else {
    const prev = lastTeam.terms.total / lastTeam.terms.years;
    apy = prev + (askApy - prev) * (0.45 - 0.1 * skill);
  }
  if (apy > limit) {
    const prev = lastTeam ? lastTeam.terms.total / lastTeam.terms.years : 0;
    if (prev >= limit * 0.995) {
      endTalks(state, id, `We couldn't get there. Our limit was about ${money(limit)} a year and they wanted ${money(askApy)}.`);
      if (neg.team === state.userTeam) send(state, "transaction", gmName(state), `Talks with ${PLAYER_BY_ID[id].name} ended`,
        `I couldn't get a deal done within what we're willing to pay. They wanted about ${money(askApy)} a year; my limit was ${money(limit)}.`);
      return;
    }
    apy = limit;
  }
  let years = Math.round((lastAgent.terms.years + (lastTeam?.terms.years ?? lastAgent.terms.years - 1)) / 2);
  if (m.maxYears) years = Math.min(years, m.maxYears);
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 27;
  if (age >= 31) years = Math.min(years, 2);
  years = Math.max(1, years);
  const total = Math.round((apy * years) / 50_000) * 50_000;
  const agentG = lastAgent.terms.total ? lastAgent.terms.guaranteed / lastAgent.terms.total : 0.3;
  let gShare = lastTeam ? (lastTeam.terms.guaranteed / lastTeam.terms.total + agentG) / 2 : agentG * 0.75;
  let guaranteed = Math.round((gShare * total) / 50_000) * 50_000;
  if (m.maxGuaranteed) guaranteed = Math.min(guaranteed, m.maxGuaranteed);
  gShare = total ? guaranteed / total : 0;
  // A GM good with the cap uses more signing bonus to keep this year's hit down.
  const sbShare = Math.min(gShare, 0.2 + 0.25 * (fx.capManagement - 50) / 50);
  const signingBonus = Math.round((Math.max(0, sbShare) * total) / 50_000) * 50_000;
  const terms: OfferTerms = { years, total, signingBonus, guaranteed: Math.max(guaranteed, signingBonus), injuryGuaranteed: 0, voidYears: 0, shape: "rising" };
  const check = sendOffer(state, id, terms);
  if (!check.ok) {
    endTalks(state, id, `I couldn't make an offer work: ${check.reason}`);
    return;
  }
  if (neg.team === state.userTeam) note(neg, state.date, `Offered ${years} years, ${money(total)} (${money(apy)} a year), ${money(terms.guaranteed)} guaranteed.`);
}

/** Hand talks to the GM with a mandate, or take them back. */
export function delegate(state: GameState, id: string, mandate: Mandate | null): void {
  const neg = state.negotiations[id];
  if (!neg || neg.status !== "open") return;
  if (mandate) {
    neg.handler = "gm";
    neg.mandate = mandate;
    note(neg, state.date, mandate.goal === "walk" ? "You told me to let the player walk." : `You handed these talks to me: ${mandate.goal === "sign" ? "get it done" : "only at a fair price"}${mandate.maxApy ? `, no more than ${money(mandate.maxApy)} a year` : ""}.`);
  } else {
    neg.handler = "owner";
    note(neg, state.date, "You took these talks back.");
  }
}

// ---- Each day ----

const STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };

/** CPU front offices look at extending their own players. */
function cpuExtensions(state: GameState): void {
  const rng = rngFor(state.seed, `cpu-ext:${state.date}`);
  const year = leagueYear(state.date);
  // Teams do most extensions in camp and early in the season.
  const busy = state.date < addDays(RULES.keyDates.regularSeasonStart, 14) ? 0.05 : state.date < RULES.keyDates.tradeDeadline ? 0.018 : 0.008;
  for (const t of TEAMS) {
    if (t.id === state.userTeam || rng() > busy) continue;
    const candidates = Object.keys(state.players).filter((id) => {
      const ps = state.players[id];
      if (ps.team !== t.id || ps.status === "fa" || ps.status === "ps" || state.negotiations[id]?.status === "open") return false;
      if (state.negotiations[id] && state.negotiations[id].team === t.id && daysBetween(state.negotiations[id].opened, state.date) < 60) return false;
      const deal = dealOf(state, id);
      return !!deal && dealYearsLeft(deal, year) === 1 && extensionEligibility(state, id).ok;
    });
    if (!candidates.length) continue;
    // Teams extend the players they start, not their backups.
    const chart = depthChart(state, t.id);
    const starters = new Set(Object.entries(chart).flatMap(([pos, ids]) => ids.slice(0, STARTERS[pos as Position] ?? 1)));
    const start = year + 1;
    const scored = candidates.filter((id) => starters.has(id)).map((id) => ({ id, v: teamValue(state, t.id, id, start) })).filter((x) => x.v >= 3_000_000).sort((a, b) => b.v - a.v);
    const pick = scored[0];
    if (!pick) continue;
    const ask = marketPrice(state, pick.id, start).apy;
    const goal: Mandate["goal"] = pick.v >= ask * 0.9 ? "sign" : "value";
    openTalks(state, t.id, pick.id, "extension", "gm", { goal });
  }
}

/** Hold-ins and holdouts at camp: veterans who want a new deal before playing on the old one. */
export function startHoldouts(state: GameState): void {
  const year = leagueYear(state.date);
  const starters = new Set<string>();
  for (const t of TEAMS) {
    for (const [pos, ids] of Object.entries(depthChart(state, t.id))) ids.slice(0, STARTERS[pos as Position] ?? 1).forEach((id) => starters.add(id));
  }
  for (const id of Object.keys(state.players)) {
    const ps = state.players[id];
    if (!ps.team || ps.status === "fa" || !starters.has(id)) continue;
    const deal = dealOf(state, id);
    if (!deal || deal.kind === "minimum" || !extensionEligibility(state, id).ok) continue;
    // A deal signed this league year was the player's own choice; nobody holds out over it.
    if (leagueYear(deal.signed) >= year) continue;
    const left = dealYearsLeft(deal, year);
    const price = marketPrice(state, id, year + left);
    if (price.apy < 15_000_000) continue;
    const underpaid = price.apy / Math.max(1, deal.apy);
    if (underpaid < 1.6) continue;
    const pr: Priorities = priorities(id);
    const rng = rngFor(state.seed, `holdout:${id}`);
    const score = 0.5 * pr.money + 0.5 * pr.ego + Math.min(0.4, (underpaid - 1.6) * 0.15) - 0.3 * pr.loyalty;
    if (score < 0.7 || rng() > 0.3) continue;
    ps.holdout = { kind: rng() < 0.15 ? "holdout" : "holdin", since: state.date };
    changeMorale(state, id, -10);
    const p = PLAYER_BY_ID[id];
    const word = ps.holdout.kind === "holdout" ? "is holding out of camp" : "reported to camp but isn't practicing";
    news(state, `${p.name} ${word} while seeking a new contract with the ${teamLabel(ps.team)}`);
    if (ps.team === state.userTeam) {
      openTalks(state, ps.team, id, "extension", "owner");
      send(state, "staff", gmName(state), `${p.name} ${ps.holdout.kind === "holdout" ? "is holding out" : "is holding in"}`,
        `${p.name} ${word} until there's a new deal. ${agentFor(id).name} has sent over their number; talks are open on the Contracts page.` +
        (ps.holdout.kind === "holdout" ? " Under the CBA we fine a veteran $50K for every day of camp missed." : ""));
    } else openTalks(state, ps.team, id, "extension", "gm", { goal: "sign" });
  }
}

/** Week 1: most holdouts report; a few keep sitting and lose game checks. */
function resolveHoldouts(state: GameState): void {
  for (const [id, ps] of Object.entries(state.players)) {
    if (!ps.holdout) continue;
    const pr = priorities(id);
    const rng = rngFor(state.seed, `holdout-end:${id}`);
    if (rng() < 0.85 - 0.3 * pr.ego) {
      delete ps.holdout;
      changeMorale(state, id, -5);
      const p = PLAYER_BY_ID[id];
      news(state, `${p.name} ends the standoff and reports to the ${teamLabel(ps.team!)} without a new deal`);
    } else ps.holdout.kind = "holdout";
  }
}

export function contractsDaily(state: GameState): void {
  for (const neg of Object.values(state.negotiations)) {
    if (neg.status !== "open") continue;
    if (state.players[neg.player]?.team !== neg.team && neg.kind === "extension") {
      neg.status = "ended";
      continue;
    }
    if (neg.pending && neg.replyOn && neg.replyOn <= state.date) respond(state, neg);
    else if (!neg.pending && neg.handler === "gm" && neg.status === "open") {
      const last = neg.rounds[neg.rounds.length - 1];
      if (last.from === "agent" && last.date < state.date) gmMove(state, neg);
    }
  }
  publicMood(state);
  if (state.date === RULES.keyDates.regularSeasonStart) resolveHoldouts(state);
  if (state.date < RULES.keyDates.regularSeasonEnd) cpuExtensions(state);
}

/** Fans and media drift back toward neutral, but a starter missing time keeps the heat on. */
function publicMood(state: GameState): void {
  const pr = state.pressure;
  pr.fans += (50 - pr.fans) * 0.01;
  pr.media += (50 - pr.media) * 0.015;
  for (const id of teamPlayerIds(state, state.userTeam)) {
    const h = state.players[id].holdout;
    if (!h) continue;
    const out = h.kind === "holdout" || state.date < RULES.keyDates.regularSeasonStart;
    if (out && daysBetween(h.since, state.date) === 10) {
      const hc = teamStaff(state.userTeam).HC;
      const p = PLAYER_BY_ID[id];
      if (hc) send(state, "staff", `${hc.name}, head coach`, `We need ${p.name} back`,
        `It's been ten days without ${p.name} on the field. We're installing things this player needs to know, and the team notices the empty spot. Whatever it takes within reason, I'd like this done.`);
    }
    if (out) {
      pr.fans -= h.kind === "holdout" ? 0.3 : 0.1;
      pr.media -= h.kind === "holdout" ? 0.4 : 0.15;
    }
  }
  pr.fans = Math.max(0, Math.min(100, pr.fans));
  pr.media = Math.max(0, Math.min(100, pr.media));
}

/** How the fan base and the press feel about the front office, in words. */
export function publicPulse(state: GameState): { fans: string; media: string } {
  const { fans, media } = state.pressure;
  return {
    fans: fans >= 65 ? "Fans are happy with how the front office is handling contracts."
      : fans >= 45 ? "Fans aren't paying much attention to contract talks."
      : fans >= 30 ? "Fans are getting restless about unsigned players."
      : "Fans are angry, and talk radio is blaming the front office.",
    media: media >= 65 ? "Coverage of the front office has been friendly."
      : media >= 45 ? "The press is treating our contract situation as routine."
      : media >= 30 ? "Reporters keep asking about our contract situation."
      : "The media is running daily stories about our contract problems.",
  };
}

/** Fines owed by a holdout so far (the team may waive them in a new deal; most do). */
export function holdoutFines(state: GameState, id: string): number {
  const h = state.players[id]?.holdout;
  if (!h || h.kind !== "holdout") return 0;
  const end = state.date < RULES.keyDates.regularSeasonStart ? state.date : RULES.keyDates.regularSeasonStart;
  return Math.max(0, daysBetween(h.since, end)) * 50_000;
}

export function clientsHere(state: GameState, id: string): number {
  return clientsOnTeam(state, agentFor(id).id, state.players[id]?.team ?? "").length - 1;
}
