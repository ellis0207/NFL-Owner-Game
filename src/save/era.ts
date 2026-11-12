// Switching start seasons reloads the page, because each season's data loads
// before the game does. The season to load goes in session storage (pack.ts
// reads it), and a save from that season is parked in the autosave to open
// after the reload. The reload happens only once both are confirmed: if the
// save can't be written or session storage is blocked, the page stays as it
// is and the game in memory is kept.
import type { GameState } from "../engine/types";
import { ERA_KEY } from "../engine/pack";
import { writeAutosave, writeRecoveryCopy } from "./local";

export const RESUME_KEY = "nfl-resume";
export const NEW_KEY = "nfl-to-new";

export interface EraSwitchDeps {
  save: (s: GameState) => Promise<boolean>;
  /** A recovery copy of the game being left, before anything else changes. */
  backup?: (s: GameState) => Promise<boolean>;
  storage: Pick<Storage, "setItem" | "removeItem" | "getItem"> | null;
  reload: () => void;
}

export type EraSwitchResult = { ok: true } | { ok: false; reason: string };

function browserDeps(): EraSwitchDeps {
  let storage: EraSwitchDeps["storage"] = null;
  try { storage = sessionStorage; } catch { /* blocked */ }
  return { save: writeAutosave, backup: writeRecoveryCopy, storage, reload: () => location.reload() };
}

export async function switchEraSafely(season: number, resume?: GameState, toNew = false, deps: EraSwitchDeps = browserDeps()): Promise<EraSwitchResult> {
  const { storage } = deps;
  if (!storage) return { ok: false, reason: "This browser blocks session storage, so the game can't reload into another season here." };
  if (resume) {
    await deps.backup?.(resume).catch(() => false);
    const saved = await deps.save(resume).catch(() => false);
    if (!saved) return { ok: false, reason: "The game couldn't be saved in this browser, so it didn't switch seasons. Nothing was lost: your game is still open. Export a save file from the Save page, then try again." };
  }
  let prev: string | null = null;
  try { prev = storage.getItem(ERA_KEY); } catch { /* blocked */ }
  try {
    if (season === 2026) storage.removeItem(ERA_KEY);
    else storage.setItem(ERA_KEY, String(season));
    if (resume) storage.setItem(RESUME_KEY, "1");
    if (toNew) storage.setItem(NEW_KEY, "1");
    // Read it back: some browsers accept the write and drop it.
    if (season !== 2026 && storage.getItem(ERA_KEY) !== String(season)) throw new Error("dropped");
  } catch {
    // Put things back so a manual reload still opens this season.
    try {
      storage.removeItem(RESUME_KEY);
      storage.removeItem(NEW_KEY);
      if (prev === null) storage.removeItem(ERA_KEY);
      else storage.setItem(ERA_KEY, prev);
    } catch { /* blocked */ }
    return { ok: false, reason: "This browser blocks session storage, so the game can't reload into another season here." };
  }
  deps.reload();
  return { ok: true };
}
