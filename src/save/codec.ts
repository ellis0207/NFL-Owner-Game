// Turning a game into a compact string and back. Saves are gzip-compressed
// JSON, base64-encoded so they fit in text stores.
import type { GameState } from "../engine/types";

export const SAVE_FORMAT = "nfl-owner-sim-save";

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: 1;
  savedAt: string;
  state: GameState;
}

export function toSaveFile(state: GameState): SaveFile {
  return { format: SAVE_FORMAT, version: 1, savedAt: new Date().toISOString(), state };
}

export function parseSaveFile(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a save file: it isn't valid JSON.");
  }
  const file = parsed as Partial<SaveFile>;
  if (file?.format !== SAVE_FORMAT || !file.state) throw new Error("That file isn't an NFL Owner Simulator save.");
  if (file.version !== 1 || file.state.version !== 1) throw new Error("That save comes from a newer version of the game.");
  return file.state;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function compress(state: GameState): Promise<string> {
  const json = JSON.stringify(toSaveFile(state));
  return toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream("gzip")));
}

export async function decompress(b64: string): Promise<GameState> {
  const bytes = await pipe(fromBase64(b64), new DecompressionStream("gzip"));
  return parseSaveFile(new TextDecoder().decode(bytes));
}
