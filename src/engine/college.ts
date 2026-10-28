// The college football season: every FBS game is played on its Saturday,
// with polls, standings, conference title games, bowls and the 12-team
// playoff. Teams are simulated at the score level only; the NFL prospects are
// the only players, and each gets a stat line for every game he plays.
import { addDays, weekday } from "./dates";
import { BOWLS, CFP, cfbDate, COLLEGE_DATES, COLLEGE_SCHEDULE, COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES, schoolName } from "./collegeData";
import { onSeasonChange, RULES } from "./league";
import { news } from "./inbox";
import { draftClass, type Prospect } from "./prospects";
import { gaussian, rngFor, type Rng } from "./rng";
import type { CollegeConference, CollegeGame, CollegePoll, CollegeState, GameState, Position } from "./types";
import { newScouting } from "./scouting";

export let COLLEGE_SEASON = 2026;
export let AP_PRESEASON = "";
let CFP_RANKING_DAYS: string[] = [];
let CCG_DATE = "";
let SELECTION = "";
let QF_DAY = "";
let SF_DAY = "";
let FINAL_DAY = "";
/** The final AP poll, after the title game: the college season is over. */
export let FINAL_POLL = "";
let FIRST_POLL_SUNDAY = "";
let SEASON_START = "";
let INJURY_RETURN = "";
let BY_ID: Record<string, CollegeGame> = {};
onSeasonChange(() => {
  COLLEGE_SEASON = RULES.season;
  AP_PRESEASON = cfbDate("2026-08-11");
  CFP_RANKING_DAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"].map(cfbDate);
  CCG_DATE = COLLEGE_DATES.championships;
  SELECTION = CFP.selection;
  QF_DAY = cfbDate("2026-12-20");
  SF_DAY = cfbDate("2027-01-02");
  FINAL_DAY = cfbDate("2027-01-16");
  FINAL_POLL = cfbDate("2027-01-26");
  FIRST_POLL_SUNDAY = cfbDate("2026-09-06");
  SEASON_START = cfbDate("2026-07-01");
  INJURY_RETURN = cfbDate("2027-03-01");
  BY_ID = Object.fromEntries(COLLEGE_SCHEDULE.map((g) => [g.id, g]));
});

// ---- Stats ----

/** Stat columns for each position, in packed order. */
export const COLLEGE_STATS: Record<Position, string[]> = {
  QB: ["cmp", "att", "passYds", "passTd", "int", "car", "rushYds", "rushTd"],
  RB: ["car", "rushYds", "rushTd", "rec", "recYds", "recTd"],
  FB: ["car", "rushYds", "rushTd", "rec", "recYds", "recTd"],
  WR: ["rec", "recYds", "recTd", "car", "rushYds"],
  TE: ["rec", "recYds", "recTd"],
  OT: ["gs", "sacksAllowed"],
  OG: ["gs", "sacksAllowed"],
  C: ["gs", "sacksAllowed"],
  EDGE: ["tkl", "tfl", "sacks", "ff", "pd", "defInt"],
  IDL: ["tkl", "tfl", "sacks", "ff", "pd", "defInt"],
  LB: ["tkl", "tfl", "sacks", "ff", "pd", "defInt"],
  CB: ["tkl", "defInt", "pd", "tfl", "ff"],
  S: ["tkl", "defInt", "pd", "tfl", "ff"],
  K: ["fgm", "fga", "fgLong", "xpm", "xpa"],
  P: ["punts", "puntYds"],
  LS: ["gs"],
};

export const STAT_LABEL: Record<string, string> = {
  cmp: "Cmp", att: "Att", passYds: "Pass yds", passTd: "Pass TD", int: "INT", car: "Car", rushYds: "Rush yds", rushTd: "Rush TD",
  rec: "Rec", recYds: "Rec yds", recTd: "Rec TD", gs: "Starts", sacksAllowed: "Sacks allowed", tkl: "Tkl", tfl: "TFL",
  sacks: "Sacks", ff: "FF", pd: "PD", defInt: "INT", fgm: "FGM", fga: "FGA", fgLong: "Long", xpm: "XPM", xpa: "XPA",
  punts: "Punts", puntYds: "Punt yds",
};

/** Keys that are a season high, not a sum. */
const MAX_KEYS = new Set(["fgLong"]);

export function unpackLine(pos: Position, row: number[]): Record<string, number> {
  const keys = COLLEGE_STATS[pos];
  const out: Record<string, number> = {};
  keys.forEach((k, i) => { out[k] = row[i] ?? 0; });
  return out;
}

export interface CollegeLogRow {
  game: CollegeGame;
  opp: string;
  home: boolean;
  result: string;
  line: Record<string, number>;
}

// ---- Setup ----

/** Random draws for a game or a ranking are their own each season (2026 keeps its original keys). */
function seasonKey(key: string): string {
  return COLLEGE_SEASON === 2026 ? key : `${COLLEGE_SEASON}:${key}`;
}

function prospectsOf(state: GameState) {
  return draftClass(state.seed);
}

/** Starts the college universe for a save. */
export function newCollege(state: GameState): CollegeState {
  const dc = prospectsOf(state);
  const rating: Record<string, number> = {};
  for (const t of COLLEGE_TEAMS) rating[t.id] = Math.round((t.strength + gaussian(rngFor(state.seed, seasonKey(`cfb-view:${t.id}`))) * 3) * 10) / 10;
  const hype: Record<string, number> = {};
  for (const p of dc.prospects) {
    const h = dc.hidden[p.id];
    // The media's preseason read: right about the best players, noisy below them.
    hype[p.id] = Math.round((h.value + gaussian(rngFor(state.seed, `hype:${p.id}`)) * 5 + (CONFERENCES[COLLEGE_TEAM[p.school].conference].power ? 1.5 : -1.5)) * 10) / 10;
  }
  return {
    season: COLLEGE_SEASON, results: {}, post: [], ap: [], cfp: [], rating, logs: {}, injuries: {}, hype,
    awards: {}, scouting: newScouting(),
  };
}

/** Gives a save its college universe, catching up on any days already played (older saves). */
export function ensureCollege(state: GameState): void {
  if (state.college) return;
  state.college = newCollege(state);
  // Replays the season up to today, as it would have gone.
  let d = SEASON_START;
  const realDate = state.date;
  while (d < realDate) {
    state.date = d;
    collegeDaily(state, { quiet: true });
    d = addDays(d, 1);
  }
  state.date = realDate;
}

/** True strength of a team this season (engine only). */
export function teamStrength(state: GameState, team: string): number {
  const base = COLLEGE_TEAM[team].strength;
  const season = state.college?.season ?? COLLEGE_SEASON;
  return base + gaussian(rngFor(state.seed, season === 2026 ? `cfb-strength:${team}` : `cfb-strength:${season}:${team}`)) * 4;
}

export function collegeGames(state: GameState): CollegeGame[] {
  return state.college ? COLLEGE_SCHEDULE.concat(state.college.post) : COLLEGE_SCHEDULE;
}

export function collegeGame(state: GameState, id: string): CollegeGame | undefined {
  return BY_ID[id] ?? state.college?.post.find((g) => g.id === id);
}

export function gamesOn(state: GameState, date: string): CollegeGame[] {
  return collegeGames(state).filter((g) => g.date === date);
}

// ---- Records and standings ----

export interface CollegeRecord {
  w: number;
  l: number;
  cw: number;
  cl: number;
  pf: number;
  pa: number;
  streak: string;
  /** Opponents played, for strength of schedule. */
  opps: string[];
  wins: string[];
  losses: string[];
}

const recCache = new WeakMap<object, { n: number; recs: Record<string, CollegeRecord> }>();

export function collegeRecords(state: GameState): Record<string, CollegeRecord> {
  const c = state.college!;
  const n = Object.keys(c.results).length;
  const hit = recCache.get(c.results);
  if (hit && hit.n === n) return hit.recs;
  const recs: Record<string, CollegeRecord> = {};
  for (const t of COLLEGE_TEAMS) recs[t.id] = { w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, streak: "", opps: [], wins: [], losses: [] };
  const games = collegeGames(state).filter((g) => c.results[g.id]).sort((a, b) => a.date.localeCompare(b.date));
  const streaks: Record<string, [string, number]> = {};
  for (const g of games) {
    const [a, h] = c.results[g.id];
    for (const [team, us, them, opp] of [[g.away, a, h, g.home], [g.home, h, a, g.away]] as [string, number, number, string][]) {
      const r = recs[team];
      const won = us > them;
      if (won) { r.w++; r.wins.push(opp); } else { r.l++; r.losses.push(opp); }
      if (g.conference) { if (won) r.cw++; else r.cl++; }
      r.pf += us;
      r.pa += them;
      r.opps.push(opp);
      const k = won ? "W" : "L";
      const s = streaks[team];
      streaks[team] = s && s[0] === k ? [k, s[1] + 1] : [k, 1];
    }
  }
  for (const [t, s] of Object.entries(streaks)) recs[t].streak = `${s[0]}${s[1]}`;
  recCache.set(c.results, { n, recs });
  return recs;
}

export function recordLabel(r: CollegeRecord | undefined): string {
  return r ? `${r.w}-${r.l}` : "0-0";
}

export interface ConferenceRow {
  team: string;
  rec: CollegeRecord;
}

/** Conference standings: conference record, then overall, then the polls' view. */
export function conferenceStandings(state: GameState, conf: CollegeConference): ConferenceRow[] {
  const recs = collegeRecords(state);
  const rating = state.college!.rating;
  const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0.5);
  return COLLEGE_TEAMS.filter((t) => t.conference === conf)
    .map((t) => ({ team: t.id, rec: recs[t.id] }))
    .sort((a, b) => conf === "IND"
      ? pct(b.rec.w, b.rec.l) - pct(a.rec.w, a.rec.l) || rating[b.team] - rating[a.team]
      : pct(b.rec.cw, b.rec.cl) - pct(a.rec.cw, a.rec.cl) || (b.rec.cw - b.rec.cl) - (a.rec.cw - a.rec.cl)
        || headToHead(state, a.team, b.team) || pct(b.rec.w, b.rec.l) - pct(a.rec.w, a.rec.l) || rating[b.team] - rating[a.team]);
}

function headToHead(state: GameState, a: string, b: string): number {
  const recs = collegeRecords(state);
  const aBeat = recs[a].wins.includes(b);
  const bBeat = recs[b].wins.includes(a);
  return aBeat && !bBeat ? -1 : bBeat && !aBeat ? 1 : 0;
}

// ---- Polls ----

function pollScore(state: GameState, team: string, committee: boolean): number {
  const c = state.college!;
  const r = collegeRecords(state)[team];
  const power = CONFERENCES[COLLEGE_TEAM[team].conference].power || team === "ND";
  let s = c.rating[team] + 1.5 * r.w - 6.5 * r.l + (power ? 0 : -3);
  if (committee && r.opps.length) {
    const sos = r.opps.reduce((x, o) => x + c.rating[o], 0) / r.opps.length;
    s += 0.45 * (sos - 64);
    s += r.wins.filter((o) => c.rating[o] >= 75).length * 1.2;
  }
  if (!committee && r.l === 0 && r.w >= 5) s += 1.5;
  return s;
}

function ranking(state: GameState, committee: boolean): string[] {
  return COLLEGE_TEAMS.map((t) => t.id)
    .sort((a, b) => pollScore(state, b, committee) - pollScore(state, a, committee))
    .slice(0, 25);
}

function releasePoll(state: GameState, kind: "ap" | "cfp", label: string): CollegePoll {
  const poll = { date: state.date, label, ranks: ranking(state, kind === "cfp") };
  state.college![kind].push(poll);
  return poll;
}

/** The latest AP poll and CFP ranking, if out. */
export function latestPoll(state: GameState, kind: "ap" | "cfp"): CollegePoll | undefined {
  const polls = state.college?.[kind] ?? [];
  return polls[polls.length - 1];
}

/** "No. 4 Georgia" or "Georgia". */
export function rankedName(state: GameState, team: string, poll = latestPoll(state, state.college?.cfp.length && state.date < FINAL_POLL ? "cfp" : "ap")): string {
  const i = poll ? poll.ranks.indexOf(team) : -1;
  return i >= 0 ? `No. ${i + 1} ${schoolName(team)}` : schoolName(team);
}

export function rankOf(state: GameState, team: string, kind: "ap" | "cfp" = "ap"): number | null {
  const p = latestPoll(state, kind);
  const i = p ? p.ranks.indexOf(team) : -1;
  return i >= 0 ? i + 1 : null;
}

// ---- Daily ----

/** Everything that happens in college football on the current date. */
export function collegeDaily(state: GameState, opts: { quiet?: boolean } = {}): void {
  const c = state.college;
  if (!c) return;
  const date = state.date;
  if (date >= AP_PRESEASON && !c.ap.length) {
    const d = state.date;
    state.date = AP_PRESEASON;
    releasePoll(state, "ap", "Preseason");
    state.date = d;
  }
  for (const g of gamesOn(state, date)) if (!c.results[g.id]) playGame(state, g, opts.quiet);
  const wd = weekday(date);
  if (wd === "Sunday" && date >= FIRST_POLL_SUNDAY && date <= SELECTION) {
    const lastWeek = COLLEGE_SCHEDULE.filter((g) => g.date < date && g.date >= addDays(date, -7) && g.week <= 14)[0];
    if (lastWeek) releasePoll(state, "ap", date === SELECTION ? "Final regular season" : `Week ${Math.min(15, lastWeek.week + 1)}`);
  }
  if (CFP_RANKING_DAYS.includes(date)) releasePoll(state, "cfp", `Ranking ${CFP_RANKING_DAYS.indexOf(date) + 1}`);
  if (date === addDays(CCG_DATE, -6)) scheduleChampionships(state);
  if (date === SELECTION) selectionDay(state, opts.quiet);
  if (date === QF_DAY) quarterfinals(state);
  if (date === SF_DAY) semifinals(state);
  if (date === FINAL_DAY) championship(state);
  if (date === FINAL_POLL) {
    releasePoll(state, "ap", "Final");
    const f = c.post.find((g) => g.kind === "cfpF");
    const r = f && c.results[f.id];
    if (f && r) c.champion = r[0] > r[1] ? f.away : f.home;
  }
  awardsDaily(state, opts.quiet);
}

// ---- Games ----

function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + gaussian(rng) * Math.sqrt(lambda)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function binomial(rng: Rng, n: number, p: number): number {
  let k = 0;
  const q = Math.max(0, Math.min(1, p));
  for (let i = 0; i < n; i++) if (rng() < q) k++;
  return k;
}

const PASS_TD_SHARE = { airRaid: 0.62, spreadRpo: 0.52, proStyle: 0.5, spreadOption: 0.4, flexbone: 0.2 };
const PASS_ATT = { airRaid: 41, spreadRpo: 33, proStyle: 31, spreadOption: 28, flexbone: 11 };
const RUSH_ATT = { airRaid: 31, spreadRpo: 37, proStyle: 36, spreadOption: 41, flexbone: 55 };

interface Side {
  team: string;
  pts: number;
  tds: number;
  fgs: number;
  xpMiss: number;
  passTd: number;
  rushTd: number;
  passAtt: number;
  cmp: number;
  passYds: number;
  ints: number;
  sacks: number;
}

function playGame(state: GameState, g: CollegeGame, quiet = false): void {
  const c = state.college!;
  const rng = rngFor(state.seed, seasonKey(`cfb:${g.id}`));
  const sA = teamStrength(state, g.away);
  const sH = teamStrength(state, g.home);
  const hfa = g.site ? 0 : 1.6;
  const expect = (us: number, them: number, home: number) => Math.max(4, 27.5 + (us - them) * 0.42 + home);
  const score = (e: number) => {
    const form = Math.exp(gaussian(rng) * 0.17);
    const tds = poisson(rng, (e * form * 0.83) / 7);
    const fgs = poisson(rng, Math.min(2.1, (e * form * 0.17) / 3));
    let xpMiss = 0;
    for (let i = 0; i < tds; i++) if (rng() < 0.04) xpMiss++;
    const safety = rng() < 0.03 ? 2 : 0;
    return { tds, fgs, xpMiss, pts: tds * 7 - xpMiss + fgs * 3 + safety };
  };
  const a = score(expect(sA, sH, -hfa));
  const h = score(expect(sH, sA, hfa));
  let ot = 0;
  while (a.pts === h.pts) {
    ot = 1;
    for (const s of rng() < 0.5 + (sH - sA) * 0.01 ? [h, a] : [a, h]) {
      const r = rng();
      if (r < 0.48) { s.pts += 7; s.tds++; } else if (r < 0.72) { s.pts += 3; s.fgs++; }
    }
  }
  c.results[g.id] = [a.pts, h.pts, ot];
  // Public view of each team moves with the margin against what was expected.
  const exp = (c.rating[g.home] - c.rating[g.away]) * 0.84 + hfa * 2;
  const delta = Math.max(-24, Math.min(24, h.pts - a.pts - exp));
  c.rating[g.home] = Math.round((c.rating[g.home] + 0.07 * delta + (h.pts > a.pts ? 0.3 : -0.3)) * 10) / 10;
  c.rating[g.away] = Math.round((c.rating[g.away] - 0.07 * delta + (a.pts > h.pts ? 0.3 : -0.3)) * 10) / 10;

  const away = offense(rng, g.away, sA - sH, a, h.pts);
  const home = offense(rng, g.home, sH - sA, h, a.pts);
  away.sacks = poisson(rng, Math.max(0.6, 2.3 + (sH - sA) * 0.035));
  home.sacks = poisson(rng, Math.max(0.6, 2.3 + (sA - sH) * 0.035));
  prospectLines(state, rng, g, away, home, sA - sH);
  prospectLines(state, rng, g, home, away, sH - sA);
  if (!quiet) gameNews(state, g, a.pts, h.pts, ot);
}

function offense(rng: Rng, team: string, edge: number, s: { tds: number; fgs: number; xpMiss: number; pts: number }, oppPts: number): Side {
  const style = COLLEGE_TEAM[team].offense;
  const passTd = binomial(rng, s.tds, PASS_TD_SHARE[style]);
  const behind = Math.max(-14, Math.min(14, oppPts - s.pts));
  const passAtt = Math.max(4, Math.round(PASS_ATT[style] + behind * 0.25 + gaussian(rng) * 5));
  const cmpPct = Math.max(0.4, Math.min(0.8, 0.61 + edge * 0.004 + gaussian(rng) * 0.05));
  const cmp = Math.round(passAtt * cmpPct);
  const ypa = Math.max(3.5, 5.5 + s.pts * 0.08 + edge * 0.02 + gaussian(rng) * 1.2);
  return {
    team, pts: s.pts, tds: s.tds, fgs: s.fgs, xpMiss: s.xpMiss, passTd, rushTd: s.tds - passTd,
    passAtt, cmp, passYds: Math.round(passAtt * ypa), ints: poisson(rng, passAtt * 0.022), sacks: 0,
  };
}

function healthy(state: GameState, id: string, date: string): boolean {
  const inj = state.college!.injuries[id];
  return !inj || inj.returnDate <= date;
}

/** Stat lines for the prospects on one team in one game. */
function prospectLines(state: GameState, rng: Rng, g: CollegeGame, us: Side, them: Side, edge: number): void {
  const c = state.college!;
  const dc = prospectsOf(state);
  const ids = (dc.bySchool[us.team] ?? []).filter((id) => healthy(state, id, g.date));
  if (!ids.length) return;
  const P = (id: string) => dc.byId[id];
  const H = (id: string) => dc.hidden[id];
  const lvl = (id: string) => (H(id).college - 70) / 10;
  const tr = (id: string, t: string) => ((H(id).traits[t] ?? H(id).overall) - H(id).overall) / 10;
  const out: Record<string, Record<string, number>> = {};
  const line = (id: string) => (out[id] ??= {});
  const byPos = (pos: Position[]) => ids.filter((id) => pos.includes(P(id).position));
  const starterAt = (pos: Position) => {
    const at = byPos([pos]).sort((a, b) => Number(P(b).starter) - Number(P(a).starter) || H(b).college - H(a).college);
    return at[0];
  };
  const style = COLLEGE_TEAM[us.team].offense;

  // Quarterback: the team's passing game, scaled by how good he is.
  const qb = starterAt("QB");
  let cmp = us.cmp;
  let passYds = us.passYds;
  if (qb) {
    const pct = Math.max(0.42, Math.min(0.82, us.cmp / us.passAtt + lvl(qb) * 0.035 + tr(qb, "accuracy") * 0.02));
    cmp = Math.round(us.passAtt * pct);
    passYds = Math.round(us.passYds * (1 + lvl(qb) * 0.07 + tr(qb, "arm") * 0.03));
    const ints = poisson(rng, us.passAtt * 0.022 * Math.max(0.3, 1 - lvl(qb) * 0.15 - tr(qb, "decisions") * 0.15));
    const mob = tr(qb, "mobility");
    const car = Math.max(0, Math.round(3 + mob * 3 + (style === "spreadOption" || style === "flexbone" ? 5 : 0) + gaussian(rng) * 2));
    const rushTd = binomial(rng, us.rushTd, 0.18 + mob * 0.08 + (style === "spreadOption" ? 0.12 : 0));
    us.rushTd -= rushTd;
    Object.assign(line(qb), {
      cmp, att: us.passAtt, passYds, passTd: us.passTd, int: ints, car,
      rushYds: Math.round(car * (3.2 + mob * 1.5 + gaussian(rng) * 2)), rushTd,
    });
    for (const b of byPos(["QB"]).filter((x) => x !== qb)) {
      if (Math.abs(us.pts - them.pts) >= 24) Object.assign(line(b), { cmp: 2 + Math.floor(rng() * 4), att: 5 + Math.floor(rng() * 4), passYds: 25 + Math.floor(rng() * 50), passTd: 0, int: 0, car: 1, rushYds: Math.floor(rng() * 8), rushTd: 0 });
    }
  }
  // Backs.
  const backs = byPos(["RB", "FB"]).sort((a, b) => H(b).college - H(a).college);
  const rushAtt = Math.max(15, Math.round(RUSH_ATT[style] + gaussian(rng) * 5 + (us.pts - them.pts) * 0.12));
  backs.forEach((id, i) => {
    const fb = P(id).position === "FB";
    const share = fb ? 0.05 : i === 0 ? 0.48 : 0.26;
    const car = Math.max(0, Math.round(rushAtt * share + gaussian(rng) * 2.5));
    const ypc = Math.max(1.5, 4.7 + lvl(id) * 0.6 + edge * 0.03 + tr(id, "vision") * 0.4 + gaussian(rng) * 1.3);
    const td = binomial(rng, us.rushTd, share * 1.15);
    us.rushTd -= td;
    Object.assign(line(id), { car, rushYds: Math.round(car * ypc), rushTd: td });
  });
  // Receivers: targets go to the better ones; the rest of the roster catches what's left.
  const catchers = byPos(["WR", "TE", "RB", "FB"]);
  let left = cmp;
  let tdLeft = us.passTd;
  const shares = catchers.map((id) => {
    const pos = P(id).position;
    const base = pos === "WR" ? 0.22 : pos === "TE" ? 0.13 : pos === "RB" ? 0.08 : 0.03;
    return [id, base * Math.max(0.4, 1 + lvl(id) * 0.25 + tr(id, pos === "TE" || pos === "RB" ? "receiving" : "routes") * 0.15)] as const;
  });
  const total = shares.reduce((s, [, w]) => s + w, 0);
  const scale = total > 0.75 ? 0.75 / total : 1;
  for (const [id, w] of shares) {
    const share = w * scale;
    const rec = Math.min(left, binomial(rng, cmp, share));
    left -= rec;
    const pos = P(id).position;
    const ypr = Math.max(4, (pos === "WR" ? 13.8 : pos === "TE" ? 11 : 7.5) + tr(id, "deep") * 1.5 + lvl(id) * 0.8 + gaussian(rng) * 3.5);
    const td = Math.min(tdLeft, binomial(rng, us.passTd, share * 1.15));
    tdLeft -= td;
    const l = line(id);
    l.rec = rec;
    l.recYds = Math.round(rec * ypr * (passYds / Math.max(1, us.passYds)));
    l.recTd = td;
    if (pos === "WR" && rng() < 0.12) {
      l.car = 1;
      l.rushYds = Math.round(4 + gaussian(rng) * 8);
    }
  }
  // Line.
  for (const id of byPos(["OT", "OG", "C"])) {
    const pb = tr(id, "passBlock") + lvl(id);
    Object.assign(line(id), { gs: 1, sacksAllowed: binomial(rng, us.sacks, Math.max(0.02, (P(id).position === "OT" ? 0.13 : 0.08) - pb * 0.03)) });
  }
  for (const id of byPos(["LS"])) line(id).gs = P(id).starter ? 1 : 0;
  // Defense: reacts to the other offense.
  const defenders = byPos(["EDGE", "IDL", "LB", "CB", "S"]);
  const TKL: Record<string, number> = { LB: 7, S: 5, CB: 3.2, EDGE: 2.6, IDL: 2.4 };
  const TFL: Record<string, number> = { EDGE: 0.45, IDL: 0.4, LB: 0.45, S: 0.15, CB: 0.08 };
  const RUSH: Record<string, number> = { EDGE: 0.24, IDL: 0.12, LB: 0.06, S: 0.02, CB: 0.01 };
  const COVER: Record<string, number> = { CB: 0.2, S: 0.17, LB: 0.06, EDGE: 0.01, IDL: 0.01 };
  const PD: Record<string, number> = { CB: 0.55, S: 0.35, LB: 0.18, EDGE: 0.08, IDL: 0.08 };
  let sacksLeft = them.sacks;
  let intLeft = them.ints;
  for (const id of defenders) {
    const pos = P(id).position;
    const q = Math.max(0.4, 1 + lvl(id) * 0.2);
    const rush = Math.max(0.2, 1 + (tr(id, "passRush") + tr(id, "blitz")) * 0.3 + lvl(id) * 0.2);
    const cover = Math.max(0.2, 1 + (tr(id, "coverage") + tr(id, "man") + tr(id, "zone") + tr(id, "range")) * 0.15 + lvl(id) * 0.2);
    const sacks = Math.min(sacksLeft, binomial(rng, them.sacks, RUSH[pos] * rush));
    sacksLeft -= sacks;
    const ints = Math.min(intLeft, binomial(rng, them.ints, COVER[pos] * cover));
    intLeft -= ints;
    const l = line(id);
    l.tkl = poisson(rng, TKL[pos] * q) + sacks;
    l.tfl = poisson(rng, TFL[pos] * q * (1 + tr(id, "runStop") * 0.2)) + sacks;
    l.sacks = sacks;
    l.ff = rng() < (pos === "EDGE" ? 0.07 : 0.03) * q ? 1 : 0;
    l.pd = poisson(rng, PD[pos] * cover) + ints;
    l.defInt = ints;
  }
  // Specialists.
  const k = starterAt("K");
  if (k) {
    const misses = poisson(rng, 0.35 * Math.max(0.3, 1 - tr(k, "kickAccuracy") * 0.3 - lvl(k) * 0.2));
    const long = us.fgs ? Math.min(58, Math.round(30 + rng() * 18 + tr(k, "kickPower") * 4)) : 0;
    Object.assign(line(k), { fgm: us.fgs, fga: us.fgs + misses, fgLong: long, xpm: us.tds - us.xpMiss, xpa: us.tds });
  }
  const p = starterAt("P");
  if (p) {
    const punts = poisson(rng, Math.max(1.2, 5.2 - us.tds * 0.45 - edge * 0.03));
    Object.assign(line(p), { punts, puntYds: Math.round(punts * (42.5 + tr(p, "kickPower") * 1.5 + lvl(p) * 0.8 + gaussian(rng) * 2)) });
  }
  // Pack the lines, move the hype, and check for injuries.
  for (const id of ids) {
    const l = out[id];
    if (!l) continue;
    const pos = P(id).position;
    (c.logs[id] ??= {})[g.id] = COLLEGE_STATS[pos].map((key) => Math.round(l[key] ?? 0));
    c.hype[id] = Math.round((c.hype[id] + (performance(pos, l) - 1) * 0.35) * 10) / 10;
    const risk = 0.011 * Math.max(0.4, 1 + (75 - H(id).durability) / 25);
    if (rng() < risk) {
      const seasonEnding = rng() < 0.15;
      const weeks = 1 + Math.floor(-Math.log(Math.max(1e-6, rng())) * 2.2);
      c.injuries[id] = {
        type: pickInjury(rng, seasonEnding), date: g.date, seasonEnding,
        returnDate: seasonEnding ? INJURY_RETURN : addDays(g.date, 7 * weeks - 1),
      };
    }
  }
}

const INJURIES = ["Ankle sprain", "Hamstring strain", "Knee sprain", "Shoulder injury", "Concussion", "Foot injury", "Hand injury", "Groin strain"];
const SEASON_ENDING = ["Torn ACL", "Broken leg", "Torn pectoral", "Achilles injury", "Season-ending knee injury"];

function pickInjury(rng: Rng, seasonEnding: boolean): string {
  const xs = seasonEnding ? SEASON_ENDING : INJURIES;
  return xs[Math.floor(rng() * xs.length)];
}

/** One game's production against a typical good game at the position (1 = a solid day). */
function performance(pos: Position, l: Record<string, number>): number {
  const v = (k: string) => l[k] ?? 0;
  switch (pos) {
    case "QB": return (v("passYds") / 25 + v("passTd") * 4 - v("int") * 2 + v("rushYds") / 10 + v("rushTd") * 6) / 20;
    case "RB": case "FB": return (v("rushYds") / 10 + v("rushTd") * 6 + v("recYds") / 10) / 12;
    case "WR": case "TE": return (v("recYds") / 10 + v("recTd") * 6 + v("rec") * 0.5) / (pos === "WR" ? 11 : 7);
    case "EDGE": case "IDL": return (v("sacks") * 6 + v("tfl") * 2.5 + v("tkl") * 0.6 + v("ff") * 4) / 6;
    case "LB": return (v("tkl") + v("tfl") * 2.5 + v("sacks") * 5 + v("defInt") * 6 + v("pd") * 2) / 10;
    case "CB": case "S": return (v("defInt") * 8 + v("pd") * 3 + v("tkl") * 0.6) / 5;
    default: return 1;
  }
}

function gameNews(state: GameState, g: CollegeGame, a: number, h: number, ot: number): void {
  const winner = a > h ? g.away : g.home;
  const loser = a > h ? g.home : g.away;
  const score = `${Math.max(a, h)}-${Math.min(a, h)}${ot ? " (OT)" : ""}`;
  const wr = rankOf(state, winner);
  const lr = rankOf(state, loser);
  const label = g.kind === "cfpF" ? "National championship" : g.kind?.startsWith("cfp") ? "College Football Playoff" : g.kind === "ccg" ? g.name : g.kind === "bowl" ? g.name : null;
  if (label) news(state, `CFB · ${label}: ${rankedName(state, winner)} beats ${rankedName(state, loser)}, ${score}`);
  else if (lr && lr <= 10 && (!wr || wr > lr + 5)) news(state, `CFB · Upset: ${rankedName(state, winner)} knocks off ${rankedName(state, loser)}, ${score}`);
}

// ---- Postseason ----

const CCG_SITES: Partial<Record<CollegeConference, [string, string]>> = {
  SEC: ["Mercedes-Benz Stadium", "Atlanta, GA"], B1G: ["Lucas Oil Stadium", "Indianapolis, IN"],
  B12: ["AT&T Stadium", "Arlington, TX"], ACC: ["Bank of America Stadium", "Charlotte, NC"],
  MAC: ["Ford Field", "Detroit, MI"], P12: ["Allegiant Stadium", "Las Vegas, NV"],
};

function scheduleChampionships(state: GameState): void {
  const c = state.college!;
  if (c.post.some((g) => g.kind === "ccg")) return;
  for (const conf of Object.keys(CONFERENCES) as CollegeConference[]) {
    if (conf === "IND") continue;
    const [one, two] = conferenceStandings(state, conf);
    const site = CCG_SITES[conf];
    c.post.push({
      id: `ccg-${conf}`, week: 14, date: CCG_DATE, away: two.team, home: one.team, conference: false, kind: "ccg",
      name: `${CONFERENCES[conf].name} Championship`, ...(site ? { site: site[0], city: site[1] } : {}),
    });
  }
}

/** Conference champions, once the title games are played. */
export function conferenceChampions(state: GameState): Partial<Record<CollegeConference, string>> {
  const c = state.college!;
  const out: Partial<Record<CollegeConference, string>> = {};
  for (const g of c.post.filter((x) => x.kind === "ccg")) {
    const r = c.results[g.id];
    if (r) out[g.id.slice(4) as CollegeConference] = r[0] > r[1] ? g.away : g.home;
  }
  return out;
}

function selectionDay(state: GameState, quiet = false): void {
  const c = state.college!;
  if (c.cfpField) return;
  const final = releasePoll(state, "cfp", "Final ranking");
  const order = COLLEGE_TEAMS.map((t) => t.id).sort((a, b) => pollScore(state, b, true) - pollScore(state, a, true));
  const champs = Object.values(conferenceChampions(state));
  const autos = order.filter((t) => champs.includes(t)).slice(0, 5);
  const field = [...autos];
  for (const t of order) {
    if (field.length >= 12) break;
    if (!field.includes(t)) field.push(t);
  }
  field.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  c.cfpField = field;
  CFP.firstRound.forEach((date, i) => {
    const hi = 4 + i;
    const lo = 11 - i;
    c.post.push({ id: `cfp1-${i}`, week: 16, date, away: field[lo], home: field[hi], conference: false, kind: "cfp1", name: "CFP First Round", seeds: [lo + 1, hi + 1] });
  });
  // Bowl season for everyone else with six wins, best teams in the best bowls.
  const recs = collegeRecords(state);
  // The academies are still to play Army-Navy, so five wins is enough for them.
  const eligible = order.filter((t) => !field.includes(t) && recs[t].w >= (t === "ARMY" || t === "NAVY" ? 5 : 6));
  const bowls = [...BOWLS].reverse();
  const count = Math.min(bowls.length, Math.floor(eligible.length / 2));
  const pool = eligible.slice(0, count * 2);
  const rng = rngFor(state.seed, seasonKey("cfb-bowls"));
  for (let i = 0; i < count; i++) {
    const a = pool.shift()!;
    // Avoid conference rematches when the next few teams allow it.
    let j = pool.findIndex((b, k) => k < 4 && COLLEGE_TEAM[b].conference !== COLLEGE_TEAM[a].conference && !recs[a].opps.includes(b));
    if (j < 0) j = 0;
    const b = pool.splice(j, 1)[0];
    const [name, date, city] = bowls[i];
    const [away, home] = rng() < 0.5 ? [a, b] : [b, a];
    c.post.push({ id: `bowl-${i}`, week: 17, date, away, home, conference: false, kind: "bowl", name, site: name, city });
  }
  if (!quiet) {
    news(state, `CFB · Playoff field set: ${field.map((t, i) => `${i + 1}. ${schoolName(t)}`).join(", ")}`);
    void final;
  }
}

function winnerOf(state: GameState, id: string): string | undefined {
  const g = state.college!.post.find((x) => x.id === id);
  const r = g && state.college!.results[g.id];
  return g && r ? (r[0] > r[1] ? g.away : g.home) : undefined;
}

function quarterfinals(state: GameState): void {
  const c = state.college!;
  if (!c.cfpField || c.post.some((g) => g.kind === "cfpQF")) return;
  const f = c.cfpField;
  // Seed 1 meets the 8/9 winner, 2 the 7/10 winner, 3 the 6/11 winner, 4 the 5/12 winner.
  const pairs: [number, string][] = [[0, "cfp1-3"], [1, "cfp1-2"], [2, "cfp1-1"], [3, "cfp1-0"]];
  const bowlFor = [2, 1, 3, 0]; // Rose, Peach, Cotton, Fiesta
  pairs.forEach(([seed, from], i) => {
    const opp = winnerOf(state, from)!;
    const [name, date, city] = CFP.quarterfinals[bowlFor[i]];
    c.post.push({ id: `cfpQF-${i}`, week: 18, date, away: opp, home: f[seed], conference: false, kind: "cfpQF", name: `${name} (CFP Quarterfinal)`, site: name, city, seeds: [f.indexOf(opp) + 1, seed + 1] });
  });
}

function semifinals(state: GameState): void {
  const c = state.college!;
  if (c.post.some((g) => g.kind === "cfpSF")) return;
  const seed = (t: string) => c.cfpField!.indexOf(t) + 1;
  const games: [string, string][] = [["cfpQF-0", "cfpQF-3"], ["cfpQF-1", "cfpQF-2"]];
  games.forEach(([x, y], i) => {
    const a = winnerOf(state, x)!;
    const b = winnerOf(state, y)!;
    const [hi, lo] = seed(a) < seed(b) ? [a, b] : [b, a];
    const [name, date, city] = CFP.semifinals[i];
    c.post.push({ id: `cfpSF-${i}`, week: 19, date, away: lo, home: hi, conference: false, kind: "cfpSF", name: `${name} (CFP Semifinal)`, site: name, city, seeds: [seed(lo), seed(hi)] });
  });
}

function championship(state: GameState): void {
  const c = state.college!;
  if (c.post.some((g) => g.kind === "cfpF")) return;
  const a = winnerOf(state, "cfpSF-0")!;
  const b = winnerOf(state, "cfpSF-1")!;
  const seed = (t: string) => c.cfpField!.indexOf(t) + 1;
  const [hi, lo] = seed(a) < seed(b) ? [a, b] : [b, a];
  const [name, date, city] = CFP.final;
  c.post.push({ id: "cfpF", week: 20, date, away: lo, home: hi, conference: false, kind: "cfpF", name, site: "Allegiant Stadium", city, seeds: [seed(lo), seed(hi)] });
}

// ---- Prospect stats ----

/** A prospect's game-by-game log, in date order. */
export function prospectLog(state: GameState, id: string): CollegeLogRow[] {
  const c = state.college;
  if (!c) return [];
  const p = prospectsOf(state).byId[id];
  const logs = c.logs[id] ?? {};
  return collegeGames(state)
    .filter((g) => (g.away === p.school || g.home === p.school) && c.results[g.id])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => {
      const home = g.home === p.school;
      const [as, hs, ot] = c.results[g.id];
      const us = home ? hs : as;
      const them = home ? as : hs;
      const row = logs[g.id];
      return {
        game: g, opp: home ? g.away : g.home, home,
        result: `${us > them ? "W" : "L"} ${us}-${them}${ot ? " (OT)" : ""}`,
        line: row ? unpackLine(p.position, row) : {},
      };
    });
}

/** Season totals for one prospect (empty if he hasn't played). */
export function prospectTotals(state: GameState, id: string): Record<string, number> & { g: number } {
  const p = prospectsOf(state).byId[id];
  const out: Record<string, number> & { g: number } = { g: 0 };
  for (const row of Object.values(state.college?.logs[id] ?? {})) {
    out.g++;
    COLLEGE_STATS[p.position].forEach((k, i) => {
      out[k] = MAX_KEYS.has(k) ? Math.max(out[k] ?? 0, row[i]) : (out[k] ?? 0) + row[i];
    });
  }
  return out;
}

/** The handful of numbers a scout would quote. */
export function prospectLine(p: Prospect, t: Record<string, number> & { g: number }): string {
  const v = (k: string) => t[k] ?? 0;
  const f = (x: number) => x.toLocaleString("en-US");
  if (!t.g) return "Hasn't played";
  switch (p.position) {
    case "QB": return v("att") ? `${v("cmp")}/${v("att")}, ${f(v("passYds"))} yds, ${v("passTd")} TD, ${v("int")} INT · ${f(v("rushYds"))} rush yds` : `${t.g} games, no attempts`;
    case "RB": case "FB": return `${v("car")} car, ${f(v("rushYds"))} yds, ${v("rushTd")} TD · ${v("rec")} rec, ${v("recYds")} yds`;
    case "WR": case "TE": return `${v("rec")} rec, ${f(v("recYds"))} yds, ${v("recTd")} TD`;
    case "OT": case "OG": case "C": return `${v("gs")} starts, ${v("sacksAllowed")} sacks allowed`;
    case "EDGE": case "IDL": return `${v("tkl")} tkl, ${v("tfl")} TFL, ${v("sacks")} sacks, ${v("ff")} FF`;
    case "LB": return `${v("tkl")} tkl, ${v("tfl")} TFL, ${v("sacks")} sacks, ${v("defInt")} INT`;
    case "CB": case "S": return `${v("tkl")} tkl, ${v("defInt")} INT, ${v("pd")} PD`;
    case "K": return `${v("fgm")}/${v("fga")} FG, long ${v("fgLong")} · ${v("xpm")}/${v("xpa")} XP`;
    case "P": return v("punts") ? `${v("punts")} punts, ${(v("puntYds") / v("punts")).toFixed(1)} avg` : "No punts";
    default: return `${t.g} games`;
  }
}

/** The media's big board: prospects by buzz, best first. */
export function mediaBoard(state: GameState): string[] {
  const hype = state.college!.hype;
  // Underclassmen who go back to school drop off the boards.
  const back = new Set(state.draft?.returned ?? []);
  return Object.keys(hype).filter((id) => !back.has(id)).sort((a, b) => hype[b] - hype[a]);
}

const boardCache = new WeakMap<object, { key: string; ranks: Record<string, number> }>();

export function mediaRank(state: GameState, id: string): number {
  const c = state.college!;
  const key = `${Object.keys(c.results).length}:${state.draft?.returned?.length ?? 0}:${state.draft?.combine ? 1 : 0}`;
  let hit = boardCache.get(c.hype);
  if (!hit || hit.key !== key) {
    hit = { key, ranks: Object.fromEntries(mediaBoard(state).map((x, i) => [x, i + 1])) };
    boardCache.set(c.hype, hit);
  }
  return hit.ranks[id] ?? 999;
}

export function injuryNote(state: GameState, id: string): string | null {
  const inj = state.college?.injuries[id];
  if (!inj || inj.returnDate <= state.date) return null;
  return inj.seasonEnding ? `${inj.type}: out for the season` : `${inj.type}: out, expected back around ${new Date(inj.returnDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

// ---- Awards ----

export interface AwardDef {
  id: string;
  name: string;
  what: string;
  positions: Position[];
}

export const AWARDS: AwardDef[] = [
  { id: "heisman", name: "Heisman Trophy", what: "Most outstanding player", positions: ["QB", "RB", "WR", "TE"] },
  { id: "maxwell", name: "Maxwell Award", what: "Player of the year", positions: ["QB", "RB", "WR", "TE"] },
  { id: "obrien", name: "Davey O'Brien Award", what: "Best quarterback", positions: ["QB"] },
  { id: "walker", name: "Doak Walker Award", what: "Best running back", positions: ["RB"] },
  { id: "biletnikoff", name: "Biletnikoff Award", what: "Best receiver", positions: ["WR", "TE"] },
  { id: "mackey", name: "John Mackey Award", what: "Best tight end", positions: ["TE"] },
  { id: "outland", name: "Outland Trophy", what: "Best interior lineman", positions: ["OT", "OG", "C", "IDL"] },
  { id: "rimington", name: "Rimington Trophy", what: "Best center", positions: ["C"] },
  { id: "nagurski", name: "Bronko Nagurski Trophy", what: "Best defensive player", positions: ["EDGE", "IDL", "LB", "CB", "S"] },
  { id: "bednarik", name: "Chuck Bednarik Award", what: "Defensive player of the year", positions: ["EDGE", "IDL", "LB", "CB", "S"] },
  { id: "hendricks", name: "Ted Hendricks Award", what: "Best defensive end", positions: ["EDGE"] },
  { id: "butkus", name: "Butkus Award", what: "Best linebacker", positions: ["LB"] },
  { id: "thorpe", name: "Jim Thorpe Award", what: "Best defensive back", positions: ["CB", "S"] },
  { id: "groza", name: "Lou Groza Award", what: "Best kicker", positions: ["K"] },
  { id: "guy", name: "Ray Guy Award", what: "Best punter", positions: ["P"] },
];

/** How strong a prospect's case is for an award right now (stats, team success, buzz). */
export function awardScore(state: GameState, id: string, award: AwardDef): number {
  const dc = prospectsOf(state);
  const p = dc.byId[id];
  const t = prospectTotals(state, id);
  const v = (k: string) => t[k] ?? 0;
  const rec = collegeRecords(state)[p.school];
  const rank = rankOf(state, p.school);
  const team = rec.w * 2 - rec.l * 2 + (rank ? (26 - rank) * 0.8 : 0);
  const hype = state.college!.hype[id] ?? 0;
  let stats = 0;
  switch (p.position) {
    case "QB": stats = v("passYds") / 25 + v("passTd") * 4 - v("int") * 2 + v("rushYds") / 10 + v("rushTd") * 6; break;
    case "RB": case "FB": stats = v("rushYds") / 10 + v("rushTd") * 6 + v("recYds") / 10 + v("recTd") * 6; break;
    case "WR": case "TE": stats = v("recYds") / 10 + v("recTd") * 6 + v("rec") * 0.5; break;
    case "EDGE": case "IDL": stats = v("sacks") * 6 + v("tfl") * 2.5 + v("tkl") * 0.6 + v("ff") * 4 + (p.position === "IDL" ? 15 : 0); break;
    case "LB": stats = v("tkl") + v("tfl") * 2.5 + v("sacks") * 5 + v("defInt") * 6 + v("pd") * 2; break;
    case "CB": case "S": stats = v("defInt") * 8 + v("pd") * 3 + v("tkl") * 0.6 + 20; break;
    case "OT": case "OG": case "C": stats = v("gs") * 6 - v("sacksAllowed") * 4 + 20; break;
    case "K": stats = v("fgm") * 3 - (v("fga") - v("fgm")) * 4 + v("fgLong") / 4; break;
    case "P": stats = v("punts") ? (v("puntYds") / v("punts") - 38) * 10 : 0; break;
    default: stats = 0;
  }
  const teamWeight = award.id === "heisman" || award.id === "maxwell" ? 1.6 : 0.7;
  return stats + team * teamWeight + hype * (state.date < COLLEGE_DATES.week0 ? 3 : 1);
}

/** Preseason watch list: the most talked-about candidates at the positions, before a snap. */
export function watchList(state: GameState, award: AwardDef): string[] {
  const dc = prospectsOf(state);
  const size = award.id === "heisman" ? 12 : award.positions.length === 1 ? 20 : 30;
  return dc.prospects
    .filter((p) => award.positions.includes(p.position) && p.starter)
    .map((p) => p.id)
    .sort((a, b) => preseasonHype(state, b) - preseasonHype(state, a))
    .slice(0, size);
}

function preseasonHype(state: GameState, id: string): number {
  const h = draftClass(state.seed).hidden[id];
  return h.value + gaussian(rngFor(state.seed, `hype:${id}`)) * 5;
}

/** The current leaders for an award. */
export function awardRace(state: GameState, award: AwardDef, n = 10): string[] {
  const dc = prospectsOf(state);
  return dc.prospects
    .filter((p) => award.positions.includes(p.position))
    .map((p) => [p.id, awardScore(state, p.id, award)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

function awardsDaily(state: GameState, quiet = false): void {
  const c = state.college!;
  const d = state.date;
  for (const a of AWARDS) {
    const st = (c.awards[a.id] ??= {});
    const single = a.positions.length === 1;
    if (d === COLLEGE_DATES.semifinalists && !st.semifinalists && a.id !== "heisman") st.semifinalists = awardRace(state, a, single ? 8 : 10);
    if (d === COLLEGE_DATES.finalists && !st.finalists) st.finalists = awardRace(state, a, a.id === "heisman" ? 4 : 3);
    const winDay = a.id === "heisman" ? COLLEGE_DATES.heisman : COLLEGE_DATES.awards;
    if (d === winDay && !st.winner) {
      const finalists = st.finalists ?? awardRace(state, a, 3);
      st.winner = finalists.map((id) => [id, awardScore(state, id, a)] as const).sort((x, y) => y[1] - x[1])[0]?.[0];
      if (!quiet && st.winner && (a.id === "heisman" || a.id === "maxwell" || a.id === "bednarik")) {
        const p = prospectsOf(state).byId[st.winner];
        news(state, `CFB · ${schoolName(p.school)} ${p.position} ${p.name} wins the ${a.name}`);
      }
    }
  }
}

/** Short label of the college calendar for the scoreboard. */
export function collegePhase(state: GameState): string {
  const d = state.date;
  if (d < COLLEGE_DATES.week0) return "College: preseason camps";
  if (d <= CCG_DATE) {
    const next = COLLEGE_SCHEDULE.find((g) => g.date >= d && g.week <= 14);
    return next ? `College: Week ${next.week}` : "College: regular season";
  }
  if (d < FINAL_POLL) return "College: bowl season and playoff";
  return "College: draft season";
}

/** Weeks with games for the schedule picker: [week, label, Saturday]. */
export function collegeWeeks(state: GameState): { week: number; label: string; dates: string[] }[] {
  const out = new Map<number, { week: number; label: string; dates: Set<string> }>();
  for (const g of collegeGames(state)) {
    const label = g.week <= 13 ? `Week ${g.week}` : g.week === 14 ? "Championships" : g.week === 15 ? "Army-Navy" : g.week === 16 ? "CFP First Round" : g.week === 17 ? "Bowls" : g.week === 18 ? "CFP Quarterfinals" : g.week === 19 ? "CFP Semifinals" : "National Championship";
    const e = out.get(g.week) ?? { week: g.week, label, dates: new Set<string>() };
    e.dates.add(g.date);
    out.set(g.week, e);
  }
  return [...out.values()].sort((a, b) => a.week - b.week).map((e) => ({ week: e.week, label: e.label, dates: [...e.dates].sort() }));
}

export { COLLEGE_TEAMS, COLLEGE_TEAM, CONFERENCES, schoolName };
