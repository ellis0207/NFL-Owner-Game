// League expansion: two new clubs, the way the league has done it (Carolina
// and Jacksonville for 1995, Houston for 2002). The commissioner floats it at
// an annual meeting, cities without a team bid with ownership groups, the
// owners vote on the two best (three quarters of the clubs), the fee is split
// among the existing clubs over five league years, and the new clubs are
// slotted into the nearest division of each conference (two five-club
// divisions; the schedule builder in flexschedule.ts handles the shape). Two
// seasons later, two weeks before the new league year, the clubs open:
// staffs hired, an expansion draft from the players every club leaves
// unprotected, then free agency and the first picks of each round in their
// first draft.
//
// The owner has a say (a stance memo, the vote, the protected list) and can
// bid for one of the new clubs, selling the current one if the bid wins.
// Ownership groups, team names and fee figures are made up.
import { billions, businessChief, bindNationalShare, inflation, post, valuation } from "./business";
import { NFL_HQ } from "./collegeData";
import { addDays, ageOn, shortDate } from "./dates";
import { addDeadMoney, capSummary, invalidateRosters, teamPlayerIds } from "./cap";
import { canHold, install, newPerson, reputation, salaryFor, staff } from "./coaches";
import { bindStaff } from "./coaches";
import { dealCapHit, dealOf, lastYear, leagueYear, salaryCap, tradeCharges, tradedDeal } from "./contracts";
import { construction } from "./construction";
import { PLACE } from "./departments";
import { addMemo } from "./delegation";
import { METRO, fanBase } from "./fans";
import { franchise, setFinancing } from "./franchisemarket";
import { CLIMATE } from "./gameday";
import { money, news, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAMS, TEAM_BY_ID, teamLabel } from "./league";
import { off } from "./offseason";
import { owner } from "./ownership";
import { owners, setVotesToPass } from "./owners";
import { staffRooms } from "./positionCoaches";
import { baseClub, distance, marketEconomics, markets, primeOriginals, type MarketData } from "./relocation";
import { gaussian, rngFor } from "./rng";
import { club } from "./rivals";
import { logMove } from "./roster";
import { ability } from "./staff";
import { MARKETS, STADIUM_BY_TEAM } from "./stadiums";
import { closeDeal, tenure } from "./takeover";
import { wealth } from "./wealth";
import { sellProceeds } from "./franchisemarket";
import type { GameState, Memo, Position, StaffRole, TeamData } from "./types";

const M = 1_000_000;
/** Clubs added at once, one to each conference. */
const SLOTS = 2;
/** Players each club leaves exposed, the most it can lose, and how many each new club takes. */
const EXPOSE = 5;
const MAX_LOST = 2;
const PICKS = 20;
const FEE_YEARS = 5;

export interface ExpansionBid { market: string; group: string; score: number; user?: boolean; walked?: boolean }

export interface ExpansionClub {
  id: string;
  market: string;
  city: string;
  name: string;
  group: string;
  conference: "AFC" | "NFC";
  division: TeamData["division"];
  /** First season it plays. */
  joins: number;
  fee: number;
  user?: boolean;
  /** The day it opened for business (staff hired, expansion draft). */
  activated?: string;
  place: [number, number];
  /** Real people hired at the opening, by role (a real expansion: Houston in 2002). */
  staff?: Partial<Record<StaffRole, string>>;
}

export interface ExpansionState {
  stage: "quiet" | "floated" | "approved" | "joined" | "rejected";
  floated?: string;
  bidsDue?: string;
  voteDate?: string;
  /** The fee each new club pays, set when the commissioner floats it. */
  fee: number;
  bids: ExpansionBid[];
  clubs: ExpansionClub[];
  stance?: "support" | "demand" | "oppose";
  yes?: number;
  /** Players we leave exposed, picked on the protected-list memo. */
  exposed?: string[];
  picks: { club: string; player: string; from: string; date: string }[];
  /** Our fee share still to come, and the installments left. */
  shareLeft: number;
  shareYears: number;
  /** The first season the commissioner may raise it again. */
  nextLook: number;
  log: { date: string; text: string }[];
}

export function expansion(state: GameState): ExpansionState {
  return (state.expansion ??= { stage: "quiet", fee: 0, bids: [], clubs: [], picks: [], shareLeft: 0, shareYears: 0, nextLook: Math.max(RULES.season, BASE_SEASON + 1), log: [] });
}

function note(state: GameState, text: string): void {
  const x = expansion(state);
  x.log.unshift({ date: state.date, text });
  x.log.length = Math.min(x.log.length, 40);
}

// ---- Binding the new clubs to the league's tables ----

const BASE_IDS = new Set(TEAMS.map((t) => t.id));

/** Clubs in the league now that weren't in the 2026 data. */
export function isExpansionClub(team: string): boolean {
  return !BASE_IDS.has(team);
}

/**
 * Lays the clubs that have opened over the league's tables: the team list,
 * stadium, market, climate and location. Clubs from another save come off
 * first. Called at the top of applySeason, before relocation and buildings.
 */
export function bindExpansion(state: GameState): void {
  primeOriginals();
  for (let i = TEAMS.length - 1; i >= 0; i--) {
    const id = TEAMS[i].id;
    if (BASE_IDS.has(id)) continue;
    TEAMS.splice(i, 1);
    for (const table of [TEAM_BY_ID, STADIUM_BY_TEAM, METRO, MARKETS, CLIMATE, PLACE, NFL_HQ] as Record<string, unknown>[]) delete table[id];
  }
  for (const c of state.expansion?.clubs ?? []) if (c.activated) addClub(state, c);
  setVotesToPass(TEAMS.length);
  bindNationalShare(TEAMS.length);
}

function marketOf(state: GameState, id: string): MarketData | undefined {
  return markets(state).find((m) => m.id === id) ?? MARKET_CACHE[id];
}
/** Markets as they were when the bids came in (markets() drops a city once it has a club). */
const MARKET_CACHE: Record<string, MarketData> = {};
function rememberMarkets(state: GameState): void {
  for (const m of markets(state)) MARKET_CACHE[m.id] ??= m;
  // markets() leaves out a city once an expansion club has it, so a save loaded after the clubs were
  // awarded finds their markets only in the list as it was before them.
  if (state.expansion?.clubs.some((c) => !MARKET_CACHE[c.market])) {
    for (const m of markets({ ...state, expansion: { ...state.expansion, clubs: [] } })) MARKET_CACHE[m.id] ??= m;
  }
}

function addClub(state: GameState, c: ExpansionClub): void {
  // A club the 2026 data already knows (Houston, before 2002) comes in with its own building and market.
  const base = baseClub(c.id);
  if (base) {
    const team: TeamData = {
      id: c.id, city: c.city, name: c.name, conference: c.conference, division: c.division,
      stadiumId: `${c.id}00`, stadium: base.stadium.name, roof: base.stadium.roof === "open" ? "outdoors" : base.stadium.roof === "retractable" ? "closed" : "dome",
      surface: "grass", cap2026: { adjustedCap: salaryCap(state, 2026), deadMoney: 0 },
    };
    if (!TEAM_BY_ID[c.id]) TEAMS.push(team);
    TEAM_BY_ID[c.id] = team;
    METRO[c.id] = { ...base.metro };
    MARKETS[c.id] = { ...base.market };
    CLIMATE[c.id] = { ...base.climate };
    PLACE[c.id] = [...base.place] as [number, number];
    NFL_HQ[c.id] = [...base.place] as [number, number];
    STADIUM_BY_TEAM[c.id] = { ...base.stadium, fixed: [...base.stadium.fixed], blackout: [...(base.stadium.blackout ?? [])] };
    return;
  }
  rememberMarkets(state);
  const m = MARKET_CACHE[c.market];
  if (!m) return;
  const e = marketEconomics(m);
  const roof = m.venue.roof === "open" ? "outdoors" : m.venue.roof === "retractable" ? "closed" : "dome";
  const team: TeamData = {
    id: c.id, city: c.city, name: c.name, conference: c.conference, division: c.division,
    stadiumId: `x-${c.id}`, stadium: m.venue.name, roof, surface: m.venue.roof === "open" ? "grass" : "turf",
    cap2026: { adjustedCap: salaryCap(state, 2026), deadMoney: 0 },
  };
  if (!TEAM_BY_ID[c.id]) TEAMS.push(team);
  TEAM_BY_ID[c.id] = team;
  METRO[c.id] = { ...e.metro };
  MARKETS[c.id] = { ...e.market };
  CLIMATE[c.id] = { ...m.climate };
  PLACE[c.id] = [...m.place] as [number, number];
  NFL_HQ[c.id] = [...m.place] as [number, number];
  STADIUM_BY_TEAM[c.id] = {
    team: c.id, name: m.venue.name, structure: "tenant", owner: `the ${m.city} venue authority`, operator: `the ${m.city} venue authority`,
    capacity: m.venue.capacity, roof: m.venue.roof, opened: c.joins - 25, rent: Math.round(4 * M * inflation(c.joins, 0.03)), eventShare: 0.5, gameDayShare: 0.6,
    naming: 0, namingShare: 0, upkeep: Math.round(18 * M * inflation(c.joins, 0.03)), debt: 0, fixed: [], blackout: [],
    note: m.venue.ready ? `The expansion club's home from its first season, ${c.joins}.` : `A stopgap home for the expansion club while its own stadium is built.`,
  };
}

// ---- The proposal ----

const GROUPS = ["the Halvorsen group", "a group led by a tech founder", "the Castellano family", "the Pryor-Whitfield partnership", "a group led by a former quarterback", "the Ostrander family office", "the Delacroix group", "a local investor group"];
const NAMES: Record<string, string[]> = {
  SAT: ["Marshals", "Lancers"], STL: ["Archers", "Pilots"], SD: ["Navigators", "Breakers"], OAK: ["Stallions", "Longshoremen"],
  POR: ["Foresters", "Cascades"], SLC: ["Summit", "Peaks"], TOR: ["Voyageurs", "Northmen"], CLB: ["Pioneers", "Aviators"],
};
const FALLBACK_NAMES = ["Condors", "Monarchs", "Sentinels", "Comets", "Voyagers", "Mustangs"];

/** Each club's yearly share of national money lost to two more clubs, against what it would be at 32. */
function dilution(state: GameState, clubs = TEAMS.length + SLOTS): number {
  const year = leagueYear(state.date);
  const base = 472 * M * salaryCap(state, year) / salaryCap(state, 2026);
  return Math.round(base * (1 - (32 / clubs) * (1 + 0.6 * (clubs - 32) / 32)) - base * (1 - (32 / TEAMS.length) * (1 + 0.6 * (TEAMS.length - 32) / 32)));
}

/** How strong a city's bid is: size, money, companies, football attachment, a stadium ready to play in, public help. */
function bidScore(state: GameState, m: MarketData, salt: string): number {
  const r = rngFor(state.seed, `exp-bid:${m.id}:${salt}`);
  return Math.round((0.35 * Math.min(1, m.pop / 6) + 0.15 * (m.income - 0.8) / 0.5 + 0.1 * Math.min(1, m.corp / 10) + 0.2 * m.attachment
    + (m.venue.ready ? 0.1 : 0) + 0.1 * m.publicLean - 0.02 * m.rivals - (m.country === "CA" ? 0.05 : 0) + gaussian(r) * 0.05) * 1000) / 1000;
}

/** The commissioner raises expansion at an annual meeting, about one year in seven from the second offseason on; the league grows once, to 34. */
export function floatExpansion(state: GameState, force = false): void {
  const x = expansion(state);
  if (x.stage !== "quiet" && x.stage !== "rejected") return;
  if (!force && (RULES.season < x.nextLook || TEAMS.length > 32 || rngFor(state.seed, `exp-float:${RULES.season}`)() > 0.15)) return;
  const open = markets(state).filter((m) => !m.incumbent);
  if (open.length < SLOTS) return;
  rememberMarkets(state);
  const vals = TEAMS.map((t) => valuation(state, t.id));
  x.fee = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1.25 / (50 * M)) * 50 * M;
  x.stage = "floated";
  x.floated = state.date;
  x.bidsDue = addDays(state.date, 120);
  x.voteDate = addDays(state.date, 235);
  x.bids = open.map((m, i) => ({ market: m.id, group: GROUPS[(i + Math.floor(rngFor(state.seed, `exp-groups:${state.date}`)() * GROUPS.length)) % GROUPS.length], score: bidScore(state, m, state.date) }))
    .filter((b) => b.score > 0.3);
  delete x.stance;
  delete x.yes;
  const share = (x.fee * SLOTS) / TEAMS.length;
  news(state, "league", `The commissioner proposes adding ${SLOTS} clubs; cities have until ${shortDate(x.bidsDue)} to bid`);
  note(state, `The commissioner proposed expansion by ${SLOTS} clubs at a fee of about ${billions(x.fee)} each. Bids are due ${shortDate(x.bidsDue)}; the owners vote ${shortDate(x.voteDate)}.`);
  if (tenure(state).role !== "control") return;
  addMemo(state, {
    kind: "general", area: "financing", from: businessChief(state), title: "The league wants two new clubs",
    problem: `The commissioner proposes adding ${SLOTS} clubs. Each would pay about ${billions(x.fee)}, split among the ${TEAMS.length} of us over ${FEE_YEARS} league years: about ${money(share)} for us. ` +
      `In return the national money is cut ${TEAMS.length + SLOTS} ways; the new markets grow the pie a little, but our share would come down about ${money(dilution(state))} a year at today's figures. ` +
      `${x.bids.length} cities are expected to bid. The owners vote ${shortDate(x.voteDate)}; it takes three quarters.`,
    proposal: "Back it: the fee is worth about forty years of the lost share.",
    options: [
      { label: "Back it", effect: `We vote yes and say so. About ${money(share)} over five years.` },
      { label: "Back it only with a higher fee", effect: "We push for 15% more. More money if it passes, but a bidder or two may walk away." },
      { label: "Oppose it", effect: "We vote no and lean on the owners close to us. A smaller league keeps our share whole." },
    ],
    risks: ["New clubs in our region compete for fans and sponsors.", "The fee is paid in installments; the cut in national money is for good."],
    budget: `Fee share about ${money(share)}; national money down about ${money(dilution(state))} a year.`,
    recommend: 0, deadline: addDays(state.date, 30), ifLate: "We vote yes with the majority.",
    payload: { expansion: "stance" },
  });
}

/** The owner bids for one of the new clubs: the current club must be sold if the bid wins. */
export function bidForExpansion(state: GameState, marketId: string): string | null {
  const x = expansion(state);
  if (x.stage !== "floated" || !x.bidsDue || state.date > x.bidsDue) return "The league isn't taking bids now.";
  const m = marketOf(state, marketId);
  if (!m || m.incumbent) return "That city isn't open for a new club.";
  if (x.bids.some((b) => b.user)) return "We already have a bid in.";
  const need = expansionShortfall(state, x.fee);
  if (need > 0) return `You'd be ${money(need)} short, even after selling the club and bringing in partners for 30%.`;
  const rel = Object.values(owners(state).relations);
  const standing = rel.length ? rel.reduce((t, r) => t + r.rapport, 0) / rel.length : 0;
  const ours: ExpansionBid = { market: marketId, group: `${state.ownerName}'s group`, score: bidScore(state, m, `user:${state.date}`) + 0.06 + standing / 400, user: true };
  x.bids = x.bids.filter((b) => b.market !== marketId);
  x.bids.push(ours);
  note(state, `We bid for the new club in ${m.city}.`);
  news(state, "league", `${state.ownerName}, owner of the ${teamLabel(state.userTeam)}, bids for an expansion club in ${m.city}`);
  return null;
}

export function withdrawExpansionBid(state: GameState): string | null {
  const x = expansion(state);
  if (x.stage !== "floated") return "The bids are closed.";
  const b = x.bids.find((y) => y.user);
  if (!b) return "We have no bid in.";
  x.bids = x.bids.filter((y) => !y.user);
  note(state, `We withdrew our bid for ${marketOf(state, b.market)?.city ?? b.market}.`);
  return null;
}

/** What the owner would still need to buy a new club at this fee: wealth plus the sale of the current club, partners taking 30%. */
export function expansionShortfall(state: GameState, fee: number): number {
  const o = owner(state);
  const h = wealth(state).holdings;
  const available = o.liquid + 0.99 * (h.stocks + h.bonds) + 0.85 * (h.realEstate + h.business) + sellProceeds(state, "expansion");
  return Math.max(0, Math.round(fee * 0.7 + 10 * M - available));
}

/** The markets bidding now, best first, with what the owner may know about them. */
export function expansionBids(state: GameState): { market: MarketData; bid: ExpansionBid }[] {
  const x = expansion(state);
  return x.bids.filter((b) => !b.walked).map((b) => ({ market: marketOf(state, b.market)!, bid: b })).filter((r) => r.market).sort((a, b) => b.bid.score - a.bid.score);
}

/** Cities open to a bid by the owner. */
export function biddableMarkets(state: GameState): MarketData[] {
  return markets(state).filter((m) => !m.incumbent);
}

function stanceMemo(state: GameState, choice: number): string | null {
  const x = expansion(state);
  x.stance = (["support", "demand", "oppose"] as const)[choice] ?? "support";
  if (x.stance === "demand") {
    x.fee = Math.round(x.fee * 1.15 / (50 * M)) * 50 * M;
    for (const b of x.bids) if (!b.user && rngFor(state.seed, `exp-walk:${b.market}`)() < 0.18) b.walked = true;
    news(state, "league", `Owners led by the ${teamLabel(state.userTeam)} push the expansion fee to ${billions(x.fee)}`);
  }
  note(state, x.stance === "oppose" ? "We came out against expansion." : x.stance === "demand" ? `We backed expansion at a higher fee, ${billions(x.fee)}.` : "We backed expansion.");
  return null;
}

// ---- The vote and the new clubs' places ----

/** The two strongest bids, a club for each conference in the nearest division. */
function realign(state: GameState, chosen: ExpansionBid[]): ExpansionClub[] {
  const out: ExpansionClub[] = [];
  const joins = RULES.season + 2;
  const taken = new Set<string>();
  for (const b of chosen) {
    const m = marketOf(state, b.market)!;
    const options: { conf: "AFC" | "NFC"; div: TeamData["division"]; miles: number }[] = [];
    for (const conf of ["AFC", "NFC"] as const) {
      if (out.some((c) => c.conference === conf)) continue;
      for (const div of ["East", "North", "South", "West"] as const) {
        const teams = TEAMS.filter((t) => t.conference === conf && t.division === div);
        const miles = teams.reduce((s, t) => s + (PLACE[t.id] ? distance(PLACE[t.id], m.place) : 1500), 0) / Math.max(1, teams.length);
        options.push({ conf, div, miles });
      }
    }
    const best = options.sort((a, b) => a.miles - b.miles)[0];
    let id = m.id.replace(/[^A-Z]/g, "").slice(0, 3) || "EXP";
    while (TEAM_BY_ID[id] || taken.has(id)) id = `${id.slice(0, 2)}${String.fromCharCode(88 + taken.size)}`;
    taken.add(id);
    const names = NAMES[m.id] ?? FALLBACK_NAMES;
    const name = names[Math.floor(rngFor(state.seed, `exp-name:${m.id}`)() * names.length)];
    out.push({ id, market: m.id, city: m.city, name, group: b.group, conference: best.conf, division: best.div, joins, fee: expansion(state).fee, place: m.place, ...(b.user ? { user: true } : {}) });
  }
  return out;
}

function vote(state: GameState, force = false): void {
  const x = expansion(state);
  const live = x.bids.filter((b) => !b.walked).sort((a, b) => b.score - a.score);
  if (live.length < SLOTS) {
    x.stage = "rejected";
    x.nextLook = RULES.season + 3;
    news(state, "league", "The league shelves expansion: not enough strong bids");
    note(state, "Expansion was shelved for lack of strong bids.");
    return;
  }
  const chosen = live.slice(0, SLOTS);
  const near = new Set<string>();
  for (const b of chosen) {
    const m = marketOf(state, b.market)!;
    for (const t of TEAMS) if (PLACE[t.id] && distance(PLACE[t.id], m.place) <= 300) near.add(t.id);
  }
  const rel = owners(state).relations;
  const r = rngFor(state.seed, `exp-vote:${state.date}`);
  const control = tenure(state).role === "control";
  const ours = !control || x.stance !== "oppose";
  let yes = control && ours ? 1 : 0;
  for (const t of TEAMS) {
    if (control && t.id === state.userTeam) continue;
    const close = (rel[t.id]?.rapport ?? 0) > 15;
    let p = 0.9 - (near.has(t.id) ? 0.35 : 0) + (x.stance === "demand" ? 0.03 : 0);
    if (control && x.stance === "oppose" && close) p -= 0.25;
    if (control && x.stance === "support" && close) p += 0.03;
    if (force || r() < Math.max(0.05, Math.min(0.98, p + gaussian(r) * 0.04))) yes++;
  }
  x.yes = yes;
  const needed = Math.ceil(TEAMS.length * 0.75);
  const cities = chosen.map((b) => marketOf(state, b.market)!.city).join(" and ");
  if (yes < needed) {
    x.stage = "rejected";
    x.nextLook = RULES.season + 3;
    news(state, "league", `Owners vote down expansion to ${cities}, ${yes}-${TEAMS.length - yes}`);
    note(state, `The owners voted expansion down, ${yes}-${TEAMS.length - yes}; ${needed} were needed.`);
    if (x.bids.some((b) => b.user)) send(state, "league", "League Office", "Expansion voted down", `The owners voted ${yes}-${TEAMS.length - yes}; ${needed} were needed. Our bid is void.`);
    return;
  }
  x.stage = "approved";
  x.clubs = realign(state, chosen);
  const fee = x.fee;
  // The fee is split among the existing clubs, paid over five league years.
  const share = Math.round((fee * SLOTS) / TEAMS.length);
  for (const t of TEAMS) if (t.id !== state.userTeam) club(state, t.id).cash += Math.round(share / FEE_YEARS);
  x.shareLeft = share;
  x.shareYears = FEE_YEARS;
  payShare(state);
  const lines = x.clubs.map((c) => `${c.city} ${c.name} (${c.group}) in the ${c.conference} ${c.division}`);
  news(state, "league", `Owners approve expansion, ${yes}-${TEAMS.length - yes}: ${lines.join(" and ")}, from ${x.clubs[0].joins}`);
  note(state, `Approved ${yes}-${TEAMS.length - yes}: ${lines.join("; ")}. They play from ${x.clubs[0].joins}. Our share of the fees, ${money(share)}, comes over ${FEE_YEARS} league years.`);
  const mine = x.clubs.find((c) => c.user);
  if (tenure(state).role === "control") {
    send(state, "league", "League Office", "Expansion approved",
      `The owners voted ${yes}-${TEAMS.length - yes} to add ${lines.join(" and ")}. They join for the ${x.clubs[0].joins} season, with five-club divisions and a schedule built around them. ` +
      `Each club pays ${billions(fee)}; our share, ${money(share)}, comes over ${FEE_YEARS} league years, the first today. Two weeks before the new league year in ${x.clubs[0].joins}, ` +
      `every club leaves ${EXPOSE} players exposed and the new clubs pick from them; no club loses more than ${MAX_LOST}.` +
      (mine ? ` Our group won ${mine.city}: we take over the ${mine.name} when the club opens, and the ${teamLabel(state.userTeam)} will be sold then.` : ""));
  }
}

function payShare(state: GameState): void {
  const x = expansion(state);
  if (x.shareYears <= 0 || x.shareLeft <= 0) return;
  const pay = Math.round(x.shareLeft / x.shareYears);
  post(state, "expansion", pay, `Expansion fees: our share${x.shareYears > 1 ? ` (${x.shareYears - 1} more to come)` : " (the last installment)"}`);
  x.shareLeft -= pay;
  x.shareYears--;
}

// ---- Opening: staff, the expansion draft, the first draft order ----

const NEEDS: Partial<Record<Position, number>> = { QB: 2, RB: 2, WR: 3, TE: 2, OT: 3, OG: 2, C: 1, EDGE: 3, IDL: 3, LB: 2, CB: 3, S: 2 };

function age(state: GameState, id: string): number {
  return ageOn(PLAYER_BY_ID[id]?.birthDate ?? null, state.date) ?? 27;
}

/** Players a club could expose: under contract next league year, on the roster, past its five best. */
function exposable(state: GameState, team: string): string[] {
  const year = leagueYear(state.date);
  const ids = teamPlayerIds(state, team).filter((id) => {
    const ps = state.players[id];
    const end = lastYear(dealOf(state, id));
    return ps && ps.status !== "ps" && end !== null && end > year && PLAYER_BY_ID[id];
  });
  return ids.sort((a, b) => ability(state, b) - ability(state, a)).slice(5, 32);
}

function keep(state: GameState, id: string): number {
  const cap = salaryCap(state, leagueYear(state.date) + 1);
  return ability(state, id) - Math.max(0, age(state, id) - 29) * 1.5 - (dealCapHit(dealOf(state, id), leagueYear(state.date) + 1) / cap) * 60;
}

/** The lists a club can leave exposed: the staff's, the veterans kept (the young exposed), or the books cleared. */
export function exposureLists(state: GameState, team: string): { staff: string[]; veterans: string[]; books: string[] } {
  const pool = exposable(state, team);
  const year = leagueYear(state.date) + 1;
  return {
    staff: [...pool].sort((a, b) => keep(state, a) - keep(state, b)).slice(0, EXPOSE),
    veterans: [...pool].sort((a, b) => age(state, a) - age(state, b)).slice(0, EXPOSE),
    books: [...pool].sort((a, b) => dealCapHit(dealOf(state, b), year) - dealCapHit(dealOf(state, a), year)).slice(0, EXPOSE),
  };
}

function describe(state: GameState, ids: string[]): string {
  const year = leagueYear(state.date) + 1;
  return ids.map((id) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} (${age(state, id)}, ${money(dealCapHit(dealOf(state, id), year))})`).join(", ");
}

function protectMemo(state: GameState, c: ExpansionClub): void {
  if (tenure(state).role !== "control" || expansion(state).clubs.some((x) => x.user)) return;
  const l = exposureLists(state, state.userTeam);
  const gm = Object.values(staff(state).people).find((p) => p.team === state.userTeam && p.role === "GM");
  addMemo(state, {
    kind: "general", area: "trades", from: gm ? `${gm.name}, general manager` : "General Manager", title: "Our protected list for the expansion draft",
    problem: `On ${shortDate(activationDate(c))} ${expansion(state).clubs.length > 1 ? `the ${c.city} and the other new club pick` : `the new ${c.city} club picks`} from the players every club leaves exposed. We have to leave ${EXPOSE} of our players under contract next season unprotected; we can lose at most ${MAX_LOST}.`,
    proposal: `Expose ${describe(state, l.staff)}.`,
    options: [
      { label: "The staff's list", effect: `Expose ${describe(state, l.staff)}: the players we'd miss least for what they cost.` },
      { label: "Keep the veterans", effect: `Expose ${describe(state, l.veterans)}: the young depth goes on the list.` },
      { label: "Clear the books", effect: `Expose ${describe(state, l.books)}: the biggest contracts past our core. Losing one frees the cap space.` },
    ],
    risks: ["The new clubs pick the best value on the board, not necessarily the names we'd like to lose."],
    budget: "A player taken leaves his remaining bonus proration on our books; the rest of his contract goes with him.",
    recommend: 0, deadline: addDays(activationDate(c), -1), ifLate: "The staff's list goes in.",
    payload: { expansion: "protect", lists: [l.staff, l.veterans, l.books] },
  });
}

/** The day the new clubs open: two weeks before the new league year of the season before they play. */
function activationDate(c: ExpansionClub): string {
  return addDays(RULES.season === c.joins - 1 ? RULES.keyDates.newLeagueYear : `${c.joins}-03-11`, -14);
}

function hire(state: GameState, team: string, role: StaffRole, mean: number, name?: string): void {
  const s = staff(state);
  const free = Object.values(s.people).filter((p) => !p.retired && !p.team && !p.role && (!p.job || p.job.kind === "assistant") && canHold(p, role))
    .sort((a, b) => reputation(state, b) - reputation(state, a));
  let pick = name ? free.find((p) => p.name === name) : (role === "HC" || role === "GM") ? free[0] : undefined;
  if (!pick) {
    const r = rngFor(state.seed, `exp-staff:${team}:${role}`);
    const taken = new Set(Object.values(s.people).map((p) => p.name));
    const side = role === "OC" ? "offense" : role === "DC" ? "defense" : role === "HC" ? (r() < 0.5 ? "offense" : "defense") : null;
    const track = role === "GM" || role === "PRO" || role === "COL" ? "exec" : role === "TRN" ? "trainer" : role === "STC" ? "st" : "coach";
    pick = newPerson(state, r, taken, { track, side, age: 38 + Math.floor(r() * 16), salt: `x${team}${role}`, mean, sd: 6, background: `Hired by the expansion ${TEAM_BY_ID[team].name}`, ...(name ? { name } : {}) });
    s.people[pick.id] = pick;
  }
  install(state, pick.id, team, role, role === "HC" || role === "GM" ? 5 : 3, salaryFor(role, reputation(state, pick)));
}

function openClub(state: GameState, c: ExpansionClub): void {
  c.activated = state.date;
  addClub(state, c);
  setVotesToPass(TEAMS.length);
  bindNationalShare(TEAMS.length);
  const s = staff(state);
  // It opens after the season it didn't play: no year-end review of a staff that just arrived.
  (s.ended ??= {})[c.id] = RULES.season;
  for (const [role, mean] of [["GM", 68], ["HC", 68], ["OC", 64], ["DC", 64], ["STC", 63], ["TRN", 63], ["PRO", 63], ["COL", 63]] as [StaffRole, number][]) hire(state, c.id, role, mean, c.staff?.[role]);
  const hc = Object.values(s.people).find((p) => p.team === c.id && p.role === "HC")!;
  const oc = Object.values(s.people).find((p) => p.team === c.id && p.role === "OC");
  const dc = Object.values(s.people).find((p) => p.team === c.id && p.role === "DC");
  s.schemes[c.id] = {
    offense: (hc.side === "offense" ? hc.scheme : oc?.scheme) as never ?? "westCoast",
    defense: (hc.side === "defense" ? hc.scheme : dc?.scheme) as never ?? "cover3",
  };
  bindStaff(state);
  staffRooms(state, c.id);
  bindStaff(state);
  // The other owners and the league's tables.
  const o = owners(state);
  if (c.id !== state.userTeam) o.relations[c.id] = { rapport: 5, tradition: 0.3, influence: 0.2 };
  const p = club(state, c.id);
  p.owner = c.group;
  p.cash = Math.round(150 * M * inflation(c.joins, 0.03));
  p.hc = hc.id;
  franchise(state).control[c.id] = c.group;
  const m = MARKET_CACHE[c.market];
  (state.leases ??= {})[c.id] = {
    through: m?.venue.ready ? c.joins + 9 : c.joins + 2, rent: Math.round(4 * M * inflation(c.joins, 0.03)), upkeep: Math.round(18 * M * inflation(c.joins, 0.03)),
    eventShare: 0.5, fund: 0, log: [{ date: state.date, text: `Expansion club: lease at ${m?.venue.name ?? "its stadium"}.` }],
  };
  if (m && !m.venue.ready) construction(state).cpu.push({ team: c.id, announced: state.date, approved: state.date, opens: c.joins + 3, name: `${c.city} Stadium`, roof: m.climate.snow > 0.2 ? "dome" : "open", cost: Math.round(2_000 * M * inflation(c.joins, 0.04) / (10 * M)) * 10 * M, structure: "publicTeam" });
  news(state, "league", `The expansion ${c.city} ${c.name} name ${hc.name} head coach`);
}

/** The expansion draft: the new clubs alternate, best value first, within a cap budget and the roster's needs. */
function expansionDraft(state: GameState): void {
  const x = expansion(state);
  const clubs = x.clubs.filter((c) => c.activated && c.joins === RULES.season + 1);
  if (!clubs.length) return;
  const pool = new Set<string>();
  for (const t of TEAMS) {
    if (clubs.some((c) => c.id === t.id)) continue;
    const list = t.id === state.userTeam && x.exposed?.length ? x.exposed.filter((id) => state.players[id]?.team === t.id) : exposureLists(state, t.id).staff;
    for (const id of list) pool.add(id);
  }
  const year = leagueYear(state.date) + 1;
  const cap = salaryCap(state, year);
  const lost: Record<string, number> = {};
  const spent: Record<string, number> = {};
  const have: Record<string, Partial<Record<Position, number>>> = {};
  for (let round = 0; round < PICKS; round++) {
    const order = round % 2 ? [...clubs].reverse() : clubs;
    for (const c of order) {
      let best: string | undefined;
      let bestV = -Infinity;
      for (const id of pool) {
        const from = state.players[id]?.team;
        if (!from || (lost[from] ?? 0) >= MAX_LOST) continue;
        const hit = dealCapHit(dealOf(state, id), year);
        if ((spent[c.id] ?? 0) + hit > cap * 0.5) continue;
        const pos = PLAYER_BY_ID[id].position;
        const full = (have[c.id]?.[pos] ?? 0) >= (NEEDS[pos] ?? 1);
        const v = ability(state, id) - Math.max(0, age(state, id) - 30) * 2 - (hit / cap) * 40 - (full ? 12 : 0);
        if (v > bestV) { bestV = v; best = id; }
      }
      if (!best) continue;
      const from = state.players[best].team!;
      pool.delete(best);
      lost[from] = (lost[from] ?? 0) + 1;
      spent[c.id] = (spent[c.id] ?? 0) + dealCapHit(dealOf(state, best), year);
      const pos = PLAYER_BY_ID[best].position;
      (have[c.id] ??= {})[pos] = (have[c.id][pos] ?? 0) + 1;
      claim(state, best, from, c.id);
    }
  }
  invalidateRosters(state);
  const ours = x.picks.filter((p) => p.from === state.userTeam && p.date === state.date);
  const counts = clubs.map((c) => `${c.name} ${x.picks.filter((p) => p.club === c.id && p.date === state.date).length}`).join(", ");
  news(state, "league", `Expansion draft: the new clubs take ${x.picks.filter((p) => p.date === state.date).length} players (${counts})`);
  if (tenure(state).role === "control" && !clubs.some((c) => c.id === state.userTeam)) {
    send(state, "league", "League Office", "The expansion draft",
      ours.length ? `We lost ${ours.map((p) => `${PLAYER_BY_ID[p.player].position} ${PLAYER_BY_ID[p.player].name} to the ${teamLabel(p.club)}`).join(" and ")}. Their remaining bonus proration stays on our books; the rest of the contract went with them.`
        : "None of our exposed players were taken.");
  }
  note(state, `Expansion draft: ${counts}.${ours.length ? ` We lost ${ours.map((p) => PLAYER_BY_ID[p.player].name).join(" and ")}.` : ""}`);
}

function claim(state: GameState, id: string, from: string, to: string): void {
  const old = dealOf(state, id)!;
  const ch = tradeCharges(old, state.date);
  const year = leagueYear(state.date);
  addDeadMoney(state, from, year, ch.thisYear);
  addDeadMoney(state, from, year + 1, ch.nextYear);
  state.contracts[id] = tradedDeal(old, to, state.date);
  const ps = state.players[id];
  state.players[id] = { ...ps, team: to };
  delete state.players[id].holdout;
  delete state.players[id].keepUntil;
  if (state.cutPlan) state.cutPlan = state.cutPlan.filter((x) => x !== id);
  if (state.trades) state.trades.block = state.trades.block.filter((x) => x !== id);
  expansion(state).picks.push({ club: to, player: id, from, date: state.date });
  logMove(state, to, id, "claimed", `took ${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name} from the ${teamLabel(from)} in the expansion draft`);
}

/** The owner takes over the new club the group won: the current club is sold at closing. */
function takeOver(state: GameState, c: ExpansionClub): boolean {
  const fm = franchise(state);
  if (fm.deal && !["closed", "failed"].includes(fm.deal.stage)) return false;
  fm.deal = { id: `exp-${c.id}-${state.date}`, team: c.id, opened: state.date, stage: "exclusive", due: state.date, costs: 0, findings: [], rivals: [], bid: { price: c.fee, financingOut: false, date: state.date } };
  for (const lp of [0, 0.15, 0.3]) {
    if (!setFinancing(state, { lp, pe: 0, debt: 0, trust: 0, terms: "standard" })) {
      closeDeal(state, fm.deal);
      const m = MARKET_CACHE[c.market];
      const f = fanBase(state);
      f.core = f.core0 = Math.round(34 + 25 * (m?.attachment ?? 0.4));
      f.trust = 64;
      f.scar = 0;
      return true;
    }
  }
  delete fm.deal;
  return false;
}

/** The first draft: the new clubs pick at the top of every round. */
function draftOrder(state: GameState, clubs: ExpansionClub[]): void {
  const o = off(state);
  const ids = clubs.map((c) => c.id);
  if (o.draftOrder) o.draftOrder = [...ids, ...o.draftOrder.filter((t) => !ids.includes(t))];
}

function open(state: GameState): void {
  const x = expansion(state);
  const clubs = x.clubs.filter((c) => !c.activated);
  for (const c of clubs) openClub(state, c);
  const mine = clubs.find((c) => c.user);
  if (mine && !takeOver(state, mine)) {
    mine.user = false;
    send(state, "league", "League Office", "Our expansion bid lapsed", `We couldn't close on the ${mine.city} ${mine.name} at ${billions(mine.fee)}; ${GROUPS[0]} takes the club instead.`);
    mine.group = GROUPS[0];
    club(state, mine.id).owner = GROUPS[0];
    franchise(state).control[mine.id] = GROUPS[0];
  }
  expansionDraft(state);
  draftOrder(state, clubs);
  x.stage = "joined";
  x.nextLook = RULES.season + 8;
  for (const c of clubs) {
    const n = teamPlayerIds(state, c.id).length;
    if (c.id === state.userTeam) {
      send(state, "staff", "General Manager", `Building the ${c.name}`,
        `We have ${n} players from the expansion draft and ${money(capSummary(state, c.id, leagueYear(state.date) + 1).space)} in cap space next league year. Free agency opens in two weeks, and we pick first in every round of the draft.`);
    }
  }
}

// ---- The memo answers and the day ----

export function resolveExpansionMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  if (p.expansion === "stance") return stanceMemo(state, choice);
  if (p.expansion === "protect") {
    const lists = p.lists as string[][];
    expansion(state).exposed = lists[choice] ?? lists[0];
  }
  return null;
}

export function expansionDaily(state: GameState): void {
  const x = state.expansion;
  if (state.date === RULES.keyDates.annualLeagueMeeting) floatExpansion(state);
  if (!x) return;
  if (x.stage === "floated" && x.voteDate && state.date >= x.voteDate) vote(state);
  if (state.date === RULES.keyDates.newLeagueYear && x.shareYears > 0 && x.stage !== "floated") payShare(state);
  if (x.stage !== "approved") return;
  const c = x.clubs[0];
  if (!c || RULES.season !== c.joins - 1) return;
  const day = activationDate(c);
  if (state.date === addDays(day, -21)) protectMemo(state, c);
  if (state.date >= day && !c.activated) open(state);
}

/**
 * Real history: a club the league had already awarded at the start (Houston,
 * October 1999, for 2002). It opens on the usual schedule, two weeks before
 * the new league year, with its expansion draft; the fee is split among the
 * clubs over the league years until then.
 */
export function awardRealClub(state: GameState, c: ExpansionClub, feeYears: number): void {
  const x = expansion(state);
  if (x.clubs.some((k) => k.id === c.id)) return;
  x.clubs = [c];
  x.stage = "approved";
  x.fee = c.fee;
  x.shareLeft = Math.round(c.fee / TEAMS.length);
  x.shareYears = feeYears;
  x.nextLook = c.joins + 8;
}

/** Test helper: float, award and approve expansion now, optionally with the owner's bid. */
export function forceExpansion(state: GameState, opts: { userMarket?: string; joins?: number } = {}): ExpansionClub[] {
  const x = expansion(state);
  x.stage = "quiet";
  floatExpansion(state, true);
  if (opts.userMarket) {
    const err = bidForExpansion(state, opts.userMarket);
    if (err) throw new Error(err);
    x.bids.find((b) => b.user)!.score += 1;
  }
  for (const b of x.bids) if (!b.user) b.score += 0.5;
  x.stance = "support";
  vote(state, true);
  if (opts.joins) for (const c of x.clubs) c.joins = opts.joins;
  return x.clubs;
}

/** Test helper: open the approved clubs now (staff, the expansion draft, the draft order). */
export function forceOpen(state: GameState): void {
  if (expansion(state).stage === "approved") open(state);
}
