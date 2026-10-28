// Written scouting and coaching reports: how the owner learns what a player
// is, without ever seeing a rating. Each report comes from a real person on
// the staff, and is only as accurate as that person's eye for talent.
import { ageOn } from "./dates";
import { HIDDEN_RATINGS, PLAYER_BY_ID } from "./league";
import { gaussian, rngFor } from "./rng";
import { OFFENSE_LABEL, DEFENSE_LABEL } from "./schemes";
import { ability, perceivedAbility, schemeFit, staffEffects, teamSchemes, teamStaff, trait } from "./staff";
import type { GameState } from "./types";

export interface PlayerReport {
  author: string;
  authorRole: string;
  grade: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  fit?: string;
}

const TRAIT_WORDS: Record<string, [string, string]> = {
  speed: ["Plays fast; real long speed", "Lacks top-end speed"],
  strength: ["Strong at the point of attack", "Can get overpowered"],
  agility: ["Changes direction easily", "Stiff when asked to change direction"],
  arm: ["Can make every throw; drives the ball downfield", "Arm limits the deep and outside throws"],
  accuracy: ["Accurate, puts it where only the receiver can get it", "Accuracy comes and goes"],
  mobility: ["Extends plays and is a real threat to run", "Mostly a pocket passer"],
  decisions: ["Smart with the football; rarely gives it away", "Forces throws into coverage"],
  vision: ["Patient runner with good vision", "Misses cutback lanes"],
  power: ["Runs through contact", "Goes down on first contact too often"],
  receiving: ["Real weapon in the passing game", "Limited as a receiver"],
  burst: ["Explosive through the hole", "Lacks a second gear"],
  blocking: ["Willing, effective blocker", "Liability as a blocker"],
  deep: ["Wins deep and tracks the ball well", "Not a deep threat"],
  routes: ["Sharp route runner who gets open", "Rounds off routes and struggles to separate"],
  hands: ["Strong, reliable hands", "Has concentration drops"],
  yac: ["Dangerous after the catch", "Little after the catch"],
  passBlock: ["Steady in pass protection", "Gives up too much pressure"],
  runBlock: ["Moves people in the run game", "Doesn't create movement in the run game"],
  passRush: ["Can win one on one and get home", "Not much of a pass rusher"],
  runStop: ["Holds up against the run", "Gets washed out against the run"],
  coverage: ["Comfortable in coverage", "Exposed in coverage"],
  blitz: ["Effective blitzer", "Rarely affects the quarterback"],
  man: ["Can lock up receivers in man coverage", "Struggles in man coverage"],
  zone: ["Reads the quarterback well in zone", "Loses track of receivers in zone"],
  press: ["Physical at the line in press", "Gets beat off the line in press"],
  range: ["Covers a lot of ground from the deep middle", "Limited range as a deep safety"],
  box: ["Physical, active near the line", "Not a factor near the line"],
  kickPower: ["Big leg", "Leg strength is a question from long range"],
  kickAccuracy: ["Accurate and consistent", "Too many misses"],
  placement: ["Pins teams deep with directional punts", "Struggles with placement"],
};

/** Position-relative grade words from an evaluator's view of ability. */
function grade(view: number): string {
  if (view >= 94) return "One of the best in the league at the position";
  if (view >= 89) return "High-end starter";
  if (view >= 83) return "Quality starter";
  if (view >= 77) return "Low-end starter or top backup";
  if (view >= 70) return "Rotation player";
  if (view >= 62) return "Backup";
  return "Camp body; on the roster bubble";
}

/**
 * A report on any player. Your own players are graded by your head coach;
 * everyone else by your pro scouting director.
 */
export function playerReport(state: GameState, id: string): PlayerReport {
  const p = PLAYER_BY_ID[id];
  const st = state.players[id];
  const us = state.userTeam;
  const staff = teamStaff(us);
  const fx = staffEffects(us);
  const ours = st.team === us;
  const author = ours ? staff.HC : staff.PRO;
  const skill = ours ? fx.coachEval : fx.proScouting;
  const key = ours ? `coach:${us}` : `pro:${us}`;
  const view = perceivedAbility(state, id, key, skill);
  const sd = Math.max(0.8, (100 - skill) / 7);
  const rng = rngFor(state.seed, `report:${key}:${id}`);

  // Trait reads: each relative to the player's overall, each with the evaluator's error.
  const r = HIDDEN_RATINGS[id];
  const base = ability(state, id);
  const reads: [string, number][] = Object.keys(r.traits).map((t) => [t, trait(state, id, t) - base + gaussian(rng) * sd * 1.2]);
  reads.sort((a, b) => b[1] - a[1]);
  const strengths = reads.filter(([, v]) => v >= 4).slice(0, 2).map(([t]) => TRAIT_WORDS[t]?.[0]).filter(Boolean) as string[];
  const concerns = reads.filter(([, v]) => v <= -5).slice(-2).reverse().map(([t]) => TRAIT_WORDS[t]?.[1]).filter(Boolean) as string[];

  const age = ageOn(p.birthDate, state.date) ?? 26;
  const upside = r.potential - r.overall + gaussian(rng) * sd;
  const notes: string[] = [];
  if (age <= 25 && upside >= 6) notes.push("Still developing, and the staff sees a lot of room to grow.");
  else if (age <= 25 && upside >= 3) notes.push("Should keep getting better.");
  else if (age >= 31) notes.push("Starting to show some age.");
  const durability = r.durability + gaussian(rng) * sd * 1.5;
  if (durability < 58) notes.push("Has had trouble staying on the field.");
  else if (durability > 88 && p.yearsExp >= 3) notes.push("Durable; rarely misses time.");

  const fitValue = schemeFit(state, id, us) + gaussian(rng) * sd * 0.6;
  const schemes = teamSchemes(us);
  const side = ["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C"].includes(p.position) ? "offense" : "defense";
  const schemeName = side === "offense" ? OFFENSE_LABEL[schemes.offense] : DEFENSE_LABEL[schemes.defense];
  let fit: string | undefined;
  if (!["K", "P", "LS"].includes(p.position)) {
    fit = fitValue >= 2.5 ? `A natural fit for our ${schemeName.toLowerCase()} scheme.`
      : fitValue <= -2.5 ? `Not an ideal fit for what we do (${schemeName.toLowerCase()}).`
        : `Fits our ${schemeName.toLowerCase()} scheme fine.`;
  }
  return {
    author: author?.name ?? (ours ? "Head coach" : "Pro scouting"),
    authorRole: ours ? "Head coach" : "Director of pro scouting",
    grade: grade(view),
    summary: notes.join(" "),
    strengths,
    concerns,
    fit,
  };
}

/** Short grade for list views: the evaluator's tier. */
export function gradeShort(state: GameState, id: string): string {
  const us = state.userTeam;
  const ours = state.players[id].team === us;
  const fx = staffEffects(us);
  const view = perceivedAbility(state, id, ours ? `coach:${us}` : `pro:${us}`, ours ? fx.coachEval : fx.proScouting);
  if (view >= 94) return "Elite";
  if (view >= 89) return "High-end starter";
  if (view >= 83) return "Starter";
  if (view >= 77) return "Fringe starter";
  if (view >= 70) return "Rotation";
  if (view >= 62) return "Backup";
  return "Bubble";
}
