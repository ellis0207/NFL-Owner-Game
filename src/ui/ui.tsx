import { createContext, useContext } from "react";

/** App-wide drawers: any screen can open a box score or a player. */
export interface UiActions {
  /** Opens a game; `follow` steps through it a play at a time before showing the result. */
  openBox: (gameId: string, follow?: boolean) => void;
  openPlayer: (playerId: string) => void;
  openTalks: (playerId: string) => void;
  /** The Trades page, set up to trade for (or shop) a player. */
  openTrade: (playerId: string) => void;
  /** A college prospect's page. */
  openProspect: (prospectId: string) => void;
  /** A college team's page. */
  openSchool: (schoolId: string) => void;
}

export const UiContext = createContext<UiActions>({
  openBox: () => {}, openPlayer: () => {}, openTalks: () => {}, openTrade: () => {}, openProspect: () => {}, openSchool: () => {},
});

export function useUi(): UiActions {
  return useContext(UiContext);
}

// ---- Opening a page on a given tab (the decision queue's links) ----

let wanted: { screen: string; tab: string } | null = null;

/** Ask the next page drawn to open on this tab. */
export function wantTab(screen: string, tab: string | undefined): void {
  wanted = tab ? { screen, tab } : null;
}

/** A page's first tab: the one asked for by a link, if any, else its own choice. */
export function initialTab<T extends string>(screen: string, tabs: readonly T[], fallback: T): T {
  if (wanted?.screen === screen && (tabs as readonly string[]).includes(wanted.tab)) {
    const t = wanted.tab as T;
    wanted = null;
    return t;
  }
  return fallback;
}
