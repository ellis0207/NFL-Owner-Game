// The game clock: starting a new game and moving the league forward one day.
import { capSummary } from "./cap";
import { addDays, daysBetween, kickoff, shortDate, weekday } from "./dates";
import { GAMES_BY_DATE, PLAYERS, RULES, SCHEDULE, TEAM_BY_ID, teamLabel } from "./league";
import { applyCutdown, proposeFinal53, rosterCount, trimPlan } from "./roster";
import { simulateGame } from "./sim";
import { fillConference, fillDivisional, fillSuperBowl, fillWildCard, matchup, standings } from "./standings";
import type { GameState, InboxItem, ScheduledGame, Settings } from "./types";

const KEY = RULES.keyDates;
export const SEASON_OVER_DATE = addDays(KEY.superBowl, 1);

/** A team's first regular-season game. */
export function openingGame(team: string): ScheduledGame {
  return SCHEDULE.find((g) => g.type === "REG" && (g.away === team || g.home === team))!;
}

/** Veterans report 47 days before a team's opener (48 before a Monday opener). */
export function veteranReportDate(team: string): string {
  const opener = openingGame(team);
  const days = opener.weekday === "Monday" ? RULES.veteranReportDaysBeforeMondayOpener : RULES.veteranReportDaysBeforeOpener;
  return addDays(opener.date, -days);
}

export function newGame(userTeam: string, ownerName: string, settings: Settings, seed = Date.now() % 2 ** 31): GameState {
  const players: GameState["players"] = {};
  for (const p of PLAYERS) players[p.id] = { team: p.team, status: "camp" };
  const date = veteranReportDate(userTeam);
  const state: GameState = {
    version: 1,
    id: `${userTeam}-${seed.toString(36)}`,
    createdAt: new Date().toISOString(),
    ownerName,
    userTeam,
    settings,
    date,
    seed,
    players,
    deadMoney: {},
    results: {},
    playoffTeams: {},
    inbox: [],
    news: [],
  };
  const team = TEAM_BY_ID[userTeam];
  const cap = capSummary(state, userTeam);
  const { roster } = rosterCount(state, userTeam);
  const opener = openingGame(userTeam);
  const oppId = opener.home === userTeam ? opener.away! : opener.home!;
  send(state, "staff", "General Manager", `Welcome to ${team.city}`,
    `Veterans report to training camp today. We have ${roster} players in camp and have to be at 53 by ` +
    `${shortDate(KEY.rosterCutdown)}. Under the Top 51 rule we're using ${money(cap.used)} of our ` +
    `${money(cap.limit)} adjusted cap, which leaves ${money(cap.space)} in space. ` +
    `Our opener is ${opener.home === userTeam ? "at home against" : "on the road at"} ${teamLabel(oppId)} on ` +
    `${weekday(opener.date)}, ${shortDate(opener.date)}. I'll bring you a cut plan before the deadline.`);
  send(state, "staff", "Head Coach",
    "Camp starts today",
    "We'll practice most days and take a day off every so often to keep the legs fresh. You'll hear from me after every game.");
  return state;
}

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}

function send(state: GameState, kind: InboxItem["kind"], from: string, title: string, body: string): void {
  state.inbox.unshift({ id: `${state.date}-${state.inbox.length}`, date: state.date, kind, from, title, body, read: false });
}

function news(state: GameState, text: string): void {
  state.news.unshift({ date: state.date, text });
  if (state.news.length > 300) state.news.length = 300;
}

// ---- What happens on a given day ----

export interface AgendaItem {
  kind: "game" | "practice" | "meeting" | "off" | "league" | "travel";
  title: string;
  detail?: string;
  gameId?: string;
}

const KEY_DATE_LABELS: Record<string, string> = {
  hallOfFameGame: "Hall of Fame Game in Canton",
  rosterCutdown: "Roster cutdown: every team must be at 53 by 4 PM ET",
  cutdownWaiversExpire: "Waiver claims on cut players are awarded",
  practiceSquadSigningOpens: "Practice squads can be formed",
  regularSeasonStart: "Regular season kicks off",
  waiverOrderByStandings: "Waiver order now follows the standings",
  tradeDeadline: "Trade deadline, 4 PM ET",
  veteranWaiversBegin: "Veterans are now subject to waivers",
  unsignedTenderDeadline: "Deadline to sign tendered players",
  regularSeasonEnd: "Final day of the regular season",
  reserveFutureSigningsOpen: "Reserve/future contracts can be signed",
  postseasonRosterFreeze: "Playoff rosters freeze",
  wildCardWeekend: "Wild Card Weekend begins",
  divisionalRound: "Divisional Round begins",
  conferenceChampionships: "Conference Championship Sunday",
  superBowl: "Super Bowl LXI at SoFi Stadium",
};

function nextTeamGame(team: string, date: string, state: GameState): ScheduledGame | undefined {
  return SCHEDULE.find((g) => g.date >= date && (() => {
    const m = matchup(state, g);
    return !!m && (m.away === team || m.home === team);
  })());
}

function lastTeamGame(team: string, date: string, state: GameState): ScheduledGame | undefined {
  for (let i = SCHEDULE.length - 1; i >= 0; i--) {
    const g = SCHEDULE[i];
    if (g.date >= date) continue;
    const m = matchup(state, g);
    if (m && (m.away === team || m.home === team)) return g;
  }
  return undefined;
}

export function agenda(state: GameState, date = state.date): AgendaItem[] {
  const items: AgendaItem[] = [];
  const team = state.userTeam;
  for (const [key, label] of Object.entries(KEY_DATE_LABELS)) {
    if (KEY[key] === date) items.push({ kind: "league", title: label });
  }
  const mine = (GAMES_BY_DATE[date] ?? []).find((g) => {
    const m = matchup(state, g);
    return m && (m.away === team || m.home === team);
  });
  if (mine) {
    const m = matchup(state, mine)!;
    const home = m.home === team;
    const opp = home ? m.away : m.home;
    items.push({
      kind: "game", gameId: mine.id,
      title: `${mine.label ?? gameTypeLabel(mine)}: ${home ? "vs" : "at"} ${teamLabel(opp)}`,
      detail: `${kickoff(mine.timeET)} · ${mine.stadium ?? TEAM_BY_ID[m.home].stadium}${mine.city ? `, ${mine.city}` : ""}`,
    });
    return items;
  }
  if (date >= SEASON_OVER_DATE) return items;

  const wd = weekday(date);
  const next = nextTeamGame(team, date, state);
  const last = lastTeamGame(team, date, state);
  const sinceLast = last ? daysBetween(last.date, date) : 99;
  const untilNext = next ? daysBetween(date, next.date) : 99;
  const inCamp = date < KEY.regularSeasonStart;

  if (!next && date > KEY.regularSeasonEnd) {
    items.push({ kind: "off", title: "Season over for us", detail: "The staff is starting end-of-season evaluations." });
    return items;
  }
  if (wd === "Monday" && sinceLast > 1) items.push({ kind: "meeting", title: "Weekly front office meeting", detail: "GM and head coach brief you on the roster and the cap." });
  if (inCamp) {
    if (date === veteranReportDate(team)) items.push({ kind: "meeting", title: "Veterans report to camp", detail: "Physicals, conditioning tests and the team meeting." });
    else if (untilNext === 1) items.push({ kind: "practice", title: "Walkthrough and travel prep" });
    else if (sinceLast === 1) items.push({ kind: "practice", title: "Film review and recovery" });
    else if (daysBetween(veteranReportDate(team), date) % 6 === 5) items.push({ kind: "off", title: "Day off" });
    else items.push({ kind: "practice", title: "Training camp practice", detail: "Full pads." });
    if (date === addDays(KEY.rosterCutdown, -3)) items.push({ kind: "meeting", title: "Cutdown meeting", detail: "The GM's proposed 53 is ready for your review." });
    return items;
  }
  if (untilNext > 9) items.push({ kind: "off", title: "Bye week", detail: "Players are off; coaches self-scout." });
  else if (untilNext === 1) items.push({ kind: "practice", title: "Walkthrough", detail: next?.away === team ? "Team flies out this afternoon." : undefined });
  else if (sinceLast === 1) items.push({ kind: "practice", title: "Film review and recovery" });
  else if (sinceLast === 2 && untilNext > 4) items.push({ kind: "off", title: "Players' day off", detail: "Coaches start the game plan." });
  else items.push({ kind: "practice", title: "Practice", detail: untilNext <= 3 ? "Situational work: red zone and third down." : "Game plan install." });
  return items;
}

export function gameTypeLabel(g: ScheduledGame): string {
  if (g.type === "PRE") return g.week === 0 ? "Hall of Fame Game" : `Preseason Week ${g.week}`;
  if (g.type === "REG") return `Week ${g.week}`;
  return { WC: "Wild Card", DIV: "Divisional Round", CONF: `${g.conference} Championship`, SB: "Super Bowl LXI" }[g.round!];
}

// ---- Advancing ----

export function isSeasonOver(state: GameState): boolean {
  return state.date >= SEASON_OVER_DATE;
}

/** Plays out the current day and moves the clock to the next morning. */
export function advanceDay(state: GameState): void {
  if (isSeasonOver(state)) return;
  const date = state.date;

  for (const g of GAMES_BY_DATE[date] ?? []) {
    if (state.results[g.id]) continue;
    const m = matchup(state, g);
    if (!m) continue;
    const result = simulateGame(state, g, m.away, m.home);
    state.results[g.id] = result;
    reportGame(state, g, result);
  }

  if (date === KEY.rosterCutdown) runCutdown(state);
  if (date === KEY.regularSeasonEnd) {
    fillWildCard(state);
    const seeds = state.seeds!;
    const conf = TEAM_BY_ID[state.userTeam].conference;
    const seed = seeds[conf].indexOf(state.userTeam);
    send(state, "league", "League Office", "Playoff field set",
      `AFC: ${seeds.AFC.map((t, i) => `${i + 1}. ${t}`).join(", ")}\nNFC: ${seeds.NFC.map((t, i) => `${i + 1}. ${t}`).join(", ")}\n\n` +
      (seed >= 0 ? `We're the ${conf}'s ${seed + 1} seed.` : "We missed the playoffs."));
  }
  if (date === addDays(KEY.wildCardWeekend, 2)) fillDivisional(state);
  if (date === addDays(KEY.divisionalRound, 1)) fillConference(state);
  if (date === KEY.conferenceChampionships) fillSuperBowl(state);
  if (date === KEY.superBowl) {
    const sb = SCHEDULE.find((g) => g.round === "SB")!;
    const r = state.results[sb.id];
    if (r) {
      state.champion = r.homeScore > r.awayScore ? r.home : r.away;
      send(state, "league", "League Office", `${teamLabel(state.champion)} win Super Bowl LXI`,
        state.champion === state.userTeam
          ? "You're a Super Bowl champion. The parade route is being planned."
          : "The 2026 season is complete. The offseason arrives in a later update.");
    }
  }
  if (date === addDays(KEY.rosterCutdown, -3)) {
    send(state, "staff", "General Manager", "Proposed 53-man roster",
      "My cut plan is on the Roster page under Cutdown. Look it over and swap anyone you feel strongly about. " +
      `If you change nothing, I'll submit it on ${shortDate(KEY.rosterCutdown)}.`);
  }
  if (weekday(date) === "Monday" && date >= KEY.regularSeasonStart && date <= KEY.regularSeasonEnd) weeklyReport(state);

  state.date = addDays(date, 1);
}

function runCutdown(state: GameState): void {
  for (const team of Object.keys(TEAM_BY_ID)) {
    const keep = team === state.userTeam && state.cutPlan?.length
      ? trimPlan(state.cutPlan.filter((id) => state.players[id]?.team === team))
      : proposeFinal53(state, team);
    const { cut, ps } = applyCutdown(state, team, keep);
    if (team === state.userTeam) {
      const cap = capSummary(state, team);
      send(state, "transaction", "General Manager", "We're at 53",
        `We released ${cut.length + ps.length} players and brought ${ps.length} of them back on the practice squad. ` +
        `Cap space is now ${money(cap.space)}. The full roster is on the Roster page.`);
    }
  }
  state.cutPlan = undefined;
  news(state, "All 32 teams trimmed their rosters to 53.");
}

function reportGame(state: GameState, g: ScheduledGame, r: { away: string; home: string; awayScore: number; homeScore: number; overtime: boolean }): void {
  const winnerHome = r.homeScore > r.awayScore;
  const tie = r.homeScore === r.awayScore;
  const line = tie
    ? `${r.away} and ${r.home} tie ${r.awayScore}-${r.homeScore}`
    : `${winnerHome ? r.home : r.away} ${Math.max(r.homeScore, r.awayScore)}, ${winnerHome ? r.away : r.home} ${Math.min(r.homeScore, r.awayScore)}${r.overtime ? " (OT)" : ""}`;
  news(state, `${gameTypeLabel(g)}: ${line}`);
  const us = state.userTeam;
  if (r.away !== us && r.home !== us) return;
  const ours = r.home === us ? r.homeScore : r.awayScore;
  const theirs = r.home === us ? r.awayScore : r.homeScore;
  const opp = r.home === us ? r.away : r.home;
  const verdict = ours > theirs ? "We won" : ours < theirs ? "We lost" : "We tied";
  const rec = standings(state)[us];
  const record = g.type === "REG" ? ` We're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.` : "";
  const tone = g.type === "PRE"
    ? "Most of the starters sat after the first quarter, so the tape is mostly about the depth chart."
    : ours > theirs ? "Good week of work showed up on Sunday." : "We'll get it fixed on the practice field.";
  send(state, "game", "Head Coach", `${verdict} ${ours}-${theirs} against ${TEAM_BY_ID[opp].name}${r.overtime ? " in overtime" : ""}`,
    `${gameTypeLabel(g)}. ${tone}${record}`);
}

function weeklyReport(state: GameState): void {
  const cap = capSummary(state, state.userTeam);
  const rec = standings(state)[state.userTeam];
  send(state, "staff", "General Manager", "Weekly front office report",
    `Record: ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}. Points for ${rec.pf}, against ${rec.pa}. ` +
    `Cap space: ${money(cap.space)}. Trade deadline: ${shortDate(KEY.tradeDeadline)}.`);
}

/** Advances until the user's next game has been played, or a stop day. */
export function simToNextGame(state: GameState): void {
  const start = state.date;
  for (let i = 0; i < 60 && !isSeasonOver(state); i++) {
    const hadGame = agenda(state).some((a) => a.kind === "game");
    const isStop = state.date !== start && state.date === KEY.rosterCutdown;
    if (isStop) return;
    advanceDay(state);
    if (hadGame) return;
  }
}
