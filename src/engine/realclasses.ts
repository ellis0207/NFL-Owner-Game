// Real draft classes (data/draft-classes, built by pipeline/draft_classes.py):
// every player drafted from 2011 to 2026, the undrafted players who were at the
// combine or made a club, and the early 2027 board. A save picks, for each
// draft, the real class of that year, a generated one, or another year's real
// class (played out of order). This module is a leaf: it holds the data and
// the save's choices; prospects.ts builds the class from them.
//
// What a real prospect turns into is his real career on the game's scale (the
// hidden ratings of the seasons after his draft), so a fourth-round quarterback
// from Mississippi State can still become a franchise player. Everyone else
// sees him where he was really drafted. The 2026 class and the 2027 board have
// no careers yet; theirs are drawn like a generated class's.
import classesJson from "../../data/draft-classes/classes.json";
import type { GameState, Position } from "./types";

/** One prospect: name, school id, position, birth date, height, weight, 40 time, pick (0 undrafted; the board rank for 2027), the club that drafted him, his career [entry level, settled level, gap from what his slot usually becomes], his trait shape at his best, and whether the combine invited him. */
export type RealRow = [string, string, Position, string | null, number | null, number | null, number | null, number, string, [number, number, number] | null, number[] | null, number];

const CLASSES = (classesJson as unknown as { classes: Record<string, RealRow[]> }).classes;

/** Draft years with a real class to play. */
export const REAL_YEARS: number[] = Object.keys(CLASSES).map(Number).sort((a, b) => a - b);

/** The last year whose class is a finished draft (later boards are projections). */
export const LAST_REAL_DRAFT = 2026;

export function realRows(year: number): RealRow[] {
  return CLASSES[year] ?? [];
}

/** A save's draft class choices, bound per seed for the class builder. */
interface Bound {
  from: number;
  picks: Record<string, number>;
}
const bound = new Map<number, Bound>();
let onChange: ((seed: number) => void) | null = null;

/** Set by prospects.ts so a changed choice drops the cached classes. */
export function onClassChoice(fn: (seed: number) => void): void {
  onChange = fn;
}

/**
 * The real class a draft year uses (0 for a generated one). A year the save chose keeps its
 * choice; otherwise a year from the save's first choice on plays its own real class unless
 * another draft in the save already used it. Saves from before real classes generate every class
 * up to the one after the draft they were in.
 */
export function sourceFor(seed: number, year: number): number {
  const b = bound.get(seed);
  if (!b) return 0;
  const picked = b.picks[year];
  if (picked !== undefined) return picked;
  if (year < b.from || !CLASSES[year]) return 0;
  for (const [y, src] of Object.entries(b.picks)) if (src === year && Number(y) !== year) return 0;
  return year;
}

/** Binds a save's choices (on load and whenever one changes). */
export function bindClassChoices(state: GameState): void {
  if (state.seed === undefined) return;
  const c = state.draftClasses;
  const before = bound.get(state.seed);
  if (!c) {
    if (before) {
      bound.delete(state.seed);
      onChange?.(state.seed);
    }
    return;
  }
  const key = JSON.stringify(c);
  if (before && JSON.stringify(before) === key) return;
  bound.set(state.seed, { from: c.from, picks: { ...c.picks } });
  onChange?.(state.seed);
}

/** Older saves: every class through the one after the coming draft stays generated. */
export function ensureDraftClasses(state: GameState): void {
  state.draftClasses ??= { from: (state.season ?? 2026) + 2, picks: {} };
}

/** Real classes this draft year could use: every one no other draft in the save has used. */
export function classOptions(state: GameState, year: number): number[] {
  const used = new Set<number>();
  for (const y of new Set([...Object.keys(state.draftClasses?.picks ?? {}).map(Number), ...REAL_YEARS])) {
    if (y === year) continue;
    const src = sourceFor(state.seed, y);
    // A year still open to change doesn't hold its default against this one, except a class already drafted or being scouted.
    if (src && (state.draftClasses?.picks[y] !== undefined || y < year)) used.add(src);
  }
  return REAL_YEARS.filter((y) => !used.has(y));
}

/** Words for a class choice. */
export function classLabel(src: number, year: number): string {
  if (!src) return "Randomly generated class";
  if (src === 2027) return src === year ? "Real 2027 class (early board; the rest made up)" : "Real 2027 class (early board, played out of order)";
  return src === year ? `Real ${src} class` : `Real ${src} class (played out of order)`;
}
