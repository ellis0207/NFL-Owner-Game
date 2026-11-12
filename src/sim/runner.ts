// Runs the owner's multi-day sims (a week, to the next game, to the next key
// date) without freezing the page: in a worker when one starts, otherwise on
// the page a day at a time with a pause between days. Either way the caller
// gets progress after every day and can stop between days.
//
// The worker is started from the page's own inline script, so the single-file
// build still carries one copy of the engine. A historical start passes its
// season pack in first. If the worker can't start (a host that blocks blob
// workers, the dev server's external scripts), the page runs the days itself.
import { PACK } from "../engine/pack";
import { simDays, type SimKind } from "../engine/season";
import type { GameState } from "../engine/types";
import { parseSaveFile, toSaveFile } from "../save/codec";
import type { FromWorker, ToWorker } from "./protocol";

export interface SimProgress {
  date: string;
  days: number;
}

export interface SimRun {
  /** The game after the run: the same object when the page ran it, a fresh copy from the worker. */
  done: Promise<{ state: GameState; days: number; cancelled: boolean; where: "worker" | "page" }>;
  /** Stop after the day being played. */
  cancel(): void;
}

let worker: Worker | null = null;
let ready = false;
let failed = false;
let nextId = 1;

/** The page's own module script, which doubles as the worker's code. */
function pageScript(): string | null {
  if (typeof document === "undefined") return null;
  for (const s of Array.from(document.querySelectorAll("script[type=module]"))) {
    if (!s.getAttribute("src") && (s.textContent?.length ?? 0) > 100_000) return s.textContent;
  }
  return null;
}

/** Starts the worker in the background, so it's ready by the first long sim. */
export function warmSimWorker(): void {
  if (worker || failed || typeof Worker === "undefined") return;
  const code = pageScript();
  if (!code) { failed = true; return; }
  try {
    const pack = PACK ? `globalThis.__NFL_PACK__ = ${JSON.stringify(PACK)};\n` : "";
    const url = URL.createObjectURL(new Blob([pack, code], { type: "text/javascript" }));
    worker = new Worker(url, { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<FromWorker>) => { if (e.data.type === "ready") ready = true; });
    worker.addEventListener("error", () => { failed = true; ready = false; worker?.terminate(); worker = null; });
  } catch {
    failed = true;
    worker = null;
  }
}

/** Where the next run would go, for the progress panel. */
export function simWhere(): "worker" | "page" {
  return worker && ready && !failed ? "worker" : "page";
}

export function runSim(state: GameState, kind: SimKind, onProgress: (p: SimProgress) => void): SimRun {
  return worker && ready && !failed ? inWorker(worker, state, kind, onProgress) : onPage(state, kind, onProgress);
}

function onPage(state: GameState, kind: SimKind, onProgress: (p: SimProgress) => void): SimRun {
  let stop = false;
  const done = (async () => {
    const it = simDays(state, kind);
    let days = 0;
    while (!stop) {
      const r = it.next();
      if (r.done) break;
      days++;
      onProgress({ date: r.value, days });
      // Paint the progress and take a click on Stop before the next day.
      await new Promise((ok) => setTimeout(ok, 0));
    }
    return { state, days, cancelled: stop, where: "page" as const };
  })();
  return { done, cancel: () => { stop = true; } };
}

function inWorker(w: Worker, state: GameState, kind: SimKind, onProgress: (p: SimProgress) => void): SimRun {
  const id = nextId++;
  const done = new Promise<{ state: GameState; days: number; cancelled: boolean; where: "worker" }>((resolve, reject) => {
    const on = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (!("id" in m) || m.id !== id) return;
      if (m.type === "progress") onProgress({ date: m.date, days: m.days });
      else if (m.type === "done") {
        w.removeEventListener("message", on);
        resolve({ state: parseSaveFile(m.save), days: m.days, cancelled: m.cancelled, where: "worker" });
      } else if (m.type === "error") {
        w.removeEventListener("message", on);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", on);
    const msg: ToWorker = { type: "run", id, kind, save: JSON.stringify(toSaveFile(state)) };
    w.postMessage(msg);
  });
  return { done, cancel: () => w.postMessage({ type: "cancel", id } satisfies ToWorker) };
}
