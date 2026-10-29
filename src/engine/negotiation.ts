// Contract talks. The team (the owner, or the GM on the owner's behalf, or a
// CPU front office) sends offers; the agent answers a day or a few later with
// an acceptance, a counter, or silence. Behind every agent is a hidden floor
// the player won't go below, a hidden ask that comes down as talks go, and a
// limited supply of patience. Every round moves the player's morale and the
// agent's trust in the front office.
import { agentFor, agentHidden, changeMorale, changeTrust, clientsOnTeam, morale, priorities, trustOf, type AgentHidden, type Priorities } from "./agents";
import { addDeadMoney, adjustRollover, capSummary, teamPlayerIds, yearsExpIn } from "./cap";
import {
  dealCapHit, dealOf, dealYearsLeft, lastYear, leagueYear, minimumSalary, prorateFirstYear, salaryCap, writeDeal, writeExtension, type Terms,
} from "./contracts";
import { addDays, ageOn, daysBetween, shortDate } from "./dates";
import { payCash } from "./finance";
import { gradeDeal } from "./grades";
import { leakStory, ownerLeverage } from "./outlets";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { capScale, invalidateMarket, marketPrice, teamValue } from "./market";
import { gaussian, rngFor } from "./rng";
import { schemeFit, staffEffects, teamStaff } from "./staff";
import { standings } from "./standings";
import { depthChart, rosterLimit, rosterRoom } from "./roster";
import { bestRival, committed, inWindow, isStreetMarket, market, marketYear, signFreeAgent, STREET_SCALE, teamPull } from "./freeagency";
import { onWaivers } from "./waivers";
import { isOffseason, isPendingFreeAgent, NEXT } from "./offseason";
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
  // Tagged players can sign long-term until July 15 of the tag year, then not again until the season ends.
  const tagYear = lastYear(deal) ?? year;
  if ((deal.kind === "franchise" || deal.kind === "transition") && state.date > `${tagYear}-07-15` && state.date <= RULES.keyDates.regularSeasonEnd) {
    return { ok: false, reason: "Tagged players can't sign a long-term deal after July 15 until the season ends." };
  }
  if (isPendingFreeAgent(state, id) && state.date >= RULES.keyDates.newLeagueYear) return { ok: false, reason: "The contract has expired." };
  const left = dealYearsLeft(deal, year);
  if (left > 2) return { ok: false, reason: `Under contract through ${lastYear(deal)}. Too early to extend.` };
  if (deal.kind === "rookie" && p.yearsExp < 3) return { ok: false, reason: "Drafted players can't extend until after their third season." };
  return { ok: true };
}

/**
 * Whether a team can talk contract with a player now, and what kind of talks
 * they'd be: its own players get extension (or re-signing) talks; free agents
 * are open to everyone after the season; another team's expiring players only
 * once the negotiating window opens. Anything else would be tampering.
 */
export function talksFor(state: GameState, team: string, id: string): Eligibility & { kind: NegotiationKind } {
  const ps = state.players[id];
  const k = RULES.keyDates;
  if (ps?.team === team && ps.status !== "fa") return { ...extensionEligibility(state, id), kind: "extension" };
  if (ps?.status === "fa" && onWaivers(state, id)) return { ok: false, kind: "free-agent", reason: "On waivers: we can claim him, or talk once he clears." };
  if (!isOffseason(state.date)) {
    if (ps?.status !== "fa") return { ok: false, kind: "free-agent", reason: ps?.status === "ps" ? "On another team's practice squad: we can sign him to our 53, but not negotiate." : "Under contract with another team." };
    const fa = market(state)[id];
    if (fa?.status === "agreed") return { ok: false, kind: "free-agent", reason: `Agreed to terms with the ${teamLabel(fa.agreed!.team)}.` };
    return { ok: true, kind: "free-agent" };
  }
  if (ps?.status === "fa") {
    const fa = market(state)[id];
    if (fa?.status === "agreed") return { ok: false, kind: "free-agent", reason: `Agreed to terms with the ${teamLabel(fa.agreed!.team)}.` };
    return { ok: true, kind: "free-agent" };
  }
  if (isPendingFreeAgent(state, id) && state.date >= k.negotiatingWindowOpens) {
    const fa = market(state)[id];
    if (!fa || fa.status !== "open") return { ok: false, kind: "free-agent", reason: fa?.status === "agreed" ? `Agreed to terms with the ${teamLabel(fa.agreed!.team)}.` : "Not headed to free agency." };
    return { ok: true, kind: "free-agent" };
  }
  if (isPendingFreeAgent(state, id)) return { ok: false, kind: "free-agent", reason: `Under contract with the ${teamLabel(ps!.team!)} until the league year ends. Other teams can talk from ${shortDate(k.negotiatingWindowOpens)}.` };
  return { ok: false, kind: "free-agent", reason: "Under contract with another team." };
}

/** The first league year a new deal would cover. */
export function startYearFor(state: GameState, id: string, kind: NegotiationKind): number {
  // During the season free agents sign for the weeks left; after it, for next season.
  if (kind === "free-agent") return isOffseason(state.date) ? NEXT : marketYear(state.date);
  const last = lastYear(dealOf(state, id));
  return Math.max(leagueYear(state.date), (last ?? leagueYear(state.date)) + 1);
}

// ---- The agent's position ----

export function teamQuality(state: GameState, team: string): number {
  const row = standings(state)[team];
  const g = row ? row.w + row.l + row.t : 0;
  return row ? (row.w + 0.5 * row.t + 2) / (g + 4) : 0.5;
}

interface Stance { base: number; floor: number; ask: number; askYears: number; askGuarantee: number }

function stance(state: GameState, team: string, id: string, startYear: number): Stance {
  const price = { ...marketPrice(state, id, startYear) };
  // Unsigned in camp or during the season: the street pays a fraction of a market deal, one year at a time.
  if (state.players[id]?.status === "fa" && isStreetMarket(state.date)) {
    price.apy = Math.max(minimumSalary(yearsExpIn(id, startYear), startYear), price.apy * STREET_SCALE);
    price.years = 1;
    price.guaranteeShare *= 0.25;
  }
  const agent = agentFor(id);
  const ah = agentHidden(agent.id);
  const pr = priorities(id);
  const ps = state.players[id];
  const same = ps?.team === team || (ps?.status === "fa" && ps.lastTeam === team);
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
  // The owner told the press this player would be paid: his agent heard it too.
  reservation += ownerLeverage(state, id, team);
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
export function offerValue(neg: Pick<Negotiation, "player" | "askGuarantee" | "askYears">, t: OfferTerms): number {
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
  // A free agent who has sat on the market has already come down.
  const fa = kind === "free-agent" ? market(state)[id] : undefined;
  if (fa) {
    neg.marketScale = fa.floor / fa.floor0;
    neg.floor *= neg.marketScale;
    neg.ask = Math.max(neg.floor * 1.03, neg.ask * neg.marketScale);
  }
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
  // A free agent, or one of ours re-signed after the season, counts against next year's cap.
  const year = capYearFor(state, neg);
  const current = neg.kind === "free-agent" ? null : dealOf(state, neg.player);
  const capChange = dealCapHit(deal, year) - dealCapHit(current, year);
  const space = capSummary(state, neg.team, year).space - (neg.kind === "free-agent" ? committed(state, neg.team) : 0);
  if (neg.kind === "free-agent" && year === leagueYear(state.date) && rosterRoom(state, neg.team) <= 0) {
    return { ok: false, reason: `There's no room on the ${rosterLimit(state)}-man roster: release someone first.`, capChange, cashNow: t.signingBonus };
  }
  if (state.settings.capRules === "real" && capChange > 0 && capChange > space) {
    return { ok: false, reason: `Not enough cap space: this adds ${money(capChange)} to the ${year} cap and we have ${money(Math.max(0, space))}.`, capChange, cashNow: t.signingBonus };
  }
  return { ok: true, capChange, cashNow: t.signingBonus };
}

function reSigning(state: GameState, neg: Negotiation): boolean {
  return neg.kind === "extension" && isOffseason(state.date) && isPendingFreeAgent(state, neg.player);
}

/** The league year whose cap an offer is checked against. */
export function capYearFor(state: GameState, neg: Negotiation): number {
  if (neg.kind === "free-agent") return startYearFor(state, neg.player, neg.kind);
  return reSigning(state, neg) ? NEXT : leagueYear(state.date);
}

/** The contract these terms would produce. */
export function draftDeal(state: GameState, neg: Negotiation, t: OfferTerms) {
  const p = PLAYER_BY_ID[neg.player];
  const terms: Terms = { ...t };
  const current = dealOf(state, neg.player);
  // Re-signing an expiring player after the season: a new deal from next year, the bonus spread from then.
  if (reSigning(state, neg) && current) {
    const deal = writeDeal(terms, { team: neg.team, date: state.date, kind: "extension", firstYear: NEXT, yearsExp: yearsExpIn(neg.player, NEXT) });
    // Void years the new deal covers become real years: their bonus money stays where it was.
    for (const v of current.years.filter((y) => y.void && y.year >= NEXT)) {
      const y = deal.years.find((x) => x.year === v.year);
      if (y) y.proration += v.proration;
    }
    deal.years = [...current.years.filter((y) => y.year < NEXT && !y.void).map((y) => ({ ...y })), ...deal.years];
    return deal;
  }
  if (neg.kind === "extension" && current) return writeExtension(current, terms, state.date, p.yearsExp);
  const first = startYearFor(state, neg.player, neg.kind);
  return prorateFirstYear(writeDeal(terms, { team: neg.team, date: state.date, kind: "veteran", firstYear: first, yearsExp: yearsExpIn(neg.player, first) }), state.date);
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
  const k = RULES.keyDates;
  // In the offseason the deadline for our own free agents is the day other teams can call.
  const d = state.date < k.regularSeasonStart ? k.regularSeasonStart
    : isOffseason(state.date) ? k.negotiatingWindowOpens
    : k.regularSeasonEnd;
  return neg.kind === "extension" ? Math.max(0, daysBetween(state.date, d)) : 30;
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

  // On the open market, prices fall for players still waiting.
  const fa = neg.kind === "free-agent" ? market(state)[id] : undefined;
  if (fa) {
    const scale = fa.floor / fa.floor0;
    const prev = neg.marketScale ?? 1;
    if (scale < prev) {
      neg.floor *= scale / prev;
      neg.ask *= scale / prev;
    }
    neg.marketScale = scale;
  }

  const v = offerValue(neg, t);
  const prior = bestTeamValue(neg, true);
  const deadline = daysToDeadline(state, neg);
  const urgent = deadline <= 10;

  // Another team's offer is the real floor: the player compares what each is worth to them.
  const rival = fa ? bestRival(state, id, neg.team) : null;
  const rivalEq = rival ? rival.u / (1 + teamPull(state, id, neg.team, fa!.from)) : 0;
  if (rival && rivalEq > v && rivalEq >= neg.floor * 0.97) {
    neg.ask = Math.max(neg.ask, rivalEq * 1.02);
    neg.patience -= 1;
    const reported = rival.offer.apy * (1 + Math.abs(gaussian(rng)) * (agent.style === "leaker" ? 0.08 : 0.03));
    const counter = agentTerms(ah, neg.ask, neg.askYears, neg.askGuarantee);
    neg.rounds.push({ date: state.date, from: "agent", terms: counter,
      note: `${agent.name} says ${name} has a better offer from another team, around ${money(reported)} a year, and we'd have to beat it.` });
    if (neg.team === state.userTeam) {
      if (neg.handler === "owner") send(state, "transaction", `${agent.name}, agent`, `${name}: another team is ahead`, `${neg.rounds[neg.rounds.length - 1].note} Details are on the Contracts page.`);
      else note(neg, state.date, `${gmName(state)}: another team is ahead, at about ${money(reported)} a year.`);
    }
    if (fa?.lastLook) delete fa.lastLook;
    return;
  }

  if (v >= neg.ask * 0.985 || (v >= neg.floor && (neg.ask - v) / neg.ask < 0.025) || (fa?.lastLook && v >= neg.floor && v >= rivalEq)) {
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
  leakStory(state, {
    player: neg.player, name: p.name, position: p.position, team: neg.team, teamName: TEAM_BY_ID[neg.team].name,
    apy: money(reported), lowball, agent: agent.name,
  });
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
  if (neg.kind === "free-agent") {
    neg.status = "agreed";
    neg.rounds.push({ date: state.date, from: "agent", terms: t, note: "Agreed." });
    signFreeAgent(state, id, neg.team, t);
    invalidateMarket(state);
    if (neg.team === state.userTeam) {
      state.pressure.fans = Math.min(100, state.pressure.fans + (p.position === "QB" ? 4 : 2));
      const s = state.signings.find((x) => x.player === id && x.team === neg.team)!;
      send(state, "transaction", neg.handler === "gm" ? gmName(state) : `${agentFor(id).name}, agent`, `${p.name} agrees to terms`,
        `Done: ${t.years} years, ${money(s.total)} total, ${money(s.guaranteed)} guaranteed. ` +
        (inWindow(state.date) ? `The deal is signed when the league year opens on ${RULES.keyDates.newLeagueYear}. ` : t.signingBonus ? `${money(t.signingBonus)} signing bonus paid now. ` : "He's on the roster. ") +
        `Early grades: ${s.grades.map((g) => `${g.outlet}: ${g.grade}`).join(" · ")}.`);
    }
    return;
  }
  // Signed after the season: this year's extra cap hit comes out of what rolls over.
  if (capYearFor(state, neg) === leagueYear(state.date)) adjustRollover(state, neg.team, -check.capChange);
  // Void years on the old deal past the end of the new one still accelerate when it would have voided.
  if (reSigning(state, neg)) addDeadMoney(state, neg.team, NEXT, dealOf(state, id)?.years.filter((y) => y.void && y.year >= NEXT + t.years).reduce((a, y) => a + y.proration, 0) ?? 0);
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
  let check = sendOffer(state, id, terms);
  // Capped-out teams put the guarantees in base salary so this year's hit doesn't grow.
  if (!check.ok && neg.kind === "extension" && terms.signingBonus > 0 && /cap/i.test(check.reason ?? "")) {
    terms.signingBonus = 0;
    check = sendOffer(state, id, terms);
  }
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

export const STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };

/** CPU front offices look at extending their own players. */
/** Void-year money on a team's deals that end this league year: it lands on next year's cap unless the deals are extended. */
function voidExposure(state: GameState, team: string, year: number): number {
  let total = 0;
  for (const id of teamPlayerIds(state, team)) {
    const deal = dealOf(state, id);
    if (deal && lastYear(deal) === year) total += deal.years.filter((y) => y.void).reduce((s, y) => s + y.proration, 0);
  }
  return total;
}

function cpuExtensions(state: GameState): void {
  const rng = rngFor(state.seed, `cpu-ext:${state.date}`);
  const year = leagueYear(state.date);
  // Teams do most extensions in camp and early in the season, and re-sign their own free agents before the market opens.
  const offseason = isOffseason(state.date);
  if (offseason && state.date >= RULES.keyDates.negotiatingWindowOpens) return;
  // The early summer is quiet; deals pick up as camp nears.
  const camp = addDays(RULES.keyDates.regularSeasonStart, -50);
  const busy = offseason ? 0.35 : state.date < camp ? 0.012 : state.date < addDays(RULES.keyDates.regularSeasonStart, 14) ? 0.05 : state.date < RULES.keyDates.tradeDeadline ? 0.018 : 0.008;
  for (const t of TEAMS) {
    if (t.id === state.userTeam) continue;
    // A team with void money about to hit gets to work on it.
    const exposed = state.settings.capRules === "real" && voidExposure(state, t.id, year) >= 15_000_000;
    if (rng() > (exposed ? Math.max(busy, offseason ? 0.35 : 0.08) : busy)) continue;
    const candidates = Object.keys(state.players).filter((id) => {
      const ps = state.players[id];
      if (ps.team !== t.id || ps.status === "fa" || ps.status === "ps" || state.negotiations[id]?.status === "open") return false;
      if (state.negotiations[id] && state.negotiations[id].team === t.id && daysBetween(state.negotiations[id].opened, state.date) < 60) return false;
      const deal = dealOf(state, id);
      return !!deal && dealYearsLeft(deal, year) === 1 && extensionEligibility(state, id).ok;
    });
    // Void years about to accelerate: an extension keeps that money spread out instead of landing at once.
    const voids = (id: string) => dealOf(state, id)!.years.filter((y) => y.void).reduce((s, y) => s + y.proration, 0);
    if (!candidates.length) continue;
    // Teams extend the players they start, not their backups.
    const chart = depthChart(state, t.id);
    const starters = new Set(Object.entries(chart).flatMap(([pos, ids]) => ids.slice(0, (STARTERS[pos as Position] ?? 1) + (offseason ? 1 : 0))));
    const start = year + 1;
    // Front offices keep an eye on next year's cap: an extension has to fit, with some help from restructures.
    const room = state.settings.capRules === "real" ? capSummary(state, t.id, start).space + 0.04 * salaryCap(state, start) : Infinity;
    const scored = candidates.filter((id) => starters.has(id) || voids(id) >= 5_000_000).map((id) => ({ id, v: teamValue(state, t.id, id, start), voids: voids(id) }))
      // Big void money always gets the call: letting it land at once is worse than any extension.
      .filter((x) => x.v >= (offseason ? 1_500_000 : 3_000_000) * capScale(state, start) && (x.v * 0.8 <= room + x.voids || x.voids >= 10_000_000))
      .sort((a, b) => b.voids - a.voids || b.v - a.v);
    const pick = scored[0];
    if (!pick) continue;
    const ask = marketPrice(state, pick.id, start).apy;
    const goal: Mandate["goal"] = pick.v >= ask * 0.9 || pick.voids >= 10_000_000 ? "sign" : "value";
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
    // A player who stayed away from the spring program over his deal is halfway out the door already.
    const spring = state.program?.season === RULES.season ? state.program.spring[id] : undefined;
    const skipped = spring?.reason === "contract" && spring.plan === "away";
    if (score < (skipped ? 0.55 : 0.7) || rng() > (skipped ? 0.6 : 0.3)) continue;
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
    } else {
      // A front office with no room next year lets him sit rather than break its cap.
      const v = teamValue(state, ps.team, id, year + left);
      if (state.settings.capRules === "real" && capSummary(state, ps.team, year + 1).space + 0.04 * salaryCap(state, year + 1) < v * 0.8) continue;
      openTalks(state, ps.team, id, "extension", "gm", { goal: "sign" });
    }
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
      // An expiring deal ran out mid-talks: the player is a free agent, and the talks go on as free agency.
      const ps = state.players[neg.player];
      if (ps?.status === "fa" && ps.lastTeam === neg.team && market(state)[neg.player]?.status === "open") {
        neg.kind = "free-agent";
        note(neg, state.date, "The contract expired. We can keep talking, but now every team can.");
      } else {
        neg.status = "ended";
        continue;
      }
    }
    if (neg.pending && neg.replyOn && neg.replyOn <= state.date) respond(state, neg);
    else if (!neg.pending && neg.handler === "gm" && neg.status === "open") {
      const last = neg.rounds[neg.rounds.length - 1];
      if (last.from === "agent" && last.date < state.date) gmMove(state, neg);
    }
  }
  publicMood(state);
  if (state.date === RULES.keyDates.regularSeasonStart) resolveHoldouts(state);
  if (state.date < RULES.keyDates.regularSeasonEnd || isOffseason(state.date)) cpuExtensions(state);
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
