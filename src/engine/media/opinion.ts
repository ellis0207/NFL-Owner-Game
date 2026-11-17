// The opinion desk: columns that argue a running thesis about one club and
// come back to it every other week until the season proves it right or
// wrong; radio and podcast rundowns built from what the Huddle is talking
// about; outlet-versus-outlet debates; weekly mailbags with questions from
// fans' own accounts; and Overreaction Monday early in the season. All are
// "opinion" facts written by the story engine.
import { daysBetween, shortDate, weekday } from "../dates";
import { PLAYER_BY_ID, RULES, TEAMS, TEAM_BY_ID } from "../league";
import { mediaState, NATIONAL } from "../outlets";
import { rngFor, type Rng } from "../rng";
import { standings, type Record_ } from "../standings";
import type { GameState, OpinionState, Reporter, Thesis } from "../types";
import { arcState } from "./arcs";
import { corps, localStaff, outletOf, pickReporter, working } from "./corps";
import { MAIL } from "./content/opinion";
import { playerSlots, teamSlots, type Fact } from "./facts";
import { fileFacts } from "./compose";
import { render, type Slots } from "./grammar";
import { narrState } from "./narratives";
import { fanAccounts, trending } from "./social";
import { staff } from "../coaches";

const K = () => RULES.keyDates;

export function opinionState(state: GameState): OpinionState {
  return (mediaState(state).opinion ??= { theses: [] });
}

function voice(r: Reporter): Slots {
  return { name: r.name, outlet: outletOf(r.outlet).name };
}

function fact(state: GameState, kind: string, key: string, value: number, o: { teams?: string[]; players?: string[]; tags?: Fact["tags"]; slots: Slots; outlet?: string; reporter?: string }): Fact {
  const teams = (o.teams ?? []).filter((t) => TEAM_BY_ID[t]);
  const ours = teams.includes(state.userTeam);
  return {
    id: `op:${kind}:${key}`, type: `opinion.${kind}`, family: "opinion", kind: kind === "rundown" ? "interview" : "trend",
    teams, players: o.players ?? [], value: Math.min(90, value + (ours ? 10 : 0)), ours,
    tags: { [kind]: true, ours, ...(o.tags ?? {}) }, slots: o.slots, outlet: o.outlet, reporter: o.reporter,
  };
}

const pct = (r?: Record_) => (r && r.w + r.l + r.t ? (r.w + 0.5 * r.t) / (r.w + r.l + r.t) : 0.5);

/** Columnists who argue: national columnists and hosts. */
function columnists(state: GameState): Reporter[] {
  const nat = new Set(NATIONAL.map((o) => o.id));
  return working(state).filter((p) => (p.role === "columnist" || p.role === "host") && nat.has(p.outlet));
}

/** Theses: opened on Tuesdays from week 3, checked every other week, settled after six weeks or at season's end. */
function theses(state: GameState, week: number, out: Fact[]): void {
  const o = opinionState(state);
  const table = standings(state);
  const expect = state.staff?.expect ?? {};
  const rng = rngFor(state.seed, `opinion:thesis:${state.date}`);
  const last = week >= 17 || state.date >= K().regularSeasonEnd;
  for (const t of o.theses.filter((x) => !x.end)) {
    const weeks = Math.round(daysBetween(t.opened, state.date) / 7);
    if (weeks < 2 || (weeks % 2 && !last)) continue;
    const r = table[t.team];
    const now = pct(r);
    const diff = r ? r.pf - r.pa : 0;
    const supported = t.stance === "real" ? now >= 0.5 && diff >= 0 : now < t.from || diff < 0;
    const done = weeks >= 6 || last;
    if (done) t.end = supported ? "right" : "wrong";
    const writer = corps(state).people.find((p) => p.id === t.reporter);
    if (!writer) { t.end ??= "wrong"; continue; }
    out.push(fact(state, "thesis", `${t.id}:${weeks}`, 40, {
      teams: [t.team], outlet: writer.outlet, reporter: writer.id,
      tags: { real: t.stance === "real", fraud: t.stance === "fraud", holding: !done && supported, shaky: !done && !supported, right: t.end === "right", wrong: t.end === "wrong" },
      slots: { R: voice(writer), T: teamSlots(state, t.team, table), stance: t.stance === "real" ? "for real" : "frauds", weeks, since: shortDate(t.opened) },
    }));
  }
  if (week < 3 || last) return;
  const busy = new Set(o.theses.filter((x) => !x.end).map((x) => x.reporter));
  const taken = new Set(o.theses.filter((x) => !x.end).map((x) => x.team));
  for (const c of columnists(state).filter((p) => !busy.has(p.id))) {
    if (rng() > 0.35) continue;
    // The thesis worth writing: a record the numbers don't back up, or a team beating what it was supposed to be.
    const pool = TEAMS.map((x) => x.id).filter((id) => !taken.has(id)).map((id) => {
      const r = table[id];
      const p = pct(r);
      const diff = r ? r.pf - r.pa : 0;
      const fraud = p >= 0.6 && diff < 30 ? 1 + (30 - diff) / 30 : 0;
      const real = p - (expect[id] ?? 0.5) >= 0.15 && diff > 0 ? 1 + diff / 50 : 0;
      return { id, fraud, real };
    }).filter((x) => x.fraud || x.real);
    if (!pool.length) break;
    const pickT = pool[Math.floor(rng() * pool.length)];
    // Hot columnists like the contrarian side when both fit.
    const stance: Thesis["stance"] = pickT.fraud && (!pickT.real || c.heat > 0.5) ? "fraud" : "real";
    const t: Thesis = { id: `th${o.theses.length + 1}:${state.date}`, reporter: c.id, team: pickT.id, stance, opened: state.date, from: pct(table[pickT.id]) };
    o.theses.push(t);
    taken.add(pickT.id);
    out.push(fact(state, "thesis", `${t.id}:0`, 42, {
      teams: [t.team], outlet: c.outlet, reporter: c.id, tags: { open: true, real: stance === "real", fraud: stance === "fraud" },
      slots: { R: voice(c), T: teamSlots(state, t.team, table), stance: stance === "real" ? "for real" : "frauds", weeks: 0, since: shortDate(state.date) },
    }));
  }
  o.theses = o.theses.filter((x) => !x.end || daysBetween(x.opened, state.date) <= 200).slice(-40);
}

/** Radio rundowns on Mondays (our station and a few others, plus the national network) and the national podcast on Wednesdays. */
function rundowns(state: GameState, out: Fact[]): void {
  const wd = weekday(state.date);
  if (wd !== "Monday" && wd !== "Wednesday") return;
  const topics = trending(state, 6).map((x) => x.topic);
  if (topics.length < 3) return;
  const rng = rngFor(state.seed, `opinion:rundown:${state.date}`);
  const table = standings(state);
  const list = topics.slice(0, 3).join(", ");
  if (wd === "Wednesday") {
    const r = pickReporter(state, "afw", "reporter", rng);
    if (r) out.push(fact(state, "rundown", `${state.date}:pod`, 38, { outlet: "afw", reporter: r.id, tags: { pod: true }, slots: { R: voice(r), list, topic: topics[0] } }));
    return;
  }
  const blitz = pickReporter(state, "blitz", "columnist", rng);
  if (blitz) out.push(fact(state, "rundown", `${state.date}:blitz`, 38, { outlet: "blitz", reporter: blitz.id, slots: { R: voice(blitz), list, topic: topics[0] } }));
  const others = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam);
  const clubs = [state.userTeam];
  while (clubs.length < 4) {
    const t = others[Math.floor(rng() * others.length)];
    if (!clubs.includes(t)) clubs.push(t);
  }
  for (const team of clubs) {
    const host = localStaff(state, team, "host")[0];
    if (!host) continue;
    const mine = trendingFor(state, team);
    const local = mine.length >= 2 ? mine : topics;
    out.push(fact(state, "rundown", `${state.date}:${team}`, 30, {
      teams: [team], outlet: `radio:${team}`, reporter: host.id, tags: { local: true },
      slots: { R: voice(host), T: teamSlots(state, team, table), list: local.slice(0, 3).join(", "), topic: local[0] },
    }));
  }
}

/** What one club's fans are posting about. */
function trendingFor(state: GameState, team: string): string[] {
  const count = new Map<string, number>();
  for (const p of mediaState(state).social?.posts ?? []) {
    if (daysBetween(p.date, state.date) > 2) break;
    if (p.team === team && p.topic) count.set(p.topic, (count.get(p.topic) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** Thursday debates: two outlets on one club's thesis, or on the MVP race. */
function debate(state: GameState, week: number, out: Fact[]): void {
  if (weekday(state.date) !== "Thursday" || week < 4) return;
  const rng = rngFor(state.seed, `opinion:debate:${state.date}`);
  const table = standings(state);
  const cols = columnists(state);
  const open = opinionState(state).theses.filter((x) => !x.end);
  const t = open[Math.floor(rng() * open.length)];
  const R = t ? cols.find((c) => c.id === t.reporter) : cols[Math.floor(rng() * cols.length)];
  const S = cols.filter((c) => R && c.outlet !== R.outlet)[Math.floor(rng() * Math.max(1, cols.length - 1))];
  if (!R || !S) return;
  if (t) {
    const real = t.stance === "real";
    out.push(fact(state, "debate", `${state.date}:${t.team}`, 40, {
      teams: [t.team], outlet: R.outlet, reporter: R.id, tags: { team: true },
      slots: { R: voice(R), S: voice(S), T: teamSlots(state, t.team, table), stanceR: real ? "They're for real" : "They're frauds", stanceS: real ? "Not buying it" : "They're better than you think" },
    }));
    return;
  }
  const mvp = narrState(state).ladder.MVP?.[0];
  if (!mvp || !PLAYER_BY_ID[mvp]) return;
  const team = state.players[mvp]?.team ?? "";
  out.push(fact(state, "debate", `${state.date}:mvp`, 42, {
    teams: [team], players: [mvp], outlet: R.outlet, reporter: R.id, tags: { mvp: true },
    slots: { R: voice(R), S: voice(S), T: TEAM_BY_ID[team] ? teamSlots(state, team, table) : undefined, P: playerSlots(state, mvp), stanceR: "He's the MVP, and it isn't close", stanceS: "Ask me in December" },
  }));
}

/** Three questions from fans' accounts, answered: from the club's running stories first, then the standings or the draft. */
function mail(state: GameState, team: string, rng: Rng): string {
  const arcs = arcState(state).list.filter((a) => !a.ending && a.team === team && MAIL[a.kind]);
  const inSeason = state.date >= K().regularSeasonStart && state.date <= K().regularSeasonEnd;
  const topics: { key: string; P?: string; C?: string }[] = arcs.slice(0, 2).map((a) => ({ key: a.kind, P: a.player, C: a.coach }));
  topics.push({ key: inSeason ? "standings" : "offseason" }, { key: "draft" });
  const table = standings(state);
  const fans = fanAccounts(state, team);
  const lines: string[] = [];
  for (const t of topics.slice(0, 3)) {
    const m = MAIL[t.key];
    const coach = t.C ? staff(state).people[t.C] : undefined;
    const slots: Slots = { A: fans[Math.floor(rng() * fans.length)].handle, T: teamSlots(state, team, table), P: t.P && PLAYER_BY_ID[t.P] ? playerSlots(state, t.P) : { name: "the starter" }, C: { name: coach?.name ?? "the head coach" } };
    const say = (x: string[]) => render(x[Math.floor(rng() * x.length)], slots, { rng, banks: {}, tone: "lively" });
    lines.push(`${say(m.q)} ${say(m.a)}`);
  }
  return lines.join(" ");
}

/** Friday mailbags: a national one about any club, and our local paper's about us. */
function mailbags(state: GameState, out: Fact[]): void {
  if (weekday(state.date) !== "Friday") return;
  const rng = rngFor(state.seed, `opinion:mail:${state.date}`);
  const table = standings(state);
  const nat = pickReporter(state, "ledger", "columnist", rng);
  const any = TEAMS[Math.floor(rng() * TEAMS.length)].id;
  if (nat) out.push(fact(state, "mailbag", `${state.date}:nat`, 32, { teams: [any], outlet: "ledger", reporter: nat.id, slots: { R: voice(nat), T: teamSlots(state, any, table), mail: mail(state, any, rng) } }));
  const us = state.userTeam;
  const col = localStaff(state, us, "columnist")[0];
  if (col) out.push(fact(state, "mailbag", `${state.date}:${us}`, 30, { teams: [us], outlet: `local:${us}`, reporter: col.id, tags: { local: true }, slots: { R: voice(col), T: teamSlots(state, us, table), mail: mail(state, us, rng) } }));
}

/** Overreaction Monday, the first six weeks: the hottest and coldest clubs, and ours. */
function overreaction(state: GameState, week: number, out: Fact[]): void {
  if (weekday(state.date) !== "Monday" || week < 2 || week > 7) return;
  const table = standings(state);
  const rng = rngFor(state.seed, `opinion:over:${state.date}`);
  const rows = TEAMS.map((t) => table[t.id]);
  const hot = rows.filter((r) => r.streak.startsWith("W")).sort((a, b) => Number(b.streak.slice(1)) - Number(a.streak.slice(1)))[0];
  const cold = rows.filter((r) => r.streak.startsWith("L")).sort((a, b) => Number(b.streak.slice(1)) - Number(a.streak.slice(1)))[0];
  if (!hot || !cold) return;
  const host = pickReporter(state, "blitz", "columnist", rng);
  if (!host) return;
  const pickOne = (xs: string[]) => xs[Math.floor(rng() * xs.length)];
  const items = [
    `1. The ${TEAM_BY_ID[hot.team].name} are winning the Super Bowl. ${pickOne(["Book it.", "Write it down.", "I said what I said."])}`,
    `2. Blow up the ${TEAM_BY_ID[cold.team].name}. ${pickOne(["Everybody, top to bottom.", "Start over.", "The whole thing."])}`,
  ];
  const us = table[state.userTeam];
  if (us && us.w + us.l > 0 && state.userTeam !== hot.team && state.userTeam !== cold.team) {
    items.push(us.streak.startsWith("W") ? `3. The ${TEAM_BY_ID[state.userTeam].name} owner has it all figured out.` : `3. Somebody has to ask the ${TEAM_BY_ID[state.userTeam].name} owner what the plan is.`);
  }
  out.push(fact(state, "overreaction", state.date, 45, {
    teams: [hot.team, cold.team], outlet: "blitz", reporter: host.id,
    slots: { R: voice(host), T: teamSlots(state, hot.team, table), X: teamSlots(state, cold.team, table), list: items.join(" ") },
  }));
}

/** The opinion desk's day. */
export function opinionDaily(state: GameState): Fact[] {
  const date = state.date;
  const start = K().regularSeasonStart;
  const inSeason = date >= start && date <= K().regularSeasonEnd;
  const week = inSeason ? Math.floor(daysBetween(start, date) / 7) + 1 : 0;
  const out: Fact[] = [];
  if (inSeason && weekday(date) === "Tuesday") theses(state, week, out);
  if (date === K().regularSeasonEnd) theses(state, 18, out);
  if (date >= start && date <= K().superBowl) rundowns(state, out);
  if (inSeason) debate(state, week, out);
  if (inSeason) overreaction(state, week, out);
  // The mailbag runs all year.
  mailbags(state, out);
  if (out.length) fileFacts(state, out, 10);
  return out;
}
