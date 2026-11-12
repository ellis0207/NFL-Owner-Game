import { beforeEach, describe, expect, it } from "vitest";
import { cause } from "../src/engine/causes";
import { addMemo } from "../src/engine/delegation";
import { ensureUniqueIds } from "../src/engine/ids";
import { newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { switchEraSafely, RESUME_KEY } from "../src/save/era";
import { flushSaves, holdAutosave, listRecovery, onSaveStatus, readAutosave, resetSaveQueue, setSaveBackend, writeAutosave, writeRecoveryCopy, type SaveBackend, type SaveStatus } from "../src/save/local";

/** A save store in memory, with switches to make it fail the ways browsers do. */
class MemoryStore implements SaveBackend {
  rows = new Map<string, unknown>();
  puts: string[] = [];
  fail: "none" | "all" | "autosave" = "none";
  delay = 0;
  inFlight = 0;
  maxInFlight = 0;
  async get(key: string) {
    if (this.fail === "all") throw new Error("storage unavailable");
    return this.rows.get(key);
  }
  async put(key: string, value: unknown) {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
      if (this.fail === "all" || (this.fail === "autosave" && key === "autosave")) throw new Error("storage unavailable");
      this.rows.set(key, structuredClone(value));
      this.puts.push(key);
    } finally {
      this.inFlight--;
    }
  }
}

let store: MemoryStore;
let base: GameState;

beforeEach(() => {
  resetSaveQueue();
  store = new MemoryStore();
  setSaveBackend(store);
  base ??= newGame("DET", "Owner", { capRules: "real" }, 5);
});

describe("autosave", () => {
  it("reports saving and saved, and reads back what it wrote", async () => {
    const seen: SaveStatus["state"][] = [];
    const stop = onSaveStatus((s) => seen.push(s.state));
    expect(await writeAutosave(base)).toBe(true);
    stop();
    expect(seen).toEqual(["saving", "saved"]);
    const back = await readAutosave();
    expect(back?.state.date).toBe(base.date);
    expect(back?.recovered).toBeUndefined();
  }, 60_000);

  it("fails soft and says so when storage is unavailable", async () => {
    store.fail = "all";
    let last: SaveStatus | null = null;
    const stop = onSaveStatus((s) => { last = s; });
    expect(await writeAutosave(base)).toBe(false);
    stop();
    expect(last!.state).toBe("failed");
    expect(await readAutosave()).toBeNull();
  }, 60_000);

  it("writes one at a time and merges saves asked for while one is running", async () => {
    store.delay = 20;
    const first = writeAutosave(base);
    // Let the first write start; the next three arrive while it runs.
    await new Promise((r) => setTimeout(r, 5));
    const results = await Promise.all([first, writeAutosave(base), writeAutosave(base), writeAutosave(base)]);
    expect(results.every(Boolean)).toBe(true);
    expect(store.maxInFlight).toBe(1);
    // The first runs, the other three become one.
    expect(store.puts.filter((k) => k === "autosave").length).toBe(2);
  }, 60_000);

  it("keeps the last good save when a write is interrupted, and opens a recovery copy if the autosave is unreadable", async () => {
    expect(await writeAutosave(base)).toBe(true);
    expect((await listRecovery()).length).toBe(1);
    // A write that fails partway leaves the old autosave as it was.
    store.fail = "autosave";
    expect(await writeAutosave(base)).toBe(false);
    store.fail = "none";
    expect((await readAutosave())?.recovered).toBeUndefined();
    // A cut-off autosave (data shorter than recorded) falls back to the recovery copy.
    const row = store.rows.get("autosave") as { data: string; size: number };
    store.rows.set("autosave", { ...row, data: row.data.slice(0, row.data.length >> 1) });
    const back = await readAutosave();
    expect(back?.recovered).toBe(true);
    expect(back?.state.date).toBe(base.date);
  }, 60_000);

  it("rotates three recovery copies", async () => {
    for (let i = 0; i < 5; i++) expect(await writeRecoveryCopy(base)).toBe(true);
    expect((await listRecovery()).map((r) => r.slot).sort()).toEqual([0, 1, 2]);
    expect(store.rows.has("autosave")).toBe(false);
  }, 60_000);

  it("holds autosaves after a failed step until released", async () => {
    holdAutosave("step failed");
    expect(await writeAutosave(base)).toBe(false);
    expect(store.rows.has("autosave")).toBe(false);
    holdAutosave(null);
    expect(await writeAutosave(base)).toBe(true);
    await flushSaves();
  }, 60_000);
});

describe("switching start seasons", () => {
  function session() {
    const m = new Map<string, string>();
    return { m, storage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
  }

  it("never reloads when the save fails, and leaves session storage alone", async () => {
    const { m, storage } = session();
    m.set("nfl-era", "2015");
    let reloads = 0;
    const r = await switchEraSafely(2019, base, false, { save: async () => false, storage, reload: () => reloads++ });
    expect(r.ok).toBe(false);
    expect(reloads).toBe(0);
    expect(m.get("nfl-era")).toBe("2015");
    expect(m.has(RESUME_KEY)).toBe(false);
  });

  it("never reloads when session storage is blocked", async () => {
    let reloads = 0;
    const r = await switchEraSafely(2019, base, false, { save: async () => true, storage: null, reload: () => reloads++ });
    expect(r.ok).toBe(false);
    expect(reloads).toBe(0);
  });

  it("reloads once the save is confirmed", async () => {
    const { m, storage } = session();
    let reloads = 0;
    const r = await switchEraSafely(2019, base, false, { save: async () => true, storage, reload: () => reloads++ });
    expect(r.ok).toBe(true);
    expect(reloads).toBe(1);
    expect(m.get("nfl-era")).toBe("2019");
    expect(m.get(RESUME_KEY)).toBe("1");
  });

  it("switching without a save (the New game screen) still reloads", async () => {
    const { storage } = session();
    let reloads = 0;
    expect((await switchEraSafely(2012, undefined, true, { save: async () => false, storage, reload: () => reloads++ })).ok).toBe(true);
    expect(reloads).toBe(1);
  });
});

describe("decision ids", () => {
  it("stay unique when many decisions land on one day after the log is full", () => {
    const s = structuredClone(base);
    for (let i = 0; i < 300; i++) cause(s, "test", `decision ${i}`);
    const ids = s.causes!.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 0; i < 200; i++) addMemo(s, { kind: "general", title: `memo ${i}`, from: "CFO", problem: "", proposal: "", deadline: s.date, options: [{ label: "Yes" }, { label: "No" }] } as never);
    const memoIds = s.office!.memos.map((m) => m.id);
    expect(new Set(memoIds).size).toBe(memoIds.length);
  });

  it("repairs repeated ids in older saves", () => {
    const s = structuredClone(base);
    s.causes = [0, 1, 2].map(() => ({ id: "c2026-08-01-120", date: "2026-08-01", system: "x", text: "", effects: [] }));
    ensureUniqueIds(s);
    expect(new Set(s.causes.map((c) => c.id)).size).toBe(3);
    expect(s.causes[0].id).toBe("c2026-08-01-120");
  });
});
