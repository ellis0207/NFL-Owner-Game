// Pro days: after the combine every school holds its own workout for its
// draft prospects. Players the combine didn't invite get measured for the
// first time, and invitees make up drills they skipped in Indianapolis. Every
// team has someone there; the owner can send more (the scouting director, or
// the GM and head coach) to learn more about a school's prospects.
import { draftClass } from "./prospects";
import { mediaBoard } from "./college";
import { schoolName } from "./collegeData";
import { addDays, daysBetween, weekday } from "./dates";
import { DRAFT_YEAR, draftPool, draftState } from "./draft";
import { money, news, send } from "./inbox";
import { RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import { budgetLeft, fitRead, tripCost } from "./scouting";
import { teamStaff } from "./staff";
import type { GameState, ProDayCrew } from "./types";

export const CREWS: Record<ProDayCrew, { label: string; detail: string; trips: number; gain: number; ceiling: number }> = {
  scout: { label: "An area scout", detail: "Times and measurements first hand, and a word with the school's staff.", trips: 1, gain: 9, ceiling: 70 },
  director: { label: "The scouting director", detail: "Our best evaluator in the building, with interviews afterward.", trips: 2, gain: 15, ceiling: 85 },
  brass: { label: "The GM and head coach", detail: "Private workouts and dinners with the top prospects. Everyone notices who shows up.", trips: 3, gain: 19, ceiling: 92 },
};

/** How deep into the class pro day workouts get recorded. */
const BOARD_DEPTH = 700;

let cache: { key: string; days: Record<string, string> } | null = null;

/** Each school's pro day this spring, on a weekday between the combine and the draft. */
export function proDays(state: GameState): Record<string, string> {
  const key = `${state.seed}:${DRAFT_YEAR}`;
  if (cache?.key === key) return cache.days;
  const first = addDays(RULES.keyDates.scoutingCombineStart, 12);
  const last = addDays(RULES.keyDates.draftStart, -16);
  const span = Math.max(1, daysBetween(first, last));
  const schools = new Set(draftClass(state.seed).prospects.map((p) => p.school));
  const days: Record<string, string> = {};
  for (const school of schools) {
    let d = addDays(first, Math.floor(rngFor(state.seed, `proday:${school}:${DRAFT_YEAR}`)() * span));
    while (weekday(d) === "Saturday" || weekday(d) === "Sunday") d = addDays(d, 1);
    days[school] = d;
  }
  cache = { key, days };
  return days;
}

export function proDaysOn(state: GameState, date: string): string[] {
  return Object.entries(proDays(state)).filter(([, d]) => d === date).map(([s]) => s);
}

/** Pro days still to come, soonest first, with the prospects each will show. */
export function upcomingProDays(state: GameState, within = 21): { school: string; date: string; prospects: string[] }[] {
  const ranked = mediaBoard(state).slice(0, BOARD_DEPTH);
  const pool = new Set(draftPool(state));
  const bySchool: Record<string, string[]> = {};
  const dc = draftClass(state.seed);
  for (const id of ranked) if (pool.has(id)) (bySchool[dc.byId[id].school] ??= []).push(id);
  const end = addDays(state.date, within);
  return Object.entries(proDays(state))
    .filter(([s, d]) => d > state.date && d <= end && bySchool[s]?.length)
    .map(([school, date]) => ({ school, date, prospects: bySchool[school] }))
    .sort((a, b) => a.date.localeCompare(b.date) || b.prospects.length - a.prospects.length);
}

export function crewCost(state: GameState, school: string, crew: ProDayCrew): number {
  return tripCost(state.userTeam, school) * CREWS[crew].trips + (crew === "brass" ? 2500 : 0);
}

/** Send people to a school's pro day (or call it off with null). */
export function sendCrew(state: GameState, school: string, crew: ProDayCrew | null): { ok: boolean; text: string } {
  const date = proDays(state)[school];
  if (!date || date <= state.date) return { ok: false, text: "That pro day has already happened." };
  const d = draftState(state);
  const crews = (d.proDayCrews ??= {});
  if (!crew) {
    delete crews[school];
    return { ok: true, text: `Nobody extra going to ${schoolName(school)}.` };
  }
  const cost = crewCost(state, school, crew);
  const committed = Object.entries(crews).filter(([s]) => s !== school).reduce((sum, [s, c]) => sum + crewCost(state, s, c), 0);
  if (cost + committed > budgetLeft(state)) return { ok: false, text: `Not enough scouting budget left (${money(budgetLeft(state) - committed)} uncommitted).` };
  crews[school] = crew;
  return { ok: true, text: `${CREWS[crew].label} will be at ${schoolName(school)}'s pro day on ${date} (${money(cost)}).` };
}

/** What a prospect runs on his campus: fast tracks and friendly timers shave a little off. */
function workout(state: GameState, id: string, missedOnly: boolean) {
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  const rng = rngFor(state.seed, `proday:${id}`);
  const special = ["K", "P", "LS"].includes(p.position);
  const prior = state.draft?.combine?.[id];
  const r: { heightIn: number; weightLb: number; forty?: number; vertical?: number; bench?: number; date: string } = {
    heightIn: h.heightIn, weightLb: h.weightLb + Math.round(gaussian(rng) * 2), date: state.date,
  };
  if (!special) {
    if (!missedOnly || !prior?.forty) if (rng() < 0.9) r.forty = Math.round((h.forty - 0.03 + gaussian(rng) * 0.035) * 100) / 100;
    if (!missedOnly || !prior?.vertical) if (rng() < 0.85) r.vertical = Math.round(((h.traits.agility ?? h.overall) * 0.35 + (h.traits.speed ?? h.overall) * 0.15 + 2.5 + gaussian(rng) * 2) * 2) / 2;
    if (!missedOnly || !prior?.bench) if (rng() < 0.75) r.bench = Math.max(4, Math.round(((h.traits.strength ?? h.overall) - 40) * 0.45 + (h.weightLb - 200) * 0.06 + gaussian(rng) * 2.5));
  }
  return r;
}

export function proDayDaily(state: GameState): void {
  if (!state.college || state.date >= RULES.keyDates.draftStart) return;
  const schools = proDaysOn(state, state.date);
  if (!schools.length) return;
  const d = draftState(state);
  const dc = draftClass(state.seed);
  const board = mediaBoard(state);
  const rank: Record<string, number> = {};
  board.forEach((id, i) => { rank[id] = i + 1; });
  const pool = draftPool(state).filter((id) => schools.includes(dc.byId[id].school));
  const results = (d.proDay ??= {});
  const invited = d.combine ?? {};
  const hype = state.college.hype;
  const notable: string[] = [];
  // Position averages from the combine, to judge a time.
  const sums: Record<string, [number, number]> = {};
  for (const [id, r] of Object.entries(invited)) if (r.forty) { const s = (sums[dc.byId[id].position] ??= [0, 0]); s[0] += r.forty; s[1]++; }
  for (const id of pool) {
    const r0 = rank[id] ?? 9999;
    const wasInvited = id in invited;
    const missed = wasInvited && (!invited[id].forty || !invited[id].vertical || !invited[id].bench);
    if (wasInvited ? !missed : r0 > BOARD_DEPTH) continue;
    const r = workout(state, id, wasInvited);
    if (!r.forty && !r.vertical && !r.bench && wasInvited) continue;
    results[id] = r;
    const avg = sums[dc.byId[id].position];
    // Scouts trust campus times a bit less than Indianapolis.
    if (r.forty && avg) hype[id] = Math.round((hype[id] + Math.max(-1, Math.min(1, (avg[0] / avg[1] - r.forty) * 5))) * 10) / 10;
    if (r.forty && (r0 <= 120 || (avg && r.forty <= avg[0] / avg[1] - 0.12))) notable.push(id);
  }
  // Every team has a scout at every pro day.
  const s = state.college.scouting;
  for (const id of pool) {
    const i = dc.index[id];
    for (const arr of Object.values(s.cpu)) arr[i] = Math.min(88, (arr[i] ?? 0) + 3);
    s.know[id] = Math.min(Math.max(s.know[id] ?? 0, 60), (s.know[id] ?? 0) + 2);
  }
  for (const id of notable.slice(0, 3)) {
    const p = dc.byId[id];
    const r = results[id];
    news(state, `${p.position} ${p.name} runs a ${r.forty!.toFixed(2)} forty at ${schoolName(p.school)}'s pro day`);
  }
  // Our people at the workouts.
  const crews = d.proDayCrews ?? {};
  for (const school of schools) {
    const crew = crews[school];
    if (!crew) continue;
    const c = CREWS[crew];
    const cost = crewCost(state, school, crew);
    s.spent += cost;
    const here = pool.filter((id) => dc.byId[id].school === school).sort((a, b) => (rank[a] ?? 9999) - (rank[b] ?? 9999));
    for (const id of here) {
      const k = s.know[id] ?? 0;
      if (k < c.ceiling) s.know[id] = Math.min(c.ceiling, Math.round((k + c.gain * (1 - k / (c.ceiling + 10))) * 10) / 10);
    }
    delete crews[school];
    const director = teamStaff(state.userTeam).COL?.name ?? "Director of college scouting";
    const top = here.slice(0, 6);
    const lines = top.map((id) => {
      const p = dc.byId[id];
      const r = results[id] ?? invited[id];
      const times = r ? [r.forty ? `${r.forty.toFixed(2)} forty` : "", r.vertical ? `${r.vertical}" vertical` : "", r.bench ? `${r.bench} reps` : ""].filter(Boolean).join(", ") : "";
      return `${p.position} ${p.name}${times ? `: ${times}` : ": stood on his combine numbers"}`;
    });
    let coach = "";
    if (crew === "brass" && top.length) {
      const hc = teamStaff(state.userTeam).HC;
      const best = [...top].sort((a, b) => fitRead(state, b, state.userTeam) - fitRead(state, a, state.userTeam))[0];
      const fit = fitRead(state, best, state.userTeam) + gaussian(rngFor(state.seed, `proday-hc:${best}`)) * 2;
      coach = `\n\n${hc?.name ?? "The head coach"} on ${dc.byId[best].name}: ` +
        (fit >= 2 ? "\"He fits what we do. I'd want him on the board early.\"" : fit >= -1 ? "\"Good workout. He'd have a role with us.\"" : "\"Talented, but I'm not sure he fits our scheme.\"");
      news(state, `${teamStaff(state.userTeam).GM?.name ?? "The GM"} and ${hc?.name ?? "the head coach"} take in ${schoolName(school)}'s pro day`);
    }
    send(state, "staff", `${director}, director of college scouting`, `${schoolName(school)} pro day`,
      `${c.label} ${crew === "brass" ? "were" : "was"} at ${schoolName(school)}'s pro day (${money(cost)}).\n\n` +
      (lines.length ? lines.join("\n") : "Nobody we had ranked worked out.") + coach);
  }
}
