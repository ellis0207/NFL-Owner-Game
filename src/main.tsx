import { createRoot } from "react-dom/client";
import type { GameState } from "./engine/types";
import { migrate } from "./save/codec";
import { startSimWorker } from "./sim/worker";
import { App } from "./ui/App";
import { applyPrefs } from "./ui/prefs";
// Styles: the shared base, the shell's pieces, then one file per room.
import "./ui/styles/base.css";
import "./ui/styles/kit.css";
import "./ui/styles/gfx.css";
import "./ui/styles/masthead.css";
import "./ui/styles/rooms/desk.css";
import "./ui/styles/rooms/team.css";
import "./ui/styles/rooms/building.css";
import "./ui/styles/rooms/draft.css";
import "./ui/styles/rooms/office.css";
import "./ui/styles/rooms/league.css";
import "./ui/styles/rooms/game.css";
import "./ui/styles/field.css";
import "./ui/styles/tips.css";
import "./ui/styles/app.css";
import "./ui/styles/hall.css";
import "./ui/styles/mediapages.css";
import "./ui/styles/lab.css";
import "./ui/styles/frontdoor.css";

type Hot = { ready?: (fn: (data: unknown) => void) => void; data?: unknown };

function start(data: unknown) {
  const saved = (data as { game?: GameState } | undefined)?.game;
  const initial = saved ? migrate(saved) : undefined;
  createRoot(document.getElementById("root")!).render(<App initial={initial} />);
}

// The same script runs the simulation worker (src/sim/runner.ts starts it from
// this page's code): with no document, it answers sim runs instead of rendering.
if (typeof document === "undefined") startSimWorker();
else {
  // Text size, contrast and theme apply from the first screen.
  applyPrefs();
  const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;
  if (hot?.ready) hot.ready(start);
  else start(hot?.data ?? {});
}
