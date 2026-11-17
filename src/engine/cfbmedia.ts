// College football news for the story engine (media/content/college.ts):
// recruiting commitments and flips, signing days, the coaching carousel, the
// transfer portal and the programs on the move each preseason. The college
// systems hand facts over here; the desks write them at the end of the day.
import { COLLEGE_TEAM, CONFERENCES, conferenceName, schoolName } from "./collegeData";
import { mediaState } from "./outlets";
import type { GameState } from "./types";

export type CfbSlots = Record<string, unknown>;

/** Hands the college desk a fact (value 0-100, how much the sport cares). */
export function cfbFact(state: GameState, kind: string, value: number, slots: CfbSlots, tags: Record<string, boolean> = {}): void {
  const m = mediaState(state);
  (m.cfbq ??= []).push({ kind, value: Math.round(Math.min(95, value)), slots, tags });
}

/** What a story can say about a school: name, mascot, conference, coach, this season's record and rank. */
export function schoolSlots(state: GameState, id: string): CfbSlots {
  const t = COLLEGE_TEAM[id];
  const coach = Object.values(state.staff?.people ?? {}).find((c) => !c.retired && c.job?.kind === "college" && c.job.title === "head coach" && c.job.team === id);
  const ap = state.college?.ap.at(-1);
  const rank = ap ? ap.ranks.indexOf(id) + 1 : 0;
  return {
    id, name: schoolName(id), nick: t?.nickname ?? "", full: `${schoolName(id)} ${t?.nickname ?? ""}`.trim(),
    conf: t ? conferenceName(t.conference) : "", coach: coach?.name ?? "", rank,
  };
}

export function powerSchool(id: string): boolean {
  return !!CONFERENCES[COLLEGE_TEAM[id]?.conference]?.power;
}

export function starWord(stars: number): string {
  return stars === 5 ? "five-star" : stars === 4 ? "four-star" : "three-star";
}
