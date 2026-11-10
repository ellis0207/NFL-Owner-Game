// The league's honors: the Pro Bowl, the All-Pro teams, the awards handed
// out at NFL Honors the week of the Super Bowl, and the Hall of Fame.
//
// Voters see what everyone sees: the stats, the team's record, and the film,
// which the engine reads as a voters' opinion of each player (a perceived
// ability with its own error, never shown). Reputation counts too: a player
// who has been to Pro Bowls keeps getting voted in a little longer than his
// play alone would earn.
//
// Dates follow the real calendar: Pro Bowl rosters about three weeks before
// the regular season ends, the All-Pro teams the week after it, the awards
// and the Hall of Fame class three days before the Super Bowl.
import { careerLines } from "./careerstats";
import { addDays } from "./dates";
import { news, send } from "./inbox";
import { seasonOf } from "./incentives";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { rngFor } from "./rng";
import { history } from "./seasons";
import { perceivedAbility } from "./staff";
import { standings } from "./standings";
import { seasonTotals } from "./stats";
import type { Award, AwardResult, GameState, HonorsState, Position } from "./types";

export const AWARD_NAME: Record<Award, string> = {
  MVP: "Most Valuable Player", OPOY: "Offensive Player of the Year", DPOY: "Defensive Player of the Year",
  OROY: "Offensive Rookie of the Year", DROY: "Defensive Rookie of the Year", CPOY: "Comeback Player of the Year", COY: "Coach of the Year",
};

export function honors(state: GameState): HonorsState {
  return (state.honors ??= { proBowl: {}, allPro: {}, awards: {}, hof: { classes: {}, finalists: {} } });
}

const OFFENSE = new Set<Position>(["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C"]);
const LINE = new Set<Position>(["OT", "OG", "C", "LS"]);

/** A season's production as the voters weigh it, by position. */
export function production(pos: Position, l: Record<string, number>): number {
  const v = (k: string) => Number(l[k] ?? 0);
  const tackles = v("tklSolo") + 0.5 * v("tklAst");
  switch (pos) {
    case "QB": return v("passYds") / 25 + v("passTd") * 4 - v("int") * 2.5 + v("rushYds") / 10 + v("rushTd") * 6 - v("sacked") * 0.4;
    case "RB": case "FB": return v("rushYds") / 10 + v("rushTd") * 6 + v("recYds") / 10 + v("recTd") * 6 + v("rec") * 0.5 - v("fumLost") * 2;
    case "WR": return v("rec") * 0.5 + v("recYds") / 10 + v("recTd") * 6 - v("fumLost") * 2;
    case "TE": return 1.25 * (v("rec") * 0.5 + v("recYds") / 10 + v("recTd") * 6) - v("fumLost") * 2;
    case "EDGE": return v("sacks") * 5 + v("tfl") * 1.5 + v("qbHits") + v("ff") * 3 + v("fr") * 2 + tackles * 0.4;
    case "IDL": return 1.15 * (v("sacks") * 5 + v("tfl") * 1.5 + v("qbHits") + v("ff") * 3 + v("fr") * 2 + tackles * 0.4);
    case "LB": return tackles * 0.6 + v("sacks") * 4 + v("tfl") * 1.5 + v("defInt") * 6 + v("pd") * 1.5 + v("ff") * 3 + v("defTd") * 6;
    case "CB": return v("defInt") * 7 + v("pd") * 2 + v("tklSolo") * 0.3 + v("defTd") * 6 + v("ff") * 3;
    case "S": return v("defInt") * 6 + v("pd") * 1.5 + tackles * 0.4 + v("ff") * 3 + v("defTd") * 6;
    case "K": return v("fgm") * 3 - (v("fga") - v("fgm")) * 2.5 + v("fgm50") * 2 + v("xpm") * 0.6 - (v("xpa") - v("xpm")) * 2;
    case "P": return v("punts") ? (v("puntYds") / v("punts") - 40) * v("punts") * 0.3 + v("puntIn20") * 1.5 - v("puntTb") : 0;
    default: return (v("offSnaps") + v("defSnaps")) / 60;
  }
}

function returns(l: Record<string, number>): number {
  return Number(l.krYds ?? 0) / 25 + Number(l.prYds ?? 0) / 12 + (Number(l.krTd ?? 0) + Number(l.prTd ?? 0)) * 8;
}

/** What a Pro Bowl-level season produces, so careers compare across positions. */
export const ELITE: Record<Position, number> = {
  QB: 300, RB: 200, FB: 60, WR: 190, TE: 150, OT: 17, OG: 17, C: 17, EDGE: 80, IDL: 70, LB: 115, CB: 55, S: 60, K: 110, P: 60, LS: 17,
};

interface Ballot { id: string; team: string; pos: Position; prod: number; score: number; ret: number }

const z = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length)) || 1;
  return (x: number) => (x - m) / sd;
};

/** Every player with enough games this season, scored within his position. `rep` adds the Pro Bowl reputation. */
function ballot(state: GameState, rep: boolean): Ballot[] {
  const totals = seasonTotals(state, "REG");
  const table = standings(state);
  const h = honors(state);
  const byPos = new Map<Position, { id: string; team: string; l: Record<string, number> }[]>();
  for (const [id, row] of Object.entries(totals)) {
    const p = PLAYER_BY_ID[id];
    const l = row.line as Record<string, number>;
    if (!p || Number(l.g ?? 0) < 6) continue;
    const pos = (state.players[id]?.pos ?? p.position) as Position;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos)!.push({ id, team: row.team, l });
  }
  const out: Ballot[] = [];
  for (const [pos, list] of byPos) {
    const prods = list.map((x) => production(pos, x.l));
    const abil = list.map((x) => perceivedAbility(state, x.id, "voters", 72));
    const zp = z(prods), za = z(abil);
    const snaps = list.map((x) => Number(x.l.offSnaps ?? 0) + Number(x.l.defSnaps ?? 0) + (pos === "LS" ? Number(x.l.stSnaps ?? 0) : 0));
    const zs = z(snaps);
    list.forEach((x, i) => {
      const r = table[x.team];
      const pct = r ? (r.w + 0.5 * r.t) / Math.max(1, r.w + r.l + r.t) : 0.5;
      const film = LINE.has(pos) ? 0.8 * za(abil[i]) + 0.2 * zs(snaps[i]) : 0.62 * zp(prods[i]) + 0.38 * za(abil[i]);
      const pbs = rep ? Object.values(h.proBowl).filter((ids) => ids.includes(x.id)).length : 0;
      out.push({ id: x.id, team: x.team, pos, prod: prods[i], ret: returns(x.l), score: film + (pct - 0.5) * 0.6 + Math.min(0.5, pbs * 0.12) });
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const PRO_BOWL: Partial<Record<Position, number>> = { QB: 3, RB: 3, FB: 1, WR: 4, TE: 2, OT: 3, OG: 3, C: 2, EDGE: 3, IDL: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
const ALL_PRO: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 2, S: 2, K: 1, P: 1 };

function pick(list: Ballot[], slots: Partial<Record<Position, number>>, taken = new Set<string>()): string[] {
  const out: string[] = [];
  for (const [pos, n] of Object.entries(slots) as [Position, number][]) {
    out.push(...list.filter((b) => b.pos === pos && !taken.has(b.id)).slice(0, n).map((b) => b.id));
  }
  // One return specialist.
  const ret = [...list].sort((a, b) => b.ret - a.ret).find((b) => !taken.has(b.id) && !out.includes(b.id));
  if (ret && ret.ret > 20) out.push(ret.id);
  return out;
}

function namesFor(state: GameState, ids: string[]): string {
  return ids.map((id) => `${PLAYER_BY_ID[id].name} (${state.players[id]?.pos ?? PLAYER_BY_ID[id].position})`).join(", ");
}

function selectProBowl(state: GameState): void {
  const season = RULES.season;
  const h = honors(state);
  if (h.proBowl[season]) return;
  const all = ballot(state, true);
  const ids: string[] = [];
  for (const conf of ["AFC", "NFC"]) ids.push(...pick(all.filter((b) => TEAM_BY_ID[b.team]?.conference === conf), PRO_BOWL));
  h.proBowl[season] = ids;
  const ours = ids.filter((id) => state.players[id]?.team === state.userTeam);
  send(state, "league", "League office", `Pro Bowl rosters: ${ours.length} of ours`,
    ours.length ? `Voted to the Pro Bowl from our roster: ${namesFor(state, ours)}.` : "Nobody from our roster made the Pro Bowl this year.");
  news(state, `Pro Bowl rosters are out: ${ids.length} players named.`);
}

function selectAllPro(state: GameState): void {
  const season = RULES.season;
  const h = honors(state);
  if (h.allPro[season]) return;
  const all = ballot(state, false);
  const first = pick(all, ALL_PRO);
  const second = pick(all, ALL_PRO, new Set(first));
  h.allPro[season] = { first, second };
  const ours1 = first.filter((id) => state.players[id]?.team === state.userTeam);
  const ours2 = second.filter((id) => state.players[id]?.team === state.userTeam);
  if (ours1.length || ours2.length) {
    send(state, "league", "League office", "All-Pro teams announced",
      [ours1.length ? `First team: ${namesFor(state, ours1)}.` : "", ours2.length ? `Second team: ${namesFor(state, ours2)}.` : ""].filter(Boolean).join(" "));
  }
  const qb = first.find((id) => PLAYER_BY_ID[id].position === "QB");
  news(state, `The All-Pro teams are out${qb ? `; ${PLAYER_BY_ID[qb].name} is the first-team quarterback` : ""}.`);
}

// ---- Awards ----

const MVP_WEIGHT: Partial<Record<Position, number>> = { QB: 1, RB: 0.75, WR: 0.65, TE: 0.5, EDGE: 0.55, IDL: 0.45, LB: 0.35, CB: 0.35, S: 0.3 };
const OPOY_WEIGHT: Partial<Record<Position, number>> = { QB: 0.8, RB: 1, WR: 1, TE: 0.8 };
const DPOY_WEIGHT: Partial<Record<Position, number>> = { EDGE: 1, IDL: 1, LB: 0.85, CB: 0.8, S: 0.75 };

function top(list: { id: string; v: number }[], n = 3): string[] {
  return list.sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.id);
}

function weighted(b: Ballot[], w: Partial<Record<Position, number>>, extra: (x: Ballot) => number = () => 0): { id: string; v: number }[] {
  return b.filter((x) => w[x.pos] !== undefined).map((x) => ({ id: x.id, v: x.score * w[x.pos]! + extra(x) }));
}

function presentAwards(state: GameState): void {
  const season = RULES.season;
  const h = honors(state);
  if (h.awards[season]) return;
  const all = ballot(state, false);
  const rng = rngFor(state.seed, `awards:${season}`);
  // Voters disagree a little at the margins.
  const noisy = all.map((b) => ({ ...b, score: b.score + (rng() - 0.5) * 0.25 }));
  const table = standings(state);
  const pct = (t: string) => { const r = table[t]; return r ? (r.w + 0.5 * r.t) / Math.max(1, r.w + r.l + r.t) : 0.5; };
  const rookies = noisy.filter((b) => PLAYER_BY_ID[b.id].rookieYear === season);
  const comeback = noisy.filter((b) => {
    const last = seasonOf(state, b.id, season - 1);
    return Number(last?.line.g ?? 0) <= 8 && (PLAYER_BY_ID[b.id].yearsExp ?? 0) >= 2;
  });
  const results: AwardResult[] = [];
  const add = (award: Award, ids: string[]) => {
    if (!ids.length) return;
    const team = noisy.find((b) => b.id === ids[0])!.team;
    results.push({ award, winner: ids[0], team, name: PLAYER_BY_ID[ids[0]].name, finalists: ids.slice(1) });
  };
  add("MVP", top(weighted(noisy, MVP_WEIGHT, (x) => (pct(x.team) - 0.5) * 1.6)));
  add("OPOY", top(weighted(noisy.filter((b) => OFFENSE.has(b.pos)), OPOY_WEIGHT)));
  add("DPOY", top(weighted(noisy.filter((b) => !OFFENSE.has(b.pos)), DPOY_WEIGHT)));
  add("OROY", top(weighted(rookies.filter((b) => OFFENSE.has(b.pos)), { ...OPOY_WEIGHT, QB: 1, OT: 0.4, OG: 0.35, C: 0.35 })));
  add("DROY", top(weighted(rookies.filter((b) => !OFFENSE.has(b.pos)), DPOY_WEIGHT)));
  add("CPOY", top(weighted(comeback, { ...OPOY_WEIGHT, ...DPOY_WEIGHT, QB: 1 })));
  // Coach of the Year: the head coach whose team beat what was expected of it by the most.
  const expect = state.staff?.expect ?? {};
  const coaches = TEAMS.map(({ id }) => ({ id, v: (pct(id) - (expect[id] ?? 0.5)) * 2 + pct(id) * 0.5 + (rng() - 0.5) * 0.1 })).sort((a, b) => b.v - a.v);
  const hcOf = (team: string) => Object.values(state.staff?.people ?? {}).find((c) => c.team === team && c.role === "HC");
  const best = coaches.map((c) => ({ team: c.id, hc: hcOf(c.id) })).filter((c) => c.hc);
  if (best.length) results.push({ award: "COY", winner: best[0].hc!.id, team: best[0].team, name: best[0].hc!.name, finalists: best.slice(1, 3).map((c) => c.hc!.id) });
  h.awards[season] = results;
  const lines = results.map((r) => `${AWARD_NAME[r.award]}: ${r.name}, ${teamLabel(r.team)}`);
  news(state, `NFL Honors: ${lines.slice(0, 3).join("; ")}.`);
  const ours = results.filter((r) => r.team === state.userTeam);
  send(state, "league", "League office", "NFL Honors", `${lines.join(". ")}.${ours.length ? ` Ours: ${ours.map((r) => AWARD_NAME[r.award]).join(", ")}.` : ""}`);
}

// ---- Hall of Fame ----

/**
 * A career as the selectors weigh it: every real season on file (back to the
 * rookie year, careerstats.ts) and the seasons played in this save. Seasons
 * the data doesn't cover (linemen have no stats, and nothing before 1999)
 * are estimated from the level he showed, as voters remember a long career;
 * honors won in this save count on top.
 */
export function careerScore(state: GameState, id: string): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 0;
  const pos = p.position;
  const seasons = careerLines(state, id).filter((s) => Number(s.g ?? 0) > 0);
  const scores = seasons.map((s) => Math.min(1.6, Math.max(0, production(pos, s as unknown as Record<string, number>) / ELITE[pos])));
  // Linemen have no stats: seasons as a starter stand in.
  const lineSeasons = Object.values(p.snaps ?? {}).filter((s) => Math.max(s.offShare, s.defShare) >= 0.8).length;
  const known = LINE.has(pos) ? lineSeasons * 0.55 : scores.reduce((a, b) => a + b, 0);
  const firstOnFile = LINE.has(pos)
    ? Math.min(2023, ...Object.keys(p.snaps ?? {}).map(Number))
    : seasons.length ? Math.min(...seasons.map((s) => s.season)) : (p.rookieYear ?? 2023);
  const before = Math.max(0, firstOnFile - (p.rookieYear ?? firstOnFile));
  const peak = LINE.has(pos) ? 0.5 : Math.max(0, ...scores.slice(0, 3)) * 0.8;
  const h = honors(state);
  const pb = Object.values(h.proBowl).filter((ids) => ids.includes(id)).length;
  const ap1 = Object.values(h.allPro).filter((a) => a.first.includes(id)).length;
  const ap2 = Object.values(h.allPro).filter((a) => a.second.includes(id)).length;
  const big = Object.values(h.awards).flat().filter((a) => a.winner === id).reduce((t, a) => t + (a.award === "MVP" ? 5 : a.award === "DPOY" || a.award === "OPOY" ? 3 : 1), 0);
  return known + before * peak + pb * 0.6 + ap1 * 2 + ap2 * 0.8 + big;
}

/** The bar a career has to clear, and the most a class can take. */
const HOF_BAR = 11;
const HOF_CLASS = 5;

function selectHallOfFame(state: GameState): void {
  const season = RULES.season;
  const year = season + 1;
  const h = honors(state);
  if (h.hof.classes[year]) return;
  const hist = history(state);
  const inducted = new Set(Object.values(h.hof.classes).flat());
  // Five full seasons retired.
  const eligible = Object.entries(hist.retired).filter(([id, last]) => last <= season - 5 && !inducted.has(id) && PLAYER_BY_ID[id]);
  const rng = rngFor(state.seed, `hof:${year}`);
  const ranked = eligible.map(([id, last]) => ({ id, v: careerScore(state, id) + (rng() - 0.5) * 1.5 + Math.min(1.5, (season - 5 - last) * 0.1) }))
    .sort((a, b) => b.v - a.v);
  const finalists = ranked.slice(0, 15).filter((x) => x.v >= HOF_BAR * 0.7);
  const chosen = finalists.filter((x) => x.v >= HOF_BAR).slice(0, HOF_CLASS).map((x) => x.id);
  h.hof.finalists[year] = finalists.map((x) => x.id);
  h.hof.classes[year] = chosen;
  if (chosen.length) {
    news(state, `The Pro Football Hall of Fame class of ${year}: ${chosen.map((id) => PLAYER_BY_ID[id].name).join(", ")}.`);
    const ours = chosen.filter((id) => (PLAYER_BY_ID[id].stats ?? []).some((s) => s.team === state.userTeam) || state.players[id]?.lastTeam === state.userTeam);
    if (ours.length) send(state, "league", "Pro Football Hall of Fame", `${ours.map((id) => PLAYER_BY_ID[id].name).join(" and ")} elected to the Hall of Fame`,
      `${ours.map((id) => PLAYER_BY_ID[id].name).join(" and ")}, who played for us, ${ours.length === 1 ? "is" : "are"} in the class of ${year}. The enshrinement is in Canton before the Hall of Fame Game.`);
  }
}

// ---- What honors are used for ----

/** Pro Bowls on the original ballot, which the fifth-year option counts. */
export function proBowls(state: GameState, id: string, through = RULES.season): number {
  return Object.entries(honors(state).proBowl).filter(([y, ids]) => Number(y) <= through && ids.includes(id)).length;
}

/** A player's honors, for his page. */
export function honorsOf(state: GameState, id: string): string[] {
  const h = honors(state);
  const out: string[] = [];
  for (const [y, ids] of Object.entries(h.proBowl)) if (ids.includes(id)) out.push(`${y} Pro Bowl`);
  for (const [y, a] of Object.entries(h.allPro)) {
    if (a.first.includes(id)) out.push(`${y} All-Pro (first team)`);
    else if (a.second.includes(id)) out.push(`${y} All-Pro (second team)`);
  }
  for (const [y, list] of Object.entries(h.awards)) for (const a of list) if (a.winner === id) out.push(`${y} ${AWARD_NAME[a.award]}`);
  for (const [y, ids] of Object.entries(h.hof.classes)) if (ids.includes(id)) out.push(`Hall of Fame, class of ${y}`);
  return out.sort();
}

export function honorsDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date === addDays(K.regularSeasonEnd, -19)) selectProBowl(state);
  if (state.date === addDays(K.wildCardWeekend, -1)) selectAllPro(state);
  if (state.date === addDays(K.superBowl, -3)) {
    presentAwards(state);
    selectHallOfFame(state);
  }
}
