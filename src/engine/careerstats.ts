// Career stats: every player's real regular-season totals back to his rookie
// year (nflverse, data/league-2026/career.json, before 2023), the three
// seasons in players.json, and the seasons played in this save, joined into
// one career line. Season totals only, one row per season and team: the shape
// a Hall of Fame vote, a career record or a cross-era ranking reads.
//
// Career records: the real NFL regular-season marks through 2025, and round
// milestones the league office and the papers notice. Cross-era rankings
// adjust passing numbers for the era they came in, using the league's passing
// yards per team game each season (approximate real figures through 2025,
// then the save's own).
import careerJson from "../../data/league-2026/career.json";
import { news, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES } from "./league";
import { ELITE, production } from "./honors";
import { history } from "./seasons";
import { seasonTotals } from "./stats";
import type { GameState, Position, SeasonStats } from "./types";

const CAREER = careerJson as unknown as { cols: string[]; players: Record<string, (number | string)[][]> };

const LINE = new Set<Position>(["OT", "OG", "C", "LS"]);

/** The real seasons before 2023 for one player, as season rows. */
function earlyRows(id: string): SeasonStats[] {
  const rows = CAREER.players[id];
  if (!rows) return [];
  return rows.map((r) => {
    const s: SeasonStats = { season: Number(r[0]), team: String(r[1]) };
    for (let i = 2; i < CAREER.cols.length; i++) if (r[i]) s[CAREER.cols[i]] = Number(r[i]);
    return s;
  });
}

/**
 * A player's whole career, one row per season and team, oldest first:
 * real seasons, then this save's finished seasons. With `live`, the season in
 * progress is added from the box scores.
 */
export function careerLines(state: GameState | undefined, id: string, live = false): SeasonStats[] {
  const p = PLAYER_BY_ID[id];
  const later = (p?.stats ?? []).filter((s) => !live || s.season < RULES.season);
  const first = later.length ? Math.min(...later.map((s) => s.season)) : Infinity;
  // A historical start knows only the seasons before it.
  const rows = [...earlyRows(id).filter((s) => s.season < first && s.season < BASE_SEASON), ...later];
  if (live && state) {
    const now = seasonTotals(state, "REG")[id];
    if (now) rows.push({ season: RULES.season, team: now.team, ...(now.line as Record<string, number>) });
  }
  return rows.sort((a, b) => a.season - b.season);
}

/** Career totals by stat key, with the seasons and games played. */
export function careerTotals(state: GameState | undefined, id: string, live = false): Record<string, number> {
  const out: Record<string, number> = { seasons: 0 };
  const seen = new Set<number>();
  for (const s of careerLines(state, id, live)) {
    seen.add(s.season);
    for (const [k, v] of Object.entries(s)) {
      if (k === "season" || k === "team" || typeof v !== "number") continue;
      if (/Long$/.test(k)) out[k] = Math.max(out[k] ?? 0, v);
      else if (!/Epa$|Share$|^wopr$/.test(k)) out[k] = (out[k] ?? 0) + v;
    }
  }
  out.seasons = seen.size;
  return out;
}

/** The first season on file and how many of his seasons the data covers. */
export function careerSpan(id: string): { from: number; seasons: number } {
  const lines = careerLines(undefined, id);
  return { from: lines[0]?.season ?? PLAYER_BY_ID[id]?.rookieYear ?? RULES.season, seasons: new Set(lines.map((s) => s.season)).size };
}

// ---- Career records and milestones ----

/** Real NFL regular-season career records through 2025: [value, holder, what]. */
export const NFL_CAREER: Record<string, [number, string, string]> = {
  passYds: [89214, "Tom Brady", "passing yards"],
  passTd: [649, "Tom Brady", "touchdown passes"],
  rushYds: [18355, "Emmitt Smith", "rushing yards"],
  rushTd: [164, "Emmitt Smith", "rushing touchdowns"],
  rec: [1549, "Jerry Rice", "catches"],
  recYds: [22895, "Jerry Rice", "receiving yards"],
  recTd: [197, "Jerry Rice", "touchdown catches"],
  sacks: [200, "Bruce Smith", "sacks"],
  defInt: [81, "Paul Krause", "interceptions"],
  fgm: [599, "Adam Vinatieri", "field goals"],
};

/** Round numbers the league notices along the way. */
const MILESTONES: Record<string, number[]> = {
  passYds: [30000, 40000, 50000, 60000, 70000, 80000],
  passTd: [200, 300, 400, 500, 600],
  rushYds: [8000, 10000, 12000, 14000, 16000],
  rushTd: [75, 100, 125, 150],
  rec: [750, 1000, 1250],
  recYds: [10000, 12000, 15000, 18000, 20000],
  recTd: [75, 100, 125, 150],
  sacks: [75, 100, 125, 150],
  defInt: [40, 50, 60],
  fgm: [300, 400, 500],
};

/** Checks the players who played today against career records and milestones. */
export function checkCareerMarks(state: GameState, played: Iterable<string>): void {
  const r = (state.records ??= { game: {}, season: {}, broken: [], h2h: {}, values: {} });
  const done = (r.career ??= {});
  for (const pid of played) {
    const p = PLAYER_BY_ID[pid];
    if (!p) continue;
    const t = careerTotals(state, pid, true);
    const marks = (done[pid] ??= []);
    for (const [key, steps] of Object.entries(MILESTONES)) {
      const v = Number(t[key] ?? 0);
      for (const m of steps) {
        const tag = `${key}:${m}`;
        if (v < m || marks.includes(tag)) continue;
        marks.push(tag);
        // A player who was already past the mark when the save began has it noted quietly.
        if (v - m > m * 0.05) continue;
        const what = NFL_CAREER[key][2];
        news(state, `${p.name} reached ${m.toLocaleString()} career ${what}.`);
      }
      const [mark, holder, what] = NFL_CAREER[key];
      const tag = `${key}:record`;
      if (v > mark && !marks.includes(tag)) {
        marks.push(tag);
        const text = `${p.name} passed ${holder} for the NFL career record in ${what}: ${Math.round(v).toLocaleString()}.`;
        r.broken.unshift({ date: state.date, text });
        news(state, text);
        const team = state.players[pid]?.team;
        if (team === state.userTeam) send(state, "media", "Team communications", `${p.name} sets the career record`, `${text} The ball is going to Canton, and the stadium is planning a ceremony.`);
      }
    }
    if (marks.length === 0) delete done[pid];
  }
}

/** The players on file nearest each career record, for the History page. */
export function careerLeaders(state: GameState, key: string, count = 10): { id: string; value: number; active: boolean }[] {
  const out: { id: string; value: number; active: boolean }[] = [];
  const retired = history(state).retired;
  for (const id of Object.keys(PLAYER_BY_ID)) {
    const v = Number(careerTotals(state, id, true)[key] ?? 0);
    if (v > 0) out.push({ id, value: v, active: !(id in retired) });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, count);
}

// ---- Cross-era rankings ----

/** League passing yards per team game, approximately, 2005-2025 (real). */
const PASS_PER_GAME: Record<number, number> = {
  2005: 206, 2006: 205, 2007: 213, 2008: 211, 2009: 221, 2010: 222, 2011: 229, 2012: 231, 2013: 235, 2014: 238,
  2015: 243, 2016: 239, 2017: 225, 2018: 239, 2019: 236, 2020: 241, 2021: 230, 2022: 217, 2023: 213, 2024: 214, 2025: 215,
};
const PASS_BASE = 225;
const PASSING = new Set<Position>(["QB", "WR", "TE"]);

/** How much passing a season had, against the long-run norm (1 = normal). */
export function passingEra(state: GameState | undefined, season: number): number {
  const saved = state ? history(state).seasons.find((s) => s.season === season)?.passPerGame : undefined;
  return (saved ?? PASS_PER_GAME[season] ?? PASS_BASE) / PASS_BASE;
}

export interface EraRank { id: string; pos: Position; peak: number; career: number; seasons: number; from: number; to: number }

/**
 * Careers ranked across eras: each season's production against a Pro Bowl
 * season at the position, with passing numbers scaled to their era; the
 * career score adds them up and the peak is the best five. Linemen are left
 * out: their seasons carry no stats to compare.
 */
export function eraRankings(state: GameState, group?: Position[], count = 25): EraRank[] {
  const out: EraRank[] = [];
  for (const p of Object.values(PLAYER_BY_ID)) {
    if (LINE.has(p.position) || (group && !group.includes(p.position))) continue;
    const lines = careerLines(state, p.id).filter((s) => Number(s.g ?? 0) > 0);
    if (lines.length < 2) continue;
    const scores = lines.map((s) => {
      const raw = Math.max(0, production(p.position, s as unknown as Record<string, number>)) / ELITE[p.position];
      return Math.min(1.8, PASSING.has(p.position) ? raw / passingEra(state, s.season) : raw);
    });
    const peak = [...scores].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
    const career = scores.reduce((a, b) => a + b, 0);
    out.push({ id: p.id, pos: p.position, peak: Math.round(peak * 100) / 100, career: Math.round(career * 100) / 100, seasons: lines.length, from: lines[0].season, to: lines[lines.length - 1].season });
  }
  return out.sort((a, b) => b.career + b.peak - (a.career + a.peak)).slice(0, count);
}

/** One line for a player's page: where his career stands among players on file. */
export function careerNote(state: GameState, id: string): string | null {
  const p = PLAYER_BY_ID[id];
  if (!p) return null;
  const t = careerTotals(state, id, true);
  const bits: string[] = [];
  for (const [key, [mark, holder, what]] of Object.entries(NFL_CAREER)) {
    const v = Number(t[key] ?? 0);
    if (v >= mark * 0.25) bits.push(`${Math.round(v).toLocaleString()} ${what} (${Math.round((v / mark) * 100)}% of ${holder}'s record)`);
  }
  return bits.length ? `${t.seasons} seasons: ${bits.join("; ")}.` : null;
}
