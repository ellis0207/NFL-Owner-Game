// Historical starts (1999-2025). A save that starts from a season's data pack
// (pack.ts) carries `state.era`: the season it started in, and whether history
// runs as it really did or is left to the save (the alternate-history setting).
//
// With real history the league follows the real timeline after the start: the
// playing rules each season had, the 2020 labor deal and the salary caps set
// each year, the Rams', Chargers' and Raiders' moves, Washington's names and
// the clubs' changes of control. With alternate history none of that happens
// on its own: the rules, the cities and the owners stay as they were at the
// start, and only the save's own votes, moves and sales change them.
// Imports only leaf modules, so rules.ts, labor.ts and relocation.ts can read it.

import { PACK, REAL_CAPS } from "./pack";
import type { GameState } from "./types";

export interface EraState {
  /** The season the save started in. */
  start: number;
  /** Alternate history: the real timeline after the start doesn't happen on its own. */
  alt: boolean;
  /** The season alternate history was turned on, if after the start: the picture freezes there. */
  altFrom?: number;
}

export function era(state: GameState | undefined): EraState | undefined {
  return state?.era;
}

/** The season whose real rules apply: the season itself, or the start under alternate history. */
export function ruleSeason(state: GameState | undefined, season: number): number {
  const e = era(state);
  if (!e) return season;
  return e.alt ? Math.min(season, e.altFrom ?? e.start) : season;
}

/** The playing rules and format that differed in earlier seasons (the 2026 rulebook is the base). */
export interface EraRuleOverlay {
  games?: number;
  touchback?: number;
  xpLine?: number;
  otMinutes?: number;
  hipDropBan?: boolean;
  playoffTeams?: number;
  otRule?: "sudden" | "modified" | "both";
  replay?: boolean;
  boothOnly?: boolean;
  twoPoint?: boolean;
  passEra?: number;
  sackRate?: number;
}

/**
 * Era scoring: how much less often passes were completed, by season, so games
 * score like that season's. Fitted to real points a team a game (FiveThirtyEight
 * to 1998, nflverse after, three-season averages): 20-21 points in the 1990s and
 * early 2000s against about 22.6 now, at a point for each 0.05 off a pass's
 * completion chance in this sim. None from 2011, when scoring reached today's.
 */
const PASS_ERA: Record<number, number> = {
  1994: -0.1, 1995: -0.095, 1996: -0.085, 1997: -0.09, 1998: -0.085, 1999: -0.085, 2000: -0.1, 2001: -0.085, 2002: -0.085,
  2003: -0.065, 2004: -0.08, 2005: -0.085, 2006: -0.08, 2007: -0.055, 2008: -0.045, 2009: -0.04, 2010: -0.035,
};

/**
 * How often a pressured passer went down, against the 2026 league, by season.
 * Real sacks a team a game (nflverse, three-season averages) ran 2.0-2.5,
 * against about 2.5 now; and a league built from a historical pack takes about
 * a tenth more sacks than its real season did (thinner lines behind the
 * starters), so each figure carries 0.9 for that. 1994-1998 use 1999-2001's.
 */
const SACK_ERA: Record<number, number> = {
  1994: 0.88, 1995: 0.88, 1996: 0.88, 1997: 0.88, 1998: 0.9, 1999: 0.89, 2000: 0.88, 2001: 0.86, 2002: 0.82, 2003: 0.81,
  2004: 0.81, 2005: 0.83, 2006: 0.8, 2007: 0.77, 2008: 0.76, 2009: 0.76, 2010: 0.8, 2011: 0.82, 2012: 0.86, 2013: 0.86,
  2014: 0.87, 2015: 0.82, 2016: 0.82, 2017: 0.84, 2018: 0.88, 2019: 0.87, 2020: 0.86,
};

/** What each change replaced, by the first season it applied (real). */
export function eraRules(season: number): EraRuleOverlay {
  if (season >= 2026) return {};
  return {
    // The 17th game came in 2021; the 14-team field in 2020.
    ...(season < 2021 ? { games: 16 } : {}),
    ...(season < 2020 ? { playoffTeams: 12 } : {}),
    // Kickoff touchbacks: the 20 until 2016, the 25 through 2023, the 30 in 2024's new kickoff, the 35 from 2025.
    touchback: season < 2016 ? 20 : season < 2024 ? 25 : season < 2025 ? 30 : 35,
    // Extra points moved back to the 15 in 2015.
    ...(season < 2015 ? { xpLine: 2 } : {}),
    // Regular-season overtime was 15 minutes until 2017.
    ...(season < 2017 ? { otMinutes: 15 } : {}),
    // The hip-drop tackle was banned in 2024.
    ...(season < 2024 ? { hipDropBan: false } : {}),
    // Overtime: pure sudden death until 2012 in the regular season; then a
    // touchdown on the first possession won, a field goal gave the other side a
    // chance; both teams get the ball from 2025.
    otRule: season < 2012 ? "sudden" : season < 2025 ? "modified" : "both",
    // No instant replay from 1992 until coaches' challenges came in 1999: every call on the field stood.
    // From 1986 to 1991 an official in the booth reviewed plays on his own.
    ...(season < 1999 ? { replay: false } : {}),
    ...(season >= 1986 && season <= 1991 ? { boothOnly: true } : {}),
    // The two-point try came in 1994.
    ...(season < 1994 ? { twoPoint: false } : {}),
    ...(PASS_ERA[season] ? { passEra: PASS_ERA[season] } : {}),
    sackRate: SACK_ERA[season] ?? 0.88,
  };
}

/** Practice-squad places each season (the base before any extra the owners vote). */
export function practiceSquadBase(state: GameState | undefined, season: number): number {
  const s = ruleSeason(state, season);
  if (s <= 2003) return 5;
  if (s <= 2013) return 8;
  if (s <= 2019) return 10;
  if (s <= 2021) return 16;
  return 17;
}

/** The real cap for a league year when the save follows real history, else nothing (the league sets its own). */
export function realCap(state: GameState, year: number): number | undefined {
  const e = era(state);
  return e && !e.alt ? REAL_CAPS[year] : undefined;
}

/**
 * The clubs whose city, name or stadium differed, from the season `from` (the
 * earliest pack when left out) until the season they changed (real). `market`
 * is an open market's id or the 2026 club whose market it was; `names` the
 * stadium's names by the last season each held.
 */
export const HOMES: { team: string; from?: number; until: number; market: string; city: string; name?: string; stadium: string; names?: [through: number, name: string][]; roof: "dome" | "outdoors" }[] = [
  { team: "LA", from: 1995, until: 2016, market: "STL", city: "St. Louis", stadium: "Edward Jones Dome", names: [[2001, "Trans World Dome"], [2002, "Dome at America's Center"]], roof: "dome" },
  { team: "LAC", until: 2017, market: "SD", city: "San Diego", stadium: "Qualcomm Stadium", names: [[1996, "Jack Murphy Stadium"]], roof: "outdoors" },
  { team: "LV", from: 1995, until: 2020, market: "OAK", city: "Oakland", stadium: "Oakland Coliseum", roof: "outdoors" },
  // The Raiders' Los Angeles years, the Oilers in Houston and the Browns who became the Ravens.
  { team: "LV", until: 1995, market: "LA", city: "Los Angeles", stadium: "Los Angeles Memorial Coliseum", roof: "outdoors" },
  { team: "TEN", until: 1997, market: "HOU", city: "Houston", name: "Oilers", stadium: "Astrodome", roof: "dome" },
  { team: "BAL", until: 1996, market: "CLE", city: "Cleveland", name: "Browns", stadium: "Cleveland Stadium", roof: "outdoors" },
  // The Cardinals were Phoenix's until they took the state's name in 1994 (same market, same stadium).
  { team: "ARI", until: 1994, market: "ARI", city: "Phoenix", stadium: "Sun Devil Stadium", roof: "outdoors" },
];

/** The 2026 names of clubs an early pack names otherwise (the 1994-95 Browns are Baltimore's club). */
const NAME_2026: Record<string, string> = { BAL: "Ravens", TEN: "Titans" };

/** A club's name in a season of a historical start, where it isn't the pack's own. */
export function eraTeamName(state: GameState, team: string, season: number): string | undefined {
  if (!state.era) return undefined;
  return oldHome(state, team, season)?.name ?? eraName(team, ruleSeason(state, season)) ?? NAME_2026[team];
}

/** Names a club played under in its 2026 city (real). */
export function eraName(team: string, season: number): string | undefined {
  if (team === "WAS") return washingtonName(season);
  if (team === "TEN") return season <= 1998 ? "Oilers" : "Titans";
  return undefined;
}

/** Temporary homes after a real move, until the new stadium opened. */
export const TEMP_HOMES: { team: string; from: number; until: number; stadium: string }[] = [
  // Carolina's first season at Clemson; the Ravens at Baltimore's old Memorial Stadium; the Oilers' two seasons at
  // Memphis and Vanderbilt before Nashville's stadium opened.
  { team: "CAR", from: 1995, until: 1996, stadium: "Memorial Stadium (Clemson)" },
  { team: "BAL", from: 1996, until: 1998, stadium: "Memorial Stadium" },
  { team: "TEN", from: 1997, until: 1998, stadium: "Liberty Bowl Memorial Stadium" },
  { team: "TEN", from: 1998, until: 1999, stadium: "Vanderbilt Stadium" },
  // Seattle played at the University of Washington between the Kingdome and its new stadium; Chicago in Champaign while Soldier Field was rebuilt.
  { team: "SEA", from: 2000, until: 2002, stadium: "Husky Stadium" },
  { team: "CHI", from: 2002, until: 2003, stadium: "Memorial Stadium (Champaign)" },
  { team: "LA", from: 2016, until: 2020, stadium: "Los Angeles Memorial Coliseum" },
  { team: "LAC", from: 2017, until: 2020, stadium: "Dignity Health Sports Park" },
];

/**
 * Earlier names of buildings still in use in 2026, by the last season each
 * name held (real; the first match whose season it is applies).
 */
export const STADIUM_NAMES: Record<string, [through: number, name: string][]> = {
  ARI: [[2017, "University of Phoenix Stadium"]],
  BAL: [[1998, "Ravens Stadium at Camden Yards"], [2001, "PSINet Stadium"], [2002, "Ravens Stadium"]],
  BUF: [[1997, "Rich Stadium"], [2015, "Ralph Wilson Stadium"], [2019, "New Era Field"], [2020, "Bills Stadium"]],
  CAR: [[2003, "Ericsson Stadium"]],
  CIN: [[2021, "Paul Brown Stadium"]],
  CLE: [[2013, "Cleveland Browns Stadium"], [2022, "FirstEnergy Stadium"]],
  DEN: [[2010, "Invesco Field at Mile High"], [2017, "Sports Authority Field at Mile High"], [2018, "Broncos Stadium at Mile High"]],
  HOU: [[2013, "Reliant Stadium"]],
  JAX: [[1996, "Jacksonville Municipal Stadium"], [2006, "Alltel Stadium"], [2009, "Jacksonville Municipal Stadium"], [2017, "EverBank Field"], [2022, "TIAA Bank Field"]],
  KC: [[2020, "Arrowhead Stadium"]],
  MIA: [[1995, "Joe Robbie Stadium"], [2004, "Pro Player Stadium"], [2006, "Dolphins Stadium"], [2009, "Dolphin Stadium"], [2015, "Sun Life Stadium"]],
  NO: [[2010, "Louisiana Superdome"], [2020, "Mercedes-Benz Superdome"]],
  PIT: [[2021, "Heinz Field"]],
  SEA: [[2003, "Seahawks Stadium"], [2010, "Qwest Field"], [2019, "CenturyLink Field"]],
  TEN: [[2001, "Adelphia Coliseum"], [2005, "The Coliseum"], [2014, "LP Field"]],
  WAS: [[1998, "Jack Kent Cooke Stadium"], [2024, "FedExField"]],
};

/** The season the league realigned into eight divisions of four (real). */
export const REALIGNED = 2002;
/** The eight divisions of four from 2002 (as in the 2026 data). */
export const ALIGN_2002: Record<string, ["AFC" | "NFC", "East" | "North" | "South" | "West"]> = {
  BUF: ["AFC", "East"], MIA: ["AFC", "East"], NE: ["AFC", "East"], NYJ: ["AFC", "East"],
  BAL: ["AFC", "North"], CIN: ["AFC", "North"], CLE: ["AFC", "North"], PIT: ["AFC", "North"],
  HOU: ["AFC", "South"], IND: ["AFC", "South"], JAX: ["AFC", "South"], TEN: ["AFC", "South"],
  DEN: ["AFC", "West"], KC: ["AFC", "West"], LV: ["AFC", "West"], LAC: ["AFC", "West"],
  DAL: ["NFC", "East"], NYG: ["NFC", "East"], PHI: ["NFC", "East"], WAS: ["NFC", "East"],
  CHI: ["NFC", "North"], DET: ["NFC", "North"], GB: ["NFC", "North"], MIN: ["NFC", "North"],
  ATL: ["NFC", "South"], CAR: ["NFC", "South"], NO: ["NFC", "South"], TB: ["NFC", "South"],
  ARI: ["NFC", "West"], LA: ["NFC", "West"], SF: ["NFC", "West"], SEA: ["NFC", "West"],
};

/**
 * The Houston Texans (real): awarded to Bob McNair in October 1999 for $700
 * million, opened in February 2002 with Charley Casserly as general manager
 * and Dom Capers as head coach, then the expansion draft and the first pick of
 * every round of the 2002 draft.
 */
export const HOUSTON_2002 = {
  id: "HOU", market: "HOU", city: "Houston", name: "Texans", group: "Bob McNair", conference: "AFC" as const, division: "South" as const,
  joins: 2002, fee: 700_000_000, place: [29.68, -95.41] as [number, number], staff: { HC: "Dom Capers", GM: "Charley Casserly" },
};

/**
 * The real expansions, each with the season the league awarded it: Carolina
 * (Jerry Richardson, Dom Capers coaching, Bill Polian as general manager) and
 * Jacksonville (Wayne Weaver, Tom Coughlin) awarded in 1993 for 1995 at $140
 * million; the new Cleveland Browns, promised in the 1996 settlement with the
 * city and sold to Al Lerner for $530 million, opening in 1999 with Chris
 * Palmer and Dwight Clark; then Houston. Each club comes in on the league's
 * usual expansion path (expansion.ts).
 */
export interface RealClub {
  id: string; market: string; city: string; name: string; group: string; conference: "AFC" | "NFC";
  division: "East" | "Central" | "North" | "South" | "West"; joins: number; fee: number; place: [number, number];
  staff: { HC?: string; GM?: string };
}
export const REAL_EXPANSION: { awarded: number; clubs: RealClub[] }[] = [
  { awarded: 1993, clubs: [
    { id: "CAR", market: "CAR", city: "Carolina", name: "Panthers", group: "Jerry Richardson", conference: "NFC", division: "West", joins: 1995, fee: 140_000_000, place: [35.23, -80.85], staff: { HC: "Dom Capers", GM: "Bill Polian" } },
    { id: "JAX", market: "JAX", city: "Jacksonville", name: "Jaguars", group: "Wayne Weaver", conference: "AFC", division: "Central", joins: 1995, fee: 140_000_000, place: [30.32, -81.64], staff: { HC: "Tom Coughlin" } },
  ] },
  { awarded: 1996, clubs: [
    { id: "CLE", market: "CLE", city: "Cleveland", name: "Browns", group: "Al Lerner", conference: "AFC", division: "Central", joins: 1999, fee: 530_000_000, place: [41.51, -81.7], staff: { HC: "Chris Palmer", GM: "Dwight Clark" } },
  ] },
  { awarded: 1999, clubs: [HOUSTON_2002] },
];

/** Washington's names (real). */
export function washingtonName(season: number): string {
  return season <= 2019 ? "Redskins" : season <= 2021 ? "Football Team" : "Commanders";
}

/** Where a club was in a season under this save's era, if it wasn't in its 2026 city. */
export function oldHome(state: GameState | undefined, team: string, season: number): (typeof HOMES)[number] | undefined {
  const e = era(state);
  if (!e) return undefined;
  const s = ruleSeason(state, season);
  return HOMES.find((h) => h.team === team && e.start < h.until && s < h.until && s >= (h.from ?? 0));
}

/** Who controlled each club before its 2026 owner, with the last season they did (real, approximate). */
export const ERA_OWNERS: Record<string, [through: number, owner: string][]> = {
  ATL: [[1997, "Rankin Smith"], [2001, "Taylor Smith"]],
  ARI: [[2018, "Bill Bidwill"]],
  BAL: [[2003, "Art Modell"]],
  BUF: [[2013, "Ralph Wilson"]],
  CAR: [[2017, "Jerry Richardson"]],
  CLE: [[2002, "Al Lerner"], [2011, "Randy Lerner"]],
  DEN: [[2013, "Pat Bowlen"], [2021, "the Pat Bowlen trust"]],
  DET: [[2013, "William Clay Ford"], [2019, "Martha Firestone Ford"]],
  HOU: [[2018, "Bob McNair"]],
  JAX: [[2011, "Wayne Weaver"]],
  KC: [[2006, "Lamar Hunt"]],
  LA: [[2007, "Georgia Frontiere"], [2009, "Chip Rosenbloom and Lucia Rodriguez"]],
  LV: [[2011, "Al Davis"]],
  MIA: [[1989, "Joe Robbie"], [1993, "the Robbie family"], [2008, "Wayne Huizenga"]],
  NE: [[1991, "Victor Kiam"], [1993, "James Orthwein"]],
  PHI: [[1993, "Norman Braman"]],
  LAC: [[1993, "Alex Spanos"]],
  NYG: [[1990, "Wellington and Tim Mara"]],
  CIN: [[1990, "Paul Brown"]],
  MIN: [[1997, "the Vikings' board of ten owners"], [2004, "Red McCombs"]],
  NO: [[2017, "Tom Benson"]],
  NYJ: [[1998, "Leon Hess"], [1999, "the Leon Hess estate"]],
  SEA: [[1996, "Ken Behring"], [2018, "Paul Allen"]],
  TEN: [[2013, "Bud Adams"], [2014, "the Adams family trust"]],
  WAS: [[1996, "Jack Kent Cooke"], [1998, "the Jack Kent Cooke estate"], [2022, "Dan Snyder"]],
  IND: [[1996, "Robert Irsay"], [2024, "Jim Irsay"]],
  SF: [[1999, "Eddie DeBartolo Jr."], [2008, "John and Denise DeBartolo York"]],
  TB: [[1993, "Hugh Culverhouse"], [1994, "the Hugh Culverhouse estate"]],
};

/** Who controlled a club in a season, if not its 2026 owner. */
export function eraOwner(team: string, season: number): string | undefined {
  return ERA_OWNERS[team]?.find(([through]) => season <= through)?.[1];
}

/**
 * The 1993 agreement as last extended in 2006: about 59.5% of a narrower
 * revenue pool (close to half of all revenue), no rookie wage scale, two-a-day
 * camps, a cap floor but no cash floor, free agency after four seasons.
 */
export const CBA_2006 = { share: 0.5, minScale: 1, rookieScale: 1, benefits: 0.75, practice: 24, games: 16 as const, safety: 0, cashFloor: 0, noWageScale: true };

/**
 * 1989-1992, with no labor agreement after the 1987 strike: no cap, Plan B
 * free agency (37 protected a club, the rest whose contracts ended free to
 * sign anywhere), no tags, no rookie wage scale.
 */
export const PLAN_B_1989 = { ...CBA_2006, uncapped: true, planB: true, noTags: true };

/** 1993, the first year of the 1993 agreement: true free agency after five seasons and the franchise tag, the cap a year off. */
export const FIRST_FA_1993 = { ...CBA_2006, uncapped: true, ufaSeasons: 5 };

/** 2010, the year the owners' 2008 opt-out left without a cap: free agency only after six seasons. */
export const UNCAPPED_2010 = { ...CBA_2006, uncapped: true, ufaSeasons: 6 };

/** The 2011 labor agreement: a lower players' share, 16 games, 14 padded camp practices, the 89% cash floor. */
export const CBA_2011 = { share: 0.47, minScale: 1, rookieScale: 1, benefits: 0.85, practice: 14, games: 16 as const, safety: 0, cashFloor: 0.89 };

/** True for a pack save: kept here so callers needn't import pack.ts. */
export const HISTORICAL = !!PACK;

/** The real rule archive: changes that shaped the game, by the first season they applied (approximate wording). */
export const RULE_ARCHIVE: [season: number, text: string][] = [
  [1989, "Plan B free agency: each club protects 37 players, and the rest of those whose contracts are up may sign anywhere"],
  [1990, "The playoff field grows from 10 to 12 clubs"],
  [1992, "Instant replay, used since 1986, is voted out"],
  [1993, "A new labor agreement after the players' antitrust wins: free agency after five seasons, and a salary cap from 1994"],
  [1993, "The draft shrinks from 12 rounds to 8"],
  [1994, "The 1993 labor agreement's salary cap and free agency take effect"],
  [1994, "The two-point conversion comes in, and kickoffs move back to the 30"],
  [1995, "The Carolina Panthers and Jacksonville Jaguars join: 30 clubs"],
  [1995, "The Rams move to St. Louis and the Raiders return to Oakland"],
  [1996, "The Browns move to Baltimore as the Ravens; Cleveland keeps the name for a new club in 1999"],
  [1997, "The Oilers leave Houston for Tennessee, playing in Memphis while Nashville builds"],
  [1998, "The labor agreement is extended through 2003"],
  [1999, "Instant replay returns, now with coaches' challenges: two a game, a timeout lost if the call stands"],
  [1999, "The Browns return to Cleveland as an expansion club: 31 clubs in six divisions"],
  [1999, "Houston is awarded the 32nd club, to play from 2002"],
  [2002, "The league grows to 32 clubs with the Houston Texans and realigns into eight divisions of four"],
  [2004, "Defensive holding and illegal contact are points of emphasis: passing climbs"],
  [2004, "Practice squads grow from five players to eight"],
  [2005, "The horse-collar tackle is banned"],
  [2006, "The labor agreement is extended through 2012"],
  [2007, "Instant replay is made a permanent part of the rules"],
  [2008, "The force-out rule on catches is removed; defenses get one player with a helmet radio"],
  [2008, "The owners opt out of the labor agreement, leaving 2010 without a cap"],
  [2009, "Blindside blocks to the head and four-man wedges on kickoffs are banned"],
  [2010, "Playoff overtime: a field goal on the first possession no longer wins"],
  [2010, "The uncapped year: no cap, no floor, free agency only after six seasons"],
  [2011, "Kickoffs move up to the 35-yard line; touchbacks soar"],
  [2011, "Every scoring play is reviewed by the replay booth"],
  [2011, "A new labor deal: rookie wage scale, fewer padded practices, a salary cap tied to all revenue"],
  [2012, "Playoff overtime: a first-possession field goal no longer ends the game"],
  [2012, "All turnovers are reviewed by the replay booth"],
  [2013, "Ball carriers may not lower the crown of the helmet to initiate contact outside the tackle box"],
  [2014, "The officiating command center in New York joins replay review"],
  [2015, "Extra points snapped from the 15-yard line; the defense can score on a return"],
  [2016, "Kickoff touchbacks come out to the 25-yard line"],
  [2016, "Two personal fouls of certain kinds mean an ejection"],
  [2017, "Regular-season overtime shortened from 15 minutes to 10"],
  [2017, "Leaping over the line to block a kick is banned"],
  [2018, "The catch rule simplified: control, two feet or a body part, a football move"],
  [2018, "Lowering the helmet to initiate contact is a foul anywhere on the field"],
  [2018, "Kickoff formation rules: no running starts, five players on each side"],
  [2019, "Pass interference reviewable by replay (a one-season trial)"],
  [2020, "The playoff field grows from 12 to 14 clubs; only the top seed gets a bye"],
  [2020, "A new labor deal through 2030: a 17th game from 2021, larger rosters and practice squads"],
  [2021, "The regular season grows to 17 games in 18 weeks"],
  [2022, "Playoff overtime: both teams get the ball even after a first-possession touchdown"],
  [2023, "Fair catches on kickoffs inside the 25 come out to the 25"],
  [2024, "The dynamic kickoff: kickers at the 35, coverage and return teams lined up near the 40 and the 30"],
  [2024, "The hip-drop tackle is banned"],
  [2025, "Regular-season overtime: both teams get the ball; kickoff touchbacks to the 35"],
  [2026, "The 2026 rulebook: where the game's own league starts"],
];
