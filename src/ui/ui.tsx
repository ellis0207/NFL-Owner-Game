import { createContext, useContext } from "react";

/** App-wide drawers: any screen can open a box score or a player. */
export interface UiActions {
  openBox: (gameId: string) => void;
  openPlayer: (playerId: string) => void;
  openTalks: (playerId: string) => void;
  /** The Trades page, set up to trade for (or shop) a player. */
  openTrade: (playerId: string) => void;
}

export const UiContext = createContext<UiActions>({ openBox: () => {}, openPlayer: () => {}, openTalks: () => {}, openTrade: () => {} });

export function useUi(): UiActions {
  return useContext(UiContext);
}
