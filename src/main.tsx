import { createRoot } from "react-dom/client";
import type { GameState } from "./engine/types";
import { App } from "./ui/App";
import "./ui/styles.css";

type Hot = { ready?: (fn: (data: unknown) => void) => void; data?: unknown };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: unknown) {
  const initial = (data as { game?: GameState } | undefined)?.game ?? undefined;
  createRoot(document.getElementById("root")!).render(<App initial={initial} />);
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
