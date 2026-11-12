// The other 31 clubs as organizations: who runs each, how its owner thinks,
// the money it has to spend, the reputation it builds, and how all of that
// shifts with results, new owners and new people. The owners' styles and the
// clubs' governance are made up from the seed, except for a few well-known
// arrangements below, which are approximate.

import { revenueEstimate, operatingEstimate } from "./business";
import { fire, openSearch } from "./carousel";
import { staff } from "./coaches";
import { salaryCap, leagueYear } from "./contracts";
import { addDays, daysBetween } from "./dates";
import { CONTROL } from "./investors";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, teamLabel } from "./league";
import { changeRapport } from "./owners";
import { rngFor } from "./rng";
import { history } from "./seasons";
import { standings } from "./standings";
import { MARKETS } from "./stadiums";
import { replaceScout, scouts } from "./scouts";
import type { ClubProfile, GameState, RivalsState, StaffRole } from "./types";

const M = 1_000_000;

function rand(state: GameState, key: string): () => number {
  return rngFor(state.seed, key + "|" + [...key].reverse().join(""));
}
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

export const STYLES: Record<ClubProfile["style"], { label: string; what: string }> = {
  winNow: { label: "Win now", what: "Spends to the cap, trades picks for veterans and has little patience." },
  builder: { label: "Builder", what: "Drafts and develops, keeps picks and gives coaches time." },
  profit: { label: "Profit first", what: "Watches the books, spends under the cap and pays the owners first." },
  steady: { label: "Steady", what: "Keeps people a long time and avoids big swings." },
};

export const GOVERNANCE: Record<ClubProfile["governance"], string> = {
  owner: "The owner makes the football calls",
  president: "A president of football operations has the final say",
  gm: "The GM has the final say on the roster",
  coach: "The head coach has the final say on the roster",
};

// Well-known setups, approximate: the Joneses run Dallas's football side and
// the Browns run Cincinnati's; San Francisco's head coach holds unusual power.
const KNOWN: Record<string, ClubProfile["governance"]> = { DAL: "owner", CIN: "owner", SF: "coach" };

function newProfile(state: GameState, team: string): ClubProfile {
  const r = rand(state, `club-${team}`);
  const styles: ClubProfile["style"][] = ["winNow", "builder", "profit", "steady"];
  const style = styles[Math.floor(r() * 4)];
  const pull = MARKETS[team]?.pull ?? 1;
  const govRoll = r();
  const governance = KNOWN[team] ?? (govRoll < 0.08 ? "owner" : govRoll < 0.2 ? "president" : govRoll < 0.26 ? "coach" : "gm");
  const operating = operatingEstimate(state, team);
  return {
    team, style, governance,
    patience: style === "winNow" ? 2 : style === "builder" ? 4 : 3,
    spend: Math.round((0.85 + 0.15 * pull + r() * 0.1) * 100) / 100,
    rep: 60, hiring: 50,
    cash: Math.round((40 + r() * 80) * M + operating * 0.3),
    tight: false, meddles: [], memory: [], slow: [], since: state.date,
    owner: CONTROL[team] ?? "the owner",
    hc: staffId(state, team, "HC"), gm: staffId(state, team, "GM"),
  };
}

function staffId(state: GameState, team: string, role: StaffRole): string | undefined {
  return Object.values(staff(state).people).find((c) => c.team === team && c.role === role)?.id;
}

export function rivals(state: GameState): RivalsState {
  if (state.rivals) return state.rivals;
  const s: RivalsState = { clubs: {}, log: [] };
  state.rivals = s;
  for (const t of TEAMS) if (t.id !== state.userTeam) s.clubs[t.id] = newProfile(state, t.id);
  return s;
}

/** A CPU club's profile, created if a club joins the CPU side (after the player buys elsewhere). */
export function club(state: GameState, team: string): ClubProfile {
  const s = rivals(state);
  return (s.clubs[team] ??= newProfile(state, team));
}

/** The club's spending envelopes this league year. */
export function budget(state: GameState, team: string): { salary: number; staff: number; stadium: number; capital: number } {
  const c = club(state, team);
  const year = leagueYear(state.date);
  const cap = salaryCap(state, year);
  const rev = revenueEstimate(state, team);
  const lean = c.style === "profit" ? 0.95 : c.style === "winNow" ? 1 : 0.98;
  return {
    salary: Math.round(cap * lean * (c.tight ? 0.94 : 1)),
    staff: Math.round(rev * 0.035 * c.spend),
    stadium: Math.round(rev * 0.06),
    capital: Math.round(Math.max(0, operatingEstimate(state, team)) * (c.style === "profit" ? 0.15 : 0.3) * (c.tight ? 0.3 : 1)),
  };
}

/** How far a club's money lets it bid in free agency: 1 unless cash is tight. */
export function cashLean(state: GameState, team: string): number {
  if (team === state.userTeam || !state.rivals) return 1;
  const c = state.rivals.clubs[team];
  return c?.tight ? 0.8 : 1;
}

/** A nudge to how hard a club bids, from its owner's style: small, so markets hold. */
export function styleLean(state: GameState, team: string): number {
  const c = state.rivals?.clubs[team];
  if (!c) return 0;
  return c.style === "winNow" ? 0.06 : c.style === "profit" ? -0.06 : 0;
}

/** How quickly an owner moves on from a head coach: added to the firing model's score (positive keeps him). */
export function patienceShift(state: GameState, team: string): number {
  const c = state.rivals?.clubs[team];
  if (!c) return 0;
  return (c.patience - 3) * 0.25 + (c.governance === "coach" ? 0.3 : 0);
}

/** Hiring reputation as a multiplier on a job's appeal: 1 at the league norm. */
export function hiringFactor(state: GameState, team: string): number {
  const c = state.rivals?.clubs[team];
  if (!c) return 1;
  return 0.85 + 0.3 * (c.hiring / 100);
}

function remember(state: GameState, team: string, text: string, weight = 1): void {
  const c = club(state, team);
  c.memory.unshift({ date: state.date, text, weight });
  c.memory.splice(12);
}

function note(state: GameState, text: string): void {
  const s = rivals(state);
  s.log.unshift({ date: state.date, text });
  s.log.splice(80);
}

/** Something the player did to a club (a trade, a poached coach, a lopsided vote): clubs remember. */
export function rememberUs(state: GameState, team: string, text: string, rapport: number): void {
  if (team === state.userTeam) return;
  remember(state, team, text, rapport);
  changeRapport(state, team, rapport);
}

// ---- Money ----

function monthlyCash(state: GameState): void {
  const s = rivals(state);
  for (const [team, c] of Object.entries(s.clubs)) {
    if (team === state.userTeam) continue;
    const b = budget(state, team);
    // A month of operating income, less capital spending and what the owners take out.
    const payout = c.style === "profit" ? 0.5 : c.style === "steady" ? 0.3 : 0.15;
    const op = operatingEstimate(state, team);
    c.cash += Math.round((op * (1 - payout) - b.capital) / 12);
    const wasTight = c.tight;
    c.tight = c.cash < 0;
    if (c.tight && !wasTight) {
      remember(state, team, "Cash ran short; spending was cut.");
      note(state, `${teamLabel(team)}: cash ran short, and the club cut spending and drew on its credit line.`);
    }
    // Deep trouble: the owner borrows, then looks for a buyer.
    if (c.cash < -250 * M && !c.saleLooked) {
      c.saleLooked = state.date;
      c.cash += 150 * M;
      news(state, `The ${teamLabel(team)} owners are said to be exploring a sale after years of losses`);
      remember(state, team, "The owners explored a sale after losses.", 2);
    }
  }
}

// ---- Meddling ----

const MEDDLES = [
  (team: string) => `The ${teamLabel(team)} owner overruled the GM to sign a veteran the scouts didn't want, people around the team say.`,
  (team: string) => `The ${teamLabel(team)} owner made the call on a roster cut, over the coaches' objections.`,
  (team: string) => `The ${teamLabel(team)} owner went around the GM to talk contract with a star's agent.`,
];

function meddle(state: GameState): void {
  if (!state.date.endsWith("-01") && !state.date.endsWith("-15")) return;
  const s = rivals(state);
  const inSeason = state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.superBowl;
  for (const [team, c] of Object.entries(s.clubs)) {
    if (team === state.userTeam) continue;
    const r = rand(state, `meddle-${team}-${state.date}`);
    // Owner-run clubs and impatient owners meddle most: a few times a season around the league.
    const p = (c.governance === "owner" ? 0.05 : 0.004) + (c.style === "winNow" ? 0.004 : 0);
    if (r() >= p) continue;
    const table = standings(state)[team];
    const losing = table && table.l > table.w + 2;
    if (inSeason && losing && r() < 0.4) {
      const role: StaffRole = r() < 0.5 ? "OC" : "DC";
      const id = staffId(state, team, role);
      if (id) {
        fire(state, id);
        openSearch(state, team, role, "fired", id);
        news(state, `The ${teamLabel(team)} owner orders a coaching change: the ${role === "OC" ? "offensive" : "defensive"} coordinator is out`);
        c.meddles.unshift({ date: state.date, text: `Forced out the ${role === "OC" ? "offensive" : "defensive"} coordinator.` });
      }
    } else {
      const text = MEDDLES[Math.floor(r() * MEDDLES.length)](team);
      news(state, text);
      c.meddles.unshift({ date: state.date, text });
    }
    c.meddles.splice(10);
    c.rep = clamp(c.rep - 3);
    remember(state, team, "The owner stepped into football decisions.");
  }
}

// ---- Turnover and careers ----

/** New owners and new leaders change how a club behaves. */
function turnover(state: GameState): void {
  const s = rivals(state);
  const control = state.franchise?.control ?? {};
  for (const [team, c] of Object.entries(s.clubs)) {
    if (team === state.userTeam) continue;
    const ownerNow = control[team] ?? CONTROL[team] ?? c.owner;
    if (ownerNow !== c.owner) {
      const r = rand(state, `newowner-${team}-${state.date}`);
      const styles: ClubProfile["style"][] = ["winNow", "builder", "profit", "steady"];
      const before = c.style;
      c.style = styles[Math.floor(r() * 4)];
      c.patience = c.style === "winNow" ? 2 : c.style === "builder" ? 4 : 3;
      if (c.governance === "owner" && r() < 0.6) c.governance = "gm";
      if (r() < 0.1) c.governance = "owner";
      c.owner = ownerNow;
      c.since = state.date;
      c.rep = clamp(c.rep + 5);
      remember(state, team, `New owners (${ownerNow}) arrived${c.style !== before ? `, and the club moved to a ${STYLES[c.style].label.toLowerCase()} approach` : ""}.`, 2);
      note(state, `${teamLabel(team)}: ${ownerNow} took over; the club now runs ${STYLES[c.style].label.toLowerCase()}.`);
    }
    // A coach-run club whose coach leaves goes back to its GM.
    const hc = staffId(state, team, "HC");
    const gm = staffId(state, team, "GM");
    if (hc !== c.hc) {
      if (c.governance === "coach" && c.hc) { c.governance = "gm"; remember(state, team, "The head coach who ran the roster left; the GM took it back."); }
      c.hc = hc;
    }
    if (gm !== c.gm) c.gm = gm;
    // A head coach or GM search that drags past five weeks is a messy one.
    for (const x of state.staff?.searches ?? []) {
      if (x.team !== team || (x.role !== "HC" && x.role !== "GM") || x.agreed || daysBetween(x.opened, state.date) <= 35) continue;
      const key = `${x.role}-${x.opened}`;
      if (!c.slow.includes(key)) { c.slow.unshift(key); c.slow.splice(8); }
    }
  }
}

/** Unexpected exits: a coordinator or executive leaves mid-year for health or family. */
function suddenExits(state: GameState): void {
  if (!state.date.endsWith("-10")) return;
  for (const t of TEAMS) {
    const r = rand(state, `exit-${t.id}-${state.date}`);
    if (r() >= 0.004) continue;
    const role: StaffRole = (["OC", "DC", "STC"] as StaffRole[])[Math.floor(r() * 3)];
    const id = staffId(state, t.id, role);
    if (!id) continue;
    const who = staff(state).people[id];
    const why = r() < 0.5 ? "a family health matter" : "personal reasons";
    fire(state, id, true);
    openSearch(state, t.id, role, "retired", id);
    news(state, `${teamLabel(t.id)} ${role === "OC" ? "offensive coordinator" : role === "DC" ? "defensive coordinator" : "special teams coordinator"} ${who.name} steps away for ${why}`);
    if (t.id === state.userTeam) send(state, "staff", "General Manager", `${who.name} is leaving`, `${who.name} told us he has to step away for ${why}. We'll need a new coordinator; the search is open on the Staff page.`);
  }
}

/** Each spring a good area scout may be hired away to run another club's scouting, and rise from there. */
function scoutCareers(state: GameState): void {
  if (state.date.slice(5) !== "05-20" || !state.scouts) return;
  const sc = scouts(state);
  const r = rand(state, `scout-move-${state.date}`);
  const season = Number(state.date.slice(0, 4));
  for (const x of [...sc.staff]) {
    if (x.eye < 70 || season - x.since < 2 || r() >= 0.12) continue;
    const to = TEAMS.filter((t) => t.id !== state.userTeam)[Math.floor(r() * 31)].id;
    const title = r() < 0.25 ? "assistant general manager" : "director of college scouting";
    const i = sc.staff.indexOf(x);
    // A new area scout comes in for the same group.
    if (i < 0) continue;
    replaceScout(state, x.id);
    news(state, `The ${teamLabel(to)} hire ${x.name} from the ${teamLabel(state.userTeam)} as ${title}`);
    send(state, "staff", "Director of college scouting", `${x.name} is leaving for the ${teamLabel(to)}`,
      `${x.name} took the ${title} job with the ${teamLabel(to)}. It's a step up we can't match. I've hired a new area scout to cover his positions.`);
    remember(state, to, `Hired ${x.name} away from us.`);
    note(state, `${x.name} left our scouting staff to become the ${teamLabel(to)} ${title}.`);
  }
}

// ---- The yearly review ----

/** After each season: reputations settle, and clubs adapt to how things went. */
function yearly(state: GameState): void {
  const s = rivals(state);
  const seasons = history(state).seasons;
  const last = seasons[seasons.length - 1];
  const prev = seasons[seasons.length - 2];
  if (!last || s.reviewed === last.season) return;
  s.reviewed = last.season;
  const log = staff(state).log;
  for (const [team, c] of Object.entries(s.clubs)) {
    if (team === state.userTeam) continue;
    const year = (l: { date: string }) => daysBetween(l.date, state.date) < 365;
    const firedHC = log.filter((l) => l.team === team && year(l) && /fire/i.test(l.text) && /head coach/i.test(l.text)).length;
    const fired = log.filter((l) => l.team === team && year(l) && /fire/i.test(l.text)).length;
    const playoff = !!last.playoffs[team];
    c.rep = clamp(c.rep + (60 - c.rep) * 0.2 - firedHC * 8 - Math.max(0, fired - firedHC) * 2 + (playoff ? 3 : 0) + (last.champion === team ? 6 : 0));
    // Long or messy searches cost candidates' trust too.
    const messy = c.slow.filter((k) => year({ date: k.slice(-10) })).length;
    c.hiring = clamp(c.hiring + (50 - c.hiring) * 0.25 - firedHC * 10 - messy * 6 + (c.rep >= 70 ? 3 : 0));
    // Adapting: owners rethink when results argue with the plan.
    const rec = last.records[team];
    const prevRec = prev?.records[team];
    if (!rec) continue;
    const wp = rec[0] / Math.max(1, rec[0] + rec[1] + rec[2]);
    const prevWp = prevRec ? prevRec[0] / Math.max(1, prevRec[0] + prevRec[1] + prevRec[2]) : 0.5;
    const r = rand(state, `adapt-${team}-${last.season}`);
    let to: ClubProfile["style"] | null = null;
    if (c.style === "winNow" && wp < 0.4 && prevWp < 0.45 && r() < 0.5) to = "builder";
    else if (c.style === "builder" && wp > 0.6 && r() < 0.4) to = "winNow";
    else if (c.tight && c.style !== "profit" && r() < 0.5) to = "profit";
    else if (c.style === "profit" && !c.tight && c.cash > 300 * M && wp < 0.35 && r() < 0.3) to = "steady";
    if (to) {
      remember(state, team, `After a ${rec[0]}-${rec[1]} season the club moved from ${STYLES[c.style].label.toLowerCase()} to ${STYLES[to].label.toLowerCase()}.`, 1);
      note(state, `${teamLabel(team)} change course: ${STYLES[c.style].label.toLowerCase()} to ${STYLES[to].label.toLowerCase()} after ${rec[0]}-${rec[1]}.`);
      c.style = to;
      c.patience = to === "winNow" ? 2 : to === "builder" ? 4 : 3;
    }
  }
}

export function repWord(x: number): string {
  return x >= 75 ? "One of the best-run clubs" : x >= 60 ? "Well regarded" : x >= 45 ? "Ordinary" : x >= 30 ? "Seen as unstable" : "A cautionary tale";
}

export function hiringWord(x: number): string {
  return x >= 65 ? "Candidates want the job" : x >= 45 ? "A normal pull with candidates" : "Candidates hesitate: too many firings and messy searches";
}

/** A club profile in words for the Owners page. */
export function profile(state: GameState, team: string): { owner: string; style: string; governance: string; rep: string; hiring: string; budget: ReturnType<typeof budget>; money: string; memory: string[]; meddles: string[]; history: string[] } {
  const c = club(state, team);
  const b = budget(state, team);
  const sales = (state.franchise?.sales ?? []).filter((x) => x.team === team && !x.real);
  return {
    owner: c.owner, style: `${STYLES[c.style].label}: ${STYLES[c.style].what}`, governance: GOVERNANCE[c.governance],
    rep: repWord(c.rep), hiring: hiringWord(c.hiring), budget: b,
    money: c.tight ? "Tight: spending cut and the credit line in use" : c.cash > 400 * M ? "Flush" : "Comfortable",
    memory: c.memory.slice(0, 6).map((m) => `${m.date.slice(0, 4)}: ${m.text}`),
    meddles: c.meddles.slice(0, 4).map((m) => `${m.date}: ${m.text}`),
    history: [`Before 2026: ${CONTROL[team] ?? "its owners"}`, ...sales.map((x) => `${x.date.slice(0, 4)}: sold to ${x.buyer} for ${money(x.price)}`)],
  };
}

export function rivalsDaily(state: GameState): void {
  const s = rivals(state);
  if (state.date.endsWith("-01")) monthlyCash(state);
  meddle(state);
  if (state.date.endsWith("-01") || state.date.endsWith("-15")) turnover(state);
  suddenExits(state);
  scoutCareers(state);
  if (state.date.slice(5) === "05-15") yearly(state);
  void s; void addDays;
}

export function ensureRivals(state: GameState): void {
  rivals(state);
}
