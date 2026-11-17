// What the coverage does. Every fact the media write up has a tone for the
// clubs and players in it (a win, a breakout and a glowing column read well; a
// loss, a hot seat, a holdout and an owner who skips questions read badly),
// weighted by how big the news is. The tones build up and fade over a few
// weeks, and once a week they move the things coverage moves in real life:
// fan trust, our sponsors' mood, players' morale and our stars' agents'
// leverage. Other systems read the tone through media/climate.ts: CPU owners'
// patience with their head coach (carousel.ts), how free agents see a club
// (playercare.ts), the league office's attention to our owner (compliance.ts)
// and voters on a stadium deal (politics.ts). All of it is hidden.
import { changeMorale } from "../agents";
import { teamPlayerIds } from "../cap";
import { weekday } from "../dates";
import { trustHit } from "../fans";
import { isPendingFreeAgent } from "../offseason";
import { mediaState } from "../outlets";
import { TEAM_BY_ID } from "../league";
import type { GameState, PressClimate } from "../types";
import type { Fact } from "./facts";

export function climate(state: GameState): PressClimate {
  return (mediaState(state).climate ??= { tone: {}, players: {}, league: 0 });
}

const GOOD_ARCS = new Set(["winStreak", "unbeaten", "rookie", "breakout", "comeback", "division", "lastRide"]);
const BAD_ARCS = new Set(["hotSeat", "holdout", "tradeRequest", "scandal", "losingStreak", "winless", "injuries", "capCrunch", "feud", "relocation", "sale", "topPick", "search"]);
const BAD_RUMORS = new Set(["request", "hotseat", "shopping", "seller"]);

/** How a fact reads for a club (-1 to 1), and for its first player. */
function toneOf(f: Fact, team: string): { team: number; player: number } {
  const kind = f.type.split(".")[1] ?? "";
  const t = f.tags;
  switch (f.family) {
    case "game": {
      const w = (f.slots.W as { id?: string } | undefined)?.id;
      return { team: t.tie ? 0 : w === team ? 1 : -1, player: 0 };
    }
    case "performance": return { team: 0.3, player: 1 };
    case "injury": return { team: -0.5, player: 0 };
    case "signing": return { team: t.overpay ? -0.3 : 0.4, player: t.overpay ? -0.2 : 0.5 };
    case "release": return { team: -0.1, player: -0.3 };
    case "trade": return { team: t.blockbuster ? 0.2 : 0, player: 0 };
    case "seat": return { team: -0.8, player: 0 };
    case "rumor": return { team: BAD_RUMORS.has(kind) ? -0.4 : 0, player: kind === "request" ? -0.4 : 0 };
    case "arc": return GOOD_ARCS.has(kind) ? { team: 0.6, player: 0.8 } : BAD_ARCS.has(kind) ? { team: -0.6, player: kind === "holdout" || kind === "tradeRequest" || kind === "scandal" ? -0.6 : 0 } : { team: 0, player: 0 };
    case "season":
      if (kind === "clinch" || kind === "playoffs") return { team: f.teams[0] === team ? 0.6 : 0, player: 0 };
      if (kind === "eliminated") return { team: -0.6, player: 0 };
      if (kind === "award" || kind === "milestone" || kind === "recordwatch") return { team: 0.2, player: 0.8 };
      return { team: 0, player: 0 };
    case "opinion": return { team: t.real ? 0.5 : t.fraud ? -0.5 : 0, player: t.mvp ? 0.6 : 0 };
    case "owner": return { team: ownerTone(kind, t), player: 0 };
    default: return { team: 0, player: 0 };
  }
}

function ownerTone(kind: string, t: Fact["tags"]): number {
  switch (kind) {
    case "presser": return t.skipped ? -0.8 : t.candid ? 0.4 : t.confident ? 0.3 : t.defiant ? -0.3 : -0.2;
    case "interview": return 0.3;
    case "exclusive": return 0.2;
    case "burned": return -1;
    case "response": return t.proved ? -1 : t.confirm ? 0.1 : 0;
    case "oped": return 0.4;
    case "ban": return t.unban ? 0.1 : -0.8;
    case "post": return t.refs ? -0.4 : -0.1;
    default: return 0;
  }
}

/** What the league office notices when the owner talks. */
function attention(f: Fact): number {
  if (f.family !== "owner") return 0;
  const kind = f.type.split(".")[1];
  const t = f.tags;
  if (kind === "post") return t.refs ? 15 : t.jab ? 5 : 0;
  if (kind === "ban") return t.unban ? 0 : 10;
  if (kind === "burned") return 8;
  if (kind === "presser" && t.defiant) return 4;
  return 0;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Adds facts to the climate as they are written. */
export function absorb(state: GameState, facts: Fact[]): void {
  const c = climate(state);
  for (const f of facts) {
    const w = (f.value / 50) * 4;
    for (const team of f.teams.slice(0, 2)) {
      if (!TEAM_BY_ID[team]) continue;
      const tone = toneOf(f, team);
      if (tone.team) c.tone[team] = clamp((c.tone[team] ?? 0) + tone.team * w, -50, 50);
      const p = f.players[0];
      if (p && tone.player && team === f.teams[0]) c.players[p] = clamp((c.players[p] ?? 0) + tone.player * w * 1.5, -50, 50);
    }
    c.league = clamp(c.league + attention(f), 0, 100);
  }
}

/** Once a week the coverage moves fans, sponsors (through the climate), players and agents. */
function weekly(state: GameState): void {
  const c = climate(state);
  const us = state.userTeam;
  const tone = c.tone[us] ?? 0;
  trustHit(state, (tone / 50) * 0.8);
  const ours = new Set(teamPlayerIds(state, us));
  const lev = mediaState(state).leverage;
  for (const [id, v] of Object.entries(c.players)) {
    if (!ours.has(id) || Math.abs(v) < 3) continue;
    changeMorale(state, id, clamp(v / 15, -2, 2));
    // A player the press is raving about in a contract year gives his agent a better hand.
    if (v > 6 && isPendingFreeAgent(state, id)) lev[id] = Math.round(Math.min(0.06, (lev[id] ?? 0) + v / 2000) * 1000) / 1000;
  }
}

/** The day's coverage: old tones fade, the day's facts add theirs, and Mondays the effects land. */
export function coverageDaily(state: GameState, facts: Fact[]): void {
  const c = climate(state);
  for (const k of Object.keys(c.tone)) c.tone[k] = Math.round(c.tone[k] * 0.95 * 100) / 100;
  for (const k of Object.keys(c.players)) {
    const v = Math.round(c.players[k] * 0.93 * 100) / 100;
    if (Math.abs(v) < 0.5) delete c.players[k];
    else c.players[k] = v;
  }
  c.league = Math.round(c.league * 0.98 * 100) / 100;
  absorb(state, facts);
  if (weekday(state.date) === "Monday") weekly(state);
}
