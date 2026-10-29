/**
 * Discipline: failed drug tests and the suspensions that follow, players
 * sounding off in public, missed meetings, and the calls the owner makes about
 * them. Kept to policy matters on purpose: nothing criminal.
 */
import { changeMorale, priorities } from "./agents";
import { program } from "./camp";
import { teamPlayerIds } from "./cap";
import { dealOf, dealYear, leagueYear } from "./contracts";
import { addDays } from "./dates";
import { payCash } from "./finance";
import { money, news, send } from "./inbox";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { MEDIA_BY_ID, addStory } from "./outlets";
import { rngFor, type Rng } from "./rng";
import { keepValue, releasePlayer, rosterCount, rosterLimit } from "./roster";
import { settleMinicamp } from "./spring";
import { teamStaff } from "./staff";
import type { GameState, IncidentKind, OwnerDecision } from "./types";

const KEY = RULES.keyDates;

/** League-wide incidents a year, by kind. */
const PER_YEAR: Record<Exclude<IncidentKind, "minicamp">, number> = { ped: 7, substance: 8, comments: 14, conduct: 6 };

/** A first violation of the policy on performance-enhancing substances costs six games. */
const PED_GAMES = 6;

const COMMENTS = [
  "criticized the offensive play calling on his podcast",
  "said on social media that he deserves a bigger role",
  "publicly questioned the front office's offseason moves",
  "told reporters he is frustrated with his contract",
  "complained about his snap count after practice",
  "said the team 'doesn't have a plan' in a radio interview",
];

const CONDUCT = [
  "missed a team meeting",
  "was late for the team flight",
  "skipped a scheduled rehab session",
  "missed curfew at the team hotel",
];

function pickPlayer(state: GameState, rng: Rng, kind: IncidentKind): string | undefined {
  const team = TEAMS[Math.floor(rng() * TEAMS.length)].id;
  const ids = teamPlayerIds(state, team).filter((id) => ["camp", "active"].includes(state.players[id].status) && !state.players[id].suspended);
  if (!ids.length) return undefined;
  if (kind !== "comments") return ids[Math.floor(rng() * ids.length)];
  // The players who say things are the ones with big egos or a grievance.
  let best: string | undefined;
  let score = -Infinity;
  for (let i = 0; i < 6; i++) {
    const id = ids[Math.floor(rng() * ids.length)];
    const s = priorities(id).ego + (70 - (state.players[id].morale ?? 70)) / 60 + rng() * 0.3;
    if (s > score) {
      score = s;
      best = id;
    }
  }
  return best;
}

/** One game check: a week of base salary (base is paid over the 18 weeks of the regular season). */
function gameCheck(state: GameState, id: string): number {
  const base = dealYear(dealOf(state, id), leagueYear(state.date))?.base ?? 0;
  return Math.max(20_000, Math.round(base / 18 / 1000) * 1000);
}

function incident(state: GameState, kind: Exclude<IncidentKind, "minicamp">, rng: Rng): void {
  const id = pickPlayer(state, rng, kind);
  if (!id) return;
  const team = state.players[id].team!;
  const p = PLAYER_BY_ID[id];
  const ours = team === state.userTeam;
  const log = program(state).incidents;
  if (kind === "ped") {
    state.players[id].suspended = { games: PED_GAMES, reason: "the policy on performance-enhancing substances" };
    const when = state.date >= KEY.regularSeasonStart && state.date <= KEY.regularSeasonEnd ? "effective immediately" : "to start the regular season";
    const text = `Suspended ${PED_GAMES} games without pay for violating the policy on performance-enhancing substances`;
    log.push({ date: state.date, team, player: id, kind, games: PED_GAMES, text });
    news(state, `${p.name} (${teamLabel(team)}) suspended ${PED_GAMES} games for violating the league's PED policy`);
    addStory(state, {
      outlet: "sideline", by: MEDIA_BY_ID.sideline.insider, kind: "league", teams: [team], players: [id],
      headline: `${p.name} suspended ${PED_GAMES} games`,
      body: `The league has suspended ${p.position} ${p.name} of the ${teamLabel(team)} ${PED_GAMES} games, ${when}, for violating the policy on performance-enhancing substances. ` +
        `He can take part in practice and preseason games; his roster spot doesn't count while he serves the suspension.`,
    });
    if (ours) send(state, "league", "League Office", `${p.name} suspended`,
      `${p.name} has been suspended ${PED_GAMES} regular-season games without pay, ${when}, for violating the policy on performance-enhancing substances. ` +
      "He can practice and play in the preseason. While he serves it he goes on the reserve/suspended list and doesn't count against the 53.");
    return;
  }
  if (kind === "substance") {
    const fine = Math.round(gameCheck(state, id) / 2 / 1000) * 1000;
    log.push({ date: state.date, team, player: id, kind, fine, text: `Fined ${money(fine)} under the substance abuse policy` });
    news(state, `${p.name} (${teamLabel(team)}) fined half a game check under the substance abuse policy`);
    if (ours) send(state, "league", "League Office", `${p.name} fined`,
      `${p.name} has been fined half a game check (${money(fine)}) under the substance abuse policy. There's no suspension; he stays in the program.`);
    return;
  }
  if (kind === "conduct") {
    const what = CONDUCT[Math.floor(rng() * CONDUCT.length)];
    const fine = Math.min(50_000, gameCheck(state, id));
    payCash(state, team, -fine);
    log.push({ date: state.date, team, player: id, kind, fine, text: `Fined ${money(fine)} by the team: ${what}` });
    if (ours) send(state, "staff", hcLine(state), `${p.name} fined`,
      `${p.name} ${what}. I fined him ${money(fine)} under the club's rules and we talked it through. It's handled.`);
    return;
  }
  // Comments: the player said something in public.
  const what = COMMENTS[Math.floor(rng() * COMMENTS.length)];
  log.push({ date: state.date, team, player: id, kind, text: `${cap(what)}` });
  changeMorale(state, id, -2);
  addStory(state, {
    outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "rumor", teams: [team], players: [id],
    headline: `${p.name} sounds off`,
    body: `${p.name} ${what}. It's the kind of thing that plays well with our listeners and badly in a locker room. Your move, ${teamLabel(team)}.`,
  });
  if (!ours) return;
  const d: OwnerDecision = {
    id: `comments:${state.date}:${id}`, date: state.date, expires: addDays(state.date, 3), player: id, kind: "comments",
    title: `${p.name} sounds off`,
    body: `${p.name} ${what}. The head coach would like to know how you want it handled. If we don't hear from you, he'll deal with it inside the building.`,
    options: [
      { key: "fine", label: `Fine him for conduct detrimental (${money(gameCheck(state, id))})` },
      { key: "meet", label: "Meet with him yourself" },
      { key: "coach", label: "Leave it to the head coach" },
    ],
    fallback: "coach",
  };
  program(state).decisions.push(d);
  send(state, "staff", hcLine(state), d.title, `${d.body} Decide on the Camp page.`);
}

/** The owner's answer to a decision, or the staff's default once it expires. Returns what came of it. */
export function answerDecision(state: GameState, decisionId: string, key: string): string | null {
  const d = program(state).decisions.find((x) => x.id === decisionId);
  if (!d || d.answer || !d.options.some((o) => o.key === key)) return null;
  d.answer = key;
  const id = d.player;
  const name = PLAYER_BY_ID[id].name;
  const team = state.players[id]?.team;
  if (d.kind === "minicamp") d.outcome = settleMinicamp(state, id, key === "excuse" ? "excuse" : "fine");
  else if (!team) d.outcome = `${name} is no longer with us.`;
  else if (key === "fine") {
    const fine = gameCheck(state, id);
    payCash(state, team, -fine);
    changeMorale(state, id, -8);
    program(state).incidents.push({ date: state.date, team, player: id, kind: "comments", fine, text: `Fined ${money(fine)} by the team for conduct detrimental` });
    d.outcome = `${name} was fined ${money(fine)}. He isn't happy, and his agent let us know it.`;
  } else if (key === "meet") {
    changeMorale(state, id, 6);
    d.outcome = `You sat down with ${name}. He said his piece, you said yours, and he left feeling heard.`;
  } else {
    d.outcome = `The head coach talked to ${name} and the team moved on.`;
  }
  return d.outcome;
}

/** Decisions still waiting on the owner. */
export function openDecisions(state: GameState): OwnerDecision[] {
  return (state.program?.decisions ?? []).filter((d) => !d.answer);
}

/** Suspensions count down with each regular-season game the team plays; back on the roster after the last one. */
function serveSuspensions(state: GameState): void {
  const playing = new Set<string>();
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const r = state.results[g.id];
    if (r && g.type === "REG") playing.add(r.away).add(r.home);
  }
  if (!playing.size) return;
  for (const [id, ps] of Object.entries(state.players)) {
    if (!ps.suspended || !ps.team || !playing.has(ps.team)) continue;
    if (--ps.suspended.games > 0) continue;
    delete ps.suspended;
    const team = ps.team;
    if (team === state.userTeam) send(state, "league", "League Office", `${PLAYER_BY_ID[id].name} reinstated`, `${PLAYER_BY_ID[id].name} has served his suspension and is back on the active roster.`);
    // Back on the 53: someone has to go to make room.
    if (rosterCount(state, team).roster > rosterLimit(state)) {
      const cut = teamPlayerIds(state, team)
        .filter((x) => x !== id && state.players[x].status === "active" && !state.players[x].suspended)
        .sort((a, b) => keepValue(state, team, a) - keepValue(state, team, b))[0];
      if (cut) {
        releasePlayer(state, cut);
        if (team === state.userTeam) send(state, "staff", "General Manager", `${PLAYER_BY_ID[cut].name} released`,
          `To make room for ${PLAYER_BY_ID[id].name} we released ${PLAYER_BY_ID[cut].name} (${PLAYER_BY_ID[cut].position}).`);
      }
    }
  }
}

export function disciplineDaily(state: GameState): void {
  const p = program(state);
  serveSuspensions(state);
  for (const d of p.decisions) if (!d.answer && state.date >= d.expires) answerDecision(state, d.id, d.fallback);
  const rng = rngFor(state.seed, `discipline:${state.date}`);
  for (const kind of Object.keys(PER_YEAR) as (keyof typeof PER_YEAR)[]) {
    if (rng() < PER_YEAR[kind] / 365) incident(state, kind, rng);
  }
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function hcLine(state: GameState): string {
  const hc = teamStaff(state.userTeam).HC;
  return hc ? `${hc.name}, head coach` : "Head Coach";
}
