// How the offseason went and what fans expect. The day after the Super Bowl
// the league's read of every roster is noted; in late June, after minicamp,
// the media grade every team's offseason (free agency, trades, the draft and
// how the roster changed) and our GM sends a self-assessment. Fans set their
// expectations for the season from last year's record and the offseason, and
// the media settle on a few storylines about the team. When the regular
// season ends, the record is measured against those expectations: beating
// them lifts the fans, falling short sours them.
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { gradePoints, letter, OUTLETS } from "./grades";
import { money, news, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { capScale } from "./market";
import { addStory, gradeLean, MEDIA, MEDIA_BY_ID } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { depthChart } from "./roster";
import { seasonTotals } from "./stats";
import { standings } from "./standings";
import { teamStaff } from "./staff";
import { positionStrength, rosterOutlook, trades } from "./trades";
import type { GameState, Position, ReviewState, Storyline } from "./types";

const KEY = RULES.keyDates;
const M = 1_000_000;
const AVG_GPA = 2.85;

export function review(state: GameState): ReviewState | undefined {
  return state.review;
}

/** Offseason grades come out two weeks after minicamp starts, in the quiet before camp. */
export function gradesDay(): string {
  return addDays(KEY.minicampStart, 14);
}

const name = (id: string) => PLAYER_BY_ID[id]?.name ?? "Unknown";
/** Position groups in the GM's words (specialists left out: nobody grades an offseason by its long snapper). */
const GROUP: Partial<Record<Position, string>> = {
  QB: "quarterback", RB: "running back", WR: "receiver", TE: "tight end", OT: "tackle", OG: "guard", C: "center",
  EDGE: "edge rusher", IDL: "the interior of the defensive line", LB: "linebacker", CB: "cornerback", S: "safety",
};
const nick = (team: string) => TEAM_BY_ID[team].name;

export function expectLabel(wins: number): string {
  return wins >= 12 ? "Super Bowl or bust" : wins >= 10.5 ? "A playoff team, and more" : wins >= 9 ? "A playoff team"
    : wins >= 7.5 ? "In the race for a wild card" : wins >= 6 ? "Signs of progress" : "A rebuild; fans want to see the plan";
}

function snapshot(state: GameState): ReviewState["before"] {
  const us = state.userTeam;
  return {
    date: state.date,
    wp: { ...rosterOutlook(state) },
    pos: positionStrength(state, us) as Record<string, number>,
    hc: teamStaff(us).HC?.id,
    qb: depthChart(state, us).QB?.[0],
  };
}

/** The draft-day grades our GM gave every pick, averaged by team, and our picks: kept when the league rolls over. */
export function noteDraft(state: GameState): void {
  const r = state.review;
  const made = state.draft?.made ?? [];
  if (!r || !made.length) return;
  r.picks = made.filter((m) => m.team === state.userTeam).sort((a, b) => a.overall - b.overall).map((m) => [m.player, m.overall]);
  const sum: Record<string, [number, number]> = {};
  for (const m of made) {
    if (!m.grade) continue;
    const s = (sum[m.team] ??= [0, 0]);
    s[0] += gradePoints(m.grade);
    s[1]++;
  }
  if (Object.keys(sum).length) r.draft = Object.fromEntries(Object.entries(sum).map(([t, [p, n]]) => [t, p / n]));
}

/** Each outlet's average grade for a team's signings and trades this offseason, weighted by money. */
function movesGpa(state: GameState, since: string): Record<string, Record<string, number>> {
  const acc: Record<string, Record<string, [number, number]>> = {};
  const add = (outlet: string, team: string, g: string, w: number) => {
    const a = ((acc[outlet] ??= {})[team] ??= [0, 0]);
    a[0] += gradePoints(g) * w;
    a[1] += w;
  };
  for (const s of state.signings) {
    if (s.date < since || !s.grades?.length) continue;
    for (const g of s.grades) add(g.outlet, s.team, g.grade, Math.max(1, s.apy / M));
  }
  for (const t of trades(state).log) {
    if (t.date < since || t.status === "voided" || !t.grades) continue;
    for (const [team, gs] of Object.entries(t.grades)) for (const g of gs) add(g.outlet, team, g.grade, 10);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const [o, teams] of Object.entries(acc)) out[o] = Object.fromEntries(Object.entries(teams).map(([t, [p, w]]) => [t, p / w]));
  return out;
}

function lastRecord(state: GameState, team: string): number | undefined {
  const rec = state.history?.seasons.find((x) => x.season === RULES.season - 1)?.records[team];
  return rec ? rec[0] + 0.5 * rec[2] : undefined;
}

/** Fans' expected wins: last year's record, the roster as the league sees it, and the offseason's buzz. */
function expectedWins(state: GameState, gpa: number, newCoach: boolean): number {
  const us = state.userTeam;
  const last = lastRecord(state, us) ?? 8.5;
  const prior = rosterOutlook(state)[us];
  const w = 8.5 + 0.4 * (last - 8.5) + 17 * (prior - 0.5) * 0.7 + (gpa - AVG_GPA) * 0.6 + (newCoach ? 0.3 : 0);
  return Math.max(3, Math.min(13.5, Math.round(w * 2) / 2));
}

function gradeOffseason(state: GameState, r: ReviewState): void {
  const us = state.userTeam;
  const before = r.before!;
  const after = rosterOutlook(state);
  const delta: Record<string, number> = {};
  for (const t of TEAMS) delta[t.id] = after[t.id] - (before.wp[t.id] ?? 0.5);
  const vals = Object.values(delta);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  const moves = movesGpa(state, before.date);
  const grades: Record<string, Record<string, string>> = {};
  for (const o of OUTLETS) {
    grades[o.name] = {};
    for (const t of TEAMS) {
      const rng = rngFor(state.seed, `offgrade:${r.season}:${o.name}:${t.id}`);
      const z = (delta[t.id] - mean) / sd;
      const ratio = 0.985 + 0.07 * z + 0.04 * ((moves[o.name]?.[t.id] ?? AVG_GPA) - AVG_GPA) + 0.035 * ((r.draft?.[t.id] ?? AVG_GPA) - AVG_GPA) +
        gaussian(rng) * o.noise * 0.4 + gradeLean(state, o.name, t.id);
      grades[o.name][t.id] = letter(ratio);
    }
  }
  r.grades = grades;
  const ours = OUTLETS.map((o) => gradePoints(grades[o.name][us]));
  const gpa = ours.reduce((a, b) => a + b, 0) / ours.length;
  const z = (delta[us] - mean) / sd;
  // The GM grades the front office's own work, a little kinder than the press does.
  const gm = teamStaff(us).GM;
  r.gm = letter(1.02 + 0.06 * z + 0.03 * ((moves[OUTLETS[0].name]?.[us] ?? AVG_GPA) - AVG_GPA) + 0.03 * ((r.draft?.[us] ?? AVG_GPA) - AVG_GPA) + gaussian(rngFor(state.seed, `gmgrade:${r.season}`)) * 0.03);
  const newCoach = !!before.hc && teamStaff(us).HC?.id !== before.hc;
  r.expect = { wins: expectedWins(state, gpa, newCoach), date: state.date };
  state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + (gpa - AVG_GPA) * 3));

  // The GM's memo: what we did, where the roster moved, and the grade.
  const signed = state.signings.filter((s) => s.team === us && s.date >= before.date && s.kind === "free-agent").sort((a, b) => b.apy - a.apy);
  const traded = trades(state).log.filter((t) => t.date >= before.date && t.status !== "voided" && t.teams.includes(us)).length;
  const drafted = r.picks ?? [];
  const posAfter = positionStrength(state, us);
  const moved = (Object.keys(posAfter) as Position[]).filter((p) => GROUP[p]).map((p) => [p, (posAfter[p] ?? 0) - (before.pos[p] ?? posAfter[p] ?? 0)] as const);
  const better = moved.filter(([, d]) => d >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => GROUP[p]!);
  const thinner = moved.filter(([, d]) => d <= -2).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([p]) => GROUP[p]!);
  const lines = [
    `My grade for our offseason: ${r.gm}.`,
    signed.length ? `Free agency: ${signed.length} signing${signed.length === 1 ? "" : "s"}, led by ${signed.slice(0, 3).map((s) => `${name(s.player)} (${money(s.apy)} a year)`).join(", ")}.` : "Free agency: we stayed out of the big-money market.",
    traded ? `Trades: ${traded}.` : "",
    drafted.length ? `The draft: ${drafted.length} pick${drafted.length === 1 ? "" : "s"}, starting with ${name(drafted[0][0])} at No. ${drafted[0][1]}.` : "",
    better.length ? `Where we're better: ${better.join(", ")}.` : "",
    thinner.length ? `Where we're thinner than last year: ${thinner.join(", ")}.` : "",
    after[us] >= 0.6 ? "I think this is a playoff roster." : after[us] >= 0.47 ? "I think we can compete for a wild card." : "We're building. I'd judge us by how the young players come along.",
  ].filter(Boolean);
  send(state, "staff", `${gm?.name ?? "The GM"}, general manager`, "Our offseason", lines.join("\n\n"));

  // The media's grades: the paper of record runs the league table; the others weigh in on us.
  const ledger = grades[OUTLETS[0].name];
  const order = TEAMS.map((t) => t.id).sort((a, b) => gradePoints(ledger[b]) - gradePoints(ledger[a]) || delta[b] - delta[a]);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.analyst, kind: "trend", teams: [order[0], us],
    headline: `Offseason grades: the ${nick(order[0])} had the best spring in the league`,
    body: order.map((t, i) => `${i + 1}. ${teamLabel(t)}: ${ledger[t]}`).join("\n"),
  });
  const cap = MEDIA.find((o) => o.id === "capspace")!;
  const cg = grades[cap.grader!][us];
  addStory(state, {
    outlet: "capspace", by: cap.columnist, kind: "trend", teams: [us],
    headline: `The ${nick(us)} offseason: ${cg}`,
    body: gradePoints(cg) >= 3.3 ? `The ${nick(us)} spent wisely and look better for it.` : gradePoints(cg) >= 2.7
      ? `A solid, unspectacular offseason for the ${nick(us)}. They filled holes without breaking the bank.`
      : `It's hard to see how the ${nick(us)} got better this spring.` + (signed[0] && signed[0].apy > 15 * M * capScale(state, leagueYear(state.date)) ? ` ${name(signed[0].player)}'s deal will be judged on the field.` : ""),
  });
  const e = r.expect.wins;
  addStory(state, {
    outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "trend", teams: [us],
    headline: e >= 10.5 ? `${nick(us)} fans: anything short of January is a failure` : e <= 6.5 ? `${nick(us)} fans are being asked to be patient. Again.` : `Are the ${nick(us)} a playoff team? Fans think they might be`,
    body: `The phones lit up about the ${nick(us)} today. The consensus from callers: about ${e} wins. ${expectLabel(e)}.`,
  });
  news(state, `Offseason grades are out: the ${nick(order[0])} rank first; the ${nick(us)} get a ${ledger[us]} from The Gridiron Ledger`);
}

// ---- Storylines ----

function storyline(kind: string, outlet: string, title: string, player?: string): Storyline {
  return { id: `${RULES.season}:${kind}`, kind, season: RULES.season, outlet, title, player, status: "open" };
}

function pickStorylines(state: GameState, r: ReviewState): void {
  const us = state.userTeam;
  const out: Storyline[] = [];
  const hc = teamStaff(us).HC;
  if (r.before?.hc && hc && hc.id !== r.before.hc) out.push(storyline("coach", "ledger", `A new era under ${hc.name}`));
  const qb = depthChart(state, us).QB?.[0];
  if (qb && r.before?.qb && qb !== r.before.qb) out.push(storyline("qb", "blitz", `Is ${name(qb)} the answer at quarterback?`, qb));
  const since = r.before?.date ?? addDays(state.date, -120);
  const big = state.signings.filter((s) => s.team === us && s.date >= since && s.kind === "free-agent").sort((a, b) => b.apy - a.apy)[0];
  if (big && big.apy >= 15 * M * capScale(state, leagueYear(state.date))) out.push(storyline("signing", "capspace", `Will ${name(big.player)} be worth the money?`, big.player));
  const spring = state.program?.season === RULES.season ? state.program.spring : {};
  const standoff = Object.entries(spring).find(([id, p]) => p.reason === "contract" && state.players[id]?.team === us)?.[0];
  if (standoff) out.push(storyline("standoff", "sideline", `The contract standoff with ${name(standoff)}`, standoff));
  const rookie = r.picks?.find(([, overall]) => overall <= 32)?.[0];
  if (rookie && out.length < 3) out.push(storyline("rookie", "sentinel", `How soon will ${name(rookie)} help?`, rookie));
  const e = r.expect?.wins ?? 8.5;
  if (out.length < 3) out.push(e >= 10.5 ? storyline("contender", "blitz", "Playoffs or bust")
    : e <= 6.5 ? storyline("patience", "ledger", `How much patience do ${nick(us)} fans have left?`)
    : storyline("nextStep", "ledger", `Can the ${nick(us)} take the next step?`));
  r.storylines = out.slice(0, 3);
  for (const s of r.storylines) {
    const o = MEDIA_BY_ID[s.outlet];
    addStory(state, { outlet: o.id, by: o.columnist, kind: "preview", teams: [us], players: s.player ? [s.player] : undefined, headline: s.title, body: openingLine(state, s) });
  }
}

function openingLine(state: GameState, s: Storyline): string {
  const t = nick(state.userTeam);
  switch (s.kind) {
    case "coach": return `The ${t} have a new head coach and a new way of doing things. Everyone in the building says the right things in June; September is when it counts.`;
    case "qb": return `${name(s.player!)} takes over at quarterback for the ${t}. The job is his to lose, and the whole season rides on whether he can hold it.`;
    case "signing": return `The ${t} paid a premium for ${name(s.player!)}. Big contracts are judged on Sundays, and the clock starts in September.`;
    case "standoff": return `${name(s.player!)} skipped part of the spring over his contract. Whether he and the ${t} find common ground before the games count is the summer's biggest question.`;
    case "rookie": return `The ${t} spent a first-round pick on ${name(s.player!)}. Fans want to see him on the field early.`;
    case "contender": return `The ${t} are built to win now. Fans will measure the season in playoff games.`;
    case "patience": return `Another year of building for the ${t}. The question is whether fans will see progress, or just more promises.`;
    default: return `The ${t} were in the middle of the pack last year. This is the season fans want to see them climb.`;
  }
}

function settle(state: GameState, r: ReviewState): void {
  const us = state.userTeam;
  const rec = standings(state)[us];
  const wins = rec.w + 0.5 * rec.t;
  const e = r.expect?.wins ?? 8.5;
  const inPlayoffs = !!state.seeds && [...state.seeds.AFC, ...state.seeds.NFC].includes(us);
  const games = (id?: string) => (id ? seasonTotals(state, "REG")[id]?.line.g ?? 0 : 0);
  for (const s of r.storylines) {
    let ok: boolean;
    switch (s.kind) {
      case "coach": case "nextStep": ok = wins >= e + (s.kind === "nextStep" ? 1 : -0.5); break;
      case "qb": ok = games(s.player) >= 12 && wins >= e - 1; break;
      case "signing": ok = games(s.player) >= 13 && state.players[s.player!]?.team === us; break;
      case "standoff": ok = games(s.player) >= 14 && state.players[s.player!]?.team === us; break;
      case "rookie": ok = games(s.player) >= 12; break;
      case "contender": ok = inPlayoffs; break;
      default: ok = wins >= e;
    }
    s.status = ok ? "answered" : "unanswered";
    s.verdict = ok ? "The season gave a good answer." : "The question is still hanging over the team.";
    state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + (ok ? 1.5 : -1.5)));
  }
  const delta = Math.max(-8, Math.min(8, (wins - e) * 1.2));
  state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + delta));
  r.settled = true;
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.columnist, kind: "trend", teams: [us],
    headline: wins >= e + 1.5 ? `The ${nick(us)} beat every expectation` : wins <= e - 1.5 ? `A season that fell short for the ${nick(us)}` : `The ${nick(us)} were about what fans expected`,
    body: `Fans expected about ${e} wins in the summer; the ${nick(us)} finished ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}${inPlayoffs ? " and made the playoffs" : ""}. ` +
      r.storylines.map((s) => `${s.title} ${s.status === "answered" ? "Answered." : "Not yet."}`).join(" "),
  });
}

// ---- Each day ----

export function reviewDaily(state: GameState): void {
  const date = state.date;
  let r = state.review;
  // The first season: no offseason to grade, so fans go by the roster.
  if (!r && RULES.season === BASE_SEASON && date < KEY.regularSeasonStart) {
    r = state.review = { season: BASE_SEASON, storylines: [] };
    r.expect = { wins: expectedWins(state, AVG_GPA, false), date };
    pickStorylines(state, r);
  }
  // The day after the Super Bowl, a new offseason starts.
  if (date > KEY.superBowl && (!r || r.season <= RULES.season)) {
    r = state.review = { season: RULES.season + 1, storylines: [], past: r?.storylines.length ? r.storylines : r?.past, before: snapshot(state) };
  }
  if (!r) return;
  if (r.season === RULES.season && date === gradesDay() && r.before && !r.grades) {
    gradeOffseason(state, r);
    pickStorylines(state, r);
  }
  if (r.season === RULES.season && !r.settled && r.expect && date >= addDays(KEY.regularSeasonEnd, 2) && state.seeds) settle(state, r);
}
