// Season narratives: the stories that come from the calendar and the record
// books rather than from one day's news. Weekly award ladders (MVP every
// week, the other races every other week), the playoff picture once the
// season turns for home with clinchings and eliminations as they happen, the
// trade deadline countdown, draft stock rising and falling between mock
// drafts, anniversaries ("five years ago today", our club's sagas, draft
// classes ten and twenty years on), milestone and record watches from career
// stats, season retrospectives for every club and the league, and tributes
// when a long or great career ends. Everything is written by the story
// engine as "season" facts.
import { addDays, daysBetween, weekday } from "../dates";
import { careerTotals, MILESTONES, NFL_CAREER } from "../careerstats";
import { FORMAT } from "../format";
import { hofCase } from "../halloffame";
import { AWARD_NAME, awardLadders } from "../honors";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, SCHEDULE, TEAMS, TEAM_BY_ID } from "../league";
import { liveIds } from "../live";
import { mediaState } from "../outlets";
import { draftClass } from "../prospects";
import { schoolName } from "../collegeData";
import { seasonTotals } from "../stats";
import { seedConference, standings, type Record_ } from "../standings";
import { teamMedia } from "../teammedia";
import type { Award, GameState, NarrState } from "../types";
import { fileFacts } from "./compose";
import { playerSlots, teamSlots, type Fact } from "./facts";

const K = () => RULES.keyDates;

export function narrState(state: GameState): NarrState {
  return (mediaState(state).narr ??= { ladder: {}, marks: {}, retired: [] });
}

/** Called when a player retires: the tribute desk decides tomorrow whether the career earns one. */
export function noteRetirement(state: GameState, id: string): void {
  const n = narrState(state);
  if (!n.retired.includes(id)) n.retired.push(id);
}

type Slots = Fact["slots"];

function fact(state: GameState, kind: string, key: string, value: number, o: { teams?: string[]; players?: string[]; tags?: Fact["tags"]; slots: Slots }): Fact {
  const us = state.userTeam;
  const teams = (o.teams ?? []).filter((t) => TEAM_BY_ID[t]);
  const ours = teams.includes(us) || (o.players ?? []).some((p) => state.players[p]?.team === us);
  return {
    id: `season:${kind}:${key}`, type: `season.${kind}`, family: "season", kind: kind === "tribute" || kind === "anniversary" ? "league" : "trend",
    teams, players: o.players ?? [], value: Math.min(95, value + (ours ? 15 : 0)), ours,
    tags: { [kind]: true, ours, ...(o.tags ?? {}) }, slots: o.slots,
  };
}

const playerTeam = (state: GameState, id: string) => state.players[id]?.team ?? "";
const names = (state: GameState, ids: string[]) => ids.map((id, i) => `${i + 1}. ${PLAYER_BY_ID[id]?.name} (${PLAYER_BY_ID[id]?.position}, ${TEAM_BY_ID[playerTeam(state, id)]?.name ?? "free agent"})`).join("; ");

/** The award races, ranked by the same ballot the voters will use. Tuesdays from week 5. */
function ladders(state: GameState, week: number, out: Fact[]): void {
  const n = narrState(state);
  const races: Award[] = week % 2 ? ["MVP", "OPOY", "DROY"] : ["MVP", "DPOY", "OROY"];
  const board = awardLadders(state, Math.min(6, Math.max(2, week - 2)));
  for (const award of races) {
    const ids = board[award] ?? [];
    if (ids.length < 3) continue;
    const before = n.ladder[award] ?? [];
    const leader = ids[0];
    const was = before[0];
    const climber = ids.slice(1).find((id) => before.includes(id) && before.indexOf(id) - ids.indexOf(id) >= 2) ?? ids.slice(1).find((id) => before.length && !before.includes(id));
    n.ladder[award] = ids;
    out.push(fact(state, "award", `${RULES.season}:${week}:${award}`, award === "MVP" ? 62 : 45, {
      teams: [playerTeam(state, leader)].filter(Boolean), players: [leader, ...(climber ? [climber] : [])],
      tags: { newLeader: !!was && was !== leader, holds: was === leader, climber: !!climber, rookie: award === "OROY" || award === "DROY", late: week >= 13 },
      slots: {
        P: playerSlots(state, leader), Q: climber ? playerSlots(state, climber) : undefined, W: was && was !== leader ? playerSlots(state, was) : undefined,
        award: AWARD_NAME[award], short: award, week, list: names(state, ids),
      },
    }));
  }
}

/** A team's best possible finish: every game it has left, won. */
function maxWins(r: Record_): number {
  return r.w + 0.5 * r.t + (FORMAT.games - r.w - r.l - r.t);
}

/** The playoff picture: Wednesdays from week 10, and clinchings and eliminations the day they happen. */
function picture(state: GameState, week: number, out: Fact[]): void {
  const table = standings(state);
  const n = narrState(state);
  const wins = (r: Record_) => r.w + 0.5 * r.t;
  for (const conf of ["AFC", "NFC"] as const) {
    const seeds = seedConference(state, conf);
    const field = seeds.length;
    const lastIn = table[seeds[field - 1]];
    const out1 = TEAMS.filter((t) => t.conference === conf && !seeds.includes(t.id)).map((t) => table[t.id]).sort((a, b) => wins(b) - wins(a));
    // Clinched the division: nobody else in it can catch them. Eliminated: they can't reach the last team in.
    for (const t of TEAMS.filter((x) => x.conference === conf)) {
      const r = table[t.id];
      const rivals = TEAMS.filter((x) => x.division === t.division && x.conference === conf && x.id !== t.id).map((x) => table[x.id]);
      const key = `${RULES.season}:${t.id}`;
      if (!n.marks[`${key}:div`] && rivals.every((x) => maxWins(x) < wins(r))) {
        n.marks[`${key}:div`] = state.date;
        out.push(fact(state, "clinch", key, 60, { teams: [t.id], slots: { T: teamSlots(state, t.id, table), div: `${conf} ${t.division}` } }));
      }
      if (!n.marks[`${key}:out`] && lastIn && maxWins(r) < wins(lastIn) && week >= 8) {
        n.marks[`${key}:out`] = state.date;
        out.push(fact(state, "eliminated", key, 38, { teams: [t.id], tags: { early: week <= 13 }, slots: { T: teamSlots(state, t.id, table) } }));
      }
    }
    if (weekday(state.date) !== "Wednesday" || week < 10) continue;
    const bubble = [table[seeds[field - 2]], lastIn, ...out1.slice(0, 2)].filter(Boolean);
    const line = seeds.map((id, i) => `${i + 1}. ${TEAM_BY_ID[id].name} (${table[id].w}-${table[id].l}${table[id].t ? `-${table[id].t}` : ""})`).join("; ");
    const left = FORMAT.games - (lastIn ? lastIn.w + lastIn.l + lastIn.t : 0);
    out.push(fact(state, "playoffs", `${RULES.season}:${week}:${conf}`, 55, {
      teams: [seeds[0], ...bubble.map((r) => r.team)], tags: { final: left <= 1, late: left <= 4 },
      slots: {
        conf, line, left, T: teamSlots(state, seeds[0], table), X: lastIn ? teamSlots(state, lastIn.team, table) : undefined,
        Y: out1[0] ? teamSlots(state, out1[0].team, table) : undefined, bubble: bubble.map((r) => TEAM_BY_ID[r.team].name).join(", "),
      },
    }));
  }
}

/** The trade deadline countdown: two weeks, one week, three days, the eve and the day itself. */
function countdown(state: GameState, out: Fact[]): void {
  const days = daysBetween(state.date, K().tradeDeadline);
  if (![14, 7, 3, 1, 0].includes(days)) return;
  const table = standings(state);
  const rows = TEAMS.map((t) => table[t.id]).sort((a, b) => b.w - a.w || a.l - b.l);
  const buyers = rows.slice(0, 4).map((r) => r.team);
  const sellers = rows.slice(-4).map((r) => r.team);
  const us = state.userTeam;
  out.push(fact(state, "deadline", `${RULES.season}:${days}`, days <= 1 ? 62 : 48, {
    teams: [buyers[0], sellers[sellers.length - 1]],
    tags: { today: days === 0, eve: days === 1, buyer: buyers.includes(us), seller: sellers.includes(us) },
    slots: {
      days, T: teamSlots(state, buyers[0], table), X: teamSlots(state, sellers[sellers.length - 1], table),
      buyers: buyers.map((t) => TEAM_BY_ID[t].name).join(", "), sellers: sellers.map((t) => TEAM_BY_ID[t].name).join(", "),
    },
  }));
}

/** Draft stock: who climbed or slid between an analyst's mock drafts. */
function stock(state: GameState, out: Fact[]): void {
  const mocks = state.draft?.mocks ?? [];
  const now = mocks[0];
  if (!now || now.date !== state.date) return;
  const prev = mocks.slice(1).find((m) => m.outlet === now.outlet) ?? mocks[1];
  if (!prev) return;
  const dc = draftClass(state.seed);
  const slot = (list: string[], id: string) => { const i = list.indexOf(id); return i < 0 ? 99 : i; };
  // Climbers: up eight or more spots into the top 64. Sliders: down ten or more from the top 40.
  const risers = now.players.slice(0, 64).filter((id) => slot(prev.players, id) - slot(now.players, id) >= 8)
    .sort((x, y) => (slot(prev.players, y) - slot(now.players, y)) - (slot(prev.players, x) - slot(now.players, x))).slice(0, 2);
  const fallers = prev.players.slice(0, 40).filter((id) => slot(now.players, id) - slot(prev.players, id) >= 10).slice(0, 2);
  for (const id of [...risers, ...fallers]) {
    const p = dc.byId[id];
    if (!p) continue;
    const i = slot(now.players, id), was = slot(prev.players, id);
    const rise = i < was;
    out.push(fact(state, "stock", `${now.date}:${id}`, i < 32 ? 42 : 32, {
      tags: { rise, fall: !rise, firstRound: i < 32, gone: i >= 99, top10: i < 10, fromNowhere: was >= 99 },
      slots: {
        D: { name: p.name, pos: p.position, school: schoolName(p.school) },
        now: i + 1, was: was + 1, analyst: now.analyst, outlet: now.outlet,
      },
    }));
  }
}

/** Anniversaries: our club's own past on this date, its sagas, and draft classes ten and twenty years on. */
function anniversaries(state: GameState, out: Fact[]): void {
  const t = teamMedia(state);
  const us = state.userTeam;
  const date = state.date;
  const year = Number(date.slice(0, 4));
  for (const n of [1, 3, 5, 10, 15, 20, 25]) {
    const then = `${year - n}${date.slice(4)}`;
    const hits = t.archive.filter((a) => a.date === then);
    const pick = hits.find((a) => /trade|sign|hire|fire|draft|record|title|Super Bowl|stadium/i.test(a.headline)) ?? (n >= 5 ? hits[0] : undefined);
    if (!pick) continue;
    out.push(fact(state, "anniversary", `${date}:${n}`, 30 + Math.min(20, n * 2), {
      teams: [us], tags: { round: n % 5 === 0, long: n >= 10 },
      slots: { T: teamSlots(state, us), years: n, headline: pick.headline.replace(/[.!?]+$/, ""), then: then },
    }));
    break;
  }
  for (const s of t.sagas) {
    if (RULES.season > s.until || s.told.includes(RULES.season)) continue;
    if (date.slice(5) !== s.start.slice(5) || date === s.start) continue;
    s.told.push(RULES.season);
    const years = year - Number(s.start.slice(0, 4));
    out.push(fact(state, "saga", `${s.key}:${years}`, 40, {
      teams: [us], tags: { fresh: years < 3 },
      slots: { T: teamSlots(state, us), years, title: s.title.replace(/[.!?]+$/, "") },
    }));
  }
  if (date === K().draftStart) {
    for (const n of [10, 20]) {
      const cls = Object.values(PLAYER_BY_ID).filter((p) => p.rookieYear === year - n && p.draft.round === 1 && p.draft.overall);
      if (!cls.length) continue;
      const best = cls.map((p) => ({ p, c: hofCase(state, p.id) })).filter((x) => x.c)
        .sort((a, b) => (b.c!.pb * 2 + b.c!.ap * 4 + (b.c!.to - b.c!.from)) - (a.c!.pb * 2 + a.c!.ap * 4 + (a.c!.to - a.c!.from)))[0];
      const first = cls.find((p) => p.draft.overall === 1);
      if (!best) continue;
      out.push(fact(state, "draftclass", `${year}:${n}`, 45, {
        players: [best.p.id, ...(first && first.id !== best.p.id ? [first.id] : [])],
        tags: { firstWasBest: first?.id === best.p.id, hasFirst: !!first },
        slots: {
          years: n, year: year - n, P: playerSlots(state, best.p.id), Q: first && first.id !== best.p.id ? playerSlots(state, first.id) : undefined,
          pb: best.c!.pb, size: cls.length,
        },
      }));
    }
  }
}

/** Milestone and record watches: Thursdays in season, players within two games of a round number or a record. */
function watches(state: GameState, out: Fact[]): void {
  const found: { id: string; key: string; mark: number; v: number; record: boolean }[] = [];
  for (const id of liveIds(state)) {
    if (!state.players[id]?.team || !PLAYER_BY_ID[id]) continue;
    const t = careerTotals(state, id, true);
    const g = Math.max(1, Number(t.g ?? 0));
    for (const [key, steps] of Object.entries(MILESTONES)) {
      const v = Number(t[key] ?? 0);
      if (!v) continue;
      const rate = v / g;
      const [rec] = NFL_CAREER[key];
      if (v < rec && rec - v <= rate * 17) found.push({ id, key, mark: rec, v, record: true });
      const next = steps.find((m) => m > v);
      if (next && next - v <= rate * 2) found.push({ id, key, mark: next, v, record: false });
    }
  }
  const n = narrState(state);
  for (const w of found.sort((a, b) => Number(b.record) - Number(a.record) || b.mark - a.mark).slice(0, 3)) {
    const key = `${w.id}:${w.key}:${w.mark}:${w.record}`;
    if (n.marks[key] && daysBetween(n.marks[key], state.date) < (w.record ? 28 : 60)) continue;
    n.marks[key] = state.date;
    const [, holder, what] = NFL_CAREER[w.key];
    out.push(fact(state, w.record ? "recordwatch" : "milestone", `${state.date}:${key}`, w.record ? 60 : 40, {
      teams: [state.players[w.id]!.team!], players: [w.id], tags: { close: w.mark - w.v <= (w.mark * 0.01) },
      slots: { P: playerSlots(state, w.id), T: teamSlots(state, state.players[w.id]!.team!), mark: w.mark.toLocaleString(), now: Math.round(w.v).toLocaleString(), need: Math.max(1, Math.round(w.mark - w.v)).toLocaleString(), what, holder },
    }));
  }
}

/** The best season on a club's roster, by the voters' production score. */
function bestOn(state: GameState, team: string): string | undefined {
  const totals = seasonTotals(state, "REG");
  let best: string | undefined;
  let bv = 0;
  for (const [id, row] of Object.entries(totals)) {
    if (row.team !== team || !PLAYER_BY_ID[id]) continue;
    const l = row.line as Record<string, number>;
    const v = Number(l.passYds ?? 0) / 25 + Number(l.passTd ?? 0) * 4 + Number(l.rushYds ?? 0) / 10 + Number(l.recYds ?? 0) / 10 + (Number(l.rushTd ?? 0) + Number(l.recTd ?? 0)) * 6 + Number(l.sacks ?? 0) * 8 + Number(l.defInt ?? 0) * 10;
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}

/** Season retrospectives: clubs out of the playoffs the day after the regular season, the rest after the Super Bowl, then the league's year. */
function retrospectives(state: GameState, out: Fact[]): void {
  const date = state.date;
  const end = addDays(K().regularSeasonEnd, 1);
  const after = addDays(K().superBowl, 2);
  if (date !== end && date !== after) return;
  const table = standings(state);
  const seeds = state.seeds ? [...state.seeds.AFC, ...state.seeds.NFC] : [];
  const expect = state.staff?.expect ?? {};
  const sb = SCHEDULE.find((g) => g.type === "POST" && g.round === "SB");
  const res = sb ? state.results[sb.id] : undefined;
  const champ = res ? (res.homeScore > res.awayScore ? res.home : res.away) : undefined;
  const runner = res ? (res.homeScore > res.awayScore ? res.away : res.home) : undefined;
  const clubs = TEAMS.map((t) => t.id).filter((t) => (date === end ? !seeds.includes(t) : seeds.includes(t)));
  for (const team of clubs) {
    const r = table[team];
    if (!r) continue;
    const pct = (r.w + 0.5 * r.t) / Math.max(1, r.w + r.l + r.t);
    const gap = pct - (expect[team] ?? 0.5);
    const star = bestOn(state, team);
    out.push(fact(state, "retro", `${RULES.season}:${team}`, team === champ ? 75 : 30, {
      teams: [team], players: star ? [star] : [],
      tags: { champion: team === champ, runnerUp: team === runner, playoffs: seeds.includes(team), beat: gap >= 0.12, fell: gap <= -0.12, bad: pct < 0.3, good: pct >= 0.65 },
      slots: { T: teamSlots(state, team, table), P: star ? playerSlots(state, star) : undefined, season: RULES.season },
    }));
  }
  if (date === after && champ && runner) {
    const mvp = state.honors?.awards[RULES.season]?.find((a) => a.award === "MVP");
    out.push(fact(state, "yearinreview", `${RULES.season}`, 80, {
      teams: [champ, runner], players: mvp ? [mvp.winner] : [], tags: { repeat: state.history?.seasons.slice(-1)[0]?.champion === champ },
      slots: { T: teamSlots(state, champ, table), X: teamSlots(state, runner, table), P: mvp ? playerSlots(state, mvp.winner) : undefined, season: RULES.season },
    }));
  }
}

/** Tributes when a long or decorated career ends; the greats get the full treatment. */
function tributes(state: GameState, out: Fact[]): void {
  const n = narrState(state);
  const ids = n.retired.splice(0);
  for (const id of ids) {
    const p = PLAYER_BY_ID[id];
    // Short careers get no tribute; reading the full case is only worth it for the long ones.
    const c = p && (p.yearsExp ?? 0) >= 6 ? hofCase(state, id) : null;
    if (!p || !c) continue;
    const seasons = c.to - c.from + 1;
    const legend = c.pb >= 6 || c.ap >= 2 || (c.awards.mvp ?? 0) > 0;
    // A tribute is for the decorated or the rare long career, not every veteran who stops playing.
    if (!legend && c.pb < 2 && c.ap < 1 && !(seasons >= 13 && c.pb >= 1)) continue;
    const team = state.players[id]?.lastTeam ?? c.teams[c.teams.length - 1];
    out.push(fact(state, "tribute", id, legend ? 72 : 34, {
      teams: [team].filter((t): t is string => !!t && !!TEAM_BY_ID[t]), players: [id],
      tags: { legend, oneTeam: c.teams.length === 1, ring: c.rings > 0, honored: c.pb >= 2 || c.ap >= 1 },
      slots: {
        P: playerSlots(state, id), T: team && TEAM_BY_ID[team] ? teamSlots(state, team) : undefined, seasons, pb: c.pb, ap: c.ap, rings: c.rings,
        from: c.from, to: c.to, clubs: c.teams.length,
      },
    }));
  }
}

/** The season's calendar stories for today. Runs after the day's own coverage. */
export function narrativesDaily(state: GameState): void {
  const date = state.date;
  const out: Fact[] = [];
  const start = K().regularSeasonStart;
  const inSeason = date >= start && date <= K().regularSeasonEnd;
  const week = inSeason ? Math.floor(daysBetween(start, date) / 7) + 1 : 0;
  if (inSeason && weekday(date) === "Tuesday" && week >= 5) ladders(state, week, out);
  if (inSeason && (GAMES_BY_DATE[date]?.length || weekday(date) === "Wednesday")) picture(state, week, out);
  if (inSeason && weekday(date) === "Thursday" && week >= 2) watches(state, out);
  countdown(state, out);
  stock(state, out);
  anniversaries(state, out);
  retrospectives(state, out);
  tributes(state, out);
  // Retrospective days carry a story for every club out of it.
  if (out.length) fileFacts(state, out, Math.max(14, out.length * 2));
}
