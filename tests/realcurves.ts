// Leaderboard curves: the value at each rank (1st, 5th, 10th, ... 64th) for a
// stat, for the real 2024 and 2025 seasons (data/league-2026/players.json, a
// player traded midseason summed across teams) and for a simulated season.
// Rate stats only count players with enough volume to qualify. Players who
// have retired since are missing from the real file, so its deeper ranks run
// a touch low.
import { readFileSync } from "node:fs";

export const RANKS = [1, 5, 10, 20, 32, 50, 64];

type Line = Record<string, number>;

export interface Metric {
  key: string;
  label: string;
  value: (l: Line) => number;
  /** Only players with enough volume count (rate stats). */
  qualifies?: (l: Line) => boolean;
}

const v = (l: Line, k: string) => l[k] ?? 0;

export const METRICS: Metric[] = [
  { key: "passYds", label: "Passing yards", value: (l) => v(l, "passYds") },
  { key: "passTd", label: "Passing TDs", value: (l) => v(l, "passTd") },
  { key: "int", label: "Interceptions thrown", value: (l) => v(l, "int") },
  { key: "cmpPct", label: "Completion % (250+ att)", value: (l) => (100 * v(l, "cmp")) / v(l, "att"), qualifies: (l) => v(l, "att") >= 250 },
  { key: "ypa", label: "Yards per attempt (250+ att)", value: (l) => v(l, "passYds") / v(l, "att"), qualifies: (l) => v(l, "att") >= 250 },
  { key: "sacked", label: "Times sacked", value: (l) => v(l, "sacked") },
  { key: "car", label: "Carries", value: (l) => v(l, "car") },
  { key: "rushYds", label: "Rushing yards", value: (l) => v(l, "rushYds") },
  { key: "rushTd", label: "Rushing TDs", value: (l) => v(l, "rushTd") },
  { key: "ypc", label: "Yards per carry (100+ car)", value: (l) => v(l, "rushYds") / v(l, "car"), qualifies: (l) => v(l, "car") >= 100 },
  { key: "tgt", label: "Targets", value: (l) => v(l, "tgt") },
  { key: "rec", label: "Receptions", value: (l) => v(l, "rec") },
  { key: "recYds", label: "Receiving yards", value: (l) => v(l, "recYds") },
  { key: "recTd", label: "Receiving TDs", value: (l) => v(l, "recTd") },
  { key: "ypr", label: "Yards per catch (40+ rec)", value: (l) => v(l, "recYds") / v(l, "rec"), qualifies: (l) => v(l, "rec") >= 40 },
  { key: "catchPct", label: "Catch % (60+ tgt)", value: (l) => (100 * v(l, "rec")) / v(l, "tgt"), qualifies: (l) => v(l, "tgt") >= 60 },
  { key: "tackles", label: "Tackles (solo + assisted)", value: (l) => v(l, "tklSolo") + v(l, "tklAst") },
  { key: "tfl", label: "Tackles for loss", value: (l) => v(l, "tfl") },
  { key: "sacks", label: "Sacks", value: (l) => v(l, "sacks") },
  { key: "qbHits", label: "QB hits", value: (l) => v(l, "qbHits") },
  { key: "defInt", label: "Interceptions", value: (l) => v(l, "defInt") },
  { key: "pd", label: "Passes defended", value: (l) => v(l, "pd") },
  { key: "ff", label: "Forced fumbles", value: (l) => v(l, "ff") },
  { key: "fgPct", label: "Field goal % (20+ att)", value: (l) => (100 * v(l, "fgm")) / v(l, "fga"), qualifies: (l) => v(l, "fga") >= 20 },
  { key: "fga", label: "Field goal attempts", value: (l) => v(l, "fga") },
  { key: "puntAvg", label: "Punt average (40+ punts)", value: (l) => v(l, "puntYds") / v(l, "punts"), qualifies: (l) => v(l, "punts") >= 40 },
  { key: "krAvg", label: "Kick return average (15+ ret)", value: (l) => v(l, "krYds") / v(l, "kr"), qualifies: (l) => v(l, "kr") >= 15 },
];

/** The value at each rank, or NaN past the end of the list. */
export function curve(lines: Line[], m: Metric): number[] {
  const vals = lines.filter((l) => !m.qualifies || m.qualifies(l)).map(m.value).filter(Number.isFinite).sort((a, b) => b - a);
  return RANKS.map((r) => vals[r - 1] ?? NaN);
}

/** Real season lines by player for one season. */
export function realLines(season: number): Line[] {
  const raw = JSON.parse(readFileSync(new URL("../data/league-2026/players.json", import.meta.url), "utf8"));
  const players: { id: string; stats?: (Line & { season: number })[] }[] = Array.isArray(raw) ? raw : Object.values(raw);
  const out: Line[] = [];
  for (const p of players) {
    const sum: Line = {};
    for (const s of p.stats ?? []) {
      if (s.season !== season) continue;
      for (const [k, x] of Object.entries(s)) if (typeof x === "number" && k !== "season") sum[k] = (sum[k] ?? 0) + x;
    }
    if (Object.keys(sum).length) out.push(sum);
  }
  return out;
}
