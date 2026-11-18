import type { Position } from "./types";
// College football, the living college world. Re-exported from types.ts; import from there.

// ---- College football (see engine/college.ts, prospects.ts, scouting.ts) ----

export type CollegeConference = "SEC" | "B1G" | "B12" | "ACC" | "P12" | "AAC" | "MW" | "SBC" | "CUSA" | "MAC" | "IND";
export type CollegeOffense = "airRaid" | "spreadRpo" | "proStyle" | "spreadOption" | "flexbone";
export type CollegeDefense = "43" | "34" | "425" | "335" | "multiple";
export type Region = "West" | "Southwest" | "Midwest" | "Southeast" | "Northeast";

export interface CollegeTeam {
  id: string;
  school: string;
  nickname: string;
  conference: CollegeConference;
  coach: string;
  coachSince: number;
  city: string;
  state: string;
  lat: number;
  lon: number;
  region: Region;
  /** Engine only: how good the program is going into 2026. */
  strength: number;
  offense: CollegeOffense;
  defense: CollegeDefense;
}

export interface CollegeGame {
  id: string;
  /** Regular-season week (0-13), 14 for conference title games, 15 for Army-Navy, 16+ for the postseason. */
  week: number;
  date: string;
  away: string;
  home: string;
  conference: boolean;
  site?: string;
  city?: string;
  name?: string;
  kind?: "ccg" | "bowl" | "cfp1" | "cfpQF" | "cfpSF" | "cfpF";
  /** Playoff games: the seeds of the two teams. */
  seeds?: [number, number];
}

/** A poll or ranking release: the 25 teams in order. */
export interface CollegePoll {
  date: string;
  /** Week label, e.g. "Preseason", "Week 5", "Final". */
  label: string;
  ranks: string[];
}

/** How the owner points the college scouts for a week. */
export interface ScoutFilter {
  region?: Region;
  conference?: CollegeConference;
  school?: string;
  positions?: Position[];
  /** A college system: an offense or a defense label. */
  scheme?: CollegeOffense | CollegeDefense;
  /** Specific prospects; overrides the rest. */
  players?: string[];
}

export type ScoutDepth = "film" | "campus" | "deep";

export interface ScoutAssignment {
  id: string;
  filter: ScoutFilter;
  depth: ScoutDepth;
}

export interface ScoutWeek {
  date: string;
  cost: number;
  /** One line per assignment that ran. */
  lines: string[];
  /** Prospects we learned the most about this week. */
  learned: string[];
}

export interface ScoutingState {
  /** Total college scouting budget from camp to the draft. */
  budget: number;
  spent: number;
  plan: ScoutAssignment[];
  /** How well our scouts know each prospect, 0-100. */
  know: Record<string, number>;
  weeks: ScoutWeek[];
  /** Other teams' knowledge, by team, in prospect order (engine only). */
  cpu: Record<string, number[]>;
}

export interface CollegeInjury {
  type: string;
  date: string;
  returnDate: string;
  seasonEnding: boolean;
}

export interface CollegeAward {
  semifinalists?: string[];
  finalists?: string[];
  winner?: string;
}

export interface CollegeState {
  season: number;
  /** Final scores by game id: [away, home, overtime 0/1]. */
  results: Record<string, [number, number, number]>;
  /** Games made during the season: title games, bowls and the playoff. */
  post: CollegeGame[];
  /** Playoff field, seeds 1-12. */
  cfpField?: string[];
  ap: CollegePoll[];
  cfp: CollegePoll[];
  /** Public perception of each team, the basis for the polls (rating points). */
  rating: Record<string, number>;
  /** Prospect game logs: player, then game id, packed in the position's stat order. */
  logs: Record<string, Record<string, number[]>>;
  injuries: Record<string, CollegeInjury>;
  /** Media buzz around each prospect (public), drives the big boards and watch lists. */
  hype: Record<string, number>;
  awards: Record<string, CollegeAward>;
  champion?: string;
  scouting: ScoutingState;
}

// ---- The living college world (cfbworld.ts, recruiting.ts, cfbcoaches.ts) ----

/** One FBS program across seasons. Strength, prestige and talent are engine only; records, ranks and classes are public. */
export interface CfbProgram {
  /** Engine only: the program's long-run pull (brand, money, tradition), on the strength scale of teams.json. */
  prestige: number;
  /** Engine only: how good the team is this season, on the same scale (2026 is the data's `strength`). */
  strength: number;
  /** Engine only: the roster's talent, a rolling read of the last four recruiting classes. */
  talent: number;
  /** Finished seasons: [season, wins, losses, final AP rank (0 unranked), conference title 0/1, playoff 0 out / 1 in / 2 quarterfinal / 3 semifinal / 4 final / 5 champion, engine only: the head coach's development against the field that year, in tenths]. */
  seasons: number[][];
  /** The head coach (staff person id) of each finished season. */
  coaches: Record<number, string>;
  /** Recruiting class rank by enrollment year (public, from the recruiting services). */
  classRank: Record<number, number>;
  /** Engine only: true talent signed by enrollment year (strength scale). */
  classTalent: Record<number, number>;
}

/** A recruit's pledge: the school, the day he committed, and whether he has signed. */
export interface CfbCommit { school: string; date: string; signed?: 1; flipped?: string }

/** One high school class, from its rankings to signing day. `year` is the fall it enrolls. */
export interface CfbRecruitingClass {
  year: number;
  commits: Record<string, CfbCommit>;
  /** Set on National Signing Day, when the class is final. */
  done?: boolean;
}

export interface CfbCoachMove {
  date: string;
  team: string;
  kind: "fired" | "hired" | "retired" | "left";
  /** Staff person id. */
  coach: string;
  text: string;
}

export interface CfbWorld {
  programs: Record<string, CfbProgram>;
  /** The class being recruited now and the last one signed, by enrollment year. */
  classes: Record<number, CfbRecruitingClass>;
  /** Where each future NFL prospect signed in this save (recruit id = prospect id), by the fall he enrolled; dropped once his class is drafted. */
  signed: Record<number, Record<string, string>>;
  /** Open head coaching jobs: program, the day it opened. */
  openings: Record<string, string>;
  /** Coaching changes, newest first. */
  log: CfbCoachMove[];
  /** Bumped on every change the draft classes read (signings, transfers, development). */
  rev: number;
  /** Tracked players' finished college seasons: [season, school, position, games, totals in the position's stat order]. */
  careers?: Record<string, (string | number)[][]>;
  /** Transfers that have taken effect, by draft year: player, new school. */
  transfers?: Record<number, Record<string, string>>;
  /** This offseason's transfer portal: player, [old school, new school, date]; they move at the rollover. */
  portal?: Record<string, [string, string, string]>;
}
