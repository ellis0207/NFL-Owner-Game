// Messages between the page and the simulation worker. The worker holds no
// game of its own between runs: each run carries the save in, plays the days
// and hands the save back, so the page's copy is the one that's kept.
import type { SimKind } from "../engine/season";

export type ToWorker =
  | { type: "run"; id: number; kind: SimKind; save: string }
  | { type: "cancel"; id: number };

export type FromWorker =
  | { type: "ready" }
  | { type: "progress"; id: number; date: string; days: number }
  | { type: "done"; id: number; save: string; days: number; cancelled: boolean }
  | { type: "error"; id: number; message: string };
