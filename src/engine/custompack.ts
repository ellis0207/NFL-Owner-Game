// Custom league packs: rename and repaint the clubs. A pack is a small JSON
// file with a name, a version and, for any of the 32 clubs, a new city, name
// and two colors. Nothing else changes: players, coaches, owners
// and the rules stay as they are. Packs are checked before they're applied,
// and the save keeps the pack so it loads the same way.

import { TEAMS, TEAM_BY_ID } from "./league";
import { TEAM_COLORS } from "./teamColors";
import type { CustomLeague, GameState } from "./types";

export interface PackCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  pack?: CustomLeague;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const KNOWN_FIELDS = new Set(["city", "name", "colors"]);
const BASE_COLORS: Record<string, [string, string]> = Object.fromEntries(Object.entries(TEAM_COLORS).map(([k, v]) => [k, [...v] as [string, string]]));

/** Checks a pack file: the format version, known clubs, sensible names and colors, no two clubs alike. */
export function checkPack(text: string): PackCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file isn't valid JSON."], warnings };
  }
  const p = raw as Partial<CustomLeague> & Record<string, unknown>;
  if (!p || typeof p !== "object") return { ok: false, errors: ["The file isn't a league pack."], warnings };
  if (p.version !== 1) errors.push(`This game reads pack version 1; the file says ${JSON.stringify(p.version ?? "none")}.`);
  if (typeof p.name !== "string" || !p.name.trim()) errors.push("The pack needs a name.");
  if (!p.teams || typeof p.teams !== "object") errors.push("The pack lists no clubs.");
  const teams: CustomLeague["teams"] = {};
  for (const [id, t] of Object.entries(p.teams ?? {})) {
    if (!TEAM_BY_ID[id]) { errors.push(`${id} isn't one of the league's clubs (use the codes in the template).`); continue; }
    if (!t || typeof t !== "object") { errors.push(`${id}: expected an object.`); continue; }
    for (const k of Object.keys(t)) if (!KNOWN_FIELDS.has(k)) warnings.push(`${id}: "${k}" isn't used and will be ignored.`);
    const out: CustomLeague["teams"][string] = {};
    for (const k of ["city", "name"] as const) {
      const v = t[k];
      if (v === undefined) continue;
      if (typeof v !== "string" || !v.trim() || v.length > 30) errors.push(`${id}: ${k} must be text of 1 to 30 characters.`);
      else out[k] = v.trim();
    }
    if (t.colors !== undefined) {
      if (!Array.isArray(t.colors) || t.colors.length !== 2 || !t.colors.every((c) => typeof c === "string" && HEX.test(c))) errors.push(`${id}: colors must be two hex colors like "#1A2B3C".`);
      else out.colors = [t.colors[0], t.colors[1]];
    }
    teams[id] = out;
  }
  const full = TEAMS.map((t) => `${teams[t.id]?.city ?? t.city} ${teams[t.id]?.name ?? t.name}`.toLowerCase());
  const dup = full.filter((n, i) => full.indexOf(n) !== i);
  if (dup.length) errors.push(`Two clubs would share a name: ${[...new Set(dup)].join(", ")}.`);
  if (!Object.keys(teams).length && !errors.length) warnings.push("The pack changes no clubs.");
  const ok = errors.length === 0;
  return { ok, errors, warnings, ...(ok ? { pack: { name: String(p.name).trim(), version: 1, teams } } : {}) };
}

/** A template with every club as it is now, to edit and load back. */
export function packTemplate(): string {
  const teams = Object.fromEntries(TEAMS.map((t) => [t.id, { city: t.city, name: t.name, colors: TEAM_COLORS[t.id] }]));
  return JSON.stringify({ name: "My league", version: 1, teams }, null, 2);
}

/** Lays the save's pack over the clubs (after the brand and any moves). Called whenever a season is applied. */
export function bindCustomLeague(state: GameState): void {
  for (const [id, c] of Object.entries(BASE_COLORS)) TEAM_COLORS[id] = [...c] as [string, string];
  const pack = state.customLeague;
  if (!pack) return;
  for (const [id, t] of Object.entries(pack.teams)) {
    const team = TEAM_BY_ID[id];
    if (!team) continue;
    if (t.city) team.city = t.city;
    if (t.name) team.name = t.name;
    if (t.colors) TEAM_COLORS[id] = [...t.colors];
  }
}

/** Applies a checked pack to a save, or clears it with null. */
export function setCustomLeague(state: GameState, pack: CustomLeague | null): void {
  if (pack) state.customLeague = pack;
  else delete state.customLeague;
}
