// In-season development. Young players with room to grow improve week by
// week, faster under coaches who develop players well and when they are on
// the field; older players slowly lose a step. Changes are small during the
// season: most growth and decline will come in the offseason.
import { ageOn } from "./dates";
import { HIDDEN_RATINGS, PLAYER_BY_ID } from "./league";
import { gaussian, rngFor } from "./rng";
import { staffEffects } from "./staff";
import type { GameState } from "./types";

const SIDE: Record<string, "off" | "def" | "st"> = {
  QB: "off", RB: "off", FB: "off", WR: "off", TE: "off", OT: "off", OG: "off", C: "off",
  EDGE: "def", IDL: "def", LB: "def", CB: "def", S: "def", K: "st", P: "st", LS: "st",
};

/** Runs one week of development for every player on a roster. `snapsLastWeek` marks who played. */
export function weeklyDevelopment(state: GameState, played: Set<string>): void {
  const rng = rngFor(state.seed, `dev:${state.date}`);
  for (const [id, p] of Object.entries(state.players)) {
    if (!p.team || p.status === "fa") continue;
    const r = HIDDEN_RATINGS[id];
    const player = PLAYER_BY_ID[id];
    if (!r || !player) continue;
    const fx = staffEffects(p.team);
    const side = SIDE[player.position];
    const coach = side === "off" ? fx.devOffense : side === "def" ? fx.devDefense : fx.devSpecial;
    const age = ageOn(player.birthDate, state.date) ?? 26;
    const dev = p.dev ?? 0;
    const room = r.potential + (p.pot ?? 0) - (r.overall + dev);
    let change = 0;
    if (room > 0 && !p.holdout) change += room * 0.011 * (0.55 + (coach - 60) / 45) * (played.has(id) ? 1.35 : p.status === "ir" ? 0.4 : 1);
    if (age >= 30) change -= 0.025 * (age - 29);
    change += gaussian(rng) * 0.07;
    p.dev = Math.round((dev + change) * 100) / 100;
  }
}
