// Daily coverage from the made-up outlets (engine/outlets.ts): game stories,
// injuries, signings and releases, trades and trade rumors, interviews,
// weekly trends, college football and the draft. Reporters only know what the
// public knows, plus what leaks: rumors are sometimes true and sometimes not.
import { FORMAT } from "./format";
import { notableWeather } from "./gameday";
import { capSummary, teamPlayerIds } from "./cap";
import { AWARDS, awardRace, gamesOn, latestPoll, mediaBoard, mediaRank, prospectLine, prospectTotals, rankedName } from "./college";
import { schoolName } from "./collegeData";
import { addDays, daysBetween, weekday } from "./dates";
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
import { standings, matchup, type Record_ } from "./standings";
import { seasonTotals, stat, type StatLine } from "./stats";
import { outlook, parsePick } from "./trades";
import type { BoxScore, GameState, Position, ScheduledGame, Story } from "./types";
import { money } from "./inbox";
import { composeDay, fileFacts } from "./media/compose";
import { arcsDaily } from "./media/arcs";
import { narrativesDaily } from "./media/narratives";
import { socialDaily } from "./media/social";
import { opinionDaily } from "./media/opinion";
import { ownerDeskDaily } from "./media/ownerdesk";
import { coverageDaily } from "./media/coverage";
import { campFact, seatFact, talkFacts } from "./media/desks";
import { corpsDaily } from "./media/corps";
import { rumorDesk } from "./media/rumors";

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
  const wx = box.weather && notableWeather(box.weather);
  if (wx) lines.splice(1, 0, wx);
  if (hurt.length) lines.push(`Injuries: ${hurt.slice(0, 3).map((i) => `${nick(i.team)} ${ppos(i.player)} ${pname(i.player)} (${i.type.toLowerCase()})`).join("; ")}.`);
  story(state, outlet, by, {
    kind: "recap", headline: head, body: lines.join(" "), teams: [r.away, r.home],
    players: [star?.[0], loserStar?.[0]].filter((x): x is string => !!x), gameId: g.id,
  });
}

/** Preseason games: our game gets a story, the rest share a scoreboard. */
function preseasonCoverage(state: GameState): void {
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
    // Everything but the draft and college goes through the story engine's wire desk.
    if (n.topic && n.topic !== "draft" && n.topic !== "college") continue;
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

// ---- Interviews ----

function interviews(state: GameState): void {
  const date = state.date;
  const inSeason = date >= KEY.regularSeasonStart && date <= KEY.regularSeasonEnd;
  if (!inSeason || weekday(date) !== "Wednesday") return;
  fileFacts(state, talkFacts(state, rngFor(state.seed, `media:talk:${date}`)), 3);
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
  const pace = qb ? Math.round(((qb[1].line.passYds ?? 0) / Math.max(1, qb[1].line.g ?? 1)) * FORMAT.games) : 0;
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
  if (wd === "Thursday" && date >= addDays(KEY.regularSeasonStart, 14)) statWatch(state);
  if (wd === "Wednesday") weekPreview(state);
  if (wd === "Tuesday" && date >= addDays(KEY.regularSeasonStart, 40)) hotSeat(state);
}

function hotSeat(state: GameState): void {
  const f = seatFact(state, rngFor(state.seed, `media:hot:${state.date}`));
  if (f) fileFacts(state, [f], 2);
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
  if (weekday(date) === "Wednesday" && date >= `${RULES.season}-10-01` && date < KEY.draftStart) {
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
  const f = campFact(state, team, rngFor(state.seed, `media:camp:${team}:${state.date}`));
  if (f) fileFacts(state, [f], 2);
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
  const day = Math.abs(daysBetween(`${RULES.season}-07-01`, date));
  const wd = weekday(date);
  const us = state.userTeam;
  const others = TEAMS.map((t) => t.id).filter((t) => t !== us);
  if (date < KEY.regularSeasonStart && date >= addDays(KEY.regularSeasonStart, -60)) {
    if (day % 2 === 0) campNotebook(state, us);
    campNotebook(state, others[day % others.length]);
  }
  if (date > KEY.regularSeasonStart && date <= KEY.regularSeasonEnd && wd === "Friday") injuryRoundup(state);
  if (date >= `${RULES.season}-09-10` && date <= `${RULES.season}-12-10`) {
    if (wd === "Thursday") heismanWatch(state);
    if (wd === "Friday") collegePreview(state);
  }
  if (date >= `${RULES.season}-12-01` && date < KEY.draftStart && state.college) prospectProfile(state, daysBetween(`${RULES.season}-12-01`, date));
  if (date > KEY.regularSeasonEnd && date < KEY.draftStart) {
    const done = TEAMS.map((t) => t.id).filter((t) => !stillPlaying(state, t));
    if (done.length) teamQuestions(state, done[day % done.length]);
  }
}

// ---- The day ----

/** Everything the outlets file today. Runs at the end of the day, after the league has moved. */
export function mediaDaily(state: GameState): void {
  mediaState(state);
  preseasonCoverage(state);
  // Games, big days, injuries, signings, releases, claims and trades go through the story engine.
  const facts = composeDay(state);
  // The running stories: arcs open from the day's facts and the league's state, move a phase, or end.
  const arcFacts = arcsDaily(state, facts);
  // The calendar's stories: award races, the playoff picture, the deadline, draft stock, anniversaries, milestones, retrospectives, tributes.
  const seasonFacts = narrativesDaily(state);
  // The Huddle reacts to all of it; then the opinion desk argues about it.
  socialDaily(state, [...facts, ...arcFacts, ...seasonFacts]);
  const opinionFacts = opinionDaily(state);
  ownerDeskDaily(state, facts);
  // What the coverage does: tones for clubs and players that move fans, sponsors, agents and more.
  coverageDaily(state, [...facts, ...arcFacts, ...seasonFacts, ...opinionFacts]);
  wireCoverage(state);
  corpsDaily(state);
  rumorDesk(state);
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
