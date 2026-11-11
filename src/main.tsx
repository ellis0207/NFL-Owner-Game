import { createRoot } from "react-dom/client";
import type { GameState } from "./engine/types";
import { migrate } from "./save/codec";
import { App } from "./ui/App";
import { applyPrefs } from "./ui/prefs";
import "./ui/styles.css";

// Text size, contrast and theme apply from the first screen.
applyPrefs();

type Hot = { ready?: (fn: (data: unknown) => void) => void; data?: unknown };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: unknown) {
  const saved = (data as { game?: GameState } | undefined)?.game;
  const initial = saved ? migrate(saved) : undefined;
  createRoot(document.getElementById("root")!).render(<App initial={initial} />);
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
