// How the building feels: the culture of the club and the working
// relationships that carry it. Six indicators (trust, stability, fairness,
// accountability, communication and morale) are read every month from what
// actually happened: departures and reorganizations, how the owner treats
// recommendations, how complaints were handled, whether tasks and memos get
// done, and how people feel in their jobs.
//
// Relationships move with the owner's conduct. The GM's trust rises with
// autonomy and support and falls with overrides and interference; the GM and
// head coach can pull together or apart; reporters build sources inside a club
// that leaks; sponsors and the community watch how the club behaves. When
// things sour, people say so: the GM asks for clarity, executives push back
// on lost authority, staff file complaints, and details leak to the press.
import { addDays, daysBetween } from "./dates";
import { money } from "./inbox";
import { TEAM_BY_ID } from "./league";
import { MEDIA_BY_ID } from "./outlets";
import { addStory } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import type { CultureIndicator, CultureState, DecisionArea, DecisionMode, ExecRole, GameState } from "./types";

const M = 1_000_000;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

export const INDICATORS: Record<CultureIndicator, { label: string; what: string }> = {
  trust: { label: "Trust", what: "Whether the staff believes ownership backs them." },
  stability: { label: "Stability", what: "Turnover, reorganizations and changes in how decisions get made." },
  fairness: { label: "Fairness", what: "Whether people think problems and complaints are handled fairly." },
  accountability: { label: "Accountability", what: "Whether work gets done on time and results are reviewed." },
  communication: { label: "Communication", what: "Decisions made on time, meetings held, and nothing leaking." },
  morale: { label: "Morale", what: "How people feel about their jobs, their workload and the head coach's mood." },
};
export const INDICATOR_KEYS = Object.keys(INDICATORS) as CultureIndicator[];

/** What a year of staff development costs at each level: mentoring, courses, credentials. */
export const DEVELOPMENT = [
  { label: "None", cost: 0 },
  { label: "Basic", cost: 0.5 * M },
  { label: "Strong", cost: 1.2 * M },
  { label: "Top of the league", cost: 2.5 * M },
];

export function culture(state: GameState): CultureState {
  return (state.culture ??= {
    gmTrust: 58, cooperation: pairStart(state), pair: pairKey(state), fairness: 60, development: 1,
    rel: { sources: 40, sponsors: 60, community: 60 }, history: [], leaks: [], log: [],
  });
}

/** Saves from before the culture model start with an ordinary building. */
export function ensureCulture(state: GameState): void {
  culture(state);
}

function pairKey(state: GameState): string {
  const s = teamStaff(state.userTeam);
  return `${s.GM?.id ?? "-"}:${s.HC?.id ?? "-"}`;
}

/** Some GMs and head coaches click and some don't: each pair starts somewhere between wary and close. */
function pairStart(state: GameState): number {
  return clamp(58 + gaussian(rngFor(state.seed, `pair:${pairKey(state)}`)) * 10);
}

/** Something that moves the GM's trust in the owner: support and autonomy up, overrides and interference down. */
export function gmTrust(state: GameState, delta: number, why?: string): void {
  if (!state.culture) return;
  const c = culture(state);
  c.gmTrust = clamp(c.gmTrust + delta);
  if (why && Math.abs(delta) >= 3) note(state, why);
}

export function fairness(state: GameState, delta: number): void {
  if (state.culture) culture(state).fairness = clamp(culture(state).fairness + delta);
}

function note(state: GameState, text: string): void {
  const c = culture(state);
  c.log.unshift({ date: state.date, text });
  c.log = c.log.slice(0, 40);
}

export function setDevelopment(state: GameState, level: number): void {
  const c = culture(state);
  const before = c.development;
  c.development = Math.max(0, Math.min(3, Math.round(level)));
  if (c.development !== before) note(state, `Staff development budget set to ${DEVELOPMENT[c.development].label.toLowerCase()} (${money(DEVELOPMENT[c.development].cost)} a year).`);
}

/** The yearly cost of the development budget, for the business plan. */
export function developmentCost(state: GameState): number {
  return state.culture ? DEVELOPMENT[state.culture.development].cost : 0;
}

/** Words for a reading the owner never sees as a number. */
export function word(v: number): string {
  return v >= 75 ? "Strong" : v >= 60 ? "Good" : v >= 45 ? "Mixed" : v >= 30 ? "Strained" : "Broken";
}

export function gmTrustWord(v: number): string {
  return v >= 75 ? "The GM trusts you completely" : v >= 58 ? "A good working relationship" : v >= 42 ? "Professional, with some wariness" : v >= 28 ? "The GM feels second-guessed" : "The GM has stopped telling you things";
}

export function cooperationWord(v: number): string {
  return v >= 72 ? "The GM and head coach are joined at the hip" : v >= 55 ? "They work well together" : v >= 40 ? "They disagree on some priorities" : "They are pulling in different directions";
}

/** A leak: someone tells a reporter what was said inside. */
export function leak(state: GameState, text: string, headline: string): void {
  const c = culture(state);
  c.leaks.unshift({ date: state.date, text });
  c.leaks = c.leaks.slice(0, 20);
  c.rel.sources = clamp(c.rel.sources + 6);
  addStory(state, {
    outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "leak", teams: [state.userTeam],
    headline: `${TEAM_BY_ID[state.userTeam].name}: ${headline}`, body: text,
  });
  state.pressure.media = clamp(state.pressure.media - 2);
  note(state, `Leaked: ${headline.toLowerCase()}.`);
}

/** The month's change in how the GM and coach get along, and the press's sources inside the building. */
export function relationshipsMonthly(state: GameState, ctx: { delegatedFootball: number; fopsBoost: number; incidents: number; fans: number; communityBudget: number }): void {
  const c = culture(state);
  // A new GM or head coach starts the working relationship over.
  const key = pairKey(state);
  if (key !== c.pair) {
    c.pair = key;
    c.cooperation = pairStart(state);
    note(state, "A new GM and head coach pairing is finding its feet.");
  }
  const rng = rngFor(state.seed, `coop:${state.date}`);
  // A president of football operations keeps the two pulling the same way.
  c.cooperation = clamp(c.cooperation + (58 - c.cooperation) * 0.05 + ctx.fopsBoost * 1.2 + gaussian(rng) * 2.5);
  // The GM's trust drifts back toward a working norm, faster with real authority.
  c.gmTrust = clamp(c.gmTrust + (58 - c.gmTrust) * 0.04 + ctx.delegatedFootball * 0.6);
  // Sources dry up when the building is quiet; sponsors watch incidents and the crowd; the community wants continuity.
  c.rel.sources = clamp(c.rel.sources - 1);
  c.rel.sponsors = clamp(c.rel.sponsors + (60 - c.rel.sponsors) * 0.1 + (ctx.fans - 50) / 25 - ctx.incidents * 2);
  c.rel.community = clamp(c.rel.community + (40 + ctx.communityBudget * 10 - c.rel.community) * 0.08);
  c.fairness = clamp(c.fairness + (60 - c.fairness) * 0.03);
}

/** Store this month's readings. */
export function recordIndicators(state: GameState, v: Record<CultureIndicator, number>): void {
  const c = culture(state);
  const month = state.date.slice(0, 7);
  c.history = c.history.filter((h) => h.month !== month);
  c.history.push({ month, ...Object.fromEntries(INDICATOR_KEYS.map((k) => [k, Math.round(clamp(v[k]))])) as Record<CultureIndicator, number> });
  c.history = c.history.slice(-48);
}

export function latest(state: GameState): ({ month: string } & Record<CultureIndicator, number>) | undefined {
  return state.culture?.history.at(-1);
}

/** Days since a date, for culture rules that look back a year. */
export function within(state: GameState, date: string, days: number): boolean {
  return date >= addDays(state.date, -days) && daysBetween(date, state.date) >= 0;
}

/** Someone who lost authority they care about will raise it with the owner. */
export function noteDispute(state: GameState, who: ExecRole, area: DecisionArea, from: DecisionMode): void {
  if (!state.culture) return;
  const c = culture(state);
  (c.disputes ??= []).push({ who, area, from, date: state.date });
}
