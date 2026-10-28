// The static 2026 college football universe (data/college-2026, built by pipeline/college_2026.py).
import teamsJson from "../../data/college-2026/teams.json";
import scheduleJson from "../../data/college-2026/schedule.json";
import type { CollegeConference, CollegeDefense, CollegeGame, CollegeOffense, CollegeTeam, Region } from "./types";

interface CollegeData {
  conferences: Record<CollegeConference, { name: string; full: string; games: number; power: boolean }>;
  teams: CollegeTeam[];
  nflHQ: Record<string, [number, number]>;
  bowls: [string, string, string][];
  cfp: {
    selection: string;
    firstRound: string[];
    quarterfinals: [string, string, string][];
    semifinals: [string, string, string][];
    final: [string, string, string];
  };
  keyDates: Record<string, string>;
  regions: Region[];
}

const DATA = teamsJson as unknown as CollegeData;

export const COLLEGE_TEAMS = DATA.teams;
export const COLLEGE_TEAM: Record<string, CollegeTeam> = Object.fromEntries(DATA.teams.map((t) => [t.id, t]));
export const CONFERENCES = DATA.conferences;
export const CONFERENCE_IDS = Object.keys(DATA.conferences) as CollegeConference[];
export const NFL_HQ = DATA.nflHQ;
export const BOWLS = DATA.bowls;
export const CFP = DATA.cfp;
export const COLLEGE_DATES = DATA.keyDates;
export const REGIONS = DATA.regions;
export const COLLEGE_SCHEDULE = scheduleJson as unknown as CollegeGame[];

export const OFFENSE_NAMES: Record<CollegeOffense, string> = {
  airRaid: "Air Raid", spreadRpo: "Spread RPO", proStyle: "Pro-style", spreadOption: "Spread option", flexbone: "Flexbone option",
};
export const DEFENSE_NAMES: Record<CollegeDefense, string> = {
  "43": "4-3", "34": "3-4", "425": "4-2-5", "335": "3-3-5", multiple: "Multiple",
};

export function schoolName(id: string): string {
  return COLLEGE_TEAM[id]?.school ?? id;
}

export function conferenceName(id: CollegeConference): string {
  return CONFERENCES[id]?.name ?? id;
}

/** Miles between two points (great circle). */
export function miles(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(h));
}

/** Miles from an NFL team's facility to a campus. */
export function distanceTo(nflTeam: string, school: string): number {
  const t = COLLEGE_TEAM[school];
  return miles(NFL_HQ[nflTeam], [t.lat, t.lon]);
}
