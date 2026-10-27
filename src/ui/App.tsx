import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { TEAM_COLORS } from "../engine/teamColors";
import type { GameState } from "../engine/types";
import { writeAutosave } from "../save/local";
import { onColor } from "./format";
import { GameShell } from "./GameShell";
import { NewGame } from "./NewGame";
import { TitleScreen } from "./TitleScreen";

type View = "title" | "new" | "game";

export function applyTeamColors(team: string | null): void {
  const [primary, secondary] = team ? TEAM_COLORS[team] : ["#2b3a4a", "#9fb0c0"];
  const root = document.documentElement.style;
  root.setProperty("--team", primary);
  root.setProperty("--team-ink", onColor(primary));
  root.setProperty("--team-2", secondary === "#FFFFFF" || secondary === "#000000" ? "#c9d1d8" : secondary);
}

export function App({ initial }: { initial?: GameState }) {
  const [game, setGame] = useState<GameState | null>(initial ?? null);
  const [view, setView] = useState<View>(initial ? "game" : "title");
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  const stateRef = useRef(game);
  stateRef.current = game;

  useEffect(() => applyTeamColors(view === "game" && game ? game.userTeam : null), [view, game]);

  // Keep the game across page updates while it is open.
  useEffect(() => {
    const hot = (window as unknown as { claude?: { hot?: { snapshot?: (fn: () => unknown) => void } } }).claude?.hot;
    hot?.snapshot?.(() => ({ game: stateRef.current }));
  }, []);

  // Autosave in this browser after each change, at most every couple of seconds.
  const saveTimer = useRef<number>();
  useEffect(() => {
    if (!game) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void writeAutosave(game), 1500);
  }, [game, tick]);

  const start = useCallback((state: GameState) => {
    setGame(state);
    setView("game");
  }, []);

  if (view === "new") return <NewGame onStart={start} onBack={() => setView("title")} />;
  if (view === "game" && game) {
    return <GameShell game={game} tick={tick} changed={bump} onLoad={start} onQuit={() => setView("title")} />;
  }
  return <TitleScreen onNew={() => setView("new")} onLoad={start} />;
}
