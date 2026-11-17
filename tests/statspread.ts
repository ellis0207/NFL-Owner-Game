// How a season's statistics are spread across players, judged against the real
// league. Team totals per game are checked by calibrate.ts; this checks the
// split among players, which is how the owner reads talent (no ratings).
//
// The ranges come from the 2023-2025 seasons in data/league-2026/players.json
// (17 games), widened a little: players who have since retired are missing
// from that file, so the real counts there are slight undercounts.
import { seasonTotals } from "../src/engine/stats";
import { FORMAT } from "../src/engine/format";
import type { GameState } from "../src/engine/types";

/** Counts of players over a mark, and the league leader's number, per regular season. */
export const STAT_RANGES = {
  pass4000: [4, 13],
  rush1000: [9, 20],
  rec1000: [16, 30],
  rec100: [4, 14],
  sack10: [12, 28],
  tackles100: [30, 70],
  int5: [4, 14],
  leadPassYds: [4400, 5300],
  leadRushYds: [1350, 2100],
  leadRecYds: [1450, 1950],
  leadRec: [110, 150],
  leadTargets: [155, 200],
  leadSacks: [14, 23],
  leadInt: [6, 11],
  leadTackles: [140, 185],
} as const;

export type SpreadKey = keyof typeof STAT_RANGES;

/** The season's spread, from regular-season totals. Marks scale with the season's length. */
export function statSpread(state: GameState): Record<SpreadKey, number> {
  const lines = Object.values(seasonTotals(state, "REG")).map((s) => s.line as Record<string, number>);
  const k = FORMAT.games / 17;
  const v = (l: Record<string, number>, key: string) => l[key] ?? 0;
  const count = (key: string, mark: number) => lines.filter((l) => v(l, key) >= mark * k).length;
  const lead = (f: (l: Record<string, number>) => number) => Math.round(Math.max(0, ...lines.map(f)) / k);
  const tackles = (l: Record<string, number>) => v(l, "tklSolo") + v(l, "tklAst");
  return {
    pass4000: count("passYds", 4000),
    rush1000: count("rushYds", 1000),
    rec1000: count("recYds", 1000),
    rec100: count("rec", 100),
    sack10: count("sacks", 10),
    tackles100: lines.filter((l) => tackles(l) >= 100 * k).length,
    int5: count("defInt", 5),
    leadPassYds: lead((l) => v(l, "passYds")),
    leadRushYds: lead((l) => v(l, "rushYds")),
    leadRecYds: lead((l) => v(l, "recYds")),
    leadRec: lead((l) => v(l, "rec")),
    leadTargets: lead((l) => v(l, "tgt")),
    leadSacks: lead((l) => v(l, "sacks")),
    leadInt: lead((l) => v(l, "defInt")),
    leadTackles: lead(tackles),
  };
}

/** The keys whose value falls outside its range, as "key value (lo-hi)". */
export function spreadMisses(s: Record<SpreadKey, number>): string[] {
  return (Object.keys(STAT_RANGES) as SpreadKey[])
    .filter((key) => s[key] < STAT_RANGES[key][0] || s[key] > STAT_RANGES[key][1])
    .map((key) => `${key} ${s[key]} (${STAT_RANGES[key][0]}-${STAT_RANGES[key][1]})`);
}
