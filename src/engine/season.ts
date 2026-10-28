// The game clock: starting a new game and moving the league forward one day.
import { capSummary } from "./cap";
import { addDays, daysBetween, kickoff, shortDate, weekday } from "./dates";
import { GAMES_BY_DATE, PLAYER_BY_ID, PLAYERS, RULES, SCHEDULE, TEAM_BY_ID, teamLabel } from "./league";
import { weeklyDevelopment } from "./development";
import { healInjuries, injure, injuryRisk } from "./injuries";
import { applyCutdown, depthChart, fillEmergencies, fillPracticeSquad, formPracticeSquads, gameDayElevations, manageInjuredReserve, practiceSquad, proposeFinal53, protectPracticeSquads, rosterCount, trimPlan, type RosterMove } from "./roster";
import { processWaivers } from "./waivers";
import { applyTerminationPay } from "./roster";
import { rngFor } from "./rng";
import { simulateGame } from "./sim";
import { stat } from "./stats";
import { DEFENSE_LABEL, OFFENSE_LABEL } from "./schemes";
import { playCaller, teamSchemes, teamStaff } from "./staff";

import { fillConference, fillDivisional, fillSuperBowl, fillWildCard, matchup, standings } from "./standings";
import type { BoxScore, GameResult, GameState, Position, ScheduledGame, Settings } from "./types";
import { payWeek } from "./finance";
import { contractsDaily, startHoldouts } from "./negotiation";
import { faDaily, stillPlaying } from "./freeagency";
import { isOffseason, offseasonDaily, CAP_SET_DATE } from "./offseason";
import { money, news, send } from "./inbox";
import { tradesDaily } from "./trades";
import { collegeDaily, newCollege } from "./college";
import { scoutingDaily } from "./scouting";
import { advanceToEndOfDay, clearDraftees, dayDone, dayLabel, draftDaily, draftDayOf, DRAFT_DAYS, DRAFT_OVER, FIRST_MOCK } from "./draft";

const KEY = RULES.keyDates;
export const SEASON_OVER_DATE = addDays(KEY.superBowl, 1);
/** The game runs through the draft for now. */
export const GAME_OVER_DATE = DRAFT_OVER;

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
  clearDraftees();
  const players: GameState["players"] = {};
  for (const p of PLAYERS) {
    players[p.id] = p.team ? { team: p.team, status: "camp" } : { team: null, status: "fa", ...(p.lastTeam ? { lastTeam: p.lastTeam } : {}) };
  }
  const date = veteranReportDate(userTeam);
  const state: GameState = {
    version: 3,
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
    box: {},
    contracts: {},
    negotiations: {},
    trust: {},
    signings: [],
    finance: {},
    pressure: { fans: 50, media: 50 },
    playoffTeams: {},
    inbox: [],
    news: [],
    draft: { made: [], mocks: [], daysDone: [], nextMock: FIRST_MOCK },
  };
  state.college = newCollege(state);
  const team = TEAM_BY_ID[userTeam];
  startHoldouts(state);
  const cap = capSummary(state, userTeam);
  const { roster } = rosterCount(state, userTeam);
  const opener = openingGame(userTeam);
  const oppId = opener.home === userTeam ? opener.away! : opener.home!;
  const staff = teamStaff(userTeam);
  const gm = staff.GM ? `${staff.GM.name}, general manager` : "General Manager";
  const hc = staff.HC ? `${staff.HC.name}, head coach` : "Head Coach";
  send(state, "staff", gm, `Welcome to ${team.city}`,
    `Veterans report to training camp today. We have ${roster} players in camp and have to be at 53 by ` +
    `${shortDate(KEY.rosterCutdown)}. Under the Top 51 rule we're using ${money(cap.used)} of our ` +
    `${money(cap.limit)} adjusted cap, which leaves ${money(cap.space)} in space. ` +
    `Our opener is ${opener.home === userTeam ? "at home against" : "on the road at"} ${teamLabel(oppId)} on ` +
    `${weekday(opener.date)}, ${shortDate(opener.date)}. I'll bring you a cut plan before the deadline.`);
  const schemes = teamSchemes(userTeam);
  const off = playCaller(userTeam, "offense");
  const def = playCaller(userTeam, "defense");
  send(state, "staff", hc,
    "Camp starts today",
    `We'll practice most days and take a day off every so often to keep the legs fresh. On offense we run ${OFFENSE_LABEL[schemes.offense].toLowerCase()}` +
    ` (${off.name} calls the plays); on defense, ${DEFENSE_LABEL[schemes.defense].toLowerCase()} (${def.name} calls it). ` +
    "Players who fit what we do will get every chance to win jobs. You'll hear from me after every game, and my read on any player is on their page.");
  const col = teamStaff(userTeam).COL;
  send(state, "staff", `${col?.name ?? "Director of college scouting"}, director of college scouting`, "Setting up our draft scouting",
    "The college season kicks off at the end of August, and the 2027 draft class is out there now. Tell us where to look on the " +
    "Scouting page: a region, a conference, a school, positions, a college system, or specific players. Narrow assignments get you " +
    "the full picture on a few players; broad ones get a little on a lot of them. Every trip comes out of our scouting budget, and " +
    "campuses far from here cost more to reach. I'll file a report every Sunday.");
  return state;
}

// ---- What happens on a given day ----

export interface AgendaItem {
  /** Stable within a day: "game", "practice", "meeting:weekly", "league:tradeDeadline"... */
  id: string;
  kind: "game" | "practice" | "meeting" | "off" | "league" | "travel" | "draft";
  title: string;
  detail?: string;
  gameId?: string;
  /** Something the owner plays out today, rather than something that happens when the day ends. */
  action?: "game" | "practice" | "meeting" | "review" | "draft";
}

export const KEY_DATE_LABELS: Record<string, string> = {
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
  franchiseTagWindowOpens: "Teams can use franchise and transition tags",
  scoutingCombineStart: "The scouting combine opens in Indianapolis",
  franchiseTagDeadline: "Tag deadline, 4 PM ET",
  negotiatingWindowOpens: "Negotiating window: teams can talk to other teams' free agents",
  newLeagueYear: "New league year, 4 PM ET: free agency opens, expiring deals end, tender deadline",
  annualLeagueMeeting: "Annual league meeting",
  draftStart: "The 2027 NFL Draft",
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
    if (KEY[key] === date && key !== "draftStart") items.push({ id: `league:${key}`, kind: "league", title: label });
  }
  const draftDay = draftDayOf(date);
  if (draftDay) {
    items.push({
      id: "draft", kind: "draft", action: "draft", title: `The ${RULES.season + 1} NFL Draft, ${dayLabel(draftDay)}`,
      detail: "No clock: the draft moves when you move it. Skipped picks of ours are made by the GM.",
    });
    return items;
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
      id: "game", kind: "game", gameId: mine.id, action: "game",
      title: `${mine.label ?? gameTypeLabel(mine)}: ${home ? "vs" : "at"} ${teamLabel(opp)}`,
      detail: `${kickoff(mine.timeET)} · ${mine.stadium ?? TEAM_BY_ID[m.home].stadium}${mine.city ? `, ${mine.city}` : ""}`,
    });
    return items;
  }
  if (date === CAP_SET_DATE) items.push({ id: "league:cap", kind: "league", title: "The league announces the 2027 salary cap" });
  if (date >= SEASON_OVER_DATE) {
    if (!items.length) items.push(offseasonItem(date));
    return items;
  }

  const wd = weekday(date);
  const next = nextTeamGame(team, date, state);
  const last = lastTeamGame(team, date, state);
  const sinceLast = last ? daysBetween(last.date, date) : 99;
  const untilNext = next ? daysBetween(date, next.date) : 99;
  const inCamp = date < KEY.regularSeasonStart;

  if (!next && date > KEY.regularSeasonEnd) {
    items.push({ id: "off", kind: "off", title: "Season over for us", detail: "The staff is starting end-of-season evaluations." });
    return items;
  }
  if (wd === "Monday" && sinceLast > 1) items.push({ id: "meeting:weekly", kind: "meeting", action: "meeting", title: "Weekly front office meeting", detail: "GM and head coach brief you on the roster and the cap." });
  const practice = (title: string, detail?: string) => items.push({ id: "practice", kind: "practice", action: "practice", title, detail });
  if (inCamp) {
    if (date === veteranReportDate(team)) items.push({ id: "meeting:report", kind: "meeting", action: "meeting", title: "Veterans report to camp", detail: "Physicals, conditioning tests and the team meeting." });
    else if (untilNext === 1) practice("Walkthrough and travel prep");
    else if (sinceLast === 1) practice("Film review and recovery");
    else if (daysBetween(veteranReportDate(team), date) % 6 === 5) items.push({ id: "off", kind: "off", title: "Day off" });
    else practice("Training camp practice", "Full pads.");
    if (date === addDays(KEY.rosterCutdown, -3)) items.push({ id: "meeting:cutdown", kind: "meeting", action: "review", title: "Cutdown meeting", detail: "The GM's proposed 53 is ready for your review." });
    return items;
  }
  if (untilNext > 9) items.push({ id: "off", kind: "off", title: "Bye week", detail: "Players are off; coaches self-scout." });
  else if (untilNext === 1) practice("Walkthrough", next?.away === team ? "Team flies out this afternoon." : undefined);
  else if (sinceLast === 1) practice("Film review and recovery");
  else if (sinceLast === 2 && untilNext > 4) items.push({ id: "off", kind: "off", title: "Players' day off", detail: "Coaches start the game plan." });
  else practice("Practice", untilNext <= 3 ? "Situational work: red zone and third down." : "Game plan install.");
  return items;
}

/** What the calendar shows for a day: the agenda, plus waiver deadlines that involve us. */
export function calendarItems(state: GameState, date: string): AgendaItem[] {
  const items = agenda(state, date);
  if (date >= state.date) {
    for (const w of Object.values(state.waivers ?? {})) {
      if (w.clears !== date) continue;
      const ours = w.from === state.userTeam;
      const claimed = w.claims.some((c) => c.team === state.userTeam);
      if (!ours && !claimed) continue;
      const p = PLAYER_BY_ID[w.player];
      items.push({
        id: `waiver:${w.player}`, kind: "league",
        title: `Waiver claims on ${p.position} ${p.name} are awarded`,
        detail: ours ? "We released this player." : "We put in a claim.",
      });
    }
  }
  return items;
}

function offseasonItem(date: string): AgendaItem {
  const item = (title: string, detail: string): AgendaItem => ({ id: "meeting:offseason", kind: "meeting", title, detail });
  if (date < KEY.franchiseTagWindowOpens) return item("Season review", "Exit interviews and end-of-season evaluations.");
  if (date < KEY.scoutingCombineStart) return item("Free agency planning", "The GM and cap staff work through our expiring contracts.");
  if (date < KEY.negotiatingWindowOpens) return item("Combine and free agency prep", "Scouts are in Indianapolis; the front office works on re-signings.");
  if (date < addDays(KEY.newLeagueYear, 7)) return item("Free agency", "The front office is on the phones with agents all day.");
  return item("Offseason work", "Free agency continues while the scouts finish the draft board.");
}

export function gameTypeLabel(g: ScheduledGame): string {
  if (g.type === "PRE") return g.week === 0 ? "Hall of Fame Game" : `Preseason Week ${g.week}`;
  if (g.type === "REG") return `Week ${g.week}`;
  return { WC: "Wild Card", DIV: "Divisional Round", CONF: `${g.conference} Championship`, SB: "Super Bowl LXI" }[g.round!];
}

// ---- Advancing ----

/** League dates still to come, soonest first. */
export function upcomingKeyDates(state: GameState, limit = 4): { date: string; label: string }[] {
  return Object.entries(KEY_DATE_LABELS)
    .filter(([key]) => KEY[key] && KEY[key] > state.date)
    .map(([key, label]) => ({ date: KEY[key], label }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function isSeasonOver(state: GameState): boolean {
  return state.date >= SEASON_OVER_DATE;
}

/** The end of what the game can play for now: draft day. */
export function isGameOver(state: GameState): boolean {
  return state.date >= GAME_OVER_DATE;
}

/** The start of the day, before any event: injuries heal, waiver claims are awarded, Week 1 moves. Runs once a day. */
export function startDay(state: GameState): void {
  if (state.day?.date === state.date) return;
  const date = state.date;
  state.day = { date, done: {} };
  healInjuries(state);
  // Waiver claims are awarded first thing; practice squads form once the cutdown claims are in.
  processWaivers(state);
  if (date === KEY.practiceSquadSigningOpens) formPracticeSquads(state);
  if (date === KEY.regularSeasonStart) applyTerminationPay(state);
}

/** Simulates one scheduled game, with game-day practice squad elevations and the reports that follow. */
function playGame(state: GameState, g: ScheduledGame): GameResult | undefined {
  if (state.results[g.id]) return state.results[g.id];
  const m = matchup(state, g);
  if (!m) return undefined;
  if (g.type !== "PRE") {
    for (const team of [m.away, m.home]) {
      const up = gameDayElevations(state, team);
      if (team === state.userTeam && up.length) {
        send(state, "staff", `${teamStaff(team).HC?.name ?? "Head Coach"}, head coach`, "Practice squad elevations",
          `We're thin, so I elevated ${up.map((id) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name}`).join(" and ")} from the practice squad for today's game.`);
      }
    }
  }
  const { result, box } = simulateGame(state, g, m.away, m.home);
  state.results[g.id] = result;
  state.box[g.id] = box;
  reportGame(state, g, result, box);
  return result;
}

/** Today's events the owner still has to play out. */
export function pendingEvents(state: GameState): AgendaItem[] {
  if (isGameOver(state)) return [];
  const done = state.day?.date === state.date ? state.day.done : {};
  return agenda(state).filter((a) => a.action && !(a.action === "draft" ? dayDone(state) : a.id in done));
}

/** What came of an event the owner already handled today, if they did. */
export function eventOutcome(state: GameState, id: string): string | undefined {
  if (id === "draft" && dayDone(state)) return (state.day?.date === state.date ? state.day.done.draft : undefined) ?? "Day complete.";
  return state.day?.date === state.date ? state.day.done[id] : undefined;
}

/**
 * Plays out one of today's events: simulates our game, runs practice, or holds a meeting.
 * `byOwner` is false when the day is ending and the staff handle whatever the owner skipped.
 */
export function playEvent(state: GameState, id: string, byOwner = true): string | undefined {
  const item = agenda(state).find((a) => a.id === id);
  if (!item?.action || isGameOver(state)) return undefined;
  startDay(state);
  if (item.action === "draft") {
    // The owner runs the draft from the draft room; when the day ends, the GM finishes it.
    if (!byOwner) advanceToEndOfDay(state);
    return state.day!.done.draft;
  }
  const done = state.day!.done;
  if (id in done) return done[id];
  let outcome = "";
  const us = state.userTeam;
  if (item.action === "game") {
    const g = SCHEDULE.find((x) => x.id === item.gameId)!;
    const r = playGame(state, g);
    if (r) {
      const ours = r.home === us ? r.homeScore : r.awayScore;
      const theirs = r.home === us ? r.awayScore : r.homeScore;
      outcome = `${ours > theirs ? "W" : ours < theirs ? "L" : "T"} ${ours}-${theirs}${r.overtime ? " (OT)" : ""}`;
    }
  } else if (item.action === "practice") {
    const hurt = practiceInjuries(state, new Set(), [us]);
    outcome = !practices(state, us, new Set()) ? "Light day: no contact work."
      : hurt.length ? hurt.map((h) => `${PLAYER_BY_ID[h.id].position} ${PLAYER_BY_ID[h.id].name} hurt: ${h.type.toLowerCase()}, ${h.out}.`).join(" ")
      : "Good work, everyone came out healthy.";
  } else if (item.action === "meeting") {
    if (id === "meeting:weekly") {
      if (byOwner) {
        briefing(state);
        outcome = BRIEFED;
      } else outcome = "The GM and head coach met without you.";
    } else outcome = byOwner ? "You addressed the team." : "The head coach ran the meeting.";
  } else if (item.action === "review") {
    outcome = byOwner ? "You went over the GM's plan." : "The GM will submit the plan unless you change it.";
  }
  done[id] = outcome;
  return outcome;
}

/** Plays out the current day and moves the clock to the next morning. Events the owner skipped are simmed. */
export function advanceDay(state: GameState): void {
  if (isGameOver(state)) return;
  const date = state.date;
  startDay(state);
  for (const a of pendingEvents(state)) playEvent(state, a.id, false);

  for (const g of GAMES_BY_DATE[date] ?? []) playGame(state, g);
  const playedToday = new Set<string>();
  for (const g of GAMES_BY_DATE[date] ?? []) {
    const r = state.results[g.id];
    if (r) playedToday.add(r.away).add(r.home);
  }

  const offseason = isOffseason(date);
  // Our practice, if there was one, was an event of its own.
  if (!offseason) practiceInjuries(state, playedToday, Object.keys(TEAM_BY_ID).filter((t) => t !== state.userTeam));
  if (date === KEY.rosterCutdown) runCutdown(state);
  if (!offseason) rosterUpkeep(state);
  offseasonDaily(state);
  contractsDaily(state);
  faDaily(state);
  tradesDaily(state);
  draftDaily(state);
  collegeDaily(state);
  scoutingDaily(state);
  if (weekday(date) === "Tuesday" && !offseason && date > KEY.rosterCutdown) {
    protectPracticeSquads(state);
    for (const t of Object.keys(TEAM_BY_ID)) {
      if (stillPlaying(state, t) && practiceSquad(state, t).length < RULES.rosterLimits.practiceSquad - 2) fillPracticeSquad(state, t);
    }
  }
  if (weekday(date) === "Tuesday" && !offseason) {
    weeklyDevelopment(state, playedLastWeek(state));
    if (date > KEY.regularSeasonStart && date <= addDays(KEY.regularSeasonEnd, 2)) payWeek(state);
  }
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
          : "The 2026 season is complete. The offseason starts tomorrow.");
    }
  }
  if (date === addDays(KEY.rosterCutdown, -3)) {
    send(state, "staff", `${teamStaff(state.userTeam).GM?.name ?? "General Manager"}, general manager`, "Proposed 53-man roster",
      "My cut plan is on the Roster page under Cutdown. Look it over and swap anyone you feel strongly about. " +
      `If you change nothing, I'll submit it on ${shortDate(KEY.rosterCutdown)}.`);
  }
  const briefed = state.day?.done["meeting:weekly"] === BRIEFED;
  if (weekday(date) === "Monday" && date >= KEY.regularSeasonStart && date <= KEY.regularSeasonEnd && !briefed) weeklyReport(state);

  state.date = addDays(date, 1);
}

function runCutdown(state: GameState): void {
  for (const team of Object.keys(TEAM_BY_ID)) {
    const keep = team === state.userTeam && state.cutPlan?.length
      ? trimPlan(state, team, state.cutPlan.filter((id) => state.players[id]?.team === team && ["camp", "active"].includes(state.players[id].status)))
      : proposeFinal53(state, team);
    const { cut, ps } = applyCutdown(state, team, keep);
    if (team === state.userTeam) {
      const cap = capSummary(state, team);
      send(state, "transaction", `${teamStaff(team).GM?.name ?? "General Manager"}, general manager`, "We're at 53",
        `We released ${cut.length + ps.length} players and brought ${ps.length} of them back on the practice squad. ` +
        `Cap space is now ${money(cap.space)}. The full roster is on the Roster page.`);
    }
  }
  state.cutPlan = undefined;
  news(state, "All 32 teams trimmed their rosters to 53.");
}

function reportGame(state: GameState, g: ScheduledGame, r: GameResult, box: BoxScore): void {
  const winnerHome = r.homeScore > r.awayScore;
  const tie = r.homeScore === r.awayScore;
  const line = tie
    ? `${r.away} and ${r.home} tie ${r.awayScore}-${r.homeScore}`
    : `${winnerHome ? r.home : r.away} ${Math.max(r.homeScore, r.awayScore)}, ${winnerHome ? r.away : r.home} ${Math.min(r.homeScore, r.awayScore)}${r.overtime ? " (OT)" : ""}`;
  news(state, `${gameTypeLabel(g)}: ${line}`);
  // League injury news for starters.
  for (const inj of box.injuries) {
    if (inj.team === state.userTeam) continue;
    const pos = PLAYER_BY_ID[inj.player].position;
    const chart = depthChart(state, inj.team, addDays(state.date, -1));
    if (chart[pos].slice(0, STARTERS[pos] ?? 1).includes(inj.player) && state.players[inj.player].injury?.date === state.date) {
      const out = state.players[inj.player].injury!;
      if (daysBetween(state.date, out.returnDate) >= 7) {
        news(state, `${TEAM_BY_ID[inj.team].name} ${pos} ${PLAYER_BY_ID[inj.player].name}: ${out.type.toLowerCase()}, ${outLabel(state.date, out.returnDate, out.seasonEnding)}`);
      }
    }
  }
  const us = state.userTeam;
  if (r.away !== us && r.home !== us) return;
  const side = r.home === us ? "home" : "away";
  const ours = r.home === us ? r.homeScore : r.awayScore;
  const theirs = r.home === us ? r.awayScore : r.homeScore;
  const opp = r.home === us ? r.away : r.home;
  const verdict = ours > theirs ? "We won" : ours < theirs ? "We lost" : "We tied";
  const rec = standings(state)[us];
  const record = g.type === "REG" ? ` We're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.` : "";
  const tone = g.type === "PRE"
    ? "Most of the starters sat, so the tape is mostly about the depth chart."
    : ours > theirs ? "Good week of work showed up on game day." : "We'll get it fixed on the practice field.";
  const hurt = box.injuries.filter((i) => i.team === us).map((i) => {
    const inj = state.players[i.player].injury;
    return `${PLAYER_BY_ID[i.player].name} (${i.type.toLowerCase()}${inj && inj.date === state.date ? `, ${outLabel(state.date, inj.returnDate, inj.seasonEnding)}` : ", returned"})`;
  });
  const hc = teamStaff(us).HC?.name ?? "Head Coach";
  send(state, "game", `${hc}, head coach`, `${verdict} ${ours}-${theirs} against ${TEAM_BY_ID[opp].name}${r.overtime ? " in overtime" : ""}`,
    `${gameTypeLabel(g)}. ${tone}${record}\n\n${standouts(box, side)}` +
    (hurt.length ? `\n\nInjuries: ${hurt.join("; ")}.` : ""),
    g.id);
}

const STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1 };

/** "out about 3 weeks", "out for the season" */
export function outLabel(from: string, returnDate: string, seasonEnding: boolean): string {
  if (seasonEnding) return "out for the season";
  const days = daysBetween(from, returnDate);
  if (days <= 3) return "day to day";
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "out about a week" : `out about ${weeks} weeks`;
}

/** A coach's quick summary of who stood out for one team. */
function standouts(box: BoxScore, side: "away" | "home"): string {
  const lines = Object.entries(box.players[side]);
  const best = (key: Parameters<typeof stat>[1]) => lines.reduce<[string, number[]] | null>((a, b) => (stat(b[1], key) > (a ? stat(a[1], key) : 0) ? b : a), null);
  const out: string[] = [];
  const qb = best("att");
  if (qb) out.push(`${PLAYER_BY_ID[qb[0]].name} went ${stat(qb[1], "cmp")} of ${stat(qb[1], "att")} for ${stat(qb[1], "passYds")} yards, ${stat(qb[1], "passTd")} TD and ${stat(qb[1], "int")} INT.`);
  const rb = best("rushYds");
  if (rb && stat(rb[1], "rushYds") >= 40) out.push(`${PLAYER_BY_ID[rb[0]].name} ran for ${stat(rb[1], "rushYds")} yards on ${stat(rb[1], "car")} carries.`);
  const wr = best("recYds");
  if (wr && stat(wr[1], "recYds") >= 40) out.push(`${PLAYER_BY_ID[wr[0]].name} caught ${stat(wr[1], "rec")} for ${stat(wr[1], "recYds")} yards.`);
  const sacker = best("sacks");
  if (sacker && stat(sacker[1], "sacks") >= 1) out.push(`${PLAYER_BY_ID[sacker[0]].name} had ${stat(sacker[1], "sacks")} sack${stat(sacker[1], "sacks") === 1 ? "" : "s"}.`);
  const picker = best("defInt");
  if (picker && stat(picker[1], "defInt") >= 1) out.push(`${PLAYER_BY_ID[picker[0]].name} picked one off.`);
  return out.join(" ");
}

/** Days a team practices: not game day or the day after, with a day off every so often in camp. */
function practices(state: GameState, team: string, playedToday: Set<string>): boolean {
  if (playedToday.has(team)) return false;
  const date = state.date;
  if (date < veteranReportDate(team)) return false;
  const prev = addDays(date, -1);
  if ((GAMES_BY_DATE[prev] ?? []).some((g) => { const m = matchup(state, g); return m && (m.away === team || m.home === team); })) return false;
  if (date < KEY.regularSeasonStart) return daysBetween(veteranReportDate(team), date) % 6 !== 5;
  return ["Wednesday", "Thursday", "Friday"].includes(weekday(date));
}

/** Practice injuries for the given teams; returns ours. */
function practiceInjuries(state: GameState, playedToday: Set<string>, teams: string[]): { id: string; type: string; out: string }[] {
  const camp = state.date < KEY.regularSeasonStart;
  const ours: { id: string; type: string; out: string }[] = [];
  for (const team of teams) {
    if (!practices(state, team, playedToday)) continue;
    const rng = rngFor(state.seed, `practice:${state.date}:${team}`);
    if (rng() > (camp ? 0.09 : 0.03)) continue;
    const ids = Object.keys(state.players).filter((id) => {
      const p = state.players[id];
      return p.team === team && (p.status === "camp" || p.status === "active") && !p.injury;
    });
    if (!ids.length) continue;
    const id = ids[Math.floor(rng() * ids.length)];
    if (rng() > Math.min(1, 0.7 * injuryRisk(state, id, team))) continue;
    const { injury } = injure(state, id, team, rng, true);
    if (team === state.userTeam) {
      ours.push({ id, type: injury.type, out: outLabel(state.date, injury.returnDate, injury.seasonEnding) });
      const trn = teamStaff(team).TRN?.name ?? "Head athletic trainer";
      send(state, "staff", `${trn}, head athletic trainer`, `${PLAYER_BY_ID[id].name} hurt in practice`,
        `${PLAYER_BY_ID[id].name} (${PLAYER_BY_ID[id].position}) came up with a ${injury.type.toLowerCase()} in practice today. ` +
        `We expect ${PLAYER_BY_ID[id].name.split(" ").slice(-1)[0]} to be ${outLabel(state.date, injury.returnDate, injury.seasonEnding)}.`);
    }
  }
  return ours;
}

/** Daily roster upkeep for every team: injured reserve, returns, and emergency signings. */
function rosterUpkeep(state: GameState): void {
  for (const team of Object.keys(TEAM_BY_ID)) {
    const moves: RosterMove[] = [...manageInjuredReserve(state, team), ...fillEmergencies(state, team)];
    if (!moves.length) continue;
    if (team === state.userTeam) {
      const gm = teamStaff(team).GM?.name ?? "General Manager";
      send(state, "transaction", `${gm}, general manager`, moves.length === 1 ? "Roster move" : "Roster moves",
        `We ${moves.map((m) => m.text).join("; ")}.`);
    }
  }
}

function playedLastWeek(state: GameState): Set<string> {
  const out = new Set<string>();
  for (let i = 1; i <= 7; i++) {
    for (const g of GAMES_BY_DATE[addDays(state.date, -i)] ?? []) {
      const box = state.box[g.id];
      if (!box) continue;
      for (const side of ["away", "home"] as const) {
        for (const [id, v] of Object.entries(box.players[side])) if (stat(v, "offSnaps") + stat(v, "defSnaps") >= 10) out.add(id);
      }
    }
  }
  return out;
}

const BRIEFED = "The GM's briefing notes are in your inbox.";

/** The owner sat in on the weekly meeting: the GM's notes, which stand in for the weekly report. */
function briefing(state: GameState): void {
  const us = state.userTeam;
  const cap = capSummary(state, us);
  const rec = standings(state)[us];
  const next = nextTeamGame(us, state.date, state);
  const m = next && matchup(state, next);
  const hurt = Object.values(state.players).filter((p) => p.team === us && p.injury && p.status !== "fa").length;
  const talks = Object.values(state.negotiations).filter((n) => n.team === us && n.status === "open").length;
  const inSeason = state.date >= KEY.regularSeasonStart;
  send(state, "staff", `${teamStaff(us).GM?.name ?? "General Manager"}, general manager`, "Notes from the weekly meeting",
    (inSeason ? `Record: ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}. Points for ${rec.pf}, against ${rec.pa}. ` : "") +
    `Cap space: ${money(cap.space)}. ` +
    (m ? `Next up: ${gameTypeLabel(next!)} ${m.home === us ? "against" : "at"} ${teamLabel(m.home === us ? m.away : m.home)} on ${weekday(next!.date)}, ${shortDate(next!.date)}. ` : "") +
    `${hurt ? `${hurt} player${hurt === 1 ? " is" : "s are"} on the injury report.` : "Nobody is on the injury report."} ` +
    (talks ? `We have ${talks} contract talk${talks === 1 ? "" : "s"} open. ` : "") +
    (state.date < KEY.tradeDeadline ? `Trade deadline: ${shortDate(KEY.tradeDeadline)}.` : "The trade deadline has passed."));
}

function weeklyReport(state: GameState): void {
  const cap = capSummary(state, state.userTeam);
  const rec = standings(state)[state.userTeam];
  send(state, "staff", `${teamStaff(state.userTeam).GM?.name ?? "General Manager"}, general manager`, "Weekly front office report",
    `Record: ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}. Points for ${rec.pf}, against ${rec.pa}. ` +
    `Cap space: ${money(cap.space)}. Trade deadline: ${shortDate(KEY.tradeDeadline)}.`);
}

/** Offseason days worth stopping on. */
const OFFSEASON_STOPS = [KEY.franchiseTagWindowOpens, CAP_SET_DATE, KEY.franchiseTagDeadline, addDays(KEY.newLeagueYear, -2), KEY.negotiatingWindowOpens, KEY.newLeagueYear, addDays(KEY.newLeagueYear, 1), addDays(KEY.newLeagueYear, 2), ...DRAFT_DAYS];

/** A draft day the owner hasn't finished: the clock waits for the owner (or "Sim rest of day"). */
export function draftWaiting(state: GameState): boolean {
  return !!draftDayOf(state.date) && !dayDone(state) && !isGameOver(state);
}

/** In the offseason: advance to the next key date, at most a week. */
export function advanceToNextEvent(state: GameState): void {
  if (draftWaiting(state)) return;
  const start = state.date;
  for (let i = 0; i < 7 && !isGameOver(state); i++) {
    advanceDay(state);
    if (OFFSEASON_STOPS.includes(state.date) && state.date !== start) return;
  }
}

/** Advances until the user's next game has been played, or a stop day. */
export function simToNextGame(state: GameState): void {
  const start = state.date;
  if (isSeasonOver(state)) return advanceToNextEvent(state);
  for (let i = 0; i < 60 && !isSeasonOver(state); i++) {
    const hadGame = agenda(state).some((a) => a.kind === "game");
    const isStop = state.date !== start && state.date === KEY.rosterCutdown;
    if (isStop) return;
    advanceDay(state);
    if (hadGame) return;
  }
}

export { money } from "./inbox";
