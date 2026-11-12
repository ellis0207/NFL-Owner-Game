// Autosave in this browser (IndexedDB). Can be unavailable in private
// windows or previews; every call fails soft and reports what happened.
//
// Writes go one at a time: a save asked for while another is being written
// waits for it, and several asked for meanwhile become one (the game state is
// a single object, so the last one asked for is the one that counts).
// Besides the autosave, a ring of recovery saves keeps older copies, written
// every week of game time or ten minutes of play, and before risky steps such
// as switching seasons. If the autosave can't be read back, the newest
// readable recovery save opens instead.
import type { GameState } from "../engine/types";
import { compress, decompress } from "./codec";

const DB_NAME = "nfl-owner-sim";
const STORE = "saves";
const AUTOSAVE = "autosave";
const RECOVERY_SLOTS = 3;
const RECOVERY_META = "recovery-meta";
const recoveryKey = (i: number) => `recovery-${i}`;

/** Where saves are kept. IndexedDB in the browser; tests put in their own. */
export interface SaveBackend {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => { result = req.result; if (mode === "readonly") resolve(result); };
    req.onerror = () => reject(req.error);
    // A write counts only once the transaction commits; an abort (quota, tab closing) is a failure.
    if (mode === "readwrite") {
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error("The save was interrupted."));
    }
  });
}

const indexedDbBackend: SaveBackend = {
  get: (key) => withStore("readonly", (s) => s.get(key)),
  put: async (key, value) => { await withStore("readwrite", (s) => s.put(value, key)); },
};

let backend: SaveBackend = indexedDbBackend;

/** Swap where saves go (tests). Returns the one it replaced. */
export function setSaveBackend(b: SaveBackend | null): SaveBackend {
  const old = backend;
  backend = b ?? indexedDbBackend;
  return old;
}

export interface AutosaveInfo {
  team: string;
  date: string;
  savedAt: string;
}

interface Row {
  info: AutosaveInfo;
  data: string;
  /** Length of the data, checked before it is opened, so a cut-off write is caught. */
  size?: number;
}

// ---- Save status, for the indicator in the scoreboard ----

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: string; date: string }
  | { state: "failed"; error: string; at: string }
  | { state: "held"; reason: string };

let status: SaveStatus = { state: "idle" };
const listeners = new Set<(s: SaveStatus) => void>();

function setStatus(s: SaveStatus): void {
  status = s;
  for (const fn of listeners) fn(s);
}

export function saveStatus(): SaveStatus {
  return status;
}

/** Hear about each change of save status. Returns the way to stop listening. */
export function onSaveStatus(fn: (s: SaveStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- Holding autosaves after an error ----

let held: string | null = null;

/**
 * After an action fails partway the game in memory may be half changed.
 * Holding stops autosaves from writing over the last good save until the
 * owner decides to carry on (release) or go back to it.
 */
export function holdAutosave(reason: string | null): void {
  held = reason;
  if (reason) setStatus({ state: "held", reason });
  else if (status.state === "held") setStatus({ state: "idle" });
}

export function autosaveHeld(): boolean {
  return held !== null;
}

// ---- Writing ----

let tail: Promise<unknown> = Promise.resolve();
let queued: { state: GameState; force: boolean; promise: Promise<boolean> } | null = null;
let lastRecovery: { date: string; at: number } | null = null;

function errorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "QuotaExceededError") return "The browser's storage for this page is full.";
  if (typeof indexedDB === "undefined" && backend === indexedDbBackend) return "This browser doesn't allow saving here.";
  return e instanceof Error && e.message ? e.message : "The browser refused the save.";
}

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;

/** A recovery copy is due after a week of game time or ten minutes of real time. */
function recoveryDue(state: GameState, now: number): boolean {
  if (!lastRecovery) return true;
  return daysBetween(lastRecovery.date, state.date) >= 7 || now - lastRecovery.at >= 10 * 60_000;
}

async function writeRecovery(row: Row): Promise<void> {
  const meta = ((await backend.get(RECOVERY_META).catch(() => null)) as { next: number } | null) ?? { next: 0 };
  const slot = ((meta.next % RECOVERY_SLOTS) + RECOVERY_SLOTS) % RECOVERY_SLOTS;
  await backend.put(recoveryKey(slot), row);
  await backend.put(RECOVERY_META, { next: slot + 1 });
}

async function doWrite(state: GameState, recovery: boolean): Promise<boolean> {
  if (held && !recovery) return false;
  setStatus({ state: "saving" });
  try {
    const data = await compress(state);
    const savedAt = new Date().toISOString();
    const row: Row = { info: { team: state.userTeam, date: state.date, savedAt }, data, size: data.length };
    const now = Date.now();
    // The recovery copy goes first: if the autosave write is cut off, the copy is already safe.
    if (recovery || recoveryDue(state, now)) {
      await writeRecovery(row);
      lastRecovery = { date: state.date, at: now };
    }
    if (!recovery) await backend.put(AUTOSAVE, row);
    setStatus({ state: "saved", at: savedAt, date: state.date });
    return true;
  } catch (e) {
    setStatus({ state: "failed", error: errorText(e), at: new Date().toISOString() });
    return false;
  }
}

function enqueue(state: GameState, recovery: boolean): Promise<boolean> {
  // Saves waiting to start merge into one; a recovery copy never merges away.
  if (queued && !recovery && !queued.force) {
    queued.state = state;
    return queued.promise;
  }
  const entry = { state, force: recovery } as { state: GameState; force: boolean; promise: Promise<boolean> };
  entry.promise = tail.then(() => {
    if (queued === entry) queued = null;
    return doWrite(entry.state, entry.force);
  });
  if (!recovery) queued = entry;
  tail = entry.promise.catch(() => false);
  return entry.promise;
}

/** Save the game as the browser's autosave. True only once the write has committed. */
export function writeAutosave(state: GameState): Promise<boolean> {
  return enqueue(state, false);
}

/** Save a recovery copy now (before switching seasons, after an error). */
export function writeRecoveryCopy(state: GameState): Promise<boolean> {
  return enqueue(state, true);
}

/** Resolves once every save asked for so far has finished. */
export async function flushSaves(): Promise<void> {
  await tail;
}

// ---- Reading ----

async function readRow(key: string): Promise<{ info: AutosaveInfo; state: GameState } | null> {
  const row = (await backend.get(key)) as Row | undefined;
  if (!row?.data) return null;
  if (row.size !== undefined && row.size !== row.data.length) throw new Error("The save was cut off while it was written.");
  return { info: row.info, state: await decompress(row.data) };
}

export interface RecoveryInfo extends AutosaveInfo {
  slot: number;
}

/** The recovery copies, newest first. */
export async function listRecovery(): Promise<RecoveryInfo[]> {
  const out: RecoveryInfo[] = [];
  for (let i = 0; i < RECOVERY_SLOTS; i++) {
    try {
      const row = (await backend.get(recoveryKey(i))) as Row | undefined;
      if (row?.info) out.push({ ...row.info, slot: i });
    } catch { /* unreadable slot */ }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readRecovery(slot: number): Promise<{ info: AutosaveInfo; state: GameState } | null> {
  try {
    return await readRow(recoveryKey(slot));
  } catch {
    return null;
  }
}

/**
 * The autosave, or if it can't be opened (cut off, corrupted), the newest
 * recovery copy that can; `recovered` says which.
 */
export async function readAutosave(): Promise<{ info: AutosaveInfo; state: GameState; recovered?: boolean } | null> {
  try {
    const r = await readRow(AUTOSAVE);
    if (r) return r;
  } catch { /* fall through to the recovery copies */ }
  for (const info of await listRecovery().catch(() => [])) {
    const r = await readRecovery(info.slot);
    if (r) return { ...r, recovered: true };
  }
  return null;
}

export async function peekAutosave(): Promise<AutosaveInfo | null> {
  try {
    const row = (await backend.get(AUTOSAVE)) as Row | undefined;
    if (row?.info) return row.info;
  } catch { /* fall through */ }
  const rec = await listRecovery().catch(() => []);
  return rec[0] ?? null;
}

/** Forget the in-memory bookkeeping (tests). */
export function resetSaveQueue(): void {
  tail = Promise.resolve();
  queued = null;
  lastRecovery = null;
  held = null;
  status = { state: "idle" };
}
