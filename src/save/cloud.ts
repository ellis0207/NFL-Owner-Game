// Cloud saves and file export, through the claude.ai page capabilities.
// Each viewer's saves live in their own private area of the artifact's
// database (data/users/<id>/...), so nobody else can see or overwrite them.
// Outside claude.ai these resolve to null and the UI hides them.
import type { GameState } from "../engine/types";
import { compress, decompress, toSaveFile } from "./codec";

interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface Db { doc(path: string): DocRef }
interface User { id(): Promise<string | null> }
interface Downloads { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> }
interface ClaudeHost { use(name: string): Promise<unknown> }

function host(): ClaudeHost | undefined {
  return (window as unknown as { claude?: ClaudeHost }).claude;
}

async function use<T>(name: string): Promise<T | null> {
  try {
    return ((await host()?.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

export const SLOTS = ["slot-1", "slot-2", "slot-3"] as const;
export type Slot = (typeof SLOTS)[number];
const CHUNK = 180_000; // characters per document; documents are capped at 256 KiB

export interface SlotInfo {
  slot: Slot;
  team: string;
  date: string;
  owner: string;
  savedAt: string;
  chunks: number;
}

export interface Cloud {
  list(): Promise<Partial<Record<Slot, SlotInfo>>>;
  save(slot: Slot, state: GameState): Promise<void>;
  load(slot: Slot): Promise<GameState>;
}

export async function connectCloud(): Promise<Cloud | null> {
  const [db, user] = await Promise.all([use<Db>("db"), use<User>("user")]);
  if (!db || !user) return null;
  const uid = await user.id().catch(() => null);
  if (!uid) return null;
  const base = `data/users/${uid}`;
  const index = db.doc(`${base}/save-index`);

  const readIndex = async () => ((await index.get()).data()?.slots ?? {}) as Partial<Record<Slot, SlotInfo>>;

  return {
    list: readIndex,
    async save(slot, state) {
      const data = await compress(state);
      const chunks = Math.max(1, Math.ceil(data.length / CHUNK));
      for (let i = 0; i < chunks; i++) {
        await db.doc(`${base}/${slot}-part-${i}`).set({ data: data.slice(i * CHUNK, (i + 1) * CHUNK) });
      }
      const slots = await readIndex();
      const old = slots[slot];
      for (let i = chunks; i < (old?.chunks ?? 0); i++) await db.doc(`${base}/${slot}-part-${i}`).delete();
      slots[slot] = { slot, team: state.userTeam, date: state.date, owner: state.ownerName, savedAt: new Date().toISOString(), chunks };
      await index.set({ slots });
    },
    async load(slot) {
      const info = (await readIndex())[slot];
      if (!info) throw new Error("That save slot is empty.");
      let data = "";
      for (let i = 0; i < info.chunks; i++) {
        const part = (await db.doc(`${base}/${slot}-part-${i}`).get()).data();
        if (!part) throw new Error("Part of that save is missing. Try another slot.");
        data += part.data as string;
      }
      return decompress(data);
    },
  };
}

export async function connectDownloads(): Promise<Downloads | null> {
  return use<Downloads>("downloads");
}

export function exportFileName(state: GameState): string {
  return `nfl-owner-${state.userTeam}-${state.date}.json`;
}

export function exportText(state: GameState): string {
  return JSON.stringify(toSaveFile(state));
}
