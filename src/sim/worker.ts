// The simulation worker's side. The page starts the worker from its own
// script (so the single-file build carries one copy of the engine), and
// main.tsx calls this instead of rendering when there's no document.
import { simDays } from "../engine/season";
import { parseSaveFile, toSaveFile } from "../save/codec";
import type { FromWorker, ToWorker } from "./protocol";

interface WorkerScope {
  postMessage(m: FromWorker): void;
  addEventListener(type: "message", fn: (e: { data: ToWorker }) => void): void;
}

/** Plays one run a day at a time, answering a stop between days. */
export function startSimWorker(scope: WorkerScope = globalThis as unknown as WorkerScope): void {
  const stopped = new Set<number>();
  scope.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "cancel") { stopped.add(m.id); return; }
    if (m.type !== "run") return;
    void (async () => {
      let days = 0;
      try {
        const state = parseSaveFile(m.save);
        const it = simDays(state, m.kind);
        while (!stopped.has(m.id)) {
          const r = it.next();
          if (r.done) break;
          days++;
          scope.postMessage({ type: "progress", id: m.id, date: r.value, days });
          // Let a stop message in before the next day starts.
          await new Promise((ok) => setTimeout(ok, 0));
        }
        scope.postMessage({ type: "done", id: m.id, save: JSON.stringify(toSaveFile(state)), days, cancelled: stopped.has(m.id) });
      } catch (err) {
        scope.postMessage({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
      } finally {
        stopped.delete(m.id);
      }
    })();
  });
  scope.postMessage({ type: "ready" });
}
