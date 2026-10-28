import { createContext, useContext } from "react";

/** App-wide drawers: any screen can open a box score or a player. */
export interface UiActions {
  openBox: (gameId: string) => void;
  openPlayer: (playerId: string) => void;
}

export const UiContext = createContext<UiActions>({ openBox: () => {}, openPlayer: () => {} });

export function useUi(): UiActions {
  return useContext(UiContext);
}
