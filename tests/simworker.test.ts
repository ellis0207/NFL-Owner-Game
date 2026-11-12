import { describe, expect, it } from "vitest";
import { simWeek } from "../src/engine/season";
import { parseSaveFile, toSaveFile } from "../src/save/codec";
import type { FromWorker, ToWorker } from "../src/sim/protocol";
import { startSimWorker } from "../src/sim/worker";
import { stateAt } from "./fixtures";

// The worker's side of a multi-day sim, driven through a stand-in for the
// worker scope: it plays the same days the page would, reports each one, and
// stops between days when asked.
function fakeWorker() {
  const out: FromWorker[] = [];
  let handler: ((e: { data: ToWorker }) => void) | null = null;
  startSimWorker({ postMessage: (m) => out.push(m), addEventListener: (_t, fn) => { handler = fn; } });
  const send = (m: ToWorker) => handler!({ data: m });
  const finished = (id: number) => new Promise<FromWorker>((ok) => {
    const t = setInterval(() => { const d = out.find((m) => (m.type === "done" || m.type === "error") && m.id === id); if (d) { clearInterval(t); ok(d); } }, 5);
  });
  return { out, send, finished };
}

const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;

describe("the simulation worker", () => {
  it("plays a week exactly as the page would, reporting every day", async () => {
    const w = fakeWorker();
    expect(w.out[0]).toEqual({ type: "ready" });
    const start = stateAt("NYG", 7, "regularSeasonStart");
    w.send({ type: "run", id: 1, kind: "week", save: JSON.stringify(toSaveFile(start)) });
    const done = await w.finished(1);
    expect(done.type).toBe("done");
    if (done.type !== "done") return;
    const progress = w.out.filter((m) => m.type === "progress");
    expect(progress.length).toBe(done.days);
    expect(done.days).toBeGreaterThan(0);
    const here = stateAt("NYG", 7, "regularSeasonStart");
    simWeek(here);
    expect(JSON.stringify(canon(JSON.parse(JSON.stringify(parseSaveFile(done.save)))))).toBe(JSON.stringify(canon(JSON.parse(JSON.stringify(here)))));
  }, 300_000);

  it("stops between days when asked", async () => {
    const w = fakeWorker();
    const start = stateAt("NYG", 7, "regularSeasonStart");
    w.send({ type: "run", id: 2, kind: "week", save: JSON.stringify(toSaveFile(start)) });
    w.send({ type: "cancel", id: 2 });
    const done = await w.finished(2);
    expect(done.type === "done" && done.cancelled).toBe(true);
    if (done.type === "done") {
      expect(done.days).toBeLessThan(7);
      expect(parseSaveFile(done.save).date > start.date || done.days === 0).toBe(true);
    }
  }, 300_000);
});
