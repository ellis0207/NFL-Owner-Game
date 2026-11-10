// Functions bound late to break load-order loops between modules that need
// each other. This file imports nothing, so it is always loaded first and the
// binding never lands on a module that hasn't finished loading.
import type { GameState } from "./types";

export const late = {
  /** books.ts: what the reserve policy keeps on hand. */
  reserve: (_state: GameState): number => 0,
  /** books.ts: the year in progress, actuals plus the rest of the budget. */
  projected: (_state: GameState): { revenue: number; operating: number } => ({ revenue: 0, operating: 0 }),
};
