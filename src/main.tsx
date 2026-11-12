import { createRoot } from "react-dom/client";
import type { GameState } from "./engine/types";
import { migrate } from "./save/codec";
import { startSimWorker } from "./sim/worker";
import { App } from "./ui/App";
import { applyPrefs } from "./ui/prefs";
import "./ui/styles.css";

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
