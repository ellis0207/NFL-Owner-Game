// Ids for things the save keeps in capped lists (decisions, memos, tasks,
// offers, questions). A list's length can't be used: once the list is capped,
// two entries made on the same day can get the same number. The save keeps one
// counter that only goes up, so every id it hands out is new.
import type { GameState } from "./types";

/** The next id with this prefix, unique for the life of the save. */
export function nextId(state: GameState, prefix: string): string {
  state.idSeq = (state.idSeq ?? 0) + 1;
  return `${prefix}-${state.idSeq}`;
}

/**
 * Older saves made ids from list lengths, so a capped list can hold repeats.
 * Give each repeat a fresh id; the first entry with an id keeps it.
 */
export function dedupeIds<T extends { id: string }>(state: GameState, list: T[] | undefined, prefix: string): number {
  if (!list) return 0;
  const seen = new Set<string>();
  let fixed = 0;
  for (const x of list) {
    if (seen.has(x.id)) { x.id = nextId(state, prefix); fixed++; }
    seen.add(x.id);
  }
  return fixed;
}

/** Repair repeated ids in every list that used to number by length. */
export function ensureUniqueIds(state: GameState): void {
  dedupeIds(state, state.causes, "cause");
  dedupeIds(state, state.office?.memos, "memo");
  dedupeIds(state, state.office?.tasks, "task");
  dedupeIds(state, state.trades?.offers, "offer");
  dedupeIds(state, state.media?.questions, "q");
}
