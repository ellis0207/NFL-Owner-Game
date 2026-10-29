// Saved games for the tests. Playing a season to a date takes most of a
// minute, so each state is played once and kept (as a save file) in
// node_modules/.cache/nfl-fixtures, keyed by a hash of the engine, save code
// and data: any change there replays them. A later date starts from the
// latest saved state before it. Every call hands back a fresh copy that went
// through the save loader, as a player's loaded game would.
//
// FIXTURES=stale lets a state saved by older code stand in when there is none
// for the current code: quick calibration runs of offseason work then skip
// replaying the season. Final checks run without it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_KEY_DATES } from "../src/engine/league";
import { advanceDay, isGameOver, isSeasonOver, newGame } from "../src/engine/season";
import type { GameState } from "../src/engine/types";
import { parseSaveFile, toSaveFile } from "../src/save/codec";

const DIR = "node_modules/.cache/nfl-fixtures";
/** The day after the 2026 season ends (the Super Bowl), when the offseason opens. */
export const SEASON_END = "end";

const memo = new Map<string, string>();
let version: string | undefined;

function filesIn(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? filesIn(p) : [p];
  });
}

function codeVersion(): string {
  if (!version) {
    const h = createHash("sha1");
    for (const f of [...filesIn("src/engine"), ...filesIn("src/save"), ...filesIn("data")]) h.update(f).update(readFileSync(f));
    version = h.digest("hex").slice(0, 12);
  }
  return version;
}

function fileFor(team: string, seed: number, at: string): string {
  return join(DIR, `${team}-${seed}-${at}-${codeVersion()}.json`);
}

function load(team: string, seed: number, at: string): string | undefined {
  const file = fileFor(team, seed, at);
  if (!memo.has(file)) {
    try {
      memo.set(file, readFileSync(file, "utf8"));
    } catch {
      const old = process.env.FIXTURES === "stale" && staleFile(team, seed, at);
      if (!old) return undefined;
      console.warn(`fixtures: using ${old} from older code`);
      memo.set(file, readFileSync(old, "utf8"));
    }
  }
  return memo.get(file);
}

function staleFile(team: string, seed: number, at: string): string | undefined {
  const prefix = `${team}-${seed}-${at}-`;
  try {
    return readdirSync(DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((f) => join(DIR, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  } catch {
    return undefined;
  }
}

function store(team: string, seed: number, at: string, text: string): void {
  const file = fileFor(team, seed, at);
  memo.set(file, text);
  mkdirSync(DIR, { recursive: true });
  // States from older code are dead weight, unless runs are leaning on them.
  if (process.env.FIXTURES !== "stale") {
    for (const f of readdirSync(DIR)) if (!f.endsWith(`-${codeVersion()}.json`)) rmSync(join(DIR, f), { force: true });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** The latest saved date for this save that comes before `date`. */
function savedBefore(team: string, seed: number, date: string): string | undefined {
  const prefix = `${team}-${seed}-`;
  const suffix = `-${codeVersion()}.json`;
  let names: string[] = [];
  try {
    names = readdirSync(DIR);
  } catch { /* no cache yet */ }
  const dates = [...names, ...[...memo.keys()].map((k) => k.slice(DIR.length + 1))]
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => f.slice(prefix.length, -suffix.length))
    .filter((d) => /^\d{4}-\d\d-\d\d$/.test(d) && d < date);
  const after = dates.filter((d) => d > BASE_KEY_DATES.superBowl);
  // Past the Super Bowl the season's end is a starting point too.
  if (date > BASE_KEY_DATES.superBowl && !after.length) return SEASON_END;
  return dates.sort().at(-1);
}

/**
 * A copy of a new game for `team` and `seed` (real cap rules), played to
 * `at`: SEASON_END, a 2026 key-date name such as "draftStart", or a date.
 */
export function stateAt(team: string, seed: number, at: string = SEASON_END): GameState {
  const date = at === SEASON_END ? at : BASE_KEY_DATES[at] ?? at;
  const saved = load(team, seed, date);
  if (saved) return parseSaveFile(saved);
  let state: GameState;
  if (date === SEASON_END) {
    state = newGame(team, "Owner", { capRules: "real" }, seed);
    while (!isSeasonOver(state)) advanceDay(state);
  } else {
    const from = savedBefore(team, seed, date);
    state = from ? stateAt(team, seed, from) : newGame(team, "Owner", { capRules: "real" }, seed);
    while (state.date < date && !isGameOver(state)) advanceDay(state);
  }
  const text = JSON.stringify(toSaveFile(state));
  store(team, seed, date, text);
  return parseSaveFile(text);
}

/**
 * Where a calibration report starts: a new game, or with FROM set (a key-date
 * name, a date or "end") the saved state there, so a report on the offseason
 * doesn't replay the season every run.
 */
export function reportStart(team: string, seed: number): GameState {
  const from = process.env.FROM;
  return from ? stateAt(team, seed, from) : newGame(team, "Report", { capRules: "real" }, seed);
}
