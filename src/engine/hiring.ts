// The league's interview rules for staff on teams still in the playoffs.
// From the day after the wild card round, other teams may interview them by
// video. A second interview has to be in person, and the league allows
// in-person meetings only once the candidate's team is out, or in the open
// week between the conference championships and the Super Bowl. A top job
// isn't offered without that second meeting, and a hire from a team still
// playing becomes official only when its season is over.
import { addDays } from "./dates";
import { stillPlaying } from "./freeagency";
import { RULES } from "./league";
import type { GameState } from "./types";

/** Whether a team can meet in person with someone on this employer's staff today. */
export function inPersonOk(state: GameState, employer: string | null): boolean {
  if (!employer || !stillPlaying(state, employer)) return true;
  const k = RULES.keyDates;
  return state.date > k.conferenceChampionships && state.date < k.superBowl;
}

export function inPersonRule(): string {
  return `League rules allow in-person meetings with staff on a team still in the playoffs only after its season ends, or in the week before the Super Bowl (from ${addDays(RULES.keyDates.conferenceChampionships, 1)}).`;
}
