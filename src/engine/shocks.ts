// Shocks and insurance. Now and then something goes badly wrong: a fire, a
// flood, a structural defect or a power and systems failure closes part or
// all of the stadium; a big sponsor collapses; attendance slumps; repairs,
// inflation or a construction overrun blow up the budget. The club buys
// property, liability and business-interruption cover with limits and
// deductibles, priced on its risk controls (the building's condition,
// security, compliance and financial controls). Claims go through the
// deductible, the adjuster, sometimes a dispute, and pay out weeks or
// months later; what a policy excludes the club pays itself. If an owner
// can't put money in when the club needs it, the club is in distress: new
// investors, refinancing or a control partner, and the league can step in
// and supervise a recovery plan. Events are made up.
import { business, businessChief, cashBalance, inflation, post, valuation } from "./business";
import { localDeals, dealValue } from "./commerce";
import { creditLimit } from "./debt";
import { addDays, daysBetween } from "./dates";
import { shockEconomy } from "./economy";
import { stadiumCondition } from "./facilities";
import { securityFactor } from "./departments";
import { money, news, send } from "./inbox";
import { TEAMS, teamLabel } from "./league";
import { owner } from "./ownership";
import { rngFor } from "./rng";
import type { GameState } from "./types";

const M = 1_000_000;

export type Cover = "property" | "liability" | "interruption";

export interface Policy { limit: number; deductible: number; on: boolean }

export interface Disruption {
  id: string;
  kind: "fire" | "flood" | "structural" | "power";
  date: string;
  until: string;
  /** Share of the building usable: 0 means the games move. */
  capacity: number;
  repair: number;
  /** Gate money lost to it so far (for the business-interruption claim). */
  lost: number;
  text: string;
}

export interface Claim {
  id: string;
  cover: Cover;
  event: string;
  filed: string;
  loss: number;
  /** What the policy pays after the deductible and the limit, before any dispute. */
  covered: number;
  due: string;
  status: "open" | "disputed" | "paid" | "denied";
  paid?: number;
  note: string;
}

export interface ShockState {
  policies: Record<Cover, Policy>;
  /** Flood is excluded from property cover unless the club buys this rider. */
  flood: boolean;
  disruptions: Disruption[];
  claims: Claim[];
  /** An attendance slump until a date, as a demand multiple. */
  slump?: { until: string; mult: number };
  distress?: { since: string; stage: "distress" | "supervised" | "recovered"; plan?: string[]; supervisedSince?: string; stakeSold: number; options: string[] };
  log: { date: string; text: string }[];
}

export const COVERS: Record<Cover, { label: string; what: string; base: number }> = {
  property: { label: "Property", what: "Damage to the stadium, offices and practice facility from fire, storms and accidents (flood only with the rider; wear and tear never).", base: 0.0011 },
  liability: { label: "Liability", what: "Claims by fans, guests and others hurt on our property or by our operations.", base: 0.012 },
  interruption: { label: "Business interruption", what: "Gate, suite and game-day money lost while covered damage keeps the stadium closed or cut back.", base: 0.018 },
};

const DEFAULT_LIMITS: Record<Cover, Policy> = {
  property: { limit: 500 * M, deductible: 2 * M, on: true },
  liability: { limit: 100 * M, deductible: 250_000, on: true },
  interruption: { limit: 60 * M, deductible: 1 * M, on: true },
};

export function shocks(state: GameState): ShockState {
  const s = (state.shocks ??= { policies: JSON.parse(JSON.stringify(DEFAULT_LIMITS)), flood: false, disruptions: [], claims: [], log: [] });
  return s;
}

function note(state: GameState, text: string): void {
  const s = shocks(state);
  s.log.unshift({ date: state.date, text });
  s.log.length = Math.min(s.log.length, 40);
}

// ---- Premiums ----

/** How insurers see our risk (1 = typical): the building's shape, security, compliance and financial controls, and past claims. */
export function riskScore(state: GameState): number {
  const cond = state.facilities ? stadiumCondition(state) : 65;
  const building = Math.max(0.8, Math.min(1.5, 1 + (60 - cond) / 100));
  const controls = [1.08, 1, 0.96, 0.93][state.treasury?.controls ?? 1] ?? 1;
  const compliance = [1.06, 1, 0.97, 0.95][state.compliance?.staff ?? 1] ?? 1;
  const claims = 1 + 0.08 * shocks(state).claims.filter((c) => daysBetween(c.filed, state.date) < 1095 && c.status !== "denied").length;
  return Math.round(building * securityFactor(state) ** 0.5 * controls * compliance * claims * 100) / 100;
}

/** A year's premium for a cover at its limit and deductible, at our risk score. */
export function premium(state: GameState, cover: Cover, p: Policy = shocks(state).policies[cover], risk = riskScore(state)): number {
  if (!p.on) return 0;
  // A higher deductible saves money; the first dollars of cover cost the most.
  const ded = Math.pow(DEFAULT_LIMITS[cover].deductible / Math.max(50_000, p.deductible), 0.25);
  const lim = Math.pow(p.limit / DEFAULT_LIMITS[cover].limit, 0.7);
  const flood = cover === "property" && shocks(state).flood ? 1.25 : 1;
  const year = Number(state.date.slice(0, 4));
  return Math.round(DEFAULT_LIMITS[cover].limit * COVERS[cover].base * ded * lim * risk * flood * inflation(year, 0.04) / 1000) * 1000;
}

/** The standard package at a typical risk: the stadium line in the budget has always included it. */
function budgetedPremium(state: GameState): number {
  const year = Number(state.date.slice(0, 4));
  return (Object.keys(COVERS) as Cover[]).reduce((t, c) => t + DEFAULT_LIMITS[c].limit * COVERS[c].base * inflation(year, 0.04), 0);
}

export function setPolicy(state: GameState, cover: Cover, p: Partial<Policy>): string | null {
  const s = shocks(state);
  if (s.disruptions.some((d) => d.until >= state.date) && p.on === false) return "Insurers won't let cover lapse during an open loss.";
  Object.assign(s.policies[cover], p);
  return null;
}

export function setFlood(state: GameState, on: boolean): void {
  shocks(state).flood = on;
}

/** Liability cover pays this share of an injury claim against the club (legal.ts reads it). */
export function liabilityShare(state: GameState): number {
  return state.shocks && !state.shocks.policies.liability.on ? 0 : 0.8;
}

// ---- Stadium disruptions ----

const DISRUPTIONS: { kind: Disruption["kind"]; text: string; covered: (state: GameState) => boolean }[] = [
  { kind: "fire", text: "a fire in the upper concourse", covered: () => true },
  { kind: "flood", text: "flooding in the lower levels after a storm", covered: (state) => shocks(state).flood },
  { kind: "structural", text: "engineers found a structural defect in a section of seating", covered: (state) => !state.facilities || stadiumCondition(state) >= 40 },
  { kind: "power", text: "a power and systems failure took out lighting and scanners", covered: () => true },
];

/** The share of the building open for a game on a date (1 when nothing is wrong). */
export function capacityOn(state: GameState, date: string): number {
  const d = state.shocks?.disruptions.find((x) => x.date <= date && x.until >= date);
  return d ? d.capacity : 1;
}

/** A home game's money is cut by a disruption; the loss is kept for the interruption claim. */
export function disruptGate(state: GameState, date: string, revenue: number): number {
  const d = state.shocks?.disruptions.find((x) => x.date <= date && x.until >= date);
  if (!d) return 1;
  // A moved game keeps some money at the borrowed stadium.
  const keep = d.capacity === 0 ? 0.35 : d.capacity;
  d.lost += Math.round(revenue * (1 - keep));
  return keep;
}

export function startDisruption(state: GameState, kind?: Disruption["kind"], severe?: boolean): Disruption {
  const s = shocks(state);
  const rng = rngFor(state.seed, `disruption:${state.date}`);
  const def = DISRUPTIONS.find((x) => x.kind === kind) ?? DISRUPTIONS[Math.floor(rng() * DISRUPTIONS.length)];
  const big = severe ?? rng() < 0.3;
  const year = Number(state.date.slice(0, 4));
  const d: Disruption = {
    id: `${state.date}:${def.kind}`, kind: def.kind, date: state.date,
    until: addDays(state.date, big ? 45 + Math.floor(rng() * 75) : 10 + Math.floor(rng() * 25)),
    capacity: big ? (rng() < 0.5 ? 0 : 0.55) : 0.8,
    repair: Math.round(((big ? 20 + rng() * 50 : 2 + rng() * 8) * M * inflation(year, 0.04) * (state.economy?.now.construction ?? 1)) / 100_000) * 100_000,
    lost: 0, text: def.text,
  };
  s.disruptions.unshift(d);
  s.disruptions.length = Math.min(s.disruptions.length, 20);
  post(state, "stadium", -d.repair, `Emergency repairs: ${def.text}`);
  const cover = def.covered(state) && s.policies.property.on;
  if (cover) fileClaim(state, "property", d.id, d.repair);
  else note(state, `Not covered: ${def.text}. ${def.kind === "flood" ? "Flood is excluded without the rider." : def.kind === "structural" ? "The insurer calls it deferred maintenance, which the policy excludes." : "No property cover."} We pay the ${money(d.repair)} ourselves.`);
  send(state, "business", businessChief(state), `Stadium emergency: ${def.text}`,
    `Overnight ${def.text}. ${d.capacity === 0 ? "The stadium is closed and the league is moving our home games until it reopens" : d.capacity < 0.7 ? `Only ${Math.round(d.capacity * 100)}% of the seats are usable` : "Part of the building is closed"} until about ${d.until}. ` +
    `Repairs come to about ${money(d.repair)}${cover ? "; we've filed with the property insurer" : ", and the insurer won't cover it"}.`);
  news(state, `${teamLabel(state.userTeam)} stadium damaged: ${def.text}`);
  return d;
}

// ---- Claims ----

export function fileClaim(state: GameState, cover: Cover, event: string, loss: number): Claim | null {
  const s = shocks(state);
  const p = s.policies[cover];
  if (!p.on) return null;
  const covered = Math.max(0, Math.min(p.limit, loss - p.deductible));
  const rng = rngFor(state.seed, `claim:${cover}:${event}`);
  const c: Claim = { id: `${event}:${cover}`, cover, event, filed: state.date, loss, covered, due: addDays(state.date, 45 + Math.floor(rng() * 90)), status: covered ? "open" : "denied", note: covered ? "With the adjuster" : "Below the deductible" };
  s.claims.unshift(c);
  s.claims.length = Math.min(s.claims.length, 40);
  note(state, `Claim filed with the ${COVERS[cover].label.toLowerCase()} insurer: ${money(loss)} loss, ${money(covered)} after the deductible${covered >= p.limit ? " and the limit" : ""}.`);
  return c;
}

/** Take the insurer's settlement offer now on a disputed claim: less money, sooner. */
export function settleClaim(state: GameState, id: string): string | null {
  const c = shocks(state).claims.find((x) => x.id === id);
  if (!c || c.status !== "disputed") return "Only a disputed claim can be settled.";
  pay(state, c, Math.round(c.covered * 0.8), "Settled the disputed claim at the insurer's offer");
  return null;
}

function pay(state: GameState, c: Claim, amount: number, why: string): void {
  c.status = "paid";
  c.paid = amount;
  c.note = why;
  post(state, "insurance", amount, `Insurance recovery: ${COVERS[c.cover].label.toLowerCase()} claim`);
  note(state, `${why}: ${money(amount)} from the ${COVERS[c.cover].label.toLowerCase()} insurer.`);
}

function claimStep(state: GameState, c: Claim): void {
  const rng = rngFor(state.seed, `claimStep:${c.id}:${c.status}`);
  if (c.status === "open") {
    // Adjusters push back now and then, more when records are thin.
    const odds = 0.2 * (state.legal?.retention === "minimal" ? 1.6 : 1);
    if (rng() < odds) {
      c.status = "disputed";
      c.due = addDays(state.date, 90);
      c.note = "The insurer disputes part of the claim";
      send(state, "business", businessChief(state), "Insurer disputes our claim",
        `The ${COVERS[c.cover].label.toLowerCase()} insurer disputes part of our ${money(c.covered)} claim. We can take its offer of ${money(Math.round(c.covered * 0.8))} now on the Business page, or wait about three months for the adjusters and appraisers.`);
    } else pay(state, c, c.covered, "Claim paid in full");
  } else if (c.status === "disputed") {
    pay(state, c, Math.round(c.covered * (0.65 + rng() * 0.35)), "Disputed claim resolved by appraisal");
  }
}

// ---- Revenue and cost shocks ----

function revenueShock(state: GameState, rng: () => number): void {
  if (rng() < 0.5) {
    const year = Number(state.date.slice(0, 4));
    const deals = localDeals(state).deals.filter((d) => d.cat !== "naming" && !d.ended && dealValue(d, year) > 0).sort((a, b) => b.value - a.value);
    const d = deals[Math.floor(rng() * Math.min(3, deals.length))];
    if (!d) return;
    d.ended = state.date;
    d.years = Math.max(0, year - d.start);
    send(state, "business", businessChief(state), `${d.partner} has collapsed`,
      `${d.partner}, one of our biggest partners, filed for bankruptcy this morning. Its ${money(d.value)}-a-year deal is gone, and the receivable will be worth cents on the dollar. We'll resell the category in February.`);
    news(state, `${d.partner} files for bankruptcy, leaving a hole in the ${teamLabel(state.userTeam)}' sponsorship roster`);
    note(state, `Revenue shock: ${d.partner} collapsed, taking ${money(d.value)} a year.`);
  } else {
    const s = shocks(state);
    s.slump = { until: addDays(state.date, 180), mult: 0.95 };
    send(state, "business", businessChief(state), "Ticket demand has slumped",
      "Single-game sales and renewals are running about 5% behind across the market, and not just for us. The sales staff expects it to last a few months.");
    note(state, "Revenue shock: attendance demand down about 5% for six months.");
  }
}

function costShock(state: GameState, rng: () => number): void {
  const r = rng();
  const year = Number(state.date.slice(0, 4));
  if (r < 0.4) {
    const cost = Math.round(((3 + rng() * 6) * M * inflation(year, 0.04)) / 100_000) * 100_000;
    post(state, "stadium", -cost, "Required repairs found by inspectors");
    send(state, "business", businessChief(state), "Inspectors require repairs", `The city's inspectors require ${money(cost)} of repairs to ramps and railings before the next home game. It isn't insurable damage; it's upkeep that came due.`);
    note(state, `Cost shock: ${money(cost)} of required repairs.`);
  } else if (r < 0.7) {
    shockEconomy(state, { inflation: 1.5 + rng() * 1.5 });
    note(state, "Cost shock: an inflation spike is coming through prices and wages.");
    news(state, "Inflation jumps as energy and supply costs spike");
  } else {
    const p = (business(state).projects ?? []).find((x) => !x.opened);
    if (!p) return;
    const over = Math.round((p.cost * (0.08 + rng() * 0.17)) / 100_000) * 100_000;
    p.cost += over;
    send(state, "business", businessChief(state), `Cost overrun on the ${p.id} project`, `The contractor reports a ${money(over)} overrun on the ${p.id} project: materials and labor ran over the bid. The schedule holds.`);
    note(state, `Cost shock: ${money(over)} overrun on the ${p.id} project.`);
  }
}

// ---- Financial distress ----

/** An owner who can't fund the club: personal borrowing past what lenders accept, or nothing left to sell. */
export function ownerTapped(state: GameState): boolean {
  if (state.settings.finances === "relaxed" || !state.owner) return false;
  const o = owner(state);
  return o.personalDebt > Math.max(100 * M, 0.15 * o.purchase) || (o.liquid + o.outside < 10 * M && cashBalance(state) < -creditLimit(state) * 0.5);
}

export const DISTRESS_OPTIONS: Record<string, string> = {
  investors: "Sell a minority stake to outside investors: money in, a smaller share for you (league approval needed).",
  refinance: "Refinance the club's debt on the Financing page: longer terms, higher rates.",
  partner: "Bring in a control partner who funds the club and takes a large stake and a say in the business.",
};

export function distressOption(state: GameState, key: string): string | null {
  const s = shocks(state);
  const d = s.distress;
  if (!d || d.stage === "recovered") return "The club isn't in distress.";
  const o = owner(state);
  const value = valuation(state, state.userTeam);
  if (key === "investors" || key === "partner") {
    const share = key === "investors" ? 0.15 : 0.3;
    if (d.stakeSold + share > 0.49) return "League rules require you to keep control: you can't sell more.";
    const money_ = Math.round(value * share * (key === "investors" ? 0.85 : 0.95));
    d.stakeSold = Math.round((d.stakeSold + share) * 100) / 100;
    o.personalDebt = Math.max(0, o.personalDebt - money_);
    o.liquid += Math.max(0, money_ - o.personalDebt);
    d.options.push(key);
    note(state, `${key === "investors" ? "Minority investors" : "A control partner"} bought ${Math.round(share * 100)}% of the club for ${money(money_)}, approved by the league's finance committee.`);
    news(state, `The ${teamLabel(state.userTeam)} owner sells a ${Math.round(share * 100)}% stake to ${key === "investors" ? "outside investors" : "a new partner"}`);
    if (!ownerTapped(state)) recover(state);
    return null;
  }
  if (key === "refinance") {
    d.options.push(key);
    return "Ask lenders for terms on the Financing page; the league must approve anything over its debt limit.";
  }
  return "No such option.";
}

function recover(state: GameState): void {
  const d = shocks(state).distress!;
  d.stage = "recovered";
  note(state, "The club is out of distress and the league's supervision has ended.");
  send(state, "league", "League Office", "Supervision ended", "The finance committee is satisfied the club can meet its obligations. The recovery plan's limits are lifted.");
}

function distressMonthly(state: GameState): void {
  const s = shocks(state);
  const d = s.distress;
  if (!d || d.stage === "recovered") {
    if (ownerTapped(state)) {
      s.distress = { since: state.date, stage: "distress", stakeSold: d?.stakeSold ?? 0, options: [] };
      send(state, "business", businessChief(state), "The club is in financial distress",
        "You can't put more money in, and the club has run through its credit. The options are on the Owner page: outside investors, refinancing, or a control partner. If nothing changes in two months, the league will step in.");
      news(state, `Questions grow about the ${teamLabel(state.userTeam)} owner's finances`);
    }
    return;
  }
  if (d.stage === "distress" && daysBetween(d.since, state.date) >= 60) {
    d.stage = "supervised";
    d.supervisedSince = state.date;
    d.plan = [
      "Department budgets held at league average or below for three years",
      "No distributions to the owner until the plan is met",
      "New debt, stadium projects and contracts over 5% of the cap need the finance committee's approval",
      "Quarterly reports to the league office",
    ];
    if (state.business) for (const k of Object.keys(state.business.budget) as (keyof typeof state.business.budget)[]) state.business.budget[k] = Math.min(1, state.business.budget[k]) as never;
    send(state, "league", "League Office", "League supervision of the club",
      `The league's finance committee is supervising the club under a three-year recovery plan: ${d.plan.join("; ")}.`);
    news(state, `The league steps in to supervise the ${teamLabel(state.userTeam)}' finances`);
  }
  if (d.stage === "supervised" && state.business) {
    for (const k of Object.keys(state.business.budget) as (keyof typeof state.business.budget)[]) state.business.budget[k] = Math.min(1, state.business.budget[k]) as never;
    if (!ownerTapped(state) && cashBalance(state) > 0 && daysBetween(d.supervisedSince!, state.date) >= 180) recover(state);
  }
}

/** Under league supervision, distributions and new commitments wait for the plan. */
export function supervised(state: GameState): boolean {
  return state.shocks?.distress?.stage === "supervised";
}

// ---- The day ----

export function shocksDaily(state: GameState): void {
  if (!state.business) return;
  const s = shocks(state);
  for (const c of s.claims) if ((c.status === "open" || c.status === "disputed") && state.date >= c.due) claimStep(state, c);
  // A disruption ending files the business-interruption claim for the money lost.
  for (const d of s.disruptions) {
    if (d.until === state.date && d.lost > 0) {
      const covered = DISRUPTIONS.find((x) => x.kind === d.kind)!.covered(state);
      if (covered && s.policies.interruption.on) fileClaim(state, "interruption", d.id, d.lost);
      else note(state, `The ${money(d.lost)} of lost game money isn't covered.`);
    }
  }
  if (s.slump && state.date > s.slump.until) delete s.slump;
  if (state.date.endsWith("-01")) {
    // Premiums monthly; the stadium budget always carried the standard package, so it comes back off that line.
    const total = (Object.keys(COVERS) as Cover[]).reduce((t, c) => t + premium(state, c), 0);
    post(state, "insurance", -Math.round(total / 12), "Insurance premiums: property, liability and business interruption");
    post(state, "stadium", Math.round(budgetedPremium(state) / 12), "Insurance moved to its own line");
    distressMonthly(state);
    const rng = rngFor(state.seed, `shock:${state.date}`);
    // A serious stadium disruption about once a decade; revenue and cost shocks about once every four or five years each.
    if (rng() < 0.1 / 12 && !s.disruptions.some((d) => d.until >= state.date)) startDisruption(state);
    else if (rng() < 0.22 / 12) revenueShock(state, rng);
    else if (rng() < 0.22 / 12) costShock(state, rng);
    // Other clubs: one lands in league supervision about once every fifteen years.
    if (rng() < 1 / 180) {
      const others = TEAMS.filter((t) => t.id !== state.userTeam);
      news(state, `The league's finance committee places the ${teamLabel(others[Math.floor(rng() * others.length)].id)} under supervision after their owner misses capital calls`);
    }
  }
}
