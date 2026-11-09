// Three support departments, each with a director (made up) who reports to
// an executive, a budget level, a few standing policies, quarterly numbers
// and an incident log. Travel (under the COO) charters the team plane, books
// hotels and buses, ships the equipment and files a report after every trip;
// the cost follows the distance, and arriving early for a long trip takes the
// edge off the body clock. Security (under stadium operations) runs
// credentials, threat monitoring, background checks, emergency drills that
// make game-day incidents smaller, a reporting channel and the league's
// gambling-policy education. Technology and data (under the CTO) keeps the
// core systems (ticketing, finance, the fan database, contracts, scouting
// and the playbook) with their ages and replacements, access reviews,
// backups and restore tests, vendor checks and the data rules for analytics.
// A rare ransomware attack or data breach becomes a decision memo with legal
// notice duties. These add costs and incidents, not a logistics game; the
// standard levels are what the business budget already pays for.
import { inflation, post } from "./business";
import { teamPlayerIds } from "./cap";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { addMemo } from "./delegation";
import { execRole } from "./executives";
import { trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { RULES, TEAM_BY_ID, teamLabel } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { gaussian, rngFor } from "./rng";
import type { DepartmentsState, DeptState, ExecRole, GameState, ScheduledGame, TripReport } from "./types";

const M = 1_000_000;
const K = 1_000;

/** Stadium locations, for trip distances (approximate). */
const PLACE: Record<string, [number, number]> = {
  ARI: [33.53, -112.26], ATL: [33.75, -84.4], BAL: [39.28, -76.62], BUF: [42.77, -78.79], CAR: [35.23, -80.85], CHI: [41.86, -87.62],
  CIN: [39.1, -84.52], CLE: [41.51, -81.7], DAL: [32.75, -97.09], DEN: [39.74, -105.02], DET: [42.34, -83.05], GB: [44.5, -88.06],
  HOU: [29.68, -95.41], IND: [39.76, -86.16], JAX: [30.32, -81.64], KC: [39.05, -94.48], LV: [36.09, -115.18], LAC: [33.95, -118.34],
  LA: [33.95, -118.34], MIA: [25.96, -80.24], MIN: [44.97, -93.26], NE: [42.09, -71.26], NO: [29.95, -90.08], NYG: [40.81, -74.07],
  NYJ: [40.81, -74.07], PHI: [39.9, -75.17], PIT: [40.45, -80.02], SF: [37.4, -121.97], SEA: [47.6, -122.33], TB: [27.98, -82.5],
  TEN: [36.17, -86.77], WAS: [38.91, -76.86],
};

export function miles(a: string, b: string): number {
  const [la1, lo1] = PLACE[a] ?? [39, -90];
  const [la2, lo2] = PLACE[b] ?? [39, -90];
  const r = Math.PI / 180;
  const d = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return Math.round(3959 * 2 * Math.asin(Math.sqrt(d)));
}

export const DEPTS: Record<"travel" | "security" | "it", { label: string; reports: ExecRole; title: string; cost: number[]; policies: Record<string, { label: string; options: Record<string, string>; base: string }> }> = {
  travel: {
    label: "Team travel", reports: "COO", title: "Director of team travel", cost: [-0.3 * M, 0, 0.4 * M, 0.8 * M],
    policies: {
      charter: { label: "Charter aircraft", base: "standard", options: { standard: "The league's usual charter contract", premium: "A dedicated widebody with a backup aircraft on call (fewer delays, about 12% more)" } },
      hotel: { label: "Hotels", base: "standard", options: { standard: "Business hotels near the stadium", upscale: "Top hotels with full floors and meeting space (about 8% more)" } },
      arrive: { label: "Long trips", base: "dayBefore", options: { dayBefore: "Fly the day before every game", early: "Fly two days early for trips across two time zones (the body clock adjusts)" } },
    },
  },
  security: {
    label: "Team security", reports: "SOD", title: "Director of team security", cost: [-0.4 * M, 0, 0.6 * M, 1.2 * M],
    policies: {
      credentials: { label: "Credentials", base: "standard", options: { standard: "Badges for every area, checked at the doors", strict: "Zoned access with audits of who went where" } },
      checks: { label: "Background checks", base: "basic", options: { basic: "For staff in sensitive jobs", thorough: "Every hire, and contractors with access" } },
      drills: { label: "Emergency drills", base: "yearly", options: { yearly: "Once a year with the city", quarterly: "Every quarter: power, medical, evacuation, security" } },
      gambling: { label: "Gambling policy education", base: "standard", options: { standard: "The league's required session", enhanced: "Monthly sessions, a reporting line, and monitoring of betting accounts tied to the club" } },
      reporting: { label: "Reporting channel", base: "internal", options: { internal: "Reports go to the general counsel", independent: "An independent hotline and outside investigators for serious cases" } },
    },
  },
  it: {
    label: "Technology and data", reports: "CTO", title: "Director of information technology", cost: [-0.5 * M, 0, 0.8 * M, 1.6 * M],
    policies: {
      access: { label: "Access reviews", base: "yearly", options: { yearly: "Once a year", quarterly: "Every quarter, and the day anyone leaves" } },
      backups: { label: "Backups", base: "weekly", options: { weekly: "Weekly backups", daily: "Daily backups kept offline, with restore tests every quarter" } },
      vendors: { label: "Vendors", base: "light", options: { light: "Contracts reviewed by legal", checked: "Security reviews of every cloud service and contractor" } },
      data: { label: "Data rules", base: "standard", options: { standard: "Analysts see what their work needs", strict: "Medical and contract data walled off, every access logged" } },
    },
  },
};
type DeptKey = keyof typeof DEPTS;

/** The club's core systems: useful life and replacement cost (2026 dollars). */
export const SYSTEMS: Record<string, { label: string; life: number; cost: number }> = {
  ticketing: { label: "Ticketing and access control", life: 8, cost: 4 * M },
  finance: { label: "Finance and payroll", life: 10, cost: 2.5 * M },
  crm: { label: "Fan database and marketing", life: 7, cost: 2 * M },
  contracts: { label: "Contracts and cap management", life: 8, cost: 1.5 * M },
  scouting: { label: "Scouting database", life: 7, cost: 1.5 * M },
  football: { label: "Playbook, video and practice data", life: 6, cost: 3 * M },
};

function director(state: GameState, key: string): string {
  const rng = rngFor(state.seed, `director:${state.userTeam}:${key}`);
  return `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
}

export function departments(state: GameState): DepartmentsState {
  if (state.departments) return state.departments;
  const mk = (k: DeptKey): DeptState => ({ director: director(state, k), budget: 1, policy: Object.fromEntries(Object.entries(DEPTS[k].policies).map(([p, d]) => [p, d.base])), metrics: [] });
  const rng = rngFor(state.seed, `systems:${state.userTeam}`);
  state.departments = {
    travel: mk("travel"), security: mk("security"), it: mk("it"), trips: [], incidents: [],
    systems: Object.fromEntries(Object.entries(SYSTEMS).map(([k, s]) => [k, { since: RULES.season - Math.floor(rng() * s.life) }])),
  };
  return state.departments;
}

const off = (d: DeptState, p: string, v: string) => d.policy[p] === v;

export function setDeptBudget(state: GameState, dept: DeptKey, level: 0 | 1 | 2 | 3): void {
  departments(state)[dept].budget = level;
}
export function setDeptPolicy(state: GameState, dept: DeptKey, policy: string, value: string): string | null {
  const def = DEPTS[dept].policies[policy];
  if (!def || !def.options[value]) return "No such policy.";
  departments(state)[dept].policy[policy] = value;
  return null;
}

/** What the policies add to a year, beyond the budget levels. */
function policyCost(d: DepartmentsState): { security: number; technology: number } {
  return {
    security: (off(d.security, "credentials", "strict") ? 0.15 * M : 0) + (off(d.security, "checks", "thorough") ? 0.1 * M : 0) + (off(d.security, "drills", "quarterly") ? 0.12 * M : 0)
      + (off(d.security, "gambling", "enhanced") ? 0.08 * M : 0) + (off(d.security, "reporting", "independent") ? 0.15 * M : 0),
    technology: (off(d.it, "access", "quarterly") ? 0.1 * M : 0) + (off(d.it, "backups", "daily") ? 0.25 * M : 0) + (off(d.it, "vendors", "checked") ? 0.15 * M : 0) + (off(d.it, "data", "strict") ? 0.1 * M : 0),
  };
}

/** Yearly cost of the security and technology choices beyond what the business budget pays for. */
export function deptYearCost(state: GameState): { security: number; technology: number; travel: number } {
  const d = departments(state);
  const p = policyCost(d);
  const g = inflation(leagueYear(state.date), 0.03);
  return {
    security: (DEPTS.security.cost[d.security.budget] + p.security) * g,
    technology: (DEPTS.it.cost[d.it.budget] + p.technology) * g,
    travel: DEPTS.travel.cost[d.travel.budget] * g,
  };
}

// ---- Travel ----

/** Weather and air traffic: a delay on the way out, from the game's own draw (engine and report agree). */
export function flightDelay(state: GameState, g: ScheduledGame): number {
  const rng = rngFor(state.seed, `flight:${g.id}`);
  const premium = !!state.departments && off(state.departments.travel, "charter", "premium");
  const month = Number(g.date.slice(5, 7));
  const chance = (month === 12 || month === 1 ? 0.09 : 0.04) * (premium ? 0.4 : 1);
  return rng() < chance ? Math.round(2 + rng() * 6) : 0;
}

/**
 * Our form on the road, in rating points, from the travel department: a
 * late arrival costs a little, and flying in two days early before a long
 * trip removes most of the body-clock penalty. Zero for everyone else.
 */
export function travelEdge(state: GameState, g: ScheduledGame, team: string, bodyClock: number): number {
  if (team !== state.userTeam || !state.departments || g.type === "PRE") return 0;
  let e = 0;
  if (flightDelay(state, g) >= 5) e -= 0.1;
  if (bodyClock > 0 && off(state.departments.travel, "arrive", "early")) e += Math.min(bodyClock, 0.25);
  return e;
}

/** A road trip's cost, split the way the travel office books it, and its report. Returns the total. */
export function roadTrip(state: GameState, g: ScheduledGame, base: number, abroad: boolean): number {
  const d = departments(state);
  const us = state.userTeam;
  const host = g.home === us ? g.away! : g.home!;
  const dist = abroad ? 4500 : g.neutral ? 1200 : miles(us, host);
  // A typical trip is about 1,100 miles; the cost scales with the flight.
  const scale = abroad ? 1 : 0.6 + 0.4 * dist / 1100;
  const t = d.travel;
  const charter = base * 0.45 * scale * (off(t, "charter", "premium") ? 1.12 : 1);
  const longTrip = !abroad && dist >= 1500;
  const nights = off(t, "arrive", "early") && longTrip ? 2 : 1;
  const hotel = base * 0.25 * nights * (off(t, "hotel", "upscale") ? 1.08 : 1);
  const meals = base * 0.1 * nights;
  const ground = base * 0.08;
  const equipment = base * 0.08 * scale;
  const security = base * 0.04;
  const people = teamPlayerIds(state, us).filter((id) => state.players[id].status === "active").length + 62;
  const delay = flightDelay(state, g) || undefined;
  const note = abroad ? "Passports and visas checked for every player and staff member; customs cleared for the equipment; practice at a local club's grounds." : delay ? `Weather held the flight ${delay} hours; the team got in after midnight.` : undefined;
  const costs = { charter: Math.round(charter), hotel: Math.round(hotel), ground: Math.round(ground), meals: Math.round(meals), equipment: Math.round(equipment), security: Math.round(security) };
  const trip: TripReport = { game: g.id, date: g.date, where: g.neutral ? g.stadium ?? "Neutral site" : teamLabel(host), miles: dist, people, costs, delay, note };
  d.trips.unshift(trip);
  d.trips.length = Math.min(d.trips.length, 30);
  return Object.values(costs).reduce((a, x) => a + x, 0);
}

// ---- Security ----

/** Game-day incidents in the venue model: 1 at the standard level, smaller with more security and drills. */
export function securityFactor(state: GameState): number {
  const d = state.departments;
  if (!d) return 1;
  return [1.25, 1, 0.85, 0.75][d.security.budget] * (off(d.security, "drills", "quarterly") ? 0.85 : 1);
}
/** The share of our players' gambling violations the education program heads off. */
export function gamblingCut(state: GameState): number {
  const d = state.departments;
  if (!d) return 0;
  return (off(d.security, "gambling", "enhanced") ? 0.5 : 0) + (d.security.budget - 1) * 0.1;
}

// ---- Incidents ----

function log(state: GameState, dept: "travel" | "security" | "it", text: string, cost = 0): void {
  const d = departments(state);
  d.incidents.unshift({ date: state.date, dept, text, cost: cost || undefined });
  d.incidents.length = Math.min(d.incidents.length, 40);
  if (cost) post(state, dept === "it" ? "technology" : "security", -cost, text);
}

function from(state: GameState, dept: DeptKey): string {
  const e = execRole(state, DEPTS[dept].reports);
  return e ? `${e.name}, ${DEPTS[dept].reports === "CTO" ? "technology" : DEPTS[dept].reports === "SOD" ? "stadium operations" : "operations"}` : `${departments(state)[dept].director}, ${DEPTS[dept].title.toLowerCase()}`;
}

/** Old systems, thin budgets and loose policies make an attack likelier. */
export function cyberRisk(state: GameState): number {
  const d = departments(state);
  const old = Object.entries(d.systems).filter(([k, s]) => RULES.season - s.since > SYSTEMS[k].life).length;
  return 0.025 * [1.6, 1, 0.75, 0.55][d.it.budget] * (off(d.it, "access", "quarterly") ? 0.85 : 1) * (off(d.it, "vendors", "checked") ? 0.8 : 1) * (1 + old * 0.15);
}

function quarterly(state: GameState): void {
  const d = departments(state);
  const rng = rngFor(state.seed, `depts:${state.date}`);
  const s = d.security;
  const q = `${state.date.slice(0, 4)}-Q${Math.floor((Number(state.date.slice(5, 7)) - 1) / 3) + 1}`;
  // Security: someone gets where they shouldn't, a threat comes in, a report through the channel.
  if (rng() < 0.12 * (off(s, "credentials", "strict") ? 0.4 : 1) * [1.4, 1, 0.8, 0.6][s.budget]) {
    log(state, "security", "Someone without a credential got into the locker room hallway after practice; the badge audit traced how.");
    if (rng() < 0.3) news(state, `Reports: unauthorized visitor found in the ${TEAM_BY_ID[state.userTeam].name}' locker room area`);
  }
  if (rng() < 0.08) {
    const caught = rng() < [0.5, 0.75, 0.9, 0.95][s.budget];
    log(state, "security", caught ? "Threat monitoring flagged a credible online threat against a player; police were brought in and it was handled quietly." : "A threat against the stadium surfaced on social media before anyone on staff saw it; police added officers for the game.");
    if (!caught) trustHit(state, -0.5, 0, "A threat the club missed");
  }
  if (rng() < 0.1) {
    const outside = off(s, "reporting", "independent");
    log(state, "security", outside ? "A staff member reported a supervisor's misconduct through the hotline; outside investigators handled it and the supervisor left." : "A staff member reported a supervisor's misconduct to the general counsel.");
    if (!outside && rng() < 0.35) {
      trustHit(state, -1.5, 0.3, "A misconduct report handled inside the club");
      addStory(state, { outlet: "ledger", by: MEDIA_BY_ID.ledger.reporter, kind: "owner", teams: [state.userTeam], headline: `Former ${TEAM_BY_ID[state.userTeam].name} employee says complaint was buried`, body: "A former staff member says a misconduct complaint went nowhere inside the team. The club says it took the complaint seriously." });
    }
  }
  if (rng() < 0.06 * (off(d.it, "data", "strict") ? 0.5 : 1) * (off(s, "credentials", "strict") ? 0.7 : 1)) {
    log(state, "security", "A printed draft of the trade-deadline board left the building; the staff couldn't say how.");
    news(state, `Leaked: what the ${TEAM_BY_ID[state.userTeam].name} were discussing ahead of the deadline`);
  }
  // Technology: the big ones become decision memos.
  if (rng() < cyberRisk(state)) ransomware(state);
  else if (rng() < cyberRisk(state) * 0.8) breach(state);
  // Insurance: a better risk record keeps the liability premium down.
  const recent = d.incidents.filter((x) => x.date >= addDays(state.date, -365)).length;
  const premium = 0.2 * M * (securityFactor(state) - 1 + Math.max(0, recent - 4) * 0.05);
  if (Math.abs(premium) >= 1000) post(state, "security", -premium, premium > 0 ? "Liability insurance: higher premium for our risk record" : "Liability insurance: a lower premium for our risk controls");
  // The quarter's numbers.
  const trips = d.trips.filter((t) => t.date >= addDays(state.date, -92));
  const old = Object.entries(d.systems).filter(([k, x]) => RULES.season - x.since > SYSTEMS[k].life).length;
  d.travel.metrics.unshift({ quarter: q, values: { trips: trips.length, onTime: trips.length ? Math.round(100 * trips.filter((t) => !t.delay).length / trips.length) : 100, costPerTrip: trips.length ? Math.round(trips.reduce((a, t) => a + Object.values(t.costs).reduce((x, y) => x + y, 0), 0) / trips.length) : 0 } });
  d.security.metrics.unshift({ quarter: q, values: { incidents: d.incidents.filter((x) => x.dept === "security" && x.date >= addDays(state.date, -92)).length, drills: off(s, "drills", "quarterly") ? 1 : q.endsWith("Q3") ? 1 : 0, audits: off(s, "credentials", "strict") ? 1 : 0 } });
  d.it.metrics.unshift({ quarter: q, values: {
    availability: Math.round((99.9 - old * 0.15 - (1 - d.it.budget / 3) * 0.2 + gaussian(rng) * 0.05) * 100) / 100,
    patched: Math.round(Math.max(60, Math.min(100, 82 + d.it.budget * 5 + gaussian(rng) * 3))),
    accessReviews: off(d.it, "access", "quarterly") || q.endsWith("Q1") ? 1 : 0,
    restoreTests: off(d.it, "backups", "daily") ? 1 : 0,
  } });
  for (const x of [d.travel, d.security, d.it]) x.metrics.length = Math.min(x.metrics.length, 12);
}

function ransomware(state: GameState): void {
  const d = departments(state);
  const daily = off(d.it, "backups", "daily");
  const ask = Math.round((1.5 + rngFor(state.seed, `ransom:${state.date}`)() * 3.5) * 10) / 10 * M;
  log(state, "it", "Ransomware locked the business systems: ticketing, finance and email are down.");
  addMemo(state, {
    kind: "incident", from: from(state, "it"), title: "Ransomware attack",
    problem: `Ransomware has locked our business systems. The attackers want ${money(ask)}. ${daily ? "Our offline daily backups are intact, and the last restore test passed." : "Our latest clean backup is a week old, and we've never tested a full restore."} Football systems are separate and working. The law and the league require notice if fan or employee data was taken.`,
    proposal: daily ? "Restore from backups and notify the league and law enforcement." : "Rebuild from the week-old backups with outside help and notify the league and law enforcement.",
    amount: daily ? 0.5 * M : 2.5 * M,
    options: [
      { label: daily ? "Restore from backups (about 3 days, $500K)" : "Rebuild from old backups (about 2 weeks, $2.5M)", effect: "Systems come back clean; ticketing and payments limp along meanwhile.", evidence: "estimate" },
      { label: `Pay the ransom (${money(ask)})`, effect: "Faster, if the key works; the league and the press take a dim view, and some data may already be gone.", evidence: "opinion" },
    ],
    risks: ["Payment to sanctioned groups is illegal", "Data may already have been copied", "Game-day ticketing has to run on the backup system"],
    budget: "Technology and data", recommend: 0, deadline: addDays(state.date, 3), ifLate: "We start the restore.",
    payload: { kind: "ransomware", ask, daily },
  });
}

function breach(state: GameState): void {
  const d = departments(state);
  const fans = Math.round((20 + rngFor(state.seed, `breach:${state.date}`)() * 180) * K);
  log(state, "it", `Someone got into the fan database through a vendor's account: about ${fans.toLocaleString("en-US")} fans' names, emails and purchase history.`);
  addMemo(state, {
    kind: "incident", from: from(state, "it"), title: "Fan data breach",
    problem: `An outsider got into the fan database through a vendor's login. About ${fans.toLocaleString("en-US")} fans' names, emails and purchase histories were exposed; no card numbers. ${off(d.it, "data", "strict") ? "Medical and contract data are walled off and untouched." : "We're still checking whether anything else was reached."} State law requires notice within weeks.`,
    proposal: "Notify affected fans and the authorities now, and offer credit monitoring.",
    amount: fans * 8,
    options: [
      { label: "Notify now and offer credit monitoring", effect: "The law is met; fans take it better from us than from the news.", evidence: "estimate" },
      { label: "Wait until the investigation is finished", effect: "Cheaper now; if it comes out first, fines and a bigger hit to trust.", evidence: "opinion" },
    ],
    risks: ["Regulators fine late notice", "Class-action lawyers watch these"],
    budget: "Technology and data", recommend: 0, deadline: addDays(state.date, 3), ifLate: "We notify on the legal deadline.",
    payload: { kind: "breach", fans },
  });
}

/** The owner's answer to an incident memo. */
export function resolveIncident(state: GameState, p: Record<string, unknown>, choice: number): string | null {
  const year = leagueYear(state.date);
  if (p.kind === "ransomware") {
    if (choice === 0) post(state, "technology", -(p.daily ? 0.5 : 2.5) * M * inflation(year, 0.03), "Ransomware recovery and outside responders");
    else {
      post(state, "technology", -(p.ask as number) - 0.3 * M, "Ransom paid, and the responders who checked the key");
      trustHit(state, -1, 0.3, "Paid a ransom");
      news(state, `Reports: the ${TEAM_BY_ID[state.userTeam].name} paid hackers to unlock their systems`);
    }
    return null;
  }
  if (p.kind === "breach") {
    const fans = p.fans as number;
    if (choice === 0) {
      post(state, "technology", -fans * 8, "Breach notices and credit monitoring for fans");
      trustHit(state, -1, 0.2, "Fan data breach");
    } else {
      post(state, "technology", -fans * 3 - 0.75 * M, "Breach response, and a regulator's fine for late notice");
      trustHit(state, -3, 1, "A fan data breach disclosed late");
      addStory(state, { outlet: "ledger", by: MEDIA_BY_ID.ledger.reporter, kind: "owner", teams: [state.userTeam], headline: `${TEAM_BY_ID[state.userTeam].name} waited weeks to tell fans about breach`, body: "The club knew fans' data had been exposed well before it told them, according to a state regulator who fined the team." });
    }
    return null;
  }
  return null;
}

/** Replace a core system: paid as a project, with a few slow months while everyone learns it. */
export function replaceSystem(state: GameState, key: string): string | null {
  const d = departments(state);
  const sys = SYSTEMS[key];
  if (!sys) return "No such system.";
  if (d.systems[key]?.until && d.systems[key].until! > state.date) return "That migration is already under way.";
  post(state, "projects", -sys.cost * inflation(leagueYear(state.date), 0.03), `New ${sys.label.toLowerCase()} system: software, integration and training`);
  d.systems[key] = { since: RULES.season, until: addDays(state.date, 120) };
  return null;
}

function monthly(state: GameState): void {
  const c = deptYearCost(state);
  if (c.security) post(state, "security", -c.security / 12, c.security > 0 ? "Security staffing and programs beyond the budget" : "Security below the budget");
  if (c.technology) post(state, "technology", -c.technology / 12, c.technology > 0 ? "Technology staffing and programs beyond the budget" : "Technology below the budget");
  if (c.travel) post(state, "travel", -c.travel / 12, c.travel > 0 ? "Travel office: more staff and backup plans" : "Travel office: fewer staff");
}

export function departmentsDaily(state: GameState): void {
  if (!state.date.endsWith("-01")) return;
  departments(state);
  monthly(state);
  const month = Number(state.date.slice(5, 7));
  if (month % 3 === 1) quarterly(state);
  // A finished migration.
  for (const [k, s] of Object.entries(state.departments!.systems)) {
    if (s.until && s.until <= state.date) {
      delete s.until;
      send(state, "business", from(state, "it"), `New ${SYSTEMS[k].label.toLowerCase()} system is live`, "The migration is done and the old system is off. The staff are up to speed.");
    }
  }
}
