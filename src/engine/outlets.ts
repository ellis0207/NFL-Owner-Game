// The made-up media companies that cover the league, and the small pieces of
// media state other systems touch: filing a story, and how each outlet feels
// about the owner (engine only; the owner reads it from the coverage).
import { addDays } from "./dates";
import { archiveStory } from "./teammedia";
import type { GameState, MediaState, PressTip, Story } from "./types";

export interface MediaOutlet {
  id: string;
  name: string;
  /** What kind of company it is, for the Media page. */
  what: string;
  /** Who covers what. */
  insider: string;
  columnist: string;
  analyst: string;
  draft: string;
  reporter: string;
  /** The name it grades under in engine/grades.ts, if it hands out grades. */
  grader?: string;
  /** Leans to hot takes (1) or straight reporting (0). */
  heat: number;
}

export const MEDIA: MediaOutlet[] = [
  {
    id: "ledger", name: "The Gridiron Ledger", what: "National football paper of record: game stories, analytics, the weekly power rankings.",
    insider: "Tom Kessler", columnist: "Ruth Calder", analyst: "Owen Pryce", draft: "Dana Whitfield", reporter: "Sam Okafor",
    grader: "The Gridiron Ledger", heat: 0.2,
  },
  {
    id: "sideline", name: "Sideline Report", what: "24-hour football network: breaking news, injuries, sideline interviews and previews.",
    insider: "Rick Calloway", columnist: "Dee Hollins", analyst: "Andre Mabry", draft: "Marcus Bell", reporter: "Jenna Park",
    grader: "Sideline Report", heat: 0.45,
  },
  {
    id: "capspace", name: "Cap Space Daily", what: "Contracts and the cap: deal breakdowns, grades, free agency and the trade market.",
    insider: "Nate Feld", columnist: "Leo Brandt", analyst: "Leo Brandt", draft: "Priya Raman", reporter: "Carly Webb",
    grader: "Cap Space Daily", heat: 0.15,
  },
  {
    id: "blitz", name: "The Blitz", what: "Sports-talk radio and podcast network. Loud opinions, overreactions and the hot seat.",
    insider: "Kara Voss", columnist: "Big Lou Marchetti", analyst: "Kara Voss", draft: "Big Lou Marchetti", reporter: "Kara Voss",
    heat: 0.95,
  },
  {
    id: "sentinel", name: "Saturday Sentinel", what: "College football and the draft: polls, prospects, stock reports and scouting notes.",
    insider: "Lena Ortiz", columnist: "Wes Huddleston", analyst: "Lena Ortiz", draft: "Wes Huddleston", reporter: "Tasha Greer",
    heat: 0.3,
  },
  {
    id: "afw", name: "American Football Wire", what: "The wire service: first with the transaction, the injury report and the final score, and nothing else.",
    insider: "Hal Brennan", columnist: "", analyst: "Joy Takeda", draft: "", reporter: "Mo Adeyemi",
    heat: 0.05,
  },
  {
    id: "xp", name: "Expected Points", what: "The analytics site: models, win probability, fourth-down calls and the numbers behind every take.",
    insider: "", columnist: "Iris Lindgren", analyst: "Devin Achebe", draft: "", reporter: "",
    heat: 0.25,
  },
  {
    id: "journal", name: "The Franchise Journal", what: "The sports business paper: owners, stadiums, TV money, sales, labor and the league office.",
    insider: "Margaret Osei", columnist: "Paul Verhoeven", analyst: "", draft: "", reporter: "Gina Castellano",
    heat: 0.15,
  },
  {
    id: "beat", name: "Local beat", what: "The writers who cover our club every day for the local paper and its site (made up).",
    insider: "Beat desk", columnist: "Beat desk", analyst: "Beat desk", draft: "Beat desk", reporter: "Beat desk",
    heat: 0.3,
  },
];

/** The national outlets, without the old shared beat desk (stories filed before the local media existed). */
export const NATIONAL = MEDIA.filter((o) => o.id !== "beat");

export const MEDIA_BY_ID: Record<string, MediaOutlet> = Object.fromEntries(MEDIA.map((o) => [o.id, o]));

/** Keep a month of league coverage, and a longer record of stories about our team. */
const KEEP_DAYS = 35;
const KEEP_OURS = 400;

export function mediaState(state: GameState): MediaState {
  return (state.media ??= {
    stories: [], questions: [], rel: {}, coach: 60, stances: [], echoes: [], fines: [], leverage: {}, asked: {},
  });
}

/** Files a story. Old league coverage drops off; stories about our team stay longer. */
export function addStory(state: GameState, s: Omit<Story, "id" | "date">): Story {
  const m = mediaState(state);
  const story: Story = { id: `${state.date}-${m.stories.length}-${s.outlet}`, date: state.date, ...s };
  m.stories.unshift(story);
  archiveStory(state, story);
  return story;
}

export function pruneStories(state: GameState): void {
  const m = mediaState(state);
  const cutoff = addDays(state.date, -KEEP_DAYS);
  let ours = 0;
  m.stories = m.stories.filter((s) => {
    if (s.date >= cutoff) return true;
    if (s.teams?.includes(state.userTeam) || s.kind === "owner") return ++ours <= KEEP_OURS;
    return false;
  });
  // Answered questions from long ago are only history.
  if (m.questions.length > 150) m.questions.length = 150;
}

/** How an outlet feels about the owner, -50 to 50 (engine only). */
export function relOf(state: GameState, outlet: string): number {
  return state.media?.rel[outlet] ?? 0;
}

export function changeRel(state: GameState, outlet: string, delta: number): void {
  const m = mediaState(state);
  m.rel[outlet] = Math.max(-50, Math.min(50, Math.round(((m.rel[outlet] ?? 0) + delta) * 10) / 10));
}

/** A grading outlet's lean on our team's moves: friendly outlets grade us a little kinder. */
export function gradeLean(state: GameState, grader: string, team: string): number {
  if (team !== state.userTeam) return 0;
  const o = MEDIA.find((x) => x.grader === grader);
  return o ? (relOf(state, o.id) / 50) * 0.06 : 0;
}

/** What the owner said in public about paying a player gives the agent this much extra room (share of APY). */
export function ownerLeverage(state: GameState, player: string, team: string): number {
  if (team !== state.userTeam) return 0;
  return state.media?.leverage[player] ?? 0;
}

/** How an outlet covers the owner, in words: what a real owner would sense. */
export function relLabel(rel: number): string {
  if (rel >= 20) return "Friendly: they give the front office the benefit of the doubt.";
  if (rel >= 6) return "Warm.";
  if (rel > -6) return "Neutral.";
  if (rel > -20) return "Cool: the coverage has an edge lately.";
  return "Hostile: they're looking for a story.";
}

/** An agent's leak about contract talks: an insider with sources on the team writes it up at the end of the day. */
export function leakStory(state: GameState, o: { player: string; name: string; position: string; team: string; teamName: string; apy: string; lowball: boolean; agent: string }): void {
  const last = o.name.split(" ").slice(-1)[0];
  tip(state, {
    kind: "talks", team: o.team, player: o.player,
    headline: o.lowball ? `the ${o.teamName}' offer to ${o.name} comes in well short` : `${o.name} and the ${o.teamName} trade offers on a new deal`,
    text: o.lowball
      ? `The ${o.teamName}' latest offer to ${o.position} ${o.name} is said to be around ${o.apy} a year, and people close to ${last} describe it as "not a serious number." ${o.agent}, who represents ${last}, has a history of taking talks public when they stall`
      : `${o.position} ${o.name} and the ${o.teamName} are trading proposals, with the latest offer said to be around ${o.apy} a year. Nothing is imminent, but both sides describe the conversations as productive. ${o.agent} represents ${last}`,
  });
}

/** Hands a reporter something from inside a building (engine/media/rumors.ts files it). */
export function tip(state: GameState, t: PressTip): void {
  (mediaState(state).tips ??= []).push(t);
}
