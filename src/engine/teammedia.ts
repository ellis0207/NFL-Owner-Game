// Team media and communications. The national money is mostly the league's
// TV and streaming contracts, signed by the league for all 32 clubs and
// shared equally; they run through 2033, with the league able to opt out
// after the 2029 season, so the money after that is a forecast with real
// uncertainty (streaming's growth, the networks' appetite). Renegotiating
// them is the owners' business, later. The club's own media is a content
// department: producers, video, editors, writers, designers and the people
// who distribute it, making a podcast, a weekly local show, a season
// documentary and content for the international market the league assigns.
// Social followers grow with winning, stars, national games and content; the
// audience makes digital sponsorship worth more without guaranteeing a sale.
// Each club has local beat writers who keep their own sources, a spokesperson
// for press questions, and a long memory: headlines stay in an archive, and
// the biggest stories come back year after year. The writers, voices online
// and the international assignment are made up.
import { broadcastLean } from "./economy";
import { inflation, nationalRevenue } from "./business";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { execBoost, execRole } from "./executives";
import { fanBase } from "./fans";
import { send } from "./inbox";
import { RULES, TEAM_BY_ID } from "./league";
import { merchLift } from "./clubhouse";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { addStory, changeRel, mediaState } from "./outlets";
import { rivalryHeat } from "./records";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import { standings, winPct } from "./standings";
import type { GameResult, GameState, LedgerCat, ScheduledGame, TeamMediaState, TvDeal } from "./types";

const M = 1_000_000;

/** The league's national TV and streaming deals, average yearly fees (approximate public reports). */
export const TV_DEALS: TvDeal[] = [
  { partner: "CBS", package: "AFC Sunday afternoons", annual: 2.1e9, through: 2033 },
  { partner: "FOX", package: "NFC Sunday afternoons", annual: 2.25e9, through: 2033 },
  { partner: "NBC", package: "Sunday Night Football", annual: 2.0e9, through: 2033 },
  { partner: "ESPN and ABC", package: "Monday Night Football", annual: 2.7e9, through: 2033 },
  { partner: "Amazon Prime Video", package: "Thursday Night Football", annual: 1.0e9, through: 2033 },
  { partner: "YouTube", package: "NFL Sunday Ticket", annual: 2.0e9, through: 2029 },
  { partner: "Netflix", package: "Christmas Day games", annual: 0.15e9, through: 2026 },
];
export const OPT_OUT = 2029;

export const ROLES: Record<string, { label: string; pay: number; base: number }> = {
  producers: { label: "Producers", pay: 110_000, base: 3 },
  video: { label: "Videographers", pay: 85_000, base: 4 },
  editors: { label: "Editors", pay: 80_000, base: 3 },
  writers: { label: "Writers", pay: 75_000, base: 3 },
  designers: { label: "Designers", pay: 80_000, base: 2 },
  distribution: { label: "Social and distribution", pay: 70_000, base: 3 },
};
export const SHOWS: Record<string, { label: string; cost: number; revenue: number; needs: Record<string, number>; on: boolean }> = {
  podcast: { label: "Team podcast", cost: 0.3 * M, revenue: 0.35 * M, needs: { producers: 1, editors: 1 }, on: true },
  weekly: { label: "Weekly local TV show", cost: 1.2 * M, revenue: 1.4 * M, needs: { producers: 1, video: 2, editors: 1 }, on: true },
  documentary: { label: "Season documentary", cost: 2.5 * M, revenue: 0, needs: { producers: 2, video: 3, editors: 2, writers: 1 }, on: false },
  international: { label: "Content for our international market", cost: 0.8 * M, revenue: 0, needs: { writers: 1, designers: 1, distribution: 1 }, on: false },
};
/** Markets the league assigns clubs for international marketing (made up per club here). */
const MARKETS_ABROAD = ["Germany", "the United Kingdom", "Mexico", "Brazil", "Canada", "Australia", "Spain", "France", "Japan", "Ireland", "Austria", "Switzerland"];

export function teamMedia(state: GameState): TeamMediaState {
  if (state.teamMedia) return state.teamMedia;
  const f = fanBase(state);
  const followers = Math.round((f.reach.local + f.reach.region + f.reach.national + f.reach.intl) * 0.55);
  state.teamMedia = {
    staff: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.base])),
    shows: Object.fromEntries(Object.entries(SHOWS).map(([k, s]) => [k, s.on])),
    followers, followers0: followers, streaming: 1, access: "standard", spokesperson: "owner",
    feed: [], archive: [], sagas: [], prime: [],
  };
  return state.teamMedia;
}

export function abroad(state: GameState): string {
  const rng = rngFor(state.seed, `abroad:${state.userTeam}`);
  return MARKETS_ABROAD[Math.floor(rng() * MARKETS_ABROAD.length)];
}

// ---- The national money ----

/** Our 1/32 share of national revenue, by source: TV and streaming, licensing and the league's other businesses. */
export function nationalBreakdown(year: number): { tv: number; licensing: number; other: number; total: number } {
  const total = nationalRevenue(year);
  const tvAll = TV_DEALS.filter((d) => d.through >= Math.min(year, 2033)).reduce((a, d) => a + d.annual, 0);
  const tv = Math.min(total * 0.85, tvAll / 32 * (total / nationalRevenue(2026)));
  const licensing = total * 0.06;
  return { tv, licensing, other: total - tv - licensing, total };
}

/** What the next TV deals might bring per club, after the opt-out: a range that moves with the streaming market. */
export function tvOutlook(state: GameState): { year: number; low: number; mid: number; high: number } {
  const t = teamMedia(state);
  const year = OPT_OUT + 1;
  const mid = nationalBreakdown(year).tv * t.streaming;
  return { year, low: mid * 0.85, mid, high: mid * 1.2 };
}

// ---- The content department ----

export function setStaff(state: GameState, role: string, n: number): void {
  teamMedia(state).staff[role] = Math.max(0, Math.min(15, Math.round(n)));
}
export function setShow(state: GameState, show: string, on: boolean): void {
  teamMedia(state).shows[show] = on;
}
export function setAccess(state: GameState, a: TeamMediaState["access"]): void {
  teamMedia(state).access = a;
}
export function setSpokesperson(state: GameState, who: TeamMediaState["spokesperson"]): void {
  teamMedia(state).spokesperson = who;
}

/** How well a show is staffed: 1 when every role it needs is covered after the shows ahead of it. */
export function showQuality(state: GameState): Record<string, number> {
  const t = teamMedia(state);
  const left = { ...t.staff };
  const out: Record<string, number> = {};
  for (const [k, s] of Object.entries(SHOWS)) {
    if (!t.shows[k]) continue;
    let q = 1;
    for (const [role, n] of Object.entries(s.needs)) {
      const have = Math.min(n, left[role] ?? 0);
      left[role] = (left[role] ?? 0) - have;
      q = Math.min(q, have / n);
    }
    out[k] = Math.round((0.4 + 0.6 * q) * 100) / 100;
  }
  // Whoever is left over makes the everyday posts and video.
  out.everyday = Math.min(1.4, (Object.values(left).reduce((a, x) => a + Math.max(0, x), 0) + 4) / 10);
  return out;
}

function staffCost(staff: Record<string, number>): number {
  return Object.entries(staff).reduce((a, [k, n]) => a + n * (ROLES[k]?.pay ?? 0), 0) * 1.3;
}

/** A year of the content department: pay with benefits, the shows, and what the podcast and the local show bring in. */
export function contentYear(state: GameState, year: number): { cost: number; revenue: number } {
  const t = teamMedia(state);
  const q = showQuality(state);
  const grow = inflation(year, 0.03);
  let cost = staffCost(t.staff);
  let revenue = 0;
  for (const [k, s] of Object.entries(SHOWS)) {
    if (!t.shows[k]) continue;
    cost += s.cost;
    revenue += s.revenue * (q[k] ?? 1) * (0.9 + fanBase(state).trust / 600);
  }
  return { cost: cost * grow, revenue: revenue * grow };
}

/** What the business operations budget already assumes for content: the standard staff, the podcast and the weekly show. */
export function defaultContentNet(year: number): number {
  const staff = staffCost(Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.base])));
  return (staff + SHOWS.podcast.cost + SHOWS.weekly.cost - SHOWS.podcast.revenue - SHOWS.weekly.revenue) * inflation(year, 0.03);
}

/** The content department's monthly ledger items, for the business office's monthly run. */
export function contentMonthly(state: GameState, year: number): { cat: LedgerCat; amount: number; note?: string }[] {
  const c = contentYear(state, year);
  return [
    { cat: "content", amount: -c.cost / 12, note: "Content staff and shows" },
    { cat: "localMedia", amount: c.revenue / 12, note: "Team podcast and local show: rights and ads" },
  ];
}

/** Our audience against when the owner took over: digital sponsors pay for it, and partners measure what they got by it. */
export function audienceLift(state: GameState): number {
  const t = state.teamMedia;
  return t ? Math.pow(t.followers / t.followers0, 0.4) : 1;
}

// ---- Social ----

const VOICES = [
  { who: "@MotorCityLifer", kind: "diehard" }, { who: "@CapSheetCarl", kind: "numbers" }, { who: "@SundayFundayJen", kind: "casual" },
  { who: "@RivalRoastBot", kind: "rival" }, { who: "@OldSchoolFootball", kind: "oldtimer" },
];

function react(state: GameState, g: ScheduledGame, r: GameResult): void {
  const t = teamMedia(state);
  const us = state.userTeam;
  const ours = r.home === us ? r.homeScore : r.awayScore;
  const theirs = r.home === us ? r.awayScore : r.homeScore;
  const opp = r.home === us ? r.away : r.home;
  const name = TEAM_BY_ID[us].name;
  const won = ours > theirs;
  const close = Math.abs(ours - theirs) <= 7;
  const rival = rivalryHeat(state, us, opp) >= 3.5;
  const rng = rngFor(state.seed, `social:${g.id}`);
  const lines: Record<string, string[]> = {
    diehard: won ? [`${rival ? "Beat them again. " : ""}This team is different. LET'S GO ${name.toUpperCase()}`, `Never doubted them for a second (I doubted them all week)`] : [`I can't keep doing this every Sunday`, `${ours}-${theirs}. Fire everyone. Not really. Maybe.`],
    numbers: won ? [`Win probability says that one was ${close ? "a coin flip until the end" : "over by halftime"}. Good process.`] : [`The fourth-down decisions cost us. Run the numbers.`, `Turnover margin tells the story again.`],
    casual: won ? [`Great day at the game with the kids!`, `Wings and a win, perfect Sunday`] : [`At least the tailgate was fun`, `Tough one. Same time next week.`],
    rival: won ? [`Enjoy it, ${name} fans. It won't last.`] : [`Same old ${name}`, `${ours} points? lol`],
    oldtimer: won ? [`Reminds me of the good teams. Run the ball, stop the run.`] : [`In my day they'd have run it on third and short.`],
  };
  const pick = VOICES.slice().sort(() => rng() - 0.5).slice(0, 3);
  for (const v of pick) {
    const options = lines[v.kind];
    t.feed.unshift({ date: state.date, who: v.who, text: options[Math.floor(rng() * options.length)] });
  }
  t.feed.length = Math.min(t.feed.length, 30);
}

/** Our games on national TV in prime time, Thanksgiving and Christmas: the league sets them; they grow the audience. */
function nationalGame(g: ScheduledGame): boolean {
  return g.weekday === "Monday" || g.weekday === "Thursday" || g.timeET >= "20:00" || g.date.endsWith("-12-25") || g.type === "POST";
}

/** After each of our games: the audience, the fans' voices online, and national exposure. */
export function afterOurGame(state: GameState, g: ScheduledGame, r: GameResult): void {
  const t = teamMedia(state);
  react(state, g, r);
  if (nationalGame(g) && !t.prime.includes(g.id)) {
    t.prime.push(g.id);
    t.prime = t.prime.slice(-40);
    const f = fanBase(state);
    f.reach.national = Math.round(f.reach.national * 1.006);
    t.followers = Math.round(t.followers * 1.004);
  }
}

function weekly(state: GameState): void {
  const t = teamMedia(state);
  const f = fanBase(state);
  const q = showQuality(state);
  const rec = standings(state)[state.userTeam];
  const wp = rec && rec.w + rec.l + rec.t ? winPct(rec.w, rec.l, rec.t) : 0.5;
  const content = (q.everyday - 1) * 0.0015 + (q.documentary ?? 0) * 0.0008 + (q.international ?? 0) * 0.0003;
  const rate = 0.0012 + (wp - 0.5) * 0.004 + (merchLift(state) - 1) * 0.01 + content;
  t.followers = Math.round(t.followers * (1 + rate));
  if (q.international) f.reach.intl = Math.round(f.reach.intl * (1 + 0.002 * q.international));
  if (q.documentary && state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.regularSeasonEnd) f.core = Math.min(95, f.core + 0.01 * q.documentary);
  // The beat: access shapes what the writers know and how they feel about it.
  const c = state.culture;
  if (c) c.rel.sources = Math.max(0, Math.min(100, c.rel.sources + (t.access === "open" ? 0.3 : t.access === "closed" ? -0.3 : 0)));
  const m = mediaState(state);
  m.coach = Math.max(0, Math.min(100, m.coach + (t.access === "open" ? -0.15 : t.access === "closed" ? 0.15 : 0)));
}

// ---- The beat ----

export function beatWriters(state: GameState): string[] {
  const rng = rngFor(state.seed, `beat:${state.userTeam}`);
  return [0, 1].map(() => `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`);
}

/** The beat writers' midweek notebook: warmer when they have access and the team wins, sharper when they don't. */
function notebook(state: GameState): void {
  const t = teamMedia(state);
  const us = state.userTeam;
  const rec = standings(state)[us];
  if (!rec) return;
  const wp = rec.w + rec.l + rec.t ? winPct(rec.w, rec.l, rec.t) : 0.5;
  const sources = state.culture?.rel.sources ?? 50;
  const writers = beatWriters(state);
  const rng = rngFor(state.seed, `notebook:${state.date}`);
  const by = writers[Math.floor(rng() * 2)];
  const warm = wp >= 0.5 && t.access !== "closed";
  const name = TEAM_BY_ID[us].name;
  const headline = warm ? `${name} notebook: confidence is high at the facility` : t.access === "closed" ? `${name} notebook: a quiet building, and questions without answers` : `${name} notebook: a week to regroup`;
  const body = (t.access === "closed" ? "Access was limited again this week; players were available only at the podium. " : t.access === "open" ? "Coaches and players were around all week. " : "") +
    (sources >= 65 ? "People inside the building say the staff is aligned on the plan. " : sources <= 35 ? "Nobody inside the building is saying much, which is its own story. " : "") +
    `At ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}, ${wp >= 0.6 ? "the talk is about seeding" : wp >= 0.4 ? "every game matters" : "the talk has turned to next year"}.`;
  addStory(state, { outlet: "beat", by, kind: "interview", teams: [us], headline, body });
  if (!warm) state.pressure.fans = Math.max(0, state.pressure.fans - 0.1);
}

/** The club's voice on a press question: who answers, and how well communications prepared them. */
export function spokesperson(state: GameState): { name: string; title: string } {
  const t = teamMedia(state);
  if (t.spokesperson === "president") {
    const p = execRole(state, "PRES");
    if (p) return { name: p.name, title: "team president" };
  }
  if (t.spokesperson === "gm") {
    const gm = teamStaff(state.userTeam).GM;
    if (gm) return { name: gm.name, title: "general manager" };
  }
  if (t.spokesperson === "coach") {
    const hc = teamStaff(state.userTeam).HC;
    if (hc) return { name: hc.name, title: "head coach" };
  }
  return { name: state.ownerName, title: "owner" };
}

/** After an answer: a prepared spokesperson lands better with the outlet; the coach at the podium costs him focus. */
export function afterAnswer(state: GameState, outlet: string): void {
  const t = teamMedia(state);
  const comms = execBoost(state, "MKT") + (t.staff.writers >= 3 ? 0.5 : 0);
  changeRel(state, outlet, Math.round(comms * 0.6 + (t.spokesperson === "president" ? 0.5 : 0)));
  if (t.spokesperson === "coach") mediaState(state).coach = Math.max(0, mediaState(state).coach - 0.5);
}

// ---- Memory ----

/** Keeps every headline about our club, across seasons. */
export function archiveStory(state: GameState, s: { date: string; outlet: string; headline: string; teams?: string[]; kind: string }): void {
  if (!state.teamMedia) return;
  if (!s.teams?.includes(state.userTeam) && s.kind !== "owner") return;
  const a = state.teamMedia.archive;
  a.unshift({ date: s.date, outlet: s.outlet, headline: s.headline });
  if (a.length > 2500) a.length = 2500;
}

export function searchArchive(state: GameState, q: string): { date: string; outlet: string; headline: string }[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return teamMedia(state).archive.filter((x) => words.every((w) => x.headline.toLowerCase().includes(w))).slice(0, 100);
}

/** A story that will come back each year for a while: a rename, seat licenses, a scandal. */
export function startSaga(state: GameState, key: string, title: string, years: number): void {
  const t = teamMedia(state);
  if (t.sagas.some((s) => s.key === key)) return;
  t.sagas.push({ key, title, start: state.date, until: RULES.season + years, told: [] });
}

function retell(state: GameState): void {
  const t = teamMedia(state);
  for (const s of t.sagas) {
    if (RULES.season > s.until || s.told.includes(RULES.season)) continue;
    if (state.date.slice(5) !== s.start.slice(5) || state.date === s.start) continue;
    s.told.push(RULES.season);
    const years = Number(state.date.slice(0, 4)) - Number(s.start.slice(0, 4));
    addStory(state, {
      outlet: "beat", by: beatWriters(state)[0], kind: "owner", teams: [state.userTeam],
      headline: `${years} year${years === 1 ? "" : "s"} later: ${s.title}`,
      body: `It still comes up on the radio and in the stands. ${years >= 3 ? "Time has softened some of it." : "For a lot of fans it's still fresh."}`,
    });
  }
}

export function teamMediaDaily(state: GameState): void {
  const t = teamMedia(state);
  const wd = new Date(state.date + "T12:00:00Z").getUTCDay();
  if (wd === 1) weekly(state);
  const K = RULES.keyDates;
  if (wd === 3 && state.date >= K.regularSeasonStart && state.date <= K.regularSeasonEnd) notebook(state);
  retell(state);
  // The streaming market moves a little each year, and with it what the next TV deals look like.
  if (state.date === addDays(K.superBowl, 3)) {
    const rng = rngFor(state.seed, `streaming:${RULES.season}`);
    // The advertising market behind the networks follows the economy.
    t.streaming = Math.max(0.8, Math.min(1.25, t.streaming + gaussian(rng) * 0.04 + broadcastLean(state)));
    if (leagueYear(state.date) >= OPT_OUT - 1 && leagueYear(state.date) <= OPT_OUT) {
      const o = tvOutlook(state);
      send(state, "league", "League Office", "Media rights outlook",
        `The league can opt out of its TV deals after the ${OPT_OUT} season. Our consultants put each club's share of the next deals between $${Math.round(o.low / M)}M and $${Math.round(o.high / M)}M a year.`);
    }
  }
}

