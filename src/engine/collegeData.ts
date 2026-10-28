// The college football universe (data/college-2026, built by pipeline/college_2026.py).
// Later seasons replay the 2026 slate on the matching Saturdays, with home and
// away swapped every other year.
import teamsJson from "../../data/college-2026/teams.json";
import scheduleJson from "../../data/college-2026/schedule.json";
import { addDays } from "./dates";
import { onSeasonChange, RULES } from "./league";
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
export const REGIONS = DATA.regions;
const BASE_SCHEDULE = scheduleJson as unknown as CollegeGame[];

/** Days from a 2026 college date to the same week of another season (whole weeks, so Saturdays stay Saturdays). */
export function collegeShift(season: number): number {
  return Math.round(((season - 2026) * 365.2425) / 7) * 7;
}

/** A date in the 2026 college calendar, moved to the current season. */
export function cfbDate(base: string): string {
  return addDays(base, collegeShift(RULES.season));
}

export let BOWLS: [string, string, string][] = DATA.bowls;
export let CFP: CollegeData["cfp"] = DATA.cfp;
export let COLLEGE_DATES: Record<string, string> = DATA.keyDates;
export let COLLEGE_SCHEDULE: CollegeGame[] = BASE_SCHEDULE;
onSeasonChange(() => {
  const season = RULES.season;
  const d = (x: string) => addDays(x, collegeShift(season));
  const flip = season % 2 === 1;
  BOWLS = DATA.bowls.map(([n, date, city]) => [n, d(date), city]);
  CFP = {
    selection: d(DATA.cfp.selection),
    firstRound: DATA.cfp.firstRound.map(d),
    quarterfinals: DATA.cfp.quarterfinals.map(([n, date, c]) => [n, d(date), c]),
    semifinals: DATA.cfp.semifinals.map(([n, date, c]) => [n, d(date), c]),
    final: [DATA.cfp.final[0], d(DATA.cfp.final[1]), DATA.cfp.final[2]],
  };
  COLLEGE_DATES = Object.fromEntries(Object.entries(DATA.keyDates).map(([k, v]) => [k, d(v)]));
  COLLEGE_SCHEDULE = season === 2026 ? BASE_SCHEDULE : BASE_SCHEDULE.map((g) => ({
    ...g, date: d(g.date), ...(flip && !g.site ? { away: g.home, home: g.away } : {}),
  }));
});

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
