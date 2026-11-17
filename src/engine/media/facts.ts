// Facts: what happened today, in a form the story engine can write about.
// Each fact carries its news value, the tags angles test, and the slots
// templates fill. Football facts are read from what the day already logged
// (results, box scores, play logs, signings, transactions, trades, injuries);
// other systems can hand the engine a fact with `emit`.
import { FORMAT } from "../format";
import { personality } from "../clubhouse";
import { capHit, capSummary, contractYearsLeft } from "../cap";
import { ageOn, addDays, daysBetween } from "../dates";
import { notableWeather } from "../gameday";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAM_BY_ID, teamLabel } from "../league";
import { capScale, injuryDiscount, marketView } from "../market";
import { leagueYear } from "../contracts";
import { money } from "../inbox";
import { liveIds } from "../live";
import { mediaState } from "../outlets";
import { rivalryHeat } from "../records";
import { depthChart } from "../roster";
import { teamStaff } from "../staff";
import { standings, type Record_ } from "../standings";
import { seasonTotals, stat, type StatLine } from "../stats";
import { describe, headline as tradeHeadline } from "../trades";
import type { BoxScore, GameState, MediaFactInput, Position, ScheduledGame, StoryKind, TradeRecord } from "../types";
import type { Slots } from "./grammar";

export type Family = "game" | "performance" | "injury" | "signing" | "release" | "trade" | "claim" | "wire" | "talk" | "camp" | "seat" | "rumor" | "arc" | "season";

export interface Fact {
  id: string;
  /** A fine-grained type, such as "game.post" or "sign.ext": the first part of a story type. */
  type: string;
  family: Family;
  /** The Media page's kind for stories about it. */
  kind: StoryKind;
  teams: string[];
  players: string[];
  gameId?: string;
  /** How much the league cares, 0-100 (our club's own news is scored for the national desks; the beat covers it anyway). */
  value: number;
  ours: boolean;
  tags: Record<string, number | boolean | string | undefined>;
  slots: Slots;
  /** A sourced report is first written by the reporter who has it (engine/media/rumors.ts). */
  outlet?: string;
  reporter?: string;
}

const M = 1_000_000;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Hands the media a fact from another system; it is written up at the end of the day. */
export function emit(state: GameState, f: MediaFactInput): void {
  const m = mediaState(state);
  (m.queue ??= []).push(f);
}

// ---- Slots shared by every family ----

export function teamSlots(_state: GameState, team: string, table?: Record<string, Record_>): Slots {
  const t = TEAM_BY_ID[team];
  const r = table?.[team];
  const streak = r?.streak ?? "";
  const n = Number(streak.slice(1)) || 0;
  return {
    id: team, nick: t.name, full: teamLabel(team), city: t.city,
    coach: teamStaff(team).HC?.name ?? `the ${t.name} head coach`,
    rec: r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "",
    w: r?.w ?? 0, l: r?.l ?? 0,
    wins: streak.startsWith("W") ? n : 0, losses: streak.startsWith("L") ? n : 0,
    div: `${t.conference} ${t.division}`,
  };
}

/** A player's season numbers in a phrase, or "" early in the season. */
export function seasonLine(state: GameState, id: string): string {
  const row = seasonTotals(state, "REG")[id];
  const l: StatLine = row?.line ?? {};
  const v = (k: keyof StatLine) => l[k] ?? 0;
  if (!l.g || l.g < 3) return "";
  const f = (x: number) => x.toLocaleString("en-US");
  switch (PLAYER_BY_ID[id]?.position) {
    case "QB": return `${f(v("passYds"))} passing yards, ${v("passTd")} touchdowns and ${v("int")} interceptions in ${l.g} games`;
    case "RB": case "FB": return `${f(v("rushYds"))} rushing yards and ${v("rushTd") + v("recTd")} touchdowns in ${l.g} games`;
    case "WR": case "TE": return `${v("rec")} catches for ${f(v("recYds"))} yards and ${v("recTd")} touchdowns in ${l.g} games`;
    case "EDGE": case "IDL": case "LB": return `${v("sacks")} sacks and ${v("tklSolo") + v("tklAst")} tackles in ${l.g} games`;
    case "CB": case "S": return `${v("defInt")} interceptions and ${v("pd")} passes defensed in ${l.g} games`;
    case "K": return `${v("fgm")} of ${v("fga")} on field goals`;
    default: return `${l.g} games`;
  }
}

export function playerSlots(state: GameState, id: string): Slots {
  const p = PLAYER_BY_ID[id];
  const age = p?.birthDate ? (ageOn(p.birthDate, state.date) ?? 0) : 0;
  const team = state.players[id]?.team ?? p?.team ?? "";
  return {
    id, name: p?.name ?? "Unknown", pos: p?.position ?? "", age,
    college: p?.college ?? "", line: seasonLine(state, id),
    team: team && TEAM_BY_ID[team] ? TEAM_BY_ID[team].name : "",
    exp: state.players[id]?.exp ?? p?.yearsExp ?? 0,
    year: (state.players[id]?.exp ?? p?.yearsExp ?? 0) + 1,
    draft: p?.draft.round ? `a round ${p.draft.round} pick${p.draft.overall ? ` (No. ${p.draft.overall})` : ""}` : "undrafted",
  };
}

/** Teams a player has played for before, from his real career lines. */
function formerTeams(id: string): Set<string> {
  const p = PLAYER_BY_ID[id];
  const out = new Set<string>();
  for (const s of p?.stats ?? []) if (s.team) out.add(String(s.team));
  if (p?.draft.team) out.add(p.draft.team);
  return out;
}

const sameDivision = (a: string, b: string) => TEAM_BY_ID[a].conference === TEAM_BY_ID[b].conference && TEAM_BY_ID[a].division === TEAM_BY_ID[b].division;
const contractYear = (state: GameState, id: string) => contractYearsLeft(id, leagueYear(state.date), state) <= 1;
const isRookie = (state: GameState, id: string) => (state.players[id]?.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 1) === 0;
const pct = (r: Record_ | undefined) => (r && r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0.5);

// ---- Games ----

function impact(v: number[]): number {
  return stat(v, "passYds") / 25 + stat(v, "passTd") * 4 - stat(v, "int") * 2 + stat(v, "rushYds") / 10 + stat(v, "rushTd") * 6 +
    stat(v, "recYds") / 10 + stat(v, "recTd") * 6 + stat(v, "sacks") * 4 + stat(v, "defInt") * 5 + stat(v, "ff") * 3 + stat(v, "defTd") * 6 +
    stat(v, "fgm") * 1.5;
}

/** A player's day in a sentence. */
export function gameLine(id: string, v: number[]): string {
  const pos = PLAYER_BY_ID[id]?.position ?? "";
  const n = PLAYER_BY_ID[id]?.name ?? "Unknown";
  const s = (k: string) => stat(v, k as Parameters<typeof stat>[1]);
  const pl = (x: number, w: string) => `${x} ${w}${x === 1 ? "" : "s"}`;
  if (s("att") >= 10) {
    return `${n} completed ${s("cmp")} of ${s("att")} passes for ${s("passYds")} yards` +
      (s("passTd") ? ` and ${pl(s("passTd"), "touchdown")}` : "") + (s("int") ? `, with ${pl(s("int"), "interception")}` : "") + (s("rushTd") ? ", and ran for a score" : "");
  }
  if (s("car") >= 8 && s("rushYds") >= s("recYds")) return `${n} ran for ${s("rushYds")} yards on ${s("car")} carries` + (s("rushTd") ? ` with ${pl(s("rushTd"), "touchdown")}` : "");
  if (s("rec")) return `${n} caught ${s("rec")} passes for ${s("recYds")} yards` + (s("recTd") ? ` and ${pl(s("recTd"), "touchdown")}` : "");
  if (s("sacks") || s("defInt")) {
    const parts = [];
    if (s("sacks")) parts.push(pl(s("sacks"), "sack"));
    if (s("defInt")) parts.push(pl(s("defInt"), "interception"));
    if (s("ff")) parts.push("a forced fumble");
    return `${pos} ${n} had ${parts.join(" and ")}`;
  }
  if (s("fgm")) return `${n} made ${s("fgm")} of ${s("fga")} field goals`;
  return `${n} made plays`;
}

function topPlayers(box: BoxScore, side: "away" | "home", n: number): [string, number[]][] {
  return Object.entries(box.players[side]).filter(([id]) => PLAYER_BY_ID[id]).sort((a, b) => impact(b[1]) - impact(a[1])).slice(0, n);
}

/** What the play log says about the shape of a game: the winner's biggest deficit, lead changes, and whether it was decided late. */
function gameShape(state: GameState, gameId: string, winnerHome: boolean): { deficit: number; changes: number; late: boolean; turning: string } {
  const log = state.pbp?.[gameId];
  if (!log?.plays?.length) return { deficit: 0, changes: 0, late: false, turning: "" };
  let deficit = 0, changes = 0, lastChange = 0, leader = 0, swing = 0, swingAt = 0;
  const rows = log.plays;
  let runSide = 0, run = 0;
  for (let i = 0; i < rows.length; i++) {
    const away = Number(rows[i][9]) || 0, home = Number(rows[i][10]) || 0;
    const w = winnerHome ? home - away : away - home;
    deficit = Math.max(deficit, -w);
    const lead = Math.sign(home - away);
    if (lead !== 0 && lead !== leader) {
      if (leader !== 0) { changes++; lastChange = i; }
      leader = lead;
    }
    if (i > 0) {
      const pa = away - (Number(rows[i - 1][9]) || 0), ph = home - (Number(rows[i - 1][10]) || 0);
      if (pa > 0 || ph > 0) {
        const side = ph > 0 ? 1 : -1;
        run = side === runSide ? run + pa + ph : pa + ph;
        runSide = side;
        if (run > swing) { swing = run; swingAt = i; }
      }
    }
  }
  const quarter = Math.min(4, Math.max(1, Math.ceil(((swingAt + 1) / rows.length) * 4)));
  const turning = swing >= 14 ? `a ${swing}-0 run in the ${["first", "second", "third", "fourth"][quarter - 1]} quarter` : "";
  return { deficit, changes, late: changes > 0 && lastChange >= rows.length * 0.9, turning };
}

function upsetOf(state: GameState, g: ScheduledGame, table: Record<string, Record_>, W: string, L: string, tie: boolean): boolean {
  if (tie) return false;
  if (g.type === "REG") {
    const pre = (team: string, won: boolean) => {
      const r = table[team];
      const w = r.w - (won ? 1 : 0), l = r.l - (won ? 0 : 1);
      return { pct: w + l + r.t ? (w + r.t / 2) / (w + l + r.t) : 0.5, games: w + l + r.t };
    };
    const wp = pre(W, true), lp = pre(L, false);
    return wp.games >= 3 && lp.pct - wp.pct >= 0.3;
  }
  if (g.type === "POST" && state.seeds && g.round !== "SB") {
    const conf = TEAM_BY_ID[W].conference;
    return TEAM_BY_ID[L].conference === conf && state.seeds[conf].indexOf(W) - state.seeds[conf].indexOf(L) >= 3;
  }
  return false;
}

const ROUND: Record<string, string> = { WC: "Wild Card", DIV: "Divisional", SB: "Super Bowl" };

function gameFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  const us = state.userTeam;
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const r = state.results[g.id];
    const box = state.box[g.id];
    if (!r || !box || g.type === "PRE") continue;
    const tie = r.homeScore === r.awayScore;
    const homeWon = r.homeScore > r.awayScore;
    const W = homeWon || tie ? r.home : r.away, L = homeWon || tie ? r.away : r.home;
    const ws = Math.max(r.homeScore, r.awayScore), ls = Math.min(r.homeScore, r.awayScore);
    const margin = ws - ls;
    const shape = gameShape(state, g.id, homeWon);
    const [star] = topPlayers(box, homeWon || tie ? "home" : "away", 1);
    const [lstar] = topPlayers(box, homeWon || tie ? "away" : "home", 1);
    const upset = upsetOf(state, g, table, W, L, tie);
    const prime = g.weekday !== "Sunday" || g.timeET >= "19:00";
    const heat = rivalryHeat(state, W, L);
    const wr = table[W], lr = table[L];
    const label = g.type === "POST" ? (g.round === "CONF" ? `${g.conference} Championship` : ROUND[g.round!]) : `Week ${g.week}`;
    const hurt = box.injuries.filter((i) => {
      const inj = state.players[i.player]?.injury;
      return inj && inj.date === state.date && (inj.seasonEnding || daysBetween(state.date, inj.returnDate) >= 7);
    });
    const starQb = (side: "away" | "home") => Object.entries(box.players[side]).find(([id, v]) => PLAYER_BY_ID[id]?.position === "QB" && stat(v, "passYds") >= 300);
    const revenge = star && formerTeams(star[0]).has(L) && PLAYER_BY_ID[star[0]]?.team !== L;
    const ours = W === us || L === us;
    const wx = box.weather ? notableWeather(box.weather) : null;
    const sb = g.round === "SB";
    const tags: Fact["tags"] = {
      tie, margin, ot: !!r.overtime, upset, prime, post: g.type === "POST", sb, round: g.round,
      deficit: shape.deficit, changes: shape.changes, late: shape.late, turning: !!shape.turning,
      shutout: ls === 0 && !tie, shootout: ws + ls >= 60, defense: ws + ls <= 20 && ls > 0,
      rival: heat >= 3.5, division: sameDivision(W, L), weather: !!wx,
      wStreak: wr?.streak.startsWith("W") ? Number(wr.streak.slice(1)) : 0,
      lStreak: lr?.streak.startsWith("L") ? Number(lr.streak.slice(1)) : 0,
      snapped: !!lr && g.type === "REG" && (lr.l === 1 && lr.w >= 3),
      unbeaten: !!wr && g.type === "REG" && wr.l === 0 && wr.t === 0 && wr.w >= 4,
      winless: !!lr && g.type === "REG" && lr.w === 0 && lr.t === 0 && lr.l >= 4,
      firstWin: !!wr && g.type === "REG" && wr.w === 1 && wr.l >= 3,
      seat: g.type === "REG" && !!lr && lr.w + lr.l >= 6 && pct(lr) <= 0.3,
      starDay: star ? impact(star[1]) >= 30 : false, revenge: !!revenge,
      rookieStar: star ? isRookie(state, star[0]) && impact(star[1]) >= 20 : false,
      qbDuel: !!starQb("home") && !!starQb("away"), hurt: hurt.length,
      home: W === r.home, late_season: g.type === "REG" && (g.week ?? 0) >= FORMAT.weeks - 3, ours,
      race: g.type === "REG" && (g.week ?? 0) >= 12 && pct(wr) >= 0.55 && pct(lr) >= 0.5,
    };
    let value = g.type === "POST" ? (sb ? 100 : 80) : 40;
    if (upset) value += 15;
    if (r.overtime) value += 8;
    if (shape.deficit >= 14) value += 15;
    if (heat >= 3.5) value += 6;
    if (prime) value += 8;
    if (tags.unbeaten || tags.winless) value += 6;
    if (tags.starDay) value += 5;
    const score = `${ws}-${ls}${r.overtime ? " in overtime" : ""}`;
    const slots: Slots = {
      W: teamSlots(state, W, table), L: teamSlots(state, L, table),
      ws, ls, margin, score, label, deficit: shape.deficit, changes: shape.changes, turning: shape.turning,
      where: W === r.home ? "at home" : "on the road", venue: TEAM_BY_ID[r.home].stadium,
      weather: wx ?? "", night: `${g.weekday} night`,
      star: star ? { ...playerSlots(state, star[0]), day: gameLine(star[0], star[1]) } : undefined,
      lstar: lstar && impact(lstar[1]) >= 12 ? { ...playerSlots(state, lstar[0]), day: gameLine(lstar[0], lstar[1]) } : undefined,
      hurt: hurt.slice(0, 3).map((i) => `${TEAM_BY_ID[i.team].name} ${PLAYER_BY_ID[i.player]?.position ?? ""} ${PLAYER_BY_ID[i.player]?.name ?? ""} (${i.type.toLowerCase()})`).join("; "),
      heat: heat >= 5 ? "bitter" : "old",
      wRun: Number(tags.wStreak) >= 3 ? Number(tags.wStreak) : 0, lRun: Number(tags.lStreak) >= 3 ? Number(tags.lStreak) : 0,
      season: RULES.season, sbNumber: superBowlNumeral(RULES.season),
    };
    out.push({
      id: `g:${g.id}`, type: sb ? "game.sb" : g.type === "POST" ? "game.post" : "game.reg", family: "game", kind: "recap",
      teams: [r.away, r.home], players: [star?.[0], lstar?.[0]].filter((x): x is string => !!x), gameId: g.id,
      value, ours, tags, slots,
    });
    out.push(...performanceFacts(state, g, box, table, W));
  }
  return out;
}

function superBowlNumeral(season: number): string {
  let n = season - 1965;
  const map: [number, string][] = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---- Big days ----

function performanceFacts(state: GameState, g: ScheduledGame, box: BoxScore, table: Record<string, Record_>, W: string): Fact[] {
  const out: Fact[] = [];
  const r = state.results[g.id];
  for (const side of ["away", "home"] as const) {
    const team = side === "home" ? r.home : r.away;
    const opp = side === "home" ? r.away : r.home;
    for (const [id, v] of Object.entries(box.players[side])) {
      if (!PLAYER_BY_ID[id]) continue;
      const s = (k: string) => stat(v, k as Parameters<typeof stat>[1]);
      let type = "";
      let size = 0;
      if (s("passYds") >= 350 || s("passTd") >= 4) { type = "perf.pass"; size = s("passYds") / 25 + s("passTd") * 4; }
      else if (s("rushYds") >= 150 || s("rushTd") >= 3) { type = "perf.rush"; size = s("rushYds") / 10 + s("rushTd") * 6; }
      else if (s("recYds") >= 150 || s("recTd") >= 3) { type = "perf.rec"; size = s("recYds") / 10 + s("recTd") * 6; }
      else if (s("sacks") >= 3) { type = "perf.rush_end"; size = s("sacks") * 7; }
      else if (s("defInt") >= 2 || s("defTd") >= 1) { type = "perf.ballhawk"; size = s("defInt") * 8 + s("defTd") * 8; }
      else if (s("fgm") >= 5) { type = "perf.kick"; size = s("fgm") * 5; }
      if (!type) continue;
      const pos = PLAYER_BY_ID[id].position as Position;
      const chart = depthChart(state, team);
      const view = marketView(state, id);
      const won = team === W && r.homeScore !== r.awayScore;
      const age = PLAYER_BY_ID[id].birthDate ? (ageOn(PLAYER_BY_ID[id].birthDate!, state.date) ?? 27) : 27;
      const pay = capHit(id, leagueYear(state.date), state);
      const tags: Fact["tags"] = {
        won, lost: !won && r.homeScore !== r.awayScore, rookie: isRookie(state, id), contractYear: contractYear(state, id) && g.type === "REG",
        revenge: formerTeams(id).has(opp) && PLAYER_BY_ID[id].team !== opp, veteran: age >= 34, backup: (chart[pos]?.indexOf(id) ?? 0) > 0,
        star: view >= 86, bargain: pay > 0 && pay < 2 * M * capScale(state, leagueYear(state.date)), post: g.type === "POST",
        prime: g.weekday !== "Sunday" || g.timeET >= "19:00", size, ours: team === state.userTeam,
        mvp: pos === "QB" && pct(table[team]) >= 0.65 && (table[team]?.w ?? 0) >= 5,
        undrafted: !PLAYER_BY_ID[id].draft.round, presence: personality(id).presence,
      };
      out.push({
        id: `p:${g.id}:${id}`, type, family: "performance", kind: "trend", teams: [team, opp], players: [id], gameId: g.id,
        value: Math.min(95, 25 + size + (view >= 86 ? 8 : 0) + (g.type === "POST" ? 15 : 0)), ours: team === state.userTeam, tags,
        slots: {
          P: playerSlots(state, id), T: teamSlots(state, team, table), O: teamSlots(state, opp, table), day: gameLine(id, v),
          result: r.homeScore === r.awayScore ? "a tie" : won ? "a win" : "a loss",
          score: `${Math.max(r.homeScore, r.awayScore)}-${Math.min(r.homeScore, r.awayScore)}`,
          yds: s("passYds") || s("rushYds") || s("recYds"), td: s("passTd") || s("rushTd") || s("recTd"), sacks: s("sacks"), ints: s("defInt"), fgm: s("fgm"),
          age, pay: money(pay),
        },
      });
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 2);
}

// ---- Injuries ----

function injuryFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  const K = RULES.keyDates;
  for (const id of liveIds(state)) {
    const ps = state.players[id];
    const inj = ps.injury;
    if (!inj || inj.date !== state.date || !ps.team || !PLAYER_BY_ID[id]) continue;
    const days = daysBetween(state.date, inj.returnDate);
    if (!inj.seasonEnding && days < 6) continue;
    const view = marketView(state, id);
    // A star missing a week is news; anyone else has to be out a while.
    if (!inj.seasonEnding && days < 14 && view < 90) continue;
    if (view < 81 && ps.team !== state.userTeam) continue;
    if (view < 74) continue;
    const pos = PLAYER_BY_ID[id].position as Position;
    const chart = depthChart(state, ps.team);
    const next = chart[pos]?.find((x) => x !== id && !state.players[x]?.injury);
    const weeks = Math.max(1, Math.round(days / 7));
    const age = PLAYER_BY_ID[id].birthDate ? (ageOn(PLAYER_BY_ID[id].birthDate!, state.date) ?? 27) : 27;
    const hit = capHit(id, leagueYear(state.date), state);
    const scale = capScale(state, leagueYear(state.date));
    const tags: Fact["tags"] = {
      season: !!inj.seasonEnding, weeks, qb: pos === "QB", star: view >= 88, contractYear: contractYear(state, id), next: !!next,
      bigDeal: hit >= 15 * M * scale, push: state.date >= `${RULES.season}-11-15` && pct(table[ps.team]) >= 0.55, rookie: isRookie(state, id),
      repeat: injuryDiscount(state, id) < 0.95, age: age >= 31, camp: state.date < K.regularSeasonStart, ours: ps.team === state.userTeam,
    };
    out.push({
      id: `i:${id}:${state.date}`, type: inj.seasonEnding ? "injury.season" : "injury.weeks", family: "injury", kind: "injury",
      teams: [ps.team], players: [id], value: Math.min(95, (view - 60) * 1.6 + (inj.seasonEnding ? 15 : 0) + (pos === "QB" ? 10 : 0)),
      ours: ps.team === state.userTeam, tags,
      slots: {
        P: playerSlots(state, id), T: teamSlots(state, ps.team, table), injury: inj.type.toLowerCase(), weeks,
        span: weeks <= 1 ? "about a week" : weeks === 2 ? "a couple of weeks" : `about ${weeks} weeks`,
        next: next ? playerSlots(state, next) : undefined, hit: money(hit), back: inj.seasonEnding ? "" : addDays(state.date, days),
      },
    });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 8);
}

// ---- Transactions ----

function gradeGpa(grades: { grade: string }[]): number {
  return grades.length ? grades.reduce((a, g) => a + "FDCBA".indexOf(g.grade[0]), 0) / grades.length : 2;
}

function signingFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  const year = leagueYear(state.date);
  const scale = capScale(state, year);
  for (const s of state.signings.filter((x) => x.date === state.date)) {
    const ours = s.team === state.userTeam;
    if (s.apy < (ours ? 1.5 : 5) * M * scale || s.kind === "tender" || s.kind === "minimum") continue;
    const p = PLAYER_BY_ID[s.player];
    if (!p) continue;
    const age = p.birthDate ? (ageOn(p.birthDate, state.date) ?? 27) : 27;
    const gpa = gradeGpa(s.grades);
    const last = state.players[s.player]?.lastTeam ?? p.lastTeam ?? p.team ?? "";
    const space = capSummary(state, s.team).space;
    const cap = capSummary(state, s.team).limit || 1;
    const tags: Fact["tags"] = {
      ext: s.kind === "extension", tag: s.kind === "tag", fa: s.kind === "free-agent",
      top: s.apy >= 0.13 * cap, bargain: gpa >= 3.3, overpay: gpa <= 1.6, old: age >= 30, fragile: injuryDiscount(state, s.player) < 0.9,
      reunion: s.kind === "free-agent" && formerTeams(s.player).has(s.team) && last !== s.team, rival: !!last && last !== s.team && !!TEAM_BY_ID[last] && sameDivision(last, s.team),
      loaded: s.total > 0 && s.guaranteed / s.total >= 0.6, prove: s.years === 1, long: s.years >= 5, tight: space < 5 * M * scale,
      young: age <= 25, winNow: pct(table[s.team]) >= 0.6, rebuild: pct(table[s.team]) <= 0.35 && (table[s.team]?.w ?? 0) + (table[s.team]?.l ?? 0) >= 6,
      qb: p.position === "QB", ours, graded: s.grades.length > 0,
    };
    const apyShare = s.apy / cap;
    out.push({
      id: `s:${s.id}`, type: s.kind === "extension" ? "sign.ext" : s.kind === "tag" ? "sign.tag" : "sign.fa", family: "signing", kind: "signing",
      teams: [s.team], players: [s.player], value: Math.min(98, 30 + apyShare * 400 + (p.position === "QB" ? 10 : 0)), ours, tags,
      slots: {
        P: playerSlots(state, s.player), T: teamSlots(state, s.team, table), years: s.years, yearsWord: WORDS[s.years] ?? String(s.years), total: money(s.total), apy: money(s.apy),
        gtd: money(s.guaranteed), space: money(Math.max(0, space)), share: `${Math.round(apyShare * 1000) / 10}%`,
        from: last && TEAM_BY_ID[last] ? TEAM_BY_ID[last].name : "",
        grades: s.grades.map((g) => `${g.outlet} ${g.grade}`).join(", "), gradeTake: s.grades[0] ? `"${s.grades[0].take}"` : "",
      },
    });
  }
  return out;
}

function releaseFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  const today = (state.transactions ?? []).filter((t) => t.date === state.date && (t.kind === "released" || t.kind === "waived" || t.kind === "claimed"));
  for (const t of today) {
    const p = PLAYER_BY_ID[t.player];
    if (!p) continue;
    const view = marketView(state, t.player);
    const claim = t.kind === "claimed";
    if (view < (t.team === state.userTeam ? 78 : claim ? 80 : 83)) continue;
    const age = p.birthDate ? (ageOn(p.birthDate, state.date) ?? 27) : 27;
    const line = seasonLine(state, t.player);
    const tags: Fact["tags"] = {
      waived: t.kind === "waived", old: age >= 30, productive: !!line, hurt: !!state.players[t.player]?.injury, star: view >= 88,
      bust: p.draft.round === 1 && (state.players[t.player]?.exp ?? p.yearsExp) <= 4, march: state.date.slice(5, 7) === "03",
      camp: state.date < RULES.keyDates.regularSeasonStart && state.date.slice(5, 7) >= "07", ours: t.team === state.userTeam,
    };
    out.push({
      id: `t:${t.player}:${t.kind}:${state.date}`, type: claim ? "claim" : t.kind === "waived" ? "release.waive" : "release.cut",
      family: claim ? "claim" : "release", kind: claim ? "signing" : "release", teams: [t.team], players: [t.player],
      value: Math.min(90, (view - 70) * 2.5), ours: t.team === state.userTeam, tags,
      slots: { P: playerSlots(state, t.player), T: teamSlots(state, t.team, table), age },
    });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 7);
}

function tradeFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  const K = RULES.keyDates;
  for (const rec of (state.trades?.log ?? []).filter((x) => x.date === state.date && x.status !== "voided")) out.push(tradeFact(state, rec, table, K.tradeDeadline));
  return out;
}

function tradeFact(state: GameState, rec: TradeRecord, table: Record<string, Record_>, deadline: string): Fact {
  const [a, b] = rec.teams;
  const players = [...rec.send[0], ...rec.send[1]].flatMap((x) => (x.kind === "player" ? [x.id] : []));
  const picks = [...rec.send[0], ...rec.send[1]].filter((x) => x.kind === "pick").length;
  const g = (team: string) => gradeGpa(rec.grades?.[team] ?? []);
  const winner = g(a) >= g(b) ? a : b;
  const loser = winner === a ? b : a;
  const daysToDeadline = daysBetween(state.date, deadline);
  const ours = rec.teams.includes(state.userTeam);
  const star = players.slice().sort((x, y) => marketView(state, y) - marketView(state, x))[0];
  const tags: Fact["tags"] = {
    blockbuster: !!rec.blockbuster, deadline: daysToDeadline >= 0 && daysToDeadline <= 10, agreed: rec.status === "agreed", ours,
    picksOnly: players.length <= 1 && picks >= 2, division: sameDivision(a, b), lopsided: Math.abs(g(a) - g(b)) >= 1.2,
    qb: players.some((id) => PLAYER_BY_ID[id]?.position === "QB"), reunion: !!star && formerTeams(star).has(state.players[star]?.team ?? ""),
    seller: pct(table[a]) <= 0.4 || pct(table[b]) <= 0.4, contender: pct(table[a]) >= 0.6 || pct(table[b]) >= 0.6, star: !!star && marketView(state, star) >= 86,
  };
  return {
    id: `x:${rec.id}`, type: rec.status === "agreed" ? "trade.agreed" : "trade.done", family: "trade", kind: "trade",
    teams: [a, b], players, value: Math.min(98, 45 + (rec.blockbuster ? 30 : 0) + (tags.star ? 10 : 0) + (tags.qb ? 8 : 0)), ours, tags,
    slots: {
      A: teamSlots(state, a, table), B: teamSlots(state, b, table), winner: teamSlots(state, winner, table), loser: teamSlots(state, loser, table),
      sendA: describe(state, rec.send[0], a), sendB: describe(state, rec.send[1], b), head: tradeHeadline(state, rec),
      star: star ? playerSlots(state, star) : undefined, picks,
      gradesA: (rec.grades?.[a] ?? []).map((x) => `${x.outlet} ${x.grade}`).join(", "), gradesB: (rec.grades?.[b] ?? []).map((x) => `${x.outlet} ${x.grade}`).join(", "),
      pending: rec.status === "agreed" ? ", pending the new league year" : "",
    },
  };
}

// ---- The league wire and facts other systems handed over ----

/** Topics the wire desk writes up; games, the draft and college have their own desks, and "log" lines are already covered. */
const WIRE_SKIP = new Set(["games", "draft", "college", "log"]);
/** How much each kind of league news matters to the national desks before anything else is known. */
const TOPIC_VALUE: Record<string, number> = {
  coaching: 55, contracts: 38, freeagency: 40, trades: 40, league: 40, labor: 62, discipline: 50, business: 30, stadiums: 45,
  relocation: 72, ownership: 50, frontoffice: 32, honors: 50, retirement: 45, camp: 38,
};

let nameIndex: Map<string, string> | null = null;
/** Players named in a line of text, longest names first so "Josh Allen" doesn't match inside another name. */
function playersIn(text: string): string[] {
  nameIndex ??= new Map(Object.values(PLAYER_BY_ID).filter((p) => p.name && p.name.includes(" ")).map((p) => [p.name, p.id]));
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Z][\w'.-]+(?: [A-Z][\w'.-]+){1,3}/g)) {
    const words = m[0].split(" ");
    for (let n = words.length; n >= 2; n--) {
      const id = nameIndex.get(words.slice(0, n).join(" "));
      if (id) { out.push(id); break; }
    }
  }
  return [...new Set(out)];
}

function teamsInText(text: string): string[] {
  return Object.values(TEAM_BY_ID).filter((t) => text.includes(`${t.city} ${t.name}`) || new RegExp(`\\b${t.name}\\b`).test(text)).map((t) => t.id);
}

/** Words in a wire line that point a story toward an angle (the topic itself comes from the system that filed it). */
const WORD_TAGS: Record<string, RegExp> = {
  interim: /\binterim\b/i, coordinator: /coordinator/i, tag: /\b(franchise|transition) tag/i, option: /option/i,
  holdout: /seeking a new contract|holdout|standoff|skips|not attending|hold-in|wants a new contract/i, payCut: /pay cut/i,
  overCap: /over the cap|under the cap/i, offerSheet: /offer sheet|match/i, visit: /\bvisits?\b/i, interest: /interest|pursue/i,
  bidding: /bidding war/i, deadline: /deadline/i, lockout: /lockout|locked out|strike/i, deal: /\b(agree|agreement|deal|ratif)/i,
  suspended: /suspend/i, fine: /\bfine[sd]?\b/i, sponsor: /sponsor|naming/i, opens: /\bopens?\b|first season in/i,
  apply: /appl(y|ies|ication)/i, withdraw: /withdraw/i, sale: /\b(sale|sell|sells|buyer)\b/i, stake: /stake/i,
  hof: /Hall of Fame/i, snub: /misses|snub/i, award: /\b(award|awards|wins the)\b/i, retire: /retire/i, qbJob: /starting quarterback/i,
  tv: /\b(TV|media deals?|rights fees|media money)\b/, cap: /salary cap/i, injury: /injur|damaged/i,
};
function wordTags(text: string): Record<string, boolean> {
  return Object.fromEntries(Object.entries(WORD_TAGS).map(([k, re]) => [k, re.test(text)]));
}

interface WireInput { topic: string; text: string; kind?: StoryKind; teams?: string[]; players?: string[]; value?: number; data?: Record<string, string | number | boolean> }

function wireFact(state: GameState, table: Record<string, Record_>, w: WireInput, id: string): Fact {
  const us = state.userTeam;
  const teams = w.teams ?? teamsInText(w.text);
  const players = w.players ?? playersIn(w.text);
  const ours = teams.includes(us);
  const star = players.some((p) => PLAYER_BY_ID[p] && marketView(state, p) >= 86);
  const t = w.text;
  const tags: Fact["tags"] = {
    ours, rival: !ours && teams.some((x) => x !== us && TEAM_BY_ID[x] && sameDivision(x, us)), leaguewide: teams.length === 0, two: teams.length >= 2,
    star, qb: players.some((p) => PLAYER_BY_ID[p]?.position === "QB"), money: /\$\d/.test(t),
    vote: /\b(vote|approve|approves|reject|rejects|owners)\b/i.test(t), fired: /\b(fire|fires|fired|dismiss|out\b|steps down|leaves)/i.test(t),
    hired: /\b(hire|hires|name|names|promote|promotes)\b/i.test(t), report: /^(Report|Reports|Sources|Speculation)/i.test(t),
    fail: /\b(falls through|fails|stalls|reject|rejects|called off|short|misses|bankruptcy|damaged|supervise|supervision)\b/i.test(t),
    record: /\b(record|career|milestone|reached)\b/i.test(t), ...wordTags(t), ...(w.data ?? {}),
  };
  const P = players[0] && PLAYER_BY_ID[players[0]] ? playerSlots(state, players[0]) : undefined;
  const value = Math.min(95, (w.value ?? TOPIC_VALUE[w.topic] ?? 35) + (ours ? 20 : 0) + (star ? 12 : 0) + (tags.rival ? 5 : 0));
  return {
    id, type: `wire.${w.topic}`, family: "wire", kind: w.kind ?? (w.topic === "contracts" || w.topic === "freeagency" ? "signing" : tags.report ? "rumor" : "league"),
    teams, players, value, ours, tags,
    slots: {
      ...(w.data ?? {}), text: t.replace(/\.$/, ""), topic: w.topic,
      T: teams[0] ? teamSlots(state, teams[0], table) : undefined, T2: teams[1] ? teamSlots(state, teams[1], table) : undefined, P,
    },
  };
}

function wireFacts(state: GameState, table: Record<string, Record_>): Fact[] {
  const out: Fact[] = [];
  let i = 0;
  for (const n of state.news) {
    if (n.date !== state.date) break;
    i++;
    if (!n.topic || WIRE_SKIP.has(n.topic)) continue;
    out.push(wireFact(state, table, { topic: n.topic, text: n.text.replace(/^Report: /, ""), data: /^Report: /.test(n.text) ? { report: true } : undefined }, `w:${state.date}:${i}`));
  }
  const m = mediaState(state);
  const q = m.queue ?? [];
  m.queue = [];
  q.forEach((f, j) => out.push(wireFact(state, table, { topic: f.type.split(".")[0], ...f }, `q:${state.date}:${j}`)));
  return out;
}

/** Every fact of the day, before the desks decide what to write. */
export function collectFacts(state: GameState): Fact[] {
  const table = standings(state);
  return [
    ...gameFacts(state, table), ...injuryFacts(state, table), ...signingFacts(state, table),
    ...releaseFacts(state, table), ...tradeFacts(state, table), ...wireFacts(state, table),
  ];
}
