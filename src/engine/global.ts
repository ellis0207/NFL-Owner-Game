// International growth. The league runs a global markets program: clubs
// apply for marketing rights in a few countries for five years, then build
// an audience there with content in the local language, fan events and
// youth programs, authorized merchandise and local sponsors that don't
// clash with the league's own partners. Other clubs chase the same fans.
// Money comes in local currency, so exchange rates move it, and a hedge can
// lock the rate for a year. It is a long game: costs come first, the
// audience grows over years, and income follows the audience.
//
// The league's International Player Pathway places a handful of overseas
// athletes with clubs each spring, with an extra practice-squad spot that
// doesn't count against the limit. A club that cooperates and funds
// international scouting can ask for one.
//
// Country figures are rough (population, a judgment of NFL interest, 2025
// exchange rates rounded). Which other clubs hold rights where, the partner
// companies and the pathway players are made up for each save.
import { inflation, post, businessChief } from "./business";
import { minimumSalary } from "./contracts";
import { addDays, shortDate } from "./dates";
import { fanBase } from "./fans";
import { money, news, send } from "./inbox";
import { HIDDEN_RATINGS, PLAYER_BY_ID, PLAYERS, RULES, SCHEDULE, TEAMS, TEAM_BY_ID } from "./league";
import { POSITION_TRAITS, SIZE } from "./prospects";
import { gaussian, rngFor } from "./rng";
import { DRAW } from "./stadiums";
import { standings, winPct } from "./standings";
import type { Deal, GameState, PlayerData, Position } from "./types";

const M = 1_000_000;

export interface IntlMarket { id: string; name: string; pop: number; interest: number; currency: string; fx: number; cities: string[] }

export const INTL: IntlMarket[] = [
  { id: "UK", name: "United Kingdom", pop: 68, interest: 0.55, currency: "GBP", fx: 1.27, cities: ["London", "Tottenham", "Wembley"] },
  { id: "DE", name: "Germany", pop: 84, interest: 0.6, currency: "EUR", fx: 1.08, cities: ["Munich", "Frankfurt", "Berlin", "Allianz", "Olympiastadion", "Deutsche Bank Park"] },
  { id: "MX", name: "Mexico", pop: 130, interest: 0.62, currency: "MXN", fx: 0.055, cities: ["Mexico City", "Azteca", "Banorte"] },
  { id: "BR", name: "Brazil", pop: 215, interest: 0.35, currency: "BRL", fx: 0.18, cities: ["São Paulo", "Sao Paulo", "Rio", "Maracana", "Maracanã", "Corinthians", "Neo Qu"] },
  { id: "CA", name: "Canada", pop: 41, interest: 0.6, currency: "CAD", fx: 0.73, cities: ["Toronto"] },
  { id: "ES", name: "Spain", pop: 48, interest: 0.25, currency: "EUR", fx: 1.08, cities: ["Madrid", "Bernab"] },
  { id: "FR", name: "France", pop: 68, interest: 0.2, currency: "EUR", fx: 1.08, cities: ["Paris", "Stade de France"] },
  { id: "IE", name: "Ireland", pop: 5.3, interest: 0.45, currency: "EUR", fx: 1.08, cities: ["Dublin", "Croke"] },
  { id: "AU", name: "Australia", pop: 27, interest: 0.3, currency: "AUD", fx: 0.66, cities: ["Melbourne", "Sydney"] },
  { id: "JP", name: "Japan", pop: 124, interest: 0.15, currency: "JPY", fx: 0.0067, cities: ["Tokyo"] },
];
const BY_ID: Record<string, IntlMarket> = Object.fromEntries(INTL.map((m) => [m.id, m]));

/** The league keeps these sponsor categories for its own international partners. */
export const LEAGUE_CATEGORIES = ["beer", "auto", "sportsbook"];
const PARTNER_CATS = ["bank", "airline", "wireless", "drink", "insurance", "retail"];
const PARTNER_WORDS = ["Nord", "Atlas", "Sol", "Prime", "Crown", "Vista", "Meridian", "Pacific", "Royal", "Aurora"];

/** Yearly cost of each level of localized content and of fan events (watch parties, youth flag football, appearances). */
const CONTENT = [0, 0.4 * M, 1.0 * M, 2.2 * M];
const EVENTS = [0, 0.3 * M, 0.8 * M, 1.8 * M];
const ADMIN = 0.25 * M;
const MAX_CLUBS = 8;

export interface Rights {
  market: string;
  since: string;
  until: number;
  content: number;
  events: number;
  /** Merchandise through the league's authorized licensee there. */
  merch: boolean;
  fans: number;
  engagement: number;
  history: { date: string; fans: number; engagement: number; viewers: number; buyers: number; repeat: number }[];
}

export interface IntlDeal { market: string; partner: string; cat: string; value: number; start: string; years: number }

export interface PathwayPlayer { id: string; name: string; position: Position; country: string; birthDate: string; heightIn: number; weightLb: number; year: number; team: string; overall: number; potential: number; durability: number; traits: Record<string, number> }

export interface GlobalState {
  rights: Rights[];
  application?: { markets: string[]; date: string; decided?: string; granted?: string[] };
  /** Other clubs holding rights in each market (made up). */
  others: Record<string, string[]>;
  fx: Record<string, number>;
  /** A forward contract locking each currency's rate until a date. */
  hedge?: { until: string; rates: Record<string, number> };
  deals: IntlDeal[];
  offer?: IntlDeal;
  /** Our plan for each game abroad. */
  trips: Record<string, "standard" | "full">;
  pathway: { joined: boolean; scouting: number; players: PathwayPlayer[]; asked?: number };
  /** Money in and out, by league year. */
  net: Record<number, { cost: number; income: number }>;
  log: { date: string; text: string }[];
}

export function global(state: GameState): GlobalState {
  if (state.global) return state.global;
  const r = rngFor(state.seed, "global-rights");
  const others: Record<string, string[]> = {};
  const clubs = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam);
  for (const m of INTL) {
    const n = Math.min(MAX_CLUBS - 2, Math.round(m.interest * 7 + r() * 2));
    others[m.id] = [...clubs].sort(() => r() - 0.5).slice(0, n);
  }
  state.global = { rights: [], others, fx: Object.fromEntries(INTL.map((m) => [m.currency, m.fx])), deals: [], trips: {}, pathway: { joined: false, scouting: 0, players: [] }, net: {}, log: [] };
  return state.global;
}

function note(state: GameState, text: string): void {
  const g = global(state);
  g.log.unshift({ date: state.date, text });
  g.log.length = Math.min(g.log.length, 30);
}

function book(state: GameState, amount: number, text: string): void {
  if (!amount) return;
  const g = global(state);
  const y = Number(state.date.slice(0, 4));
  const n = (g.net[y] ??= { cost: 0, income: 0 });
  if (amount < 0) n.cost -= amount;
  else n.income += amount;
  post(state, "global", amount, text);
}

// ---- Rights ----

/** Applications are due by November 30; the league decides December 15. Up to three markets. */
export function applyForRights(state: GameState, ids: string[]): string | null {
  const g = global(state);
  const md = state.date.slice(5);
  if (md < "09-01" || md > "11-30") return "The league takes applications from September through November.";
  const want = ids.filter((id) => BY_ID[id] && !g.rights.some((x) => x.market === id));
  if (!want.length) return "Pick a market we don't already hold.";
  if (want.length + g.rights.length > 3) return "A club can hold rights in at most three markets.";
  g.application = { markets: want, date: state.date };
  note(state, `Applied for rights in ${want.map((id) => BY_ID[id].name).join(", ")}.`);
  return "The league decides in mid-December.";
}

function decideRights(state: GameState): void {
  const g = global(state);
  const a = g.application!;
  a.decided = state.date;
  a.granted = a.markets.filter((id) => (g.others[id]?.length ?? 0) < MAX_CLUBS);
  const year = Number(state.date.slice(0, 4)) + 1;
  for (const id of a.granted) g.rights.push({ market: id, since: state.date, until: year + 4, content: 1, events: 1, merch: false, fans: 0, engagement: 30, history: [] });
  const denied = a.markets.filter((id) => !a.granted!.includes(id));
  send(state, "league", "League Office", "Global markets program",
    `${a.granted.length ? `We've granted rights in ${a.granted.map((id) => BY_ID[id].name).join(", ")} through ${year + 4}. ` : ""}${denied.length ? `${denied.map((id) => BY_ID[id].name).join(", ")} already has as many clubs as the program allows. ` : ""}` +
    `Club activity must follow the league's international media and sponsorship rules; ${LEAGUE_CATEGORIES.join(", ")} stay with the league's partners.`);
}

export function setActivity(state: GameState, market: string, f: Partial<Pick<Rights, "content" | "events" | "merch">>): string | null {
  const r = global(state).rights.find((x) => x.market === market);
  if (!r) return "We don't hold rights there.";
  if (f.content !== undefined) r.content = Math.max(0, Math.min(3, Math.round(f.content)));
  if (f.events !== undefined) r.events = Math.max(0, Math.min(3, Math.round(f.events)));
  if (f.merch !== undefined) r.merch = f.merch;
  return null;
}

/** The exchange rate we get: the hedge's while it lasts. */
export function rateFor(state: GameState, currency: string): number {
  const g = global(state);
  if (g.hedge && state.date <= g.hedge.until && g.hedge.rates[currency]) return g.hedge.rates[currency];
  return g.fx[currency] ?? 1;
}

/** Lock this year's rates with a forward contract: about 1% of the year's expected receipts. */
export function hedge(state: GameState): string | null {
  const g = global(state);
  if (!g.rights.length) return "Nothing overseas to hedge.";
  if (g.hedge && state.date <= g.hedge.until) return `Rates are locked until ${shortDate(g.hedge.until)}.`;
  const expected = expectedReceipts(state);
  const cost = Math.max(25_000, Math.round(expected * 0.01));
  g.hedge = { until: addDays(state.date, 365), rates: { ...g.fx } };
  book(state, -cost, "Currency hedge: forward contracts for a year");
  note(state, `Locked exchange rates for a year (${money(cost)}).`);
  return null;
}

function expectedReceipts(state: GameState): number {
  const g = global(state);
  let t = 0;
  for (const r of g.rights) t += merchIncome(state, r) * 12;
  for (const d of g.deals) t += d.value * (g.fx[BY_ID[d.market].currency] ?? 1);
  return t;
}

// ---- The audience ----

function winning(state: GameState): number {
  const s = standings(state)[state.userTeam];
  return s && s.w + s.l + s.t > 0 ? winPct(s.w, s.l, s.t) : 0.5;
}

/** Where a market's audience settles with today's effort, the club's pull and the competition for the same fans. */
export function audienceTarget(state: GameState, r: Rights): number {
  const m = BY_ID[r.market];
  const others = global(state).others[r.market]?.length ?? 0;
  const brand = Math.pow(DRAW[state.userTeam] ?? 1, 4);
  return Math.round(m.pop * 1e6 * m.interest * 0.0012 * (1 + r.content * 0.55 + r.events * 0.45) * brand * (0.85 + 0.3 * winning(state)) / (1 + others * 0.12));
}

/** Overseas merchandise in a month, in dollars: the licensee's royalty on what fans buy. */
function merchIncome(state: GameState, r: Rights): number {
  if (!r.merch) return 0;
  const buyers = r.fans * (0.015 + r.engagement / 4000);
  return Math.round(buyers * 70 * 0.1 / 12 * (rateFor(state, BY_ID[r.market].currency) / BY_ID[r.market].fx));
}

function month(state: GameState): void {
  const g = global(state);
  const rng = rngFor(state.seed, `global-month:${state.date}`);
  // Currencies drift.
  for (const c of Object.keys(g.fx)) g.fx[c] = Math.round(g.fx[c] * Math.exp(gaussian(rng) * 0.022) * 1e5) / 1e5;
  const year = Number(state.date.slice(0, 4));
  g.rights = g.rights.filter((r) => {
    if (r.until >= year || state.date.slice(5) < "03-01") return true;
    note(state, `Rights in ${BY_ID[r.market].name} expired.`);
    return false;
  });
  let intl = 0;
  for (const r of g.rights) {
    const m = BY_ID[r.market];
    const cost = (ADMIN + CONTENT[r.content] + EVENTS[r.events]) * inflation(year, 0.03) / 12;
    book(state, -Math.round(cost), `${m.name}: international marketing (content, events, staff)`);
    const target = audienceTarget(state, r);
    const before = r.fans;
    // Audiences build slowly: about 3% of the gap closes each month.
    r.fans = Math.max(0, Math.round(r.fans + (target - r.fans) * 0.03 + gaussian(rng) * target * 0.004));
    r.engagement = Math.max(5, Math.min(95, Math.round(r.engagement + (25 + r.content * 12 + r.events * 9 - r.engagement) * 0.1 + gaussian(rng) * 2)));
    intl += r.fans - before;
    const income = merchIncome(state, r);
    if (income) book(state, income, `${m.name}: royalties from the league's licensee`);
    r.history.unshift({
      date: state.date, fans: r.fans, engagement: r.engagement,
      viewers: Math.round(r.fans * (0.08 + r.engagement / 600)), buyers: Math.round(r.fans * (r.merch ? 0.015 + r.engagement / 4000 : 0)), repeat: Math.round(r.events ? 30 + r.events * 10 + r.engagement / 5 : 0),
    });
    r.history.length = Math.min(r.history.length, 24);
  }
  for (const d of g.deals) {
    const m = BY_ID[d.market];
    book(state, Math.round(d.value / 12 * rateFor(state, m.currency)), `${m.name}: ${d.partner} sponsorship`);
  }
  g.deals = g.deals.filter((d) => state.date < `${Number(d.start.slice(0, 4)) + d.years}${d.start.slice(4)}`);
  if (intl && state.fans) fanBase(state).reach.intl = Math.max(0, fanBase(state).reach.intl + intl);
  // Partners come looking once an audience is there.
  if (!g.offer) {
    const r = g.rights.filter((x) => x.fans > 20_000 && !g.deals.some((d) => d.market === x.market)).sort((a, b) => b.fans - a.fans)[0];
    if (r && rng() < 0.15) {
      const m = BY_ID[r.market];
      const usd = Math.round(r.fans * (6 + r.engagement / 10) / 1000) * 1000;
      g.offer = { market: r.market, partner: `${PARTNER_WORDS[Math.floor(rng() * PARTNER_WORDS.length)]} ${m.name === "United Kingdom" ? "UK" : m.name} ${["Group", "Holdings", "Partners"][Math.floor(rng() * 3)]}`, cat: PARTNER_CATS[Math.floor(rng() * PARTNER_CATS.length)], value: Math.round(usd / m.fx), start: state.date, years: 3 };
      send(state, "business", businessChief(state), `A sponsor in ${m.name}`, `${g.offer.partner} (${g.offer.cat}) offers about ${money(usd)} a year for three years, paid in ${m.currency}. It's outside the league's reserved categories. Answer on the Business page.`);
    }
  }
}

export function answerOffer(state: GameState, yes: boolean): string | null {
  const g = global(state);
  const o = g.offer;
  if (!o) return "No offer to answer.";
  delete g.offer;
  if (!yes) return null;
  if (LEAGUE_CATEGORIES.includes(o.cat)) return "That category belongs to the league's partners.";
  o.start = state.date;
  g.deals.push(o);
  note(state, `Signed ${o.partner} in ${BY_ID[o.market].name}.`);
  return null;
}

// ---- Games abroad ----

/** Our games abroad this season, and the market each one plays in. */
export function gamesAbroad(state: GameState): { id: string; date: string; city: string; market?: string }[] {
  const us = state.userTeam;
  // Regular-season neutral-site games are played abroad; the city or the stadium tells which market.
  return SCHEDULE.filter((g) => g.neutral && g.type === "REG" && (g.home === us || g.away === us) && !/, [A-Z]{2}$/.test(g.city ?? "")).map((g) => {
    const where = g.city ?? g.stadium ?? "abroad";
    return { id: g.id, date: g.date, city: where, market: INTL.find((m) => m.cities.some((c) => where.includes(c)))?.id };
  });
}

/** The full plan: an early trip, a fan festival, media and community events, about $1.5M more than the standard trip. */
export function planTrip(state: GameState, gameId: string, plan: "standard" | "full"): string | null {
  const t = gamesAbroad(state).find((x) => x.id === gameId);
  if (!t) return "That isn't one of our games abroad.";
  if (state.date >= t.date) return "The trip already happened.";
  global(state).trips[gameId] = plan;
  return null;
}

function tripDone(state: GameState, t: { id: string; city: string; market?: string }): void {
  const g = global(state);
  const plan = g.trips[t.id] ?? "standard";
  if (plan !== "full") return;
  book(state, -Math.round(1.5 * M * inflation(RULES.season, 0.03)), `Game in ${t.city}: fan festival, media and community events`);
  const r = g.rights.find((x) => x.market === t.market);
  const gain = r ? Math.round(audienceTarget(state, r) * 0.08) : 25_000;
  if (r) r.fans += gain;
  if (state.fans) fanBase(state).reach.intl += gain;
  note(state, `The trip to ${t.city} reached about ${gain.toLocaleString("en-US")} new fans.`);
}

// ---- The pathway ----

const PATHWAY_POS: Position[] = ["OT", "OT", "IDL", "IDL", "EDGE", "EDGE", "TE", "RB", "LB", "K", "P", "OG"];
const COUNTRIES: [string, string[], string[]][] = [
  ["Australia", ["Liam", "Jack", "Cooper", "Hamish", "Lachlan", "Mitchell"], ["Walsh", "Harding", "Fraser", "Tait", "Kerr", "Doyle"]],
  ["United Kingdom", ["Oliver", "Harry", "Kieran", "Tom", "Callum", "Rhys"], ["Okafor", "Bennett", "Hughes", "Mensah", "Pryce", "Clarke"]],
  ["Germany", ["Lukas", "Jonas", "Niklas", "Felix", "Moritz", "Tim"], ["Schreiber", "Vogel", "Brandt", "Kessler", "Hoffmann", "Krause"]],
  ["Nigeria", ["Chidi", "Emeka", "Tunde", "Ifeanyi", "Segun", "Obinna"], ["Okonkwo", "Adeyemi", "Nwosu", "Balogun", "Eze", "Okoro"]],
  ["Mexico", ["Diego", "Santiago", "Mateo", "Emilio", "Andrés", "Rodrigo"], ["Herrera", "Castillo", "Navarro", "Ramos", "Ortega", "Salinas"]],
  ["Ireland", ["Cian", "Darragh", "Seán", "Oisín", "Eoin", "Ronan"], ["Byrne", "Gallagher", "Murphy", "Brennan", "Quinn", "Kavanagh"]],
  ["New Zealand", ["Tane", "Nikau", "Sione", "Manaia", "Ethan", "Wiremu"], ["Ngata", "Tuilagi", "Parata", "Fifita", "Moana", "Reid"]],
  ["Japan", ["Haruto", "Ren", "Sota", "Yuto", "Kaito", "Riku"], ["Sato", "Takahashi", "Kobayashi", "Yamada", "Nakamura", "Ito"]],
];

/** Join the league's pathway program: about $300K a year, and a voice in where players go. */
export function joinPathway(state: GameState, yes: boolean): void {
  global(state).pathway.joined = yes;
  note(state, yes ? "Joined the International Player Pathway." : "Left the International Player Pathway.");
}

/** International scouting: none, a regional scout ($500K), or a small department ($1.2M). Sharper reads on pathway players. */
export function setIntlScouting(state: GameState, level: number): void {
  global(state).pathway.scouting = Math.max(0, Math.min(2, Math.round(level)));
}

const registered = new Set<string>();

function register(p: PathwayPlayer): void {
  if (PLAYER_BY_ID[p.id]) return;
  const [first, ...rest] = p.name.split(" ");
  const data: PlayerData = {
    id: p.id, name: p.name, firstName: first, lastName: rest.join(" "), team: null, position: p.position, depthChartPosition: p.position, jersey: null,
    birthDate: p.birthDate, heightIn: p.heightIn, weightLb: p.weightLb, college: `International Pathway (${p.country})`, yearsExp: 0, rookieYear: p.year,
    draft: { team: null, round: null, overall: null },
    contract: { source: "estimated-minimum", signedYear: p.year, years: 3, totalValue: null, apy: null, guaranteed: null, apyCapPct: null, type: "International Pathway", otcTeam: p.team, seasons: [] },
    ids: { pfr: null, espn: null, sleeper: null }, headshotUrl: null, stats: [], snaps: {},
  };
  PLAYERS.push(data);
  PLAYER_BY_ID[p.id] = data;
  HIDDEN_RATINGS[p.id] = { overall: p.overall, potential: p.potential, durability: p.durability, traits: { ...p.traits } };
  registered.add(p.id);
}

export function clearPathway(): void {
  if (!registered.size) return;
  for (const id of registered) {
    delete PLAYER_BY_ID[id];
    delete HIDDEN_RATINGS[id];
  }
  for (let i = PLAYERS.length - 1; i >= 0; i--) if (registered.has(PLAYERS[i].id)) PLAYERS.splice(i, 1);
  registered.clear();
}

/** Puts this save's pathway players back in the league's player list (after loading a save). */
export function restorePathway(state: GameState): void {
  clearPathway();
  for (const p of state.global?.pathway.players ?? []) register(p);
}

function makePlayer(state: GameState, year: number, team: string, n: number): PathwayPlayer {
  const rng = rngFor(state.seed, `pathway:${year}:${n}`);
  const [country, firsts, lasts] = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
  const position = PATHWAY_POS[Math.floor(rng() * PATHWAY_POS.length)];
  // Raw athletes from rugby, track and other sports: well behind on football, sometimes with a long way to grow.
  const overall = Math.round(Math.max(30, Math.min(52, 41 + gaussian(rng) * 4)));
  const potential = Math.round(Math.min(90, overall + 8 + Math.abs(gaussian(rng)) * 12));
  const traits: Record<string, number> = {};
  for (const k of POSITION_TRAITS[position]) traits[k] = Math.round(Math.max(25, Math.min(95, overall + gaussian(rng) * 8 + (k === "speed" || k === "strength" ? 8 : 0))));
  const [h, hsd, w, wsd] = SIZE[position];
  const heightIn = Math.round(h + gaussian(rng) * hsd);
  return {
    id: `ipp-${year}-${n}`, name: `${firsts[Math.floor(rng() * firsts.length)]} ${lasts[Math.floor(rng() * lasts.length)]}`, position, country,
    birthDate: `${year - 23 - Math.floor(rng() * 3)}-0${1 + Math.floor(rng() * 9)}-1${Math.floor(rng() * 9)}`,
    heightIn, weightLb: Math.round(w + gaussian(rng) * wsd + (heightIn - h) * 5), year, team, overall, potential,
    durability: Math.round(Math.max(40, Math.min(95, 78 + gaussian(rng) * 9))), traits,
  };
}

function pathwayDeal(team: string, date: string, year: number): Deal {
  const years = [0, 1, 2].map((i) => ({ year: year + i, base: minimumSalary(0, year + i), proration: 0, bonus: 0, guaranteed: 0, injuryGuaranteed: 0 }));
  const total = years.reduce((s, y) => s + y.base, 0);
  return { team, signed: date, kind: "rookie", signingBonus: 0, total, apy: Math.round(total / 3), guaranteedAtSigning: 0, years };
}

/**
 * Each April the league places pathway players: one with each club in a
 * division, rotating, and one more with a club that asked and scouted for it.
 */
function allocate(state: GameState): void {
  const g = global(state);
  const year = RULES.season + 1;
  if (g.pathway.players.some((p) => p.year === year)) return;
  const divisions = [...new Set(TEAMS.map((t) => `${t.conference} ${t.division}`))].sort();
  const div = divisions[year % divisions.length];
  const teams = TEAMS.filter((t) => `${TEAM_BY_ID[t.id].conference} ${TEAM_BY_ID[t.id].division}` === div).map((t) => t.id);
  const us = state.userTeam;
  const rng = rngFor(state.seed, `pathway-ask:${year}`);
  if (g.pathway.joined && !teams.includes(us) && rng() < 0.3 + 0.2 * g.pathway.scouting) teams.push(us);
  teams.forEach((team, n) => {
    const p = makePlayer(state, year, team, n);
    g.pathway.players.push(p);
    register(p);
    state.players[p.id] = { team, status: "camp", ipp: true };
    state.contracts[p.id] = pathwayDeal(team, state.date, year);
  });
  const ours = g.pathway.players.filter((p) => p.year === year && p.team === us);
  news(state, `The league places ${teams.length} International Player Pathway athletes, with the ${div} clubs${teams.length > 4 ? " and one more" : ""}`);
  if (ours.length) {
    const p = ours[0];
    send(state, "staff", "Player personnel", "A pathway player joins us",
      `${p.name}, a ${p.position} from ${p.country}, joins through the International Player Pathway. He's a long project: ${g.pathway.scouting ? "our international scout likes his athletic base" : "we don't know much yet beyond the testing numbers"}. He can spend the season on the practice squad without taking a spot.`);
  }
}

// ---- Each day ----

export function globalDaily(state: GameState): void {
  const g = state.global;
  // Pathway players arrive every spring whether or not we take part.
  if (state.date === addDays(RULES.keyDates.draftStart, -14)) allocate(state);
  if (!g) return;
  if (g.application && !g.application.decided && state.date.slice(5) === "12-15") decideRights(state);
  if (state.date.endsWith("-01")) {
    month(state);
    const year = Number(state.date.slice(0, 4));
    if (state.date.slice(5) === "04-01") {
      const p = g.pathway;
      const cost = (p.joined ? 0.3 * M : 0) + [0, 0.5 * M, 1.2 * M][p.scouting];
      if (cost) book(state, -Math.round(cost * inflation(year, 0.03)), "International Player Pathway and international scouting");
    }
  }
  for (const t of gamesAbroad(state)) if (state.date === t.date) tripDone(state, t);
  // Pathway players lose the exemption once they make the 53.
  for (const p of g.pathway.players) {
    const s = state.players[p.id];
    if (s?.ipp && s.status === "active") delete s.ipp;
  }
}

/** Long-run view: what the program has cost and earned, and the audience it has built. */
export function globalSummary(state: GameState): { cost: number; income: number; fans: number; markets: number } {
  const g = state.global;
  if (!g) return { cost: 0, income: 0, fans: 0, markets: 0 };
  const sum = Object.values(g.net).reduce((a, n) => ({ cost: a.cost + n.cost, income: a.income + n.income }), { cost: 0, income: 0 });
  return { ...sum, fans: g.rights.reduce((t, r) => t + r.fans, 0), markets: g.rights.length };
}

export function marketName(id: string): string {
  return BY_ID[id]?.name ?? id;
}

export function pathwayPlayers(state: GameState, team = state.userTeam): PathwayPlayer[] {
  return (state.global?.pathway.players ?? []).filter((p) => p.team === team);
}

