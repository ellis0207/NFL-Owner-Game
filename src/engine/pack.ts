// A historical start's data pack (2011-2025), built by pipeline/history_pack.py
// and published as its own file. The page loads the chosen pack before the
// engine and leaves it on globalThis.__NFL_PACK__; league.ts reads it in place
// of the 2026 files. With no pack the game is the 2026 start, unchanged.
// This file imports nothing, so league.ts can read it first.

export interface LeaguePack {
  season: number;
  teams: unknown[];
  players: unknown[];
  ratings: Record<string, unknown>;
  schedule: unknown[];
  staff: unknown;
  hiddenStaff: Record<string, unknown>;
  rules: Record<string, unknown> & { minimumByYear?: Record<string, Record<string, number>>; lastPlayoffs?: string[] };
}

/** The start season the page was asked to load (set by the New game screen or a save from another era, then the page reloads). */
export const ERA_KEY = "nfl-era";

function requested(): number | null {
  try {
    const v = Number(globalThis.sessionStorage?.getItem(ERA_KEY));
    return v >= 2011 && v <= 2025 ? v : null;
  } catch {
    return null;
  }
}

/** Why the requested pack didn't load, for the New game screen. */
export let PACK_ERROR: string | null = null;

async function fetchPack(season: number): Promise<LeaguePack | null> {
  try {
    // Published as base64 text of the gzipped pack (scripts/artifact-page.mjs).
    const res = await fetch(`packs/${season}.txt`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Uint8Array.from(atob((await res.text()).trim()), (c) => c.charCodeAt(0));
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(text) as LeaguePack;
  } catch (e) {
    PACK_ERROR = `The ${season} season's data didn't load (${e instanceof Error ? e.message : String(e)}).`;
    try { globalThis.sessionStorage?.removeItem(ERA_KEY); } catch { /* storage blocked */ }
    return null;
  }
}

// Tests leave a pack on globalThis first; the page fetches the one asked for.
// The await holds the rest of the engine until the pack is in.
const preset = (globalThis as { __NFL_PACK__?: LeaguePack }).__NFL_PACK__;
const want = preset ? null : requested();
export const PACK: LeaguePack | null = preset ?? (want ? await fetchPack(want) : null);

/** The year the game's made-up dollar figures (salaries, prices, costs) are set in. */
export const MONEY_YEAR = 2026;

/** Years from the money year: a historical start deflates the 2026 figures back to its own year. */
export function yearsFromMoneyYear(year: number, base = MONEY_YEAR): number {
  return PACK ? year - MONEY_YEAR : Math.max(0, year - base);
}

/** The real salary caps by league year (OverTheCap). */
export const REAL_CAPS: Record<number, number> = {
  2011: 120_000_000, 2012: 120_600_000, 2013: 123_000_000, 2014: 133_000_000, 2015: 143_280_000,
  2016: 155_270_000, 2017: 167_000_000, 2018: 177_200_000, 2019: 188_200_000, 2020: 198_200_000,
  2021: 182_500_000, 2022: 208_200_000, 2023: 224_800_000, 2024: 255_400_000, 2025: 279_200_000, 2026: 301_200_000,
};
