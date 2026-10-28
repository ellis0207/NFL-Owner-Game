// Daily coverage from the made-up outlets (engine/outlets.ts): game stories,
// injuries, signings and releases, trades and trade rumors, interviews,
// weekly trends, college football and the draft. Reporters only know what the
// public knows, plus what leaks: rumors are sometimes true and sometimes not.
import { capSummary, contractYearsLeft, teamPlayerIds } from "./cap";
import { AWARDS, awardRace, gamesOn, latestPoll, mediaBoard, mediaRank, prospectLine, prospectTotals, rankedName } from "./college";
import { schoolName } from "./collegeData";
import { addDays, ageOn, daysBetween, weekday } from "./dates";
import { DAY_ROUNDS, DRAFT_DAYS, DRAFT_YEAR, draftDayOf, mockSpot } from "./draft";
import { letter } from "./grades";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, SCHEDULE, TEAMS, TEAM_BY_ID, teamLabel } from "./league";
import { marketView } from "./market";
import { market, stillPlaying } from "./freeagency";
import { isPendingFreeAgent } from "./offseason";
import { addStory, gradeLean, MEDIA, MEDIA_BY_ID, mediaState, pruneStories, type MediaOutlet } from "./outlets";
import { draftClass } from "./prospects";
import { gaussian, rngFor, type Rng } from "./rng";
import { depthChart } from "./roster";
import { teamStaff } from "./staff";
import { seedConference, standings, matchup, type Record_ } from "./standings";
import { seasonTotals, stat, type StatLine } from "./stats";
import { describe, direction, headline, outlook, parsePick, trades, tradeWindow } from "./trades";
import type { BoxScore, GameState, Position, ScheduledGame, Story, TradeRecord } from "./types";
import { money } from "./inbox";

const KEY = RULES.keyDates;

// ---- Small helpers ----

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

const nick = (team: string) => TEAM_BY_ID[team].name;
let lastNames: Map<string, string> | null = null;
/** A last name the way a story uses it: no "Jr.", and the whole surname ("Van Ginkel"). */
export function surname(name: string): string {
  lastNames ??= new Map(Object.values(PLAYER_BY_ID).filter((x) => x.lastName).map((x) => [x.name, x.lastName!]));
  const ln = lastNames.get(name);
  if (ln) return ln.replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV|V)$/, "");
  const parts = name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(w));
  return parts[parts.length - 1] ?? name;
}
const last = surname;
const pname = (id: string) => PLAYER_BY_ID[id]?.name ?? "Unknown";
const ppos = (id: string) => PLAYER_BY_ID[id]?.position ?? "";
const recordOf = (r: Record_ | undefined) => (r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "0-0");
const hcName = (team: string) => teamStaff(team).HC?.name ?? `the ${nick(team)} head coach`;

function story(state: GameState, outlet: MediaOutlet, by: keyof Pick<MediaOutlet, "insider" | "columnist" | "analyst" | "draft" | "reporter">, s: Omit<Story, "id" | "date" | "outlet" | "by">): Story {
  return addStory(state, { outlet: outlet.id, by: outlet[by], ...s });
}

const O = MEDIA_BY_ID;

/** A player's numbers this regular season, the way a story quotes them. */
export function nflLine(state: GameState, id: string): string {
  const row = seasonTotals(state, "REG")[id];
  const l: StatLine = row?.line ?? {};
  const v = (k: keyof StatLine) => l[k] ?? 0;
  if (!l.g || l.g < 3) return "";
  const f = (x: number) => x.toLocaleString("en-US");
  switch (ppos(id)) {
    case "QB": return `${f(v("passYds"))} passing yards, ${v("passTd")} TD and ${v("int")} INT in ${l.g} games`;
    case "RB": case "FB": return `${f(v("rushYds"))} rushing yards and ${v("rushTd") + v("recTd")} touchdowns in ${l.g} games`;
    case "WR": case "TE": return `${v("rec")} catches for ${f(v("recYds"))} yards and ${v("recTd")} TD in ${l.g} games`;
    case "EDGE": case "IDL": case "LB": return `${v("sacks")} sack${v("sacks") === 1 ? "" : "s"} and ${v("tklSolo") + v("tklAst")} tackles in ${l.g} games`;
    case "CB": case "S": return `${v("defInt")} interception${v("defInt") === 1 ? "" : "s"} and ${v("pd")} passes defensed in ${l.g} games`;
    case "OT": case "OG": case "C": return `${l.g} starts`;
    case "K": return `${v("fgm")} of ${v("fga")} on field goals`;
    default: return `${l.g} games`;
  }
}

/** A rough box-score impact score, to find who stood out. */
function impact(v: number[]): number {
  return stat(v, "passYds") / 25 + stat(v, "passTd") * 4 - stat(v, "int") * 2 + stat(v, "rushYds") / 10 + stat(v, "rushTd") * 6 +
    stat(v, "recYds") / 10 + stat(v, "recTd") * 6 + stat(v, "sacks") * 4 + stat(v, "defInt") * 5 + stat(v, "ff") * 3 + stat(v, "defTd") * 6 +
    stat(v, "fgm") * 1.5;
}

function gameLine(id: string, v: number[]): string {
  const pos = ppos(id);
  const n = pname(id);
  if (stat(v, "att") >= 10) {
    return `${n} completed ${stat(v, "cmp")} of ${stat(v, "att")} passes for ${stat(v, "passYds")} yards` +
      (stat(v, "passTd") ? ` and ${stat(v, "passTd")} touchdown${stat(v, "passTd") === 1 ? "" : "s"}` : "") +
      (stat(v, "int") ? `, with ${stat(v, "int")} interception${stat(v, "int") === 1 ? "" : "s"}` : "") +
      (stat(v, "rushTd") ? `, and ran for a score` : "");
  }
  if (stat(v, "car") >= 8 && stat(v, "rushYds") >= stat(v, "recYds")) {
    return `${n} ran for ${stat(v, "rushYds")} yards on ${stat(v, "car")} carries` + (stat(v, "rushTd") ? ` with ${stat(v, "rushTd")} touchdown${stat(v, "rushTd") === 1 ? "" : "s"}` : "");
  }
  if (stat(v, "rec")) {
    return `${n} caught ${stat(v, "rec")} passes for ${stat(v, "recYds")} yards` + (stat(v, "recTd") ? ` and ${stat(v, "recTd")} touchdown${stat(v, "recTd") === 1 ? "" : "s"}` : "");
  }
  if (stat(v, "sacks") || stat(v, "defInt")) {
    const parts = [];
    if (stat(v, "sacks")) parts.push(`${stat(v, "sacks")} sack${stat(v, "sacks") === 1 ? "" : "s"}`);
    if (stat(v, "defInt")) parts.push(`${stat(v, "defInt")} interception${stat(v, "defInt") === 1 ? "" : "s"}`);
    if (stat(v, "ff")) parts.push("a forced fumble");
    return `${pos} ${n} had ${parts.join(" and ")}`;
  }
  if (stat(v, "fgm")) return `${n} made ${stat(v, "fgm")} of ${stat(v, "fga")} field goals`;
  return `${n} made plays`;
}

function topPlayers(box: BoxScore, side: "away" | "home", n: number): [string, number[]][] {
  return Object.entries(box.players[side]).filter(([id]) => PLAYER_BY_ID[id]).sort((a, b) => impact(b[1]) - impact(a[1])).slice(0, n);
}

// ---- Game stories ----

const QUOTES = {
  win: [
    "We found a way. That's what good teams do in this league.",
    "Proud of the guys. We played complementary football for four quarters.",
    "It wasn't always pretty, but nobody hands these out. We'll take it.",
    "That's a credit to the players. They prepared all week and it showed.",
  ],
  rout: [
    "We played about as clean a game as you can play. Now we have to do it again.",
    "Everybody ate today. The message is: don't read the clippings.",
  ],
  close: [
    "Those are the ones you remember. Our guys never blinked.",
    "Heart rate's still up. But that's a resilient group in that locker room.",
  ],
  loss: [
    "We have to coach it better, and that starts with me.",
    "Turnovers killed us. You can't do that against a good football team.",
    "It's a long season. We'll look at the tape and get it fixed.",
    "We had our chances. We didn't make the plays when it mattered.",
  ],
  blowout: [
    "That's not who we are. I told the team that, and I'll tell you that.",
    "Embarrassing. There's no other word for it. Everybody in that room owns it, me first.",
  ],
  closeLoss: [
    "One or two plays. That's the NFL. It hurts because we were right there.",
    "Tough way to lose. I'm not going to make excuses; we have to finish.",
  ],
};

/** Pre-game records: the standings without this game. */
function preGamePct(table: Record<string, Record_>, team: string, won: boolean, tie: boolean): { pct: number; games: number } {
  const r = table[team];
  const w = r.w - (won ? 1 : 0);
  const l = r.l - (!won && !tie ? 1 : 0);
  const t = r.t - (tie ? 1 : 0);
  const g = w + l + t;
  return { pct: g ? (w + t / 2) / g : 0.5, games: g };
}

function recap(state: GameState, g: ScheduledGame, table: Record<string, Record_>): void {
  const r = state.results[g.id];
  const box = state.box[g.id];
  if (!r || !box) return;
  const rng = rngFor(state.seed, `media:recap:${g.id}`);
  const tie = r.homeScore === r.awayScore;
  const homeWon = r.homeScore > r.awayScore;
  const W = homeWon ? r.home : r.away;
  const L = homeWon ? r.away : r.home;
  const wSide = homeWon ? "home" : "away";
  const lSide = homeWon ? "away" : "home";
  const ws = Math.max(r.homeScore, r.awayScore);
  const ls = Math.min(r.homeScore, r.awayScore);
  const margin = ws - ls;
  const score = `${ws}-${ls}${r.overtime ? " (OT)" : ""}`;
  const ours = r.home === state.userTeam || r.away === state.userTeam;
  const prime = g.weekday !== "Sunday" || g.timeET >= "19:00";
  const outlet = ours ? O.ledger : prime ? O.sideline : rng() < 0.5 ? O.ledger : O.sideline;
  const by = ours ? "reporter" : "reporter";
  const [star] = topPlayers(box, wSide, 1);
  const [loserStar] = topPlayers(box, lSide, 1);
  let upset = false;
  if (g.type === "REG" && !tie) {
    const wp = preGamePct(table, W, true, false);
    const lp = preGamePct(table, L, false, false);
    upset = wp.games >= 3 && lp.pct - wp.pct >= 0.3;
  } else if (g.type === "POST" && !tie && state.seeds) {
    const conf = TEAM_BY_ID[W].conference;
    upset = g.round !== "SB" && TEAM_BY_ID[L].conference === conf && state.seeds[conf].indexOf(W) - state.seeds[conf].indexOf(L) >= 3;
  }
  const label = g.type === "POST" ? ({ WC: "Wild Card", DIV: "Divisional", CONF: `${g.conference} title game`, SB: "Super Bowl" }[g.round!]) : `Week ${g.week}`;
  let head: string;
  if (tie) head = `${nick(r.away)} and ${nick(r.home)} play to a ${r.awayScore}-${r.homeScore} tie`;
  else if (g.round === "SB") head = `${teamLabel(W)} win Super Bowl LXI, beating the ${nick(L)} ${score}`;
  else if (star && stat(star[1], "passTd") >= 4) head = `${pname(star[0])} throws ${stat(star[1], "passTd")} TDs as ${nick(W)} beat ${nick(L)} ${score}`;
  else if (star && stat(star[1], "rushYds") >= 150) head = `${pname(star[0])} runs for ${stat(star[1], "rushYds")} as ${nick(W)} top ${nick(L)}`;
  else if (upset) head = pick(rng, [`Upset: ${nick(W)} stun ${nick(L)} ${score}`, `${nick(W)} shock ${nick(L)}, ${score}`]);
  else if (r.overtime) head = `${nick(W)} outlast ${nick(L)} in overtime, ${score}`;
  else if (margin >= 21) head = pick(rng, [`${nick(W)} rout ${nick(L)} ${score}`, `${nick(W)} roll past ${nick(L)} ${score}`]);
  else if (margin <= 3) head = pick(rng, [`${nick(W)} edge ${nick(L)} ${score}`, `${nick(W)} hold off ${nick(L)} ${score}`]);
  else head = pick(rng, [`${nick(W)} beat ${nick(L)} ${score}`, `${nick(W)} handle ${nick(L)} ${score}`, `${nick(W)} top ${nick(L)} ${score}`]);
  if (g.type === "POST" && g.round !== "SB" && !tie) head = `${label}: ${head}`;

  const lead = tie
    ? `Neither team could find a winner in the ${label} meeting between the ${teamLabel(r.away)} and the ${teamLabel(r.home)}.`
    : `The ${teamLabel(W)} ${margin >= 21 ? "overwhelmed" : margin <= 3 ? "survived" : "beat"} the ${teamLabel(L)} ${score}${r.home === W ? " at home" : " on the road"}.`;
  const lines = [lead];
  if (star) lines.push(`${gameLine(star[0], star[1])}.`);
  if (loserStar && impact(loserStar[1]) >= 12) lines.push(`For the ${nick(L)}, ${gameLine(loserStar[0], loserStar[1]).replace(/^(\w)/, (c) => c)}.`);
  if (g.type === "REG") {
    lines.push(tie ? `The ${nick(r.away)} are ${recordOf(table[r.away])}; the ${nick(r.home)} are ${recordOf(table[r.home])}.`
      : `The ${nick(W)} are ${recordOf(table[W])}${table[W].streak.startsWith("W") && Number(table[W].streak.slice(1)) >= 3 ? ` and have won ${table[W].streak.slice(1)} straight` : ""}; ` +
        `the ${nick(L)} fall to ${recordOf(table[L])}${table[L].streak.startsWith("L") && Number(table[L].streak.slice(1)) >= 3 ? `, their ${table[L].streak.slice(1)}th loss in a row` : ""}.`);
  } else if (g.type === "POST" && g.round !== "SB" && !tie) {
    lines.push(`The ${nick(W)} move on; the ${nick(L)}'s season is over.`);
  }
  if (!tie) {
    const quoteWin = margin >= 21 ? pick(rng, QUOTES.rout) : margin <= 3 ? pick(rng, QUOTES.close) : pick(rng, QUOTES.win);
    const quoteLoss = margin >= 21 ? pick(rng, QUOTES.blowout) : margin <= 3 ? pick(rng, QUOTES.closeLoss) : pick(rng, QUOTES.loss);
    if (rng() < 0.5 || L === state.userTeam) lines.push(`"${quoteLoss}" said ${hcName(L)}, the ${nick(L)} coach.`);
    else lines.push(`"${quoteWin}" ${hcName(W)} said afterward.`);
  }
  const hurt = box.injuries.filter((i) => {
    const inj = state.players[i.player]?.injury;
    return inj && inj.date === state.date && (inj.seasonEnding || daysBetween(state.date, inj.returnDate) >= 7);
  });
  if (hurt.length) lines.push(`Injuries: ${hurt.slice(0, 3).map((i) => `${nick(i.team)} ${ppos(i.player)} ${pname(i.player)} (${i.type.toLowerCase()})`).join("; ")}.`);
  story(state, outlet, by, {
    kind: "recap", headline: head, body: lines.join(" "), teams: [r.away, r.home],
    players: [star?.[0], loserStar?.[0]].filter((x): x is string => !!x), gameId: g.id,
  });
}

function gameCoverage(state: GameState): void {
  const games = (GAMES_BY_DATE[state.date] ?? []).filter((g) => state.results[g.id]);
  if (!games.length) return;
  const table = standings(state);
  const pre = games.filter((g) => g.type === "PRE");
  if (pre.length) {
    for (const g of pre.filter((x) => [state.results[x.id].home, state.results[x.id].away].includes(state.userTeam))) recap(state, g, table);
    const others = pre.filter((x) => ![state.results[x.id].home, state.results[x.id].away].includes(state.userTeam));
    if (others.length) {
      story(state, O.sideline, "reporter", {
        kind: "recap", headline: `Preseason scoreboard: ${others.length} game${others.length === 1 ? "" : "s"}`,
        body: others.map((g) => {
          const r = state.results[g.id];
          return `${nick(r.away)} ${r.awayScore}, ${nick(r.home)} ${r.homeScore}.`;
        }).join(" ") + " Starters played little; the real fights were for the last spots on the 53.",
        teams: others.flatMap((g) => [state.results[g.id].away, state.results[g.id].home]),
      });
    }
  }
  for (const g of games.filter((x) => x.type !== "PRE")) recap(state, g, table);
}

// ---- Injuries ----

function injuryCoverage(state: GameState): void {
  const hurt: { id: string; team: string; view: number }[] = [];
  for (const [id, ps] of Object.entries(state.players)) {
    const inj = ps.injury;
    if (!inj || inj.date !== state.date || !ps.team || !PLAYER_BY_ID[id]) continue;
    const days = daysBetween(state.date, inj.returnDate);
    if (!inj.seasonEnding && days < 6) continue;
    const view = marketView(state, id);
    // A star missing a week is news; anyone else has to be out a while.
    if (!inj.seasonEnding && days < 14 && view < 90) continue;
    if (view < 81 && ps.team !== state.userTeam) continue;
    if (view < 74) continue;
    hurt.push({ id, team: ps.team, view });
  }
  hurt.sort((a, b) => b.view - a.view);
  for (const h of hurt.slice(0, 8)) {
    const inj = state.players[h.id].injury!;
    const rng = rngFor(state.seed, `media:inj:${h.id}:${state.date}`);
    const weeks = Math.max(1, Math.round(daysBetween(state.date, inj.returnDate) / 7));
    const n = pname(h.id);
    const pos = ppos(h.id);
    const chart = depthChart(state, h.team);
    const next = chart[pos as Position]?.find((x) => x !== h.id && !state.players[x]?.injury);
    const line = nflLine(state, h.id);
    const outlet = rng() < 0.6 ? O.sideline : O.ledger;
    story(state, outlet, "insider", {
      kind: "injury", teams: [h.team], players: [h.id],
      headline: inj.seasonEnding
        ? `${nick(h.team)} ${pos} ${n} out for the season with ${inj.type.toLowerCase()}`
        : pick(rng, [`${nick(h.team)} ${pos} ${n} expected to miss about ${weeks} week${weeks === 1 ? "" : "s"}`, `Sources: ${n} out ${weeks === 1 ? "about a week" : `${weeks} weeks`} with ${inj.type.toLowerCase()}`]),
      body: `${n} has ${/s$/.test(inj.type) ? "" : /^[aeiou]/i.test(inj.type) ? "an " : "a "}${inj.type.toLowerCase()}${state.date >= KEY.regularSeasonStart ? "" : ", suffered in camp"}, according to people familiar with the diagnosis. ` +
        (inj.seasonEnding ? `It's a major blow for the ${nick(h.team)}. ` : `The team hopes to have ${last(n)} back in ${weeks <= 1 ? "about a week" : weeks === 2 ? "a couple of weeks" : `about ${weeks} weeks`}. `) +
        (line ? `${last(n)} has ${line} this season. ` : "") +
        (next ? `${pname(next)} is next on the depth chart.` : ""),
    });
  }
}

// ---- Transactions ----

function signingCoverage(state: GameState): void {
  const today = state.signings.filter((s) => s.date === state.date);
  for (const s of today) {
    const ours = s.team === state.userTeam;
    if (s.apy < (ours ? 1_500_000 : 5_000_000) || s.kind === "tender" || s.kind === "minimum") continue;
    const rng = rngFor(state.seed, `media:sign:${s.id}`);
    const n = pname(s.player);
    const pos = ppos(s.player);
    const ext = s.kind === "extension";
    const tag = s.kind === "tag";
    const yrs = `${s.years}-year`;
    const head = tag ? `${n} signs his tag with the ${nick(s.team)}`
      : ext ? pick(rng, [`${nick(s.team)} extend ${pos} ${n}: ${yrs}, ${money(s.total)}`, `${n} gets paid: ${yrs}, ${money(s.total)} extension with ${nick(s.team)}`])
      : pick(rng, [`${n} agrees to ${yrs}, ${money(s.total)} deal with ${nick(s.team)}`, `${nick(s.team)} land ${pos} ${n}: ${yrs}, ${money(s.total)}`]);
    const grades = s.grades.length ? `Early grades: ${s.grades.map((g) => `${g.outlet} ${g.grade} ("${g.take}")`).join("; ")}.` : "";
    story(state, O.capspace, "insider", {
      kind: "signing", teams: [s.team], players: [s.player], headline: head,
      body: `${ext ? `The ${nick(s.team)} and ${pos} ${n} agreed on an extension` : `${pos} ${n} agreed to terms with the ${teamLabel(s.team)}`}: ` +
        `${s.years} year${s.years === 1 ? "" : "s"}, ${money(s.total)}, ${money(s.guaranteed)} guaranteed, an average of ${money(s.apy)} a year. ` +
        (s.apy >= 20_000_000 ? `It puts ${last(n)} among the highest-paid players at the position. ` : "") + grades,
    });
    if (s.apy >= 25_000_000 || (ours && s.apy >= 12_000_000)) {
      const avg = s.grades.reduce((a, g) => a + "FDCBA".indexOf(g.grade[0]), 0) / Math.max(1, s.grades.length);
      story(state, O.blitz, "columnist", {
        kind: "interview", teams: [s.team], players: [s.player],
        headline: avg >= 3 ? `Big Lou: the ${nick(s.team)} nailed the ${last(n)} deal` : `Big Lou: the ${nick(s.team)} just lit money on fire`,
        body: avg >= 3
          ? `"You pay your guys. ${last(n)} is a difference-maker and the ${nick(s.team)} didn't flinch. Love it," Big Lou Marchetti said on The Blitz.`
          : `"${money(s.apy)} a year for ${last(n)}? Somebody in that building needs to explain that one to the fans," Big Lou Marchetti said on The Blitz. Kara Voss pushed back: "It's market price. Get over it."`,
      });
    }
  }
}

function releaseCoverage(state: GameState): void {
  const today = (state.transactions ?? []).filter((t) => t.date === state.date && (t.kind === "released" || t.kind === "waived"));
  let n = 0;
  for (const t of today) {
    if (!PLAYER_BY_ID[t.player] || n >= 6) continue;
    const view = marketView(state, t.player);
    if (view < (t.team === state.userTeam ? 78 : 83)) continue;
    n++;
    const name = pname(t.player);
    const age = ageOn(PLAYER_BY_ID[t.player].birthDate, state.date);
    const line = nflLine(state, t.player);
    story(state, rngFor(state.seed, `media:rel:${t.player}`)() < 0.5 ? O.sideline : O.capspace, "insider", {
      kind: "release", teams: [t.team], players: [t.player],
      headline: `${nick(t.team)} ${t.kind === "waived" ? "waive" : "release"} ${ppos(t.player)} ${name}`,
      body: `The ${teamLabel(t.team)} ${t.kind === "waived" ? "waived" : "released"} ${name}${age ? `, ${age},` : ""} today. ` +
        (line ? `${last(name)} had ${line} this season. ` : "") +
        (t.kind === "waived" ? "Any team can put in a claim before he clears waivers." : `${last(name)} is free to sign anywhere, and expect interest.`),
    });
  }
}

function tradeCoverage(state: GameState): void {
  for (const rec of (state.trades?.log ?? []).filter((x) => x.date === state.date && x.status !== "voided")) {
    tradeStory(state, rec);
  }
}

function tradeStory(state: GameState, rec: TradeRecord): void {
  const rng = rngFor(state.seed, `media:trade:${rec.id}`);
  const players = [...rec.send[0], ...rec.send[1]].flatMap((a) => (a.kind === "player" ? [a.id] : []));
  const [a, b] = rec.teams;
  const gradeLine = (team: string) => (rec.grades?.[team] ?? []).map((g) => `${g.outlet} ${g.grade}`).join(", ");
  story(state, rng() < 0.5 ? O.sideline : O.ledger, "insider", {
    kind: "trade", teams: [a, b], players,
    headline: `${rec.blockbuster ? "Blockbuster: " : "Trade: "}${headline(state, rec)}`,
    body: `The ${teamLabel(a)} send ${describe(state, rec.send[0], a)} to the ${teamLabel(b)} for ${describe(state, rec.send[1], b)}` +
      (rec.status === "agreed" ? ", pending the new league year." : ".") +
      ` Grades for the ${nick(a)}: ${gradeLine(a)}. For the ${nick(b)}: ${gradeLine(b)}.`,
  });
  if ((rec.blockbuster && players.length) || rec.teams.includes(state.userTeam)) {
    const g = (team: string) => (rec.grades?.[team] ?? []).reduce((s, x) => s + "FDCBA".indexOf(x.grade[0]), 0) / Math.max(1, rec.grades?.[team]?.length ?? 1);
    const winner = g(a) >= g(b) ? a : b;
    story(state, O.blitz, "columnist", {
      kind: "interview", teams: [a, b], players,
      headline: `Winners and losers: the ${nick(winner)} fleeced somebody`,
      body: `"I'll say it: the ${nick(winner)} won this trade, and it isn't close," Big Lou Marchetti said. ` +
        `Kara Voss wasn't so sure: "${pick(rng, ["Check back in two years. Trades never look the same a season later.", "Lou, you grade every trade in five minutes.", "The other side got exactly what it wanted. Both can win."])}"`,
    });
  }
}

/** League news lines that deserve a short story of their own. */
const WIRE: { re: RegExp; outlet: string; kind: Story["kind"]; extra: string; college?: boolean }[] = [
  { re: /place the (franchise|transition) tag/, outlet: "capspace", kind: "signing", extra: "The tag buys the team time: a long-term deal can still be done before the summer deadline." },
  { re: /fifth-year option/, outlet: "capspace", kind: "signing", extra: "Option decisions say a lot about how a front office sees its own draft picks." },
  { re: /tender restricted free agent/, outlet: "capspace", kind: "signing", extra: "Another team can still sign him to an offer sheet, at the cost of draft compensation." },
  { re: /salary cap at/, outlet: "capspace", kind: "league", extra: "Teams near the line now have to restructure or release players before the new league year." },
  { re: /league year begins/, outlet: "ledger", kind: "league", extra: "Deals agreed during the negotiating window are now official, and trades agreed since the Super Bowl go through." },
  { re: /offer sheet/, outlet: "capspace", kind: "signing", extra: "The original team now has five days to match." },
  { re: /(match|declines? to match)/, outlet: "capspace", kind: "signing", extra: "" },
  { re: /compensatory picks/, outlet: "ledger", kind: "draft", extra: "Comp picks reward teams that lost more free agents than they signed." },
  { re: /underclassman deadline/, outlet: "sentinel", kind: "draft", extra: "Boards across the league get reshuffled as the class takes shape.", college: true },
  { re: /work out at the scouting combine/, outlet: "sentinel", kind: "draft", extra: "Forty times and medicals from Indianapolis will move players up and down boards.", college: true },
  { re: /while seeking a new contract/, outlet: "sideline", kind: "leak", extra: "Fines pile up every day he stays away." },
  { re: /ends the standoff/, outlet: "sideline", kind: "leak", extra: "The contract question doesn't go away, but he's back on the field." },
  { re: /falls through/, outlet: "capspace", kind: "trade", extra: "" },
  { re: /trade deadline passes/, outlet: "ledger", kind: "trade", extra: "Rosters are what they are now: teams can only add free agents the rest of the way." },
  { re: /undrafted free agents/, outlet: "sentinel", kind: "draft", extra: "Every year a few of them make a roster; some go on to long careers.", college: true },
  { re: /is drawing interest from/, outlet: "capspace", kind: "rumor", extra: "Agents talk; the numbers in the market get bigger every time." },
  { re: /^CFB · .* wins the /, outlet: "sentinel", kind: "college", extra: "", college: true },
  { re: /^CFB · Playoff field set/, outlet: "sentinel", kind: "college", extra: "Twelve teams, one trophy.", college: true },
  { re: /^CFB · National championship/, outlet: "sentinel", kind: "college", extra: "", college: true },
];

function teamsIn(text: string): string[] {
  return TEAMS.filter((t) => text.includes(t.name)).map((t) => t.id);
}

function wireCoverage(state: GameState): void {
  for (const n of state.news) {
    if (n.date !== state.date) break;
    const w = WIRE.find((x) => x.re.test(n.text));
    if (!w) continue;
    const text = n.text.replace(/^CFB · /, "").replace(/^Report: /, "");
    story(state, O[w.outlet], w.kind === "rumor" || w.kind === "leak" ? "insider" : "reporter", {
      kind: w.kind, headline: text.charAt(0).toUpperCase() + text.slice(1),
      body: `${text.charAt(0).toUpperCase() + text.slice(1)}.${w.extra ? ` ${w.extra}` : ""}`,
      teams: w.college ? undefined : teamsIn(text), college: w.college,
    });
  }
}

// ---- Rumors ----

function rumorMill(state: GameState): void {
  const m = mediaState(state);
  const date = state.date;
  const rng = rngFor(state.seed, `media:rumors:${date}`);
  const ts = trades(state);
  const window = tradeWindow(state);
  const preDeadline = date >= addDays(KEY.tradeDeadline, -35) && date < KEY.tradeDeadline;
  const daysLeft = daysBetween(date, KEY.tradeDeadline);
  const offseason = date > KEY.superBowl && date < KEY.draftStart;
  const recent = (key: string, days: number) => m.asked[key] && daysBetween(m.asked[key], date) < days;

  // Trade requests: true, and loud.
  for (const [id, when] of Object.entries(ts.requests)) {
    if (when !== date || !PLAYER_BY_ID[id]) continue;
    const team = state.players[id]?.team;
    if (!team) continue;
    story(state, O.sideline, "insider", {
      kind: "rumor", teams: [team], players: [id],
      headline: `Sources: ${pname(id)} has asked the ${nick(team)} for a trade`,
      body: `${ppos(id)} ${pname(id)} has told the ${teamLabel(team)} he wants out, according to people familiar with the conversation. ` +
        `Teams have already started calling. The ${nick(team)} aren't obligated to move him, but requests like this rarely go away quietly.`,
    });
  }
  if (!window.open && !offseason) return;

  // Our trade block leaks: other teams talk.
  if (window.open) {
    for (const id of ts.block) {
      if (!PLAYER_BY_ID[id] || state.players[id]?.team !== state.userTeam || ts.requests[id] || recent(`block:${id}`, 21)) continue;
      const p = preDeadline && daysLeft <= 7 ? 0.25 : 0.07;
      if (rng() > p) continue;
      m.asked[`block:${id}`] = date;
      story(state, rng() < 0.5 ? O.capspace : O.sideline, "insider", {
        kind: "rumor", teams: [state.userTeam], players: [id],
        headline: `League sources: the ${nick(state.userTeam)} are shopping ${pname(id)}`,
        body: `The ${teamLabel(state.userTeam)} have let teams know ${ppos(id)} ${pname(id)} is available, according to two executives who spoke on condition of anonymity. ` +
          `${last(pname(id))}${nflLine(state, id) ? ` has ${nflLine(state, id)} this season and` : ""} would draw interest from contenders.`,
      });
    }
  }

  const busy = (preDeadline ? (daysLeft <= 7 ? 3 : 1) : offseason ? 1 : 0);
  if (!busy) return;
  const wp = outlook(state);
  // Sellers: real candidates on teams headed nowhere.
  const sellers = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam && direction(state, t) === "rebuild");
  for (let i = 0; i < busy; i++) {
    if (rng() > 0.55 || !sellers.length) continue;
    const team = pick(rng, sellers);
    const vets = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && (ageOn(PLAYER_BY_ID[id].birthDate, date) ?? 25) >= 27 && contractYearsLeft(id, offseason ? RULES.season + 1 : RULES.season, state) >= 1)
      .map((id) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 84).sort((a, b) => b[1] - a[1]);
    if (!vets.length) continue;
    const [id] = vets[Math.floor(rng() * Math.min(3, vets.length))];
    if (recent(`seller:${id}`, 30)) continue;
    m.asked[`seller:${id}`] = date;
    story(state, rng() < 0.5 ? O.capspace : O.ledger, "insider", {
      kind: "rumor", teams: [team], players: [id],
      headline: pick(rng, [`${nick(team)} open to offers for ${pname(id)}`, `Trade market heating up for ${nick(team)} ${ppos(id)} ${pname(id)}`]),
      body: `With the ${nick(team)} at ${recordOf(standings(state)[team])}, people around the league expect them to listen on veterans, ${pname(id)} among them. ` +
        `Nothing is close, and the asking price is said to be steep.`,
    });
  }
  // Buyers: contenders with a hole.
  if (rng() < (preDeadline ? 0.45 : 0.2)) {
    const buyers = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam && wp[t] >= 0.58);
    if (buyers.length) {
      const team = pick(rng, buyers);
      const chart = depthChart(state, team);
      const weakest = (["WR", "CB", "EDGE", "OT", "S", "IDL", "LB", "TE", "RB", "OG"] as Position[])
        .map((pos) => [pos, chart[pos]?.[0] ? marketView(state, chart[pos][0]) : 60] as const).sort((a, b) => a[1] - b[1])[0];
      if (weakest && !recent(`buyer:${team}`, 14)) {
        m.asked[`buyer:${team}`] = date;
        story(state, O.sideline, "insider", {
          kind: "rumor", teams: [team],
          headline: `${nick(team)} hunting for ${weakest[0]} help`,
          body: `The ${teamLabel(team)} have made calls about ${weakest[0] === "OT" ? "tackles" : weakest[0] === "EDGE" ? "edge rushers" : `${weakest[0]}s`}, per league sources. ` +
            `At ${recordOf(standings(state)[team])}, they think they're a piece away.`,
        });
      }
    }
  }
  // And the ones nobody can confirm.
  if (rng() < 0.12) {
    const stars = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam && wp[t] >= 0.45)
      .flatMap((t) => teamPlayerIds(state, t).filter((id) => PLAYER_BY_ID[id] && marketView(state, id) >= 92));
    if (stars.length) {
      const id = pick(rng, stars);
      const team = state.players[id].team!;
      story(state, O.blitz, "insider", {
        kind: "rumor", teams: [team], players: [id],
        headline: `Kara Voss: "I'm hearing ${last(pname(id))} could be in play"`,
        body: `On The Blitz, Kara Voss said she'd heard teams were calling the ${nick(team)} about ${pname(id)}. ` +
          `A team spokesperson called it "nonsense." Big Lou: "Where there's smoke..."`,
      });
    }
  }
  // Free agency chatter.
  const faTalk = date >= addDays(KEY.negotiatingWindowOpens, -10) && date <= addDays(KEY.newLeagueYear, 14);
  if (faTalk && rng() < 0.7) {
    const fa = market(state);
    const top = Object.values(fa).filter((f) => f.status === "open" && PLAYER_BY_ID[f.player] && f.offers.length && !recent(`fa:${f.player}`, 6))
      .map((f) => [f, marketView(state, f.player)] as const).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (top.length) {
      const [f] = top[Math.floor(rng() * Math.min(6, top.length))];
      m.asked[`fa:${f.player}`] = date;
      const teams = [...new Set(f.offers.map((o) => o.team))].slice(0, 3);
      story(state, O.capspace, "insider", {
        kind: "rumor", teams, players: [f.player],
        headline: `${pname(f.player)} market: ${teams.map(nick).join(", ")} in the mix`,
        body: `${ppos(f.player)} ${pname(f.player)} has real interest, with the ${teams.map(nick).join(", the ")} among the teams involved, according to people familiar with the market. ` +
          "His camp is in no hurry.",
      });
    } else if (date < KEY.negotiatingWindowOpens) {
      const pending = TEAMS.flatMap((t) => teamPlayerIds(state, t.id)).filter((id) => PLAYER_BY_ID[id] && isPendingFreeAgent(state, id) && !recent(`fa:${id}`, 30))
        .map((id) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 86).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (pending.length) {
        const [id] = pick(rng, pending);
        m.asked[`fa:${id}`] = date;
        const team = state.players[id].team!;
        story(state, O.capspace, "insider", {
          kind: "rumor", teams: [team], players: [id],
          headline: `${pname(id)} expected to test free agency`,
          body: `Barring a late deal with the ${teamLabel(team)}, ${ppos(id)} ${pname(id)} is expected to hit the market, according to league sources. ` +
            "He'd be one of the most sought-after players available.",
        });
      }
    }
  }
}

// ---- Interviews ----

function interviews(state: GameState): void {
  const date = state.date;
  const inSeason = date >= KEY.regularSeasonStart && date <= KEY.regularSeasonEnd;
  if (!inSeason || weekday(date) !== "Wednesday") return;
  const rng = rngFor(state.seed, `media:talk:${date}`);
  const table = standings(state);
  const us = state.userTeam;
  // Our head coach's weekly press conference: how he talks says something about the building.
  const coach = mediaState(state).coach;
  const hc = hcName(us);
  const next = SCHEDULE.find((g) => g.date > date && (() => {
    const m = matchup(state, g);
    return !!m && (m.home === us || m.away === us);
  })());
  const opp = next && (() => {
    const m = matchup(state, next)!;
    return m.home === us ? m.away : m.home;
  })();
  const relationLine = coach >= 70 ? `Asked about ownership, ${last(hc)} smiled: "We're all pulling in the same direction. I feel supported."`
    : coach >= 45 ? ""
    : coach >= 25 ? `Asked about the owner's recent comments, ${last(hc)} paused. "I'll keep those conversations in house."`
    : `${last(hc)} bristled at a question about his relationship with ownership: "Next question."`;
  story(state, O.ledger, "reporter", {
    kind: "interview", teams: [us],
    headline: `${last(hc)}: "${pick(rng, ["We know what's in front of us", "It's a one-week season", "We have to clean some things up", "The guys are locked in"])}"`,
    body: `${hc} met with reporters ahead of ${opp ? `the game against the ${teamLabel(opp)}` : "the week"}. ` +
      `"${pick(rng, [
        "We had a good Wednesday. The focus is where it needs to be.",
        "Every week in this league is hard. We respect who we're playing.",
        "We've got to take care of the football and win on third down. Simple as that.",
        "The injury report is what it is. Next man up.",
      ])}" ${relationLine}`,
  });
  // A couple of other players around the league.
  const pool = TEAMS.map((t) => t.id).filter((t) => t !== us);
  for (let i = 0; i < 2; i++) {
    const team = pick(rng, pool);
    const r = table[team];
    const ids = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && !state.players[id].injury);
    const stars = ids.map((id) => [id, marketView(state, id)] as const).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!stars.length) continue;
    const [id] = pick(rng, stars);
    const yearsLeft = contractYearsLeft(id, RULES.season, state);
    const losing = r.streak.startsWith("L") && Number(r.streak.slice(1)) >= 3;
    const winning = r.streak.startsWith("W") && Number(r.streak.slice(1)) >= 3;
    const quote = yearsLeft <= 1
      ? pick(rng, ["I don't think about the contract. My agent handles that. I handle Sundays.", "I want to be here. That's all I'll say about it."])
      : losing ? pick(rng, ["Nobody's coming to save us. We have to look in the mirror.", "We're not far off. I know how that sounds at this record."])
      : winning ? pick(rng, ["We're not satisfied. Nobody in here is talking about January yet.", "It's fun right now. Practice is fun. That's how you know."])
      : pick(rng, ["I feel good. Body feels good. I'm just trying to stack days.", "We've got a lot of football left. I like this group."]);
    story(state, O.sideline, "reporter", {
      kind: "interview", teams: [team], players: [id],
      headline: yearsLeft <= 1 ? `${pname(id)} on his contract year: "${quote.split(".")[0]}"` : `${pname(id)}: "${quote.split(/[.!]/)[0]}"`,
      body: `${ppos(id)} ${pname(id)} talked to reporters at the ${nick(team)} facility. "${quote}" The ${nick(team)} are ${recordOf(r)}.` +
        (yearsLeft <= 1 ? ` ${last(pname(id))} is in the last year of his deal.` : ""),
    });
  }
}

// ---- Weekly trends ----

function powerRankings(state: GameState, preseason: boolean): void {
  const m = mediaState(state);
  const wp = outlook(state);
  const table = standings(state);
  const order = TEAMS.map((t) => t.id).sort((a, b) => (wp[b] + (table[b].pf - table[b].pa) / 2000) - (wp[a] + (table[a].pf - table[a].pa) / 2000));
  const prev = m.ranks;
  const move = (t: string, i: number) => {
    if (!prev) return "";
    const d = prev.indexOf(t) - i;
    return d > 0 ? ` (up ${d})` : d < 0 ? ` (down ${-d})` : "";
  };
  const rng = rngFor(state.seed, `media:pr:${state.date}`);
  const blurbs = (t: string, i: number) => {
    const r = table[t];
    if (i === 0) return pick(rng, ["The team to beat until somebody does it.", "Nobody is playing better football."]);
    if (r.streak.startsWith("W") && Number(r.streak.slice(1)) >= 3) return `${r.streak.slice(1)} straight wins and counting.`;
    if (r.streak.startsWith("L") && Number(r.streak.slice(1)) >= 3) return `${r.streak.slice(1)} straight losses. The questions are getting louder.`;
    return i < 8 ? "A real contender." : i < 20 ? "Somewhere in the muddy middle." : "A long way from where they want to be.";
  };
  const lines = order.map((t, i) => `${i + 1}. ${teamLabel(t)}${preseason ? "" : ` (${recordOf(table[t])})`}${move(t, i)}${i < 5 || t === state.userTeam ? ` — ${blurbs(t, i)}` : ""}`);
  const ours = order.indexOf(state.userTeam);
  m.ranks = order;
  const week = SCHEDULE.find((g) => g.type === "REG" && g.date >= state.date)?.week;
  story(state, O.ledger, "analyst", {
    kind: "rankings", teams: [order[0], state.userTeam],
    headline: preseason ? `Preseason power rankings: the ${nick(order[0])} start on top` : `Power rankings${week ? `, Week ${week}` : ""}: ${nick(order[0])} on top; ${nick(state.userTeam)} No. ${ours + 1}`,
    body: lines.join("\n"),
  });
}

function statWatch(state: GameState): void {
  const totals = Object.entries(seasonTotals(state, "REG"));
  if (!totals.length) return;
  const lead = (key: keyof StatLine, label: string) => {
    const best = totals.filter(([id]) => PLAYER_BY_ID[id]).sort((a, b) => (b[1].line[key] ?? 0) - (a[1].line[key] ?? 0))[0];
    return best ? `${label}: ${pname(best[0])} (${nick(best[1].team)}), ${(best[1].line[key] ?? 0).toLocaleString("en-US")}` : "";
  };
  const games = Object.keys(state.results).filter((id) => SCHEDULE.find((g) => g.id === id)?.type === "REG").length;
  const week = Math.max(1, Math.round(games / 16));
  const lines = [lead("passYds", "Passing yards"), lead("passTd", "Passing TDs"), lead("rushYds", "Rushing yards"), lead("recYds", "Receiving yards"), lead("sacks", "Sacks"), lead("defInt", "Interceptions")].filter(Boolean);
  const qb = totals.filter(([id]) => PLAYER_BY_ID[id]).sort((a, b) => (b[1].line.passYds ?? 0) - (a[1].line.passYds ?? 0))[0];
  const pace = qb ? Math.round(((qb[1].line.passYds ?? 0) / Math.max(1, qb[1].line.g ?? 1)) * 17) : 0;
  story(state, O.ledger, "analyst", {
    kind: "trend", teams: [], players: qb ? [qb[0]] : [],
    headline: qb ? `Stat watch: ${pname(qb[0])} on pace for ${pace.toLocaleString("en-US")} yards` : "Stat watch",
    body: `The league leaders after about ${week} weeks:\n${lines.join("\n")}`,
  });
}

function weekPreview(state: GameState): void {
  const table = standings(state);
  const pct = (t: string) => {
    const r = table[t];
    const g = r.w + r.l + r.t;
    return g ? (r.w + r.t / 2) / g : 0.5;
  };
  const games = SCHEDULE.filter((g) => g.date > state.date && g.date <= addDays(state.date, 4) && g.type === "REG" && g.away && g.home);
  if (!games.length) return;
  const ranked = [...games].sort((a, b) => (pct(b.away!) + pct(b.home!)) - (pct(a.away!) + pct(a.home!)));
  const top = ranked.slice(0, 3);
  const ours = games.find((g) => g.away === state.userTeam || g.home === state.userTeam);
  const line = (g: ScheduledGame) => `${teamLabel(g.away!)} (${recordOf(table[g.away!])}) at ${teamLabel(g.home!)} (${recordOf(table[g.home!])}), ${g.weekday}`;
  story(state, O.sideline, "analyst", {
    kind: "preview", teams: [...new Set(top.flatMap((g) => [g.away!, g.home!]).concat(ours ? [state.userTeam] : []))],
    headline: `Week ${games[0].week} preview: ${nick(top[0].away!)} at ${nick(top[0].home!)} headlines the slate`,
    body: `Three games to watch:\n${top.map(line).join("\n")}` + (ours && !top.includes(ours) ? `\n\nAlso: ${line(ours)}.` : ""),
  });
}

function overreactions(state: GameState): void {
  const table = standings(state);
  const rng = rngFor(state.seed, `media:over:${state.date}`);
  const teams = TEAMS.map((t) => t.id);
  const hot = teams.filter((t) => table[t].streak.startsWith("W") && Number(table[t].streak.slice(1)) >= 2);
  const cold = teams.filter((t) => table[t].streak.startsWith("L") && Number(table[t].streak.slice(1)) >= 2);
  const takes: string[] = [];
  if (hot.length) {
    const t = pick(rng, hot);
    takes.push(`The ${nick(t)} are winning the Super Bowl. ${pick(rng, ["Book it.", "I said what I said.", "Write it down."])}`);
  }
  if (cold.length) {
    const t = pick(rng, cold);
    takes.push(`Blow up the ${nick(t)}. ${pick(rng, ["Everybody, top to bottom.", `${last(hcName(t))} has lost that room.`, "Start over."])}`);
  }
  const us = state.userTeam;
  const r = table[us];
  if (r.w + r.l > 0) {
    takes.push(r.streak.startsWith("W")
      ? `The ${nick(us)} owner has figured it out. ${pick(rng, ["Smartest guy in the league.", "Who saw this coming? Not me."])}`
      : `Somebody has to ask the ${nick(us)} owner what the plan is. ${pick(rng, ["Because I don't see one.", "The fans deserve an answer."])}`);
  }
  if (!takes.length) return;
  story(state, O.blitz, "columnist", {
    kind: "trend", teams: [us],
    headline: "Overreaction Monday",
    body: takes.map((t, i) => `${i + 1}. ${t}`).join("\n") + `\n\nKara Voss's verdict: "${pick(rng, ["Half of that is crazy. The other half is just loud.", "Lou, you say this every week.", "Ask me again in December."])}"`,
  });
}

function playoffPicture(state: GameState): void {
  const lines: string[] = [];
  for (const conf of ["AFC", "NFC"] as const) {
    const seeds = seedConference(state, conf);
    lines.push(`${conf}: ${seeds.map((t, i) => `${i + 1}. ${nick(t)}`).join(", ")}`);
  }
  const inNow = [...seedConference(state, "AFC"), ...seedConference(state, "NFC")].includes(state.userTeam);
  story(state, O.ledger, "analyst", {
    kind: "trend", teams: [state.userTeam],
    headline: `If the season ended today: the playoff picture${inNow ? ` (${nick(state.userTeam)} are in)` : ""}`,
    body: lines.join("\n") + `\n\nThe ${nick(state.userTeam)} are ${inNow ? "in the field" : "on the outside"} for now.`,
  });
}

function trends(state: GameState): void {
  const date = state.date;
  const wd = weekday(date);
  if (date === addDays(KEY.regularSeasonStart, -5)) powerRankings(state, true);
  const regular = date > KEY.regularSeasonStart && date <= addDays(KEY.regularSeasonEnd, 1);
  if (!regular) {
    // Playoff previews the day before each round.
    const tomorrow = (GAMES_BY_DATE[addDays(date, 1)] ?? []).filter((g) => g.type === "POST");
    const ready = tomorrow.map((g) => matchup(state, g)).filter((x): x is { away: string; home: string } => !!x);
    if (ready.length && !SCHEDULE.some((g) => g.type === "POST" && g.date === date)) {
      const round = tomorrow[0].round!;
      const label = { WC: "Wild Card weekend", DIV: "the Divisional Round", CONF: "championship Sunday", SB: "Super Bowl LXI" }[round];
      const allPost = SCHEDULE.filter((g) => g.type === "POST" && g.round === round).map((g) => matchup(state, g)).filter((x): x is { away: string; home: string } => !!x);
      story(state, O.sideline, "analyst", {
        kind: "preview", teams: allPost.flatMap((x) => [x.away, x.home]),
        headline: `Preview: ${label}`,
        body: allPost.map((x) => `${teamLabel(x.away)} at ${teamLabel(x.home)}`).join("\n"),
      });
    }
    return;
  }
  if (wd === "Tuesday") powerRankings(state, false);
  if (wd === "Monday") overreactions(state);
  if (wd === "Thursday" && date >= addDays(KEY.regularSeasonStart, 14)) statWatch(state);
  if (wd === "Wednesday") weekPreview(state);
  if (wd === "Tuesday" && date >= addDays(KEY.regularSeasonStart, 77)) playoffPicture(state);
  if (wd === "Tuesday" && date >= addDays(KEY.regularSeasonStart, 40)) hotSeat(state);
}

function hotSeat(state: GameState): void {
  const table = standings(state);
  const rng = rngFor(state.seed, `media:hot:${state.date}`);
  const cold = TEAMS.map((t) => t.id).filter((t) => {
    const r = table[t];
    const g = r.w + r.l + r.t;
    return g >= 6 && r.w / g <= 0.3;
  });
  if (!cold.length) return;
  const t = pick(rng, cold);
  story(state, O.blitz, "insider", {
    kind: "rumor", teams: [t],
    headline: `Hot seat watch: ${hcName(t)}`,
    body: `At ${recordOf(table[t])}, the ${teamLabel(t)} are ${t === state.userTeam ? "testing their owner's patience" : "running out of time"}. ` +
      `"You can feel it in that building," Kara Voss said on The Blitz. "${last(hcName(t))} needs wins, and he needs them now."`,
  });
}

function offseasonTrends(state: GameState): void {
  const date = state.date;
  const top = (ids: string[], n: number) => ids.filter((id) => PLAYER_BY_ID[id]).map((id) => [id, marketView(state, id)] as const).sort((a, b) => b[1] - a[1]).slice(0, n);
  if (date === KEY.franchiseTagWindowOpens || date === addDays(KEY.negotiatingWindowOpens, -2)) {
    const pending = top(TEAMS.flatMap((t) => teamPlayerIds(state, t.id)).filter((id) => isPendingFreeAgent(state, id)), 25);
    if (!pending.length) return;
    story(state, O.capspace, "columnist", {
      kind: "trend", teams: [...new Set(pending.slice(0, 5).map(([id]) => state.players[id].team!))], players: pending.slice(0, 5).map(([id]) => id),
      headline: date === KEY.franchiseTagWindowOpens ? "Tag season: the top 25 players headed for free agency" : `Free agency top 25: ${pname(pending[0][0])} leads the class`,
      body: pending.map(([id], i) => `${i + 1}. ${ppos(id)} ${pname(id)}, ${nick(state.players[id].team!)}`).join("\n"),
    });
  }
  if (date === addDays(KEY.newLeagueYear, 6)) {
    const since = state.signings.filter((s) => s.date >= KEY.negotiatingWindowOpens && s.kind === "free-agent");
    const byTeam: Record<string, number> = {};
    for (const s of since) byTeam[s.team] = (byTeam[s.team] ?? 0) + s.apy;
    const spent = Object.entries(byTeam).sort((a, b) => b[1] - a[1]);
    if (!spent.length) return;
    story(state, O.capspace, "columnist", {
      kind: "trend", teams: spent.slice(0, 3).map(([t]) => t).concat(state.userTeam),
      headline: `Free agency's first week: the ${nick(spent[0][0])} spent the most`,
      body: `New money per year, by team:\n${spent.slice(0, 10).map(([t, v], i) => `${i + 1}. ${teamLabel(t)}: ${money(v)}`).join("\n")}` +
        `\n\nThe ${nick(state.userTeam)}: ${money(byTeam[state.userTeam] ?? 0)}.`,
    });
  }
  // Best available, every other Monday through the spring.
  if (date > addDays(KEY.newLeagueYear, 7) && date < KEY.draftStart && weekday(date) === "Monday" && daysBetween(KEY.newLeagueYear, date) % 14 < 7) {
    const fa = top(Object.values(market(state)).filter((f) => f.status === "open").map((f) => f.player), 10);
    if (fa.length) {
      story(state, O.capspace, "analyst", {
        kind: "trend", players: fa.map(([id]) => id),
        headline: `Best available: ${pname(fa[0][0])} still waiting`,
        body: fa.map(([id], i) => `${i + 1}. ${ppos(id)} ${pname(id)}`).join("\n"),
      });
    }
  }
}

// ---- College football and the draft ----

function collegeCoverage(state: GameState): void {
  const c = state.college;
  if (!c) return;
  const m = mediaState(state);
  const date = state.date;
  const rng = rngFor(state.seed, `media:cfb:${date}`);
  // The day's ranked results.
  const poll = latestPoll(state, "ap");
  const games = gamesOn(state, date).filter((g) => c.results[g.id]);
  const ranked = games.filter((g) => poll && (poll.ranks.slice(0, 25).includes(g.away) || poll.ranks.slice(0, 25).includes(g.home)));
  if (ranked.length >= 3) {
    const lines = ranked.slice(0, 14).map((g) => {
      const [a, h] = c.results[g.id];
      const w = h > a ? g.home : g.away;
      const l = h > a ? g.away : g.home;
      return `${rankedName(state, w, poll)} ${Math.max(a, h)}, ${rankedName(state, l, poll)} ${Math.min(a, h)}`;
    });
    const upsets = ranked.filter((g) => {
      const [a, h] = c.results[g.id];
      const l = h > a ? g.away : g.home;
      const w = h > a ? g.home : g.away;
      const lr = poll!.ranks.indexOf(l);
      const wr = poll!.ranks.indexOf(w);
      return lr >= 0 && lr < 15 && (wr < 0 || wr > lr + 5);
    });
    story(state, O.sentinel, "columnist", {
      kind: "college", college: true,
      headline: upsets.length ? `Chaos: ${schoolName(upsetWinner(state, upsets[0]))} take down ${rankedName(state, upsetLoser(state, upsets[0]), poll)}` : `College scoreboard: ${lines[0]}`,
      body: `Ranked teams today:\n${lines.join("\n")}`,
    });
  }
  // A new poll.
  if (poll && poll.date === date && c.ap.length >= 2) {
    const prev = c.ap[c.ap.length - 2];
    const moves = poll.ranks.slice(0, 25).map((t, i) => [t, (prev.ranks.indexOf(t) < 0 ? 26 : prev.ranks.indexOf(t) + 1) - (i + 1)] as const);
    const up = [...moves].sort((a, b) => b[1] - a[1])[0];
    const out = prev.ranks.slice(0, 25).filter((t) => !poll.ranks.slice(0, 25).includes(t));
    story(state, O.sentinel, "analyst", {
      kind: "college", college: true,
      headline: `AP Top 25 (${poll.label}): ${schoolName(poll.ranks[0])} ${prev.ranks[0] === poll.ranks[0] ? "stays" : "moves to"} No. 1`,
      body: poll.ranks.slice(0, 10).map((t, i) => `${i + 1}. ${schoolName(t)}`).join("\n") +
        (up && up[1] > 0 ? `\n\nBiggest climb: ${schoolName(up[0])}, up ${up[1]}.` : "") +
        (out.length ? ` Dropped out: ${out.map(schoolName).join(", ")}.` : ""),
    });
  }
  const cfp = latestPoll(state, "cfp");
  if (cfp && cfp.date === date) {
    story(state, O.sentinel, "analyst", {
      kind: "college", college: true,
      headline: `Playoff rankings: ${schoolName(cfp.ranks[0])} on top`,
      body: `The committee's top 12:\n${cfp.ranks.slice(0, 12).map((t, i) => `${i + 1}. ${schoolName(t)}`).join("\n")}`,
    });
  }
  // Prospect injuries that matter to draft boards.
  for (const [id, inj] of Object.entries(c.injuries)) {
    if (inj.date !== date) continue;
    const r = mediaRank(state, id);
    if (r > 120) continue;
    const p = draftClass(state.seed).byId[id];
    if (!p) continue;
    story(state, O.sentinel, "reporter", {
      kind: "college", college: true, prospects: [id],
      headline: `${schoolName(p.school)} ${p.position} ${p.name} ${inj.seasonEnding ? "out for the season" : "hurt"}: ${inj.type.toLowerCase()}`,
      body: `${p.name}, No. ${r} on our big board, ${inj.seasonEnding ? "will miss the rest of the season" : `is expected back around ${inj.returnDate.slice(5).replace("-", "/")}`}. ` +
        `NFL teams will want a close look at the medicals${r <= 40 ? "; a first-round grade is now harder to hold" : ""}.`,
    });
  }
  // Stock report on Wednesdays from October to the draft.
  if (weekday(date) === "Wednesday" && date >= "2026-10-01" && date < KEY.draftStart) {
    const snap = m.hypeSnap;
    const now = c.hype;
    if (snap) {
      const ranked = Object.keys(now).filter((id) => mediaRank(state, id) <= 150 && id in snap);
      const moves = ranked.map((id) => [id, now[id] - snap[id]] as const).sort((a, b) => b[1] - a[1]);
      const up = moves.slice(0, 3).filter(([, d]) => d > 0.3);
      const down = moves.slice(-3).reverse().filter(([, d]) => d < -0.3);
      if (up.length || down.length) {
        const dc = draftClass(state.seed);
        const row = (id: string) => `${dc.byId[id].position} ${dc.byId[id].name}, ${schoolName(dc.byId[id].school)} (No. ${mediaRank(state, id)}): ${prospectLine(dc.byId[id], prospectTotals(state, id))}`;
        story(state, O.sentinel, "draft", {
          kind: "draft", college: true, prospects: [...up, ...down].map(([id]) => id),
          headline: up.length ? `Stock up: ${dc.byId[up[0][0]].name} is rising fast` : `Stock down: ${dc.byId[down[0][0]].name} slipping`,
          body: (up.length ? `Stock up\n${up.map(([id]) => row(id)).join("\n")}` : "") + (down.length ? `\n\nStock down\n${down.map(([id]) => row(id)).join("\n")}` : ""),
        });
      }
    }
    m.hypeSnap = { ...now };
  }
  void rng;
}

function upsetWinner(state: GameState, g: { away: string; home: string; id: string }): string {
  const [a, h] = state.college!.results[g.id];
  return h > a ? g.home : g.away;
}
function upsetLoser(state: GameState, g: { away: string; home: string; id: string }): string {
  const [a, h] = state.college!.results[g.id];
  return h > a ? g.away : g.home;
}

function mockCoverage(state: GameState): void {
  const mock = state.draft?.mocks[0];
  if (!mock || mock.date !== state.date) return;
  const outlet = MEDIA.find((o) => o.name === mock.outlet) ?? O.ledger;
  const dc = draftClass(state.seed);
  const lines = mock.players.slice(0, 10).map((id, i) => `${i + 1}. ${nick(mock.teams[i])}: ${dc.byId[id].position} ${dc.byId[id].name}, ${schoolName(dc.byId[id].school)}`);
  const ours = mock.teams.map((t, i) => [t, i] as const).filter(([t]) => t === state.userTeam).slice(0, 2);
  story(state, outlet, "draft", {
    kind: "draft", college: true, teams: [mock.teams[0], ...ours.map(() => state.userTeam)], prospects: [mock.players[0], ...ours.map(([, i]) => mock.players[i])],
    headline: `${mock.analyst}'s mock draft ${mock.version}.0: ${nick(mock.teams[0])} take ${dc.byId[mock.players[0]].name} at No. 1`,
    body: lines.join("\n") + (ours.length ? `\n\n${nick(state.userTeam)}: ${ours.map(([, i]) => `No. ${i + 1}, ${dc.byId[mock.players[i]].position} ${dc.byId[mock.players[i]].name}`).join("; ")}` : ""),
  });
}

/** After each draft day: every grading outlet hands out grades, team by team. */
function draftCoverage(state: GameState): void {
  const day = draftDayOf(state.date);
  const d = state.draft;
  if (!day || !d?.daysDone.includes(day)) return;
  const m = mediaState(state);
  if (m.asked[`draftday:${day}`]) return;
  m.asked[`draftday:${day}`] = state.date;
  const dc = draftClass(state.seed);
  const rounds = DAY_ROUNDS[day - 1];
  const picks = d.made.filter((x) => rounds.includes(parsePick(x.pick).round));
  if (!picks.length) return;
  const graders = MEDIA.filter((o) => o.grader);
  const teamGrades: Record<string, Record<string, string>> = {};
  for (const o of graders) {
    const byTeam: Record<string, number[]> = {};
    for (const p of picks) {
      const rank = mediaRank(state, p.player);
      const noise = gaussian(rngFor(state.seed, `media:dg:${o.id}:${p.player}`)) * 0.07;
      // Taking a player well before the boards had him is a reach; after, a steal.
      const value = Math.max(-1.2, Math.min(1.2, (p.overall - rank) / Math.max(8, p.overall * 0.45)));
      (byTeam[p.team] ??= []).push(1 + 0.16 * value + noise + gradeLean(state, o.grader!, p.team));
    }
    for (const [team, xs] of Object.entries(byTeam)) (teamGrades[team] ??= {})[o.id] = letter(xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  const label = rounds.length === 1 ? "Round 1" : `Rounds ${rounds[0]}-${rounds[rounds.length - 1]}`;
  const gp = (g: string) => "FDCBA".indexOf(g[0]) + (g.endsWith("+") ? 0.3 : g.endsWith("-") ? -0.3 : 0);
  for (const o of graders) {
    const list = Object.entries(teamGrades).map(([t, g]) => [t, g[o.id]] as const).sort((a, b) => gp(b[1]) - gp(a[1]));
    const ours = teamGrades[state.userTeam]?.[o.id];
    const ourPicks = picks.filter((x) => x.team === state.userTeam);
    story(state, o, "draft", {
      kind: "draft", college: true, teams: [list[0][0], ...(ours ? [state.userTeam] : [])],
      prospects: ourPicks.map((x) => x.player),
      headline: `${label} grades: the ${nick(list[0][0])} ${o.id === "capspace" ? "got the best value" : "won the day"}${ours ? `; ${nick(state.userTeam)} get ${/^[AEF]/.test(ours) ? "an" : "a"} ${ours}` : ""}`,
      body: `Winners: ${list.slice(0, 3).map(([t, g]) => `${nick(t)} (${g})`).join(", ")}.\nLosers: ${list.slice(-3).reverse().map(([t, g]) => `${nick(t)} (${g})`).join(", ")}.` +
        (ours ? `\n\n${nick(state.userTeam)} (${ours}): ${ourPicks.map((x) => `No. ${x.overall} ${dc.byId[x.player].position} ${dc.byId[x.player].name} (consensus board: No. ${mediaRank(state, x.player)})`).join("; ")}.` : ""),
    });
  }
  if (day === 1) {
    const first = picks.slice(0, 3);
    story(state, O.sentinel, "columnist", {
      kind: "draft", college: true, prospects: first.map((x) => x.player), teams: first.map((x) => x.team),
      headline: `${dc.byId[first[0].player].name} goes first overall to the ${nick(first[0].team)}`,
      body: first.map((x) => `No. ${x.overall}: ${teamLabel(x.team)}, ${dc.byId[x.player].position} ${dc.byId[x.player].name} (${schoolName(dc.byId[x.player].school)})`).join("\n") +
        `\n\nThe surprise of the night: ${(() => {
          const reach = [...picks].sort((a, b) => (mediaRank(state, b.player) - b.overall) - (mediaRank(state, a.player) - a.overall))[0];
          return `the ${nick(reach.team)} taking ${dc.byId[reach.player].name} at No. ${reach.overall}, well ahead of where the boards had him (No. ${mediaRank(state, reach.player)}).`;
        })()}`,
    });
  }
  if (day === 3) {
    // Whole-class grades from the Ledger.
    const all = d.made;
    const byTeam: Record<string, number[]> = {};
    for (const p of all) {
      const rank = mediaRank(state, p.player);
      const value = Math.max(-1.2, Math.min(1.2, (p.overall - rank) / Math.max(8, p.overall * 0.45)));
      (byTeam[p.team] ??= []).push(1 + 0.14 * value + gradeLean(state, "The Gridiron Ledger", p.team));
    }
    const list = Object.entries(byTeam).map(([t, xs]) => [t, letter(xs.reduce((a, b) => a + b, 0) / xs.length)] as const).sort((a, b) => gp(b[1]) - gp(a[1]));
    story(state, O.ledger, "draft", {
      kind: "draft", college: true, teams: [list[0][0], state.userTeam],
      headline: `${DRAFT_YEAR} draft class grades for all 32 teams`,
      body: list.map(([t, g]) => `${teamLabel(t)}: ${g}`).join("\n"),
    });
  }
}

// ---- Every day: the evergreen beats that fill the quiet days ----

function campNotebook(state: GameState, team: string): void {
  const rng = rngFor(state.seed, `media:camp:${team}:${state.date}`);
  const chart = depthChart(state, team);
  const battles = (["QB", "RB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K"] as Position[]).flatMap((pos) => {
    const [a, b] = (chart[pos] ?? []).filter((x) => PLAYER_BY_ID[x] && !state.players[x]?.injury);
    if (!a || !b) return [];
    const gap = Math.abs(marketView(state, a) - marketView(state, b));
    return gap < 3 ? [[pos, a, b, gap] as const] : [];
  }).sort((x, y) => x[3] - y[3]);
  const rookies = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && PLAYER_BY_ID[id].yearsExp === 0 && PLAYER_BY_ID[id].draft.round)
    .sort((a, b) => marketView(state, b) - marketView(state, a));
  const lines: string[] = [];
  const players: string[] = [];
  const battle = battles.length ? pick(rng, battles.slice(0, 3)) : null;
  if (battle) {
    lines.push(`The fight to watch: ${pname(battle[1])} and ${pname(battle[2])} for the starting ${battle[0]} job. ${pick(rng, [
      `${last(pname(battle[1]))} has taken more first-team reps, but the gap is small.`,
      `Coaches have rotated them with the ones all week.`,
      `${last(pname(battle[2]))} had the better day today.`,
    ])}`);
    players.push(battle[1], battle[2]);
  }
  const rookie = rookies.length ? pick(rng, rookies.slice(0, 3)) : null;
  if (rookie) {
    lines.push(`${pick(rng, ["Rookie", "First-year"])} ${ppos(rookie)} ${pname(rookie)} ${pick(rng, ["keeps showing up on the practice tape.", "had a rough day and heard about it from the position coach.", "is getting work with the starters.", "looks every bit like a draft pick who'll play early."])}`);
    players.push(rookie);
  }
  const hold = teamPlayerIds(state, team).find((id) => state.players[id].holdout && PLAYER_BY_ID[id]);
  if (hold) {
    lines.push(`${pname(hold)} is still ${state.players[hold].holdout!.kind === "holdout" ? "away from the team" : "not practicing"} while he waits on a new deal.`);
    players.push(hold);
  }
  if (!lines.length) return;
  lines.push(`"${pick(rng, ["Competition brings out the best in everybody.", "We're not putting anybody in pads in the depth chart yet. It's earned.", "Good, physical day. We needed that one."])}" ${hcName(team)} said.`);
  story(state, team === state.userTeam ? O.ledger : O.sideline, "reporter", {
    kind: "interview", teams: [team], players,
    headline: `${nick(team)} camp notebook: ${battle ? `${last(pname(battle[1]))} vs. ${last(pname(battle[2]))}` : rookie ? `${last(pname(rookie))} turning heads` : `${last(pname(hold!))} watch continues`}`,
    body: lines.join(" "),
  });
}

function injuryRoundup(state: GameState): void {
  const sunday = addDays(state.date, 2);
  const out = Object.entries(state.players).filter(([id, ps]) => ps.team && ps.injury && ps.injury.returnDate > sunday && PLAYER_BY_ID[id] && ps.status !== "fa")
    .map(([id]) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 86).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!out.length) return;
  story(state, O.sideline, "insider", {
    kind: "injury", teams: [...new Set(out.map(([id]) => state.players[id].team!))], players: out.map(([id]) => id),
    headline: `Injury roundup: ${pname(out[0][0])} among the big names out this week`,
    body: `Players who won't go this weekend:\n${out.map(([id]) => `${nick(state.players[id].team!)} ${ppos(id)} ${pname(id)} (${state.players[id].injury!.type.toLowerCase()})`).join("\n")}`,
  });
}

function heismanWatch(state: GameState): void {
  const dc = draftClass(state.seed);
  const race = awardRace(state, AWARDS[0], 5);
  if (!race.length) return;
  story(state, O.sentinel, "columnist", {
    kind: "college", college: true, prospects: race,
    headline: `Heisman watch: ${dc.byId[race[0]].name} leads the race`,
    body: race.map((id, i) => `${i + 1}. ${dc.byId[id].position} ${dc.byId[id].name}, ${schoolName(dc.byId[id].school)}: ${prospectLine(dc.byId[id], prospectTotals(state, id))}`).join("\n"),
  });
}

function collegePreview(state: GameState): void {
  const c = state.college;
  const poll = latestPoll(state, "ap");
  if (!c || !poll) return;
  const rank = (t: string) => {
    const i = poll.ranks.slice(0, 25).indexOf(t);
    return i < 0 ? 40 : i + 1;
  };
  const games = gamesOn(state, addDays(state.date, 1)).filter((g) => rank(g.away) <= 25 || rank(g.home) <= 25)
    .sort((a, b) => (rank(a.away) + rank(a.home)) - (rank(b.away) + rank(b.home))).slice(0, 4);
  if (!games.length) return;
  story(state, O.sentinel, "analyst", {
    kind: "college", college: true,
    headline: `Saturday's best: ${rankedName(state, games[0].away, poll)} at ${rankedName(state, games[0].home, poll)}`,
    body: games.map((g) => `${rankedName(state, g.away, poll)} at ${rankedName(state, g.home, poll)}${g.name ? ` (${g.name})` : ""}`).join("\n"),
  });
}

const PROFILE_TAKES: Record<string, string[]> = {
  QB: ["Throws with anticipation; the question is the arm at the next level.", "Big arm, and he knows it. Has to speed up his process.", "Plays within structure. Not a lot of off-script magic."],
  RB: ["Patient runner with burst through the hole.", "Physical between the tackles; how much is left for third down?", "Home-run speed. Ball security is the knock."],
  WR: ["Separates at the top of routes. Plays bigger than his size.", "Vertical threat who has to prove he can win against press.", "Reliable hands, smooth in and out of breaks."],
  TE: ["A real receiving weapon; the blocking is a work in progress.", "Old-school in-line tight end who can surprise you up the seam."],
  OT: ["Long, athletic, and still learning to use his hands.", "Plug-and-play tackle in a gap scheme; speed rushers test him."],
  OG: ["Road grader in the run game.", "Smart, steady, rarely beaten clean."],
  C: ["Runs the line calls like a veteran.", "Undersized, but the leverage and hands are there."],
  EDGE: ["Bend around the corner you can't teach.", "Power rusher who needs a counter move.", "Relentless motor; the production backs it up."],
  IDL: ["Penetrating three-technique who lives in the backfield.", "Run-stuffer first. The pass rush is the question."],
  LB: ["Sideline-to-sideline speed, a willing hitter.", "Instinctive and tough; can he cover backs in space?"],
  CB: ["Sticky in man coverage, competes at the catch point.", "Length and ball skills; the long speed needs a stopwatch."],
  S: ["Rangy center fielder.", "Box safety who plays like a linebacker."],
  K: ["Big leg, inconsistent from 50-plus."], P: ["Hang time to burn."], LS: ["Snaps on the money."], FB: ["A lead blocker who catches the ball."],
};

function prospectProfile(state: GameState, index: number): void {
  const board = mediaBoard(state).filter((id) => !state.draft?.made.some((x) => x.player === id));
  const id = board[index % Math.min(120, board.length)];
  if (!id) return;
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const rng = rngFor(state.seed, `media:profile:${id}`);
  const combine = state.draft?.combine?.[id];
  const spot = mockSpot(state, id);
  const r = mediaRank(state, id);
  story(state, O.sentinel, "draft", {
    kind: "draft", college: true, prospects: [id],
    headline: `Prospect profile: ${p.position} ${p.name}, ${schoolName(p.school)} (No. ${r})`,
    body: `${p.classYear}, listed at ${Math.floor(p.heightIn / 12)}-${p.heightIn % 12}, ${p.weightLb}. ${prospectLine(p, prospectTotals(state, id))}.` +
      (combine?.forty ? ` Ran a ${combine.forty.toFixed(2)} forty at the combine.` : "") +
      `\n\n${pick(rng, PROFILE_TAKES[p.position] ?? ["Interesting player."])} ` +
      (r <= 15 ? "A top-15 talent on our board." : r <= 40 ? "First-round grade from us." : r <= 100 ? "A Day 2 player." : "A Day 3 name worth knowing.") +
      (spot ? ` The latest ${spot.mock.outlet} mock has him going No. ${spot.overall} to the ${nick(spot.team)}.` : ""),
  });
}

function teamQuestions(state: GameState, team: string): void {
  const next = RULES.season + 1;
  const cap = capSummary(state, team, next);
  const pending = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && isPendingFreeAgent(state, id))
    .map((id) => [id, marketView(state, id)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const chart = depthChart(state, team);
  const weakest = (["QB", "WR", "CB", "EDGE", "OT", "S", "IDL", "LB", "TE", "RB", "OG", "C"] as Position[])
    .map((pos) => [pos, chart[pos]?.[0] ? marketView(state, chart[pos][0]) : 60] as const).sort((a, b) => a[1] - b[1])[0];
  const r = standings(state)[team];
  story(state, O.ledger, "columnist", {
    kind: "trend", teams: [team], players: pending.map(([id]) => id),
    headline: `Offseason questions: the ${teamLabel(team)}`,
    body: `${recordOf(r)} in ${RULES.season}. ` +
      `Projected ${next} cap space: ${money(cap.space)}.\n` +
      (pending.length ? `Biggest decisions: ${pending.map(([id]) => `${ppos(id)} ${pname(id)}`).join(", ")}${pending.length && isPendingFreeAgent(state, pending[0][0]) ? " are headed for free agency" : ""}.\n` : "") +
      (weakest ? `The spot to fix: ${weakest[0]}.` : ""),
  });
}

function evergreen(state: GameState): void {
  const date = state.date;
  const day = daysBetween("2026-07-01", date);
  const wd = weekday(date);
  const us = state.userTeam;
  const others = TEAMS.map((t) => t.id).filter((t) => t !== us);
  if (date < KEY.regularSeasonStart && date >= addDays(KEY.regularSeasonStart, -60)) {
    if (day % 2 === 0) campNotebook(state, us);
    campNotebook(state, others[day % others.length]);
  }
  if (date > KEY.regularSeasonStart && date <= KEY.regularSeasonEnd && wd === "Friday") injuryRoundup(state);
  if (date >= "2026-09-10" && date <= "2026-12-10") {
    if (wd === "Thursday") heismanWatch(state);
    if (wd === "Friday") collegePreview(state);
  }
  if (date >= "2026-12-01" && date < KEY.draftStart && state.college) prospectProfile(state, daysBetween("2026-12-01", date));
  if (date > KEY.regularSeasonEnd && date < KEY.draftStart) {
    const done = TEAMS.map((t) => t.id).filter((t) => !stillPlaying(state, t));
    if (done.length) teamQuestions(state, done[day % done.length]);
  }
}

// ---- The day ----

/** Everything the outlets file today. Runs at the end of the day, after the league has moved. */
export function mediaDaily(state: GameState): void {
  mediaState(state);
  gameCoverage(state);
  injuryCoverage(state);
  signingCoverage(state);
  releaseCoverage(state);
  tradeCoverage(state);
  wireCoverage(state);
  rumorMill(state);
  interviews(state);
  trends(state);
  offseasonTrends(state);
  collegeCoverage(state);
  mockCoverage(state);
  if (DRAFT_DAYS.includes(state.date)) draftCoverage(state);
  evergreen(state);
  pruneStories(state);
}

/** Stories filed on a day, newest first. */
export function storiesOn(state: GameState, date: string): Story[] {
  return (state.media?.stories ?? []).filter((s) => s.date === date);
}
