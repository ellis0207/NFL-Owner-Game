import type { PlayerData, Position, SeasonStats } from "../engine/types";

export { money } from "../engine/season";

export const POSITION_NAMES: Record<Position, string> = {
  QB: "Quarterbacks", RB: "Running backs", FB: "Fullbacks", WR: "Wide receivers", TE: "Tight ends",
  OT: "Offensive tackles", OG: "Guards", C: "Centers", EDGE: "Edge rushers", IDL: "Interior line",
  LB: "Linebackers", CB: "Cornerbacks", S: "Safeties", K: "Kickers", P: "Punters", LS: "Long snappers",
};

export function height(inches: number | null): string {
  return inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : "—";
}

export function n(v: number | string | undefined): number {
  return typeof v === "number" ? v : 0;
}

const fmt = (x: number) => x.toLocaleString("en-US");

/** The handful of numbers a front office would quote for a player's season. */
export function statLine(pos: Position, s: SeasonStats | undefined, snaps?: { offense: number; defense: number; st: number }): string {
  if (!s && !snaps) return "Did not play";
  const g = n(s?.g);
  switch (pos) {
    case "QB":
      return s && n(s.att) ? `${n(s.cmp)}/${n(s.att)}, ${fmt(n(s.passYds))} yds, ${n(s.passTd)} TD, ${n(s.int)} INT` : "No pass attempts";
    case "RB":
    case "FB":
      return s ? `${n(s.car)} car, ${fmt(n(s.rushYds))} yds, ${n(s.rushTd)} TD · ${n(s.rec)} rec, ${n(s.recYds)} yds` : snapLine(snaps);
    case "WR":
    case "TE":
      return s && n(s.tgt) ? `${n(s.rec)} rec on ${n(s.tgt)} tgt, ${fmt(n(s.recYds))} yds, ${n(s.recTd)} TD` : snapLine(snaps);
    case "EDGE":
    case "IDL":
      return s ? `${n(s.sacks)} sacks, ${n(s.tfl)} TFL, ${n(s.qbHits)} QB hits · ${g} g` : snapLine(snaps);
    case "LB":
      return s ? `${n(s.tklSolo) + n(s.tklAst)} tackles, ${n(s.tfl)} TFL, ${n(s.sacks)} sacks · ${g} g` : snapLine(snaps);
    case "CB":
    case "S":
      return s ? `${n(s.defInt)} INT, ${n(s.pd)} PD, ${n(s.tklSolo) + n(s.tklAst)} tackles · ${g} g` : snapLine(snaps);
    case "K":
      return s && n(s.fga) ? `${n(s.fgm)}/${n(s.fga)} FG, long ${n(s.fgLong)} · ${n(s.xpm)}/${n(s.xpa)} XP` : "No kicks";
    case "P":
      return s && n(s.punts) ? `${n(s.punts)} punts, ${(n(s.puntNet) / n(s.punts)).toFixed(1)} net avg` : "No punts";
    default:
      return snapLine(snaps);
  }
}

function snapLine(snaps?: { offense: number; defense: number; st: number }): string {
  if (!snaps) return "Did not play";
  const main = Math.max(snaps.offense, snaps.defense);
  return main ? `${fmt(main)} snaps` : snaps.st ? `${fmt(snaps.st)} special teams snaps` : "Did not play";
}

export function lastSeasonLine(p: PlayerData): string {
  const s = p.stats.filter((x) => x.season === 2025);
  const merged = mergeSeason(s);
  const snaps = p.snaps["2025"];
  if (!merged && !snaps) return p.rookieYear === 2026 ? `Rookie · ${p.college ?? "—"}` : "Did not play in 2025";
  return statLine(p.position, merged, snaps);
}

/** A player traded midseason has one row per team; add them up. */
export function mergeSeason(rows: SeasonStats[]): SeasonStats | undefined {
  if (!rows.length) return undefined;
  if (rows.length === 1) return rows[0];
  const out: SeasonStats = { season: rows[0].season, team: rows.map((r) => r.team).join("/") };
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === "number" && k !== "season") out[k] = n(out[k]) + v;
  return out;
}

export function draftLine(p: PlayerData): string {
  if (!p.draft.overall) return `Undrafted${p.rookieYear ? `, ${p.rookieYear}` : ""}`;
  const year = p.rookieYear ?? "";
  return `${year} Round ${p.draft.round ?? "?"}, pick ${p.draft.overall}${p.draft.team ? ` (${p.draft.team})` : ""}`;
}

/** Readable text color on top of a team color. */
export function onColor(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.6 ? "#10161d" : "#ffffff";
}
