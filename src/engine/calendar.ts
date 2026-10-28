// The league calendar for any season: key dates set by the NFL's rules and
// customs, and the schedule. 2026 is the real calendar from the data; later
// seasons follow the same rules, and their schedules are built the way the
// league builds them: the division rotation, same-place games from last
// season's standings, the 17th game, byes, prime time and the international
// series.
import { addDays, daysBetween, weekday } from "./dates";
import { NFL_HQ, miles } from "./collegeData";
import { BASE_KEY_DATES, BASE_SCHEDULE, BASE_SEASON, TEAMS, TEAM_BY_ID } from "./league";
import { makeRng, type Rng } from "./rng";
import type { ScheduledGame } from "./types";

function dayOfWeek(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

/** The first `dow` (0 = Sunday) on or after a date. */
function onOrAfter(iso: string, dow: number): string {
  return addDays(iso, (dow - dayOfWeek(iso) + 7) % 7);
}

/** Opening night: the Thursday after Labor Day (the first Monday of September). */
export function kickoffDate(season: number): string {
  if (season === BASE_SEASON) return BASE_KEY_DATES.regularSeasonStart;
  const laborDay = onOrAfter(`${season}-09-01`, 1);
  return addDays(laborDay, 3);
}

/** The new league year opens on the second Wednesday of March. */
export function newLeagueYearDate(year: number): string {
  if (year === BASE_SEASON + 1) return BASE_KEY_DATES.newLeagueYear;
  return addDays(onOrAfter(`${year}-03-01`, 3), 7);
}

/** The draft starts on the last Thursday of April. */
function draftDate(year: number): string {
  return onOrAfter(`${year}-04-24`, 4);
}

const keyCache = new Map<number, Record<string, string>>();

/**
 * Key dates of one season, from the Hall of Fame Game to the next spring's
 * draft. The 2026 dates are the league's; later ones follow the same rules.
 */
export function keyDatesFor(season: number): Record<string, string> {
  if (season === BASE_SEASON) return { ...BASE_KEY_DATES };
  const hit = keyCache.get(season);
  if (hit) return { ...hit };
  const k = kickoffDate(season);
  const end = addDays(k, 7 * 17 + 3);
  const wc = addDays(end, 6);
  const conf = addDays(wc, 15);
  const nly = newLeagueYearDate(season + 1);
  let extension = `${season}-07-15`;
  if (dayOfWeek(extension) === 6) extension = addDays(extension, 2);
  else if (dayOfWeek(extension) === 0) extension = addDays(extension, 1);
  const cutdown = addDays(k, -9);
  const deadline = addDays(k, 61);
  const dates: Record<string, string> = {
    franchiseTagExtensionDeadline: extension,
    hallOfFameGame: addDays(k, -35),
    rosterCutdown: cutdown,
    cutdownWaiversExpire: addDays(cutdown, 1),
    practiceSquadSigningOpens: addDays(cutdown, 1),
    regularSeasonStart: k,
    waiverOrderByStandings: addDays(k, 19),
    tradeDeadline: deadline,
    veteranWaiversBegin: addDays(deadline, 1),
    unsignedTenderDeadline: addDays(deadline, 7),
    regularSeasonEnd: end,
    reserveFutureSigningsOpen: addDays(end, 1),
    postseasonRosterFreeze: addDays(end, 3),
    wildCardWeekend: wc,
    divisionalRound: addDays(wc, 7),
    conferenceChampionships: conf,
    superBowl: addDays(conf, 14),
    franchiseTagWindowOpens: addDays(nly, -22),
    scoutingCombineStart: addDays(nly, -10),
    franchiseTagDeadline: addDays(nly, -8),
    negotiatingWindowOpens: addDays(nly, -2),
    newLeagueYear: nly,
    annualLeagueMeeting: onOrAfter(addDays(nly, 10), 0),
    draftStart: draftDate(season + 1),
  };
  keyCache.set(season, dates);
  return { ...dates };
}

// ---- The Super Bowl ----

const ROMAN: [number, string][] = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** "Super Bowl LXI" for the 2026 season. */
export function superBowlName(season: number): string {
  return `Super Bowl ${roman(season - 1965)}`;
}

/** Host sites: the 2027 season's game is awarded to Atlanta; after that the usual warm-weather and domed rotation. */
const SB_SITES: [stadium: string, city: string, team: string][] = [
  ["Mercedes-Benz Stadium", "Atlanta, GA", "ATL"],
  ["Caesars Superdome", "New Orleans, LA", "NO"],
  ["Allegiant Stadium", "Las Vegas, NV", "LV"],
  ["Hard Rock Stadium", "Miami Gardens, FL", "MIA"],
  ["NRG Stadium", "Houston, TX", "HOU"],
  ["State Farm Stadium", "Glendale, AZ", "ARI"],
  ["AT&T Stadium", "Arlington, TX", "DAL"],
  ["Raymond James Stadium", "Tampa, FL", "TB"],
  ["Levi's Stadium", "Santa Clara, CA", "SF"],
  ["U.S. Bank Stadium", "Minneapolis, MN", "MIN"],
  ["SoFi Stadium", "Inglewood, CA", "LA"],
  ["Lucas Oil Stadium", "Indianapolis, IN", "IND"],
];

export function superBowlSite(season: number): { stadium: string; city: string } {
  if (season === BASE_SEASON) {
    const sb = BASE_SCHEDULE.find((g) => g.round === "SB")!;
    return { stadium: sb.stadium!, city: sb.city! };
  }
  const [stadium, city] = SB_SITES[(season - BASE_SEASON - 1) % SB_SITES.length];
  return { stadium, city };
}

// ---- Building a schedule ----

type Div = "East" | "North" | "South" | "West";
const DIVS: Div[] = ["East", "North", "South", "West"];

/**
 * Same-conference division pairings repeat every three years (2026: East-West
 * and North-South), cross-conference ones every four (2026: AFC East-NFC
 * North, North-South, South-East, West-West).
 */
function intraPartner(season: number, d: Div): Div {
  const cycle: Record<Div, Div>[] = [
    { East: "West", West: "East", North: "South", South: "North" },
    { East: "South", South: "East", North: "West", West: "North" },
    { East: "North", North: "East", South: "West", West: "South" },
  ];
  return cycle[(((season - BASE_SEASON) % 3) + 3) % 3][d];
}

function interPartner(season: number, afc: Div): Div {
  // AFC division -> NFC division, starting from 2026.
  const cycle: Record<Div, Div>[] = [
    { East: "North", North: "South", South: "East", West: "West" },
    { East: "East", North: "West", South: "South", West: "North" },
    { East: "West", North: "East", South: "North", West: "South" },
    { East: "South", North: "North", South: "West", West: "East" },
  ];
  return cycle[(((season - BASE_SEASON) % 4) + 4) % 4][afc];
}

function divTeams(conf: "AFC" | "NFC", div: Div): string[] {
  return TEAMS.filter((t) => t.conference === conf && t.division === div).map((t) => t.id);
}

interface Pairing { away: string; home: string; division: boolean }

/**
 * Every team's 17 opponents for a season. `place` is each team's finish in its
 * division last season (1-4), which sets the same-place games.
 */
export function seasonPairings(season: number, place: Record<string, number>): Pairing[] {
  const games: Pairing[] = [];
  const add = (home: string, away: string, division = false) => games.push({ home, away, division });
  const byPlace = (conf: "AFC" | "NFC", div: Div, p: number) => divTeams(conf, div).find((t) => place[t] === p)!;
  for (const conf of ["AFC", "NFC"] as const) {
    for (const div of DIVS) {
      const teams = divTeams(conf, div);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        add(teams[i], teams[j], true);
        add(teams[j], teams[i], true);
      }
    }
    // Same conference: the paired division, four games each, two at home.
    const done = new Set<Div>();
    for (const div of DIVS) {
      const other = intraPartner(season, div);
      if (done.has(div)) continue;
      done.add(div).add(other);
      const a = divTeams(conf, div);
      const b = divTeams(conf, other);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if ((i + j + season) % 2 === 0) add(a[i], b[j]);
        else add(b[j], a[i]);
      }
    }
    // Same-place games against the two other divisions: one at home, one away, in a cycle.
    const d0 = DIVS[0];
    const p0 = intraPartner(season, d0);
    const rest = DIVS.filter((d) => d !== d0 && d !== p0);
    const e = rest[0];
    const e2 = rest[1];
    // Hosts: d0 -> e -> p0 -> e2 -> d0 (flipped in alternate years).
    const ring: [Div, Div][] = [[d0, e], [e, p0], [p0, e2], [e2, d0]];
    for (const [h0, a0] of ring) {
      const [h, a] = season % 2 === 0 ? [h0, a0] : [a0, h0];
      for (let p = 1; p <= 4; p++) add(byPlace(conf, h, p), byPlace(conf, a, p));
    }
  }
  // Cross conference: four against the paired division, and the 17th game
  // against the same-place team from the division played two years ago. The
  // AFC hosts the 17th game in odd years.
  for (const div of DIVS) {
    const nfc = interPartner(season, div);
    const a = divTeams("AFC", div);
    const b = divTeams("NFC", nfc);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if ((i + j + season) % 2 === 1) add(a[i], b[j]);
      else add(b[j], a[i]);
    }
    const seventeenth = interPartner(season - 2, div);
    for (let p = 1; p <= 4; p++) {
      const x = byPlace("AFC", div, p);
      const y = byPlace("NFC", seventeenth, p);
      if (season % 2 === 1) add(x, y);
      else add(y, x);
    }
  }
  return games;
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Puts each pairing in a week (1-18). Week 18 is all division games; byes fall in weeks 5-14. */
function assignWeeks(rng: Rng, games: Pairing[], mustHome: Record<number, string[]>): number[][] | null {
  const teams = TEAMS.map((t) => t.id);
  const byeCounts = shuffle(rng, [2, 4, 4, 2, 4, 4, 2, 4, 4, 2]);
  const bye: Record<string, number> = {};
  // Teams with a home game they have to play in a given week don't get that week off.
  const blocked = (t: string, w: number) => (mustHome[w] ?? []).includes(t);
  const order = shuffle(rng, teams);
  const slots: number[] = [];
  byeCounts.forEach((n, i) => { for (let j = 0; j < n; j++) slots.push(5 + i); });
  for (const t of order) {
    const i = slots.findIndex((w) => !blocked(t, w));
    if (i < 0) return null;
    bye[t] = slots.splice(i, 1)[0];
  }
  const left = new Set(games.map((_, i) => i));
  const weeks: number[][] = Array.from({ length: 19 }, () => []);
  // Week 18: every division plays two of its own games.
  for (const conf of ["AFC", "NFC"] as const) {
    for (const div of DIVS) {
      const t = divTeams(conf, div);
      const matchings = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
      const m = matchings[Math.floor(rng() * 3)];
      for (const [x, y] of m) {
        const options = [...left].filter((i) => games[i].division && ((games[i].home === t[x] && games[i].away === t[y]) || (games[i].home === t[y] && games[i].away === t[x])));
        const pick = options[Math.floor(rng() * options.length)];
        weeks[18].push(pick);
        left.delete(pick);
      }
    }
  }
  const lastPlayed: Record<string, number> = {};
  for (let w = 1; w <= 17; w++) {
    const avail = teams.filter((t) => bye[t] !== w);
    const remaining = [...left];
    const options: Record<string, number[]> = {};
    for (const t of avail) options[t] = [];
    const homeOnly = new Set(mustHome[w] ?? []);
    for (const i of remaining) {
      const g = games[i];
      if (homeOnly.has(g.away)) continue;
      if (options[g.home] && options[g.away]) {
        options[g.home].push(i);
        options[g.away].push(i);
      }
    }
    const used = new Set<string>();
    const chosen: number[] = [];
    let steps = 0;
    const solve = (): boolean => {
      if (++steps > 4000) return false;
      // The team with the fewest choices goes first.
      let best: string | null = null;
      let bestN = Infinity;
      for (const t of avail) {
        if (used.has(t)) continue;
        const n = options[t].filter((i) => !used.has(games[i].home) && !used.has(games[i].away)).length;
        if (n < bestN) { bestN = n; best = t; }
      }
      if (!best) return true;
      if (bestN === 0) return false;
      const cands = shuffle(rng, options[best].filter((i) => !used.has(games[i].home) && !used.has(games[i].away)));
      // Rematches close together are a last resort.
      cands.sort((a, b) => recent(a) - recent(b));
      for (const i of cands) {
        const g = games[i];
        used.add(g.home).add(g.away);
        chosen.push(i);
        if (solve()) return true;
        chosen.pop();
        used.delete(g.home);
        used.delete(g.away);
      }
      return false;
    };
    const recent = (i: number) => {
      const g = games[i];
      const key = [g.home, g.away].sort().join("-");
      return lastPlayed[key] !== undefined && w - lastPlayed[key] < 4 ? 1 : 0;
    };
    if (!solve()) return null;
    for (const i of chosen) {
      left.delete(i);
      lastPlayed[[games[i].home, games[i].away].sort().join("-")] = w;
    }
    weeks[w] = chosen;
  }
  return left.size ? null : weeks;
}

const INTL_SITES: [stadium: string, city: string, time: string][] = [
  ["Tottenham Hotspur Stadium", "London, England", "09:30"],
  ["Wembley Stadium", "London, England", "09:30"],
  ["Tottenham Hotspur Stadium", "London, England", "09:30"],
  ["Allianz Arena", "Munich, Germany", "09:30"],
  ["Estadio Banorte", "Mexico City, Mexico", "16:25"],
  ["Neo Quimica Arena", "Sao Paulo, Brazil", "20:20"],
  ["Santiago Bernabeu", "Madrid, Spain", "09:30"],
  ["Stade de France", "Paris, France", "09:30"],
  ["Croke Park", "Dublin, Ireland", "09:30"],
  ["Melbourne Cricket Ground", "Melbourne, Australia", "20:35"],
];

/** The fourth Thursday of November. */
function thanksgiving(season: number): string {
  return addDays(onOrAfter(`${season}-11-01`, 4), 21);
}

function homeStadium(home: string): Pick<ScheduledGame, "stadium"> & { stadiumId: string; roof: string; surface: string } {
  const t = TEAM_BY_ID[home];
  return { stadium: t.stadium, stadiumId: t.stadiumId, roof: t.roof, surface: t.surface };
}

const SHARED: string[][] = [["NYG", "NYJ"], ["LA", "LAC"]];

/**
 * The regular season, the preseason and the playoff slots for a season after
 * 2026. `place` is last season's division finish; `champion` hosts the opener.
 */
export function buildSchedule(season: number, seed: number, place: Record<string, number>, champion?: string): ScheduledGame[] {
  const rng = makeRng(seed ^ (season * 7919));
  const pairs = seasonPairings(season, place);
  const kickoff = kickoffDate(season);
  const sunday1 = addDays(kickoff, 3);
  const turkey = thanksgiving(season);
  const turkeyWeek = (daysBetween(addDays(sunday1, -3), turkey) / 7) + 1;
  const mustHome: Record<number, string[]> = { [turkeyWeek]: ["DET", "DAL"] };
  if (champion) mustHome[1] = [champion];
  let weeks: number[][] | null = null;
  for (let tries = 0; tries < 80 && !weeks; tries++) weeks = assignWeeks(rng, pairs, mustHome);
  if (!weeks) throw new Error(`Could not build the ${season} schedule`);
  const christmas = `${season}-12-25`;
  const out: ScheduledGame[] = [];
  // International games: spread over weeks 1-14, never in a team's bye week (they can't be anyway).
  const intlCount = 7 + Math.floor(rng() * 3);
  const intlWeeks = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).slice(0, intlCount).sort((a, b) => a - b);
  const intlSites = shuffle(rng, INTL_SITES.slice(3)).slice(0, intlCount - 3);
  const sites = shuffle(rng, [...INTL_SITES.slice(0, 3), ...intlSites]);
  const hostedAbroad = new Set<string>();
  for (let w = 1; w <= 18; w++) {
    const sunday = addDays(sunday1, 7 * (w - 1));
    const games = shuffle(rng, weeks[w].map((i) => pairs[i]));
    const slots: { date: string; time: string; abroad?: [string, string] }[] = [];
    if (w === 18) {
      slots.push({ date: addDays(sunday, -1), time: "16:30" }, { date: addDays(sunday, -1), time: "20:00" });
      for (let i = 0; i < 9; i++) slots.push({ date: sunday, time: "13:00" });
      for (let i = 0; i < 4; i++) slots.push({ date: sunday, time: "16:25" });
      slots.push({ date: sunday, time: "20:20" });
    } else {
      const thursday = addDays(sunday, -3);
      const isTurkey = thursday === turkey;
      if (w === 1) slots.push({ date: kickoff, time: "20:20" });
      else if (isTurkey) slots.push({ date: thursday, time: "12:30" }, { date: thursday, time: "16:30" }, { date: thursday, time: "20:20" }, { date: addDays(thursday, 1), time: "15:00" });
      else slots.push({ date: thursday, time: "20:15" });
      const xmas = christmas > thursday && christmas < addDays(sunday, 2) && christmas !== sunday;
      if (xmas) slots.push({ date: christmas, time: "13:00" }, { date: christmas, time: "16:30" }, { date: christmas, time: "20:15" });
      if (w >= 15 && !xmas) slots.push({ date: addDays(sunday, -1), time: "16:30" }, { date: addDays(sunday, -1), time: "20:00" });
      const iw = intlWeeks.indexOf(w);
      if (iw >= 0) {
        const [stadium, city, time] = sites[iw];
        slots.push({ date: city.includes("Brazil") && w === 1 ? addDays(kickoff, 1) : sunday, time: city.includes("Brazil") && w === 1 ? "20:00" : time, abroad: [stadium, city] });
      }
      slots.push({ date: sunday, time: "20:20" }, { date: addDays(sunday, 1), time: "20:15" });
      if (games.length >= 14 && rng() < 0.4) slots.push({ date: addDays(sunday, 1), time: "19:15" });
      const late = Math.max(2, Math.min(4, games.length - slots.length - 8));
      for (let i = 0; i < late; i++) slots.push({ date: sunday, time: i % 2 ? "16:05" : "16:25" });
      while (slots.length < games.length) slots.push({ date: sunday, time: "13:00" });
    }
    // Thanksgiving belongs to Detroit and Dallas; the opener to the champion.
    const placeGame = (pred: (g: Pairing) => boolean, slot: number) => {
      const i = games.findIndex(pred);
      if (i > slot) [games[slot], games[i]] = [games[i], games[slot]];
    };
    if (w === 1 && champion) placeGame((g) => g.home === champion, 0);
    if (addDays(sunday, -3) === turkey) {
      placeGame((g) => g.home === "DET", 0);
      placeGame((g) => g.home === "DAL", 1);
    }
    // Abroad: a home team that isn't already playing overseas this year, and not Detroit or Dallas on Thanksgiving week.
    const abroadSlot = slots.findIndex((s) => s.abroad);
    if (abroadSlot >= 0) {
      const fixed = w === 1 ? 1 : w === turkeyWeek ? 2 : 0;
      const i = games.findIndex((g, k) => k >= fixed && k !== abroadSlot && !hostedAbroad.has(g.home) && !["DET", "DAL", "GB"].includes(g.home));
      if (i >= 0) {
        hostedAbroad.add(games[i].home);
        [games[abroadSlot], games[i]] = [games[i], games[abroadSlot]];
      }
    }
    // Teams that share a stadium can't both be home on the same day.
    const pinned = w === 1 ? 1 : w === turkeyWeek ? 2 : 0;
    for (const [a, b] of SHARED) {
      const ia = games.findIndex((g) => g.home === a);
      const ib = games.findIndex((g) => g.home === b);
      if (ia < 0 || ib < 0 || slots[ia].date !== slots[ib].date || slots[ia].abroad || slots[ib].abroad) continue;
      const move = ib >= pinned ? ib : ia;
      const stay = move === ib ? ia : ib;
      const other = slots.findIndex((s, k) => k >= pinned && k !== ia && k !== ib && !s.abroad && s.date !== slots[stay].date && games[k] && !SHARED.flat().includes(games[k].home));
      if (other >= 0) [games[move], games[other]] = [games[other], games[move]];
    }
    games.forEach((g, i) => {
      const s = slots[i];
      const date = s.date;
      out.push({
        id: `${season}_${String(w).padStart(2, "0")}_${g.away}_${g.home}`,
        type: "REG", week: w, date, weekday: weekday(date), timeET: s.time, away: g.away, home: g.home,
        neutral: !!s.abroad,
        ...(s.abroad ? { stadium: s.abroad[0], city: s.abroad[1] } : homeStadium(g.home)),
        divisionGame: g.division,
      } as ScheduledGame);
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.timeET.localeCompare(b.timeET));
  return [...preseason(season, rng), ...out, ...playoffSlots(season)];
}

/** Three preseason weeks (four games for the Hall of Fame Game teams), mostly against nearby teams. */
function preseason(season: number, rng: Rng): ScheduledGame[] {
  const k = kickoffDate(season);
  const ids = TEAMS.map((t) => t.id);
  const homeCount: Record<string, number> = {};
  const met = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("-");
  const out: ScheduledGame[] = [];
  const [h0, a0] = shuffle(rng, ids);
  out.push({
    id: `${season}_P0_${a0}_${h0}`, type: "PRE", week: 0, date: addDays(k, -35), weekday: "Thursday", timeET: "20:00",
    away: a0, home: h0, neutral: true, stadium: "Tom Benson Hall of Fame Stadium", city: "Canton, OH", label: "Hall of Fame Game",
  } as ScheduledGame);
  met.add(key(a0, h0));
  // Game days for each week, as offsets from opening night: Thursday to Sunday, the last week done by Saturday.
  const days: number[][] = [
    [-28, -28, -28, -28, -27, -27, -27, -27, -26, -26, -26, -26, -26, -26, -26, -25],
    [-21, -21, -21, -20, -20, -20, -20, -19, -19, -19, -19, -19, -19, -19, -19, -18],
    [-14, -14, -14, -14, -14, -13, -13, -13, -13, -13, -13, -12, -12, -12, -12, -12],
  ];
  const times = ["19:00", "19:30", "20:00", "13:00", "16:00", "19:00", "20:00", "22:00"];
  for (let w = 1; w <= 3; w++) {
    const pool = shuffle(rng, ids);
    const pairs: [string, string][] = [];
    while (pool.length) {
      const a = pool.shift()!;
      const ranked = pool.map((b, i) => ({ i, d: (met.has(key(a, b)) ? 5000 : 0) + miles(NFL_HQ[a], NFL_HQ[b]) * (0.5 + rng()) }))
        .sort((x, y) => x.d - y.d);
      pairs.push([a, pool.splice(ranked[0].i, 1)[0]]);
    }
    pairs.forEach(([x, y], slot) => {
      const [home, away] = (homeCount[x] ?? 0) <= (homeCount[y] ?? 0) ? [x, y] : [y, x];
      homeCount[home] = (homeCount[home] ?? 0) + 1;
      met.add(key(x, y));
      const date = addDays(k, days[w - 1][slot]);
      out.push({
        id: `${season}_P${w}_${away}_${home}`, type: "PRE", week: w, date, weekday: weekday(date),
        timeET: times[slot % times.length], away, home, neutral: false, ...homeStadium(home),
      } as ScheduledGame);
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.timeET.localeCompare(b.timeET));
}

/** The 13 playoff games, teams filled in as the bracket is decided. */
function playoffSlots(season: number): ScheduledGame[] {
  const kd = keyDatesFor(season);
  const wc = kd.wildCardWeekend;
  const div = kd.divisionalRound;
  const conf = kd.conferenceChampionships;
  const slot = (n: number, round: "WC" | "DIV" | "CONF" | "SB", date: string, time: string, extra: Partial<ScheduledGame> = {}): ScheduledGame => ({
    id: `${season}_POST_${round}_${n}`, type: "POST", round, date, weekday: weekday(date), timeET: time, away: null, home: null, neutral: false, ...extra,
  });
  const sb = superBowlSite(season);
  const nfcFirst = season % 2 === 0;
  return [
    slot(1, "WC", wc, "16:30"), slot(2, "WC", wc, "20:00"), slot(3, "WC", addDays(wc, 1), "13:00"),
    slot(4, "WC", addDays(wc, 1), "16:30"), slot(5, "WC", addDays(wc, 1), "20:15"), slot(6, "WC", addDays(wc, 2), "20:15"),
    slot(7, "DIV", div, "16:30"), slot(8, "DIV", div, "20:15"), slot(9, "DIV", addDays(div, 1), "15:00"), slot(10, "DIV", addDays(div, 1), "18:30"),
    slot(11, "CONF", conf, "15:00", { conference: nfcFirst ? "NFC" : "AFC" }), slot(12, "CONF", conf, "18:30", { conference: nfcFirst ? "AFC" : "NFC" }),
    slot(13, "SB", kd.superBowl, "18:30", { neutral: true, stadium: sb.stadium, city: sb.city, label: superBowlName(season) }),
  ];
}
