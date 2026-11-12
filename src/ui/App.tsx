import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BASE_SEASON } from "../engine/league";
import { TEAM_COLORS } from "../engine/teamColors";
import type { GameState } from "../engine/types";
import { holdAutosave, readAutosave, writeAutosave } from "../save/local";
import { NEW_KEY, RESUME_KEY, switchEraSafely, type EraSwitchResult } from "../save/era";
import { onColor } from "./format";
import { GameShell } from "./GameShell";
import { NewGame } from "./NewGame";
import { TitleScreen } from "./TitleScreen";

type View = "title" | "new" | "game";

// Problems the page needs to tell the owner about (a season switch that couldn't go ahead).
let report: (text: string) => void = () => {};

/**
 * Each start season's data loads before the game does, so switching seasons
 * reloads the page (save/era.ts). The reload waits for a confirmed save; if
 * saving fails the game stays open and the owner is told why.
 */
export function switchEra(season: number, resume?: GameState, toNew = false): Promise<EraSwitchResult> {
  return switchEraSafely(season, resume, toNew).then((r) => {
    if (!r.ok) report(r.reason);
    return r;
  });
}

/** The season a save started in (2026 for the default start). */
export function eraOf(state: GameState): number {
  return state.era?.start ?? 2026;
}

/** True once after the New game screen switched seasons: the page reopens on New game. */
function backToNew(): boolean {
  try {
    const v = sessionStorage.getItem(NEW_KEY) === "1";
    sessionStorage.removeItem(NEW_KEY);
    return v;
  } catch { return false; }
}

export function applyTeamColors(team: string | null): void {
  const [primary, secondary] = team ? TEAM_COLORS[team] : ["#2b3a4a", "#9fb0c0"];
  const root = document.documentElement.style;
  root.setProperty("--team", primary);
  root.setProperty("--team-ink", onColor(primary));
  root.setProperty("--team-2", secondary === "#FFFFFF" || secondary === "#000000" ? "#c9d1d8" : secondary);
}

export function App({ initial: given }: { initial?: GameState }) {
  // A save carried across a page update from another start season opens after a reload.
  const initial = given && eraOf(given) === BASE_SEASON ? given : undefined;
  const [problem, setProblem] = useState<string | null>(null);
  report = setProblem;
  useEffect(() => { if (given && !initial) switchEra(eraOf(given), given); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [game, setGame] = useState<GameState | null>(initial ?? null);
  const [view, setView] = useState<View>(() => (initial ? "game" : backToNew() ? "new" : "title"));
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
    // A save from another start season needs that season's data: reload with it, then open the save.
    if (eraOf(state) !== BASE_SEASON) { void switchEra(eraOf(state), state); return; }
    holdAutosave(null);
    setGame(state);
    setView("game");
  }, []);

  // After a reload for a save from another season, open it.
  useEffect(() => {
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_KEY) === "1"; sessionStorage.removeItem(RESUME_KEY); } catch { /* storage blocked */ }
    if (resume) void readAutosave().then((r) => {
      if (r && eraOf(r.state) === BASE_SEASON) { setGame(r.state); setView("game"); }
      else setProblem("The save parked before the season switch couldn't be opened. Open it from the title screen or a save file.");
    });
  }, []);

  const banner = problem && (
    <div className="notice error app-problem" role="alert">
      <span>{problem}</span>
      <button className="btn" onClick={() => setProblem(null)}>Dismiss</button>
    </div>
  );

  if (view === "new") return <>{banner}<NewGame onStart={start} onBack={() => setView("title")} /></>;
  if (view === "game" && game) {
    return <>{banner}<GameShell game={game} tick={tick} changed={bump} onLoad={start} onQuit={() => setView("title")} /></>;
  }
  return <>{banner}<TitleScreen onNew={() => setView("new")} onLoad={start} /></>;
}
