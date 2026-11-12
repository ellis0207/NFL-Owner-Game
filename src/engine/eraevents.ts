// What happens on its own after a historical start that follows real history
// (eras.ts): the real sales of clubs on their dates, inheritances of control at
// each new season, and word of the real moves and renames as they take effect.
// Under alternate history none of it happens. The 2020 labor deal is in
// labor.ts, the caps in setCap (offseason.ts), the rules in rulesFor.

import { eraOwner, HOMES, washingtonName } from "./eras";
import { franchise, REAL_SALES } from "./franchisemarket";
import { news } from "./inbox";
import { CONTROL } from "./investors";
import { RULES, TEAMS, TEAM_BY_ID } from "./league";
import type { GameState } from "./types";

/** Who controls each club at the start: the owner of that season where it wasn't the 2026 one. */
export function eraStartControl(state: GameState): void {
  if (!state.era) return;
  const f = franchise(state);
  for (const t of TEAMS) {
    const o = eraOwner(t.id, state.era.start);
    if (o) f.control[t.id] = o;
  }
}

/** Called at each new season (the day after the draft), once the season is applied. */
export function eraNewSeason(state: GameState): void {
  const e = state.era;
  if (!e || e.alt) return;
  const season = RULES.season;
  const f = franchise(state);
  const soldInSave = new Set(f.sales.filter((x) => !("real" in x && x.real)).map((x) => x.team));
  for (const t of TEAMS) {
    // A club sold in this save, ours, or one whose real sale is still ahead keeps its owner for now.
    if (soldInSave.has(t.id) || t.id === state.userTeam || REAL_SALES.some((x) => x.team === t.id && x.date > state.date)) continue;
    const now = eraOwner(t.id, season) ?? CONTROL[t.id];
    if (now && (f.control[t.id] ?? CONTROL[t.id]) !== now) {
      f.control[t.id] = now;
      news(state, `Control of the ${TEAM_BY_ID[t.id].name} passes to ${now}`);
    }
  }
  for (const h of HOMES) if (season === h.until && e.start < h.until && !state.relocation?.moves.some((m) => m.team === h.team)) {
    news(state, `The ${TEAM_BY_ID[h.team].name} play their first season in ${TEAM_BY_ID[h.team].city} after leaving ${h.city}`);
  }
  if (washingtonName(season) !== washingtonName(season - 1)) news(state, `Washington's club plays this season as the ${washingtonName(season)}`);
}

/** The real sales of clubs, on the day the owners approved them. */
export function erasDaily(state: GameState): void {
  const e = state.era;
  if (!e || e.alt) return;
  for (const x of REAL_SALES) {
    if (x.date !== state.date || x.team === state.userTeam) continue;
    const f = franchise(state);
    if (f.sales.some((s) => s.team === x.team && s.date === x.date)) continue;
    f.sales.push({ ...x });
    f.control[x.team] = x.buyer;
    news(state, `League owners approve the sale of the ${TEAM_BY_ID[x.team].name} to ${x.buyer}`);
  }
}
