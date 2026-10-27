// Autosave in this browser (IndexedDB). Can be unavailable in private
// windows or previews; every call fails soft.
import type { GameState } from "../engine/types";
import { compress, decompress } from "./codec";

const DB_NAME = "nfl-owner-sim";
const STORE = "saves";
const AUTOSAVE = "autosave";

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
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface AutosaveInfo {
  team: string;
  date: string;
  savedAt: string;
}

export async function writeAutosave(state: GameState): Promise<boolean> {
  try {
    const data = await compress(state);
    const info: AutosaveInfo = { team: state.userTeam, date: state.date, savedAt: new Date().toISOString() };
    await withStore("readwrite", (s) => s.put({ info, data }, AUTOSAVE));
    return true;
  } catch {
    return false;
  }
}

export async function readAutosave(): Promise<{ info: AutosaveInfo; state: GameState } | null> {
  try {
    const row = (await withStore("readonly", (s) => s.get(AUTOSAVE))) as { info: AutosaveInfo; data: string } | undefined;
    if (!row) return null;
    return { info: row.info, state: await decompress(row.data) };
  } catch {
    return null;
  }
}

export async function peekAutosave(): Promise<AutosaveInfo | null> {
  try {
    const row = (await withStore("readonly", (s) => s.get(AUTOSAVE))) as { info: AutosaveInfo } | undefined;
    return row?.info ?? null;
  } catch {
    return null;
  }
}
