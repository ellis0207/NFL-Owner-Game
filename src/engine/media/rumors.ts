// The rumor desk. Every sourced report starts from something the engine is
// really doing: a trade request, a player on the block, a rebuilding club
// listening on veterans, a contender with a hole, free-agent bids, coaching
// interviews and favorites, an owner losing patience, a leak from inside a
// building. A reporter hears it through their sources; how often they get it
// right depends on their accuracy and how well sourced they are in that club,
// and when they get it wrong they report something that isn't so. Each report
// is judged later, when the trade, signing, hire or firing happens or doesn't,
// and the reporter's public record of hits and misses grows, so the owner
// learns whom to believe. The rates follow the real calendar: a trickle most
// weeks, a flood in the last week before the deadline and around free agency,
// coaching rumors from the last month of the season through February.
import { contractYearsLeft, teamPlayerIds } from "../cap";
import { candidates, fireChance, openSearches } from "../carousel";
import { staff } from "../coaches";
import { addDays, ageOn, daysBetween } from "../dates";
import { market } from "../freeagency";
import { PLAYER_BY_ID, RULES, TEAMS } from "../league";
import { marketView } from "../market";
import { mediaState } from "../outlets";
import { rngFor, type Rng } from "../rng";
import { depthChart } from "../roster";
import { teamStaff } from "../staff";
import { standings } from "../standings";
import { direction, outlook, trades, tradeWindow } from "../trades";
import type { GameState, Position, Reporter, Rumor } from "../types";
import { fileFacts } from "./compose";
import { corps, isLocal, outletOf, working } from "./corps";
import { playerSlots, teamSlots, type Fact } from "./facts";

const K = () => RULES.keyDates;
const POS_WORD: Partial<Record<Position, string>> = {
  WR: "wide receiver", CB: "cornerback", EDGE: "edge rusher", OT: "offensive tackle", S: "safety", IDL: "defensive tackle",
  LB: "linebacker", TE: "tight end", RB: "running back", OG: "guard",
};
const VALUE: Record<string, number> = { request: 70, shopping: 60, seller: 45, buyer: 40, fa: 50, interview: 45, favorite: 60, hotseat: 55, inplay: 45, leak: 60, talks: 55 };

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/** How readily our building talks: more sources inside means more sourced stories about us. */
export function leakFactor(state: GameState): number {
  return 0.5 + ((state.culture?.rel.sources ?? 40) / 100) * 1.5;
}

/** Who hears about a club: national insiders with sources there, its beat writers, and (for the loose talk) radio hosts. */
function reporterFor(state: GameState, team: string, rng: Rng, loose = false): Reporter | undefined {
  const pool = working(state).filter((p) => loose ? p.role === "host" || p.heat >= 0.7
    : (p.role === "insider" && !isLocal(p.outlet)) || (p.role === "beat" && p.team === team) || (p.role === "reporter" && !isLocal(p.outlet) && (p.sources[team] ?? 0) > 0));
  if (!pool.length) return undefined;
  const w = pool.map((p) => 2 + (p.sources[team] ?? 0) / 10 + (p.role === "insider" ? 3 : 0));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((x -= w[i]) <= 0) return pool[i];
  return pool[pool.length - 1];
}

/** Whether a reporter gets what they heard right this time. */
const getsItRight = (r: Reporter, team: string, rng: Rng) => rng() < r.accuracy * (0.75 + 0.25 * (r.sources[team] ?? 10) / 100);

const teamsWord = (ids: string[]) => {
  const n = ids.map((t) => TEAMS.find((x) => x.id === t)?.name ?? t);
  return `the ${n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n[0]}`;
};

interface Claim { kind: string; team: string; player?: string; teams?: string[]; coach?: string; pos?: Position; truth: boolean; until: string; text?: string; headline?: string }

function tradeUntil(state: GameState): string {
  const d = state.date;
  if (d < K().tradeDeadline) return K().tradeDeadline;
  return addDays(K().draftStart, 3) > d ? addDays(K().draftStart, 3) : addDays(d, 30);
}

// ---- Settling reports ----

function traded(state: GameState, player: string, since: string): boolean {
  return trades(state).log.some((t) => t.date >= since && t.status !== "voided" && t.send.some((side) => side.some((a) => a.kind === "player" && a.id === player)));
}

function judge(state: GameState, r: Rumor): Rumor["outcome"] | undefined {
  const due = state.date >= r.until;
  switch (r.kind) {
    case "seller": case "inplay": case "shopping":
      if (r.player && traded(state, r.player, r.date)) return "hit";
      return due ? (r.truth ? (r.kind === "shopping" ? "hit" : "quiet") : "miss") : undefined;
    case "fa": {
      const s = state.signings.find((x) => x.player === r.player && x.date >= r.date);
      if (s) return r.teams?.includes(s.team) ? "hit" : r.truth ? "quiet" : "miss";
      return due ? (r.truth ? "quiet" : "miss") : undefined;
    }
    case "favorite": {
      const hc = teamStaff(r.team).HC?.id;
      if (hc === r.coach) return "hit";
      const open = openSearches(state, r.team).some((s) => s.role === "HC");
      if (!open && hc && hc !== r.coach) return r.truth ? "quiet" : "miss";
      return due ? (r.truth ? "quiet" : "miss") : undefined;
    }
    case "hotseat":
      if (teamStaff(r.team).HC?.id !== r.coach) return "hit";
      return due ? (r.truth ? "quiet" : "miss") : undefined;
    default:
      // Reports about what is going on now (a request, a leak, talks, interviews, calls) are confirmed or knocked down within days.
      return due ? (r.truth ? "hit" : "miss") : undefined;
  }
}

function settle(state: GameState): void {
  const c = corps(state);
  for (const r of c.rumors) {
    if (r.outcome) continue;
    const o = judge(state, r);
    if (!o) continue;
    r.outcome = o;
    const who = c.people.find((p) => p.id === r.reporter);
    if (who && o === "hit") who.hits++;
    if (who && o === "miss") who.misses++;
  }
  if (c.rumors.length > 400) c.rumors = c.rumors.filter((r, i) => !r.outcome || i < 300);
}

// ---- What the reporters hear ----

function claims(state: GameState, rng: Rng): Claim[] {
  const out: Claim[] = [];
  const m = mediaState(state);
  const date = state.date;
  const us = state.userTeam;
  const ts = trades(state);
  const window = tradeWindow(state);
  const preDeadline = date >= addDays(K().tradeDeadline, -35) && date < K().tradeDeadline;
  const daysLeft = daysBetween(date, K().tradeDeadline);
  const offseason = date > K().superBowl && date < K().draftStart;
  const recent = (key: string, days: number) => m.asked[key] && daysBetween(m.asked[key], date) < days;
  const mark = (key: string) => { m.asked[key] = date; };

  // Trade requests are real, and they get out the same day.
  for (const [id, when] of Object.entries(ts.requests)) {
    const team = state.players[id]?.team;
    if (when === date && team && PLAYER_BY_ID[id]) out.push({ kind: "request", team, player: id, truth: true, until: addDays(date, 7) });
  }
  // Leaks and agents' accounts handed over today.
  for (const t of m.tips ?? []) out.push({ kind: t.kind, team: t.team, player: t.player, truth: true, until: addDays(date, 10), text: t.text, headline: t.headline });
  m.tips = [];

  if (window.open) {
    // Our trade block: the leakier the building, the sooner other teams' talk reaches a reporter.
    for (const id of ts.block) {
      if (!PLAYER_BY_ID[id] || state.players[id]?.team !== us || ts.requests[id] || recent(`block:${id}`, 21)) continue;
      if (rng() > (preDeadline && daysLeft <= 7 ? 0.25 : 0.07) * leakFactor(state)) continue;
      mark(`block:${id}`);
      out.push({ kind: "shopping", team: us, player: id, truth: true, until: tradeUntil(state) });
    }
  }

  const tradeTalk = window.open && (preDeadline || offseason);
  const tries = !tradeTalk ? 0 : preDeadline ? (daysLeft <= 7 ? 9 : daysLeft <= 14 ? 4 : 2) : 2;
  const wp = tries ? outlook(state) : {};
  const sellers = TEAMS.map((t) => t.id).filter((t) => t !== us && direction(state, t) === "rebuild");
  const contenders = TEAMS.map((t) => t.id).filter((t) => t !== us && (wp[t] ?? 0) >= 0.58);
  const stars = (teams: string[]) => teams.flatMap((t) => teamPlayerIds(state, t).filter((id) => PLAYER_BY_ID[id] && marketView(state, id) >= 88));
  for (let i = 0; i < tries; i++) {
    const roll = rng();
    if (roll < 0.5 && sellers.length) {
      // Sellers: veterans on clubs going nowhere.
      const team = pick(rng, sellers);
      const vets = teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && (ageOn(PLAYER_BY_ID[id].birthDate, date) ?? 25) >= 27 && contractYearsLeft(id, offseason ? RULES.season + 1 : RULES.season, state) >= 1)
        .map((id) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 82).sort((a, b) => b[1] - a[1]);
      if (!vets.length) continue;
      const [id] = vets[Math.floor(rng() * Math.min(4, vets.length))];
      if (recent(`seller:${id}`, 21)) continue;
      mark(`seller:${id}`);
      out.push({ kind: "seller", team, player: id, truth: true, until: tradeUntil(state) });
    } else if (roll < 0.8 && contenders.length) {
      // Buyers: a contender's weakest starting spot.
      const team = pick(rng, contenders);
      if (recent(`buyer:${team}`, 10)) continue;
      const chart = depthChart(state, team);
      const need = (Object.keys(POS_WORD) as Position[]).map((pos) => [pos, chart[pos]?.[0] ? marketView(state, chart[pos][0]) : 60] as const).sort((a, b) => a[1] - b[1])[0][0];
      mark(`buyer:${team}`);
      out.push({ kind: "buyer", team, pos: need, truth: true, until: addDays(date, 14) });
    } else {
      // The loose talk: a star on a club that isn't selling.
      const pool = stars(TEAMS.map((t) => t.id).filter((t) => t !== us && !sellers.includes(t)));
      if (!pool.length) continue;
      const id = pick(rng, pool);
      if (recent(`inplay:${id}`, 30)) continue;
      mark(`inplay:${id}`);
      out.push({ kind: "inplay", team: state.players[id].team!, player: id, truth: false, until: tradeUntil(state) });
    }
  }

  // Free agency: who is bidding on whom.
  const faTalk = date >= addDays(K().negotiatingWindowOpens, -10) && date <= addDays(K().newLeagueYear, 14);
  if (faTalk) {
    const fa = Object.values(market(state)).filter((f) => f.status === "open" && PLAYER_BY_ID[f.player] && f.offers.length && !recent(`fa:${f.player}`, 5))
      .map((f) => [f, marketView(state, f.player)] as const).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (let i = 0; i < Math.min(4, fa.length); i++) {
      if (rng() > 0.6) continue;
      const [f] = fa[Math.floor(rng() * fa.length)];
      if (recent(`fa:${f.player}`, 5)) continue;
      mark(`fa:${f.player}`);
      const bidders = [...new Set(f.offers.map((o) => o.team))].slice(0, 3);
      out.push({ kind: "fa", team: bidders[0], player: f.player, teams: bidders, truth: true, until: addDays(date, 30) });
    }
  }

  // Coaching searches: who is interviewing, and who is about to get the job.
  for (const s of openSearches(state).filter((x) => x.role === "HC" && x.team !== us)) {
    if (s.agreed && !recent(`fav:${s.team}`, 60)) {
      mark(`fav:${s.team}`);
      out.push({ kind: "favorite", team: s.team, coach: s.agreed.id, truth: true, until: addDays(date, 45) });
      continue;
    }
    const talked = Object.keys(s.interviews).filter((id) => !s.interviews[id].declined && !recent(`int:${s.team}:${id}`, 60));
    if (talked.length && rng() < 0.4) {
      const id = pick(rng, talked);
      mark(`int:${s.team}:${id}`);
      out.push({ kind: "interview", team: s.team, coach: id, truth: true, until: addDays(date, 10) });
    }
  }

  // The hot seat: from midseason through the week after the season, owners' patience is the story.
  const seatSeason = date >= addDays(K().regularSeasonStart, 49) && date <= addDays(K().regularSeasonEnd, 3);
  if (seatSeason && rng() < 0.35) {
    const list = TEAMS.map((t) => t.id).filter((t) => t !== us && !recent(`seat:${t}`, 21)).flatMap((t) => {
      const hc = teamStaff(t).HC;
      const coach = hc && staff(state).people[hc.id];
      return coach ? [[t, coach.id, fireChance(state, t, coach)] as const] : [];
    }).filter(([, , p]) => p >= 0.25).sort((a, b) => b[2] - a[2]).slice(0, 5);
    if (list.length) {
      const [team, coach, p] = pick(rng, list);
      mark(`seat:${team}`);
      out.push({ kind: "hotseat", team, coach, truth: p >= 0.5, until: addDays(K().regularSeasonEnd, 14) });
    }
  }
  return out;
}

/** What a reporter who gets it wrong reports instead. */
function misheard(state: GameState, c: Claim, rng: Rng): Claim | null {
  const us = state.userTeam;
  switch (c.kind) {
    case "seller": {
      const ids = teamPlayerIds(state, c.team).filter((id) => PLAYER_BY_ID[id] && id !== c.player && marketView(state, id) >= 80);
      return ids.length ? { ...c, player: pick(rng, ids), truth: false } : null;
    }
    case "buyer": {
      const others = (Object.keys(POS_WORD) as Position[]).filter((p) => p !== c.pos);
      return { ...c, pos: pick(rng, others), truth: false };
    }
    case "fa": {
      const wrong = TEAMS.map((t) => t.id).filter((t) => !c.teams!.includes(t) && t !== us);
      const teams = [pick(rng, wrong), ...(c.teams!.length > 1 ? c.teams!.slice(1, 2) : [])];
      return { ...c, team: teams[0], teams, truth: false };
    }
    case "interview": case "favorite": {
      const pool = candidates(state, c.team, "HC").filter((id) => id !== c.coach);
      return pool.length ? { ...c, coach: pick(rng, pool.slice(0, 12)), truth: false } : null;
    }
    case "hotseat": return { ...c, truth: !c.truth };
    default: return c;
  }
}

/** The day's reports: judged, heard, written down and filed. */
export function rumorDesk(state: GameState): void {
  settle(state);
  const rng = rngFor(state.seed, `rumors:${state.date}`);
  const c = corps(state);
  const us = state.userTeam;
  const table = standings(state);
  const facts: Fact[] = [];
  const deadline = state.date < K().tradeDeadline && daysBetween(state.date, K().tradeDeadline) <= 7;
  for (const heard of claims(state, rng)) {
    const loose = heard.kind === "inplay";
    const rep = reporterFor(state, heard.team, rng, loose);
    if (!rep) continue;
    let claim: Claim | null = heard;
    // Facts that are already out (requests, leaks, talks) are reported as they are; the rest depend on the reporter.
    if (!["request", "leak", "talks", "shopping"].includes(heard.kind)) {
      const right = getsItRight(rep, heard.team, rng);
      if (heard.kind === "hotseat") claim = heard.truth === right ? heard : null;
      else if (!right) claim = misheard(state, heard, rng);
    }
    if (!claim) continue;
    const r: Rumor = {
      id: `rm${c.next++}`, date: state.date, reporter: rep.id, kind: claim.kind, team: claim.team, player: claim.player,
      teams: claim.teams, coach: claim.coach, truth: claim.truth, until: claim.until,
    };
    c.rumors.unshift(r);
    const teams = [...new Set([claim.team, ...(claim.teams ?? [])])].filter(Boolean);
    const ours = teams.includes(us);
    const star = !!claim.player && marketView(state, claim.player) >= 86;
    const coach = claim.coach ? staff(state).people[claim.coach] : undefined;
    const scoop = rep.role === "host" ? "hottake" : rep.role === "beat" && ours ? "notebook" : "report";
    facts.push({
      id: `rumor:${r.id}`, type: `rumor.${claim.kind}`, family: "rumor", kind: claim.kind === "leak" || claim.kind === "talks" ? "leak" : "rumor",
      teams, players: claim.player ? [claim.player] : [], value: Math.min(95, (VALUE[claim.kind] ?? 45) + (star ? 15 : 0) + (ours ? 20 : 0)), ours,
      tags: {
        [claim.kind]: true, ours, star, deadline, hot: rep.heat >= 0.7, localReporter: isLocal(rep.outlet), scoop,
        denied: !["request", "leak", "talks"].includes(claim.kind) && rng() < 0.25, qb: !!claim.player && PLAYER_BY_ID[claim.player]?.position === "QB",
      },
      slots: {
        R: { name: rep.name, outlet: outletOf(rep.outlet).name }, T: teamSlots(state, claim.team, table),
        P: claim.player ? playerSlots(state, claim.player) : undefined,
        X: claim.teams?.[1] ? teamSlots(state, claim.teams[1], table) : undefined,
        list: claim.teams ? teamsWord(claim.teams) : undefined,
        C: coach ? { name: coach.name } : undefined, pos: claim.pos ? POS_WORD[claim.pos] : undefined,
        text: claim.text?.replace(/\.$/, ""), headline: claim.headline,
      },
      outlet: rep.outlet, reporter: rep.id,
    });
  }
  if (!facts.length) return;
  fileFacts(state, facts, deadline ? 16 : 8);
  // Keep each report's headline with it, for the reporter's record on the Media page.
  const today = mediaState(state).stories.filter((s) => s.date === state.date && s.reporter);
  for (const f of facts) {
    const r = c.rumors.find((x) => `rumor:${x.id}` === f.id);
    const s = today.find((x) => x.reporter === f.reporter && x.type?.startsWith(f.type));
    if (r && s) r.headline = s.headline;
  }
}
