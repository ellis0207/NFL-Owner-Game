// The club in its town, and the people who play for it. A team foundation
// with its own money (the club's share, the owner's personal gifts and what
// fundraisers bring in) gives grants to local nonprofits in the focus areas
// the owner picks; the groups and their applications are made up. Programs
// run youth flag and tackle leagues, coaching clinics, school visits,
// fundraisers, staff volunteer days and help for fans with disabilities. The
// community budget already pays for the usual ones; adding more costs money
// and builds trust slowly, and long commitments count more than one-off
// events. Thin oversight saves money and lets a bad grant turn into a story.
// Player services (orientation, money and life skills, confidential
// well-being support, family and housing help, career and retirement
// transition, alumni relations) follow the CBA's rules; nothing a player
// shares with them is ever shown to the owner. Players appear in the
// community on their own time, the ones whose personality fits.
import { changeMorale } from "./agents";
import { business, inflation, post } from "./business";
import { teamPlayerIds } from "./cap";
import { personality } from "./clubhouse";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { fanBase, trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { owner, ownerMoney } from "./ownership";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { cutShare } from "./treasury";
import { officialsLean } from "./standing";
import type { CommunityState, GameState, Grant } from "./types";

const M = 1_000_000;
const K = 1_000;

export const FOCUS = ["Youth sports", "Education", "Food security", "Health", "Neighborhoods", "Military families"];

/** Programs: yearly cost in 2026 dollars, and whether the community budget already pays for it. */
export const PROGRAMS: Record<string, { label: string; cost: number; base: boolean; people: number }> = {
  flag: { label: "Youth flag football leagues", cost: 0.5 * M, base: true, people: 6000 },
  schools: { label: "School visits and reading programs", cost: 0.2 * M, base: true, people: 20000 },
  fundraisers: { label: "Fundraisers for the foundation (galas, auctions, a 5K)", cost: 0.3 * M, base: true, people: 8000 },
  clinics: { label: "Tackle clinics and coaching education on safe technique", cost: 0.6 * M, base: false, people: 1500 },
  volunteer: { label: "Staff volunteer days (paid time off the desk)", cost: 0.3 * M, base: false, people: 2500 },
  access: { label: "Accessible game days and sensory rooms for fans with disabilities", cost: 0.4 * M, base: false, people: 3000 },
};
/** Player services, their yearly cost, and whether the club already runs them. */
export const SERVICES: Record<string, { label: string; cost: number; base: boolean }> = {
  orientation: { label: "Rookie orientation: league rules, money, the building, the media", cost: 0.15 * M, base: true },
  financial: { label: "Financial education with independent advisers", cost: 0.1 * M, base: true },
  lifeSkills: { label: "Life skills: media, social media, professional conduct", cost: 0.1 * M, base: true },
  wellbeing: { label: "Confidential well-being support with licensed clinicians", cost: 0.3 * M, base: true },
  family: { label: "Family services: childcare referrals, schools, spouses' network", cost: 0.4 * M, base: false },
  housing: { label: "Housing and relocation help for new players", cost: 0.3 * M, base: false },
  career: { label: "Career transition: degrees, internships and job contacts", cost: 0.5 * M, base: false },
  retirement: { label: "Retirement transition: benefits, health and next steps", cost: 0.3 * M, base: false },
  alumni: { label: "Alumni relations: events and a home for former players", cost: 0.4 * M, base: false },
};
export const OVERSIGHT = ["Thin: one coordinator", "Standard: staff review and a board", "Thorough: audits and site visits"];
const OVERSIGHT_COST = [-0.2 * M, 0, 0.3 * M];

/** Made-up local nonprofits that apply for grants. */
const ORGS: Record<string, string[]> = {
  "Youth sports": ["Northside Youth Football League", "Playfields for All", "Eastside Boys and Girls Club", "Little Huddle Flag League"],
  Education: ["Readers First", "Riverside Tutoring Collective", "Bright Futures Scholarship Fund", "Code Camp for Kids"],
  "Food security": ["Community Harvest Pantry", "Second Plate Kitchens", "Feed the Block", "Market on Wheels"],
  Health: ["Heart Smart Screening", "Free Clinic of the Valley", "Move More Coalition", "Safe Kids Concussion Project"],
  Neighborhoods: ["Habitat Builders Partnership", "Main Street Revival", "Parks Conservancy Friends", "Neighbors United"],
  "Military families": ["Homefront Alliance", "Veterans' Next Mission", "Blue Star Families Network", "Operation Welcome Home"],
};

export function community(state: GameState): CommunityState {
  return (state.community ??= {
    focus: ["Youth sports", "Education"],
    foundation: { balance: 4 * M, clubGift: 0, given: 0, raised: 0, ownerGiven: 0 },
    oversight: 1,
    autoLimit: 100 * K,
    programs: Object.fromEntries(Object.entries(PROGRAMS).map(([k, p]) => [k, p.base])),
    services: Object.fromEntries(Object.entries(SERVICES).map(([k, p]) => [k, p.base])),
    since: {},
    grants: [],
    appearances: { season: RULES.season, count: 0, players: {} },
    alumni: { events: 0, names: [] },
    partnership: false,
    reports: [],
  });
}

const extra = (on: boolean, base: boolean) => (on ? 1 : 0) - (base ? 1 : 0);

/** How long a program has run, as a weight: commitments count for more than one-off events. */
function commitment(c: CommunityState, k: string): number {
  const since = c.since[k];
  return since == null ? 1 : Math.min(2, 0.6 + (RULES.season - since) * 0.35);
}

/** Yearly cost beyond the community budget (negative when the owner cut something it pays for). */
export function extraCost(state: GameState): number {
  const c = community(state);
  let cost = OVERSIGHT_COST[c.oversight] + (c.partnership ? 0.5 * M : 0) + c.foundation.clubGift;
  for (const [k, p] of Object.entries(PROGRAMS)) cost += extra(!!c.programs[k], p.base) * p.cost;
  for (const [k, p] of Object.entries(SERVICES)) cost += extra(!!c.services[k], p.base) * p.cost;
  return cost * inflation(leagueYear(state.date), 0.03);
}

// ---- The owner's choices ----

export function setProgram(state: GameState, k: string, on: boolean): void {
  const c = community(state);
  c.programs[k] = on;
  if (on) c.since[k] ??= RULES.season;
  else delete c.since[k];
}
export function setService(state: GameState, k: string, on: boolean): void {
  const c = community(state);
  c.services[k] = on;
  if (on) c.since[`svc:${k}`] ??= RULES.season;
  else delete c.since[`svc:${k}`];
}
export function setFocus(state: GameState, focus: string[]): string | null {
  if (!focus.length || focus.length > 3) return "Pick one to three focus areas.";
  community(state).focus = focus.filter((f) => FOCUS.includes(f));
  return null;
}
export function setOversight(state: GameState, level: 0 | 1 | 2): void {
  community(state).oversight = level;
}
export function setClubGift(state: GameState, perYear: number): void {
  community(state).foundation.clubGift = Math.max(0, Math.min(10 * M, Math.round(perYear / (100 * K)) * 100 * K));
}
export function setAutoLimit(state: GameState, amount: number): void {
  community(state).autoLimit = Math.max(0, Math.min(500 * K, amount));
}
export function setPartnership(state: GameState, on: boolean): void {
  const c = community(state);
  c.partnership = on;
  if (on) c.since.city ??= RULES.season;
  else delete c.since.city;
}

/** The owner's own money into the foundation: out of the owner's pocket, not the club's books. */
export function ownerGift(state: GameState, amount: number): string | null {
  const o = owner(state);
  if (amount <= 0) return "Pick an amount.";
  if (o.liquid < amount) return `You have ${money(o.liquid)} outside the team.`;
  ownerMoney(state, -amount);
  // A personal gift to a charity isn't money put into the club.
  o.putIn -= amount;
  const c = community(state);
  c.foundation.balance += amount;
  c.foundation.ownerGiven += amount;
  fanBase(state).trust = Math.min(100, fanBase(state).trust + Math.min(2, amount / (5 * M)));
  news(state, `${state.ownerName} gives ${money(amount)} to the ${TEAM_BY_ID[state.userTeam].name} Foundation`);
  return null;
}

export function decideGrant(state: GameState, id: string, approve: boolean): string | null {
  const c = community(state);
  const g = c.grants.find((x) => x.id === id);
  if (!g || g.status !== "pending") return "That application is closed.";
  if (approve && c.foundation.balance < g.amount) return `The foundation has ${money(c.foundation.balance)}.`;
  g.status = approve ? "approved" : "declined";
  if (approve) {
    c.foundation.balance -= g.amount;
    c.foundation.given += g.amount;
  }
  return null;
}

/** What the staff can tell about an application: its quality as they read it, sharper with more oversight. */
export function staffRead(state: GameState, g: Grant): number {
  const rng = rngFor(state.seed, `grant-read:${g.id}`);
  return Math.max(0, Math.min(1, g.quality + gaussian(rng) * [0.3, 0.18, 0.08][community(state).oversight]));
}

// ---- What it does ----

/** Fewer conduct problems among our players from the services beyond the usual. */
export function disciplineCut(state: GameState): number {
  const c = state.community;
  if (!c) return 0;
  return Math.max(0, 0.12 * extra(!!c.services.family, false) + 0.06 * extra(!!c.services.career, false));
}
/** A small pull to stay, for our own free agents, from the services beyond the usual. */
export function loyaltyPull(state: GameState): number {
  const c = state.community;
  if (!c) return 0;
  return 0.01 * (extra(!!c.services.family, false) + extra(!!c.services.career, false) + extra(!!c.services.housing, false));
}
/** How players rate the services, 1-10, for the facilities survey. */
export function servicesScore(state: GameState): number {
  const c = state.community;
  if (!c) return 6.5;
  let s = 6.5;
  for (const [k, p] of Object.entries(SERVICES)) s += extra(!!c.services[k], p.base) * (p.base ? 0.6 : 0.35);
  return Math.max(1, Math.min(10, s));
}
/** The city's goodwill in lease talks: shared programs and long commitments. */
export function cityGoodwill(state: GameState): number {
  const c = state.community;
  if (!c) return 0;
  return (c.partnership ? 0.04 * commitment(c, "city") : 0) + 0.01 * Object.entries(PROGRAMS).filter(([k, p]) => !p.base && c.programs[k]).length - cutShare(state, "community") * 0.05 + officialsLean(state);
}
/** The owner's community score, beyond the budget, fan goodwill and projects already counted. */
export function communityScore(state: GameState): number {
  const c = state.community;
  if (!c) return 0;
  const programs = Object.entries(PROGRAMS).reduce((a, [k, p]) => a + extra(!!c.programs[k], p.base) * 3 * (c.programs[k] ? commitment(c, k) : 1), 0);
  return Math.max(-10, Math.min(15, programs + (c.partnership ? 3 : 0) + Math.min(6, (c.foundation.given + c.foundation.ownerGiven) / (2 * M))));
}

// ---- The months ----

function applications(state: GameState): void {
  const c = community(state);
  const rng = rngFor(state.seed, `grants:${state.date}`);
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const area = c.focus[Math.floor(rng() * c.focus.length)];
    const list = ORGS[area];
    const g: Grant = {
      id: `grant-${state.date}-${i}`, date: state.date, org: list[Math.floor(rng() * list.length)], area,
      amount: Math.round((25 + rng() * rng() * 375) / 5) * 5 * K, status: "pending", quality: Math.max(0, Math.min(1, 0.65 + gaussian(rng) * 0.22)),
    };
    // The staff approves small grants that look sound; the rest wait for the owner.
    const read = staffRead(state, g);
    if (g.amount <= c.autoLimit && read >= 0.5 && c.foundation.balance >= g.amount) {
      g.status = "approved";
      c.foundation.balance -= g.amount;
      c.foundation.given += g.amount;
    } else if (read < 0.35) g.status = "declined";
    c.grants.unshift(g);
  }
  c.grants.length = Math.min(c.grants.length, 80);
  for (const g of c.grants) if (g.status === "pending" && g.date < addDays(state.date, -30)) g.status = "declined";
  const pending = c.grants.filter((g) => g.status === "pending").length;
  if (pending) send(state, "business", foundationHead(state), `${pending} grant application${pending > 1 ? "s" : ""} for the foundation`, "They're on the Business page under Community, with our read on each group.");
}

/** Six months on, a grant shows what it did, and a weak group can misuse it. */
function outcomes(state: GameState): void {
  const c = community(state);
  for (const g of c.grants) {
    if (g.status !== "approved" || g.outcome || g.date > addDays(state.date, -180)) continue;
    const rng = rngFor(state.seed, `grant-outcome:${g.id}`);
    if (g.quality < 0.35 && rng() < [0.5, 0.25, 0.08][c.oversight]) {
      g.outcome = "Misused: the money went to salaries and a gala, not the program.";
      trustHit(state, -2, 0.5, `A foundation grant to ${g.org} was misused`);
      if (state.culture) state.culture.rel.community = Math.max(0, state.culture.rel.community - 5);
      addStory(state, {
        outlet: "ledger", by: MEDIA_BY_ID.ledger.reporter, kind: "owner", teams: [state.userTeam],
        headline: `Questions about a ${TEAM_BY_ID[state.userTeam].name} Foundation grant`,
        body: `A ${money(g.amount)} grant to ${g.org} paid for salaries and a fundraising gala instead of the program it was meant for. The foundation says it is tightening its reviews.`,
      });
    } else g.outcome = g.quality >= 0.7 ? "Did what it promised, and more." : "Did most of what it promised.";
  }
}

function monthly(state: GameState): void {
  const c = community(state);
  const year = leagueYear(state.date);
  const cost = extraCost(state) / 12;
  if (cost) post(state, "community", -cost, cost > 0 ? "Community programs, player services and foundation gifts beyond the budget" : "Community programs cut below the budget");
  // The foundation's money: the club's share of the community budget, its gifts and the fundraisers.
  const share = [0.5, 1, 1.5, 2][business(state).budget.community] * M * inflation(year, 0.03) / 12;
  const raised = (c.programs.fundraisers ? 1.2 * M : 0) * inflation(year, 0.03) / 12 * (0.8 + fanBase(state).trust / 250);
  c.foundation.balance += share + raised + c.foundation.clubGift / 12;
  c.foundation.raised += raised;
  applications(state);
  outcomes(state);
  // Programs beyond the usual build trust and loyalty slowly; cutting the usual ones costs some.
  const f = fanBase(state);
  for (const [k, p] of Object.entries(PROGRAMS)) {
    const d = extra(!!c.programs[k], p.base);
    if (!d) continue;
    const w = d > 0 ? commitment(c, k) : 1;
    f.trust = Math.max(0, Math.min(100, f.trust + d * 0.04 * w));
    if (k === "flag" || k === "clinics") f.core = Math.max(10, Math.min(95, f.core + d * 0.01 * w));
    if (k === "access" || k === "flag") f.sat.families = Math.max(0, Math.min(100, f.sat.families + d * 0.15 * w));
  }
  if (state.culture) state.culture.rel.community = Math.max(0, Math.min(100, state.culture.rel.community + (c.partnership ? 0.3 : 0) + (c.programs.volunteer ? 0.2 : 0)));
  appearances(state);
  alumni(state);
}

/** Players who want to, out in the community on their days off. */
function appearances(state: GameState): void {
  const c = community(state);
  if (c.appearances.season !== RULES.season) c.appearances = { season: RULES.season, count: 0, players: {} };
  const month = Number(state.date.slice(5, 7));
  const inSeason = month >= 9 || month <= 1;
  const rng = rngFor(state.seed, `appear:${state.date}`);
  for (const id of teamPlayerIds(state, state.userTeam)) {
    const p = personality(id);
    // Rest comes first in season: fewer visits, on the off day.
    const chance = (p.presence * 0.5 + p.leadership * 0.5 - 0.35) * (inSeason ? 0.5 : 1);
    if (rng() < chance) {
      c.appearances.count++;
      c.appearances.players[id] = (c.appearances.players[id] ?? 0) + 1;
    }
  }
}

function alumni(state: GameState): void {
  const c = community(state);
  const us = state.userTeam;
  const names = Object.entries(state.players).filter(([, p]) => p.status === "retired" && p.lastTeam === us).map(([id]) => PLAYER_BY_ID[id]?.name).filter(Boolean) as string[];
  const fresh = names.filter((n) => !c.alumni.names.includes(n));
  if (fresh.length && c.services.retirement) send(state, "staff", "Player engagement", "Retirement transition", `${fresh.slice(0, 4).join(", ")} ${fresh.length > 1 ? "have" : "has"} retired. Our retirement program set up benefits counseling, a health review and introductions for what comes next.`);
  c.alumni.names = names.slice(-200);
  const month = Number(state.date.slice(5, 7));
  if (c.services.alumni && names.length && (month === 4 || month === 10)) {
    c.alumni.events++;
    c.alumni.last = state.date;
    fanBase(state).core = Math.min(95, fanBase(state).core + 0.05);
  }
}

function foundationHead(state: GameState): string {
  return `${TEAM_BY_ID[state.userTeam].name} Foundation`;
}

/** The yearly report the foundation publishes: money in and out, grants, who took part, and what came of it. */
function report(state: GameState): void {
  const c = community(state);
  const year = leagueYear(state.date);
  const grants = c.grants.filter((g) => g.status === "approved" && leagueYear(g.date) === year);
  const spent = grants.reduce((a, g) => a + g.amount, 0);
  const people = Object.entries(PROGRAMS).reduce((a, [k, p]) => a + (c.programs[k] ? p.people : 0), 0);
  const misused = c.grants.filter((g) => g.outcome?.startsWith("Misused") && leagueYear(g.date) === year).length;
  const text = `${grants.length} grants for ${money(spent)} in ${c.focus.join(", ").toLowerCase()}; about ${people.toLocaleString("en-US")} people in our programs; ${c.appearances.count} player appearances. ` +
    `Balance ${money(c.foundation.balance)}. Oversight: ${OVERSIGHT[c.oversight].split(":")[0].toLowerCase()}.${misused ? ` ${misused} grant${misused > 1 ? "s were" : " was"} misused.` : ""}`;
  c.reports.unshift({ year, spent, grants: grants.length, participants: people, text });
  c.reports.length = Math.min(c.reports.length, 10);
  send(state, "business", foundationHead(state), `${year} foundation report`, `Published on the club's website: ${text}`);
}

export function communityDaily(state: GameState): void {
  const K_ = RULES.keyDates;
  if (state.date.endsWith("-01")) monthly(state);
  if (state.date === addDays(K_.newLeagueYear, -1)) report(state);
  // Housing help and orientation settle the rookies in before camp.
  if (state.date === addDays(K_.regularSeasonStart, -45) && state.community?.services.housing) {
    for (const id of teamPlayerIds(state, state.userTeam)) if ((state.players[id].exp ?? 0) === 0) changeMorale(state, id, 3);
  }
}
