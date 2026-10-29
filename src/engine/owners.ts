/**
 * The other 31 owners and the annual league meeting: the Competition
 * Committee and the clubs put rule changes on the agenda, our owner can add
 * one, lobby the others, and votes; 24 of 32 votes changes a rule. How the
 * other owners feel about ours moves with every vote, trade and coaching hire,
 * and the closest of them become allies (or rivals) who follow (or fight) our
 * lead.
 *
 * The other owners are referred to by their clubs: their personalities here
 * are made up, so they aren't attached to real people's names.
 */
import { addDays, shortDate } from "./dates";
import { news, send } from "./inbox";
import { RULES, TEAMS, TEAM_BY_ID, teamLabel } from "./league";
import { MEDIA_BY_ID, addStory } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { RULE_BY_ID, RULE_CATALOG, rulesFor } from "./rules";
import type { GameState, LeagueMeeting, OwnerRelation, OwnersState, RuleProposal } from "./types";

const KEY = RULES.keyDates;

/** Votes needed to change a playing rule or league policy. */
export const VOTES_TO_PASS = 24;
/** Calls our owner can make before a meeting: goodwill runs out. */
export const LOBBY_CALLS = 8;

/** Long-tenured owners of big clubs whose word carries in the room (an assumption, not a fact about anyone). */
const HEAVYWEIGHTS = new Set(["DAL", "NE", "PIT", "KC", "NYG", "GB"]);

export function owners(state: GameState): OwnersState {
  if (state.owners) return state.owners;
  const relations: Record<string, OwnerRelation> = {};
  const us = TEAM_BY_ID[state.userTeam];
  for (const t of TEAMS) {
    if (t.id === state.userTeam) continue;
    const rng = rngFor(state.seed, `owner:${t.id}`);
    const rival = t.conference === us.conference && t.division === us.division;
    relations[t.id] = {
      rapport: Math.round((rival ? -10 : 0) + gaussian(rng) * 8),
      tradition: Math.round(rng() * 100) / 100,
      influence: Math.round(Math.min(1, (HEAVYWEIGHTS.has(t.id) ? 0.6 : 0.2) + rng() * 0.4) * 100) / 100,
    };
  }
  state.owners = { relations, rules: [], history: [] };
  return state.owners;
}

/** How an owner feels about ours, in words. */
export function relationWord(r: OwnerRelation): string {
  if (r.ally) return "Ally";
  if (r.rival) return "Rival";
  return r.rapport >= 35 ? "Close" : r.rapport >= 15 ? "Friendly" : r.rapport >= 6 ? "Warm" : r.rapport > -6 ? "Neutral" : r.rapport > -20 ? "Cool" : "Hostile";
}

/** Moves an owner's view of ours; alliances and rivalries follow from it. */
export function changeRapport(state: GameState, team: string, delta: number): void {
  const r = owners(state).relations[team];
  if (!r || !delta) return;
  r.rapport = Math.max(-100, Math.min(100, Math.round(r.rapport + delta)));
  if (r.ally && r.rapport < 10) {
    r.ally = false;
    send(state, "league", "League Office", `The ${teamLabel(team)} alliance is over`, `Things have cooled with ${teamLabel(team)} ownership; we can't count on their support anymore.`);
  }
  if (!r.rival && r.rapport <= -40) {
    r.rival = true;
    r.ally = false;
  } else if (r.rival && r.rapport > -20) r.rival = false;
}

// ---- The meeting ----

function meetingDates(): { published: string; deadline: string; voteDate: string } {
  const m = KEY.annualLeagueMeeting;
  return { published: addDays(m, -21), deadline: addDays(m, -7), voteDate: addDays(m, 2) };
}

/** The meeting this spring, once the agenda is out. */
export function currentMeeting(state: GameState): LeagueMeeting | undefined {
  const m = state.owners?.meeting;
  return m && m.year === RULES.season + 1 ? m : undefined;
}

/** Rule changes that could be proposed under this season's rules, minus what's already on the agenda. */
export function proposable(state: GameState): string[] {
  const r = rulesFor(state, RULES.season + 1);
  // Count what's already on the agenda as passed, so two proposals never fight over the same rule.
  const agenda = currentMeeting(state)?.proposals ?? [];
  for (const p of agenda) RULE_BY_ID[p.rule].apply(r);
  const on = new Set(agenda.map((p) => p.rule));
  return RULE_CATALOG.filter((c) => c.when(r) && !on.has(c.id)).map((c) => c.id);
}

function committeeView(appeal: number): RuleProposal["committee"] {
  return appeal > 0.04 ? "for" : appeal < -0.08 ? "against" : "neutral";
}

/** Three weeks out: the Competition Committee and the clubs publish their proposals. */
function publishAgenda(state: GameState): void {
  const o = owners(state);
  const d = meetingDates();
  const m: LeagueMeeting = { year: RULES.season + 1, ...d, proposals: [], calls: 0 };
  o.meeting = m;
  const rng = rngFor(state.seed, `agenda:${m.year}`);
  const draw = () => {
    const pool = proposable(state);
    return pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
  };
  // The committee brings two or three of its own; the clubs bring the ones that help them most.
  const committee = 2 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < committee; i++) {
    const rule = draw();
    if (!rule) break;
    m.proposals.push({ id: `${m.year}:${rule}`, rule, sponsor: "committee", committee: "for", lobby: {} });
  }
  const clubs = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < clubs; i++) {
    const rule = draw();
    if (!rule) break;
    const c = RULE_BY_ID[rule];
    const sponsor = TEAMS.filter((t) => t.id !== state.userTeam)
      .map((t) => ({ id: t.id, v: c.interest(state, t.id) + rng() * 0.3 }))
      .sort((a, b) => b.v - a.v)[0].id;
    m.proposals.push({ id: `${m.year}:${rule}`, rule, sponsor, committee: committeeView(c.appeal), lobby: {} });
  }
  send(state, "league", "League Office", `${m.year} playing rule and policy proposals`,
    `The proposals for the annual league meeting are out. The owners vote on ${shortDate(m.voteDate)}; a change needs ${VOTES_TO_PASS} of 32 votes.\n\n` +
    m.proposals.map((p) => `- ${RULE_BY_ID[p.rule].title} (${sponsorName(p.sponsor)})`).join("\n") +
    `\n\nClubs can submit their own until ${shortDate(m.deadline)}. The Owners page has the agenda, where each owner stands and how to vote.`);
  news(state, `The league releases ${m.proposals.length} rule change proposals ahead of the annual meeting`);
}

export function sponsorName(sponsor: string): string {
  return sponsor === "committee" ? "Competition Committee" : teamLabel(sponsor);
}

/** Our own proposal: one a year, before the deadline. */
export function submitProposal(state: GameState, rule: string): string | null {
  const m = currentMeeting(state);
  if (!m || m.done) return "There's no meeting agenda open right now.";
  if (state.date > m.deadline) return `The deadline to submit proposals was ${shortDate(m.deadline)}.`;
  if (m.proposals.some((p) => p.sponsor === state.userTeam)) return "We've already submitted a proposal this year.";
  if (!proposable(state).includes(rule)) return "That can't be proposed right now.";
  const c = RULE_BY_ID[rule];
  m.proposals.push({ id: `${m.year}:${rule}`, rule, sponsor: state.userTeam, committee: committeeView(c.appeal), lobby: {}, ourVote: true });
  news(state, `${teamLabel(state.userTeam)} propose: ${c.title.toLowerCase()}`);
  return null;
}

export function setOurVote(state: GameState, id: string, yes: boolean | undefined): void {
  const p = currentMeeting(state)?.proposals.find((x) => x.id === id);
  if (p && !p.votes) p.ourVote = yes;
}

/** How strongly an owner leans toward yes (positive) or no. `noisy` adds the vote-day uncertainty. */
function support(state: GameState, p: RuleProposal, team: string, noisy: boolean): number {
  const c = RULE_BY_ID[p.rule];
  const r = owners(state).relations[team];
  let s = c.appeal + 0.45 * c.interest(state, team) - 0.35 * (r?.tradition ?? 0.5) * c.change + 0.1;
  s += p.committee === "for" ? 0.15 : p.committee === "against" ? -0.2 : 0;
  if (p.sponsor === team) s += 1;
  if (r) {
    if (p.sponsor === state.userTeam) s += r.rapport / 250;
    // Allies follow our lead; rivals go the other way.
    if (p.ourVote !== undefined) s += (p.ourVote ? 1 : -1) * (r.ally ? 0.25 : r.rival ? -0.2 : 0);
  }
  s += p.lobby[team] ?? 0;
  if (noisy) s += gaussian(rngFor(state.seed, `vote:${p.id}:${team}`)) * 0.12;
  return s;
}

/** Each owner's lean, with the heavyweights pulling the room their way. */
function leans(state: GameState, p: RuleProposal, noisy: boolean): Record<string, number> {
  const base: Record<string, number> = {};
  for (const t of TEAMS) if (t.id !== state.userTeam) base[t.id] = support(state, p, t.id, noisy);
  const rel = owners(state).relations;
  const ids = Object.keys(base);
  const pull = ids.reduce((sum, id) => sum + Math.sign(base[id]) * rel[id].influence, 0) / ids.length;
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = base[id] + 0.12 * pull;
  return out;
}

function ourDefault(p: RuleProposal): boolean {
  return p.ourVote ?? (p.sponsor === "committee" || p.committee === "for");
}

/** The whip count: who looks like a yes, a no, or undecided, as the front office reads the room. */
export function whipCount(state: GameState, p: RuleProposal): { yes: string[]; no: string[]; undecided: string[] } {
  const l = leans(state, p, false);
  const out = { yes: [] as string[], no: [] as string[], undecided: [] as string[] };
  for (const [team, v] of Object.entries(l)) (v > 0.08 ? out.yes : v < -0.08 ? out.no : out.undecided).push(team);
  return out;
}

/** A call to another owner asking for their vote our way. Spends goodwill either way. */
export function lobby(state: GameState, id: string, team: string): string {
  const m = currentMeeting(state);
  const p = m?.proposals.find((x) => x.id === id);
  const r = owners(state).relations[team];
  if (!m || !p || !r || p.votes) return "There's nothing to lobby on.";
  if (p.ourVote === undefined) return "Decide how we're voting first.";
  if (m.calls >= LOBBY_CALLS) return "You've made all the calls you can before this meeting; any more and owners stop picking up.";
  if (p.lobby[team]) return `You've already talked to ${teamLabel(team)} ownership about this one.`;
  m.calls++;
  const rng = rngFor(state.seed, `lobby:${id}:${team}`);
  const chance = 0.35 + r.rapport / 150 + (r.ally ? 0.3 : 0) - (r.rival ? 0.35 : 0);
  const dir = p.ourVote ? 1 : -1;
  if (rng() < chance) {
    p.lobby[team] = dir * (0.25 + Math.max(0, r.rapport) / 400);
    changeRapport(state, team, -3);
    return `${teamLabel(team)} ownership heard you out and said they'd keep it in mind. That's usually a good sign.`;
  }
  p.lobby[team] = dir * 0.02;
  changeRapport(state, team, -1);
  return `${teamLabel(team)} ownership was polite and noncommittal. You don't think you moved them.`;
}

/** Meeting day: the owners vote. */
function holdVote(state: GameState): void {
  const o = owners(state);
  const m = o.meeting!;
  const lines: string[] = [];
  const us = state.userTeam;
  for (const p of m.proposals) {
    const l = leans(state, p, true);
    const votes: Record<string, boolean> = { [us]: ourDefault(p) };
    for (const [team, v] of Object.entries(l)) votes[team] = v > 0;
    p.votes = votes;
    p.yes = Object.values(votes).filter(Boolean).length;
    p.passed = p.yes >= VOTES_TO_PASS;
    const c = RULE_BY_ID[p.rule];
    if (p.passed) o.rules.push({ rule: p.rule, year: m.year, yes: p.yes, sponsor: p.sponsor });
    o.history.push({ year: m.year, rule: p.rule, sponsor: p.sponsor, yes: p.yes, passed: p.passed, ours: votes[us] });
    // Owners remember who stood with them.
    if (p.sponsor !== "committee" && p.sponsor !== us) changeRapport(state, p.sponsor, votes[us] ? 6 : -4);
    if (p.sponsor === us) for (const [team, v] of Object.entries(votes)) if (team !== us) changeRapport(state, team, v ? 2 : -2);
    lines.push(`${p.passed ? "Approved" : "Voted down"}, ${p.yes}-${32 - p.yes}: ${c.title}. We voted ${votes[us] ? "yes" : "no"}.`);
    news(state, `Owners ${p.passed ? "approve" : "reject"} proposal (${p.yes}-${32 - p.yes}): ${c.title.toLowerCase()}`);
  }
  m.done = true;
  const passed = m.proposals.filter((p) => p.passed);
  send(state, "league", "League Office", "The owners vote", `${lines.join("\n")}\n\nApproved changes take effect for the ${m.year} season.`);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "league",
    headline: passed.length ? `Owners approve ${passed.length} rule change${passed.length === 1 ? "" : "s"}` : "Owners keep the rulebook as it is",
    body: passed.length
      ? `At the annual meeting the owners approved: ${passed.map((p) => RULE_BY_ID[p.rule].title.toLowerCase()).join("; ")}. ` +
        `${m.proposals.length - passed.length} other proposal${m.proposals.length - passed.length === 1 ? "" : "s"} fell short of the ${VOTES_TO_PASS} votes needed.`
      : `None of the ${m.proposals.length} proposals reached ${VOTES_TO_PASS} votes this year.`,
  });
}

// ---- Alliances ----

export function proposeAlliance(state: GameState, team: string): string {
  const r = owners(state).relations[team];
  if (!r) return "";
  if (r.ally) return `We're already allied with ${teamLabel(team)} ownership.`;
  if (r.rapport < 30) return `${teamLabel(team)} ownership doesn't know us well enough for that yet.`;
  const rng = rngFor(state.seed, `ally:${team}:${state.date}`);
  if (rng() < 0.4 + (r.rapport - 30) / 60) {
    r.ally = true;
    changeRapport(state, team, 5);
    return `${teamLabel(team)} ownership agreed: they'll back us in the room, and we'll back them.`;
  }
  changeRapport(state, team, -3);
  return `${teamLabel(team)} ownership would rather keep their options open for now.`;
}

export function endAlliance(state: GameState, team: string): string {
  const r = owners(state).relations[team];
  if (!r?.ally) return "";
  r.ally = false;
  changeRapport(state, team, -15);
  return `The alliance with ${teamLabel(team)} ownership is over. They took it personally.`;
}

// ---- Each day ----

export function ownersDaily(state: GameState): void {
  const o = owners(state);
  const date = state.date;
  if (!KEY.annualLeagueMeeting) return;
  const d = meetingDates();
  if (date === d.published && !currentMeeting(state)) publishAgenda(state);
  const m = currentMeeting(state);
  if (m && !m.done && date === m.voteDate) holdVote(state);
  if (m && !m.done && date === m.deadline) {
    const ours = m.proposals.filter((p) => p.ourVote === undefined).length;
    if (ours) send(state, "league", "League Office", "The league meeting is a week away", `We haven't decided on ${ours} of the proposals. If you don't, our president votes with the Competition Committee (and no where it has no position).`);
  }
  // Old grudges and old favors both fade.
  if (date.endsWith("-01")) {
    for (const [team, r] of Object.entries(o.relations)) if (r.rapport) changeRapport(state, team, -Math.sign(r.rapport));
  }
}
