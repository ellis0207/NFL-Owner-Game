// The medical side: what the doctors know and when, rehab, who decides when a
// player can play again, and insurance on salaries.
//
// A first diagnosis is a guess. For anything more than a few days, further
// tests a couple of days later firm up the timeline, and the first estimate
// can be too hopeful or too gloomy; a better-funded medical staff guesses
// closer. Long rehabs can hit a setback or run ahead of schedule.
//
// The doctors decide when a player is cleared, not the owner. The owner can
// ask whether an early return is possible; for a minor injury the doctors
// sometimes say yes, and a player back early is more likely to get hurt
// again for a few weeks. A concussion is the independent neurological
// consultant's call under the league protocol, and nobody at the club can
// shorten it. A club that skimps on its medical staff risks a league review
// when a concussion is handled in its games.
//
// Disability insurance on a big salary: the club pays a premium before the
// season and, once a player has missed more than three straight weeks with a
// football injury, the policy pays back most of his salary for the weeks after.
import { diagnosisFactor } from "./playercare";
import { post } from "./business";
import { clubhouse, clubNote } from "./clubhouse";
import { dealOf } from "./contracts";
import { addDays, ageOn, daysBetween, weekday } from "./dates";
import { send } from "./inbox";
import { PLAYER_BY_ID, RULES } from "./league";
import { capScale } from "./market";
import { projectEffects } from "./projects";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import type { GameState, Injury } from "./types";

export interface Policy {
  season: number;
  premium: number;
  /** The salary the policy covers this season. */
  base: number;
  /** Straight weeks missed so far, and what has been paid back. */
  weeksOut: number;
  paid: number;
}

/** Our medical staff level, 0 to 3, with any facility projects. Other clubs are average. */
export function medicalLevel(state: GameState, team: string): number {
  return team === state.userTeam ? Math.min(3, (state.business?.budget.medical ?? 1) + projectEffects(state).medical) : 1;
}

function trainer(state: GameState): string {
  return `${teamStaff(state.userTeam).TRN?.name ?? "Our head athletic trainer"}, head athletic trainer`;
}

/** The return date the club has to go on today: the first estimate until the follow-up tests are back. */
export function knownReturn(state: GameState, inj: Injury): string {
  return inj.est && inj.testsOn && state.date < inj.testsOn ? inj.est : inj.returnDate;
}

/**
 * Sets the first estimate and the follow-up date for a new injury. Uses its
 * own random stream, so diagnoses never change what happens on the field.
 */
export function diagnose(state: GameState, id: string, team: string, inj: Injury, days: number): void {
  if (days >= 28) inj.mid = addDays(inj.date, Math.round(days / 2));
  if (days < 6 || inj.seasonEnding || inj.nonFootball) return;
  const rng = rngFor(state.seed, `dx:${id}:${inj.date}`);
  const spread = [0.32, 0.25, 0.19, 0.14][medicalLevel(state, team)] * (team === state.userTeam ? diagnosisFactor(state) : 1);
  const off = Math.round(days * spread * gaussian(rng));
  inj.est = addDays(inj.date, Math.max(2, days + off));
  inj.testsOn = addDays(inj.date, 2 + Math.floor(rng() * 3));
}

function weeksText(from: string, to: string): string {
  const d = daysBetween(from, to);
  if (d <= 3) return "day to day";
  const w = Math.round(d / 7);
  return w <= 1 ? "about a week" : `about ${w} weeks`;
}

/** Follow-up tests, rehab milestones and concussion clearance, for every injured player. */
function injuriesDaily(state: GameState): void {
  for (const [id, ps] of Object.entries(state.players)) {
    const inj = ps.injury;
    if (!inj || inj.returnDate <= state.date) continue;
    const name = PLAYER_BY_ID[id]?.name ?? id;
    const mine = ps.team === state.userTeam;
    // The follow-up tests.
    if (inj.testsOn === state.date && inj.est && mine) {
      const was = daysBetween(state.date, inj.est);
      const now = daysBetween(state.date, inj.returnDate);
      const news = Math.abs(now - was) < 4 ? "confirm the first read" : now > was ? "show more damage than we first thought" : "are better than we feared";
      send(state, "staff", trainer(state), `${name}: test results`,
        `The follow-up tests on ${name}'s ${inj.type.toLowerCase()} ${news}. ` +
        `We now expect him back in ${weeksText(state.date, inj.returnDate)}.`);
      clubNote(state, `${name}: tests ${news}.`);
    }
    // Halfway through a long rehab.
    if (inj.mid === state.date) {
      const rng = rngFor(state.seed, `rehab:${id}:${inj.date}`);
      const lvl = medicalLevel(state, ps.team ?? "");
      const left = daysBetween(state.date, inj.returnDate);
      const roll = rng();
      let text = "";
      if (roll < [0.2, 0.15, 0.12, 0.09][lvl]) {
        inj.returnDate = addDays(inj.returnDate, Math.round(left * (0.15 + 0.2 * rng())));
        text = `${name} has had a setback in his rehab. The new target is ${weeksText(state.date, inj.returnDate)} from now.`;
      } else if (roll > 1 - [0.08, 0.11, 0.14, 0.17][lvl]) {
        inj.returnDate = addDays(inj.returnDate, -Math.round(left * (0.08 + 0.1 * rng())));
        text = `${name} is ahead of schedule in his rehab. He could be back in ${weeksText(state.date, inj.returnDate)}.`;
      } else {
        text = `${name}'s rehab is on schedule: back in ${weeksText(state.date, inj.returnDate)} if it stays that way.`;
      }
      inj.seasonEnding = inj.returnDate > RULES.keyDates.superBowl;
      if (mine) {
        send(state, "staff", trainer(state), `${name}: rehab update`, text);
        clubNote(state, text);
      }
    }
    // The day before a concussed player is due back, the independent consultant has the last word.
    if (inj.type === "Concussion" && addDays(state.date, 1) === inj.returnDate) {
      const rng = rngFor(state.seed, `clear:${id}:${inj.date}`);
      if (rng() < 0.18) {
        inj.returnDate = addDays(inj.returnDate, 5 + Math.floor(rng() * 3));
        if (mine) send(state, "staff", trainer(state), `${name} not yet cleared`,
          `${name} has not been cleared by the independent neurological consultant and stays in the concussion protocol. ` +
          "Under the league's rules that decision is theirs alone. We'll know more after his next evaluation.");
      }
    }
  }
}

/** Minor injuries the doctors might clear a player to play through. */
const SOFT = ["Ankle sprain", "Hamstring strain", "Groin strain", "Calf strain", "Quad strain", "Back spasms", "Knee bruise", "Hip pointer", "Wrist sprain", "Shoulder sprain", "Rib injury", "Neck stinger", "Foot sprain", "Elbow sprain"];

/** The owner asks whether a player could come back early. The doctors answer; the owner cannot overrule them. */
export function askEarlyReturn(state: GameState, id: string): { ok: boolean; text: string } {
  const ps = state.players[id];
  const inj = ps?.injury;
  const name = PLAYER_BY_ID[id]?.name ?? id;
  if (!inj || ps.team !== state.userTeam || inj.returnDate <= state.date) return { ok: false, text: `${name} isn't hurt.` };
  if (inj.asked) return { ok: false, text: "The doctors have already given their answer." };
  inj.asked = true;
  if (inj.type === "Concussion")
    return { ok: false, text: `A return from a concussion is decided by the team physician and an independent neurological consultant under the league protocol. Neither the club nor the owner can shorten it.` };
  if (inj.nonFootball && inj.type === "Personal matter") return { ok: false, text: `${name} is away for a personal matter. He'll be back when he's ready.` };
  const left = daysBetween(state.date, inj.returnDate);
  const rng = rngFor(state.seed, `early:${id}:${inj.date}`);
  const lvl = medicalLevel(state, ps.team!);
  const chance = SOFT.includes(inj.type) && left <= 28 ? 0.45 + 0.05 * lvl : 0.08;
  // Being asked by the owner registers with the player either way.
  ps.morale = Math.max(0, (ps.morale ?? 70) - 2);
  if (rng() >= chance) {
    clubNote(state, `Asked about an early return for ${name}; the doctors said no.`);
    return { ok: false, text: `The doctors won't clear ${name} early. Their view is that he needs the full ${weeksText(state.date, inj.returnDate)}, and that call is theirs.` };
  }
  const back = Math.max(1, Math.round(left * 0.7));
  inj.returnDate = addDays(state.date, back);
  if (inj.est) inj.est = inj.returnDate;
  ps.fragile = addDays(inj.returnDate, 21);
  clubNote(state, `${name} cleared to return early.`);
  return { ok: true, text: `The doctors think ${name} can manage it. He's cleared to return in ${weeksText(state.date, inj.returnDate)}, with a higher chance of getting hurt again for a few weeks after.` };
}

/** A concussion in a game run by a bare-bones medical staff can draw a league review. */
function protocolReviews(state: GameState): void {
  if (medicalLevel(state, state.userTeam) > 0) return;
  for (const [id, ps] of Object.entries(state.players)) {
    if (ps.team !== state.userTeam || ps.injury?.type !== "Concussion" || ps.injury.date !== addDays(state.date, -1)) continue;
    const rng = rngFor(state.seed, `review:${id}:${ps.injury.date}`);
    if (rng() > 0.15) continue;
    post(state, "fines", -150_000, "Concussion protocol review");
    send(state, "league", "League office", "Concussion protocol review",
      `The league and the players' association reviewed how ${PLAYER_BY_ID[id].name}'s concussion was handled and found that our medical staffing fell short of the protocol's standards. ` +
      "The club is fined $150,000 and must show the league its medical staffing plan.");
    clubNote(state, "Fined $150,000 after a concussion protocol review.");
  }
}

// ---- Insurance ----

/** The salary a policy would cover this season. */
export function insurableBase(state: GameState, id: string): number {
  return dealOf(state, id)?.years.find((y) => y.year === RULES.season)?.base ?? 0;
}

/** The smallest salary underwriters will write a policy for. */
export function insuranceFloor(state: GameState): number {
  return 4_000_000 * capScale(state, RULES.season);
}

/** The premium for a season's policy: higher for older players, running backs and anyone hurt recently. */
export function premiumFor(state: GameState, id: string): number {
  const base = insurableBase(state, id);
  const p = PLAYER_BY_ID[id];
  const age = ageOn(p.birthDate, state.date) ?? 27;
  let rate = 0.035 + (age >= 30 ? 0.015 : 0) + (p.position === "RB" ? 0.01 : 0) + (state.players[id]?.injury ? 0.03 : 0);
  if (state.date > RULES.keyDates.regularSeasonStart) rate *= 1.25;
  return Math.round(base * rate / 1000) * 1000;
}

export function insure(state: GameState, id: string): string | null {
  const c = clubhouse(state);
  const ps = state.players[id];
  if (ps?.team !== state.userTeam) return "Only our own players.";
  if (c.policies[id]?.season === RULES.season) return "Already covered this season.";
  const base = insurableBase(state, id);
  if (base < insuranceFloor(state)) return "His salary is below what underwriters will cover.";
  if (ps.injury && ps.injury.returnDate > state.date) return "Underwriters won't write a policy on a player who is hurt.";
  if (state.date > RULES.keyDates.tradeDeadline) return "Policies can't be bought after the trade deadline.";
  const premium = premiumFor(state, id);
  c.policies[id] = { season: RULES.season, premium, base, weeksOut: 0, paid: 0 };
  post(state, "medical", -premium, `Injury insurance: ${PLAYER_BY_ID[id].name}`);
  clubNote(state, `Insured ${PLAYER_BY_ID[id].name}'s salary for ${(premium / 1e6).toFixed(2)}M.`);
  return null;
}

/** Each regular-season week: count the weeks out and pay claims after the three-week waiting period. */
function insuranceWeekly(state: GameState): void {
  const c = clubhouse(state);
  for (const [id, pol] of Object.entries(c.policies)) {
    if (pol.season !== RULES.season) {
      delete c.policies[id];
      continue;
    }
    const ps = state.players[id];
    if (ps?.team !== state.userTeam) {
      delete c.policies[id];
      continue;
    }
    const inj = ps.injury;
    const out = !!inj && !inj.nonFootball && inj.returnDate > state.date && inj.date < state.date;
    pol.weeksOut = out ? pol.weeksOut + 1 : 0;
    if (pol.weeksOut <= 3) continue;
    const pay = Math.round(pol.base / 18 * 0.8);
    pol.paid += pay;
    post(state, "medical", pay, `Insurance claim: ${PLAYER_BY_ID[id].name}`);
    if (pol.weeksOut === 4) send(state, "business", "Risk management", `Insurance claim: ${PLAYER_BY_ID[id].name}`,
      `${PLAYER_BY_ID[id].name} has now missed more than three straight weeks, so his disability policy starts paying: about ${(pay / 1e6).toFixed(2)}M for each further week he's out.`);
  }
}

export function medicalDaily(state: GameState): void {
  injuriesDaily(state);
  protocolReviews(state);
  const K = RULES.keyDates;
  if (weekday(state.date) === "Tuesday" && state.date > K.regularSeasonStart && state.date <= addDays(K.regularSeasonEnd, 2)) insuranceWeekly(state);
}
