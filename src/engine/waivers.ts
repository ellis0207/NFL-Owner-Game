// The waiver wire. A released player with fewer than four accrued seasons
// (and, after the trade deadline, any player) goes on waivers: until 4 PM ET
// the next business day any team can claim his contract, and the claim goes
// to the team with the highest priority. Priority follows the 2026 draft
// order until late September, then the standings (worst first), and after
// the regular season the next draft order. A team that claims a player takes
// over his remaining salary; bonus money stays with the team that cut him.
// Players nobody claims become free agents.
import { accruedSeasons, addDeadMoney, capHit, capSummary, invalidateRosters, teamPlayerIds } from "./cap";
import { claimedDeal, leagueYear } from "./contracts";
import { addDays, shortDate, weekday } from "./dates";
import { money, send } from "./inbox";
import { HIDDEN_RATINGS, PLAYER_BY_ID, RULES, SEASON, TEAMS, teamLabel } from "./league";
import { draftOrder, isOffseason, off } from "./offseason";
import { rngFor } from "./rng";
import { claimView, logMove, releasePlayer, rosterLimit, rosterCount, signToPracticeSquad, psEligible, psRoom, weakestOnRoster, rosterStatusNow } from "./roster";
import { staffEffects, teamStaff } from "./staff";
import { standings, winPct } from "./standings";
import type { Deal, GameState, WaiverEntry } from "./types";

const KEY = RULES.keyDates;

export function waivers(state: GameState): Record<string, WaiverEntry> {
  return (state.waivers ??= {});
}

export function onWaivers(state: GameState, id: string): WaiverEntry | undefined {
  return state.waivers?.[id];
}

/**
 * Whether a release today sends the player through waivers. Vested veterans
 * (four or more accrued seasons) skip waivers from the start of the league
 * year until the trade deadline.
 */
export function subjectToWaivers(state: GameState, id: string, date = state.date): boolean {
  if (accruedSeasons(id, date) < 4) return true;
  return leagueYear(date) === SEASON && date >= KEY.veteranWaiversBegin;
}

/** Claims are due at 4 PM ET the next business day; cutdown claims on the day after the cut. */
export function waiverDeadline(date: string): string {
  if (date === KEY.rosterCutdown) return KEY.cutdownWaiversExpire;
  let d = addDays(date, 1);
  while (weekday(d) === "Saturday" || weekday(d) === "Sunday") d = addDays(d, 1);
  return d;
}

/** Waiver priority on a date, first claim first. */
export function waiverOrder(state: GameState, date = state.date): string[] {
  if (leagueYear(date) === SEASON && date <= KEY.regularSeasonEnd) {
    if (date < KEY.waiverOrderByStandings) return RULES.waiverOrder;
    const table = standings(state);
    const pct = (t: string) => winPct(table[t].w, table[t].l, table[t].t);
    return [...RULES.waiverOrder].sort((a, b) => pct(a) - pct(b) || RULES.waiverOrder.indexOf(a) - RULES.waiverOrder.indexOf(b));
  }
  return isOffseason(date) ? off(state).draftOrder ?? draftOrder(state) : draftOrder(state);
}

/** Puts a just-released player on the wire. Called by releasePlayer. */
export function placeOnWaivers(state: GameState, id: string, from: string, deal: Deal | null, relief: WaiverEntry["relief"], psIntent: boolean): WaiverEntry {
  const entry: WaiverEntry = {
    player: id, from, placed: state.date, clears: waiverDeadline(state.date), deal, relief, claims: [],
    ...(psIntent ? { psIntent: true } : {}),
  };
  waivers(state)[id] = entry;
  return entry;
}

// ---- The owner's claims ----

export function canClaim(state: GameState, team: string, id: string): { ok: boolean; reason?: string } {
  const w = onWaivers(state, id);
  if (!w) return { ok: false, reason: "Not on waivers." };
  if (w.from === team) return { ok: false, reason: "We released him." };
  const hit = capHit(id, leagueYear(state.date), { ...state, contracts: { ...state.contracts, [id]: claimedDeal(w.deal, team, state.date, PLAYER_BY_ID[id].yearsExp) } });
  if (state.settings.capRules === "real" && hit > capSummary(state, team).space) {
    return { ok: false, reason: `His contract counts ${money(hit)} against this year's cap; we don't have the room.` };
  }
  return { ok: true };
}

export function putInClaim(state: GameState, team: string, id: string, drop?: string): void {
  const w = onWaivers(state, id);
  if (!w || !canClaim(state, team, id).ok) return;
  w.claims = w.claims.filter((c) => c.team !== team);
  w.claims.push({ team, ...(drop ? { drop } : {}) });
}

export function withdrawClaim(state: GameState, team: string, id: string): void {
  const w = onWaivers(state, id);
  if (w) w.claims = w.claims.filter((c) => c.team !== team);
}

// ---- CPU front offices ----

/** Most claims a front office puts in on one day. */
function claimLimit(): number {
  return 1;
}

/**
 * Whether a CPU front office claims a player: a clear upgrade on the player
 * it would have to cut, a hole at the position, and a contract it can afford.
 */
function cpuWants(state: GameState, team: string, w: WaiverEntry): string | null | false {
  const id = w.player;
  const pos = PLAYER_BY_ID[id].position;
  const hit = capHit(id, leagueYear(state.date), { ...state, contracts: { ...state.contracts, [id]: claimedDeal(w.deal, team, state.date, PLAYER_BY_ID[id].yearsExp) } });
  if (state.settings.capRules === "real" && hit > capSummary(state, team).space - 1_000_000) return false;
  const view = claimView(state, team, id);
  const full = rosterCount(state, team).roster >= rosterLimit(state);
  const drop = weakestOnRoster(state, team, pos);
  const atPos = teamPlayerIds(state, team).filter((x) => PLAYER_BY_ID[x].position === pos && ["active", "camp"].includes(state.players[x].status)).length;
  const worstAtPos = teamPlayerIds(state, team)
    .filter((x) => PLAYER_BY_ID[x].position === pos && ["active", "camp"].includes(state.players[x].status))
    .reduce((m, x) => Math.min(m, claimView(state, team, x)), Infinity);
  const rng = rngFor(state.seed, `claim:${team}:${id}:${state.date}`);
  // Front offices with better scouts trust their own read more; the rest are cautious.
  const margin = 4.5 + (60 - staffEffects(team).gmEval) / 15 + rng() * 2.5;
  const upgrade = view - Math.min(worstAtPos, drop ? claimView(state, team, drop) : Infinity);
  const thin = atPos < 2 && view > 45;
  if (!(upgrade >= margin || thin)) return false;
  // Outside the cutdown, a front office rarely churns the bottom of its roster more than once a week.
  if (state.date !== KEY.cutdownWaiversExpire) {
    const since = addDays(state.date, -7);
    if ((state.transactions ?? []).some((t) => t.team === team && t.kind === "claimed" && t.date > since)) return false;
    if (rng() > 0.3) return false;
  } else if (rng() > 0.5) return false;
  return full ? drop ?? false : null;
}

// ---- Awarding claims ----

function award(state: GameState, w: WaiverEntry, team: string, drop?: string): boolean {
  const id = w.player;
  const p = PLAYER_BY_ID[id];
  // Make room first.
  if (rosterCount(state, team).roster >= rosterLimit(state)) {
    const cut = drop && state.players[drop]?.team === team ? drop : weakestOnRoster(state, team, p.position);
    if (!cut) return false;
    releasePlayer(state, cut);
    if (team === state.userTeam) {
      send(state, "transaction", gmOf(team), `${PLAYER_BY_ID[cut].name} released`,
        `To make room for ${p.name} we released ${PLAYER_BY_ID[cut].position} ${PLAYER_BY_ID[cut].name}.`);
    }
  }
  const year = leagueYear(state.date);
  addDeadMoney(state, w.from, year, -w.relief.thisYear);
  addDeadMoney(state, w.from, year + 1, -w.relief.nextYear);
  state.contracts[id] = claimedDeal(w.deal, team, state.date, p.yearsExp);
  state.players[id] = { ...state.players[id], team, status: rosterStatusNow(state) };
  delete state.players[id].lastTeam;
  const m = state.fa?.[id];
  if (m) m.status = "signed";
  invalidateRosters(state);
  logMove(state, team, id, "claimed", `claimed ${p.position} ${p.name} off waivers from the ${teamLabel(w.from)}`);
  return true;
}

/** At the waiver deadline: claims are awarded by priority, and everyone else clears. */
export function processWaivers(state: GameState): void {
  const due = Object.values(waivers(state)).filter((w) => w.clears <= state.date);
  if (!due.length) return;
  const order = waiverOrder(state);
  const rank = Object.fromEntries(order.map((t, i) => [t, i]));
  const used: Record<string, number> = {};
  const limit = claimLimit();
  // The best players are decided first, so a team's claims go to its top targets.
  due.sort((a, b) => (HIDDEN_RATINGS[b.player]?.overall ?? 0) - (HIDDEN_RATINGS[a.player]?.overall ?? 0));
  const userClaims: { id: string; won: boolean; by?: string }[] = [];
  for (const w of due) {
    delete waivers(state)[w.player];
    const bids: { team: string; drop?: string }[] = [];
    const mine = w.claims.find((c) => c.team === state.userTeam);
    if (mine && canClaim({ ...state, waivers: { ...waivers(state), [w.player]: w } }, state.userTeam, w.player).ok) bids.push(mine);
    for (const t of TEAMS) {
      if (t.id === state.userTeam || t.id === w.from || (used[t.id] ?? 0) >= limit) continue;
      const want = cpuWants(state, t.id, w);
      if (want === false) continue;
      bids.push({ team: t.id, ...(want ? { drop: want } : {}) });
    }
    bids.sort((a, b) => (rank[a.team] ?? 99) - (rank[b.team] ?? 99));
    let winner: string | undefined;
    for (const b of bids) {
      if (award(state, w, b.team, b.drop)) {
        winner = b.team;
        used[b.team] = (used[b.team] ?? 0) + 1;
        break;
      }
    }
    if (mine) userClaims.push({ id: w.player, won: winner === state.userTeam, by: winner });
    if (w.from === state.userTeam && winner) {
      send(state, "transaction", gmOf(state.userTeam), `${PLAYER_BY_ID[w.player].name} claimed`,
        `The ${teamLabel(winner)} claimed ${PLAYER_BY_ID[w.player].name} off waivers. They take over the salary; ` +
        `the bonus money we owed stays on our books.`);
    }
    if (!winner) clear(state, w);
  }
  for (const c of userClaims) {
    const p = PLAYER_BY_ID[c.id];
    send(state, "transaction", gmOf(state.userTeam), c.won ? `Claim awarded: ${p.name}` : `Claim lost: ${p.name}`,
      c.won ? `${p.position} ${p.name} is ours. The contract came with him and he's on the roster.`
        : `The ${teamLabel(c.by!)} were ahead of us in the waiver order and got ${p.name}.`);
  }
}

/** Unclaimed: a free agent, unless his old team brings him back on the practice squad. */
function clear(state: GameState, w: WaiverEntry): void {
  const id = w.player;
  if (w.psIntent && state.date >= KEY.practiceSquadSigningOpens && !isOffseason(state.date) && psRoom(state, w.from) > 0 && psEligible(state, w.from, id)) {
    signToPracticeSquad(state, w.from, id);
    return;
  }
  if (w.psIntent) (state.psPlans ??= {})[id] = w.from;
  if (w.from === state.userTeam && HIDDEN_RATINGS[id] && state.players[id].status === "fa") {
    // Only worth a line if the owner might care.
    const p = PLAYER_BY_ID[id];
    if (capHit(id, leagueYear(state.date), state) === 0 && p.yearsExp >= 1 && !w.psIntent) {
      state.news.unshift({ date: state.date, text: `${p.name} clears waivers and becomes a free agent` });
    }
  }
}

function gmOf(team: string): string {
  const gm = teamStaff(team).GM;
  return gm ? `${gm.name}, general manager` : "General Manager";
}

/** "Claims due Tuesday 4 PM" */
export function claimDueLabel(w: WaiverEntry): string {
  return `${weekday(w.clears)} ${shortDate(w.clears)}, 4 PM ET`;
}
