// The season's shape: how many regular-season games each team plays and how
// many bye weeks it gets. Both are rules the owners can change by vote
// (rules.ts), so the calendar, the schedule maker, pay and per-game bonuses
// read them from here. This file imports nothing, so any module can read it
// at load time without a load-order loop.

export interface SeasonFormat { games: number; byes: number }

/** The real shape since 2021: 17 games in 18 weeks. */
export const BASE_FORMAT: SeasonFormat = { games: 17, byes: 1 };

/** The season currently applied: games, byes and weeks of the regular season (weeks are also the weeks players are paid over). */
export const FORMAT = { games: 17, byes: 1, weeks: 18 };

let lookup: (season: number) => SeasonFormat = () => BASE_FORMAT;

/** The shape of any season, under the rules the save's owners have adopted (bound by rules.ts). */
export function formatFor(season: number): SeasonFormat {
  return lookup(season);
}

export function weeksOf(f: SeasonFormat): number {
  return f.games + f.byes;
}

/** Binds the save's adopted rules, and sets the applied season's shape. */
export function bindFormat(fn: (season: number) => SeasonFormat, season: number): void {
  lookup = fn;
  const f = fn(season);
  FORMAT.games = f.games;
  FORMAT.byes = f.byes;
  FORMAT.weeks = weeksOf(f);
}
