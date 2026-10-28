// The league, loaded once from the generated 2026 data files. The calendar
// moves: setLeagueSeason swaps in a later season's key dates and schedule, in
// place, and modules that derive dates from them recompute through
// onSeasonChange.
import playersJson from "../../data/league-2026/players.json";
import ratingsJson from "../../data/league-2026/hidden-ratings.json";
import teamsJson from "../../data/league-2026/teams.json";
import scheduleJson from "../../data/league-2026/schedule.json";
import rulesJson from "../../data/league-2026/rules.json";
import staffJson from "../../data/league-2026/staff.json";
import hiddenStaffJson from "../../data/league-2026/hidden-staff.json";
import type { HiddenRating, PlayerData, Rules, ScheduledGame, StaffData, StaffHidden, StaffPerson, TeamData } from "./types";

export const PLAYERS = playersJson as unknown as PlayerData[];
export const PLAYER_BY_ID: Record<string, PlayerData> = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
export const TEAMS = teamsJson as unknown as TeamData[];
export const TEAM_BY_ID: Record<string, TeamData> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export const SCHEDULE = scheduleJson as unknown as ScheduledGame[];
export const GAME_BY_ID: Record<string, ScheduledGame> = Object.fromEntries(SCHEDULE.map((g) => [g.id, g]));
export const RULES = rulesJson as unknown as Rules;

/** The season the data describes: the game starts in it. */
export const BASE_SEASON = 2026;
export const BASE_KEY_DATES: Readonly<Record<string, string>> = { ...RULES.keyDates };
export const BASE_SCHEDULE: readonly ScheduledGame[] = [...SCHEDULE];
const BASE_WAIVER_ORDER = [...RULES.waiverOrder];

/** The season the league is in now (it changes the day after the draft). */
export let SEASON = RULES.season;

const seasonHooks: (() => void)[] = [];

/** Runs `fn` now and whenever the league moves to another season. */
export function onSeasonChange(fn: () => void): void {
  seasonHooks.push(fn);
  fn();
}

/**
 * Moves the league to a season: its key dates, its schedule and the waiver
 * order it opens with. Everything is replaced in place, so modules holding
 * RULES.keyDates or SCHEDULE see the new season.
 */
export function setLeagueSeason(season: number, keyDates: Record<string, string>, schedule: readonly ScheduledGame[], waiverOrder?: string[]): void {
  RULES.season = season;
  SEASON = season;
  for (const k of Object.keys(RULES.keyDates)) delete RULES.keyDates[k];
  Object.assign(RULES.keyDates, keyDates);
  SCHEDULE.length = 0;
  SCHEDULE.push(...schedule);
  for (const k of Object.keys(GAME_BY_ID)) delete GAME_BY_ID[k];
  for (const g of SCHEDULE) GAME_BY_ID[g.id] = g;
  for (const k of Object.keys(GAMES_BY_DATE)) delete GAMES_BY_DATE[k];
  for (const g of SCHEDULE) (GAMES_BY_DATE[g.date] ??= []).push(g);
  RULES.waiverOrder = waiverOrder ?? BASE_WAIVER_ORDER;
  for (const fn of seasonHooks) fn();
}

/** Salary caps the league has announced in the active save, by league year (the save's own object). */
export let KNOWN_CAPS: Record<number, number> = {};

export function bindCaps(caps: Record<number, number>): void {
  KNOWN_CAPS = caps;
}

/**
 * True ratings. Only the engine (sim, AI roster decisions) may read these;
 * the owner never sees them. UI code must not import this.
 */
export const HIDDEN_RATINGS = ratingsJson as unknown as Record<string, HiddenRating>;

export const STAFF = staffJson as unknown as StaffData;
export const STAFF_BY_ID: Record<string, StaffPerson> = Object.fromEntries(STAFF.people.map((p) => [p.id, p]));
/** True staff quality. Engine only, like HIDDEN_RATINGS. */
export const HIDDEN_STAFF = hiddenStaffJson as unknown as Record<string, StaffHidden>;

export const GAMES_BY_DATE: Record<string, ScheduledGame[]> = {};
for (const g of SCHEDULE) (GAMES_BY_DATE[g.date] ??= []).push(g);

export function teamLabel(id: string): string {
  const t = TEAM_BY_ID[id];
  return t ? `${t.city} ${t.name}` : id;
}
