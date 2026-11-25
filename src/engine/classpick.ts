// Choosing a draft class (realclasses.ts): the real class of that year, a
// generated one, or another year's real class. The owner picks the first one
// when the game starts and each later one after the draft before it, up to the
// first Saturday of the college season, when scouts start on the class. A
// class nobody picked by then plays its own year's real class when there is
// one and no other draft in the save has used it, otherwise a generated one.
import { collegeKickoff, classHype } from "./college";
import { RULES } from "./league";
import { send } from "./inbox";
import { bindClassChoices, classLabel, classOptions, sourceFor } from "./realclasses";
import { teamStaff } from "./staff";
import type { GameState } from "./types";
import { shortDate } from "./dates";

/** The draft whose class can still be chosen (the coming one), or null once scouting has begun. */
export function openClassYear(state: GameState): number | null {
  if (!state.draftClasses || state.tutorial) return null;
  const year = RULES.season + 1;
  if (state.date >= collegeKickoff()) return null;
  if (Object.keys(state.college?.results ?? {}).length) return null;
  return year;
}

/** What the coming draft (or another year's) uses now. */
export function classSource(state: GameState, year = RULES.season + 1): number {
  return sourceFor(state.seed, year);
}

/** Picks the coming draft's class. Returns an error, or null. */
export function chooseDraftClass(state: GameState, src: number): string | null {
  const year = openClassYear(state);
  if (year === null) return "Scouts are already at work on this class: it can't be changed now.";
  if (src && !classOptions(state, year).includes(src)) return "That class isn't available.";
  state.draftClasses!.picks[year] = src;
  bindClassChoices(state);
  // Nothing about the old class is known yet: the media's read and our scouts' plans start over.
  const c = state.college;
  if (c) {
    c.hype = classHype(state);
    c.logs = {};
    c.injuries = {};
    c.scouting.know = {};
    c.scouting.cpu = {};
    c.scouting.plan = c.scouting.plan.filter((a) => !a.filter.players?.length);
  }
  return null;
}

/** Settles the coming class once the college season starts (so later choices can't move it). */
export function settleDraftClass(state: GameState): void {
  const c = state.draftClasses;
  if (!c || state.tutorial) return;
  const year = RULES.season + 1;
  if (c.picks[year] !== undefined || state.date < collegeKickoff()) return;
  c.picks[year] = sourceFor(state.seed, year);
  bindClassChoices(state);
}

/** The day after the draft: the director of college scouting asks which class comes next. */
export function askForClass(state: GameState): void {
  const year = openClassYear(state);
  if (year === null) return;
  const col = teamStaff(state.userTeam).COL;
  const now = classLabel(sourceFor(state.seed, year), year);
  send(state, "staff", `${col?.name ?? "Director of college scouting"}, director of college scouting`, `Next year's draft class: ${now}`,
    `With the draft behind us, the ${year} class is next. Unless you pick another, we'll be scouting the ${now.charAt(0).toLowerCase()}${now.slice(1)}. ` +
    `You can choose a real class from another year (played out of order) or a randomly generated one on the Draft page until college football kicks off ${shortDate(collegeKickoff())}.`);
}
