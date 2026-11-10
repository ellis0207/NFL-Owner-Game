// The owner's standing outside the office: how other owners, lenders, the
// press, agents, the club's own people and the league office judge the
// owner's record; what the owner says publicly against what happens in
// private (and what leaks); the public officials who answer to voters,
// not to the club; and scandals and achievements that move each audience
// differently. Officials, scandals and their details are made up.
import { addMemo, office } from "./delegation";
import { post } from "./business";
import { culture, leak } from "./culture";
import { addDays } from "./dates";
import { news } from "./inbox";
import { leagueYear } from "./contracts";
import { TEAM_BY_ID } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { ownerStanding } from "./playercare";
import { remember } from "./people";
import { rngFor } from "./rng";
import { teamStaff } from "./staff";
import { restatements } from "./treasury";
import type { GameState, Memo } from "./types";

export type Stance = "handsOff" | "involved";
export const STANCES: Record<Stance, string> = {
  handsOff: "The football people make the football decisions",
  involved: "I'm involved in every major football decision",
};

export interface Official { role: "Mayor" | "City council president" | "Governor"; name: string; lean: number; up: number }

export interface StandingState {
  /** Engine only: the league office's view of the club, 0-100. */
  league: number;
  stance?: Stance;
  stanceSince?: string;
  /** Contradictions that came out: what the owner said against what the owner did. */
  broken: { date: string; text: string }[];
  officials: Official[];
  /** Month by month, each audience's confidence (engine only; shown as trends). */
  history: { month: string; fans: number; staff: number; sponsors: number; community: number; league: number; media: number }[];
  incidents: { date: string; text: string; good: boolean }[];
}

function official(state: GameState, role: Official["role"], n: number): Official {
  const rng = rngFor(state.seed, `official:${role}:${n}`);
  const up = { Mayor: 2027, "City council president": 2027, Governor: 2028 }[role] + Math.floor(rng() * 4);
  return { role, name: `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`, lean: Math.round(40 + rng() * 25), up };
}

export function standingState(state: GameState): StandingState {
  return (state.standing ??= {
    league: 65, broken: [], incidents: [], history: [],
    officials: [official(state, "Mayor", 0), official(state, "City council president", 0), official(state, "Governor", 0)],
  });
}

// ---- Credibility ----

export interface Audience { key: string; label: string; score: number; why: string }

/** How each audience judges the owner's record, 0-100, with the main reason. */
export function credibility(state: GameState): Audience[] {
  const s = standingState(state);
  const since = addDays(state.date, -730);
  const broken = s.broken.filter((b) => b.date >= since).length;
  const rel = Object.values(state.owners?.relations ?? {});
  const owners = rel.length ? 50 + rel.reduce((t, r) => t + r.rapport, 0) / rel.length / 2 : 50;
  const lenders = state.debt?.trust ?? 60;
  const mediaRel = Object.values(state.media?.rel ?? {});
  const media = 50 + (mediaRel.length ? mediaRel.reduce((a, b) => a + b, 0) / mediaRel.length : 0) - broken * 6;
  const agents = state.office ? ownerStanding(state).score : 55;
  const last = state.culture?.history[state.culture.history.length - 1];
  const employees = (last ? (last.trust + last.morale + last.fairness) / 3 : 60) - broken * 4;
  const c = state.culture?.rel;
  const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
  return [
    { key: "owners", label: "Other owners", score: clamp(owners), why: "Votes, alliances and how you've treated them at league meetings." },
    { key: "lenders", label: "Lenders and investors", score: clamp(lenders - restatements(state) * 6), why: restatements(state) ? "A restated year still weighs on them." : "Covenants met and the books in order." },
    { key: "media", label: "The press", score: clamp(media), why: broken ? "Stories where what you said and what you did didn't match." : "Access, candor and how you handle questions." },
    { key: "agents", label: "Players and agents", score: clamp(agents), why: "Facilities, player services and whether you leave football to the football people." },
    { key: "employees", label: "Your own staff", score: clamp(employees), why: broken ? "They saw promises broken." : "Trust, fairness and morale in the building." },
    { key: "league", label: "The league office", score: clamp(s.league), why: "Fines, compliance, inquiries and how the club answers them." },
    { key: "sponsors", label: "Sponsors", score: clamp(c?.sponsors ?? 55), why: "Deliverables met, collections and the club's name in the news." },
    { key: "community", label: "The community", score: clamp(c?.community ?? 55), why: "Programs, appearances and commitments kept." },
  ];
}

export function credWord(v: number): string {
  return v >= 75 ? "High" : v >= 60 ? "Solid" : v >= 45 ? "Mixed" : v >= 30 ? "Low" : "Poor";
}

// ---- Saying one thing and doing another ----

export function setStance(state: GameState, stance: Stance): void {
  const s = standingState(state);
  if (s.stance && s.stance !== stance) s.broken.push({ date: state.date, text: `Changed the public line on football decisions from "${STANCES[s.stance]}"` });
  s.stance = stance;
  s.stanceSince = state.date;
  news(state, `${TEAM_BY_ID[state.userTeam].name} owner: "${STANCES[stance]}"`);
}

/** Football calls the owner made personally in the last month while saying the football people decide. */
function quietCalls(state: GameState): number {
  const s = standingState(state);
  if (s.stance !== "handsOff" || !state.office) return 0;
  const since = addDays(state.date, -31);
  return office(state).trail.filter((t) => t.date >= since && t.by === "Owner" && /signing|trade|coach|roster|depth|cut|keep/i.test(t.area + " " + t.what)).length;
}

function interference(state: GameState): void {
  const n = quietCalls(state);
  if (!n) return;
  const c = culture(state);
  // The more calls, and the better the press's sources inside, the likelier it comes out.
  const p = Math.min(0.6, n * 0.06 + c.rel.sources / 400);
  if (rngFor(state.seed, `interference:${state.date}`)() >= p) return;
  const s = standingState(state);
  s.broken.push({ date: state.date, text: "Making football calls while saying the football people decide" });
  leak(state, `People in the building say the owner has been making football calls personally, despite saying publicly that the football staff decides.`, "owner said to be calling football shots behind the scenes");
  const gm = teamStaff(state.userTeam).GM?.name;
  if (gm) remember(state, gm, "Overruled behind closed doors while the owner said otherwise in public", -3);
  if (state.media) state.media.coach = Math.max(0, state.media.coach - 4);
}

// ---- Public officials ----

/** Officials' lean toward the club's asks, as a small push on lease and project goodwill. */
export function officialsLean(state: GameState): number {
  const o = state.standing?.officials;
  if (!o?.length) return 0;
  return ((o.reduce((t, x) => t + x.lean, 0) / o.length) - 50) / 1000;
}

/** What voters think of the club right now: officials follow this more than they follow the owner. */
export function constituents(state: GameState): number {
  const c = state.culture?.rel.community ?? 55;
  return Math.round(c * 0.6 + state.pressure.fans * 0.4);
}

/** Meet an official: some lean toward the club, more when voters like the club; a cost in time and the club's foundation. */
export function meetOfficial(state: GameState, index: number): string | null {
  const o = standingState(state).officials[index];
  if (!o) return "No such official.";
  const last = office(state).trail.find((t) => t.area === "government" && t.what.includes(o.name));
  if (last && last.date >= addDays(state.date, -60)) return `You met ${o.name} recently. Another meeting this soon looks like pressure.`;
  const voters = constituents(state);
  const move = Math.max(-2, (voters - 45) / 8);
  o.lean = Math.max(0, Math.min(100, o.lean + move));
  post(state, "community", -50_000, `Civic event with the ${o.role.toLowerCase()}`);
  office(state).trail.unshift({ date: state.date, area: "government", what: `Met ${o.role.toLowerCase()} ${o.name}`, by: "Owner", approved: "owner" });
  return move > 0.5 ? `${o.name} was warm: voters like what the club is doing.` : move < 0 ? `${o.name} kept a distance; the club isn't popular with voters right now.` : `${o.name} listened politely and committed to nothing.`;
}

function officialsMonthly(state: GameState): void {
  const s = standingState(state);
  const voters = constituents(state);
  for (const [i, o] of s.officials.entries()) {
    // Officials drift toward what their voters think of the club, not what the owner wants.
    if (state.date.endsWith("-01")) o.lean = Math.round((o.lean + (voters - o.lean) * 0.04) * 10) / 10;
    if (state.date === `${o.up}-11-05`) {
      const rng = rngFor(state.seed, `election:${o.role}:${o.up}`);
      if (rng() < 0.45) {
        const n = official(state, o.role, o.up);
        s.officials[i] = { ...n, lean: Math.round(45 + (voters - 50) * 0.3), up: o.up + 4 };
        news(state, `${n.name} wins the race for ${o.role.toLowerCase()}`);
      } else o.up += 4;
    }
  }
}

// ---- Scandals and achievements ----

const STAFF_SCANDALS = [
  "an assistant coach was arrested for driving under the influence",
  "a business-side manager is accused of harassing employees",
  "a scout was caught selling the club's draft information to an agent",
  "an equipment manager was caught reselling game-worn gear",
];
const OWNER_SCANDALS = [
  "a lawsuit from a former business partner alleges the owner hid losses",
  "recordings surfaced of the owner mocking the city's fans",
  "a report says the owner's other company owes millions in back taxes",
];

function scandals(state: GameState): void {
  const rng = rngFor(state.seed, `scandal:${state.date}`);
  const staffP = 0.025 * (state.office?.compliance && state.office.compliance >= state.date ? 0.6 : 1);
  if (rng() < staffP) {
    const text = STAFF_SCANDALS[Math.floor(rng() * STAFF_SCANDALS.length)];
    addMemo(state, {
      kind: "general", from: "General counsel", title: "A staff member in the news",
      problem: `Reports say ${text}. The story is spreading.`, proposal: "Suspend him and review the facts.",
      options: [
        { label: "Fire him", effect: "Sponsors and the press see swift action; the staff sees a quick trigger.", evidence: "opinion" },
        { label: "Suspend and review", effect: "Measured. Some say it's slow.", evidence: "opinion" },
        { label: "Stand by him", effect: "The staff sees loyalty; sponsors and the league office do not.", evidence: "opinion" },
      ],
      risks: ["Every day without an answer keeps the story alive."], budget: "Outside counsel for the review, about $150K.",
      recommend: 1, deadline: addDays(state.date, 3), ifLate: "We suspend him pending a review.", payload: { standing: "staff", text },
    });
  }
  if (rng() < 0.004) {
    const text = OWNER_SCANDALS[Math.floor(rng() * OWNER_SCANDALS.length)];
    addMemo(state, {
      kind: "general", from: "Club spokesperson", title: "A story about you",
      problem: `This morning ${text}. Reporters want a response today.`, proposal: "Acknowledge it and promise to address it.",
      options: [
        { label: "Apologize publicly", effect: "The press and the league office respect it; some owners think it's weak.", evidence: "opinion" },
        { label: "Say nothing", effect: "The story fades slowly; the press assumes the worst.", evidence: "opinion" },
        { label: "Fight it", effect: "Lawyers and denials: fans may rally, the league office and sponsors back away.", evidence: "opinion" },
      ],
      risks: ["The league can discipline an owner for conduct that hurts the game."], budget: "Crisis communications, about $200K.",
      recommend: 0, deadline: addDays(state.date, 1), ifLate: "We say nothing for now.", payload: { standing: "owner", text },
    });
  }
}

/** The owner's answer to a scandal memo (memos.ts hands general memos here). */
export function resolveStandingMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  if (!p.standing) return null;
  const s = standingState(state);
  const c = culture(state);
  const bump = (k: "sponsors" | "community" | "sources", d: number) => (c.rel[k] = Math.max(0, Math.min(100, c.rel[k] + d)));
  const mediaAll = (d: number) => { if (state.media) for (const k of Object.keys(state.media.rel)) state.media.rel[k] = Math.max(-50, Math.min(50, state.media.rel[k] + d)); };
  if (p.standing === "staff") {
    post(state, "professional", -150_000, "Outside counsel: staff conduct review");
    if (choice === 0) { bump("sponsors", 2); mediaAll(2); c.fairness = Math.max(0, c.fairness - 3); }
    if (choice === 1) { bump("sponsors", 1); mediaAll(1); }
    if (choice === 2) { bump("sponsors", -4); mediaAll(-3); s.league = Math.max(0, s.league - 4); c.fairness = Math.min(100, c.fairness + 2); }
    s.incidents.unshift({ date: state.date, text: `Staff: ${p.text}`, good: false });
  } else {
    post(state, "professional", -200_000, "Crisis communications");
    if (choice === 0) { mediaAll(3); s.league = Math.min(100, s.league + 3); }
    if (choice === 1) { mediaAll(-3); bump("sponsors", -2); }
    if (choice === 2) { state.pressure.fans = Math.min(100, state.pressure.fans + 2); s.league = Math.max(0, s.league - 8); bump("sponsors", -5); mediaAll(-4); }
    s.incidents.unshift({ date: state.date, text: `Owner: ${p.text}`, good: false });
  }
  s.incidents = s.incidents.slice(0, 30);
  return null;
}

/** Wins and good works lift every audience a little. */
export function achievement(state: GameState, text: string): void {
  const s = standingState(state);
  s.incidents.unshift({ date: state.date, text, good: true });
  s.incidents = s.incidents.slice(0, 30);
  const c = culture(state);
  c.rel.sponsors = Math.min(100, c.rel.sponsors + 2);
  c.rel.community = Math.min(100, c.rel.community + 1);
  s.league = Math.min(100, s.league + 1);
}

// ---- The league office ----

function leagueMonthly(state: GameState): void {
  const s = standingState(state);
  const year = leagueYear(state.date);
  const fines = (state.business?.ledger ?? []).filter((e) => e.year === year && e.cat === "fines").reduce((t, e) => t - e.amount, 0);
  const compliance = (state.office?.incidents ?? []).filter((i) => i.kind === "compliance" && i.date >= addDays(state.date, -365)).length;
  const target = 70 - Math.min(20, fines / 250_000) - compliance * 4 - restatements(state) * 8;
  s.league = Math.round((s.league + (target - s.league) * 0.15) * 10) / 10;
}

// ---- Trends ----

function snapshot(state: GameState): void {
  const s = standingState(state);
  const month = state.date.slice(0, 7);
  if (s.history.some((h) => h.month === month)) return;
  const cred = Object.fromEntries(credibility(state).map((a) => [a.key, a.score]));
  s.history.push({ month, fans: Math.round(state.pressure.fans), staff: cred.employees, sponsors: cred.sponsors, community: cred.community, league: cred.league, media: cred.media });
  s.history = s.history.slice(-72);
}

/** Change in each audience over the last year, from the monthly readings. */
export function reputationTrend(state: GameState): { key: string; label: string; now: number; change: number }[] {
  const h = state.standing?.history ?? [];
  if (!h.length) return [];
  const now = h[h.length - 1];
  const then = h[Math.max(0, h.length - 13)];
  const keys: [keyof typeof now, string][] = [["fans", "Fans"], ["staff", "Staff"], ["sponsors", "Sponsors"], ["community", "Community"], ["league", "League office"], ["media", "Press"]];
  return keys.map(([k, label]) => ({ key: String(k), label, now: Number(now[k]), change: Number(now[k]) - Number(then[k]) }));
}

// ---- Daily ----

export function standingDaily(state: GameState): void {
  if (!state.office) return;
  standingState(state);
  if (state.date.endsWith("-01")) {
    interference(state);
    leagueMonthly(state);
    snapshot(state);
  }
  officialsMonthly(state);
  if (state.date.endsWith("-15")) scandals(state);
}
