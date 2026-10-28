// The static 2026 league, loaded once from the generated data files.
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
export const SEASON = RULES.season;

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
