import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BASE_SEASON } from "../engine/league";
import { ERA_KEY } from "../engine/pack";
import { TEAM_COLORS } from "../engine/teamColors";
import type { GameState } from "../engine/types";
import { readAutosave, writeAutosave } from "../save/local";
import { onColor } from "./format";
import { GameShell } from "./GameShell";
import { NewGame } from "./NewGame";
import { TitleScreen } from "./TitleScreen";

type View = "title" | "new" | "game";

const RESUME_KEY = "nfl-resume";
const NEW_KEY = "nfl-to-new";

/**
 * Each start season's data loads before the game does, so switching seasons
 * reloads the page: the season to load goes in session storage (pack.ts reads
 * it), and a save from that season is parked in the autosave to open after.
 */
export function switchEra(season: number, resume?: GameState, toNew = false): void {
  const go = () => {
    try {
      if (season === 2026) sessionStorage.removeItem(ERA_KEY);
      else sessionStorage.setItem(ERA_KEY, String(season));
      if (resume) sessionStorage.setItem(RESUME_KEY, "1");
      if (toNew) sessionStorage.setItem(NEW_KEY, "1");
    } catch { /* storage blocked: the page stays on this season */ }
    location.reload();
  };
  if (resume) void writeAutosave(resume).then(go);
  else go();
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
    if (eraOf(state) !== BASE_SEASON) return switchEra(eraOf(state), state);
    setGame(state);
    setView("game");
  }, []);

  // After a reload for a save from another season, open it.
  useEffect(() => {
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_KEY) === "1"; sessionStorage.removeItem(RESUME_KEY); } catch { /* storage blocked */ }
    if (resume) void readAutosave().then((r) => { if (r && eraOf(r.state) === BASE_SEASON) { setGame(r.state); setView("game"); } });
  }, []);

  if (view === "new") return <NewGame onStart={start} onBack={() => setView("title")} />;
  if (view === "game" && game) {
    return <GameShell game={game} tick={tick} changed={bump} onLoad={start} onQuit={() => setView("title")} />;
  }
  return <TitleScreen onNew={() => setView("new")} onLoad={start} />;
}
