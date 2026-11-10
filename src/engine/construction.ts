// Building a new stadium. projects.ts renovates the building a club already
// plays in; this is the long road to a new one. The club commissions
// feasibility studies (demand, engineering, cost, access, financing), picks a
// site from the ones the studies turn up, and designs the building: seats, a
// roof (open, fixed dome or retractable, each with its own build and running
// costs) and who owns it (the team, a public authority, or the public owning
// it with the team running it, which decides who pays, who runs it and who
// sells the naming rights). The public side's money goes through politics.ts.
// Then a financing package (owner equity, a stadium loan, the league's
// stadium program, the approved public money and seat licenses), contractor
// bids compared on price, schedule and record, a contract (fixed price,
// guaranteed maximum or cost-plus, which decides who carries overruns),
// permits, and three years or so of work in which labor shortages, supply
// problems, engineering surprises and change orders push the cost and the
// date. Building on the current site means a temporary home while the old
// stadium comes down. When it opens, the new building replaces the old one in
// the books, the facilities and the weather.
//
// Other clubs build too (and a club that starts the game with one under way
// simply moves in when it opens): the real projects already under way (Tennessee
// opens in 2027, Cleveland's Brook Park dome, Washington at the RFK site,
// Kansas City in Kansas), and now and then a club with an old building.
// Contractors and site names are made up; costs are rough 2026 figures from
// recent NFL stadiums ($1.5-3B), scaled by building costs in economy.ts.
import { businessChief, inflation, ownerCash, post } from "./business";
import { addDays, daysBetween, shortDate } from "./dates";
import { stadiumLoan, leagueStadiumLoan } from "./debt";
import { constructionFactor } from "./economy";
import { partDefs } from "./facilities";
import { bindLeases } from "./leases";
import { metroPop } from "./fans";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, TEAM_BY_ID, teamLabel } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { startPolitics } from "./politics";
import { gaussian, rngFor } from "./rng";
import { STADIUM_BY_TEAM, type Stadium, type Structure } from "./stadiums";
import type { GameState } from "./types";

const M = 1_000_000;

export type Roof = "open" | "dome" | "retractable";
export type Model = "team" | "authority" | "partnership";
export type ContractKind = "fixed" | "gmp" | "costPlus";
export type Stage = "study" | "design" | "politics" | "finance" | "bids" | "permits" | "build" | "open" | "shelved";

export interface Site {
  id: string;
  name: string;
  kind: "current" | "downtown" | "suburb" | "rival";
  /** Land and site work, 2026 dollars. */
  land: number;
  /** 0-1: rail and bus access. */
  transit: number;
  /** 0-1: parking on or near the site. */
  parking: number;
  /** Ticket demand against the current site. */
  reach: number;
  /** 0-1: wetlands, contamination and traffic findings to mitigate. */
  envRisk: number;
  /** 0-1: room for hotels, restaurants and retail around the building. */
  development: number;
  /** The government whose approval and money it needs. */
  jurisdiction: string;
  /** Money a rival suburb puts on the table to win the stadium. */
  subsidy?: number;
}

export interface Bid { contractor: string; price: number; months: number; record: number }

export interface BuildEvent { date: string; text: string; cost: number; ours: number; months: number }

export interface Funding { equity: number; loan: number; league: number; public: number; psl: number }

export interface StadiumPlan {
  stage: Stage;
  started: string;
  studyDue?: string;
  study?: { demand: number; low: number; high: number; engineering: string; access: string; financing: string };
  sites: Site[];
  site?: string;
  roof: Roof;
  capacity: number;
  model: Model;
  benefits: { jobs: boolean; local: boolean; access: boolean };
  /** What we put into the district around the building. */
  district: number;
  /** Environmental mitigation the review required. */
  mitigation?: number;
  name: string;
  funding: Funding;
  bids: Bid[];
  contractor?: Bid;
  contract?: ContractKind;
  /** Contract price, then what the building has come to so far. */
  price?: number;
  cost?: number;
  /** Our share of the work's cost (public money pays the rest), and what we've paid. */
  ours?: number;
  paid: number;
  /** The building-cost index when the contract was signed. */
  index?: number;
  permitsDue?: string;
  buildStart?: string;
  complete?: string;
  opens?: string;
  events: BuildEvent[];
  milestones: { political?: string; contractual?: string; financial?: string; permits?: string; opened?: string };
  /** Long-term obligations disclosed to the public. */
  commitments: string[];
  /** Years the team agreed not to move, in return for public money. */
  stayUntil?: number;
}

export interface CpuBuild { team: string; announced: string; approved?: string; opens?: number; name: string; roof: Roof; cost: number; structure: Structure; failed?: boolean }

export interface NewStadium {
  team: string;
  name: string;
  roof: Roof;
  capacity: number;
  opened: number;
  structure: Structure;
  owner: string;
  operator: string;
  rent: number;
  upkeep: number;
  /** Our new stadium's draw on demand fades over its first years. */
  ours?: boolean;
  district?: number;
}

export interface ConstructionState {
  plan?: StadiumPlan;
  /** Every new building opened in this save, by team. */
  opened: NewStadium[];
  cpu: CpuBuild[];
  /** A temporary home while the old stadium comes down. */
  temporary?: { name: string; until: string };
  /** The owner said relocation is on the table after a failed public deal (relocation.ts). */
  exploreRelocation?: string;
  log: { date: string; text: string }[];
}

export const ROOFS: Record<Roof, { label: string; build: number; run: number; events: number; what: string }> = {
  open: { label: "Open air", build: 1, run: 0, events: 1, what: "Cheapest to build and run; weather is part of the game, and winter events are hard to book." },
  dome: { label: "Fixed dome", build: 1.15, run: 6 * M, events: 1.35, what: "Books concerts, Final Fours and conventions all year, and no weather; turf only, and higher running costs." },
  retractable: { label: "Retractable roof", build: 1.38, run: 9 * M, events: 1.25, what: "Open in good weather and closed in bad: grass is possible and events book all year, at the highest build and machinery costs." },
};

export const MODELS: Record<Model, { label: string; structure: Structure; publicMax: number; rent: number; what: string }> = {
  team: { label: "Team-owned", structure: "owned", publicMax: 0.2, rent: 0, what: "We own and run it, sell the naming rights and keep every event; public money covers roads and utilities at most." },
  partnership: { label: "Public owner, team-run", structure: "publicTeam", publicMax: 0.45, rent: 3 * M, what: "A public authority holds title and puts in more money; we run the building and book its events, and pay rent under a long lease." },
  authority: { label: "Public authority", structure: "publicAuthority", publicMax: 0.6, rent: 1 * M, what: "The authority pays the most, owns and runs it; we play there under a lease and give up the event and concession business." },
};

/** Contractors (made up) and how they price risk. */
const CONTRACTORS = ["Halvorsen Turner Builders", "Granite Arch Construction", "Mosaic Mortenson-Keene", "Bridgewater Pacific", "Corvane & Lusk", "Ironline Hunt Partners"];
export const CONTRACTS: Record<ContractKind, { label: string; premium: number; ours: number; what: string }> = {
  fixed: { label: "Fixed price", premium: 0.1, ours: 0.15, what: "The contractor carries overruns; we pay about 10% more up front and still pay for changes we ask for." },
  gmp: { label: "Guaranteed maximum price", premium: 0.05, ours: 0.4, what: "A cap with a contingency: we share overruns and savings with the contractor." },
  costPlus: { label: "Cost-plus", premium: -0.03, ours: 1, what: "Cheapest up front; every overrun and delay is ours." },
};

const ORIGINAL: Record<string, Pick<Stadium, "name" | "roof" | "capacity" | "opened" | "structure" | "owner" | "operator" | "rent" | "upkeep" | "debt" | "note" | "fixed" | "blackout">> = Object.fromEntries(
  Object.values(STADIUM_BY_TEAM).map((s) => [s.team, { name: s.name, roof: s.roof, capacity: s.capacity, opened: s.opened, structure: s.structure, owner: s.owner, operator: s.operator, rent: s.rent, upkeep: s.upkeep, debt: s.debt, note: s.note, fixed: s.fixed, blackout: s.blackout }]),
);
const ORIGINAL_TEAMS: Record<string, { stadium: string; roof: string }> = Object.fromEntries(TEAMS.map((t) => [t.id, { stadium: t.stadium, roof: t.roof }]));

/** The real projects under way in 2026. */
const SEEDED: CpuBuild[] = [
  { team: "TEN", announced: "2023-05-01", approved: "2023-05-01", opens: 2027, name: "Nissan Stadium", roof: "dome", cost: 2_100 * M, structure: "publicTeam" },
  { team: "CLE", announced: "2024-08-01", approved: "2025-07-01", opens: 2029, name: "Brook Park Stadium", roof: "dome", cost: 2_400 * M, structure: "owned" },
  { team: "WAS", announced: "2025-04-28", approved: "2025-09-17", opens: 2030, name: "RFK Site Stadium", roof: "retractable", cost: 3_700 * M, structure: "owned" },
  { team: "KC", announced: "2025-12-22", approved: "2025-12-22", opens: 2031, name: "Kansas City Stadium", roof: "dome", cost: 3_000 * M, structure: "publicTeam" },
];

export function construction(state: GameState): ConstructionState {
  return (state.construction ??= { opened: [], cpu: SEEDED.map((b) => ({ ...b })), log: [] });
}

function note(state: GameState, text: string): void {
  const c = construction(state);
  c.log.unshift({ date: state.date, text });
  c.log.length = Math.min(c.log.length, 30);
}

/** Lays the save's new stadiums over the 2026 data, so the books, the venue and the weather use them. */
export function bindConstruction(state: GameState): void {
  for (const [team, o] of Object.entries(ORIGINAL)) Object.assign(STADIUM_BY_TEAM[team], o);
  for (const [team, o] of Object.entries(ORIGINAL_TEAMS)) Object.assign(TEAM_BY_ID[team], o);
  for (const n of state.construction?.opened ?? []) {
    const s = STADIUM_BY_TEAM[n.team];
    Object.assign(s, {
      name: n.name, roof: n.roof, capacity: n.capacity, opened: n.opened, structure: n.structure, owner: n.owner, operator: n.operator,
      rent: n.rent, upkeep: n.upkeep, debt: 0, fixed: [], blackout: [],
      note: `Opened in ${n.opened}: ${ROOFS[n.roof].label.toLowerCase()}, ${n.capacity.toLocaleString("en-US")} seats, ${MODELS[modelOf(n.structure)].label.toLowerCase()}.`,
    });
    Object.assign(TEAM_BY_ID[n.team], { stadium: n.name, roof: n.roof === "open" ? "outdoors" : n.roof === "dome" ? "dome" : "retractable" });
  }
  // Leases signed since (renegotiated rent and upkeep) sit on top.
  bindLeases(state);
}

function modelOf(s: Structure): Model {
  return s === "owned" ? "team" : s === "publicAuthority" ? "authority" : "partnership";
}

/** What the new building adds to demand: a honeymoon that fades over five seasons, and more premium seating for good. */
export function newStadiumLift(state: GameState): { demand: number; premium: number; perCap: number; sponsor: number } {
  const n = state.construction?.opened.find((x) => x.team === state.userTeam && x.ours);
  if (!n) return { demand: 0, premium: 0, perCap: 0, sponsor: 0 };
  const age = RULES.season - n.opened;
  if (age < 0) return { demand: 0, premium: 0, perCap: 0, sponsor: 0 };
  const fade = Math.max(0, 1 - age / 5);
  return { demand: 0.08 * fade + 0.02, premium: 0.25, perCap: 0.08, sponsor: 0.06 + 0.04 * fade };
}

/** The share of the gate a temporary home keeps: a smaller, borrowed building. */
export function tempVenueFactor(state: GameState, date: string): number {
  const t = state.construction?.temporary;
  return t && date <= t.until ? 0.68 : 1;
}

// ---- Studies, sites and design ----

const STUDY_COST = 4 * M;

/** Commission the feasibility studies: about three months and $4M. */
export function commissionStudies(state: GameState): string | null {
  const c = construction(state);
  if (c.plan && c.plan.stage !== "shelved" && c.plan.stage !== "open") return "A stadium plan is already under way.";
  if (c.cpu.some((b) => b.team === state.userTeam && !b.failed && (b.opens ?? 0) >= RULES.season)) return "Our new stadium is already being built.";
  post(state, "professional", -STUDY_COST, "New-stadium feasibility studies");
  const s = STADIUM_BY_TEAM[state.userTeam];
  c.plan = {
    stage: "study", started: state.date, studyDue: addDays(state.date, 90), sites: [], roof: s.roof, capacity: Math.max(62_000, Math.min(72_000, Math.round(s.capacity / 1000) * 1000)),
    model: modelOf(s.structure === "tenant" || s.structure === "coowned" ? "owned" : s.structure), benefits: { jobs: false, local: false, access: false }, district: 0,
    name: `New ${TEAM_BY_ID[state.userTeam].city} Stadium`, funding: { equity: 0, loan: 0, league: 0, public: 0, psl: 0 }, bids: [], paid: 0, events: [], milestones: {}, commitments: [],
  };
  note(state, "Commissioned feasibility studies for a new stadium.");
  news(state, `${TEAM_BY_ID[state.userTeam].name} commission studies for a new stadium`);
  return `The consultants report back around ${shortDate(c.plan.studyDue!)}.`;
}

const SUBURBS = ["the northern suburbs", "the riverfront county", "the airport corridor", "the western county", "a neighboring city across the line"];

function finishStudies(state: GameState): void {
  const p = construction(state).plan!;
  const us = state.userTeam;
  const r = rngFor(state.seed, `stadium-study:${us}:${p.started}`);
  const s = STADIUM_BY_TEAM[us];
  const metro = TEAM_BY_ID[us].city;
  const mk = (id: string, name: string, kind: Site["kind"], land: number, transit: number, parking: number, reach: number, env: number, dev: number, juris: string): Site =>
    ({ id, name, kind, land: Math.round(land * (0.85 + 0.3 * r()) / M) * M, transit: round2(transit), parking: round2(parking), reach: round2(reach), envRisk: round2(env), development: round2(dev), jurisdiction: juris });
  p.sites = [
    mk("current", `The current site, next to ${s.name}`, "current", 60 * M, 0.5, 0.75, 1, 0.15, 0.3, `the city of ${metro}`),
    mk("downtown", `A downtown site in ${metro}`, "downtown", 320 * M, 0.85 + 0.1 * r(), 0.35, 1.04, 0.35 + 0.3 * r(), 0.85, `the city of ${metro}`),
    mk("suburb", `A suburban site in ${SUBURBS[Math.floor(r() * SUBURBS.length)]}`, "suburb", 140 * M, 0.25, 0.95, 0.98 + 0.04 * r(), 0.2 + 0.3 * r(), 0.6, "the county"),
  ];
  const cost = baseCost(state, p);
  p.study = {
    demand: round2(1 + (s.opened < 2000 ? 0.06 : 0.02) + gaussian(r) * 0.02),
    low: Math.round(cost * 0.92 / 10 / M) * 10 * M, high: Math.round(cost * 1.25 / 10 / M) * 10 * M,
    engineering: r() < 0.3 ? "Soil borings found poor ground at two of the sites: deeper foundations add cost there." : "No unusual engineering risks at any site.",
    access: "The downtown site rides transit; the suburban site has the parking and the room to build around it.",
    financing: `Seat licenses could raise about ${money(pslEstimate(state, p))}, and the league's stadium program lends up to ${money(leagueLimit(state))}.`,
  };
  p.stage = "design";
  send(state, "business", businessChief(state), "Stadium studies are in",
    `Demand would run about ${Math.round((p.study.demand - 1) * 100)}% above today's in a new building. A ${p.capacity.toLocaleString("en-US")}-seat stadium would cost ${money(p.study.low)} to ${money(p.study.high)} today. ` +
    `${p.study.engineering} Pick a site, the roof and the ownership model on the Business page.`);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** The building's price today, before bids: seats, the roof, the land, and building costs. */
export function baseCost(state: GameState, p: StadiumPlan): number {
  const site = p.sites.find((s) => s.id === p.site) ?? p.sites[0];
  const year = Number(state.date.slice(0, 4));
  const seats = 1_350 * M * (p.capacity / 65_000) ** 0.9;
  const raw = seats * ROOFS[p.roof].build + (site?.land ?? 100 * M) + (p.benefits.local ? seats * 0.02 : 0);
  return Math.round((raw * inflation(year, 0.04) * constructionFactor(state) + (p.mitigation ?? 0)) / M) * M;
}

export function pslEstimate(state: GameState, p: StadiumPlan): number {
  const heat = STADIUM_BY_TEAM[state.userTeam] ? (metroPop(state.userTeam, Number(state.date.slice(0, 4))) / 4) : 1;
  return Math.round(Math.min(550, 120 + 90 * heat) * (p.capacity / 65_000) / 10) * 10 * M;
}

export function leagueLimit(state: GameState): number {
  return Math.round(300 * M * inflation(Number(state.date.slice(0, 4)), 0.03) / M) * M;
}

export function designPlan(state: GameState, d: Partial<Pick<StadiumPlan, "site" | "roof" | "capacity" | "model" | "district" | "name">> & { benefits?: Partial<StadiumPlan["benefits"]> }): string | null {
  const p = construction(state).plan;
  if (!p || p.stage !== "design") return "Nothing to design right now.";
  if (d.site && !p.sites.some((s) => s.id === d.site)) return "No such site.";
  Object.assign(p, { ...d, benefits: { ...p.benefits, ...(d.benefits ?? {}) } });
  p.capacity = Math.max(55_000, Math.min(80_000, Math.round(p.capacity / 1000) * 1000));
  p.district = Math.max(0, Math.min(400 * M, p.district));
  return null;
}

/** Take the design to the public side: the politics start (politics.ts). A team-owned building with no public ask goes straight to financing. */
export function submitDesign(state: GameState, ask: number): string | null {
  const p = construction(state).plan;
  if (!p || p.stage !== "design") return "Nothing to submit.";
  if (!p.site) return "Pick a site first.";
  const cost = baseCost(state, p);
  const max = Math.round(cost * MODELS[p.model].publicMax);
  if (ask > max) return `Under this ownership model the public side won't go past ${money(max)}.`;
  if (p.benefits.jobs) p.commitments.push("Local hiring: 30% of construction and stadium jobs to residents, with a $2M-a-year training program.");
  if (p.benefits.local) p.commitments.push("Local and minority-owned contractors get at least 20% of the construction spending.");
  if (p.benefits.access) p.commitments.push("Community use: the building hosts 25 free public events a year and a $1.5M-a-year neighborhood fund.");
  if (ask <= 0) {
    p.funding.public = 0;
    p.milestones.political = state.date;
    p.stage = "finance";
    note(state, "Design set; privately funded, so no public vote is needed.");
    return "With no public money in it, the plan goes straight to financing. Permits and the environmental review come before construction.";
  }
  p.stage = "politics";
  startPolitics(state, ask);
  return null;
}

// ---- Financing, bids and permits ----

export function setFunding(state: GameState, f: Partial<Pick<Funding, "equity" | "loan" | "psl">>): string | null {
  const p = construction(state).plan;
  if (!p || p.stage !== "finance") return "Financing comes after the public side has decided.";
  p.funding = { ...p.funding, ...f, league: Math.min(leagueLimit(state), Math.round(Math.max(0, ourShareOf(state, p)) * 0.25)) };
  p.funding.psl = Math.max(0, Math.min(pslEstimate(state, p), p.funding.psl));
  return null;
}

/** What we have to raise: the building, the district, less the public money (and a rival suburb's offer). */
export function ourShareOf(state: GameState, p: StadiumPlan): number {
  const site = p.sites.find((s) => s.id === p.site);
  return baseCost(state, p) + p.district - p.funding.public - (site?.subsidy ?? 0);
}

export function fundingGap(state: GameState, p: StadiumPlan): number {
  const f = p.funding;
  return Math.round(ourShareOf(state, p) * 1.05 - (f.equity + f.loan + f.league + f.psl));
}

/** Close the financing: commits the owner's money, the loans and the seat-license campaign, and invites bids. */
export function closeFinancing(state: GameState): string | null {
  const p = construction(state).plan;
  if (!p || p.stage !== "finance") return "Nothing to close.";
  const f = p.funding;
  f.league = Math.min(leagueLimit(state), Math.round(Math.max(0, ourShareOf(state, p)) * 0.25));
  const gap = fundingGap(state, p);
  if (gap > 0) return `The package is ${money(gap)} short of our share plus a 5% contingency.`;
  if (f.equity > 0) {
    const e = ownerCash(state, f.equity);
    if (e) return e;
  }
  if (f.loan > 0) {
    const e = stadiumLoan(state, f.loan);
    if (e) return e;
  }
  if (f.league > 0) leagueStadiumLoan(state, f.league);
  if (f.psl > 0) post(state, "seatLicenses", f.psl, `Seat licenses for ${p.name}`);
  p.milestones.financial = state.date;
  p.commitments.push(`Financing: ${money(f.equity)} from the owner, ${money(f.loan)} stadium loan, ${money(f.league)} from the league's stadium program, ${money(f.psl)} in seat licenses${f.public ? `, ${money(f.public)} in public money` : ""}.`);
  p.stage = "bids";
  inviteBids(state);
  note(state, "Financing closed; bids invited.");
  return "Financing closed. Three contractors have bid; compare them and pick a contract.";
}

function inviteBids(state: GameState): void {
  const p = construction(state).plan!;
  const r = rngFor(state.seed, `bids:${state.userTeam}:${state.date}`);
  const cost = baseCost(state, p);
  const names = [...CONTRACTORS].sort(() => r() - 0.5).slice(0, 3);
  p.bids = names.map((contractor) => {
    const record = round2(0.4 + 0.5 * r());
    return { contractor, record, price: Math.round(cost * (0.94 + 0.12 * r() + (record - 0.65) * 0.08) / M) * M, months: 28 + Math.floor(r() * 7) };
  });
}

export function awardContract(state: GameState, contractor: string, kind: ContractKind): string | null {
  const p = construction(state).plan;
  if (!p || p.stage !== "bids") return "No bids to award.";
  const b = p.bids.find((x) => x.contractor === contractor);
  if (!b) return "No such bid.";
  p.contractor = b;
  p.contract = kind;
  p.price = Math.round(b.price * (1 + CONTRACTS[kind].premium) / M) * M;
  p.cost = p.price;
  p.index = constructionFactor(state);
  const site = p.sites.find((s) => s.id === p.site)!;
  p.ours = Math.max(0, p.price + p.district - p.funding.public - (site.subsidy ?? 0));
  p.milestones.contractual = p.milestones.contractual ?? state.date;
  // Zoning and building permits; the environmental review runs alongside unless politics already did it.
  const r = rngFor(state.seed, `permits:${state.userTeam}:${state.date}`);
  p.permitsDue = addDays(state.date, 60 + Math.floor(r() * 60) + Math.round(site.envRisk * 60));
  p.stage = "permits";
  note(state, `Awarded the contract to ${b.contractor} (${CONTRACTS[kind].label.toLowerCase()}, ${money(p.price)}).`);
  news(state, `${TEAM_BY_ID[state.userTeam].name} pick ${b.contractor} to build ${p.name}`);
  return `Permits should come through around ${shortDate(p.permitsDue)}; construction starts then.`;
}

function startBuild(state: GameState): void {
  const c = construction(state);
  const p = c.plan!;
  p.milestones.permits = state.date;
  p.buildStart = state.date;
  p.complete = addDays(state.date, Math.round(p.contractor!.months * 30.4));
  p.opens = openingDay(p.complete);
  p.stage = "build";
  const site = p.sites.find((s) => s.id === p.site)!;
  if (site.kind === "current") {
    c.temporary = { name: TEMP_HOME[state.userTeam] ?? "a college stadium nearby", until: addDays(p.opens, -1) };
    send(state, "business", businessChief(state), "Our temporary home",
      `The old stadium comes down to make room, so we play at ${c.temporary.name} until ${p.name} opens. Smaller crowds and less premium seating until then.`);
  }
  news(state, `Construction begins on ${p.name}; it should open in ${p.opens.slice(0, 4)}`);
  addStory(state, {
    outlet: "sideline", by: MEDIA_BY_ID.sideline.reporter, kind: "owner", teams: [state.userTeam],
    headline: `Ground broken on ${p.name}`,
    body: `${TEAM_BY_ID[state.userTeam].name} broke ground today on a ${p.capacity.toLocaleString("en-US")}-seat ${ROOFS[p.roof].label.toLowerCase()} stadium budgeted at ${money(p.price!)}, due in ${p.opens.slice(0, 4)}.`,
  });
}

/** Buildings open for the season: the first August 1 after the work is done. */
function openingDay(complete: string): string {
  const y = Number(complete.slice(0, 4));
  return complete <= `${y}-08-01` ? `${y}-08-01` : `${y + 1}-08-01`;
}

/** College and other stadiums a club could borrow while its own is rebuilt (approximate). */
const TEMP_HOME: Record<string, string> = {
  BUF: "Syracuse's JMA Wireless Dome", MIA: "FIU Stadium", NE: "Gillette's practice bubble and BC's Alumni Stadium", NYJ: "Rutgers' SHI Stadium", NYG: "Rutgers' SHI Stadium",
  BAL: "Navy-Marine Corps Memorial Stadium", CIN: "Nippert Stadium", CLE: "Ohio Stadium in Columbus", PIT: "Penn State's Beaver Stadium", HOU: "Rice Stadium",
  IND: "Purdue's Ross-Ade Stadium", JAX: "Camping World Stadium in Orlando", TEN: "Vanderbilt's FirstBank Stadium", DEN: "CU's Folsom Field", KC: "Arrowhead's practice fields and KU's stadium",
  LV: "UNLV's old Sam Boyd Stadium", LAC: "the Rose Bowl", LA: "the Rose Bowl", DAL: "the Cotton Bowl", PHI: "Lincoln Financial's neighbor, Franklin Field", WAS: "Navy-Marine Corps Memorial Stadium",
  CHI: "Northwestern's Ryan Field", DET: "Michigan Stadium", GB: "Camp Randall Stadium", MIN: "Huntington Bank Stadium", ATL: "Bobby Dodd Stadium",
  CAR: "Kenan Stadium", NO: "Tulane's Yulman Stadium", TB: "Raymond James' neighbor, USF's stadium", ARI: "Sun Devil Stadium", SF: "Stanford Stadium", SEA: "Husky Stadium",
};

// ---- The build ----

const EVENTS: { text: string; cost: [number, number]; months: number; change?: boolean }[] = [
  { text: "Labor shortage: the trades are stretched across the region's projects", cost: [0.02, 0.05], months: 1 },
  { text: "Supply problems: steel and electrical gear arrive late", cost: [0.015, 0.04], months: 1 },
  { text: "Engineering surprise: the foundations need more work than the borings showed", cost: [0.03, 0.08], months: 2 },
  { text: "Change orders: we added to the premium spaces and the technology package", cost: [0.015, 0.04], months: 0, change: true },
];

function buildMonth(state: GameState): void {
  const p = construction(state).plan!;
  const r = rngFor(state.seed, `build:${state.userTeam}:${state.date}`);
  // Building costs rising faster than when the contract was signed push the price on all but a fixed-price job.
  const odds = 0.14 * constructionFactor(state) * (1.35 - p.contractor!.record);
  if (r() < odds) {
    const e = EVENTS[Math.floor(r() * EVENTS.length)];
    const cost = Math.round(p.price! * (e.cost[0] + r() * (e.cost[1] - e.cost[0])) / M) * M;
    const share = e.change ? 1 : CONTRACTS[p.contract!].ours;
    const months = p.contract === "fixed" ? Math.floor(e.months / 2) : e.months;
    applyEvent(state, { date: state.date, text: e.text, cost, ours: Math.round(cost * share), months });
  }
  // Pay the month's share of what's left.
  const left = Math.max(1, Math.round(daysBetween(state.date, p.complete!) / 30.4));
  const pay = Math.round(Math.max(0, p.ours! - p.paid) / left);
  if (pay > 0) {
    p.paid += pay;
    post(state, "projects", -pay, `${p.name}: construction`);
  }
}

function applyEvent(state: GameState, e: BuildEvent): void {
  const p = construction(state).plan!;
  p.events.unshift(e);
  p.cost = (p.cost ?? p.price!) + e.cost;
  p.ours = (p.ours ?? 0) + e.ours;
  if (e.months) {
    p.complete = addDays(p.complete!, Math.round(e.months * 30.4));
    const opens = openingDay(p.complete);
    if (opens !== p.opens) {
      p.opens = opens;
      const c = construction(state);
      if (c.temporary) c.temporary.until = addDays(opens, -1);
      news(state, `${p.name} slips a season: it now opens in ${opens.slice(0, 4)}`);
    }
  }
  send(state, "business", businessChief(state), `${p.name}: ${e.text.split(":")[0].toLowerCase()}`,
    `${e.text}. It adds ${money(e.cost)} to the job${e.ours < e.cost ? `, ${money(e.ours)} of it ours under the contract` : ""}${e.months ? ` and about ${e.months} month${e.months > 1 ? "s" : ""}` : ""}.`);
}

/** The overrun so far against the contract price. */
export function overrun(p: StadiumPlan): number {
  return p.price ? (p.cost ?? p.price) / p.price - 1 : 0;
}

function openStadium(state: GameState): void {
  const c = construction(state);
  const p = c.plan!;
  const us = state.userTeam;
  if (p.paid < (p.ours ?? 0)) post(state, "projects", -((p.ours ?? 0) - p.paid), `${p.name}: final payment`);
  p.paid = p.ours ?? 0;
  p.milestones.opened = state.date;
  p.stage = "open";
  const m = MODELS[p.model];
  const year = Number(state.date.slice(0, 4));
  const n: NewStadium = {
    team: us, name: p.name, roof: p.roof, capacity: p.capacity, opened: year, structure: m.structure,
    owner: p.model === "team" ? TEAM_BY_ID[us].name : `the ${TEAM_BY_ID[us].city} stadium authority`,
    operator: p.model === "authority" ? `the ${TEAM_BY_ID[us].city} stadium authority` : TEAM_BY_ID[us].name,
    rent: Math.round(m.rent * inflation(year, 0.03)), upkeep: Math.round((22 * M + ROOFS[p.roof].run) * (p.capacity / 65_000) * inflation(year, 0.03)),
    ours: true, district: p.district,
  };
  replaceStadium(state, n);
  delete c.temporary;
  note(state, `${p.name} opened.`);
  send(state, "business", businessChief(state), `${p.name} is open`,
    `It came in at ${money(p.cost ?? 0)} against a ${money(p.price ?? 0)} contract (${Math.round(overrun(p) * 100)}% over), ${daysBetween(p.started, state.date) > 0 ? `${(daysBetween(p.started, state.date) / 365).toFixed(1)} years after the first study` : ""}. Expect a jump in demand for the first few seasons.`);
  addStory(state, {
    outlet: "sideline", by: MEDIA_BY_ID.sideline.reporter, kind: "owner", teams: [us],
    headline: `${p.name} opens its doors`,
    body: `The ${TEAM_BY_ID[us].name} open their new ${ROOFS[p.roof].label.toLowerCase()} home this season. The final bill: ${money(p.cost ?? 0)}.`,
  });
}

/** A new building takes the old one's place: bound into the stadium data, a fresh set of facility parts, and a new lease or none. */
function replaceStadium(state: GameState, n: NewStadium): void {
  const c = construction(state);
  c.opened = c.opened.filter((x) => x.team !== n.team);
  c.opened.push(n);
  // Every part of the new building is new; the training complex is untouched.
  const f = n.team === state.userTeam ? state.facilities : undefined;
  if (f) {
    const defs = partDefs(n.team);
    for (const k of Object.keys(f.parts)) if (!defs[k]) delete f.parts[k];
    for (const [k, d] of Object.entries(defs)) if (d.site === "stadium") f.parts[k] = { wear: 0, replaced: RULES.season };
  }
  const leases = state.leases;
  if (leases) {
    if (n.structure === "owned") delete leases[n.team];
    else leases[n.team] = { through: n.opened + 29, rent: n.rent, upkeep: n.upkeep, eventShare: n.structure === "publicAuthority" ? 0.1 : 1, fund: 0, log: [{ date: state.date, text: `New lease for the new stadium through ${n.opened + 29}.` }] };
  }
  bindConstruction(state);
  if (n.team !== state.userTeam) news(state, `The ${teamLabel(n.team)} open ${n.name}`);
}

// ---- Other clubs ----

/** Each league year an older building may start a club down the road to a new one. */
function cpuYear(state: GameState): void {
  const c = construction(state);
  const year = leagueYear0(state);
  for (const b of c.cpu) {
    if (b.failed || b.approved) continue;
    const r = rngFor(state.seed, `cpu-approve:${b.team}:${year}`);
    if (daysBetween(b.announced, state.date) > 330 && r() < 0.55) {
      b.approved = state.date;
      b.opens = year + 3 + (r() < 0.4 ? 1 : 0);
      news(state, `Officials approve the ${teamLabel(b.team)}' new stadium: ${money(b.cost)}, opening in ${b.opens}`);
    } else if (daysBetween(b.announced, state.date) > 1000) {
      b.failed = true;
      news(state, `The ${teamLabel(b.team)}' new-stadium plan stalls after public money falls through`);
      failedDeal(state, b.team);
    }
  }
  for (const t of TEAMS) {
    if (t.id === state.userTeam || c.cpu.some((b) => b.team === t.id && !b.failed && (b.opens === undefined || b.opens >= year - 15))) continue;
    if (c.opened.some((n) => n.team === t.id)) continue;
    const s = STADIUM_BY_TEAM[t.id];
    if (year - s.opened < 28 || s.structure === "tenant") continue;
    const r = rngFor(state.seed, `cpu-stadium:${t.id}:${year}`);
    if (r() >= 0.045) continue;
    const roof: Roof = r() < 0.5 ? "dome" : r() < 0.6 ? "retractable" : "open";
    const cost = Math.round(1_600 * M * ROOFS[roof].build * inflation(year, 0.04) * constructionFactor(state) / 10 / M) * 10 * M;
    c.cpu.push({ team: t.id, announced: state.date, name: `New ${t.city} Stadium`, roof, cost, structure: r() < 0.5 ? "publicTeam" : "owned" });
    news(state, `The ${teamLabel(t.id)} unveil plans for a ${money(cost)} stadium to replace ${s.name}`);
  }
}

/** A failed public deal: the relocation module listens for it (O2). Kept as a log line here. */
function failedDeal(state: GameState, team: string): void {
  const c = construction(state);
  c.log.unshift({ date: state.date, text: `${teamLabel(team)}: stadium plan failed.` });
}

function leagueYear0(state: GameState): number {
  return Number(state.date.slice(0, 4));
}

function cpuOpenings(state: GameState): void {
  const c = construction(state);
  const year = Number(state.date.slice(0, 4));
  for (const b of c.cpu) {
    if (b.failed || !b.approved || b.opens !== year || c.opened.some((n) => n.team === b.team && n.opened === year)) continue;
    const old = STADIUM_BY_TEAM[b.team];
    replaceStadium(state, {
      team: b.team, name: b.name, roof: b.roof, capacity: Math.max(62_000, Math.min(70_000, old.capacity)), opened: year, structure: b.structure,
      owner: b.structure === "owned" ? TEAM_BY_ID[b.team].name : `the ${TEAM_BY_ID[b.team].city} stadium authority`, operator: TEAM_BY_ID[b.team].name,
      rent: b.structure === "owned" ? 0 : 3 * M, upkeep: Math.round((22 * M + ROOFS[b.roof].run) * inflation(year, 0.03)), ours: b.team === state.userTeam,
    });
  }
}

/** Approvals across the league in the save: about one every two to four years. */
export function approvalsSince(state: GameState, from: string): number {
  return construction(state).cpu.filter((b) => b.approved && b.approved >= from).length + ((construction(state).plan?.milestones.political ?? "") >= from ? 1 : 0);
}

export function constructionDaily(state: GameState): void {
  const c = construction(state);
  if (state.date.endsWith("-03-01")) cpuYear(state);
  if (state.date.endsWith("-07-15")) cpuOpenings(state);
  const p = c.plan;
  if (!p) return;
  if (p.stage === "study" && state.date >= p.studyDue!) finishStudies(state);
  else if (p.stage === "permits" && state.date >= p.permitsDue!) startBuild(state);
  else if (p.stage === "build") {
    if (state.date.endsWith("-01")) buildMonth(state);
    if (state.date >= p.opens!) openStadium(state);
  }
}

/** Shelve the plan (or what's left of a failed one). */
export function shelvePlan(state: GameState): string | null {
  const p = construction(state).plan;
  if (!p) return "No plan to shelve.";
  if (p.stage === "build" || p.stage === "permits") return "Construction contracts are signed; the building goes up.";
  p.stage = "shelved";
  note(state, "Shelved the stadium plan.");
  return null;
}

/** Test and report helper: run the plan through to construction with sensible choices. */
export function fastTrack(state: GameState, opts: { site?: string; roof?: Roof; model?: Model; ask?: number; contract?: ContractKind } = {}): void {
  const c = construction(state);
  if (!c.plan || c.plan.stage === "shelved" || c.plan.stage === "open") commissionStudies(state);
  if (c.plan!.stage === "study") finishStudies(state);
  designPlan(state, { site: opts.site ?? "suburb", roof: opts.roof ?? "dome", model: opts.model ?? "partnership" });
  const p = c.plan!;
  submitDesign(state, 0);
  p.funding.public = opts.ask ?? Math.round(baseCost(state, p) * 0.3);
  const need = ourShareOf(state, p) * 1.05;
  const league = Math.min(leagueLimit(state), Math.round(ourShareOf(state, p) * 0.25));
  const psl = pslEstimate(state, p);
  const o = state.owner;
  if (o) o.liquid = Math.max(o.liquid, need);
  setFunding(state, { psl, loan: 0, equity: Math.max(0, Math.round(need - league - psl)) });
  closeFinancing(state);
  awardContract(state, p.bids[0].contractor, opts.contract ?? "gmp");
  startBuild(state);
}

