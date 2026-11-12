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
