// The venue on game day, on top of the operations check in gameops.ts. The
// owner sets the plan: how many people work the game (gates, ushers,
// concessions, cleaning, guest services), security, the entertainment and
// video-board show, alcohol rules, a transit or rideshare plan, the menu,
// weather readiness, medical crews and backup systems. Each home game then
// plays out: time from the car to the seat, lines at the gates, concessions
// and restrooms, food prepared against food sold, merchandise that runs out,
// lightning delays at open-air stadiums, faults (escalators, scanners, card
// terminals, the PA), incidents, inspections and the league's checks on the
// visiting team's rooms and the medical crews. A postgame report counts
// everything and the game's own profit; complaints that keep coming back get
// flagged; experiments show whether a change moved the surveys.
import { securityFactor } from "./departments";
import { concourseNudge, condition, faultFactor, networkFactor } from "./facilities";
import { business, businessChief, deptCost, post } from "./business";
import { leagueYear } from "./contracts";
import { execBoost, execRole } from "./executives";
import { fanBase } from "./fans";
import { send } from "./inbox";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { rivalryHeat } from "./records";
import { gaussian, rngFor } from "./rng";
import { STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, ScheduledGame, SurveyItem, VenuePlan, VenueReport, VenueState } from "./types";

const K = 1000;
export const DEFAULT_PLAN: VenuePlan = { staffing: 1, security: 1, show: "standard", alcohol: "standard", transit: "none", menu: "standard", weather: false, backups: false, medics: 1 };
export const LEVEL = ["Lean", "Standard", "Full", "Deep"];
export const SHOW_LABEL: Record<VenuePlan["show"], string> = { basic: "Basic: PA and replays", standard: "Standard: music, video features, a halftime act", premium: "Premium: a pregame show, guest performers, drone and light shows" };
export const ALCOHOL_LABEL: Record<VenuePlan["alcohol"], string> = { standard: "League standard (ID checks, two-drink limit)", thirdQuarter: "Stop sales after the third quarter", strict: "Strict: ID at every sale, one drink at a time, more trained staff" };
export const TRANSIT_LABEL: Record<VenuePlan["transit"], string> = { none: "Leave it to the city", shuttles: "Park-and-ride shuttles with the transit agency", rideshare: "Rideshare zones and police traffic control" };
export const MENU_LABEL: Record<VenuePlan["menu"], string> = { standard: "Standard stadium menu", local: "Local favorites from area restaurants", wide: "Wide menu: local, healthy, vegetarian, allergy-friendly" };
export const EXPERIMENTS: Record<string, { label: string; item: SurveyItem }> = {
  menu: { label: "A new menu at a few stands", item: "concessions" },
  queue: { label: "Single-line queues at the busiest stands", item: "lines" },
  wayfinding: { label: "New signs and maps from the parking lots to the gates", item: "parking" },
  mobile: { label: "Mobile ordering with pickup windows", item: "lines" },
};
/** League-wide norms the operations director benchmarks against. */
export const BENCHMARK = { arrival: 32, gateWait: 9, foodWait: 8, restroomWait: 5, complaints: 3.5, perCapFood: 28, perCapMerch: 9 };

export function venue(state: GameState): VenueState {
  return (state.venue ??= { plan: { ...DEFAULT_PLAN }, reports: [], experiments: [], flags: [], investigations: [] });
}

export function setPlan(state: GameState, p: Partial<VenuePlan>): void {
  Object.assign(venue(state).plan, p);
}

/** Backup power, networking and radios: a one-time project that makes outages rarer. */
export function buildBackups(state: GameState): string | null {
  const v = venue(state);
  if (v.backupsBuilt) return "The backup systems are already in.";
  v.backupsBuilt = state.date;
  v.plan.backups = true;
  post(state, "projects", -3_000_000, "Backup power, networking and radios for game day");
  return null;
}

export function startExperiment(state: GameState, kind: string): string | null {
  const v = venue(state);
  if (v.experiment && !v.experiment.done) return "An experiment is already running.";
  const e = EXPERIMENTS[kind];
  if (!e) return "Pick an experiment.";
  // Whether it works isn't known until it's tried: most help a little, some don't.
  const rng = rngFor(state.seed, `experiment:${kind}:${state.date}`);
  v.experiment = { kind, label: e.label, start: state.date, games: 0, effect: Math.round((0.15 + gaussian(rng) * 0.35) * 100) / 100 };
  return null;
}

/** What the plan costs per game beyond the game-day budget. */
export function planCost(p: VenuePlan): { labor: number; security: number; show: number; other: number } {
  return {
    labor: [-120, 0, 150, 300][p.staffing] * K + (p.menu === "local" ? 30 * K : p.menu === "wide" ? 50 * K : 0) + [-20, 0, 30, 60][p.medics] * K,
    security: [-50, 0, 80, 160][p.security] * K + (p.alcohol === "strict" ? 40 * K : 0),
    show: { basic: -80 * K, standard: 0, premium: 200 * K }[p.show],
    other: (p.transit === "shuttles" ? 60 * K : p.transit === "rideshare" ? 30 * K : 0) + (p.weather ? 20 * K : 0),
  };
}

interface Flow { gateWait: number; foodWait: number; restroomWait: number; arrival: number }

function flow(p: VenuePlan, crowd: number, parking: number): Flow {
  const gateWait = 6 + Math.max(0, crowd - 0.85) * 40 - (p.staffing - 1) * 2.2 + (p.security - 1) * 0.8;
  const foodWait = 6 + Math.max(0, crowd - 0.8) * 25 - (p.staffing - 1) * 1.6 + (p.menu === "wide" ? 0.6 : 0);
  const restroomWait = 3 + Math.max(0, crowd - 0.85) * 20 - (p.staffing - 1) * 0.8;
  const arrival = 20 + gateWait + (p.transit === "none" ? Math.max(0, crowd - 0.9) * 60 : p.transit === "shuttles" ? -3 : -2) + (parking - 1) * -4;
  return { gateWait: Math.max(2, gateWait), foodWait: Math.max(2, foodWait), restroomWait: Math.max(1, restroomWait), arrival: Math.max(12, arrival) };
}

const FAULTS: { what: string; backed?: boolean; item: SurveyItem; cat: string; revenue?: number }[] = [
  { what: "Two escalators on the upper concourse were down", item: "lines", cat: "lines" },
  { what: "Ticket scanners went down at a gate for twenty minutes", backed: true, item: "lines", cat: "lines" },
  { what: "Card terminals lost their network link at half the stands", backed: true, item: "concessions", cat: "food", revenue: 0.06 },
  { what: "The stadium Wi-Fi failed in the lower bowl", backed: true, item: "service", cat: "tech" },
  { what: "The PA cut out in one end zone for a quarter", backed: true, item: "service", cat: "tech" },
  { what: "Part of the main video board went dark", item: "service", cat: "tech" },
  { what: "A power problem shut a row of concession stands", backed: true, item: "concessions", cat: "food", revenue: 0.04 },
];

/**
 * Plays out the venue side of one of our home games. Returns the report and
 * how each survey question should move from what happened.
 */
export function venueGame(state: GameState, g: ScheduledGame, x: { attendance: number; sold: number; comps: number; noShows: number; revenue: number; gateShare: number; concessions: number; parking: number; merch: number; merchShort: number }): { report: VenueReport; adj: Partial<Record<SurveyItem, number>>; concessionsLoss: number } {
  const v = venue(state);
  const p = v.plan;
  const b = business(state);
  const us = state.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const rng = rngFor(state.seed, `venue:${g.id}`);
  const crowd = x.attendance / s.capacity;
  const f = flow(p, crowd, b.prices.parking);
  const base = flow(DEFAULT_PLAN, crowd, b.prices.parking);
  const age = Math.max(0, leagueYear(state.date) - s.opened);
  const upkeep = (1.3 - 0.2 * b.budget.facilities) * (1 + age / 40) * (1 - 0.2 * execBoost(state, "SOD")) * faultFactor(state);
  const guard = securityFactor(state);
  const faults: string[] = [];
  const incidents: string[] = [];
  const complaints: Record<string, number> = {};
  const complain = (cat: string, n: number) => { complaints[cat] = Math.round((complaints[cat] ?? 0) + n); };
  const adj: Partial<Record<SurveyItem, number>> = {};
  const bump = (k: SurveyItem, d: number) => { adj[k] = (adj[k] ?? 0) + d; };
  let revenueLoss = 0;
  let other = 0;
  // Lines and the trip in, against what a standard plan would have done with the same crowd.
  bump("lines", -(f.gateWait - base.gateWait) / 5 - (f.foodWait - base.foodWait) / 6 - (f.restroomWait - base.restroomWait) / 6);
  bump("parking", -(f.arrival - base.arrival) / 10);
  bump("service", (p.staffing - 1) * 0.25 + (p.show === "premium" ? 0.3 : p.show === "basic" ? -0.3 : 0));
  bump("concessions", p.menu === "local" ? 0.3 : p.menu === "wide" ? 0.4 : 0);
  bump("cleanliness", (p.staffing - 1) * 0.3 + concourseNudge(state));
  // Food: what was prepared against what the crowd wanted.
  const want = x.attendance * (1 + gaussian(rng) * 0.08);
  const prep = x.attendance * (1.04 + (p.staffing - 1) * 0.02);
  const shortShare = Math.max(0, want - prep) / Math.max(1, want);
  const wasteShare = Math.max(0, prep - want) / Math.max(1, prep);
  const foodGross = x.concessions / 0.42 / Math.max(0.1, s.gameDayShare);
  const foodShort = foodGross * shortShare;
  const foodWaste = foodGross * 0.35 * wasteShare;
  revenueLoss += x.concessions * shortShare;
  if (shortShare > 0.03) { bump("concessions", -0.4); complain("food", x.attendance * 0.0004); }
  // Faults: older buildings and thin upkeep break more; backups catch most outages.
  for (const ft of FAULTS) {
    const pr = 0.025 * upkeep * (ft.backed && p.backups ? 0.3 : 1) * (ft.backed ? networkFactor(state) : 1);
    if (rng() < pr) {
      faults.push(ft.what);
      bump(ft.item, -0.5);
      complain(ft.cat, x.attendance * 0.0006);
      if (ft.revenue) revenueLoss += x.concessions * ft.revenue;
    }
  }
  // Lightning at open-air stadiums in the early season.
  const box = state.box[g.id];
  const month = Number(g.date.slice(5, 7));
  let delay: number | undefined;
  if (s.roof === "open" && box?.weather?.precip === "rain" && month >= 8 && month <= 10 && rng() < 0.35) {
    delay = 30 + Math.round(rng() * 60);
    incidents.push(`Lightning stopped play for ${delay} minutes; ${p.weather ? "the crowd was moved to the concourses on the plan" : "the crowd crowded the concourses without a plan, and the lines backed up"}.`);
    if (!p.weather) { bump("lines", -0.6); bump("service", -0.4); complain("safety", x.attendance * 0.0005); }
  }
  // Medical calls and fights.
  const rival = rivalryHeat(state, us, g.home === us ? g.away! : g.home!) >= 3.5;
  const fights = (x.attendance / 15000) * { standard: 1, thirdQuarter: 0.8, strict: 0.6 }[p.alcohol] * [1.3, 1, 0.8, 0.65][p.security] * (rival ? 1.5 : 1);
  const ejections = Math.round(fights * (0.7 + rng() * 0.6) * 3);
  if (ejections >= 10) incidents.push(`${ejections} fans ejected, most for alcohol-related fights.`);
  if (ejections >= 6) complain("safety", ejections * 0.6);
  const medical = Math.round((x.attendance / 8000) * (0.7 + rng() * 0.6));
  if (medical >= 10) incidents.push(`Medical crews handled ${medical} calls, most of them heat or falls.`);
  if (p.medics === 0 && rng() < 0.15 * guard) {
    incidents.push("A fan in cardiac arrest waited too long for a crew; the league's medical review is asking why.");
    v.investigations.unshift({ date: state.date, game: g.id, text: "Slow medical response in the stands", finding: "Crews were stretched thin under the lean medical plan. The review recommends at least the standard number of crews." });
    send(state, "league", "League Office", "Emergency medical review", "The league requires qualified medical crews and ambulances at every game. Our review found the response was slow; bring the crews back to standard.", g.id);
  }
  if (rng() < 0.012 * [1.4, 1, 0.8, 0.6][p.security] * (rival ? 1.6 : 1) * guard) {
    const text = "A brawl in the upper deck spilled onto the concourse; video went viral";
    incidents.push(`${text}.`);
    v.investigations.unshift({ date: state.date, game: g.id, text, finding: p.security === 0 ? "Security was thin in that section. Staffing should come back up." : "The response was by the book. Two fans were banned from the stadium." });
    addStory(state, { outlet: "blitz", by: MEDIA_BY_ID.blitz.reporter, kind: "league", teams: [us], headline: `Fight in the stands at ${s.name}`, body: `${text}. The team says it's reviewing the footage and will ban those involved.` });
    fanBase(state).trust -= 1;
  }
  // The league checks the visiting team's rooms and the medical crews; health and fire inspectors come once a month.
  let inspection: string | undefined;
  if (b.budget.facilities === 0 && rng() < 0.2) {
    inspection = "The visiting team complained about its locker room; the league sent a reminder of the standards.";
    other += 25 * K;
  }
  const firstOfMonth = !venue(state).reports.some((r) => r.date.slice(0, 7) === g.date.slice(0, 7));
  if (firstOfMonth && g.type === "REG") {
    const fail = rng() < 0.06 * upkeep * (p.staffing === 0 ? 1.6 : 1);
    inspection = fail ? "The health inspector cited two stands for food temperatures; fixed and fined." : "Health and fire inspections passed.";
    if (fail) { other += 40 * K; post(state, "fines", -15 * K, "Health code citation at the stadium"); }
    // The league's field check: drainage, the surface, lines and markers, goalposts and sideline equipment.
    const field = condition(state, "field");
    const fieldFail = rng() < Math.max(0.02, (70 - field) / 200);
    const finding = field < 45 ? "standing water near the sideline drains" : rng() < 0.5 ? "faded hash marks and a loose pylon" : "a goalpost padding tear and a worn bench heater";
    inspection += fieldFail ? ` The league's field inspection found ${finding}; fixed before kickoff.` : " The league's field inspection passed: drainage, surface, lines, goalposts and equipment.";
    if (fieldFail) other += 30 * K;
  }
  // Everyone else's view of the day.
  complain("lines", Math.max(0, f.gateWait - 8) * x.attendance * 0.00008 + Math.max(0, f.foodWait - 8) * x.attendance * 0.00006);
  complain("parking", Math.max(0, f.arrival - 30) * x.attendance * 0.00004);
  complain("restrooms", Math.max(0, f.restroomWait - 5) * x.attendance * 0.00008);
  complain("cleanliness", (1.4 - p.staffing * 0.4) * x.attendance * 0.00008);
  complain("accessibility", (1.3 - p.staffing * 0.3) * x.attendance * 0.00002);
  complain("staff", (1.2 - p.staffing * 0.3) * x.attendance * 0.00004);
  // An experiment in progress moves its question.
  // Three games in, the surveys from those games are in and the results go to the owner.
  let experiment: string | undefined;
  if (v.experiment && !v.experiment.done && v.experiment.games >= 3) finishExperiment(state);
  if (v.experiment && !v.experiment.done) {
    bump(EXPERIMENTS[v.experiment.kind].item, v.experiment.effect);
    v.experiment.games++;
    experiment = v.experiment.label;
  }
  // The game's books: the gate and what's sold inside, less the league's share, the crews, cleaning, the vendors and anything that broke.
  const plan = planCost(p);
  const labor = deptCost("gameday", b.budget.gameday, leagueYear(state.date)) + plan.labor + x.attendance * 1.6;
  const vendors = foodGross * (1 - 0.42) * s.gameDayShare;
  const extra = plan.labor + plan.security + plan.show + plan.other + other + foodWaste * 0.2;
  if (extra) post(state, "venue", -extra, `${g.type === "PRE" ? "Preseason" : "Week " + g.week}: game-day plan, cleanup and repairs`);
  if (revenueLoss) post(state, "concessions", -revenueLoss, "Sales lost to empty stands and down card terminals");
  const costs = { labor: Math.round(labor), vendors: Math.round(vendors), cleaning: Math.round(x.attendance * 1.6), security: Math.round(180 * K + plan.security), show: Math.round(120 * K + plan.show), other: Math.round(other + plan.other + foodWaste * 0.2) };
  const revenue = Math.round(x.revenue - revenueLoss);
  const report: VenueReport = {
    game: g.id, date: g.date, attendance: x.attendance, scanned: x.attendance - x.comps, sold: x.sold, distributed: x.sold + x.comps,
    arrival: Math.round(f.arrival), gateWait: Math.round(f.gateWait), foodWait: Math.round(f.foodWait), restroomWait: Math.round(f.restroomWait),
    foodWaste: Math.round(foodWaste), foodShort: Math.round(foodShort), merchShort: Math.round(x.merchShort), delay, faults, incidents, complaints,
    perCap: { food: Math.round(foodGross / Math.max(1, x.attendance)), merch: Math.round((x.merch / 0.45) / Math.max(1, x.attendance)), parking: Math.round((x.parking / Math.max(0.1, s.gameDayShare)) / Math.max(1, x.attendance)) },
    revenue, costs, profit: Math.round(revenue - x.gateShare - costs.labor - costs.security - costs.show - costs.other), experiment, inspection,
  };
  v.reports.unshift(report);
  v.reports.length = Math.min(v.reports.length, 30);
  recurring(state);
  return { report, adj, concessionsLoss: revenueLoss };
}

/** A complaint category at the top in three of the last four games is a recurring problem. */
function recurring(state: GameState): void {
  const v = venue(state);
  const last = v.reports.slice(0, 4);
  if (last.length < 4) return;
  const tops = last.map((r) => Object.entries(r.complaints).sort((a, b) => b[1] - a[1])[0]?.[0]);
  for (const cat of new Set(tops)) {
    if (!cat || tops.filter((c) => c === cat).length < 3) continue;
    if (v.flags.some((f) => f.cat === cat && f.date >= last[3].date)) continue;
    v.flags.unshift({ cat, date: state.date });
    v.flags.length = Math.min(v.flags.length, 20);
    const sod = execRole(state, "SOD");
    send(state, "business", sod ? `${sod.name}, stadium operations` : businessChief(state), `Recurring problem: ${cat}`,
      `Complaints about ${cat} topped the list in three of our last four home games. ${({ lines: "More staff at the gates and stands, or mobile ordering, would help.", parking: "A transit or rideshare plan would help.", restrooms: "More attendants and cleaning crews between quarters would help.", cleanliness: "A fuller staffing plan would help.", food: "Deeper prep or a menu change would help.", tech: "Backup systems would cut the outages.", safety: "More security or stricter alcohol rules would help.", staff: "Guest services is stretched thin.", accessibility: "Guest services needs more people at the accessible entrances." } as Record<string, string>)[cat] ?? ""}`);
  }
}

function finishExperiment(state: GameState): void {
  const v = venue(state);
  const e = v.experiment!;
  e.done = true;
  const item = EXPERIMENTS[e.kind].item;
  const surveys = fanBase(state).surveys;
  const after = surveys.slice(0, 3);
  const before = surveys.slice(3, 6);
  const avg = (l: typeof surveys) => (l.length ? l.reduce((a, x) => a + x.scores[item], 0) / l.length : 0);
  v.experiments.unshift({ kind: e.kind, label: e.label, before: Math.round(avg(before) * 10) / 10, after: Math.round(avg(after) * 10) / 10, date: state.date });
  v.experiments.length = Math.min(v.experiments.length, 12);
  send(state, "business", businessChief(state), `Experiment results: ${e.label.toLowerCase()}`,
    `Over three home games the survey score moved from ${avg(before).toFixed(1)} to ${avg(after).toFixed(1)}. ${e.effect > 0.2 ? "It worked; we'd keep it." : e.effect > 0 ? "A small gain, inside the noise." : "Fans didn't like it."}`);
}

/** The season so far against league norms. */
export function benchmark(state: GameState): { ours: typeof BENCHMARK; games: number } | null {
  // The last ten home games, newest first.
  const regs = venue(state).reports.slice(0, 10);
  if (!regs.length) return null;
  const avg = (fn: (r: VenueReport) => number) => Math.round((regs.reduce((a, r) => a + fn(r), 0) / regs.length) * 10) / 10;
  return {
    games: regs.length,
    ours: {
      arrival: avg((r) => r.arrival), gateWait: avg((r) => r.gateWait), foodWait: avg((r) => r.foodWait), restroomWait: avg((r) => r.restroomWait),
      complaints: avg((r) => (Object.values(r.complaints).reduce((a, x) => a + x, 0) / Math.max(1, r.attendance)) * 1000),
      perCapFood: avg((r) => r.perCap.food), perCapMerch: avg((r) => r.perCap.merch),
    },
  };
}

