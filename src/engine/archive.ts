// Versioned records: each league year closes with a snapshot of our
// contracts, the year's statement and the rules in force, so later changes
// never overwrite what was true then. And all-or-nothing actions: a big move
// either completes with every linked effect or leaves the save as it was.

import { capHit, capSummary } from "./cap";
import { dealOf, leagueYear, leagueYearStart } from "./contracts";
import { addDays } from "./dates";
import { PLAYER_BY_ID, RULES } from "./league";
import { LEAGUE_RULES } from "./rules";
import type { GameState, YearRecord } from "./types";

export function archive(state: GameState): Record<string, YearRecord> {
  return (state.archive ??= {});
}

/** Close a league year into the archive: compact, one per year. */
export function snapshotYear(state: GameState, year = leagueYear(state.date)): YearRecord {
  const a = archive(state);
  const contracts: YearRecord["contracts"] = [];
  for (const [id, p] of Object.entries(state.players)) {
    if (p.team !== state.userTeam) continue;
    const d = dealOf(state, id);
    if (!d) continue;
    const real = d.years.filter((y) => !y.void);
    contracts.push({ player: PLAYER_BY_ID[id]?.name ?? id, apy: Math.round(d.apy), through: real[real.length - 1]?.year ?? year, hit: Math.round(capHit(id, year, state)) });
  }
  contracts.sort((x, y) => y.apy - x.apy);
  const cap = capSummary(state, state.userTeam, year);
  const close = state.books?.closed.find((y) => y.year === year);
  const rec: YearRecord = {
    year, team: state.userTeam, owner: state.ownerName, taken: state.date,
    contracts: contracts.slice(0, 60), cap: { limit: Math.round(cap.limit), used: Math.round(cap.used), dead: Math.round(cap.dead) },
    statement: close ? { revenue: close.revenue, operating: close.operating, net: close.net, cashEnd: close.cashEnd, debtEnd: close.debtEnd } : undefined, rules: Object.entries(LEAGUE_RULES).map(([k, v]) => `${k}: ${v}`).sort(), season: RULES.season,
  };
  a[String(year)] = rec;
  return rec;
}

/**
 * Run a major action all or nothing: if it throws, or returns an error
 * message, the save goes back to how it was before it started.
 */
export function atomic<T>(state: GameState, fn: () => T): T {
  const before = structuredClone(state);
  try {
    const out = fn();
    if (typeof out === "string" && out) restore(state, before);
    return out;
  } catch (e) {
    restore(state, before);
    throw e;
  }
}

function restore(state: GameState, before: GameState): void {
  for (const k of Object.keys(state)) if (!(k in before)) delete (state as unknown as Record<string, unknown>)[k];
  Object.assign(state, before);
}

export function archiveDaily(state: GameState): void {
  // The last day of a league year: keep its contracts, cap and rules as they stood.
  const y = Number(state.date.slice(0, 4));
  if (state.date === addDays(leagueYearStart(y), -1)) snapshotYear(state, y - 1);
  // The books close in the spring: add the year's statement once they have.
  if (state.date.slice(5) === "05-01") {
    const rec = archive(state)[String(y - 1)];
    const close = state.books?.closed.find((c) => c.year === y - 1);
    if (rec && close && !rec.statement) rec.statement = { revenue: close.revenue, operating: close.operating, net: close.net, cashEnd: close.cashEnd, debtEnd: close.debtEnd };
  }
}
