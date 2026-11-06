// The record book and the league's memory: NFL single-game and single-season
// records (the real marks through the 2025 season), the best marks set in
// this save, rivalries built from the games teams play against each other,
// how past trades turned out, the eras of a club under each head coach and
// GM, anniversaries the media picks up, and a timeline of the club's
// building, money and biggest contracts.
import { addDays } from "./dates";
import { news, send } from "./inbox";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { valuation } from "./business";
import { ELITE, production } from "./honors";
import { history } from "./seasons";
import { seasonTotals, unpack } from "./stats";
import { PROJECT_BY_ID } from "./projects";
import { parsePick } from "./trades";
import type { GameState, Mark, Position, RecordsState, TradeAsset, TradeRecord } from "./types";

export function records(state: GameState): RecordsState {
  return (state.records ??= { game: {}, season: {}, broken: [], h2h: {}, values: {} });
}

/** The real NFL records through 2025: [value, holder, year]. */
export const NFL_SEASON: Record<string, [number, string, number, string]> = {
  passYds: [5477, "Peyton Manning", 2013, "passing yards"],
  passTd: [55, "Peyton Manning", 2013, "touchdown passes"],
  rushYds: [2105, "Eric Dickerson", 1984, "rushing yards"],
  rushTd: [28, "LaDainian Tomlinson", 2006, "rushing touchdowns"],
  rec: [149, "Michael Thomas", 2019, "catches"],
  recYds: [1964, "Calvin Johnson", 2012, "receiving yards"],
  recTd: [23, "Randy Moss", 2007, "touchdown catches"],
  sacks: [22.5, "Michael Strahan and T.J. Watt", 2021, "sacks"],
  defInt: [14, "Dick \"Night Train\" Lane", 1952, "interceptions"],
};
export const NFL_GAME: Record<string, [number, string, number, string]> = {
  passYds: [554, "Norm Van Brocklin", 1951, "passing yards"],
  passTd: [7, "seven players, most recently Peyton Manning", 2013, "touchdown passes"],
  rushYds: [296, "Adrian Peterson", 2007, "rushing yards"],
  rec: [21, "Brandon Marshall", 2009, "catches"],
  recYds: [336, "Willie \"Flipper\" Anderson", 1989, "receiving yards"],
  sacks: [7, "Derrick Thomas", 1990, "sacks"],
};

function better(cur: Mark | undefined, value: number): boolean {
  return value > 0 && (!cur || value > cur.value);
}

/** Today's games: best single-game marks, and any NFL record that falls. */
function checkGames(state: GameState): void {
  const r = records(state);
  const today = (GAMES_BY_DATE[state.date] ?? []).filter((g) => state.results[g.id] && state.box[g.id] && g.type !== "PRE");
  if (!today.length) return;
  const played = new Set<string>();
  for (const g of today) {
    const res = state.results[g.id];
    for (const side of ["away", "home"] as const) {
      for (const [pid, values] of Object.entries(state.box[g.id].players[side])) {
        played.add(pid);
        if (g.type !== "REG") continue;
        const l = unpack(values) as Record<string, number>;
        for (const key of Object.keys(NFL_GAME)) {
          const v = Number(l[key] ?? 0);
          if (!better(r.game[key], v)) continue;
          const was = r.game[key];
          r.game[key] = { player: pid, team: res[side], value: v, season: RULES.season, date: state.date };
          const [mark, holder, year, what] = NFL_GAME[key];
          if (v > mark && (!was || was.value <= mark)) broke(state, res[side], `${PLAYER_BY_ID[pid].name} set an NFL record with ${v} ${what} in a game, passing ${holder}'s ${mark} (${year}).`);
        }
      }
    }
  }
  if (today.every((g) => g.type !== "REG")) return;
  const totals = seasonTotals(state, "REG");
  for (const pid of played) {
    const row = totals[pid];
    if (!row) continue;
    const l = row.line as Record<string, number>;
    for (const key of Object.keys(NFL_SEASON)) {
      const v = Number(l[key] ?? 0);
      if (!better(r.season[key], v)) continue;
      const was = r.season[key];
      r.season[key] = { player: pid, team: row.team, value: v, season: RULES.season, date: state.date };
      const [mark, holder, year, what] = NFL_SEASON[key];
      if (v > mark && (!was || was.value <= mark || was.season !== RULES.season)) {
        broke(state, row.team, `${PLAYER_BY_ID[pid].name} broke the NFL record for ${what} in a season: ${v}, passing ${holder}'s ${mark} (${year}).`);
      }
    }
  }
}

function broke(state: GameState, team: string, text: string): void {
  records(state).broken.unshift({ date: state.date, text });
  news(state, text);
  if (team === state.userTeam) send(state, "league", "League office", "An NFL record falls", text);
}

// ---- Rivalries ----

const pairKey = (a: string, b: string) => [a, b].sort().join("-");

function countMeetings(state: GameState): void {
  const r = records(state);
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const res = state.results[g.id];
    if (!res || g.type === "PRE") continue;
    const k = pairKey(res.away, res.home);
    const m = (r.h2h[k] ??= { games: 0, wins: {}, close: 0, playoff: 0, last: "" });
    if (m.last === g.id) continue;
    m.last = g.id;
    m.games++;
    if (res.homeScore !== res.awayScore) {
      const w = res.homeScore > res.awayScore ? res.home : res.away;
      m.wins[w] = (m.wins[w] ?? 0) + 1;
    }
    if (Math.abs(res.homeScore - res.awayScore) <= 7) m.close++;
    if (g.type === "POST") m.playoff++;
  }
}

/** How hot a rivalry runs: division games, playoff meetings, close finishes and an even series. */
export function rivalryHeat(state: GameState, a: string, b: string): number {
  const m = records(state).h2h[pairKey(a, b)];
  const ta = TEAM_BY_ID[a], tb = TEAM_BY_ID[b];
  const division = ta && tb && ta.conference === tb.conference && ta.division === tb.division;
  if (!m) return division ? 2 : 0;
  const even = 1 - Math.abs((m.wins[a] ?? 0) - (m.wins[b] ?? 0)) / Math.max(1, m.games);
  return (division ? 2 : 0) + m.playoff * 1.5 + m.close * 0.35 + m.games * 0.1 + even * 0.8;
}

export function rivalryWord(heat: number): string {
  return heat >= 5 ? "Bitter" : heat >= 3.5 ? "Heated" : heat >= 2.5 ? "Growing" : "Quiet";
}

/** A team's rivals, hottest first, with the series. */
export function rivals(state: GameState, team: string): { team: string; heat: number; word: string; w: number; l: number; games: number; playoff: number }[] {
  const r = records(state);
  return TEAMS.filter((t) => t.id !== team).map(({ id }) => {
    const m = r.h2h[pairKey(team, id)];
    const heat = rivalryHeat(state, team, id);
    return { team: id, heat, word: rivalryWord(heat), w: m?.wins[team] ?? 0, l: m?.wins[id] ?? 0, games: m?.games ?? 0, playoff: m?.playoff ?? 0 };
  }).sort((a, b) => b.heat - a.heat);
}

// ---- Trade outcomes ----


/** What a player gave a team since a date: seasons of production for that team, in Pro Bowl seasons. */
function gaveTeam(state: GameState, id: string, team: string, since: number): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 0;
  const pos = p.position;
  const seasons = (history(state).stats[id] ?? []).filter((s) => s.team === team && s.season >= since);
  let total = seasons.reduce((t, s) => t + Math.max(0, production(pos, s as unknown as Record<string, number>)) / ELITE[pos], 0);
  const cur = seasonTotals(state, "REG")[id];
  if (cur && cur.team === team && RULES.season >= since) total += Math.max(0, production(pos, cur.line as Record<string, number>)) / ELITE[pos];
  return total;
}

/** Who a traded pick became, once it was used. */
function pickPlayer(state: GameState, pick: string): string | null {
  const { year } = parsePick(pick);
  const d = history(state).drafts.find((x) => x.year === year);
  if (d?.pickIds) {
    const i = d.pickIds.indexOf(pick);
    if (i >= 0) return d.picks[i][0];
  }
  const live = state.draft?.made.find((m) => m.pick === pick);
  return live?.player ?? null;
}

export interface TradeOutcome { trade: TradeRecord; got: [number, number]; detail: [string[], string[]]; verdict: string }

function assetsWorth(state: GameState, assets: TradeAsset[], team: string, since: number): { value: number; names: string[] } {
  let value = 0;
  const names: string[] = [];
  for (const a of assets) {
    if (a.kind === "player") {
      const v = gaveTeam(state, a.id, team, since);
      value += v;
      names.push(PLAYER_BY_ID[a.id]?.name ?? a.id);
    } else {
      const who = pickPlayer(state, a.pick);
      const { year, round } = parsePick(a.pick);
      if (who) { value += gaveTeam(state, who, team, year); names.push(`${year} round ${round} (${PLAYER_BY_ID[who]?.name ?? "?"})`); }
      else names.push(`${year} round ${round} pick`);
    }
  }
  return { value, names };
}

/** How each completed trade turned out, judged by what each side has gotten from it since. */
export function tradeOutcomes(state: GameState, team?: string): TradeOutcome[] {
  const log = (state.trades?.log ?? []).filter((t) => t.status === "done" && (!team || t.teams.includes(team)));
  return log.map((t) => {
    const since = Number(t.date.slice(0, 4)) + (t.date.slice(5) >= "03-01" ? 0 : -1);
    // teams[0] got what teams[1] sent, and the other way round.
    const a = assetsWorth(state, t.send[1], t.teams[0], since);
    const b = assetsWorth(state, t.send[0], t.teams[1], since);
    const seasons = RULES.season - since;
    const diff = a.value - b.value;
    const verdict = seasons < 1 && Math.abs(diff) < 0.8 ? "Too early to tell"
      : Math.abs(diff) < 0.4 ? "Even so far"
      : `${teamLabel(diff > 0 ? t.teams[0] : t.teams[1])} ${Math.abs(diff) > 1.5 ? "won it clearly" : "came out ahead"}`;
    return { trade: t, got: [a.value, b.value], detail: [a.names, b.names], verdict };
  });
}

// ---- Eras ----

export interface Era { role: "HC" | "GM"; name: string; from: number; to: number; w: number; l: number; t: number; playoffWins: number; titles: number }

/** A club's seasons in this save grouped by head coach and by GM. */
export function eras(state: GameState, team: string): Era[] {
  const hist = history(state);
  const out: Era[] = [];
  for (const c of Object.values(state.staff?.people ?? {})) {
    for (const role of ["HC", "GM"] as const) {
      const rows = c.record.filter((r) => r.team === team && r.role === role);
      if (!rows.length) continue;
      const seasons = rows.map((r) => r.season);
      out.push({
        role, name: c.name, from: Math.min(...seasons), to: Math.max(...seasons),
        w: rows.reduce((s, r) => s + r.w, 0), l: rows.reduce((s, r) => s + r.l, 0), t: rows.reduce((s, r) => s + r.t, 0),
        playoffWins: rows.reduce((s, r) => s + Math.max(0, r.playoffs), 0),
        titles: hist.seasons.filter((x) => x.champion === team && seasons.includes(x.season)).length,
      });
    }
  }
  return out.sort((a, b) => a.role.localeCompare(b.role) || a.from - b.from);
}

// ---- Contract milestones ----

/** Signings that set a new high at their position, by average per year. */
export function contractMilestones(state: GameState): { date: string; player: string; team: string; pos: Position; apy: number; years: number; prior: number }[] {
  const top: Partial<Record<Position, number>> = {};
  for (const p of Object.values(PLAYER_BY_ID)) {
    const apy = p.contract?.apy ?? 0;
    if (apy > (top[p.position] ?? 0)) top[p.position] = apy;
  }
  const out: { date: string; player: string; team: string; pos: Position; apy: number; years: number; prior: number }[] = [];
  for (const s of [...state.signings].sort((a, b) => a.date.localeCompare(b.date))) {
    const pos = PLAYER_BY_ID[s.player]?.position;
    if (!pos || s.apy <= (top[pos] ?? 0)) continue;
    out.push({ date: s.date, player: s.player, team: s.team, pos, apy: s.apy, years: s.years, prior: top[pos] ?? 0 });
    top[pos] = s.apy;
  }
  return out.reverse();
}

// ---- The club's timeline ----

/** Building projects, lease changes and other milestones of the club's home, oldest first. */
export function clubTimeline(state: GameState, team = state.userTeam): { date: string; text: string }[] {
  const out: { date: string; text: string }[] = [];
  if (team === state.userTeam) {
    for (const p of state.business?.projects ?? []) {
      const title = PROJECT_BY_ID[p.id]?.title ?? p.id;
      out.push({ date: p.started, text: `Construction began: ${title}` });
      if (p.opened) out.push({ date: p.opens, text: `Opened: ${title}` });
    }
  }
  for (const l of state.leases?.[team]?.log ?? []) out.push(l);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Anniversaries and the yearly close ----

const MILESTONES = [5, 10, 15, 20, 25];

function anniversaries(state: GameState): void {
  const season = RULES.season;
  const hist = history(state);
  for (const s of hist.seasons) {
    const n = season - s.season;
    if (!s.champion || !MILESTONES.includes(n)) continue;
    const text = `${n} years ago the ${teamLabel(s.champion)} won the Super Bowl${s.runnerUp ? `, beating the ${teamLabel(s.runnerUp)}` : ""}. The team is marking the anniversary this week.`;
    news(state, text);
    if (s.champion === state.userTeam) send(state, "media", "Team communications", `${n} years since our title`, `${text} Former players are coming back for the celebration, and the fans are into it.`);
  }
  const first = hist.seasons[0]?.season ?? season;
  const owned = season - first + 1;
  if (MILESTONES.includes(owned)) {
    send(state, "media", "Team communications", `${owned} seasons as owner`,
      `This was your ${owned}th season running the ${TEAM_BY_ID[state.userTeam].name}. The papers are running looks back at your time so far.`);
  }
}

function yearEnd(state: GameState): void {
  const r = records(state);
  const year = RULES.season;
  if (r.values[year]) return;
  r.values[year] = Object.fromEntries(TEAMS.map(({ id }) => [id, valuation(state, id)]));
}

export function recordsDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date >= K.regularSeasonStart && state.date <= K.superBowl) {
    countMeetings(state);
    checkGames(state);
  }
  if (state.date === addDays(K.superBowl, 1)) {
    anniversaries(state);
    yearEnd(state);
  }
}
