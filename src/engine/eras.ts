// Historical starts (2011-2025). A save that starts from a season's data pack
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
}

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
  };
}

/** Practice-squad places each season (the base before any extra the owners vote). */
export function practiceSquadBase(state: GameState | undefined, season: number): number {
  const s = ruleSeason(state, season);
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

/** The clubs whose city, name or stadium differed, by the season they changed (real). */
export const HOMES: { team: string; until: number; market: string; city: string; name?: string; stadium: string; roof: "dome" | "outdoors" }[] = [
  { team: "LA", until: 2016, market: "STL", city: "St. Louis", stadium: "Edward Jones Dome", roof: "dome" },
  { team: "LAC", until: 2017, market: "SD", city: "San Diego", stadium: "Qualcomm Stadium", roof: "outdoors" },
  { team: "LV", until: 2020, market: "OAK", city: "Oakland", stadium: "Oakland Coliseum", roof: "outdoors" },
];

/** Temporary homes after a real move, until the new stadium opened. */
export const TEMP_HOMES: { team: string; from: number; until: number; stadium: string }[] = [
  { team: "LA", from: 2016, until: 2020, stadium: "Los Angeles Memorial Coliseum" },
  { team: "LAC", from: 2017, until: 2020, stadium: "Dignity Health Sports Park" },
];

/** Washington's names (real). */
export function washingtonName(season: number): string {
  return season <= 2019 ? "Redskins" : season <= 2021 ? "Football Team" : "Commanders";
}

/** Where a club was in a season under this save's era, if it wasn't in its 2026 city. */
export function oldHome(state: GameState | undefined, team: string, season: number): (typeof HOMES)[number] | undefined {
  const e = era(state);
  if (!e) return undefined;
  const h = HOMES.find((x) => x.team === team);
  if (!h || e.start >= h.until) return undefined;
  return ruleSeason(state, season) < h.until ? h : undefined;
}

/** Who controlled each club before its 2026 owner, with the last season they did (real, approximate). */
export const ERA_OWNERS: Record<string, [through: number, owner: string][]> = {
  BUF: [[2013, "the Ralph Wilson estate"]],
  CAR: [[2017, "Jerry Richardson"]],
  CLE: [[2011, "Randy Lerner"]],
  DEN: [[2021, "the Pat Bowlen trust"]],
  DET: [[2013, "William Clay Ford"], [2019, "Martha Firestone Ford"]],
  JAX: [[2011, "Wayne Weaver"]],
  NO: [[2017, "Tom Benson"]],
  SEA: [[2018, "Paul Allen"]],
  TEN: [[2013, "Bud Adams"], [2014, "the Adams family trust"]],
  WAS: [[2022, "Dan Snyder"]],
  IND: [[2024, "Jim Irsay"]],
};

/** Who controlled a club in a season, if not its 2026 owner. */
export function eraOwner(team: string, season: number): string | undefined {
  return ERA_OWNERS[team]?.find(([through]) => season <= through)?.[1];
}

/** The 2011 labor agreement: a lower players' share, 16 games, 14 padded camp practices, the 89% cash floor. */
export const CBA_2011 = { share: 0.47, minScale: 1, rookieScale: 1, benefits: 0.85, practice: 14, games: 16 as const, safety: 0, cashFloor: 0.89 };

/** True for a pack save: kept here so callers needn't import pack.ts. */
export const HISTORICAL = !!PACK;

/** The real rule archive: changes that shaped the game, by the first season they applied (approximate wording). */
export const RULE_ARCHIVE: [season: number, text: string][] = [
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
