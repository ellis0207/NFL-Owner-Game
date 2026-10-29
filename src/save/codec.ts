// Turning a game into a compact string and back. Saves are gzip-compressed
// JSON, base64-encoded so they fit in text stores.
import { ensureCollege } from "../engine/college";
import { clearDraftees, DRAFT_OVER, ensureDraft } from "../engine/draft";
import { ensureBusiness } from "../engine/business";
import { BASE_SEASON, PLAYERS, RULES } from "../engine/league";
import { applySeason, patchPlayers, startNewSeason } from "../engine/seasons";
import { ensureStaff } from "../engine/coaches";
import type { Deal, GameState, SignedContract } from "../engine/types";

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
  if (file.version !== 1 || (file.state.version as number) > 3) throw new Error("That save comes from a newer version of the game.");
  return migrate(file.state);
}

/** Brings a save from an older version of the game up to date. */
export function migrate(state: GameState): GameState {
  if ((state.version as number) === 1) {
    // Version 1 saves predate box scores, injuries and signed contracts.
    state.box ??= {};
    state.contracts ??= {};
    (state as { version: number }).version = 2;
  }
  if ((state.version as number) === 2) {
    // Version 2 stored only cap hits for signed contracts; they become full contracts.
    const old = state.contracts as unknown as Record<string, SignedContract>;
    const deals: Record<string, Deal | null> = {};
    for (const [id, c] of Object.entries(old)) {
      const total = c.seasons.reduce((s, y) => s + y.capHit, 0);
      deals[id] = {
        team: c.team, signed: c.date, kind: "minimum", signingBonus: 0, total, apy: total,
        guaranteedAtSigning: c.seasons.reduce((s, y) => s + y.guaranteed, 0),
        years: c.seasons.map((y) => ({ year: y.year, base: y.capHit, proration: 0, bonus: 0, guaranteed: y.guaranteed, injuryGuaranteed: 0 })),
      };
    }
    state.contracts = deals;
    // Contract talks, agents' trust, the league transaction log and team cash are new too.
    state.negotiations ??= {};
    state.trust ??= {};
    state.signings ??= [];
    state.finance ??= {};
    state.pressure ??= { fans: 50, media: 50 };
    state.version = 3;
  }
  // Another save's draftees leave the player list before this save's come back.
  clearDraftees();
  // The save's season: its dates, schedule, caps and draft classes.
  applySeason(state);
  // Everyone on a staff or looking for a job (saves from before the carousel start from the data).
  ensureStaff(state);
  // In-season moves used to leak into next year's rollover; rollover only exists from the Super Bowl on.
  if (state.date <= RULES.keyDates.superBowl) {
    for (const r of Object.values(state.league?.rollover ?? {})) delete r[RULES.season + 1];
  }
  // Saves from before the free agent pool: the unsigned players join the league as free agents.
  for (const p of PLAYERS) {
    if (!(p.id in state.players)) state.players[p.id] = { team: null, status: "fa", ...(p.lastTeam ? { lastTeam: p.lastTeam } : {}) };
  }
  // Saves from before the college universe get the season played up to today.
  ensureCollege(state);
  // The draft calendar (mocks, declarations, combine, order, comp picks), and this save's draftees.
  ensureDraft(state);
  // Credited seasons and career stats, for the draftees too.
  patchPlayers(state);
  // Saves from before the business side open their books today.
  ensureBusiness(state);
  // Saves from when the game ended with the draft sit on the day after it, where the next season now starts.
  if (state.date >= DRAFT_OVER && (state.season ?? BASE_SEASON) === RULES.season) startNewSeason(state);
  return state;
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
