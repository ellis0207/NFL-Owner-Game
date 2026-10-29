/**
 * The spring program: voluntary OTA practices, the mandatory minicamp, who
 * shows up and why, and the injuries of the offseason (in practice and away
 * from the building).
 */
import { changeMorale, priorities } from "./agents";
import { addReps, program } from "./camp";
import { teamPlayerIds, yearsExpIn } from "./cap";
import { dealOf, dealYearsLeft, leagueYear } from "./contracts";
import { addDays, ageOn, shortDate, weekday } from "./dates";
import { payCash } from "./finance";
import { money, news, send } from "./inbox";
import { injure, injuryRisk, isHurt } from "./injuries";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { capScale, marketPrice } from "./market";
import { extensionEligibility, STARTERS } from "./negotiation";
import { rngFor } from "./rng";
import { depthChart } from "./roster";
import type { AgendaItem } from "./season";
import { outLabel, veteranReportDate } from "./season";
import { teamStaff } from "./staff";
import type { GameState, OwnerDecision, Position, SpringPlan } from "./types";

const KEY = RULES.keyDates;

/** The CBA's fines for skipping all three days of mandatory minicamp (about $105K in 2026). */
const MINICAMP_FINE = 105_000;

export function isOtaDay(date: string): boolean {
  const start = KEY.otasStart;
  if (!start || date < start || date >= addDays(start, 21)) return false;
  return ["Tuesday", "Wednesday", "Thursday"].includes(weekday(date));
}

export function isMinicampDay(date: string): boolean {
  const start = KEY.minicampStart;
  return !!start && date >= start && date < addDays(start, 3);
}

/** The owner's calendar between the draft and camp. */
export function springItem(date: string): AgendaItem | null {
  if (isOtaDay(date)) return { id: "practice:ota", kind: "practice", action: "practice", title: "OTA practice (voluntary)", detail: "No pads and no live contact: installs, individual drills and seven-on-sevens." };
  if (isMinicampDay(date)) return { id: "practice:minicamp", kind: "practice", action: "practice", title: "Mandatory minicamp", detail: "Every player under contract is expected; skipping it draws CBA fines." };
  if (KEY.otasStart && date < KEY.otasStart) return { id: "meeting:offseason", kind: "meeting", title: "Offseason program", detail: "Strength and conditioning and classroom work. The rookies are learning the playbook." };
  if (KEY.minicampStart && date < KEY.minicampStart) return { id: "meeting:offseason", kind: "meeting", title: "Offseason program", detail: "No practice today. OTAs run Tuesday to Thursday." };
  return null;
}

/** The owner's look at today's spring practice. */
export function springPracticeOutcome(state: GameState): string {
  ensurePlans(state);
  const team = state.userTeam;
  const p = program(state);
  const ids = rostered(state, team);
  const minicamp = isMinicampDay(state.date);
  const missing = ids.filter((id) => !attends(state, id, minicamp));
  const named = missing.filter((id) => p.spring[id]?.reason === "contract" || isStarter(state, id)).slice(0, 4);
  const head = minicamp
    ? missing.length ? `${ids.length - missing.length} of ${ids.length} at minicamp.` : "Full attendance at minicamp."
    : `${ids.length - missing.length} of ${ids.length} at the voluntary session.`;
  return head + (named.length ? ` Not here: ${named.map((id) => `${PLAYER_BY_ID[id].name} (${why(p.spring[id])})`).join(", ")}.` : "");
}

function why(plan: SpringPlan | undefined): string {
  return plan?.reason === "contract" ? "contract" : plan?.reason === "training" ? "working out on his own" : plan?.reason === "personal" ? "excused, personal" : "rehab";
}

function rostered(state: GameState, team: string): string[] {
  return teamPlayerIds(state, team).filter((id) => ["camp", "active"].includes(state.players[id].status));
}

const starterCache = new WeakMap<GameState, { date: string; ids: Set<string> }>();

function isStarter(state: GameState, id: string): boolean {
  let hit = starterCache.get(state);
  if (!hit || hit.date !== state.date) {
    const ids = new Set<string>();
    for (const t of TEAMS) {
      for (const [pos, list] of Object.entries(depthChart(state, t.id))) list.slice(0, STARTERS[pos as Position] ?? 1).forEach((x) => ids.add(x));
    }
    hit = { date: state.date, ids };
    starterCache.set(state, hit);
  }
  return hit.ids.has(id);
}

/**
 * How unhappy a player is with his deal, 0 to 1: a starter well below his
 * market price and eligible for an extension. The same players are the ones
 * who hold out of camp later.
 */
export function contractGripe(state: GameState, id: string): number {
  const ps = state.players[id];
  if (!ps.team || !isStarter(state, id)) return 0;
  const deal = dealOf(state, id);
  if (!deal || deal.kind === "minimum" || !extensionEligibility(state, id).ok) return 0;
  const year = leagueYear(state.date);
  if (leagueYear(deal.signed) >= year) return 0;
  const left = dealYearsLeft(deal, year);
  const price = marketPrice(state, id, year + left);
  if (price.apy < 12_000_000 * capScale(state, year)) return 0;
  const underpaid = price.apy / Math.max(1, deal.apy);
  return underpaid < 1.5 ? 0 : Math.min(1, 0.2 + (underpaid - 1.5) * 0.4);
}

function planFor(state: GameState, id: string): SpringPlan {
  const rng = rngFor(state.seed, `spring:${RULES.season}:${id}`);
  const exp = yearsExpIn(id, leagueYear(state.date));
  if (exp === 0) return { plan: "full" };
  const pr = priorities(id);
  const gripe = contractGripe(state, id);
  if (gripe > 0 && 0.5 * pr.money + 0.5 * pr.ego + gripe - 0.3 * pr.loyalty > 0.75 && rng() < 0.5) return { plan: "away", reason: "contract" };
  const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 25;
  // Established veterans often train on their own in the voluntary weeks.
  if (exp >= 7 && age >= 29 && rng() < 0.35) return { plan: rng() < 0.5 ? "away" : "most", reason: "training" };
  if ((state.players[id].morale ?? 70) < 40 && rng() < 0.4) return { plan: "most", reason: "personal" };
  if (rng() < 0.04) return { plan: "most", reason: "personal" };
  return { plan: "full" };
}

/** Attendance plans for every player, made once when OTAs open. Only the exceptions are stored. */
function ensurePlans(state: GameState): void {
  const p = program(state);
  if (p.springSet) return;
  p.springSet = true;
  for (const { id: team } of TEAMS) {
    for (const id of rostered(state, team)) {
      const plan = planFor(state, id);
      if (plan.plan !== "full") p.spring[id] = plan;
    }
  }
}

/** Whether a player is at today's session (deterministic, so the owner's look and the day's work agree). */
function attends(state: GameState, id: string, minicamp: boolean): boolean {
  if (isHurt(state, id)) return false;
  const plan = state.program?.spring[id];
  if (minicamp) return !plan?.minicamp || plan.minicamp === "present";
  if (!plan) return true;
  if (plan.plan === "away") return false;
  return rngFor(state.seed, `ota:${state.date}:${id}`)() < 0.6;
}

// ---- The days ----

function otasOpen(state: GameState): void {
  ensurePlans(state);
  const p = program(state);
  for (const [id, plan] of Object.entries(p.spring)) {
    const ps = state.players[id];
    if (plan.reason !== "contract" || !ps?.team || !isStarter(state, id)) continue;
    news(state, `${PLAYER_BY_ID[id].name} is not attending ${teamLabel(ps.team)} OTAs while he seeks a new contract`);
  }
  const team = state.userTeam;
  const away = rostered(state, team).filter((id) => p.spring[id]?.plan === "away");
  const inst = state.staff?.install[team];
  const installing = (["offense", "defense"] as const).filter((s) => (inst?.[s] ?? 1) < 1);
  send(state, "staff", hcLine(state), "OTAs start today",
    "The voluntary practices run Tuesday to Thursday for the next three weeks, then mandatory minicamp on " +
    `${shortDate(KEY.minicampStart)}. ` +
    (away.length ? `Not expected: ${away.map((id) => `${PLAYER_BY_ID[id].name} (${why(p.spring[id])})`).join(", ")}. ` : "We expect just about everyone. ") +
    (installing.length ? `This spring matters more than usual: we're still installing the new ${installing.join(" and the new ")}, and every rep helps.` : ""));
}

function practiceDay(state: GameState, minicamp: boolean): void {
  for (const { id: team } of TEAMS) {
    const ids = rostered(state, team);
    let here = 0;
    for (const id of ids) {
      if (!attends(state, id, minicamp)) continue;
      here++;
      addReps(state, team, id, minicamp ? 0.6 : 0.4);
    }
    // A new scheme goes in during the spring, as fast as the players are there to learn it.
    const inst = state.staff?.install[team];
    if (inst && ids.length) {
      const share = here / ids.length;
      for (const side of ["offense", "defense"] as const) {
        if (inst[side] < 1) inst[side] = Math.min(1, Math.round((inst[side] + (minicamp ? 0.016 : 0.012) * share) * 10000) / 10000);
      }
    }
    // Non-contact work, but hamstrings and the occasional Achilles still go.
    const rng = rngFor(state.seed, `springhurt:${state.date}:${team}`);
    if (rng() < 0.025) {
      const pool = ids.filter((id) => attends(state, id, minicamp));
      const id = pool[Math.floor(rng() * pool.length)];
      if (id && rng() < Math.min(1, 0.7 * injuryRisk(state, id, team))) hurt(state, team, id, rng, minicamp ? "at minicamp" : "at an OTA practice");
    }
  }
}

function hurt(state: GameState, team: string, id: string, rng: () => number, where: string): void {
  const { injury } = injure(state, id, team, rng, true);
  if (team !== state.userTeam) return;
  const p = PLAYER_BY_ID[id];
  const trn = teamStaff(team).TRN?.name ?? "Head athletic trainer";
  send(state, "staff", `${trn}, head athletic trainer`, `${p.name} hurt ${where}`,
    `${p.name} (${p.position}) has ${/^[aeiou]/i.test(injury.type) ? "an" : "a"} ${injury.type.toLowerCase()}. We expect him to be ${outLabel(state.date, injury.returnDate, injury.seasonEnding)}.`);
}

/** Minicamp is mandatory: players with a contract fight decide whether to stay away anyway. */
function minicampOpens(state: GameState): void {
  ensurePlans(state);
  const p = program(state);
  for (const [id, plan] of Object.entries(p.spring)) {
    const ps = state.players[id];
    if (!ps?.team || plan.reason !== "contract") continue;
    const pr = priorities(id);
    const rng = rngFor(state.seed, `minicamp:${RULES.season}:${id}`);
    if (rng() > 0.05 + 0.3 * pr.ego + 0.3 * contractGripe(state, id) - 0.3 * pr.loyalty) {
      plan.minicamp = "present";
      continue;
    }
    plan.minicamp = "absent";
    news(state, `${PLAYER_BY_ID[id].name} skips ${teamLabel(ps.team)} mandatory minicamp`);
    if (ps.team === state.userTeam) {
      const d: OwnerDecision = {
        id: `minicamp:${RULES.season}:${id}`, date: state.date, expires: addDays(KEY.minicampStart, 3), player: id, kind: "minicamp",
        title: `${PLAYER_BY_ID[id].name} skipped minicamp`,
        body: `${PLAYER_BY_ID[id].name} didn't report for mandatory minicamp; his camp says it's about his contract. ` +
          `The CBA lets us fine him up to ${money(MINICAMP_FINE)} for missing all three days. The GM will fine him unless you excuse it.`,
        options: [{ key: "fine", label: `Fine him (${money(MINICAMP_FINE)})` }, { key: "excuse", label: "Excuse the absence" }],
        fallback: "fine",
      };
      p.decisions.push(d);
      send(state, "staff", "General Manager", d.title, `${d.body} Decide on the Camp page.`);
    } else settleMinicamp(state, id, "fine");
  }
}

/** Fine or excuse a minicamp absence. */
export function settleMinicamp(state: GameState, id: string, choice: "fine" | "excuse"): string {
  const plan = program(state).spring[id];
  const team = state.players[id]?.team;
  if (!plan || !team) return "";
  plan.minicamp = choice === "fine" ? "fined" : "excused";
  if (choice === "fine") {
    payCash(state, team, -MINICAMP_FINE);
    changeMorale(state, id, -6);
    program(state).incidents.push({ date: state.date, team, player: id, kind: "minicamp", fine: MINICAMP_FINE, text: `Fined ${money(MINICAMP_FINE)} for skipping mandatory minicamp` });
    return `${PLAYER_BY_ID[id].name} was fined ${money(MINICAMP_FINE)}. His agent called it petty; the locker room noticed the rules apply to everyone.`;
  }
  changeMorale(state, id, 4);
  return `The absence is excused. ${PLAYER_BY_ID[id].name}'s camp appreciated it.`;
}

/** The spring is over: the young players who were there every day are ahead of the ones who weren't. */
function springEnds(state: GameState): void {
  const p = program(state);
  for (const { id: team } of TEAMS) {
    for (const id of rostered(state, team)) {
      if (yearsExpIn(id, leagueYear(state.date)) > 2) continue;
      const plan = p.spring[id];
      const ps = state.players[id];
      ps.dev = Math.round(((ps.dev ?? 0) + (!plan ? 0.15 : plan.plan === "away" ? -0.25 : 0.05)) * 100) / 100;
    }
  }
  const team = state.userTeam;
  const ids = rostered(state, team);
  const reps = (id: string) => p.reps[`${team}:${id}`] ?? 0;
  const rookies = ids.filter((id) => PLAYER_BY_ID[id].rookieYear === RULES.season && reps(id) >= 3);
  const absent = ids.filter((id) => p.spring[id]?.plan === "away");
  send(state, "staff", hcLine(state), "The spring wraps up",
    `That's the end of the offseason program. Players are off until camp opens on ${shortDate(veteranReportDate(team))}. ` +
    (rookies.length ? `The rookies were here every day and have a head start on the playbook. ` : "") +
    (absent.length ? `We'll have catching up to do with ${absent.map((id) => PLAYER_BY_ID[id].name).join(", ")}.` : "Attendance was as good as I could have asked for."));
}

/** Away from the building, players train on their own, and some of them get hurt doing it. */
function summerInjuries(state: GameState): void {
  for (const { id: team } of TEAMS) {
    const rng = rngFor(state.seed, `summerhurt:${state.date}:${team}`);
    if (rng() > 0.0025) continue;
    const ids = rostered(state, team).filter((id) => !isHurt(state, id));
    const id = ids[Math.floor(rng() * ids.length)];
    if (id) hurt(state, team, id, rng, "working out on his own");
  }
}

export function springDaily(state: GameState): void {
  const date = state.date;
  if (!KEY.otasStart || !KEY.minicampStart) return;
  if (date === KEY.otasStart) otasOpen(state);
  if (date === KEY.minicampStart) minicampOpens(state);
  if (isOtaDay(date)) practiceDay(state, false);
  else if (isMinicampDay(date)) practiceDay(state, true);
  if (date === addDays(KEY.minicampStart, 2)) springEnds(state);
  if (date > addDays(KEY.minicampStart, 2) && date < veteranReportDate(state.userTeam)) summerInjuries(state);
}

function hcLine(state: GameState): string {
  const hc = teamStaff(state.userTeam).HC;
  return hc ? `${hc.name}, head coach` : "Head Coach";
}
