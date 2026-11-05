// The executives who run the club for the owner: a president and CEO, an
// optional president of football operations over the GM, and the business
// chiefs (finance, revenue, operations, legal, the stadium, marketing and
// technology). Everyone here is made up, as are the companies on their resumes
// and the search firms that find them.
//
// Each executive's ability is hidden. It shows in their department's results:
// a good CFO borrows cheaper, a good revenue chief brings in more sponsorship,
// a good operations chief runs leaner, and good legal, stadium and technology
// people keep incidents rare. A vacant job is covered by the deputy, which is
// worse than a good hire and better than nobody.
//
// Hiring runs through a search firm: a slate of candidates with resumes, the
// firm's read, and interviews where the owner asks about the things the job
// needs. Candidates negotiate pay, years, a guarantee, and whether they
// actually get to run their department. A club that fires people often finds
// the market wary of it.
import { addDays, daysBetween } from "./dates";
import { money, news } from "./inbox";
import { RULES, TEAM_BY_ID, TEAMS } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor, type Rng } from "./rng";
import type { DecisionArea, Exec, ExecRole, ExecSearch, ExecState, GameState } from "./types";

const M = 1_000_000;

export const EXEC_ROLES: Record<ExecRole, { label: string; what: string; salary: number; reports: ExecRole | "owner"; area?: DecisionArea; optional?: boolean }> = {
  PRES: { label: "President and CEO", what: "Runs the whole business side and sets its direction. A strong one makes every business chief better.", salary: 3.5 * M, reports: "owner" },
  FOPS: { label: "President of football operations", what: "Oversees the GM and the coaching staff, and answers to you for the football side. Optional: many clubs have the GM report to the owner.", salary: 4 * M, reports: "owner", area: "coaching", optional: true },
  CFO: { label: "Chief financial officer", what: "Budgets, reporting, forecasts, cash and borrowing. A good one gets better loan terms and tighter budgets.", salary: 1.6 * M, reports: "PRES", area: "financing" },
  CRO: { label: "Chief revenue officer", what: "Sponsorships, tickets and premium seating. A good one brings in more from local partners.", salary: 1.8 * M, reports: "PRES", area: "sponsors" },
  COO: { label: "Chief operating officer", what: "Runs the organization day to day: facilities, events and support staff. A good one runs the business office leaner.", salary: 1.4 * M, reports: "PRES" },
  GC: { label: "General counsel", what: "Contracts, legal strategy, investigations and compliance. A good one keeps the club out of trouble.", salary: 1.2 * M, reports: "PRES" },
  SOD: { label: "Stadium operations director", what: "Venue operations, game-day service, maintenance and vendors. Fans feel the difference.", salary: 0.6 * M, reports: "COO", area: "events" },
  MKT: { label: "Marketing and communications director", what: "The brand, press relations and fan engagement. Helps fill seats and keeps the press onside.", salary: 0.7 * M, reports: "CRO", area: "pricing" },
  CTO: { label: "Chief technology and data officer", what: "Cybersecurity, ticketing and business systems, and the club's data.", salary: 0.8 * M, reports: "COO" },
};
export const EXEC_KEYS = Object.keys(EXEC_ROLES) as ExecRole[];

/** Made-up search firms: fees as a share of first-year pay, how hard they vet, and how deep their networks run. */
export const SEARCH_FIRMS = [
  { id: "Halverson Partners", fee: 0.33, rigor: 0.8, network: 6, what: "The top sports search firm: expensive, thorough, and it knows everyone." },
  { id: "Crosswind Talent", fee: 0.25, rigor: 0.55, network: 2, what: "A solid generalist with a good business network." },
  { id: "Ridgeline Executive Search", fee: 0.15, rigor: 0.3, network: -2, what: "Cheap and fast; you'll do more of the vetting yourself." },
];

const COMPANIES: Record<Exec["background"], string[]> = {
  sports: ["the Harbor City Arena Group", "Northfield Sports & Entertainment", "the Midland Baseball Club", "Summit Venues", "a Big Ten athletic department", "the Coastal Hockey Club"],
  finance: ["Granite Peak Capital", "Bellwether Bank", "Ashford & Lane", "Meridian Asset Management", "a Fortune 500 manufacturer"],
  consulting: ["Thornbury Consulting", "Calder Strategy Group", "Westbrook Advisory"],
  tech: ["Vantage Ticketing", "Brightline Software", "Kestrel Data", "a streaming startup"],
  media: ["Lakeshore Broadcasting", "Pinnacle Media", "the Daily Courant", "Redline Sports Network"],
  law: ["Whitcombe Hale LLP", "Barrow & Finch", "the league office's legal department"],
  hospitality: ["Grandview Resorts", "Crescent Hotels", "Harvest Foodservice"],
};
const BACKGROUNDS: Record<ExecRole, Exec["background"][]> = {
  PRES: ["sports", "finance", "consulting", "media"],
  FOPS: ["sports", "sports", "consulting"],
  CFO: ["finance", "finance", "sports", "consulting"],
  CRO: ["sports", "media", "hospitality"],
  COO: ["sports", "consulting", "hospitality"],
  GC: ["law", "law", "sports"],
  SOD: ["sports", "hospitality"],
  MKT: ["media", "sports", "tech"],
  CTO: ["tech", "tech", "consulting"],
};
const TITLE_BEFORE: Record<ExecRole, string> = {
  PRES: "chief executive", FOPS: "executive vice president of football operations", CFO: "chief financial officer", CRO: "head of partnerships",
  COO: "chief operating officer", GC: "general counsel", SOD: "director of venue operations", MKT: "vice president of marketing", CTO: "chief technology officer",
};

// ---- State ----

export function execs(state: GameState): ExecState {
  return (state.execs ??= newExecs(state));
}

/** Saves from before the executives get a staffed front office today. */
export function ensureExecs(state: GameState): void {
  execs(state);
}

function newExecs(state: GameState): ExecState {
  const x: ExecState = {
    people: {}, chart: {}, reportsTo: Object.fromEntries(EXEC_KEYS.map((r) => [r, EXEC_ROLES[r].reports])) as ExecState["reportsTo"],
    searches: [], owed: [], reputation: 55, log: [], departures: [], reorgs: 0,
  };
  state.execs = x;
  for (const role of EXEC_KEYS) {
    const rng = rngFor(state.seed, `exec:${state.userTeam}:${role}`);
    if (!EXEC_ROLES[role].optional) {
      const e = makeExec(state, rng, role, 55 + gaussian(rng) * 10, role === "PRES" ? presidentName(state) : undefined);
      e.role = role;
      e.hired = state.date;
      e.contract = { through: RULES.season + 1 + Math.floor(rng() * 3), salary: Math.round(salaryAsk(state, e, role) / 10_000) * 10_000, guaranteed: true };
      x.chart[role] = e.id;
    }
    // Every department has a number two.
    const d = makeExec(state, rng, role, 45 + gaussian(rng) * 9);
    d.deputyOf = role;
    d.years = Math.max(1, d.years - 6);
  }
  return x;
}

/** The president's name is the one the business office has always signed with. */
function presidentName(state: GameState): string {
  const rng = rngFor(state.seed, `bizchief:${state.userTeam}`);
  return `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
}

function makeExec(state: GameState, rng: Rng, role: ExecRole, skill: number, name?: string): Exec {
  const x = execs(state);
  const bgs = BACKGROUNDS[role];
  const background = bgs[Math.floor(rng() * bgs.length)];
  const years = 4 + Math.floor(rng() * 18);
  const companies = COMPANIES[background];
  const resume = [
    `${TITLE_BEFORE[role]}, ${companies[Math.floor(rng() * companies.length)]}`,
    `vice president, ${companies[Math.floor(rng() * companies.length)]}`,
  ];
  if (background === "sports" && rng() < 0.5) resume[0] = `${TITLE_BEFORE[role]}, ${TEAM_BY_ID[TEAMS[Math.floor(rng() * TEAMS.length)].id].city} (NFL)`;
  const id = `X${Object.keys(x.people).length + 1}-${Math.floor(rng() * 1e6).toString(36)}`;
  const e: Exec = {
    id, name: name ?? `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`,
    born: RULES.season - 34 - years - Math.floor(rng() * 8), background, resume, years,
    style: (["cautious", "steady", "bold"] as const)[Math.floor(rng() * 3)], role: null,
    hidden: {
      skill: clamp(skill), leadership: clamp(50 + gaussian(rng) * 14), ambition: clamp(50 + gaussian(rng) * 18),
      growth: Math.round((gaussian(rng) * 1.5 + (years < 10 ? 1 : -0.3)) * 10) / 10,
    },
    satisfaction: 62, reviews: [],
  };
  x.people[id] = e;
  return e;
}

const clamp = (v: number) => Math.max(5, Math.min(99, Math.round(v)));

export function execRole(state: GameState, role: ExecRole): Exec | undefined {
  const id = execs(state).chart[role];
  return id ? execs(state).people[id] : undefined;
}

export function deputy(state: GameState, role: ExecRole): Exec | undefined {
  return Object.values(execs(state).people).find((e) => e.deputyOf === role && !e.role);
}

/** Who signs for a department: the executive, or the deputy acting in the job. */
export function signer(state: GameState, role: ExecRole): string {
  const e = execRole(state, role);
  if (e) return `${e.name}, ${EXEC_ROLES[role].label.toLowerCase()}`;
  const d = deputy(state, role);
  return d ? `${d.name}, acting ${EXEC_ROLES[role].label.toLowerCase()}` : EXEC_ROLES[role].label;
}

/**
 * How much a department gains from its leader, -1 to 1: ability against an
 * ordinary executive, a little more under a strong president, and a deputy's
 * stand-in when the job is open.
 */
export function execBoost(state: GameState, role: ExecRole): number {
  if (!state.execs) return 0;
  const e = execRole(state, role) ?? deputy(state, role);
  if (!e) return role === "FOPS" ? 0 : -0.6;
  let b = (e.hidden.skill - (e.role ? 50 : 55)) / 45;
  // A new hire spends the first six months learning the building: their strengths show only partly.
  if (e.role && e.hired && b > 0 && daysBetween(e.hired, state.date) < 180) b *= 0.75;
  const boss = execs(state).reportsTo[role];
  if (role !== "PRES" && boss !== "owner") {
    const top = execRole(state, boss);
    if (top) b += (top.hidden.leadership - 50) / 250;
  }
  return Math.max(-1, Math.min(1, b));
}

// ---- Pay ----

/** What a person expects to be paid in a job: the going rate, more for ability, more from a club with a bad name as an employer. */
export function salaryAsk(state: GameState, e: Exec, role: ExecRole): number {
  const rep = state.execs?.reputation ?? 55;
  const grow = Math.pow(1.04, Math.max(0, RULES.season - 2026));
  return EXEC_ROLES[role].salary * grow * (0.75 + e.hidden.skill / 100 * 0.6) * (1 + Math.max(0, 50 - rep) / 150);
}

/** Executive pay over what the business budget assumes, plus severance still owed. */
export function execPayrollOver(state: GameState): number {
  if (!state.execs) return 0;
  const x = execs(state);
  const grow = Math.pow(1.04, Math.max(0, RULES.season - 2026));
  let pay = 0;
  let budget = 0;
  for (const role of EXEC_KEYS) {
    if (!EXEC_ROLES[role].optional) budget += EXEC_ROLES[role].salary * grow;
    const e = execRole(state, role);
    if (e?.contract) pay += e.contract.salary;
  }
  const owed = x.owed.filter((o) => o.through >= RULES.season).reduce((t, o) => t + o.salary, 0);
  return pay - budget + owed;
}

// ---- The reporting chart ----

/** Whom a role reports to; a change that would make someone their own boss is refused. */
export function setReportsTo(state: GameState, role: ExecRole, to: ExecRole | "owner"): string | null {
  const x = execs(state);
  if (role === "PRES" && to !== "owner") return "The president reports to you.";
  if (to === role) return "Nobody reports to themselves.";
  let at: ExecRole | "owner" = to;
  for (let i = 0; i < 10 && at !== "owner"; i++) {
    if (at === role) return "That would make a loop in the chart.";
    at = x.reportsTo[at];
  }
  if (x.reportsTo[role] === to) return null;
  x.reportsTo[role] = to;
  x.reorgs++;
  x.log.unshift({ date: state.date, text: `${EXEC_ROLES[role].label} now reports to ${to === "owner" ? "the owner" : EXEC_ROLES[to].label.toLowerCase()}.` });
  // A reorganization unsettles people for a while.
  for (const e of Object.values(x.people)) if (e.role) e.satisfaction = Math.max(0, e.satisfaction - 2);
  return null;
}

/** How many executives answer to the owner directly. */
export function ownerSpan(state: GameState): number {
  const x = execs(state);
  return EXEC_KEYS.filter((r) => x.reportsTo[r] === "owner" && (execRole(state, r) || !EXEC_ROLES[r].optional)).length;
}

export function reputationWord(r: number): string {
  return r >= 70 ? "A place people want to work" : r >= 55 ? "A good employer" : r >= 40 ? "Some candidates are wary" : "Known for churning executives";
}

// ---- Searches, interviews and offers ----

export function openExecSearch(state: GameState, role: ExecRole, firm: string): ExecSearch | string {
  const x = execs(state);
  if (x.searches.some((s) => s.role === role)) return "That search is already open.";
  const f = SEARCH_FIRMS.find((s) => s.id === firm) ?? SEARCH_FIRMS[1];
  const rng = rngFor(state.seed, `execsearch:${role}:${state.date}`);
  // A good name as an employer draws better candidates.
  const draw = (x.reputation - 55) / 4 + f.network;
  const pool: string[] = [];
  const read: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const e = makeExec(state, rng, role, 52 + draw + gaussian(rng) * 13);
    pool.push(e.id);
    // The firm's read is the truth plus noise that a rigorous firm keeps small.
    read[e.id] = clamp(e.hidden.skill + gaussian(rng) * (16 - 12 * f.rigor));
  }
  const s: ExecSearch = { role, opened: state.date, firm: f.id, pool, asked: {}, read, declined: [] };
  x.searches.push(s);
  return s;
}

export function closeExecSearch(state: GameState, role: ExecRole): void {
  const x = execs(state);
  const s = x.searches.find((v) => v.role === role);
  if (!s) return;
  for (const id of s.pool) if (!x.people[id]?.role) delete x.people[id];
  x.searches = x.searches.filter((v) => v !== s);
}

export const INTERVIEW_TOPICS: Record<string, string> = {
  finances: "How would you manage the money?",
  leadership: "How do you lead a department?",
  priorities: "What would you change in your first year?",
  governance: "How should decisions get made between you, me and the rest of the staff?",
  ambition: "Where do you see yourself in five years?",
};

/** Ask a candidate one of the interview questions (three per candidate). The answers hint at the hidden truth. */
export function interview(state: GameState, role: ExecRole, id: string, topic: string): string {
  const x = execs(state);
  const s = x.searches.find((v) => v.role === role);
  const e = x.people[id];
  if (!s || !e || !s.pool.includes(id)) return "That candidate isn't in the search.";
  const asked = (s.asked[id] ??= []);
  if (asked.length >= 3) return "You've had your hour with this candidate.";
  if (asked.some((a) => a.topic === topic)) return "You already asked that.";
  const rng = rngFor(state.seed, `interview:${id}:${topic}`);
  const z = gaussian(rng) * 8;
  const h = e.hidden;
  let answer: string;
  if (topic === "leadership") answer = h.leadership + z >= 65 ? "Talks about the people they developed by name; former staff followed them to two jobs." : h.leadership + z >= 45 ? "A sensible answer about clear goals and weekly check-ins." : "Mostly talks about their own results.";
  else if (topic === "ambition") answer = h.ambition + z >= 65 ? "Wants to run a club someday, and says so." : h.ambition + z >= 40 ? "Wants to build something here for a while." : "Happy in a number-two role for years.";
  else if (topic === "governance") answer = h.ambition + z >= 60 ? "Expects to run the department without second-guessing; wants the authority in writing." : "Comfortable bringing the big calls to you.";
  else answer = h.skill + z >= 68 ? "Specific, numbers-first and convincing. You learned something." : h.skill + z >= 50 ? "Solid and practical, nothing surprising." : "Vague on the details when you pressed.";
  asked.push({ topic, answer });
  // Each good question tightens the owner's read.
  s.read[id] = clamp(s.read[id] * 0.7 + (h.skill + z * 0.5) * 0.3);
  return answer;
}

/** A candidate's terms: pay, a guarantee, and for the ambitious, the right to run their department. */
export function execTerms(state: GameState, role: ExecRole, id: string): { salary: number; years: number; guaranteed: boolean; authority?: DecisionArea } {
  const e = execs(state).people[id];
  return {
    salary: Math.round(salaryAsk(state, e, role) / 10_000) * 10_000,
    years: e.hidden.ambition >= 60 ? 4 : 3,
    guaranteed: execs(state).reputation < 50 || e.hidden.skill >= 70,
    authority: e.hidden.ambition >= 65 ? EXEC_ROLES[role].area : undefined,
  };
}

/**
 * Offer a candidate the job. They take it if the pay, years and guarantee
 * are close enough to what they asked and, for the ambitious, if they'll
 * really run their area (it can't be kept for the owner).
 */
export function offerExec(state: GameState, role: ExecRole, id: string, o: { salary: number; years: number; guaranteed: boolean }, mode: (area: DecisionArea) => string): { ok: boolean; text: string } {
  const x = execs(state);
  const s = x.searches.find((v) => v.role === role);
  const e = x.people[id];
  if (!s || !e || !s.pool.includes(id)) return { ok: false, text: "That candidate isn't in the search." };
  if (s.declined.includes(id)) return { ok: false, text: `${e.name} has taken another job.` };
  const ask = execTerms(state, role, id);
  if (ask.authority && mode(ask.authority) === "owner") {
    return { ok: false, text: `${e.name} wants to run ${ask.authority === "financing" ? "the club's borrowing" : ask.authority} and won't take the job while you keep those decisions to yourself (Front office, Decision rights).` };
  }
  const need = ask.salary * (o.guaranteed ? 0.95 : 1) * (ask.guaranteed && !o.guaranteed ? 1.12 : 1) * (o.years < ask.years ? 1.05 : 1);
  if (o.salary < need) {
    if (rngFor(state.seed, `execoffer:${id}:${state.date}`)() < 0.2) s.declined.push(id);
    return { ok: false, text: `${e.name} is looking for about ${money(ask.salary)} a year over ${ask.years} years${ask.guaranteed ? ", guaranteed" : ""}.` };
  }
  hireExec(state, role, id, o);
  return { ok: true, text: `${e.name} is our new ${EXEC_ROLES[role].label.toLowerCase()}.` };
}

function hireExec(state: GameState, role: ExecRole, id: string, o: { salary: number; years: number; guaranteed: boolean }): void {
  const x = execs(state);
  const s = x.searches.find((v) => v.role === role);
  const firm = SEARCH_FIRMS.find((f) => f.id === s?.firm);
  const fee = firm ? Math.round(o.salary * firm.fee) : 0;
  if (execRole(state, role)) fireExec(state, role, true);
  const e = x.people[id];
  e.role = role;
  e.hired = state.date;
  e.contract = { through: RULES.season + o.years, salary: Math.round(o.salary), guaranteed: o.guaranteed };
  e.satisfaction = 70;
  x.chart[role] = id;
  s?.pool.splice(s.pool.indexOf(id), 1);
  closeExecSearch(state, role);
  if (fee) postFee(state, -fee, `${firm!.id}: search fee for the ${EXEC_ROLES[role].label.toLowerCase()}`);
  x.log.unshift({ date: state.date, text: `Hired ${e.name} as ${EXEC_ROLES[role].label.toLowerCase()} (${money(o.salary)} a year through ${e.contract.through}).` });
  news(state, `${TEAM_BY_ID[state.userTeam].name} name ${e.name} ${EXEC_ROLES[role].label.toLowerCase()}`);
  noteDecision(state, "executives", `Hired ${e.name} as ${EXEC_ROLES[role].label.toLowerCase()}`, o.salary);
}

/** Let an executive go: a guaranteed contract is paid out, otherwise six months' severance. */
export function fireExec(state: GameState, role: ExecRole, replacing = false): string | null {
  const x = execs(state);
  const e = execRole(state, role);
  if (!e?.contract) return "Nobody in that job.";
  const years = Math.max(0, e.contract.through - RULES.season);
  const owedYears = e.contract.guaranteed ? years + 0.5 : 0.5;
  if (e.contract.guaranteed && years > 0) x.owed.push({ id: e.id, salary: e.contract.salary, through: e.contract.through });
  const cost = Math.round(e.contract.salary * owedYears);
  if (!e.contract.guaranteed || years === 0) postFee(state, -e.contract.salary / 2, `Severance: ${e.name}`);
  e.role = null;
  delete e.contract;
  delete x.chart[role];
  x.departures.unshift({ date: state.date, role, why: "fired", cost });
  // The market notices a club that fires a lot of people.
  const recent = x.departures.filter((d) => d.why === "fired" && d.date >= addDays(state.date, -730)).length;
  x.reputation = Math.max(0, x.reputation - (recent >= 3 ? 10 : 5));
  for (const p of Object.values(x.people)) if (p.role) p.satisfaction = Math.max(0, p.satisfaction - 4);
  x.log.unshift({ date: state.date, text: `${replacing ? "Replaced" : "Let go"} ${e.name} (${EXEC_ROLES[role].label.toLowerCase()}); ${money(cost)} owed.` });
  noteDecision(state, "executives", `Let go ${e.name} as ${EXEC_ROLES[role].label.toLowerCase()}`, cost);
  return null;
}

/** Promote the deputy into the job at a number-two's pay plus a raise. */
export function promoteDeputy(state: GameState, role: ExecRole): string | null {
  const d = deputy(state, role);
  if (!d) return "There's no deputy to promote.";
  if (execRole(state, role)) return "The job is filled.";
  const x = execs(state);
  delete d.deputyOf;
  d.role = role;
  d.hired = state.date;
  d.contract = { through: RULES.season + 3, salary: Math.round(EXEC_ROLES[role].salary * 0.75 / 10_000) * 10_000, guaranteed: false };
  d.satisfaction = 80;
  x.chart[role] = d.id;
  closeExecSearch(state, role);
  // A new number two comes up behind them.
  const n = makeExec(state, rngFor(state.seed, `deputy:${role}:${state.date}`), role, 44 + gaussian(rngFor(state.seed, `deputy2:${role}:${state.date}`)) * 9);
  n.deputyOf = role;
  x.reputation = Math.min(90, x.reputation + 2);
  x.log.unshift({ date: state.date, text: `Promoted ${d.name} to ${EXEC_ROLES[role].label.toLowerCase()}.` });
  noteDecision(state, "executives", `Promoted ${d.name} to ${EXEC_ROLES[role].label.toLowerCase()}`, d.contract.salary);
  return null;
}

/** A raise and an extra year to keep someone another club wants. */
export function retainExec(state: GameState, role: ExecRole): void {
  const e = execRole(state, role);
  if (!e?.contract) return;
  e.contract.salary = Math.round(e.contract.salary * 1.25 / 10_000) * 10_000;
  e.contract.through = Math.max(e.contract.through, RULES.season + 1) + 1;
  e.satisfaction = Math.min(100, e.satisfaction + 15);
}

/** Someone leaves for another job: the deputy acts until the owner fills it. */
export function execLeaves(state: GameState, role: ExecRole, where: string): void {
  const x = execs(state);
  const e = execRole(state, role);
  if (!e) return;
  e.role = null;
  delete e.contract;
  delete x.chart[role];
  x.departures.unshift({ date: state.date, role, why: "left", cost: 0 });
  x.log.unshift({ date: state.date, text: `${e.name} left to become ${where}.` });
  news(state, `${TEAM_BY_ID[state.userTeam].name} ${EXEC_ROLES[role].label.toLowerCase()} ${e.name} leaves to become ${where}`);
  delete x.people[e.id];
}

// Late-bound so this module doesn't need the business ledger or the decision log at load.
let postFee: (state: GameState, amount: number, note: string) => void = () => {};
let noteDecision: (state: GameState, area: string, what: string, amount?: number) => void = () => {};
export function bindExecs(fee: typeof postFee, note: typeof noteDecision): void {
  postFee = fee;
  noteDecision = note;
}

// ---- The year ----

/** Each new league year: people grow or slip, and contracts that ran out are renewed or end. */
export function execsNewYear(state: GameState): void {
  const x = execs(state);
  // Mentoring, courses and credentials add to everyone's growth, deputies most of all.
  const dev = state.culture?.development ?? 0;
  for (const e of Object.values(x.people)) {
    e.hidden.skill = clamp(e.hidden.skill + e.hidden.growth + dev * (e.deputyOf ? 0.6 : 0.3));
    e.hidden.growth = Math.round((e.hidden.growth * 0.8 - 0.15) * 10) / 10;
    e.years++;
  }
  for (const role of EXEC_KEYS) {
    const e = execRole(state, role);
    if (!e?.contract || e.contract.through >= RULES.season) continue;
    // An expiring executive re-signs for three more years at their current price unless unhappy.
    if (e.satisfaction >= 35) {
      e.contract = { through: RULES.season + 3, salary: Math.round(Math.max(e.contract.salary, salaryAsk(state, e, role)) / 10_000) * 10_000, guaranteed: e.contract.guaranteed };
      x.log.unshift({ date: state.date, text: `${e.name} re-signed through ${e.contract.through}.` });
    } else execLeaves(state, role, "an executive at another company");
  }
  x.owed = x.owed.filter((o) => o.through >= RULES.season);
  x.reputation = Math.min(75, x.reputation + 2);
}

/** Others who'd hire our people: a promotion somewhere else, as the owner hears about it. */
export function poachTarget(state: GameState, role: ExecRole): string | null {
  const e = execRole(state, role);
  if (!e) return null;
  const rng = rngFor(state.seed, `poach:${e.id}:${RULES.season}`);
  if (e.hidden.skill < 60 || e.hidden.ambition < 50 || rng() > 0.25 + (60 - e.satisfaction) / 200) return null;
  const team = TEAMS[Math.floor(rng() * TEAMS.length)];
  if (team.id === state.userTeam) return null;
  return role === "PRES" ? `president of the ${team.city} ${team.name}` : `${EXEC_ROLES[role === "SOD" || role === "MKT" || role === "CTO" ? "COO" : "PRES"].label.toLowerCase()} of the ${team.city} ${team.name}`;
}
