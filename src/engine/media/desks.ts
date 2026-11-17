// The talk desks: facts that come from people talking rather than from a
// result. Wednesday press conferences in season (our head coach and a couple
// of players around the league), camp notebooks in the summer, and the hot
// seat once the season has a few losses in it. Each builder returns facts for
// the story engine; who gets picked follows the old desks' rules.
import { contractYearsLeft, teamPlayerIds } from "../cap";
import { PLAYER_BY_ID, RULES, SCHEDULE, TEAMS } from "../league";
import { marketView } from "../market";
import { mediaState } from "../outlets";
import type { Rng } from "../rng";
import { depthChart } from "../roster";
import { teamStaff } from "../staff";
import { matchup, standings, type Record_ } from "../standings";
import type { GameState, Position } from "../types";
import { playerSlots, teamSlots, type Fact } from "./facts";

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const hcName = (team: string) => teamStaff(team).HC?.name ?? "the head coach";
const streakOf = (r: Record_ | undefined) => {
  const s = r?.streak ?? "";
  const n = Number(s.slice(1)) || 0;
  return { wStreak: s.startsWith("W") ? n : 0, lStreak: s.startsWith("L") ? n : 0 };
};

/** The next opponent on a team's schedule, if any. */
function nextOpponent(state: GameState, team: string): string | undefined {
  for (const g of SCHEDULE) {
    if (g.date <= state.date) continue;
    const m = matchup(state, g);
    if (m && (m.home === team || m.away === team)) return m.home === team ? m.away : m.home;
  }
  return undefined;
}

/** Wednesday in season: our head coach's press conference and two players elsewhere in the league. */
export function talkFacts(state: GameState, rng: Rng): Fact[] {
  const table = standings(state);
  const us = state.userTeam;
  const out: Fact[] = [];
  const opp = nextOpponent(state, us);
  const coach = mediaState(state).coach;
  const hurt = teamPlayerIds(state, us).filter((id) => state.players[id].injury && marketView(state, id) >= 75).length;
  out.push({
    id: `talk:${state.date}:hc`, type: "talk.coach", family: "talk", kind: "interview", teams: [us], players: [], value: 55, ours: true,
    tags: { ours: true, ...streakOf(table[us]), opp: !!opp, faithHigh: coach >= 70, faithLow: coach < 25, hurtCount: hurt >= 3 },
    slots: { S: { name: hcName(us), role: "head coach" }, T: teamSlots(state, us, table), O: opp ? teamSlots(state, opp, table) : undefined },
  });
  const pool = TEAMS.map((t) => t.id).filter((t) => t !== us);
  for (let i = 0; i < 2; i++) {
    const team = pick(rng, pool);
    const ids = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && !state.players[id].injury);
    const stars = ids.map((id) => [id, marketView(state, id)] as const).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!stars.length) continue;
    const [id, view] = pick(rng, stars);
    const P = playerSlots(state, id);
    out.push({
      id: `talk:${state.date}:${i}`, type: "talk.player", family: "talk", kind: "interview", teams: [team], players: [id],
      value: 35 + (view >= 86 ? 15 : 0), ours: false,
      tags: {
        ...streakOf(table[team]), star: view >= 86, contractYear: contractYearsLeft(id, RULES.season, state) <= 1,
        veteran: Number(P.age) >= 31, rookie: Number(P.exp) === 0,
      },
      slots: { P, T: teamSlots(state, team, table) },
    });
  }
  return out;
}

/** A camp notebook for one team: the closest position battle, a rookie and any holdout. */
export function campFact(state: GameState, team: string, rng: Rng): Fact | null {
  const table = standings(state);
  const chart = depthChart(state, team);
  const battles = (["QB", "RB", "WR", "TE", "OT", "OG", "C", "EDGE", "IDL", "LB", "CB", "S", "K"] as Position[]).flatMap((pos) => {
    const [a, b] = (chart[pos] ?? []).filter((x) => PLAYER_BY_ID[x] && !state.players[x]?.injury);
    if (!a || !b) return [];
    const gap = Math.abs(marketView(state, a) - marketView(state, b));
    return gap < 3 ? [[pos, a, b, gap] as const] : [];
  }).sort((x, y) => x[3] - y[3]);
  const rookies = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && PLAYER_BY_ID[id].yearsExp === 0 && PLAYER_BY_ID[id].draft.round)
    .sort((a, b) => marketView(state, b) - marketView(state, a));
  const battle = battles.length ? pick(rng, battles.slice(0, 3)) : null;
  const rookie = rookies.length ? pick(rng, rookies.slice(0, 3)) : null;
  const hold = teamPlayerIds(state, team).find((id) => state.players[id].holdout && PLAYER_BY_ID[id]);
  if (!battle && !rookie && !hold) return null;
  const ours = team === state.userTeam;
  const players = [...(battle ? [battle[1], battle[2]] : []), ...(rookie ? [rookie] : []), ...(hold ? [hold] : [])];
  return {
    id: `camp:${state.date}:${team}`, type: battle?.[0] === "QB" ? "camp.qb" : "camp.notes", family: "camp", kind: "interview",
    teams: [team], players, value: (ours ? 50 : 30) + (battle?.[0] === "QB" ? 15 : 0) + (hold ? 10 : 0), ours,
    tags: { ours, battle: !!battle, qb: battle?.[0] === "QB", rookie: !!rookie, hold: !!hold },
    slots: {
      T: teamSlots(state, team, table), coach: hcName(team),
      battle: battle ? { pos: battle[0], a: playerSlots(state, battle[1]), b: playerSlots(state, battle[2]) } : undefined,
      rookie: rookie ? playerSlots(state, rookie) : undefined, hold: hold ? playerSlots(state, hold) : undefined,
    },
  };
}

/** Tuesdays from midseason: one coach whose team has won 30% or less after six games. */
export function seatFact(state: GameState, rng: Rng): Fact | null {
  const table = standings(state);
  const cold = TEAMS.map((t) => t.id).filter((t) => {
    const r = table[t];
    const g = r.w + r.l + r.t;
    return g >= 6 && r.w / g <= 0.3;
  });
  if (!cold.length) return null;
  const t = pick(rng, cold);
  const ours = t === state.userTeam;
  const r = table[t];
  return {
    id: `seat:${state.date}:${t}`, type: "seat.watch", family: "seat", kind: "rumor", teams: [t], players: [],
    value: 50 + (ours ? 20 : 0) + (r.w === 0 ? 15 : 0), ours,
    tags: { ours, ...streakOf(r), winless: r.w === 0 },
    slots: { T: teamSlots(state, t, table), coach: hcName(t) },
  };
}
