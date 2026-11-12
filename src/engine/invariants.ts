// Checks that a league is in a legal, consistent state. Hard errors are
// states the game should never reach (a player on two teams, a club with two
// head coaches, a club owned twice, numbers that aren't numbers, repeated
// decision ids). The long-run reports and the regression tests run these;
// balance questions (too many relocations, runaway contracts) are judged
// separately in tests/balance-report.ts against documented ranges.
import { capSummary } from "./cap";
import { cashBalance } from "./business";
import { leagueYear } from "./contracts";
import { controller } from "./franchisemarket";
import { RULES, TEAMS } from "./league";
import { rosterCount } from "./roster";
import type { GameState } from "./types";

export interface Violation {
  rule: string;
  detail: string;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

/** Every hard error in the state, empty when the league is consistent. */
export function invariants(state: GameState): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, detail: string) => out.push({ rule, detail });
  const teamIds = new Set(TEAMS.map((t) => t.id));

  // Players: a rostered player belongs to a real team, and a signed contract names the same team.
  for (const [id, p] of Object.entries(state.players)) {
    if (p.team && !teamIds.has(p.team)) add("player-team", `${id} is on unknown team ${p.team}`);
    const d = state.contracts[id];
    if (p.team && d && d.team !== p.team && (p.status === "active" || p.status === "ps")) add("contract-team", `${id} plays for ${p.team} on a ${d.team} contract`);
  }

  // Rosters: never negative, and after cutdown in season, at most 53 on the active roster.
  const inSeason = state.date > RULES.keyDates.rosterCutdown && state.date <= RULES.keyDates.superBowl;
  for (const t of TEAMS) {
    const c = rosterCount(state, t.id);
    if (c.roster < 0 || c.ps < 0 || c.ir < 0) add("roster-count", `${t.id} has a negative roster count`);
    if (inSeason && c.roster > 53) add("roster-limit", `${t.id} carries ${c.roster} players in season`);
  }

  // Money: every cap figure and the club's cash are real numbers.
  const year = leagueYear(state.date);
  for (const t of TEAMS) {
    const s = capSummary(state, t.id, year).space;
    if (!Number.isFinite(s)) add("cap-number", `${t.id} cap space is ${s}`);
  }
  if (!Number.isFinite(cashBalance(state))) add("cash-number", "club cash is not a number");

  // Staff: each club has one head coach and one GM, and nobody holds two jobs.
  const people = Object.values(state.staff?.people ?? {});
  for (const role of ["HC", "GM"] as const) {
    for (const t of TEAMS) {
      const n = people.filter((c) => c.team === t.id && c.role === role).length;
      if (n > 1) add("staff-duplicate", `${t.id} has ${n} people as ${role}`);
    }
  }

  // Ownership: no one controls two clubs (league rule), and the owner's club is a real one.
  if (!teamIds.has(state.userTeam)) add("user-team", `the owner's club ${state.userTeam} doesn't exist`);
  const owners = TEAMS.map((t) => controller(state, t.id)).filter((o) => o && o !== "Unknown");
  for (const o of dupes(owners)) add("ownership", `${o} controls more than one club`);

  // Decision records: ids are unique.
  for (const [name, list] of [["causes", state.causes], ["memos", state.office?.memos], ["tasks", state.office?.tasks], ["trade offers", state.trades?.offers]] as const) {
    const d = dupes((list ?? []).map((x: { id: string }) => x.id));
    if (d.length) add("duplicate-id", `${name}: ${d.slice(0, 3).join(", ")}`);
  }
  return out;
}
