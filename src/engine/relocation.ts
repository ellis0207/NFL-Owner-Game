// Relocation: moving a club to another market. The league's process is the
// real one in outline: market studies, applications between January 1 and
// February 15, a review by the league's relocation committee, and a vote of
// the owners (24 of 32) at the annual meeting, with a relocation fee paid
// over ten years. Leaving costs what the lease and any non-relocation pledge
// say it costs, the old city's fans may fight it, and the new market takes
// years to build. The franchise keeps its id, its records and its history
// under any name; the move goes on the club's timeline.
//
// Any club can move, CPU clubs rarely and only after their stadium plans
// fail at home. Markets are U.S. and Canadian cities without a team, plus a
// second team in a market big enough to hold one. A moved club stays in its
// division unless the owners vote to realign it.
//
// Market figures are approximate (2025 metro estimates, public climate
// normals, rounded); the corporate and media scores are rough judgments.
import { businessChief, inflation, post } from "./business";
import { bindConstruction, construction } from "./construction";
import { addDays, daysBetween, shortDate } from "./dates";
import { PLACE } from "./departments";
import { fanBase, METRO, trustHit } from "./fans";
import { CLIMATE } from "./gameday";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, TEAM_BY_ID, teamLabel } from "./league";
import { capScale } from "./market";
import { merch, REBRAND } from "./merch";
import { owners, VOTES_TO_PASS } from "./owners";
import { gaussian, rngFor } from "./rng";
import { MARKETS, STADIUM_BY_TEAM, type Stadium } from "./stadiums";
import { reserved } from "./investors";
import type { GameState } from "./types";

const M = 1_000_000;

type Climate = (typeof CLIMATE)[string];

export interface MarketData {
  id: string;
  city: string;
  region: string;
  country: "US" | "CA";
  /** Metro population and the wider region, millions; yearly growth; income against the U.S. median. */
  pop: number;
  wide: number;
  growth: number;
  income: number;
  /** Other big-league teams in the market (NFL aside). */
  rivals: number;
  /** Large company headquarters (a rough count) and the TV market's rank. */
  corp: number;
  media: number;
  /** Football attachment: a former NFL city, a big college following, 0-1. */
  attachment: number;
  place: [number, number];
  climate: Climate;
  /** Where the club would play first, and whether it meets NFL standards for more than a stopgap. */
  venue: { name: string; capacity: number; roof: Stadium["roof"]; ready: boolean };
  /** The team already here, for a second-team market. */
  incumbent?: string;
  /** How much a new stadium the public side might fund, as a share. */
  publicLean: number;
}

/** Cities without a team that keep coming up (approximate figures). */
const OPEN_MARKETS: MarketData[] = [
  { id: "SAT", city: "San Antonio", region: "Texas", country: "US", pop: 2.7, wide: 3.3, growth: 0.017, income: 0.92, rivals: 1, corp: 4, media: 31, attachment: 0.5, place: [29.42, -98.49], climate: { temp: [89, 82, 72, 64, 62], wind: 8, wet: 0.2, snow: 0 }, venue: { name: "the Alamodome", capacity: 64_000, roof: "dome", ready: true }, publicLean: 0.4 },
  { id: "STL", city: "St. Louis", region: "Missouri", country: "US", pop: 2.8, wide: 3.5, growth: 0.0, income: 1.0, rivals: 3, corp: 8, media: 24, attachment: 0.6, place: [38.63, -90.19], climate: { temp: [81, 69, 57, 45, 40], wind: 9, wet: 0.28, snow: 0.2 }, venue: { name: "The Dome at America's Center", capacity: 67_000, roof: "dome", ready: true }, publicLean: 0.3 },
  { id: "SD", city: "San Diego", region: "California", country: "US", pop: 3.3, wide: 3.3, growth: 0.004, income: 1.18, rivals: 2, corp: 3, media: 29, attachment: 0.6, place: [32.78, -117.12], climate: { temp: [78, 74, 70, 66, 66], wind: 7, wet: 0.08, snow: 0 }, venue: { name: "Snapdragon Stadium", capacity: 35_000, roof: "open", ready: false }, publicLean: 0.15 },
  { id: "OAK", city: "Oakland", region: "California", country: "US", pop: 2.8, wide: 4.2, growth: 0.004, income: 1.25, rivals: 4, corp: 3, media: 10, attachment: 0.65, place: [37.75, -122.2], climate: { temp: [78, 74, 66, 58, 57], wind: 8, wet: 0.12, snow: 0 }, venue: { name: "the Oakland Coliseum", capacity: 56_000, roof: "open", ready: true }, publicLean: 0.2 },
  { id: "POR", city: "Portland", region: "Oregon", country: "US", pop: 2.5, wide: 3.2, growth: 0.006, income: 1.08, rivals: 3, corp: 2, media: 22, attachment: 0.4, place: [45.52, -122.68], climate: { temp: [76, 64, 53, 46, 47], wind: 7, wet: 0.45, snow: 0.05 }, venue: { name: "Providence Park", capacity: 25_000, roof: "open", ready: false }, publicLean: 0.25 },
  { id: "SLC", city: "Salt Lake City", region: "Utah", country: "US", pop: 1.3, wide: 2.7, growth: 0.015, income: 1.05, rivals: 3, corp: 2, media: 30, attachment: 0.4, place: [40.76, -111.89], climate: { temp: [80, 65, 52, 39, 38], wind: 8, wet: 0.15, snow: 0.5 }, venue: { name: "Rice-Eccles Stadium", capacity: 51_000, roof: "open", ready: false }, publicLean: 0.35 },
  { id: "TOR", city: "Toronto", region: "Ontario", country: "CA", pop: 6.7, wide: 9.5, growth: 0.015, income: 1.0, rivals: 6, corp: 15, media: 8, attachment: 0.45, place: [43.64, -79.39], climate: { temp: [72, 60, 48, 36, 30], wind: 11, wet: 0.3, snow: 0.45 }, venue: { name: "Rogers Centre", capacity: 45_000, roof: "retractable", ready: false }, publicLean: 0.15 },
  { id: "CLB", city: "Columbus", region: "Ohio", country: "US", pop: 2.2, wide: 2.6, growth: 0.012, income: 1.0, rivals: 2, corp: 6, media: 32, attachment: 0.5, place: [39.96, -83.0], climate: { temp: [79, 67, 55, 43, 37], wind: 9, wet: 0.3, snow: 0.3 }, venue: { name: "Ohio Stadium", capacity: 66_000, roof: "open", ready: false }, publicLean: 0.3 },
];

/** A market needs about seven million people before a second team can work there. */
const SECOND_TEAM_POP = 7;

export interface Move {
  team: string;
  /** First season in the new market. */
  season: number;
  date: string;
  market: string;
  fromCity: string;
  toCity: string;
  fromName: string;
  toName: string;
  fromStadium: string;
  fee: number;
}

export interface Bid {
  team: string;
  market: string;
  filed: string;
  voteDate: string;
  identity: "keep" | "rename" | "leave";
  name?: string;
  /** Relocation packages for the staff, or the legal minimum. */
  staff: "protect" | "minimal";
  /** Keep the old city's honors and alumni ties. */
  legacy: boolean;
  review?: { date: string; text: string; concerns: string[] };
  status: "filed" | "approved" | "denied" | "withdrawn";
  yes?: number;
}

export interface Realign { team: string; with: string; season: number; status: "proposed" | "approved" | "denied"; voteDate: string; yes?: number }

export interface Study { date: string; market: string; score: number; revenue: number; competition: string[]; notes: string[] }

export interface RelocationState {
  studies: Study[];
  bids: Bid[];
  moves: Move[];
  realign: Realign[];
  /** Our fee installments still to pay. */
  feeLeft: number;
  feeYears: number;
  /** Ongoing ties kept with the old city. */
  legacy?: string;
  /** Lame-duck crowds in the old city once the bid is public. */
  lameDuck?: string;
  log: { date: string; text: string }[];
}

export function relocation(state: GameState): RelocationState {
  return (state.relocation ??= { studies: [], bids: [], moves: [], realign: [], feeLeft: 0, feeYears: 0, log: [] });
}

function note(state: GameState, text: string): void {
  const r = relocation(state);
  r.log.unshift({ date: state.date, text });
  r.log.length = Math.min(r.log.length, 30);
}

// ---- Markets ----

/** Every market a club could move to now: open cities, and second-team cities big enough. */
export function markets(state: GameState): MarketData[] {
  const taken = new Set(relocation(state).moves.map((m) => m.market));
  const out = OPEN_MARKETS.filter((m) => !taken.has(m.id));
  const year = Number(state.date.slice(0, 4));
  const count: Record<string, number> = {};
  for (const t of TEAMS) count[TEAM_BY_ID[t.id].city] = (count[TEAM_BY_ID[t.id].city] ?? 0) + 1;
  for (const t of TEAMS) {
    const base = original().metro[t.id];
    if (!base || moveOf(state, t.id) || count[TEAM_BY_ID[t.id].city] !== 1 || base.pop * Math.pow(1 + base.growth, year - 2025) < SECOND_TEAM_POP) continue;
    if (taken.has(`2-${t.id}`)) continue;
    const s = original().stadium[t.id];
    out.push({
      id: `2-${t.id}`, city: TEAM_BY_ID[t.id].city, region: "second team", country: "US", pop: base.pop, wide: base.region, growth: base.growth, income: base.income,
      rivals: base.rivals + 1, corp: Math.round(base.pop * 1.6), media: 5, attachment: 0.3, place: original().place[t.id], climate: original().climate[t.id],
      venue: { name: `${s.name} (shared with the ${TEAM_BY_ID[t.id].name})`, capacity: s.capacity, roof: s.roof, ready: true }, incumbent: t.id, publicLean: 0.05,
    });
  }
  return out;
}

export function marketById(state: GameState, id: string): MarketData | undefined {
  return markets(state).find((m) => m.id === id) ?? OPEN_MARKETS.find((m) => m.id === id);
}

function distance(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const d = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return Math.round(3959 * 2 * Math.asin(Math.sqrt(d)));
}

/** NFL clubs within 300 miles: they compete for the same fans and sponsors, and vote against a neighbor. */
export function neighbors(_state: GameState, m: MarketData, except?: string): string[] {
  return TEAMS.filter((t) => t.id !== except && (PLACE[t.id] ? distance(PLACE[t.id], m.place) <= 300 : false)).map((t) => t.id);
}

/** The business a market would support: what the gate model reads for it. */
function marketEconomics(m: MarketData) {
  const size = Math.min(10, m.pop);
  return {
    metro: { pop: m.pop, region: m.wide, growth: m.growth, income: m.income, rivals: m.rivals },
    market: {
      pull: Math.round((0.86 + 0.2 * m.attachment) * 100) / 100,
      ticket: Math.round(105 + 40 * m.income + 3 * size),
      stShare: Math.round((0.62 + 0.3 * m.attachment) * 100) / 100,
      premium: Math.round((40 + 9 * Math.pow(m.corp, 0.7)) * M),
      parking: 35,
      target: Math.round((690 + 28 * Math.pow(size, 0.6) * m.income + 3 * m.corp) * M),
    },
  };
}

/**
 * A market study: size, the corporate base, the media footprint, football
 * attachment, growth, and the competition for the same fans. The score is
 * against our current market, 0.5 meaning about even.
 */
export function marketStudy(state: GameState, id: string): string | null {
  const m = marketById(state, id);
  if (!m) return "No such market.";
  const r = relocation(state);
  if (r.studies.some((s) => s.market === id && daysBetween(s.date, state.date) < 365)) return "We studied that market this year.";
  post(state, "professional", -1.5 * M, `Market study: ${m.city}`);
  r.studies.unshift(studyOf(state, m, state.userTeam));
  note(state, `Studied ${m.city} as a possible home.`);
  return null;
}

function studyOf(state: GameState, m: MarketData, team: string): Study {
  const here = MARKETS[team];
  const e = marketEconomics(m);
  const near = neighbors(state, m, team);
  const growth = Math.pow(1 + m.growth, 10);
  const score = Math.max(0, Math.min(1, 0.5 + (e.market.target / here.target - 1) * 2 + (m.attachment - 0.5) * 0.3 + (growth - 1.05) * 0.8 - near.length * 0.04 - Math.max(0, m.rivals - 3) * 0.02));
  const notes = [
    `${m.pop.toFixed(1)} million in the metro (${m.wide.toFixed(1)} million in the region), growing about ${(m.growth * 100).toFixed(1)}% a year.`,
    `Corporate base: about ${m.corp} large headquarters; TV market around #${m.media}${m.country === "CA" ? " (Canadian rights are sold separately)" : ""}.`,
    m.attachment >= 0.55 ? "Football fans here remember having a team." : m.attachment >= 0.45 ? "There's a real football following to build on." : "The club would be starting from scratch with most fans.",
    m.venue.ready ? `${cap(m.venue.name)} (${m.venue.capacity.toLocaleString("en-US")} seats) can host NFL games now.` : `${cap(m.venue.name)} (${m.venue.capacity.toLocaleString("en-US")} seats) works only as a temporary home; a new stadium would be needed within three seasons.`,
  ];
  if (m.incumbent) notes.push(`The ${teamLabel(m.incumbent)} would share the market and vote hard against it.`);
  return { date: state.date, market: m.id, score: Math.round(score * 100) / 100, revenue: e.market.target, competition: [...near.map(teamLabel), `${m.rivals} other big-league team${m.rivals === 1 ? "" : "s"}`], notes };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Leaving ----

/** What it costs to leave: the rest of the lease, and paying back public money under a non-relocation pledge. */
export function exitCosts(state: GameState, team = state.userTeam): { lease: number; pledge: number; trademark: number; lines: string[] } {
  const year = RULES.season + 1;
  const l = state.leases?.[team];
  const lines: string[] = [];
  let lease = 0;
  if (l && l.through >= year) {
    const left = l.through - year + 1;
    lease = Math.round((l.rent * left * 0.6 + 15 * M * capScale(state, year)) / M) * M;
    lines.push(`Breaking the lease (${left} season${left > 1 ? "s" : ""} left): about ${money(lease)} in rent and penalties.`);
  }
  let pledge = 0;
  const plan = team === state.userTeam ? state.construction?.plan : undefined;
  if (plan?.stayUntil && plan.stayUntil >= year && plan.funding.public > 0) {
    pledge = Math.round(plan.funding.public * (plan.stayUntil - year + 1) / 34 * 1.25 / M) * M;
    lines.push(`The non-relocation pledge runs through ${plan.stayUntil}: repaying the public money with a penalty, about ${money(pledge)}.`);
  }
  const trademark = lease + pledge > 0 ? Math.round(20 * M * capScale(state, year) / M) * M : 0;
  if (trademark) lines.push(`The city will claim the name and colors; keeping them takes a settlement of about ${money(trademark)}.`);
  if (!lines.length) lines.push("No lease or pledge holds the club here.");
  return { lease, pledge, trademark, lines };
}

/** The league's relocation fee, scaled to the market and the league's money. */
export function relocationFee(state: GameState, m: MarketData): number {
  const year = RULES.season + 1;
  return Math.round(450 * M * capScale(state, year) * Math.pow(Math.max(1, m.pop) / 3, 0.35) / (5 * M)) * 5 * M;
}

/** One-time costs of moving: equipment and offices, staff packages, marketing the club in a new city. */
function movingCosts(staff: Bid["staff"]): number {
  return Math.round((30 + (staff === "protect" ? 18 : 6) + 20) * M * inflation(RULES.season + 1, 0.03));
}

// ---- Applying ----

/** The relocation window: January 1 to February 15. */
export function windowOpen(date: string): boolean {
  const md = date.slice(5);
  return md >= "01-01" && md <= "02-15";
}

/** Tried at home first: a failed public vote, failed lease talks, or no lease and no plan. */
function goodFaith(state: GameState, team: string): boolean {
  if (team !== state.userTeam) return true;
  const c = state.construction;
  if (c?.exploreRelocation) return true;
  const l = state.leases?.[team];
  if (l && l.through - RULES.season <= 2 && l.log.some((x) => /broke off/.test(x.text))) return true;
  return false;
}

export function fileRelocation(state: GameState, id: string, opts: { identity?: Bid["identity"]; name?: string; staff?: Bid["staff"]; legacy?: boolean } = {}): string | null {
  const r = relocation(state);
  const us = state.userTeam;
  const m = marketById(state, id);
  if (!m) return "No such market.";
  if (!windowOpen(state.date)) return "Relocation applications are taken from January 1 to February 15.";
  if (r.bids.some((b) => b.team === us && b.status === "filed")) return "Our application is already with the league.";
  if (moveOf(state, us) && moveOf(state, us)!.season > RULES.season - 3) return "We just moved; the league won't hear another application so soon.";
  if (!r.studies.some((s) => s.market === id && daysBetween(s.date, state.date) < 730)) return "The league requires a market study first.";
  // Moving the club is a reserved matter for the ownership group's board.
  const board = reserved(state, "relocation", 0, `Applying to move to ${m.city}`);
  if (board) return board;
  const identity = opts.identity ?? "keep";
  const name = opts.name?.trim();
  if (identity !== "keep" && !name) return "Pick the new name.";
  if (name && TEAMS.some((t) => t.id !== us && TEAM_BY_ID[t.id].name.toLowerCase() === name.toLowerCase())) return "Another club already uses that name.";
  const bid: Bid = { team: us, market: id, filed: state.date, voteDate: addDays(RULES.keyDates.annualLeagueMeeting, 2), identity, name, staff: opts.staff ?? "protect", legacy: !!opts.legacy, status: "filed" };
  r.bids.unshift(bid);
  r.lameDuck = state.date;
  note(state, `Applied to move to ${m.city}.`);
  // The old city reacts: some fans stay loyal, some walk away, some organize.
  const f = fanBase(state);
  const fight = f.core >= 55 || (state.construction?.plan?.stayUntil ?? 0) > RULES.season;
  trustHit(state, fight ? -14 : -9, fight ? 6 : 3, `Applied to move the club to ${m.city}`);
  f.core = Math.max(10, f.core - 6);
  news(state, `The ${teamLabel(us)} apply to relocate to ${m.city}`);
  if (fight) news(state, `"Keep the ${TEAM_BY_ID[us].name}" campaign forms; the city vows to hold the club to its commitments`);
  send(state, "league", "League Office", "Your relocation application",
    `The relocation committee will review the application: the market, the stadium plan there, our efforts to stay, and the effect on the league. The owners vote on ${shortDate(bid.voteDate)}; a move needs ${VOTES_TO_PASS} votes and a relocation fee of about ${money(relocationFee(state, m))}, paid over ten years.`);
  return null;
}

export function withdrawBid(state: GameState): string | null {
  const b = relocation(state).bids.find((x) => x.team === state.userTeam && x.status === "filed");
  if (!b) return "No application to withdraw.";
  b.status = "withdrawn";
  delete relocation(state).lameDuck;
  note(state, "Withdrew the relocation application.");
  news(state, `The ${teamLabel(state.userTeam)} withdraw their relocation application`);
  return null;
}

function review(state: GameState, b: Bid): void {
  const m = marketById(state, b.market)!;
  const concerns: string[] = [];
  if (!goodFaith(state, b.team)) concerns.push("the club hasn't exhausted its options at home");
  if (!m.venue.ready) concerns.push(`${m.venue.name} is only a stopgap, so the club must commit to a new stadium`);
  if (m.incumbent) concerns.push(`the ${teamLabel(m.incumbent)} object to sharing their market`);
  const near = neighbors(state, m, b.team);
  if (near.length) concerns.push(`${near.map(teamLabel).join(" and ")} sit${near.length === 1 ? "s" : ""} within 300 miles`);
  const study = studyOf(state, m, b.team);
  if (study.score < 0.45) concerns.push("the market doesn't clearly beat the one the club would leave");
  b.review = {
    date: state.date, concerns,
    text: concerns.length ? `The relocation committee's report raises concerns: ${concerns.join("; ")}.` : "The relocation committee's report supports the application.",
  };
  if (b.team === state.userTeam) send(state, "league", "League Office", "Relocation committee report", b.review.text);
}

/** Each owner votes on the market, the club's efforts at home, their own neighborhood and how they feel about us. */
function voteOn(state: GameState, b: Bid): number {
  const m = marketById(state, b.market)!;
  const rel = owners(state).relations;
  const near = new Set(neighbors(state, m, b.team));
  const score = studyOf(state, m, b.team).score;
  const faith = goodFaith(state, b.team);
  const rng = rngFor(state.seed, `relocation-vote:${b.team}:${b.market}:${b.filed}`);
  let yes = b.team === state.userTeam ? 1 : 0;
  for (const t of TEAMS) {
    if (t.id === b.team) continue;
    const rapport = b.team === state.userTeam ? rel[t.id]?.rapport ?? 0 : 10;
    let p = 0.78 + rapport / 160 + (score - 0.5) * 0.4 + (faith ? 0.1 : -0.3) - (near.has(t.id) ? 0.4 : 0) - (m.incumbent === t.id ? 0.9 : m.incumbent ? 0.06 : 0);
    p += gaussian(rng) * 0.05;
    if (rng() < Math.max(0, Math.min(0.98, p))) yes++;
  }
  return yes;
}

function decide(state: GameState, b: Bid): void {
  const yes = voteOn(state, b);
  b.yes = yes;
  const m = marketById(state, b.market)!;
  if (yes < VOTES_TO_PASS) {
    b.status = "denied";
    news(state, `Owners reject the ${teamLabel(b.team)}' move to ${m.city}, ${yes}-${32 - yes}`);
    if (b.team === state.userTeam) {
      delete relocation(state).lameDuck;
      note(state, `The owners voted the move down, ${yes}-${32 - yes}.`);
      send(state, "league", "League Office", "Relocation not approved", `The owners voted ${yes}-${32 - yes}; ${VOTES_TO_PASS} were needed. The club stays where it is. Fans here won't forget that we tried to leave.`);
    }
    return;
  }
  b.status = "approved";
  move(state, b, m, yes);
}

// ---- The move ----

function move(state: GameState, b: Bid, m: MarketData, yes: number): void {
  const r = relocation(state);
  const team = b.team;
  const us = team === state.userTeam;
  const season = RULES.season + 1;
  const t = TEAM_BY_ID[team];
  const fee = relocationFee(state, m);
  const toName = b.identity === "keep" ? t.name : b.name!;
  const mv: Move = { team, season, date: state.date, market: m.id, fromCity: t.city, toCity: m.city, fromName: t.name, toName, fromStadium: STADIUM_BY_TEAM[team].name, fee };
  if (us) {
    const exit = exitCosts(state, team);
    const year = Number(state.date.slice(0, 4));
    r.feeLeft = fee;
    r.feeYears = 10;
    payFee(state);
    if (exit.lease) post(state, "relocation", -exit.lease, "Breaking the stadium lease");
    if (exit.pledge) post(state, "relocation", -exit.pledge, "Repaying public money under the non-relocation pledge");
    if (exit.trademark && b.identity === "keep") post(state, "relocation", -exit.trademark, "Settlement with the old city over the name and colors");
    post(state, "relocation", -movingCosts(b.staff), `Moving to ${m.city}: offices, equipment, staff packages and the launch campaign`);
    // Staff: with packages most come along; at the legal minimum many find other jobs.
    const stay = b.staff === "protect" ? 0.78 : 0.5;
    send(state, "business", businessChief(state), "Our people and the move",
      `About ${Math.round(stay * 100)}% of the business staff are coming to ${m.city}${b.staff === "protect" ? " with relocation packages" : ""}; we'll hire the rest there. Expect a slow season in sales and service while new people learn the job.`);
    // Local contracts were with the old market: sponsors, radio and TV, the naming deal. They end, and get rebid in the new city.
    const local = state.business?.local;
    if (local) {
      const lost = local.deals.length;
      local.deals = [];
      if (lost) send(state, "business", businessChief(state), "Local deals after the move", `Our ${lost} local sponsorship and media deals were tied to the old market and have ended. New partners in ${m.city} come to the table at the usual February round.`);
    }
    // Fans: a new market starts with what football attachment is there, and grows.
    const f = fanBase(state);
    f.core = f.core0 = Math.round(32 + 25 * m.attachment);
    f.trust = 58;
    f.scar = 0;
    const e = marketEconomics(m);
    f.reach.local = Math.round(m.pop * 1e6 * 0.2 * e.market.pull);
    f.reach.region = Math.round(Math.max(0, m.wide - m.pop) * 1e6 * 0.1 * e.market.pull);
    if (b.identity !== "keep") {
      const mm = merch(state);
      mm.rebrand = { kind: "name", name: b.name, asked: state.date, decided: state.date, approved: true, launches: season, cost: Math.round(REBRAND.name.cost * inflation(year, 0.03)), paid: 0 };
    }
    if (b.legacy) r.legacy = mv.fromCity;
    delete r.lameDuck;
    // The old lease and any stadium plan in the old city end.
    if (state.construction?.plan && !["open", "shelved"].includes(state.construction.plan.stage)) state.construction.plan.stage = "shelved";
    if (state.construction) delete state.construction.exploreRelocation;
    note(state, `The owners approved the move to ${m.city}, ${yes}-${32 - yes}.`);
    send(state, "league", "League Office", "Relocation approved",
      `The owners approved the move ${yes}-${32 - yes}. The club plays in ${m.city} from the ${season} season, at ${m.venue.name}${m.venue.ready ? "" : " until a new stadium is built"}. The relocation fee is ${money(fee)}, paid over ten years. The division stays the same unless the owners vote to realign.`);
  }
  r.moves.push(mv);
  // The club's lease goes with the old building; the new home is leased (or shared).
  const leases = (state.leases ??= {});
  leases[team] = {
    through: m.venue.ready ? season + 9 : season + 2, rent: Math.round((m.incumbent ? 12 : 4) * M * inflation(season, 0.03)), upkeep: Math.round(18 * M * inflation(season, 0.03)),
    eventShare: m.incumbent ? 0 : 0.5, fund: 0, log: [{ date: state.date, text: `Moved to ${m.city}: lease at ${m.venue.name} through ${m.venue.ready ? season + 9 : season + 2}.` }],
  };
  construction(state).temporary = undefined;
  // Restores the 2026 buildings, lays on the moves (bindRelocation below), new buildings, then leases.
  bindConstruction(state);
  // A stopgap venue means a new stadium: the league's approval came with that commitment.
  if (!m.venue.ready) {
    const c = construction(state);
    if (us) send(state, "business", businessChief(state), "A stadium in the new market", `The league approved the move on our promise of a new stadium in ${m.city}. Commission studies on the New stadium tab; the public side here has signaled it could fund about ${Math.round(m.publicLean * 100)}%.`);
    else c.cpu.push({ team, announced: state.date, approved: state.date, opens: season + 3, name: `${m.city} Stadium`, roof: m.climate.snow > 0.2 ? "dome" : "open", cost: Math.round(2_000 * M * inflation(season, 0.04) / (10 * M)) * 10 * M, structure: "publicTeam" });
  }
  news(state, `Owners approve the ${mv.fromCity} ${mv.fromName}' move to ${m.city}, ${yes}-${32 - yes}`);
}

function payFee(state: GameState): void {
  const r = relocation(state);
  if (r.feeYears <= 0 || r.feeLeft <= 0) return;
  const pay = Math.round(r.feeLeft / r.feeYears);
  post(state, "relocation", -pay, `League relocation fee (installment ${11 - r.feeYears} of 10)`);
  r.feeLeft -= pay;
  r.feeYears--;
}

export function moveOf(state: GameState, team: string): Move | undefined {
  return state.relocation?.moves.filter((m) => m.team === team).at(-1);
}

// ---- Binding ----

interface Originals {
  stadium: Record<string, Stadium>;
  metro: Record<string, (typeof METRO)[string]>;
  market: Record<string, (typeof MARKETS)[string]>;
  climate: Record<string, Climate>;
  place: Record<string, [number, number]>;
  team: Record<string, { city: string; conference: "AFC" | "NFC"; division: "East" | "North" | "South" | "West" }>;
}
let ORIG: Originals | undefined;
function original(): Originals {
  return (ORIG ??= {
    stadium: Object.fromEntries(Object.values(STADIUM_BY_TEAM).map((s) => [s.team, { ...s, fixed: [...s.fixed], blackout: [...(s.blackout ?? [])] }])),
    metro: Object.fromEntries(Object.entries(METRO).map(([k, v]) => [k, { ...v }])),
    market: Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, { ...v }])),
    climate: Object.fromEntries(Object.entries(CLIMATE).map(([k, v]) => [k, { ...v }])),
    place: Object.fromEntries(Object.entries(PLACE).map(([k, v]) => [k, [...v] as [number, number]])),
    team: Object.fromEntries(TEAMS.map((t) => [t.id, { city: t.city, conference: t.conference, division: t.division }])),
  });
}

/**
 * Lays the save's moves and realignments over the 2026 data: the city, the
 * market the gate model reads, the climate, the location for travel, and
 * the stadium the club plays in. Called by bindConstruction before any new
 * building is laid on. `season` is the season divisions are read for.
 */
export function bindRelocation(state: GameState, season = state.season ?? RULES.season): void {
  const o = original();
  for (const t of TEAMS) {
    Object.assign(TEAM_BY_ID[t.id], o.team[t.id]);
    if (o.metro[t.id]) METRO[t.id] = { ...o.metro[t.id] };
    if (o.market[t.id]) MARKETS[t.id] = { ...o.market[t.id] };
    if (o.climate[t.id]) CLIMATE[t.id] = { ...o.climate[t.id] };
    if (o.place[t.id]) PLACE[t.id] = [...o.place[t.id]] as [number, number];
  }
  for (const mv of state.relocation?.moves ?? []) {
    const m = OPEN_MARKETS.find((x) => x.id === mv.market) ?? secondMarket(mv.market);
    if (!m) continue;
    const e = marketEconomics(m);
    TEAM_BY_ID[mv.team].city = m.city;
    METRO[mv.team] = { ...e.metro };
    MARKETS[mv.team] = { ...e.market };
    CLIMATE[mv.team] = { ...m.climate };
    PLACE[mv.team] = [...m.place] as [number, number];
    Object.assign(STADIUM_BY_TEAM[mv.team], {
      name: m.venue.name, capacity: m.venue.capacity, roof: m.venue.roof, opened: STADIUM_BY_TEAM[mv.team].opened, structure: "tenant",
      owner: m.incumbent ? TEAM_BY_ID[m.incumbent].name : `the ${m.city} venue authority`, operator: m.incumbent ? TEAM_BY_ID[m.incumbent].name : `the ${m.city} venue authority`,
      naming: 0, namingShare: 0, gameDayShare: m.incumbent ? 0.5 : 0.6, debt: 0, fixed: [], blackout: [], partner: m.incumbent, collegeTenant: undefined, mls: undefined, curfew: false,
      note: `The club moved here from ${mv.fromCity} for the ${mv.season} season.`,
    });
    Object.assign(TEAM_BY_ID[mv.team], { stadium: m.venue.name, roof: m.venue.roof === "open" ? "outdoors" : m.venue.roof });
  }
  for (const x of state.relocation?.realign ?? []) {
    if (x.status !== "approved" || x.season > season) continue;
    const a = TEAM_BY_ID[x.team];
    const b = TEAM_BY_ID[x.with];
    [a.conference, b.conference] = [b.conference, a.conference];
    [a.division, b.division] = [b.division, a.division];
  }
}

/** The stadium binding also restores the moved teams' 2026 buildings before laying the moves on. */
export function restoreStadiums(): void {
  const o = original();
  for (const [team, s] of Object.entries(o.stadium)) Object.assign(STADIUM_BY_TEAM[team], { ...s, fixed: [...s.fixed], blackout: [...(s.blackout ?? [])] });
}

function secondMarket(id: string): MarketData | undefined {
  if (!id.startsWith("2-")) return undefined;
  const team = id.slice(2);
  const base = original().metro[team];
  const s = original().stadium[team];
  if (!base || !s) return undefined;
  return {
    id, city: original().team[team].city, region: "second team", country: "US", pop: base.pop, wide: base.region, growth: base.growth, income: base.income, rivals: base.rivals + 1,
    corp: Math.round(base.pop * 1.6), media: 5, attachment: 0.3, place: original().place[team], climate: original().climate[team],
    venue: { name: `${s.name} (shared with the ${TEAM_BY_ID[team].name})`, capacity: s.capacity, roof: s.roof, ready: true }, incumbent: team, publicLean: 0.05,
  };
}

// ---- Fans in the new market and the old ----

/**
 * Crowds in the old city once the club has applied to leave (lame-duck), and
 * in the new market while it builds: football attachment sets the start and
 * the gap closes over about six seasons, with a first-season bump.
 */
export function moveGateFactor(state: GameState, date: string): number {
  const r = state.relocation;
  if (!r) return 1;
  if (r.lameDuck) return 0.85;
  const mv = moveOf(state, state.userTeam);
  if (!mv) return 1;
  const m = OPEN_MARKETS.find((x) => x.id === mv.market) ?? secondMarket(mv.market);
  const age = Number(date.slice(0, 4)) - mv.season + (date.slice(5) < "03-01" ? -1 : 0);
  if (!m || age < 0 || age >= 6) return 1;
  const start = 0.8 + 0.2 * m.attachment;
  return Math.min(1.05, start + (1 - start) * (age / 6) + (age === 0 ? 0.06 : 0));
}

// ---- Realignment ----

/** After a move, ask the owners to swap our division with a club that fits geography better. */
export function proposeRealign(state: GameState, other: string): string | null {
  const us = state.userTeam;
  if (!moveOf(state, us)) return "Realignment comes up only after a move.";
  if (other === us || !TEAM_BY_ID[other]) return "Pick another club.";
  const r = relocation(state);
  if (r.realign.some((x) => x.status === "proposed")) return "A realignment proposal is already on the agenda.";
  const vote = addDays(RULES.keyDates.annualLeagueMeeting, 2);
  if (state.date > vote) return "The next chance is at next year's annual meeting.";
  r.realign.push({ team: us, with: other, season: RULES.season + 1, status: "proposed", voteDate: vote });
  note(state, `Proposed swapping divisions with the ${teamLabel(other)}.`);
  return `The owners vote at the annual meeting on ${shortDate(vote)}.`;
}

function realignVote(state: GameState, x: Realign): void {
  const a = PLACE[x.team];
  const b = PLACE[x.with];
  const divOf = (id: string) => TEAMS.filter((t) => t.id !== id && TEAM_BY_ID[t.id].conference === TEAM_BY_ID[id].conference && TEAM_BY_ID[t.id].division === TEAM_BY_ID[id].division).map((t) => t.id);
  const spread = (who: [number, number], ids: string[]) => ids.reduce((s, id) => s + distance(who, PLACE[id] ?? who), 0) / Math.max(1, ids.length);
  // Better geography for both clubs carries the room; the other club's owner has the loudest voice.
  const gain = spread(a, divOf(x.team)) + spread(b, divOf(x.with)) - spread(a, divOf(x.with).filter((i) => i !== x.team)) - spread(b, divOf(x.team).filter((i) => i !== x.with));
  const rng = rngFor(state.seed, `realign:${x.team}:${x.with}:${x.voteDate}`);
  let yes = 1;
  for (const t of TEAMS) {
    if (t.id === x.team) continue;
    const p = 0.45 + gain / 1500 + (t.id === x.with ? -0.2 : 0) + (owners(state).relations[t.id]?.rapport ?? 0) / 200;
    if (rng() < Math.max(0.02, Math.min(0.97, p))) yes++;
  }
  x.yes = yes;
  x.status = yes >= VOTES_TO_PASS ? "approved" : "denied";
  news(state, x.status === "approved" ? `Owners approve realignment: the ${teamLabel(x.team)} and ${teamLabel(x.with)} swap divisions from ${x.season}` : `Owners keep the divisions as they are (${yes} votes to realign)`);
}

// ---- CPU clubs ----

/** A CPU club whose stadium plan failed at home sometimes looks elsewhere. */
export function cpuStadiumFailed(state: GameState, team: string): void {
  if (team === state.userTeam || moveOf(state, team)) return;
  const r = rngFor(state.seed, `cpu-relocate:${team}:${state.date}`);
  if (r() >= 0.35) return;
  const options = markets(state).filter((m) => !m.incumbent && !relocation(state).bids.some((b) => b.market === m.id && b.status === "filed"));
  if (!options.length) return;
  const best = options.map((m) => ({ m, s: studyOf(state, m, team).score + gaussian(r) * 0.08 })).sort((a, b) => b.s - a.s)[0].m;
  const year = Number(state.date.slice(0, 4)) + 1;
  // Files in the next window.
  relocation(state).bids.unshift({ team, market: best.id, filed: `${year}-02-01`, voteDate: "", identity: "keep", staff: "protect", legacy: false, status: "filed" });
  note(state, `${teamLabel(team)} will explore a move to ${best.city}.`);
  news(state, `After their stadium plan failed, the ${teamLabel(team)} say they will explore other markets`);
}

// ---- Each day ----

export function relocationDaily(state: GameState): void {
  const r = state.relocation;
  if (!r) return;
  const meeting = RULES.keyDates.annualLeagueMeeting;
  for (const b of r.bids) {
    if (b.status !== "filed") continue;
    if (b.team !== state.userTeam && !b.voteDate && state.date >= b.filed) {
      b.filed = state.date;
      b.voteDate = addDays(meeting, 2);
      news(state, `The ${teamLabel(b.team)} apply to relocate to ${marketById(state, b.market)?.city ?? b.market}`);
    }
    if (!b.voteDate) continue;
    if (!b.review && daysBetween(b.filed, state.date) >= 30) review(state, b);
    if (state.date >= b.voteDate) {
      if (!b.review) review(state, b);
      decide(state, b);
    }
  }
  for (const x of r.realign) if (x.status === "proposed" && state.date >= x.voteDate) realignVote(state, x);
  // Fee installments each new league year; ties kept with the old city cost a little each year.
  if (state.date === RULES.keyDates.newLeagueYear) {
    if (r.feeYears > 0 && r.moves.at(-1)?.date !== state.date) payFee(state);
    if (r.legacy) post(state, "community", -Math.round(1 * M * inflation(RULES.season, 0.03)), `Alumni events and the ring of honor in ${r.legacy}`);
  }
}

/** Test helper: approve a move now, skipping the window and the vote. */
export function forceMove(state: GameState, team: string, id: string, opts: { identity?: Bid["identity"]; name?: string } = {}): void {
  const m = marketById(state, id)!;
  const b: Bid = { team, market: id, filed: state.date, voteDate: state.date, identity: opts.identity ?? "keep", name: opts.name, staff: "protect", legacy: team === state.userTeam, status: "approved" };
  relocation(state).bids.unshift(b);
  move(state, b, m, 30);
}

/** The franchise's moves, oldest first, for the history pages. */
export function franchiseMoves(state: GameState, team: string): Move[] {
  return (state.relocation?.moves ?? []).filter((m) => m.team === team);
}
