// One season after another. A save runs in a season context (its key dates,
// its schedule, the caps the league has set), applied whenever the save is
// started or loaded. The day after each draft the league moves on: the season
// goes into the record books, players get a year older (better or worse),
// the unsigned drift away, and the next season's schedule comes out of last
// season's standings.
import { bindRules } from "./rules";
import { newStaffSeason } from "./carousel";
import { ageStaff, bindStaff } from "./coaches";
import { newBusinessSeason } from "./business";
import { buildSchedule, keyDatesFor, superBowlName } from "./calendar";
import { capSummary, invalidateRosters } from "./cap";
import { progressPlayers, retireUnsigned } from "./careers";
import { newCollege } from "./college";
import { addDays, shortDate, weekday } from "./dates";
import { FIRST_MOCK } from "./draft";
import { money, news, send } from "./inbox";
import { BASE_SCHEDULE, BASE_SEASON, bindCaps, GAME_BY_ID, PLAYER_BY_ID, PLAYERS, RULES, setLeagueSeason, TEAMS, teamLabel } from "./league";
import { invalidateMarket } from "./market";
import { setCarry } from "./prospects";
import { rosterCount } from "./roster";
import { divisionStandings, standings } from "./standings";
import { teamStaff } from "./staff";
import { parsePick } from "./trades";
import { noteDraft } from "./review";
import { seasonTotals } from "./stats";
import type { DraftArchive, GameState, History, SeasonRecord, SeasonStats, SnapSeason } from "./types";

function emptyHistory(): History {
  return { seasons: [], drafts: [], stats: {}, snaps: {}, retired: {} };
}

export function history(state: GameState): History {
  return (state.history ??= emptyHistory());
}

// ---- The season context ----

// The data's own numbers, before any save added its seasons to them.
const ORIGINAL = new Map<string, { exp: number; stats: SeasonStats[]; snaps: Record<string, SnapSeason> }>();

/**
 * Puts each player's credited seasons and the seasons played in this save
 * into the league's player list, on top of the real stats through 2025.
 */
export function patchPlayers(state: GameState): void {
  const hist = state.history;
  for (const p of PLAYERS) {
    let o = ORIGINAL.get(p.id);
    if (!o) ORIGINAL.set(p.id, (o = { exp: p.yearsExp, stats: p.stats, snaps: p.snaps }));
    p.yearsExp = state.players?.[p.id]?.exp ?? o.exp;
    const stats = hist?.stats[p.id];
    const snaps = hist?.snaps[p.id];
    p.stats = stats ? [...o.stats, ...stats] : o.stats;
    p.snaps = snaps ? { ...o.snaps, ...snaps } : o.snaps;
  }
}

/** Moves the league to the save's season: its dates, schedule, caps and draft classes. */
export function applySeason(state: GameState): void {
  const season = state.season ?? BASE_SEASON;
  const schedule = season === BASE_SEASON || !state.schedule ? BASE_SCHEDULE : state.schedule;
  setLeagueSeason(season, keyDatesFor(season), schedule, season === BASE_SEASON ? undefined : state.waiverOrder);
  bindCaps(state.league?.caps ?? {});
  bindRules(state);
  for (const a of state.history?.drafts ?? []) setCarry(state.seed, a.year, a.returned);
  patchPlayers(state);
}

/** Players on a 53 or injured reserve when the regular season ends earn a credited season. */
export function recordCredits(state: GameState): void {
  state.credited = Object.entries(state.players).filter(([, p]) => p.team && (p.status === "active" || p.status === "ir")).map(([id]) => id);
}

/** The league releases the regular-season schedule in mid-May (the Wednesday after May 10). */
export function scheduleReleaseDate(): string {
  let d = `${RULES.season}-05-11`;
  while (weekday(d) !== "Wednesday") d = addDays(d, 1);
  return d;
}

/** The schedule is public once the league releases it (the 2026 one was out when the game starts). */
export function scheduleReleased(state: GameState): boolean {
  return RULES.season === BASE_SEASON || state.date >= scheduleReleaseDate();
}

// ---- The record books ----

const LEADER_KEYS: [string, (l: Record<string, number>) => number][] = [
  ["passYds", (l) => l.passYds ?? 0], ["passTd", (l) => l.passTd ?? 0], ["rushYds", (l) => l.rushYds ?? 0], ["rushTd", (l) => l.rushTd ?? 0],
  ["rec", (l) => l.rec ?? 0], ["recYds", (l) => l.recYds ?? 0], ["recTd", (l) => l.recTd ?? 0],
  ["sacks", (l) => l.sacks ?? 0], ["defInt", (l) => l.defInt ?? 0], ["tackles", (l) => (l.tklSolo ?? 0) + (l.tklAst ?? 0)],
];

const ROUND_LOST: Record<string, string> = { WC: "WC", DIV: "DIV", CONF: "CONF", SB: "SB" };

function seasonRecord(state: GameState): SeasonRecord {
  const table = standings(state);
  const records: SeasonRecord["records"] = {};
  for (const t of TEAMS) {
    const r = table[t.id];
    records[t.id] = [r.w, r.l, r.t, r.pf, r.pa];
  }
  const place: Record<string, number> = {};
  for (const d of divisionStandings(state)) d.rows.forEach((r, i) => (place[r.team] = i + 1));
  const playoffs: Record<string, string> = {};
  let champion: string | undefined;
  let runnerUp: string | undefined;
  for (const [id, r] of Object.entries(state.results)) {
    const g = GAME_BY_ID[id];
    if (g?.type !== "POST" || !g.round) continue;
    const won = r.homeScore > r.awayScore ? r.home : r.away;
    const lost = won === r.home ? r.away : r.home;
    playoffs[lost] = ROUND_LOST[g.round];
    if (g.round === "SB") {
      playoffs[won] = "CHAMP";
      champion = won;
      runnerUp = lost;
    }
  }
  const leaders: SeasonRecord["leaders"] = {};
  const totals = seasonTotals(state, "REG");
  for (const [key, f] of LEADER_KEYS) {
    let best: [string, string, number] | undefined;
    for (const [id, row] of Object.entries(totals)) {
      const v = f(row.line as Record<string, number>);
      if (v > 0 && (!best || v > best[2])) best = [id, row.team, v];
    }
    if (best) leaders[key] = best;
  }
  return { season: RULES.season, champion: champion ?? state.champion, runnerUp, records, place, seeds: state.seeds, playoffs, leaders };
}

/** The regular season's stat lines and snap counts go into each player's career record. */
function archiveStats(state: GameState): void {
  const hist = history(state);
  const season = RULES.season;
  const totals = seasonTotals(state, "REG");
  // Each team's offensive, defensive and special teams plays, for snap shares.
  const teamSnaps: Record<string, [number, number, number]> = {};
  for (const [gameId, box] of Object.entries(state.box)) {
    if (GAME_BY_ID[gameId]?.type !== "REG") continue;
    const r = state.results[gameId];
    if (!r) continue;
    for (const side of ["away", "home"] as const) {
      const max = [0, 0, 0];
      for (const values of Object.values(box.players[side])) for (let i = 0; i < 3; i++) max[i] = Math.max(max[i], values[i] ?? 0);
      const t = (teamSnaps[r[side]] ??= [0, 0, 0]);
      for (let i = 0; i < 3; i++) t[i] += max[i];
    }
  }
  for (const [id, row] of Object.entries(totals)) {
    const { offSnaps = 0, defSnaps = 0, stSnaps = 0, g = 0, ...line } = row.line;
    const stat: SeasonStats = { season, team: row.team, g };
    for (const [k, v] of Object.entries(line)) if (v) stat[k] = v;
    (hist.stats[id] ??= []).push(stat);
    const ts = teamSnaps[row.team] ?? [1, 1, 1];
    (hist.snaps[id] ??= {})[String(season)] = {
      games: g, offense: offSnaps, defense: defSnaps, st: stSnaps,
      offShare: Math.round((offSnaps / Math.max(1, ts[0])) * 1000) / 1000,
      defShare: Math.round((defSnaps / Math.max(1, ts[1])) * 1000) / 1000,
      stShare: Math.round((stSnaps / Math.max(1, ts[2])) * 1000) / 1000,
    };
  }
}

/** Credited seasons: on a 53 or IR at the end of the regular season, or three games played. */
function creditSeasons(state: GameState): void {
  const credited = new Set(state.credited ?? []);
  for (const [id, row] of Object.entries(seasonTotals(state, "REG"))) if ((row.line.g ?? 0) >= 3) credited.add(id);
  for (const id of credited) {
    const p = state.players[id];
    const data = PLAYER_BY_ID[id];
    if (!p || !data) continue;
    p.exp = data.yearsExp + 1;
  }
  state.credited = [];
}

function archiveDraft(state: GameState): void {
  const d = state.draft;
  if (!d) return;
  const year = RULES.season + 1;
  const picks: DraftArchive["picks"] = d.made.map((m) => {
    const data = PLAYER_BY_ID[m.player];
    return [m.player, m.team, parsePick(m.pick).round, m.overall, data?.heightIn ?? 0, data?.weightLb ?? 0];
  });
  history(state).drafts.push({ year, picks, udfa: Object.entries(d.udfa ?? {}), returned: d.returned ?? [] });
  setCarry(state.seed, year, d.returned ?? []);
}

// ---- The rollover ----

/** The day after the draft: the league moves on to the next season. */
export function startNewSeason(state: GameState): void {
  const old = RULES.season;
  const next = old + 1;
  const hist = history(state);
  const record = seasonRecord(state);
  hist.seasons.push(record);
  archiveStats(state);
  creditSeasons(state);
  const retired = retireUnsigned(state);
  progressPlayers(state, next);
  ageStaff(state, next);
  archiveDraft(state);
  const firstRound = state.offseason?.draftOrder ?? TEAMS.map((t) => t.id);
  const knew = state.college?.scouting.know ?? {};
  const returned = state.draft?.returned ?? [];

  // A clean slate for the new season.
  state.results = {};
  state.box = {};
  state.playoffTeams = {};
  delete state.seeds;
  delete state.champion;
  delete state.cutPlan;
  delete state.offseason;
  state.psPlans = {};
  state.psProtect = {};
  if (state.termPay) for (const [id, y] of Object.entries(state.termPay)) if (y < next) delete state.termPay[id];
  if (state.league) {
    delete state.league.retiring;
    delete state.league.expiring;
    for (const y of Object.keys(state.league.cfa ?? {})) if (Number(y) <= next) delete state.league.cfa![Number(y)];
  }
  prune(state, next);

  state.schedule = buildSchedule(next, state.seed, record.place, record.champion);
  state.waiverOrder = firstRound;
  state.season = next;
  applySeason(state);
  newStaffSeason(state);
  bindStaff(state);
  invalidateRosters(state);
  invalidateMarket(state);

  state.college = newCollege(state);
  // What our scouts learned about the underclassmen who went back to school carries over, a little stale.
  for (const id of returned) if (knew[id]) state.college.scouting.know[id] = Math.round(knew[id] * 0.7);
  noteDraft(state);
  state.draft = { made: [], mocks: [], daysDone: [], nextMock: FIRST_MOCK };
  newBusinessSeason(state);
  if (state.media) {
    state.media.asked = {};
    state.media.leverage = {};
  }

  const champ = record.champion;
  news(state, `The league turns to the ${next} season${champ ? `, with the ${teamLabel(champ)} as defending champions` : ""}`);
  if (retired) news(state, `${retired} free agents who went unsigned through the spring have moved on from the game`);
  letter(state, record);
}

/** Old records the save no longer needs. */
function prune(state: GameState, next: number): void {
  const t = state.trades;
  if (t) {
    for (const id of Object.keys(t.picks)) if (Number(id.slice(0, 4)) < next + 1) delete t.picks[id];
    const cutoff = `${next - 3}-01-01`;
    t.log = t.log.filter((r) => r.date >= cutoff);
    t.offers = [];
    t.talks = {};
    if (t.noTradeTo) for (const [id, x] of Object.entries(t.noTradeTo)) if (x.until < state.date) delete t.noTradeTo[id];
  }
  if (state.inbox.length > 400) state.inbox.length = 400;
  if (state.news.length > 300) state.news.length = 300;
  if (state.transactions && state.transactions.length > 1500) state.transactions.length = 1500;
  const signedCutoff = `${next - 4}-01-01`;
  state.signings = state.signings.filter((s) => s.date >= signedCutoff);
  const yearAgo = addDays(state.date, -365);
  for (const [id, n] of Object.entries(state.negotiations)) if (n.status !== "open" && n.opened < yearAgo) delete state.negotiations[id];
  if (state.fa) for (const [id, fa] of Object.entries(state.fa)) if (fa.status === "signed" || state.players[id]?.status === "retired") delete state.fa[id];
}

/** The GM's note on the season ahead. */
function letter(state: GameState, record: SeasonRecord): void {
  const us = state.userTeam;
  const gm = teamStaff(us).GM;
  const [w, l, t] = record.records[us];
  const finish = record.playoffs[us] === "CHAMP" ? "won the Super Bowl" : record.playoffs[us] ? "made the playoffs" : "missed the playoffs";
  const { roster } = rosterCount(state, us);
  const cap = capSummary(state, us);
  send(state, "staff", gm ? `${gm.name}, general manager` : "General Manager", `On to ${RULES.season}`,
    `The ${record.season} season is in the books: we went ${w}-${l}${t ? `-${t}` : ""} and ${finish}. ` +
    `The rookies are in and we have ${roster} players under contract for ${RULES.season}, with ${money(cap.space)} in cap space under the Top 51 rule. ` +
    `The league releases the schedule on ${shortDate(scheduleReleaseDate())}; the offseason program runs through June, then everyone is off until camp. ` +
    `${superBowlName(RULES.season)} is ${shortDate(RULES.keyDates.superBowl)}.`);
}
