// The coaching carousel: who gets fired when a season ends, the searches
// that follow, interviews, offers and the candidates' choices, and the
// staffs a new head coach builds. Every team runs it; the owner runs ours.
//
// The calendar follows the league's: other teams' coaches can't be
// interviewed during the regular season; from Black Monday on they can,
// those still in the playoffs only by video after the wild card round, and
// nobody joins a new team until his current team's season is over.
// Head coaching interviews can't be blocked; a lateral move to another
// coordinator job can, while the coach is under contract.
import { changeRapport } from "./owners";
import {
  canHold, COACH_ROLES, CONCERN_TAGS, coachAge, install, knownFor, newHireFromWithin, quality, recordTeamSeason, reputation, retire, retiresNow,
  ROLE_NAME, salaryFor, staff, vacate,
} from "./coaches";
import { COLLEGE_TEAM } from "./collegeData";
import { addDays, daysBetween, weekday } from "./dates";
import { stillPlaying } from "./freeagency";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, teamLabel } from "./league";
import { gaussian, rngFor } from "./rng";
import { clearStaffCaches, staffEffects, teamStaff } from "./staff";
import { MARKETS } from "./stadiums";
import { standings } from "./standings";
import { outlook } from "./trades";
import type { Coach, DefenseScheme, GameState, InterviewReport, OffenseScheme, StaffOffer, StaffProposal, StaffRole, StaffSearch } from "./types";

const KEY = RULES.keyDates;
const TOP: StaffRole[] = ["HC", "GM"];
const SUPPORT: StaffRole[] = ["TRN", "PRO", "COL"];

const log = (state: GameState, team: string, text: string) => {
  const s = staff(state);
  s.log.unshift({ date: state.date, team, text });
  if (s.log.length > 400) s.log.length = 400;
};

function holder(state: GameState, team: string, role: StaffRole): Coach | undefined {
  return Object.values(staff(state).people).find((c) => c.team === team && c.role === role);
}

function person(state: GameState, id: string): Coach {
  return staff(state).people[id];
}

function gmName(state: GameState): string {
  const gm = teamStaff(state.userTeam).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

function hcName(state: GameState, team = state.userTeam): string {
  const hc = holder(state, team, "HC");
  return hc ? `${hc.name}, head coach` : "Head Coach";
}

/** The season is in its regular weeks: no outside interviews. */
function inSeason(state: GameState): boolean {
  return state.date >= KEY.regularSeasonStart && state.date <= KEY.regularSeasonEnd;
}

/** Hires from the end of the regular season on are for next season. */
function nextSeason(state: GameState): number {
  return state.date > KEY.regularSeasonEnd ? RULES.season + 1 : RULES.season;
}

// ---- How attractive a job is ----

/** A job's pull on candidates, 0-1: the roster, the market, a stable owner and room to spend. */
export function jobAppeal(state: GameState, team: string): number {
  const wp = outlook(state)[team] ?? 0.5;
  const market = Math.max(0, Math.min(1, (MARKETS[team].target - 700_000_000) / 400_000_000));
  const recent = staff(state).log.filter((l) => l.team === team && /fire/.test(l.text) && daysBetween(l.date, state.date) < 4 * 365).length;
  const stable = Math.max(0, 1 - recent * 0.2);
  return Math.max(0.05, Math.min(1, 0.5 * (0.5 + (wp - 0.5) * 1.6) + 0.25 * market + 0.25 * stable));
}

/** What a person would ask to be paid for a job. */
export function askFor(state: GameState, id: string, role: StaffRole): number {
  const c = person(state, id);
  const rep = reputation(state, c);
  const ag = c.agent ? 1.05 : 1;
  // A first-time head coach or GM takes less than an established one.
  const first = (role === "HC" || role === "GM") && !c.record.some((r) => r.role === role) ? 0.85 : 1;
  return Math.round((salaryFor(role, rep, nextSeason(state)) * ag * first) / 50_000) * 50_000;
}

// ---- Availability ----

export type Availability = { ok: boolean; why?: string; pending?: boolean };

/** Whether a team can talk to a person about a job today. */
export function available(state: GameState, team: string, id: string, role: StaffRole): Availability {
  const c = person(state, id);
  if (!c || c.retired) return { ok: false, why: "Retired." };
  if (!canHold(c, role)) return { ok: false, why: `Not a ${ROLE_NAME[role]} candidate.` };
  if (c.record.some((r) => r.team === team) && c.fired !== undefined && c.fired >= RULES.season - 2 && !c.team) {
    const last = c.record[c.record.length - 1];
    if (last?.team === team) return { ok: false, why: "We just let this person go." };
  }
  if (role !== "HC" && c.job?.kind === "college" && c.job.title === "head coach") return { ok: false, why: "A college head coach won't take a coordinator job." };
  if (c.team === team && c.role === role) return { ok: false, why: "Already in the job." };
  // Inside a staff, people only move up: a coordinator to head coach, a scouting director to GM.
  if (c.team === team && c.role && role !== "HC" && role !== "GM") return { ok: false, why: `Already our ${ROLE_NAME[c.role]}.` };
  const s = staff(state);
  if (s.searches.some((x) => x.agreed?.id === id)) return { ok: false, why: "Has agreed to another job." };
  const employer = c.team ?? (c.job && c.job.kind !== "college" ? c.job.team : null);
  if (employer && employer !== team) {
    if (inSeason(state)) return { ok: false, why: "Teams can't interview other teams' staff during the season." };
    // Someone who just took a job this hiring season stays put.
    if (c.role && c.hiredYear === nextSeason(state) && state.date > KEY.regularSeasonEnd) return { ok: false, why: `Just took the ${teamLabel(employer)} ${ROLE_NAME[c.role]} job.` };
    // Already in the top job somewhere: not leaving for the same job.
    if (c.role === "HC" || c.role === "GM") return { ok: false, why: `Is the ${teamLabel(c.team!)} ${ROLE_NAME[c.role]}.` };
    const promotion = role === "HC" || role === "GM" || !c.role;
    if (!promotion && c.contract && c.contract.through >= nextSeason(state)) {
      return { ok: false, why: `Under contract with the ${teamLabel(employer)}, who won't allow a move to the same job.` };
    }
    if (stillPlaying(state, employer)) {
      if (state.date < addDays(KEY.wildCardWeekend, 2)) return { ok: false, why: `The ${teamLabel(employer)} are in the playoffs: interviews open after the wild card round.` };
      return { ok: true, pending: true };
    }
  }
  if (c.job?.kind === "college" && state.date < KEY.regularSeasonEnd && state.date > `${RULES.season}-08-01`) {
    return { ok: false, why: "In the middle of the college season." };
  }
  return { ok: true };
}

/** Everyone a team could consider for a job, best known names first. */
export function candidates(state: GameState, team: string, role: StaffRole): string[] {
  const s = staff(state);
  return Object.values(s.people)
    .filter((c) => !c.retired && canHold(c, role) && !(c.team === team && c.role === role))
    .filter((c) => c.role !== "HC" && c.role !== "GM")
    .filter((c) => {
      // Head coaches come from coordinators, the best assistants, college head coaches and the out of work.
      if (role === "HC") return c.role === "OC" || c.role === "DC" || c.role === "STC" || (c.job?.kind === "college" && c.job.title === "head coach") || (!c.team && !c.job) || reputation(state, c) >= 66;
      if (role === "GM") return c.role === "PRO" || c.role === "COL" || c.job?.kind === "front" || (!c.team && !c.job);
      return true;
    })
    .filter((c) => {
      // Drop anyone who is off the market for this cycle; keep those only blocked until the season ends.
      const a = available(state, team, c.id, role);
      return a.ok || /season|playoffs/.test(a.why ?? "");
    })
    .sort((a, b) => reputation(state, b) - reputation(state, a))
    .map((c) => c.id);
}

// ---- Searches ----

export function openSearch(state: GameState, team: string, role: StaffRole, reason: StaffSearch["reason"], previous?: string): StaffSearch {
  const s = staff(state);
  const open = s.searches.find((x) => x.team === team && x.role === role && !x.agreed);
  if (open) return open;
  const search: StaffSearch = { team, role, opened: state.date, reason, interviews: {}, ...(previous ? { previous } : {}) };
  s.searches.push(search);
  return search;
}

export function openSearches(state: GameState, team?: string): StaffSearch[] {
  return staff(state).searches.filter((x) => !x.agreed && (!team || x.team === team));
}

/** Who a team sees as the best fit, through its own decision makers' eyes (engine only). */
function teamView(state: GameState, team: string, id: string, role: StaffRole): number {
  const c = person(state, id);
  const deciders = role === "HC" || role === "GM" ? 62 : staffEffects(team).coachEval;
  const sd = Math.max(2.5, (100 - deciders) / 6);
  const z = gaussian(rngFor(state.seed, `view:${team}:${id}:${role}`));
  const view = quality(c, role) + z * sd;
  // NFL front offices lean toward people who've done it in the league.
  const college = c.job?.kind === "college" ? -4 : 0;
  return 0.55 * view + 0.45 * reputation(state, c) + networkBonus(state, team, c, role) + college;
}

/** Coaches hire people they know: their own tree, and people who share their scheme. */
function networkBonus(state: GameState, team: string, c: Coach, role: StaffRole): number {
  if (role === "HC" || role === "GM") return 0;
  const boss = role === "TRN" || role === "PRO" || role === "COL" ? holder(state, team, "GM") : holder(state, team, "HC");
  if (!boss) return 0;
  let b = 0;
  if (c.mentor === boss.id || boss.mentor === c.id) b += 4;
  if (c.mentor && c.mentor === boss.mentor) b += 2;
  if (c.record.some((r) => boss.record.some((q) => q.team === r.team && q.season === r.season))) b += 2;
  if (role === "OC" && boss.side === "offense" && c.scheme === boss.scheme) b += 3;
  if (role === "DC" && boss.side === "defense" && c.scheme === boss.scheme) b += 3;
  return b;
}

// ---- Interviews ----

function report(state: GameState, team: string, id: string, role: StaffRole, rounds: number): InterviewReport {
  const c = person(state, id);
  const sd = rounds >= 2 ? 3 : 5;
  const z = gaussian(rngFor(state.seed, `interview:${team}:${id}:${rounds}`));
  const view = quality(c, role) + z * sd;
  const impression = Math.max(1, Math.min(5, Math.round((view - 58) / 6)));
  const notes = knownFor(state, c, rounds, `owner:${team}`);
  if (role === "HC" && c.side) {
    const scheme = c.scheme ? schemeName(c.side, c.scheme) : null;
    if (scheme) notes.push(`Would run ${scheme}`);
    notes.push(z + (c.hidden.playCalling ?? 60) >= 72 ? `Plans to call the ${c.side} as head coach` : "Would hand play calling to a coordinator");
  }
  if (coachAge(c) >= 64) notes.push("Questions about how many years are left in the tank");
  if (!c.record.length && !c.team) notes.push("Never held this kind of job in the NFL");
  const plan = role === "HC" ? staffPlan(state, team, c) : [];
  return { date: state.date, notes, plan, impression, rounds };
}

function schemeName(side: "offense" | "defense", scheme: OffenseScheme | DefenseScheme): string {
  const label: Record<string, string> = {
    wideZone: "a Shanahan wide-zone offense", mcvay: "a McVay-style offense", westCoast: "a West Coast offense",
    erhardtPerkins: "an Erhardt-Perkins offense", spread: "a spread and RPO offense", vertical: "a vertical passing offense",
    gapMotion: "a gap-and-motion offense", fangio: "a Fangio two-high defense", cover3: "a Seattle Cover 3 defense",
    pressure: "a blitz-heavy pressure defense", multiple: "a game-plan multiple defense", macdonald: "a Macdonald-style defense",
  };
  void side;
  return label[scheme] ?? scheme;
}

/** The coordinators a head coach candidate would bring: names from his network. */
function staffPlan(state: GameState, team: string, hc: Coach): string[] {
  const out: string[] = [];
  for (const role of ["OC", "DC"] as StaffRole[]) {
    if (hc.side === "offense" && role === "OC" && (hc.hidden.playCalling ?? 0) >= 75) continue;
    const pool = Object.values(staff(state).people).filter((c) => !c.retired && canHold(c, role) && c.id !== hc.id && (c.mentor === hc.id || hc.mentor === c.id || (c.mentor && c.mentor === hc.mentor)));
    const best = pool.sort((a, b) => reputation(state, b) - reputation(state, a))[0];
    if (best) out.push(best.id);
  }
  void team;
  return out;
}

/** Interest in talking: the best names can pass on a job they don't like. */
function willTalk(state: GameState, team: string, id: string, role: StaffRole): boolean {
  const c = person(state, id);
  const rep = reputation(state, c);
  const appeal = jobAppeal(state, team);
  const p = role === "HC" || role === "GM" ? Math.min(0.97, 0.55 + appeal * 0.6 - Math.max(0, rep - 70) * 0.02) : 0.95;
  return rngFor(state.seed, `talk:${team}:${id}:${role}`)() < p;
}

/** The owner asks to interview someone. The interview takes place in a day or two. */
export function requestInterview(state: GameState, role: StaffRole, id: string): { ok: boolean; text: string } {
  const team = state.userTeam;
  const search = openSearches(state, team).find((x) => x.role === role);
  if (!search) return { ok: false, text: "There's no open search for that job." };
  const c = person(state, id);
  const prev = search.interviews[id];
  if (prev && !prev.report) return { ok: false, text: "That interview is already scheduled." };
  if (prev?.declined) return { ok: false, text: `${c.name} isn't interested in the job.` };
  const a = available(state, team, id, role);
  if (!a.ok) return { ok: false, text: a.why! };
  if (!prev && !willTalk(state, team, id, role)) {
    search.interviews[id] = { date: state.date, declined: true };
    return { ok: false, text: `${c.name}'s representatives say ${c.name.split(" ")[0]} will pass on interviewing for this job.` };
  }
  const days = a.pending ? 1 : 1 + Math.floor(rngFor(state.seed, `int-day:${id}:${state.date}`)() * 2);
  search.interviews[id] = { date: addDays(state.date, days), ...(prev?.report ? { report: prev.report } : {}) };
  if (prev?.report) (search.interviews[id] as { second?: boolean } & typeof prev).second = true;
  return { ok: true, text: `${prev?.report ? "Second interview" : "Interview"} with ${c.name} set for ${addDays(state.date, days)}${a.pending ? " (by video: the team is still playing)" : ""}.` };
}

function runInterviews(state: GameState): void {
  for (const search of openSearches(state)) {
    for (const [id, iv] of Object.entries(search.interviews)) {
      if (iv.declined || iv.date !== state.date) continue;
      const rounds = (iv.report?.rounds ?? 0) + 1;
      iv.report = report(state, search.team, id, search.role, rounds);
      if (search.team === state.userTeam) {
        const c = person(state, id);
        send(state, "staff", gmName(state), `Interview: ${c.name}`,
          `We met with ${c.name} (${ROLE_NAME[search.role]} job). Notes are on the Staff page under the search.`);
      } else if (search.role === "HC" && person(state, id).team === state.userTeam) {
        const c = person(state, id);
        send(state, "staff", gmName(state), `${teamLabel(search.team)} interview ${c.name}`,
          `The ${teamLabel(search.team)} interviewed our ${ROLE_NAME[c.role!]} ${c.name} for their head coaching job. League rules don't let us block a head coaching interview.`);
      }
    }
  }
}

// ---- Offers and decisions ----

export function makeOffer(state: GameState, role: StaffRole, id: string, years: number, salary: number): { ok: boolean; text: string } {
  const team = state.userTeam;
  const search = openSearches(state, team).find((x) => x.role === role);
  if (!search) return { ok: false, text: "There's no open search for that job." };
  const a = available(state, team, id, role);
  if (!a.ok) return { ok: false, text: a.why! };
  if (search.interviews[id]?.declined) return { ok: false, text: `${person(state, id).name} isn't interested in the job.` };
  if ((role === "HC" || role === "GM") && !search.interviews[id]?.report) return { ok: false, text: "Interview the candidate first." };
  const s = staff(state);
  s.offers = s.offers.filter((o) => !(o.team === team && o.role === role));
  s.offers.push({ team, role, id, years, salary, date: state.date });
  const c = person(state, id);
  return { ok: true, text: `Offer sent to ${c.name}: ${years} years at ${money(salary)} a year. Expect an answer in a day or two.` };
}

/** How a candidate weighs an offer (engine only): the money against the ask, the job, and the team. */
function offerValue(state: GameState, o: StaffOffer): number {
  const ask = askFor(state, o.id, o.role);
  const money = Math.max(-0.6, Math.min(0.5, (o.salary / Math.max(1, ask) - 1) * 1.4));
  const years = (o.years - 3) * 0.04;
  const level = o.role === "HC" ? 1 : o.role === "GM" ? 0.9 : o.role === "OC" || o.role === "DC" ? 0.45 : 0.3;
  return level + jobAppeal(state, o.team) * 0.6 + money + years;
}

/** What a candidate gives up by leaving: his current job, or a college program. */
function stayValue(state: GameState, c: Coach, role: StaffRole): number {
  if (c.job?.kind === "college" && c.job.title === "head coach") return role === "HC" ? 1.25 + gaussian(rngFor(state.seed, `stay:${c.id}:${RULES.season}`)) * 0.3 : 3;
  if (c.role === "OC" || c.role === "DC") return role === "HC" || role === "GM" ? 0.3 : c.contract && c.contract.through >= nextSeason(state) ? 2 : 0.6;
  if (c.role) return 0.4;
  // A head coach or GM who was just let go waits for another top job before taking a step down.
  const wasTop = c.record.slice(-2).some((r) => r.role === "HC" || r.role === "GM");
  if (!c.job && wasTop && role !== "HC" && role !== "GM" && state.date < addDays(KEY.superBowl, -4)) return 1.6;
  return c.job ? 0.25 : -0.5;
}

function decideOffers(state: GameState): void {
  const s = staff(state);
  const byPerson = new Map<string, StaffOffer[]>();
  for (const o of s.offers) (byPerson.get(o.id) ?? byPerson.set(o.id, []).get(o.id)!).push(o);
  for (const [id, offers] of byPerson) {
    // Candidates take a day or two, longer if another team might call.
    const ready = offers.filter((o) => daysBetween(o.date, state.date) >= 1);
    if (!ready.length) continue;
    const c = person(state, id);
    const oldest = Math.max(...offers.map((o) => daysBetween(o.date, state.date)));
    if (oldest < 2 && offers.length === 1 && rngFor(state.seed, `wait:${id}:${state.date}`)() < 0.5) continue;
    const scored = offers.map((o) => ({ o, v: offerValue(state, o) })).sort((a, b) => b.v - a.v);
    const best = scored[0];
    const stay = stayValue(state, c, best.o.role);
    const accepted = best.v > stay && available(state, best.o.team, id, best.o.role).ok;
    for (const { o } of scored) {
      if (accepted && o === best.o) continue;
      // A no is a no for this search.
      const search = openSearches(state, o.team).find((x) => x.role === o.role);
      if (search) search.interviews[id] = { ...(search.interviews[id] ?? { date: state.date }), declined: true };
      if (o.team === state.userTeam) {
        send(state, "staff", gmName(state), `${c.name} turns us down`,
          accepted ? `${c.name} took the ${teamLabel(best.o.team)} ${ROLE_NAME[best.o.role]} job instead.` : `${c.name} decided to stay put.`);
      }
    }
    s.offers = s.offers.filter((o) => o.id !== id);
    if (accepted) agree(state, best.o);
  }
}

/** Terms agreed: the hire is official now, or once the candidate's team is done playing. */
function agree(state: GameState, o: StaffOffer): void {
  const s = staff(state);
  const search = openSearch(state, o.team, o.role, "left");
  search.agreed = { id: o.id, date: state.date };
  search.terms = { years: o.years, salary: o.salary };
  // Nobody else gets him now.
  s.offers = s.offers.filter((x) => !(x.team === o.team && x.role === o.role));
  const c = person(state, o.id);
  const employer = c.team ?? (c.job && c.job.kind !== "college" ? c.job.team : null);
  if (employer && employer !== o.team && stillPlaying(state, employer)) {
    if (o.team === state.userTeam || employer === state.userTeam) {
      send(state, "staff", gmName(state), `${c.name} agrees to terms`,
        `${c.name} has agreed to become the ${teamLabel(o.team)} ${ROLE_NAME[o.role]}. It becomes official when the ${teamLabel(employer)} season is over.`);
    }
    return;
  }
  finalize(state, search);
}

function finalize(state: GameState, search: StaffSearch): void {
  const s = staff(state);
  const id = search.agreed!.id;
  const terms = search.terms ?? { years: 3, salary: askFor(state, id, search.role) };
  const c = person(state, id);
  const from = c.team && c.role ? { team: c.team, role: c.role } : null;
  const fromLabel = from ? `${teamLabel(from.team)} ${ROLE_NAME[from.role]}` : c.job?.kind === "college" ? `${c.job.title} at ${collegeName(c.job.team)}` : c.job ? `${teamLabel(c.job.team)} ${c.job.title}` : null;
  // Whoever had the job is out (an interim goes back to his old job, or leaves).
  const old = holder(state, search.team, search.role);
  if (old && old.id !== id) {
    if (search.interim === old.id) returnInterim(state, search.team, old);
    else fire(state, old.id, true);
  }
  install(state, id, search.team, search.role, terms.years, terms.salary);
  // Hiring another club's coach away is legal, and that club's owner remembers it.
  if (from && search.team === state.userTeam && from.team !== state.userTeam) changeRapport(state, from.team, -6);
  s.searches = s.searches.filter((x) => x !== search);
  if (from) openSearch(state, from.team, from.role, "promoted", id);
  const text = `The ${teamLabel(search.team)} hire ${c.name} as ${ROLE_NAME[search.role]}${fromLabel ? ` (from ${fromLabel})` : ""}`;
  log(state, search.team, text);
  if (search.role === "HC" || search.role === "GM" || search.team === state.userTeam || from?.team === state.userTeam) news(state, text);
  if (search.role === "HC") newHeadCoach(state, search.team, id);
  else afterHire(state, search.team, search.role, id);
  if (from?.team === state.userTeam) {
    send(state, "staff", gmName(state), `${c.name} leaves for the ${teamLabel(search.team)}`,
      `${c.name} is the new ${teamLabel(search.team)} ${ROLE_NAME[search.role]}. ` +
      (COACH_ROLES.includes(from.role) && from.role !== "HC" ? `${hcName(state)} will bring you a replacement for approval.` : "We'll fill the job."));
  }
  if (search.team === state.userTeam) {
    send(state, "staff", gmName(state), `${c.name} is our ${ROLE_NAME[search.role]}`,
      `${c.name} signed a ${terms.years}-year deal at ${money(terms.salary)} a year.` +
      (search.role === "HC" ? " The new head coach will propose coordinators for your approval over the next few days." : ""));
  }
  clearStaffCaches();
}

function collegeName(id: string): string {
  return COLLEGE_TEAM[id]?.school ?? id;
}

/** The interim head coach goes back to the job he had. */
function returnInterim(state: GameState, team: string, c: Coach): void {
  const back = c.interimFrom ?? (c.side === "defense" ? "DC" : "OC");
  const sitting = holder(state, team, back);
  if (sitting && sitting.id !== c.id) {
    // The fill-in coordinator moves back down.
    vacate(state, sitting.id, "hired");
    sitting.job = { kind: "assistant", title: c.side === "defense" ? "defensive assistant" : "offensive assistant", team };
  }
  const salary = c.contract?.salary ?? 2_000_000;
  install(state, c.id, team, back, 2, salary);
  delete c.interimFrom;
}

// ---- Firing ----

/** Someone is let go: paid through the contract unless hired elsewhere, and the job opens. */
export function fire(state: GameState, id: string, quiet = false): void {
  const s = staff(state);
  const c = person(state, id);
  if (!c.team || !c.role) return;
  const team = c.team;
  const role = c.role;
  if (c.contract && c.contract.through >= nextSeason(state)) {
    s.owed.push({ id, team, salary: c.contract.salary, through: c.contract.through });
  }
  vacate(state, id, "fired");
  if (!quiet) {
    const text = `The ${teamLabel(team)} fire ${ROLE_NAME[role]} ${c.name}`;
    log(state, team, text);
    if (role === "HC" || role === "GM" || team === state.userTeam) news(state, text);
  }
  clearStaffCaches();
}

/** The owner lets someone go. */
export function fireStaff(state: GameState, id: string): { ok: boolean; text: string } {
  const c = person(state, id);
  if (!c || c.team !== state.userTeam || !c.role) return { ok: false, text: "Not on our staff." };
  const role = c.role;
  const owed = c.contract && c.contract.through >= nextSeason(state) ? c.contract.salary * (c.contract.through - nextSeason(state) + 1) : 0;
  fire(state, id);
  const team = state.userTeam;
  if (role === "HC" && inSeason(state)) {
    // An interim for the rest of the season: the coordinator players respond to best.
    const pool = [holder(state, team, "OC"), holder(state, team, "DC")].filter((x): x is Coach => !!x);
    const interim = pool.sort((a, b) => (b.hidden.leadership ?? 60) - (a.hidden.leadership ?? 60))[0];
    if (interim) {
      const from = interim.role!;
      install(state, interim.id, team, "HC", 1, interim.contract?.salary ?? 2_000_000);
      interim.interimFrom = from;
      const fill = newHireFromWithin(state, team, from);
      install(state, fill.id, team, from, 1, salaryFor(from, reputation(state, fill)));
      const search = openSearch(state, team, "HC", "fired", id);
      search.interim = interim.id;
      return { ok: true, text: `${c.name} is out. ${interim.name} is the interim head coach for the rest of the season; the search opens when it ends.` };
    }
  }
  if (role === "HC" || role === "GM") openSearch(state, team, role, "fired", id);
  else openOpening(state, team, role, "fired", id);
  return { ok: true, text: `${c.name} has been let go.${owed ? ` We still owe ${money(owed)} on the contract unless another team hires him.` : ""}` };
}

/** A coordinator or support job opens: the head coach (or GM) finds the next one. */
function openOpening(state: GameState, team: string, role: StaffRole, reason: StaffSearch["reason"], previous?: string): void {
  openSearch(state, team, role, reason, previous);
}

// ---- Extensions ----

export function extensionAsk(state: GameState, id: string): number {
  const c = person(state, id);
  return askFor(state, id, c.role ?? "OC");
}

export function extendStaff(state: GameState, id: string, years: number, salary: number): { ok: boolean; text: string } {
  const c = person(state, id);
  if (!c || c.team !== state.userTeam || !c.role || !c.contract) return { ok: false, text: "Not on our staff." };
  const ask = extensionAsk(state, id);
  const rng = rngFor(state.seed, `ext:${id}:${state.date}`);
  if (salary < ask * (0.92 + rng() * 0.06)) return { ok: false, text: `${c.name}'s agent says the number isn't there: they're looking for about ${money(ask)} a year.` };
  const start = Math.max(nextSeason(state), c.contract.through + 1);
  c.contract = { through: start + years - 1, salary: Math.max(salary, c.contract.salary) };
  log(state, c.team, `The ${teamLabel(c.team)} extend ${ROLE_NAME[c.role]} ${c.name} through ${c.contract.through}`);
  return { ok: true, text: `${c.name} is signed through ${c.contract.through} at ${money(c.contract.salary)} a year.` };
}

// ---- Proposals: the head coach builds his staff, the owner approves ----

export function proposals(state: GameState): StaffProposal[] {
  return staff(state).proposals.filter((p) => p.team === state.userTeam && p.status === "open");
}

/** The best name a head coach (or GM) can get for a job, by his own lights. */
function bossPick(state: GameState, team: string, role: StaffRole, skip: Set<string>): string | null {
  const pool = Object.values(staff(state).people)
    .filter((c) => !skip.has(c.id) && !c.retired && canHold(c, role) && !(c.team === team && c.role === role))
    .filter((c) => available(state, team, c.id, role).ok && !c.role?.match(/^(HC|GM)$/))
    .map((c) => ({ id: c.id, v: teamView(state, team, c.id, role) + gaussian(rngFor(state.seed, `pick:${team}:${c.id}:${state.date}`)) * 1.5 }))
    .sort((a, b) => b.v - a.v);
  return pool[0]?.id ?? null;
}

function propose(state: GameState, role: StaffRole, replaces?: string): void {
  const s = staff(state);
  const team = state.userTeam;
  const skip = new Set(s.proposals.filter((p) => p.team === team && p.role === role).map((p) => p.candidate));
  const id = bossPick(state, team, role, skip);
  if (!id) return;
  const c = person(state, id);
  const by = SUPPORT.includes(role) ? holder(state, team, "GM") : holder(state, team, "HC");
  const reasons: string[] = [];
  if (c.mentor && by && (c.mentor === by.id || by.mentor === c.id)) reasons.push("we've worked together and I trust this coach");
  const tags = knownFor(state, c, 1, `boss:${team}`).filter((t) => !CONCERN_TAGS.has(t));
  if (tags[0]) reasons.push(tags[0].toLowerCase());
  if (c.scheme && by?.scheme === c.scheme) reasons.push("fits what we want to do schematically");
  if (!reasons.length) reasons.push("the best fit available");
  const p: StaffProposal = {
    id: `${team}-${role}-${state.date}-${s.proposals.length}`, team, role, candidate: id, by: by?.id ?? "", date: state.date,
    reason: reasons.join("; "), status: "open",
  };
  if (replaces) p.replaces = replaces;
  s.proposals.push(p);
  const who = by ? `${by.name}, ${ROLE_NAME[by.role!]}` : "Head Coach";
  send(state, "staff", who, `Proposed ${ROLE_NAME[role]}: ${c.name}`,
    `I'd like to hire ${c.name} (${c.background ?? "assistant"}) as our ${ROLE_NAME[role]}: ${p.reason}.` +
    (replaces ? ` That would mean moving on from ${person(state, replaces).name}.` : "") +
    ` Approve or turn it down on the Staff page.`);
}

export function decideProposal(state: GameState, id: string, choice: "approve" | "reject" | "keep"): { ok: boolean; text: string } {
  const s = staff(state);
  const p = s.proposals.find((x) => x.id === id && x.status === "open");
  if (!p) return { ok: false, text: "That proposal isn't open." };
  const replaces = p.replaces;
  if (choice === "keep") {
    p.status = "withdrawn";
    if (replaces) s.searches = s.searches.filter((x) => !(x.team === p.team && x.role === p.role && !x.agreed));
    return { ok: true, text: `We'll keep ${replaces ? person(state, replaces).name : "the current staff"}.` };
  }
  if (choice === "reject") {
    p.status = "rejected";
    propose(state, p.role, replaces);
    return { ok: true, text: "Turned down. Expect another name soon." };
  }
  p.status = "approved";
  const c = person(state, p.candidate);
  const a = available(state, p.team, p.candidate, p.role);
  if (!a.ok) {
    propose(state, p.role, replaces);
    return { ok: false, text: `${c.name} is no longer available. Another name is coming.` };
  }
  openSearch(state, p.team, p.role, replaces ? "fired" : "left", replaces);
  const ask = askFor(state, p.candidate, p.role);
  s.offers = s.offers.filter((o) => !(o.team === p.team && o.role === p.role));
  s.offers.push({ team: p.team, role: p.role, id: p.candidate, years: 3, salary: ask, date: addDays(state.date, -1) });
  return { ok: true, text: `Approved. We've offered ${c.name} 3 years at ${money(ask)} a year.` };
}

/** Our open coordinator and support jobs get a proposal; unanswered ones are approved after a few days. */
function userProposals(state: GameState): void {
  const s = staff(state);
  const team = state.userTeam;
  for (const search of openSearches(state, team)) {
    if (TOP.includes(search.role)) continue;
    if (s.offers.some((o) => o.team === team && o.role === search.role)) continue;
    const open = s.proposals.find((p) => p.team === team && p.role === search.role && p.status === "open");
    if (!open) {
      if (SUPPORT.includes(search.role)) {
        // The GM fills the support jobs and reports back.
        const id = bossPick(state, team, search.role, new Set(Object.keys(search.interviews))) ?? newHireFromWithin(state, team, search.role).id;
        search.interviews[id] = { date: state.date };
        s.offers.push({ team, role: search.role, id, years: 3, salary: askFor(state, id, search.role), date: addDays(state.date, -1) });
      } else if (holder(state, team, "HC") && state.date >= addDays(search.opened, 1)) {
        const incumbent = holder(state, team, search.role);
        propose(state, search.role, incumbent && incumbent.id === search.previous ? incumbent.id : undefined);
      }
    } else if (daysBetween(open.date, state.date) >= 4) {
      decideProposal(state, open.id, "approve");
      send(state, "staff", hcName(state), "Moving ahead",
        `Since I hadn't heard back, I went ahead with ${person(state, open.candidate).name} as ${ROLE_NAME[open.role]}.`);
    }
  }
}

// ---- A new head coach builds his staff ----

/** The team's schemes follow the head coach's side and the coordinator's other side. */
function setSchemes(state: GameState, team: string): void {
  const s = staff(state);
  const hc = holder(state, team, "HC");
  const oc = holder(state, team, "OC");
  const dc = holder(state, team, "DC");
  const cur = s.schemes[team];
  const offense = (hc?.side === "offense" ? hc.scheme : oc?.scheme ?? cur.offense) as OffenseScheme;
  const defense = (hc?.side === "defense" ? hc.scheme : dc?.scheme ?? cur.defense) as DefenseScheme;
  const install = (s.install[team] ??= { offense: 1, defense: 1 });
  if (offense && offense !== cur.offense) {
    install.offense = 0.2;
    if (team === state.userTeam) send(state, "staff", hcName(state, team), "A new offense", `We're installing ${schemeName("offense", offense)}. It takes the spring, camp and the first weeks of the season before it's second nature.`);
  }
  if (defense && defense !== cur.defense) {
    install.defense = 0.2;
    if (team === state.userTeam) send(state, "staff", hcName(state, team), "A new defense", `We're installing ${schemeName("defense", defense)}. Expect growing pains early.`);
  }
  s.schemes[team] = { offense: offense ?? cur.offense, defense: defense ?? cur.defense };
  clearStaffCaches();
}

/** Who calls plays: the head coach on his side if he's a play caller, else the coordinator. */
function setPlayCallers(state: GameState, team: string): void {
  const hc = holder(state, team, "HC");
  const oc = holder(state, team, "OC");
  const dc = holder(state, team, "DC");
  if (oc) oc.callsPlays = ["offense"];
  if (dc) dc.callsPlays = ["defense"];
  if (!hc) return;
  hc.callsPlays = [];
  const side = hc.side;
  if (!side) return;
  const coord = side === "offense" ? oc : dc;
  const mine = hc.hidden.playCalling ?? 60;
  const theirs = coord?.hidden.playCalling ?? 55;
  const p = side === "offense" ? 0.7 : 0.4;
  if (!coord || mine >= theirs + 2 || rngFor(state.seed, `calls:${team}:${hc.id}`)() < p * (mine >= theirs ? 1 : 0.4)) {
    hc.callsPlays = [side];
    if (coord) coord.callsPlays = [];
  }
}

function newHeadCoach(state: GameState, team: string, id: string): void {
  const hc = person(state, id);
  const rng = rngFor(state.seed, `newhc:${team}:${id}`);
  // The coordinators: a new head coach mostly brings his own.
  for (const role of ["OC", "DC", "STC"] as StaffRole[]) {
    const cur = holder(state, team, role);
    const own = (role === "OC" && hc.side === "offense") || (role === "DC" && hc.side === "defense");
    const keep = cur && rng() < (own ? 0.15 : role === "STC" ? 0.5 : 0.4) * (reputation(state, cur) >= 70 ? 1.4 : 1);
    if (team === state.userTeam) {
      if (!cur) openOpening(state, team, role, "left");
      else if (!keep) {
        openSearch(state, team, role, "fired", cur.id);
      }
      continue;
    }
    if (!keep) {
      if (cur) fire(state, cur.id, true);
      openOpening(state, team, role, "fired", cur?.id);
    }
  }
  setPlayCallers(state, team);
  setSchemes(state, team);
}

function afterHire(state: GameState, team: string, role: StaffRole, id: string): void {
  void id;
  if (role === "OC" || role === "DC") {
    setPlayCallers(state, team);
    setSchemes(state, team);
  }
}

// ---- The CPU side ----

/** A season is over for a team: the record goes in the books, a few retire, then the decisions. */
function seasonEnded(state: GameState, team: string): void {
  recordTeamSeason(state, team);
  for (const c of Object.values(staff(state).people)) {
    if (c.team !== team || !c.role || c.interimFrom || !retiresNow(state, c)) continue;
    const role = c.role;
    retire(state, c.id);
    const text = `${teamLabel(team)} ${ROLE_NAME[role]} ${c.name} retires`;
    log(state, team, text);
    if (role === "HC" || role === "GM" || team === state.userTeam) news(state, text);
    if (team === state.userTeam) send(state, "staff", gmName(state), `${c.name} is retiring`, `${c.name} told us it's time to retire. We'll need a new ${ROLE_NAME[role]}.`);
    openSearch(state, team, role, "retired", c.id);
  }
  if (team === state.userTeam) return seasonReview(state);
  const rng = rngFor(state.seed, `blackmonday:${RULES.season}:${team}`);
  const hc = holder(state, team, "HC");
  const gm = holder(state, team, "GM");
  const searching = openSearches(state, team).some((x) => x.role === "HC");
  const hcOut = !!hc && !searching && rng() < fireChance(state, team, hc);
  const gmOut = !!gm && rng() < (hcOut ? 0.4 : 0.04) * (RULES.season - gm.hiredYear >= 2 ? 1 : 0.3);
  if (hcOut) {
    fire(state, hc!.id);
    openSearch(state, team, "HC", "fired", hc!.id);
  }
  if (gmOut) {
    fire(state, gm!.id);
    openSearch(state, team, "GM", "fired", gm!.id);
  }
  if (!hcOut) {
    // A head coach who stays can still change coordinators after a bad year on one side.
    const table = standings(state);
    for (const role of ["OC", "DC", "STC"] as StaffRole[]) {
      const c = holder(state, team, role);
      if (!c) continue;
      const rank = role === "OC" ? rankOf(table, team, "pf") : role === "DC" ? rankOf(table, team, "pa") : 16;
      const calls = hc?.callsPlays.includes(role === "OC" ? "offense" : "defense");
      let p = rank >= 26 ? 0.5 : rank >= 21 ? 0.22 : rank >= 15 ? 0.07 : 0.03;
      if (calls) p *= 0.3;
      if (role === "STC") p = 0.08;
      if (rng() < p) {
        fire(state, c.id);
        openOpening(state, team, role, "fired", c.id);
      }
    }
    // Expiring deals: most get extended, the rest move on.
    for (const c of Object.values(staff(state).people)) {
      if (c.team !== team || !c.role || !c.contract || c.contract.through > RULES.season) continue;
      if (openSearches(state, team).some((x) => x.role === c.role)) continue;
      const keep = c.role === "HC" || c.role === "GM" ? 0.95 : 0.72;
      if (rng() < keep) {
        c.contract = { through: RULES.season + (c.role === "HC" || c.role === "GM" ? 3 : 2), salary: Math.max(c.contract.salary, askFor(state, c.id, c.role)) };
      } else {
        const role = c.role;
        vacate(state, c.id, "fired");
        c.fired = undefined;
        openOpening(state, team, role, "expired", c.id);
      }
    }
  }
}

function rankOf(table: ReturnType<typeof standings>, team: string, key: "pf" | "pa"): number {
  const order = TEAMS.map((t) => t.id).sort((a, b) => key === "pf" ? table[b].pf - table[a].pf : table[a].pa - table[b].pa);
  return order.indexOf(team) + 1;
}

/** How likely an owner is to fire his head coach (engine only). */
export function fireChance(state: GameState, team: string, hc: Coach): number {
  const r = standings(state)[team];
  const g = Math.max(1, r.w + r.l + r.t);
  const wp = (r.w + r.t / 2) / g;
  const expect = staff(state).expect[team] ?? 0.5;
  const tenure = RULES.season - hc.hiredYear + 1;
  const last = hc.record.filter((x) => x.team === team && x.season < RULES.season).slice(-2);
  const lastWp = last.length ? last.reduce((s, x) => s + (x.w + x.t / 2) / Math.max(1, x.w + x.l + x.t), 0) / last.length : 0.5;
  const playoffs = [...(state.seeds?.AFC ?? []), ...(state.seeds?.NFC ?? [])].includes(team);
  let z = (wp - expect) * 5 + (wp - 0.5) * 3 + (lastWp - 0.5) * 1.5 + (playoffs ? 1.6 : 0);
  if (tenure <= 1) z += 2.2;
  else if (tenure === 2) z += 0.8;
  const p = 1.8 / (1 + Math.exp(z * 1.4 + 2.0));
  return Math.min(0.92, p);
}

/** Our season review: the GM's summary and the head coach's thoughts on his staff. */
function seasonReview(state: GameState): void {
  const team = state.userTeam;
  const r = standings(state)[team];
  const expect = staff(state).expect[team] ?? 0.5;
  const table = standings(state);
  const off = rankOf(table, team, "pf");
  const def = rankOf(table, team, "pa");
  const exp = Math.round(expect * 17);
  const lines = [
    `We finished ${r.w}-${r.l}${r.t ? `-${r.t}` : ""}. Going in, the roster looked like about a ${exp}-win team.`,
    `The offense ranked ${ordinal(off)} in points scored; the defense ${ordinal(def)} in points allowed.`,
  ];
  const expiring = Object.values(staff(state).people).filter((c) => c.team === team && c.role && c.contract && c.contract.through <= RULES.season);
  if (expiring.length) lines.push(`Contracts running out: ${expiring.map((c) => `${c.name} (${ROLE_NAME[c.role!]})`).join(", ")}. Extend anyone you want to keep on the Staff page; the rest leave when their deals end.`);
  lines.push("Staff decisions are yours: keep, extend or let people go on the Staff page. The head coach will tell you if he wants to change coordinators.");
  send(state, "staff", gmName(state), "Season review", lines.join("\n\n"));
  // The head coach's own view of his coordinators.
  const hc = holder(state, team, "HC");
  if (!hc) return;
  for (const role of ["OC", "DC"] as StaffRole[]) {
    const c = holder(state, team, role);
    if (!c) continue;
    const rank = role === "OC" ? off : def;
    const calls = hc.callsPlays.includes(role === "OC" ? "offense" : "defense");
    const z = gaussian(rngFor(state.seed, `hcview:${RULES.season}:${c.id}`)) * 4;
    if (!calls && (rank >= 24 || quality(c, role) + z < 64)) {
      openSearch(state, team, role, "fired", c.id);
    }
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Our expiring contracts end a week after the Super Bowl unless extended. */
function expireUserContracts(state: GameState): void {
  for (const c of Object.values(staff(state).people)) {
    if (c.team !== state.userTeam || !c.role || !c.contract || c.contract.through > RULES.season) continue;
    const role = c.role;
    if (role === "HC" || role === "GM") {
      // Nobody leaves the top jobs by accident: two more years at the going rate.
      c.contract = { through: RULES.season + 2, salary: Math.max(c.contract.salary, askFor(state, c.id, role)) };
      send(state, "staff", gmName(state), `${c.name} extended`, `${c.name}'s contract was up; we kept the ${ROLE_NAME[role]} on a two-year extension at ${money(c.contract.salary)} a year.`);
      continue;
    }
    vacate(state, c.id, "fired");
    c.fired = undefined;
    openOpening(state, state.userTeam, role, "expired", c.id);
    send(state, "staff", gmName(state), `${c.name}'s contract is up`, `${c.name} (${ROLE_NAME[role]}) is a free agent now. ${hcName(state)} will propose a replacement.`);
  }
}

/** CPU searches: a shortlist, interviews over a week or two, then an offer to the favorite. */
function cpuSearches(state: GameState): void {
  const s = staff(state);
  for (const search of openSearches(state)) {
    if (search.team === state.userTeam && !search.delegated) continue;
    if (s.offers.some((o) => o.team === search.team && o.role === search.role)) continue;
    if (search.interim && inSeason(state)) continue;
    if (inSeason(state) && TOP.includes(search.role)) continue;
    const days = daysBetween(search.opened, state.date);
    const rng = rngFor(state.seed, `search:${search.team}:${search.role}:${state.date}`);
    const top = TOP.includes(search.role);
    if (!top) {
      // Coordinators and support jobs: the boss picks someone in a few days.
      if (days < 2 || rng() < 0.4) continue;
      const id = bossPick(state, search.team, search.role, new Set(Object.keys(search.interviews))) ?? newHireFromWithin(state, search.team, search.role).id;
      search.interviews[id] = { date: state.date };
      s.offers.push({ team: search.team, role: search.role, id, years: 2 + Math.floor(rng() * 2), salary: askFor(state, id, search.role), date: state.date });
      continue;
    }
    // Interviews: a handful a week from the shortlist.
    const list = candidates(state, search.team, search.role)
      .filter((id) => !search.interviews[id])
      .slice(0, 40)
      .map((id) => ({ id, v: teamView(state, search.team, id, search.role) }))
      .sort((a, b) => b.v - a.v);
    const held = Object.values(search.interviews).filter((x) => x.report).length;
    if (held < 8 && rng() < 0.7) {
      for (const cand of list.slice(0, 3)) {
        if (!available(state, search.team, cand.id, search.role).ok) continue;
        if (!willTalk(state, search.team, cand.id, search.role)) {
          search.interviews[cand.id] = { date: state.date, declined: true };
          continue;
        }
        search.interviews[cand.id] = { date: addDays(state.date, 1 + Math.floor(rng() * 3)) };
        if (person(state, cand.id).team === state.userTeam && search.role === "HC") {
          send(state, "staff", gmName(state), `Interview request: ${person(state, cand.id).name}`,
            `The ${teamLabel(search.team)} have asked to interview our ${ROLE_NAME[person(state, cand.id).role!]} ${person(state, cand.id).name} for their head coaching job. We can't block it.`);
        }
        break;
      }
    }
    // An offer once they've seen enough, sooner if a rival is closing in.
    const seen = Object.entries(search.interviews).filter(([, iv]) => iv.report && !iv.declined).map(([id]) => id)
      .filter((id) => available(state, search.team, id, search.role).ok);
    const rival = s.offers.some((o) => o.role === search.role && seen.includes(o.id));
    if (seen.length && (days >= 12 || held >= 6 || (rival && days >= 5) || state.date >= addDays(OFFSEASON_GUESS(), 10))) {
      const best = seen.map((id) => ({ id, v: teamView(state, search.team, id, search.role) + (search.interviews[id].report!.impression - 3) * 1.5 }))
        .sort((a, b) => b.v - a.v)[0];
      const ask = askFor(state, best.id, search.role);
      s.offers.push({ team: search.team, role: search.role, id: best.id, years: search.role === "HC" ? 4 + Math.floor(rng() * 2) : 4, salary: Math.round(ask * (0.97 + 0.15 * rng()) / 50_000) * 50_000, date: state.date });
    }
  }
}

function OFFSEASON_GUESS(): string {
  return addDays(KEY.superBowl, 1);
}

/** Hires agreed while the candidate's team was still playing become official once it's done. */
function pendingHires(state: GameState): void {
  for (const search of [...staff(state).searches]) {
    if (!search.agreed) continue;
    const c = person(state, search.agreed.id);
    const employer = c.team ?? (c.job && c.job.kind !== "college" ? c.job.team : null);
    if (!employer || !stillPlaying(state, employer)) finalize(state, search);
  }
}

/** By March the last jobs get filled with whoever is left. */
function lastCall(state: GameState): void {
  if (state.date !== addDays(KEY.superBowl, 15)) return;
  for (const search of openSearches(state)) {
    if (staff(state).offers.some((o) => o.team === search.team && o.role === search.role)) continue;
    if (search.team === state.userTeam && TOP.includes(search.role)) {
      send(state, "staff", gmName(state), `We still need a ${ROLE_NAME[search.role]}`,
        `The league has mostly filled its jobs. If you'd like, I can run the search from here (Staff page), or you can keep interviewing. ` +
        `If the job is still open when the new league year starts, I'll fill it so we're ready for free agency.`);
      continue;
    }
    const id = bossPick(state, search.team, search.role, new Set()) ?? newHireFromWithin(state, search.team, search.role).id;
    search.agreed = { id, date: state.date };
    search.terms = { years: 2, salary: askFor(state, id, search.role) };
    finalize(state, search);
  }
}

/** The owner hands a search to the GM (or, for a GM search, to the team president's search firm). */
/** A top job we leave open into the new league year gets filled by the GM (or a search firm, for the GM job). */
function forceUserSearches(state: GameState): void {
  if (state.date !== KEY.newLeagueYear) return;
  for (const search of openSearches(state, state.userTeam)) {
    if (!TOP.includes(search.role) || search.delegated) continue;
    search.delegated = true;
    send(state, "staff", gmName(state), `Filling the ${ROLE_NAME[search.role]} job`,
      `The new league year is here and we still don't have a ${ROLE_NAME[search.role]}. ` +
      (search.role === "GM" ? "A search firm is bringing us the best available candidate." : "I'm hiring the best available candidate now."));
  }
}

export function delegateSearch(state: GameState, role: StaffRole): { ok: boolean; text: string } {
  const search = openSearches(state, state.userTeam).find((x) => x.role === role);
  if (!search) return { ok: false, text: "There's no open search for that job." };
  search.delegated = true;
  return { ok: true, text: role === "GM" ? "A search firm will bring us a GM." : "The GM will run the search and hire the best candidate." };
}

/** In-season firings: a few teams can't wait for the season to end. */
function midseason(state: GameState): void {
  if (!inSeason(state) || weekday(state.date) !== "Tuesday") return;
  const week = Math.floor(daysBetween(KEY.regularSeasonStart, state.date) / 7);
  if (week < 6 || week > 14) return;
  const table = standings(state);
  for (const t of TEAMS) {
    if (t.id === state.userTeam) continue;
    const r = table[t.id];
    const g = r.w + r.l + r.t;
    if (g < 6 || r.w > 2) continue;
    const hc = holder(state, t.id, "HC");
    if (!hc || RULES.season - hc.hiredYear < 1) continue;
    const expect = staff(state).expect[t.id] ?? 0.5;
    if (expect < 0.45) continue;
    if (rngFor(state.seed, `midseason:${t.id}:${state.date}`)() > 0.08) continue;
    fire(state, hc.id);
    const pool = [holder(state, t.id, "OC"), holder(state, t.id, "DC")].filter((x): x is Coach => !!x);
    const interim = pool.sort((a, b) => (b.hidden.leadership ?? 60) - (a.hidden.leadership ?? 60))[0];
    const search = openSearch(state, t.id, "HC", "fired", hc.id);
    if (interim) {
      const from = interim.role!;
      install(state, interim.id, t.id, "HC", 1, interim.contract?.salary ?? 2_000_000);
      interim.interimFrom = from;
      const fill = newHireFromWithin(state, t.id, from);
      install(state, fill.id, t.id, from, 1, salaryFor(from, reputation(state, fill)));
      search.interim = interim.id;
      news(state, `${interim.name} is the ${teamLabel(t.id)} interim head coach`);
    }
    clearStaffCaches();
  }
}

/** A new scheme settles in through the spring, camp and the first weeks of the season. */
function installProgress(state: GameState): void {
  const s = staff(state);
  const camp = addDays(KEY.regularSeasonStart, -45);
  const rate = state.date >= KEY.regularSeasonStart && state.date <= KEY.regularSeasonEnd ? 0.006 : state.date >= camp && state.date < KEY.regularSeasonStart ? 0.008 : 0.0015;
  let changed = false;
  for (const v of Object.values(s.install)) {
    for (const side of ["offense", "defense"] as const) {
      if (v[side] >= 1) continue;
      v[side] = Math.min(1, Math.round((v[side] + rate) * 10000) / 10000);
      changed = true;
    }
  }
  if (changed && weekday(state.date) === "Tuesday") clearStaffCaches();
}

// ---- Each day ----

export function carouselDaily(state: GameState): void {
  const s = state.staff;
  if (!s) return;
  const d = state.date;
  if (d === KEY.regularSeasonStart) s.expect = { ...outlook(state) };
  installProgress(state);
  midseason(state);
  if (d === addDays(KEY.regularSeasonEnd, 1)) {
    // Out of work, assistants and college coaches: some call it a career.
    for (const c of Object.values(s.people)) if (!c.retired && !c.role && retiresNow(state, c)) retire(state, c.id);
  }
  if (d > KEY.regularSeasonEnd) {
    const ended = (s.ended ??= {});
    for (const t of TEAMS) {
      if (ended[t.id] === RULES.season || stillPlaying(state, t.id)) continue;
      ended[t.id] = RULES.season;
      seasonEnded(state, t.id);
    }
  }
  if (d === addDays(KEY.superBowl, 8)) expireUserContracts(state);
  // Interim coaches' searches start when the season is over.
  runInterviews(state);
  cpuSearches(state);
  decideOffers(state);
  pendingHires(state);
  userProposals(state);
  lastCall(state);
  forceUserSearches(state);
}

/** At the rollover: last season's searches and proposals are cleared out. */
export function newStaffSeason(state: GameState): void {
  const s = state.staff;
  if (!s) return;
  s.proposals = s.proposals.filter((p) => p.status === "open");
  s.owed = s.owed.filter((o) => o.through >= RULES.season);
  s.ended = {};
  s.log = s.log.slice(0, 300);
}

export { holder, rankOf, ordinal };
