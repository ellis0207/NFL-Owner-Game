// Stadium politics: getting public money approved. The club asks the city,
// county and state for a package (bonds, roads and utilities, grants, and a
// special tax district) and the talks run through the officials in
// standing.ts. The club can pay for an economic-impact study; the city's own
// budget office always does one, and it usually finds a fraction of what the
// team's consultants claimed, because most of what fans spend at a stadium
// would have been spent in town anyway. Voters weigh the tax burden against
// their attachment to the team and how it's been winning; officials follow
// voters. An environmental review sets mitigation, a rival suburb may bid for
// the stadium, the council votes, and a tax district needs a referendum on
// the next Election Day. Approval sets the public money, a development
// agreement and a promise to stay; a rejection leaves a renovation, private
// money, another round of talks, or a look at moving.
//
// The suburbs, council members and studies are made up. The mechanics (bond
// and tax-district financing, independent impact reviews, referenda and
// non-relocation pledges in return for public money) follow real deals.
import { business, businessChief, post } from "./business";
import { construction, baseCost, type StadiumPlan, type Site } from "./construction";
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { inRecession } from "./economy";
import { metroPop } from "./fans";
import { money, news, send } from "./inbox";
import { RULES, TEAM_BY_ID } from "./league";
import { gaussian, rngFor } from "./rng";
import { standingState } from "./standing";
import { history } from "./seasons";
import { standings, winPct } from "./standings";
import type { GameState } from "./types";

const M = 1_000_000;

export interface PublicAsk { bonds: number; infra: number; grants: number; district: number }

export interface Talks {
  opened: string;
  ask: number;
  parts: PublicAsk;
  impact?: { date: string; claim: number; jobs: number };
  independent?: { date: string; holds: number; text: string };
  envDue: string;
  env?: { date: string; mitigation: number; text: string };
  rival?: { date: string; name: string; subsidy: number; used?: "leverage" | "accepted" | "declined" };
  councilDate: string;
  council?: { date: string; yes: number; no: number };
  referendum?: { required: boolean; date?: string; yes?: number };
  status: "talks" | "approved" | "rejected";
  round: number;
  /** Support moved by the owner's own moves (meetings, concessions). */
  push: number;
}

export interface PoliticsState {
  talks?: Talks;
  /** A sponsor's question about where the team will play. */
  question?: { partner: string; cat: string; asked: string; answered?: "briefed" | "quiet" };
  log: { date: string; text: string }[];
}

export function politics(state: GameState): PoliticsState {
  return (state.politics ??= { log: [] });
}

function note(state: GameState, text: string): void {
  const p = politics(state);
  p.log.unshift({ date: state.date, text });
  p.log.length = Math.min(p.log.length, 30);
}

/** How a public ask splits across the levels of government, by ownership model. */
export function splitAsk(ask: number, plan: StadiumPlan): PublicAsk {
  const district = plan.model === "team" ? 0 : Math.round(ask * 0.25);
  const infra = Math.round(ask * (plan.model === "team" ? 1 : 0.2));
  const grants = plan.model === "team" ? 0 : Math.round(ask * 0.15);
  return { bonds: Math.max(0, ask - district - infra - grants), infra, grants, district };
}

/** Opens talks with the public side over a package of `ask` dollars. */
export function startPolitics(state: GameState, ask: number, round = 1): void {
  const plan = construction(state).plan!;
  const site = plan.sites.find((s) => s.id === plan.site)!;
  const r = rngFor(state.seed, `politics:${state.userTeam}:${state.date}`);
  politics(state).talks = {
    opened: state.date, ask, parts: splitAsk(ask, plan), status: "talks", round, push: 0,
    envDue: addDays(state.date, 90 + Math.round(site.envRisk * 90)),
    councilDate: addDays(state.date, 150 + Math.floor(r() * 45)),
  };
  note(state, `Asked ${site.jurisdiction} for ${money(ask)} in public money.`);
  news(state, `${TEAM_BY_ID[state.userTeam].name} ask ${site.jurisdiction} for ${money(ask)} toward a new stadium`);
  send(state, "business", businessChief(state), "Stadium talks with the public side",
    `We've asked ${site.jurisdiction} for ${money(ask)}. The city's budget office will publish its own impact study, the environmental review takes a few months, and the council votes around ${shortDate(politics(state).talks!.councilDate)}. ` +
    "We can commission our own impact study, meet the officials, and add community commitments to help.");
}

// ---- Voters ----

/** The club's recent winning: this season so far blended with last season. */
function recentWinning(state: GameState): number {
  const us = state.userTeam;
  const now = standings(state)[us];
  const last = history(state).seasons.at(-1)?.records[us];
  const cur = now && now.w + now.l + now.t >= 4 ? winPct(now.w, now.l, now.t) : null;
  const prev = last ? winPct(last[0], last[1], last[2]) : 0.5;
  return cur === null ? prev : 0.6 * cur + 0.4 * prev;
}

/**
 * Voter support for the package, 0-100. The tax burden per resident weighs
 * most; attachment (fans' trust), recent winning, officials' leanings and the
 * community commitments help; a recession and an independent study that
 * debunks the team's numbers hurt.
 */
export function voterSupport(state: GameState): number {
  const t = politics(state).talks;
  const plan = construction(state).plan;
  if (!t || !plan) return 50;
  const us = state.userTeam;
  const pop = metroPop(us, Number(state.date.slice(0, 4)));
  const burden = t.ask / (pop * 100 * M);
  const officials = standingState(state).officials;
  const lean = officials.reduce((a, o) => a + o.lean, 0) / Math.max(1, officials.length);
  const trust = state.fans?.trust ?? 60;
  let v = 50 + (trust - 60) * 0.35 + (recentWinning(state) - 0.5) * 30 + (lean - 50) * 0.25 - burden * 9;
  v += (plan.benefits.jobs ? 3 : 0) + (plan.benefits.local ? 2 : 0) + (plan.benefits.access ? 3 : 0);
  if (t.parts.district > 0) v -= 3;
  if (inRecession(state)) v -= 6;
  if (t.impact && (!t.independent || t.independent.holds >= 0.4)) v += 4;
  if (t.independent) v += t.impact ? (t.independent.holds < 0.4 ? -4 : 0) : t.independent.holds < 0.35 ? -2 : 1;
  if (t.rival?.used === "leverage") v += 4;
  if (t.round > 1) v += 3;
  v += t.push;
  return Math.max(5, Math.min(95, Math.round(v)));
}

/** Our own impact study: about $1.5M, out in a month. */
export function commissionImpact(state: GameState): string | null {
  const t = politics(state).talks;
  if (!t || t.status !== "talks") return "There are no stadium talks to support.";
  if (t.impact) return "Our study is already out.";
  const plan = construction(state).plan!;
  post(state, "professional", -1.5 * M, "Stadium economic-impact study");
  t.impact = { date: addDays(state.date, 30), claim: Math.round(baseCost(state, plan) * 0.22 / M) * M, jobs: Math.round(plan.capacity / 6) };
  return "The consultants will publish in about a month.";
}

/** Add a community commitment mid-talks: support now, money later. */
export function addCommitment(state: GameState, k: keyof StadiumPlan["benefits"]): string | null {
  const plan = construction(state).plan;
  const t = politics(state).talks;
  if (!plan || !t || t.status !== "talks") return "Commitments are made during the talks.";
  if (plan.benefits[k]) return "Already committed.";
  plan.benefits[k] = true;
  plan.commitments.push({
    jobs: "Local hiring: 30% of construction and stadium jobs to residents, with a $2M-a-year training program.",
    local: "Local and minority-owned contractors get at least 20% of the construction spending.",
    access: "Community use: 25 free public events a year and a $1.5M-a-year neighborhood fund.",
  }[k]);
  return null;
}

/** Use the rival suburb's offer: as leverage with the city, or take it and move the plan there. */
export function answerRival(state: GameState, how: "leverage" | "accepted" | "declined"): string | null {
  const t = politics(state).talks;
  const plan = construction(state).plan;
  if (!t?.rival || t.rival.used || !plan) return "No offer to answer.";
  t.rival.used = how;
  if (how === "leverage") {
    note(state, `Told the city about ${t.rival.name}'s offer.`);
    // The city may call the bluff: officials resent being played.
    const r = rngFor(state.seed, `bluff:${state.userTeam}:${state.date}`);
    if (r() < 0.3) for (const o of standingState(state).officials) o.lean = Math.max(0, o.lean - 6);
    return "The city knows we have somewhere else to go.";
  }
  if (how === "accepted") {
    const site: Site = { id: "rival", name: `A site in ${t.rival.name}`, kind: "rival", land: 90 * M, transit: 0.3, parking: 0.9, reach: 0.97, envRisk: 0.25, development: 0.7, jurisdiction: t.rival.name, subsidy: t.rival.subsidy };
    plan.sites = plan.sites.filter((s) => s.id !== "rival");
    plan.sites.push(site);
    plan.site = "rival";
    for (const o of standingState(state).officials) o.lean = Math.max(0, o.lean - 12);
    news(state, `${TEAM_BY_ID[state.userTeam].name} take ${t.rival.name}'s offer and move their stadium plan out of the city`);
    note(state, `Moved the plan to ${t.rival.name}.`);
    // A fresh, friendlier jurisdiction: its board votes sooner.
    t.councilDate = addDays(state.date, 60);
    t.push += 6;
    return `${t.rival.name} puts in ${money(t.rival.subsidy)} and its board votes around ${shortDate(t.councilDate)}.`;
  }
  return null;
}

// ---- Each day ----

function independentStudy(state: GameState): void {
  const t = politics(state).talks!;
  const r = rngFor(state.seed, `independent:${state.userTeam}:${t.opened}`);
  const holds = Math.round((0.2 + 0.45 * r()) * 100) / 100;
  t.independent = {
    date: state.date, holds,
    text: holds < 0.4
      ? `The city's budget office says most stadium spending would happen in town anyway; it credits only ${Math.round(holds * 100)}% of the activity the team's case assumes, and warns of the bonds' long tail.`
      : `The budget office finds real but modest gains: about ${Math.round(holds * 100)}% of the team's projected activity holds up once spending that would happen anyway is taken out.`,
  };
  news(state, `City budget office releases its review of the ${TEAM_BY_ID[state.userTeam].name}' stadium request`);
  send(state, "business", businessChief(state), "The city's impact study", t.independent.text);
}

function envReview(state: GameState): void {
  const t = politics(state).talks!;
  const plan = construction(state).plan!;
  const site = plan.sites.find((s) => s.id === plan.site)!;
  const r = rngFor(state.seed, `env:${state.userTeam}:${t.opened}`);
  const mitigation = Math.round(baseCost(state, plan) * site.envRisk * (0.02 + 0.04 * r()) / M) * M;
  t.env = { date: state.date, mitigation, text: `The environmental review cleared the site with ${money(mitigation)} of traffic, drainage and noise mitigation.` };
  plan.commitments.push(`Environmental mitigation: ${money(mitigation)} for traffic, drainage and noise.`);
  plan.mitigation = mitigation;
  send(state, "business", businessChief(state), "Environmental review", t.env.text);
}

function rivalBid(state: GameState): void {
  const t = politics(state).talks!;
  const plan = construction(state).plan!;
  const r = rngFor(state.seed, `rival:${state.userTeam}:${t.opened}`);
  if (plan.site === "suburb" || r() >= 0.35) return;
  const name = ["Riverside Township", "North County", "Lakeview", "Westfield", "Harbor City"][Math.floor(r() * 5)];
  t.rival = { date: state.date, name, subsidy: Math.round(baseCost(state, plan) * (0.1 + 0.1 * r()) / M) * M };
  news(state, `${name} officials pitch the ${TEAM_BY_ID[state.userTeam].name} on a stadium site of their own`);
  send(state, "business", businessChief(state), `${name} wants the stadium`,
    `${name} offers a site and ${money(t.rival.subsidy)} if we build there. We can use it as leverage with the city, take it, or turn it down.`);
}

function councilVote(state: GameState): void {
  const t = politics(state).talks!;
  const support = voterSupport(state);
  const r = rngFor(state.seed, `council:${state.userTeam}:${state.date}`);
  const lean = standingState(state).officials.reduce((a, o) => a + o.lean, 0) / 3;
  let yes = 0;
  for (let i = 0; i < 9; i++) {
    const x = (support - 50) / 8 + (lean - 50) / 25 + gaussian(r) * 0.8;
    if (x > 0) yes++;
  }
  t.council = { date: state.date, yes, no: 9 - yes };
  if (yes < 5) return reject(state, `The council voted the package down, ${yes}-${9 - yes}.`);
  if (t.parts.district > 0) {
    t.referendum = { required: true, date: electionDay(state.date) };
    news(state, `Council approves the stadium package ${yes}-${9 - yes}; the tax district goes to voters on ${shortDate(t.referendum.date!)}`);
    send(state, "business", businessChief(state), "Council approved: now the voters",
      `The council approved it ${yes}-${9 - yes}. The tax district needs a referendum on ${shortDate(t.referendum.date!)}. Support is about ${support}% today.`);
    return;
  }
  approve(state, `The council approved the package ${yes}-${9 - yes}.`);
}

/** The first Tuesday after the first Monday in November, at least two months out. */
function electionDay(from: string): string {
  let y = Number(from.slice(0, 4));
  for (;;) {
    let d = `${y}-11-02`;
    while (weekday(d) !== "Tuesday") d = addDays(d, 1);
    if (daysBetween(from, d) >= 60) return d;
    y++;
  }
}

function referendum(state: GameState): void {
  const t = politics(state).talks!;
  const r = rngFor(state.seed, `referendum:${state.userTeam}:${state.date}`);
  const yes = Math.max(10, Math.min(90, Math.round((voterSupport(state) + gaussian(r) * 4) * 10) / 10));
  t.referendum = { ...t.referendum!, yes };
  if (yes < 50) return reject(state, `Voters rejected the stadium tax district, ${yes}% to ${Math.round((100 - yes) * 10) / 10}%.`);
  approve(state, `Voters approved the stadium tax district with ${yes}%.`);
}

function approve(state: GameState, how: string): void {
  const t = politics(state).talks!;
  const plan = construction(state).plan!;
  t.status = "approved";
  plan.funding.public = t.ask;
  plan.milestones.political = state.date;
  plan.milestones.contractual = state.date;
  const year = Number(state.date.slice(0, 4));
  plan.stayUntil = year + 34;
  plan.commitments.push(`Public money: ${money(t.parts.bonds)} in bonds, ${money(t.parts.infra)} for roads and utilities, ${money(t.parts.grants)} in grants, ${money(t.parts.district)} from a tax district.`);
  plan.commitments.push(`Non-relocation pledge: the team stays through ${plan.stayUntil}, with penalties if it leaves.`);
  plan.stage = "finance";
  note(state, how);
  news(state, `${how.replace(/\.$/, "")}: ${money(t.ask)} in public money for the ${TEAM_BY_ID[state.userTeam].name}' new stadium`);
  send(state, "business", businessChief(state), "Stadium approved",
    `${how} The development agreement is signed, with a promise to stay through ${plan.stayUntil}. Next: the financing package on the Business page.`);
}

function reject(state: GameState, how: string): void {
  const t = politics(state).talks!;
  t.status = "rejected";
  note(state, how);
  news(state, `${how.replace(/\.$/, "")}, a setback for the ${TEAM_BY_ID[state.userTeam].name}' stadium plan`);
  send(state, "business", businessChief(state), "The stadium package failed",
    `${how} Our options: renovate the building we have, fund it privately, go back for another round at a smaller ask in six months, or look at other markets.`);
}

export type FailureChoice = "private" | "renegotiate" | "renovate" | "relocate";

/** After a rejection: renovate, go private, try again, or look elsewhere. */
export function afterRejection(state: GameState, choice: FailureChoice): string | null {
  const t = politics(state).talks;
  const c = construction(state);
  const plan = c.plan;
  if (!t || t.status !== "rejected" || !plan) return "Nothing was rejected.";
  if (choice === "private") {
    plan.funding.public = 0;
    plan.milestones.political = state.date;
    plan.stage = "finance";
    politics(state).talks = undefined;
    note(state, "Going ahead with private money.");
    return "We'll pay for it ourselves: financing is next.";
  }
  if (choice === "renegotiate") {
    t.status = "talks";
    t.round++;
    t.ask = Math.round(t.ask * 0.75 / M) * M;
    t.parts = splitAsk(t.ask, plan);
    t.councilDate = addDays(state.date, 180);
    delete t.council;
    delete t.referendum;
    note(state, `Back to the table with a ${money(t.ask)} ask.`);
    return `Another round at ${money(t.ask)}; the council votes again around ${shortDate(t.councilDate)}.`;
  }
  plan.stage = "shelved";
  politics(state).talks = undefined;
  if (choice === "relocate") {
    c.exploreRelocation = state.date;
    for (const o of standingState(state).officials) o.lean = Math.max(0, o.lean - 8);
    news(state, `${TEAM_BY_ID[state.userTeam].name} say they will explore other markets after the stadium vote`);
    return "We've said publicly that other markets are an option. The city's officials are not happy.";
  }
  return "Plan shelved. Renovations are on the stadium projects list.";
}

/** Meet the officials during talks: a small push, more when voters like the club. */
export function lobby(state: GameState): string | null {
  const t = politics(state).talks;
  if (!t || t.status !== "talks") return "There are no talks to lobby for.";
  const last = politics(state).log.find((l) => l.text.startsWith("Lobbied"));
  if (last && daysBetween(last.date, state.date) < 30) return "We lobbied this month; more looks like pressure.";
  post(state, "community", -100_000, "Stadium lobbying and civic events");
  t.push += 2;
  note(state, "Lobbied the council.");
  return "The council members heard us out.";
}

export function politicsDaily(state: GameState): void {
  sponsorQuestion(state);
  const t = state.politics?.talks;
  if (!t || t.status !== "talks") return;
  if (t.impact && state.date === t.impact.date) news(state, `${TEAM_BY_ID[state.userTeam].name}' study projects ${money(t.impact.claim)} a year in new activity and ${t.impact.jobs.toLocaleString("en-US")} jobs`);
  if (!t.independent && daysBetween(t.opened, state.date) >= 45) independentStudy(state);
  if (!t.rival && daysBetween(t.opened, state.date) === 30) rivalBid(state);
  if (!t.env && state.date >= t.envDue) envReview(state);
  if (!t.council && t.env && state.date >= t.councilDate) councilVote(state);
  else if (t.referendum?.required && t.referendum.yes === undefined && state.date >= t.referendum.date!) referendum(state);
}

// ---- A sponsor asks about the stadium ----

/**
 * Sponsors signing long deals want to know where the team will play. With a
 * stadium plan under way, a lease running out, or talk of moving, a partner
 * up for renewal asks; telling them the plan keeps the relationship, and
 * saying nothing costs some of it.
 */
function sponsorQuestion(state: GameState): void {
  const p = politics(state);
  if (p.question && !p.question.answered && daysBetween(p.question.asked, state.date) >= 30) answerSponsor(state, false);
  if (!state.date.endsWith("-10") || (p.question && daysBetween(p.question.asked, state.date) < 365)) return;
  const c = state.construction;
  const plan = c?.plan;
  const lease = state.leases?.[state.userTeam];
  const unsettled = (plan && !["shelved", "open"].includes(plan.stage)) || !!c?.exploreRelocation || (lease && lease.through - RULES.season <= 3);
  if (!unsettled) return;
  const year = Number(state.date.slice(0, 4));
  const deal = (business(state).local?.deals ?? []).filter((d) => d.start + d.years - 1 <= year + 1 && d.value >= 1 * M).sort((a, b) => b.value - a.value)[0];
  if (!deal) return;
  p.question = { partner: deal.partner, cat: deal.cat, asked: state.date };
  send(state, "business", businessChief(state), `${deal.partner} asks about our stadium plans`,
    `${deal.partner} wants to know where we'll be playing before it signs another long deal. We can brief them on the plan, or keep it private for now (Business page).`);
}

/** Brief the sponsor (it keeps the relationship) or keep quiet (it costs some). */
export function answerSponsor(state: GameState, brief: boolean): string | null {
  const q = politics(state).question;
  if (!q || q.answered) return "No question to answer.";
  q.answered = brief ? "briefed" : "quiet";
  const deal = business(state).local?.deals.find((d) => d.partner === q.partner && d.cat === q.cat);
  if (deal) deal.rel = Math.max(0, Math.min(100, (deal.rel ?? 60) + (brief ? 8 : -6)));
  note(state, brief ? `Briefed ${q.partner} on the stadium plans.` : `Kept the stadium plans from ${q.partner}.`);
  return brief ? `${q.partner} appreciated the openness.` : `${q.partner} will remember being kept in the dark.`;
}
