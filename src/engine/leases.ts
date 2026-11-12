// Stadium leases with the city or stadium authority. Most NFL teams play in a
// publicly owned building under a long lease, and a lease's last few years are
// when the real bargaining happens: the public side wants the team locked in
// for decades at a fair rent, and the team wants public money for renovations
// and a better split. The talks open about three seasons before a lease runs
// out. The public side makes an offer; the owner can sign it, push for more
// public money or a lower rent, or walk away for the year. A side that pushes
// too hard wears out the city's patience. A lease that runs out unsigned
// rolls over a year at a time at a higher rent. Public money from a new lease
// goes into a renovation fund the owner's stadium projects draw on first.
// The owner can also push on maintenance duties, the share of events, and
// renewal options.
import { cityGoodwill } from "./community";
import { leagueYear } from "./contracts";
import { daysBetween } from "./dates";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, teamLabel } from "./league";
import { rngFor } from "./rng";
import { STADIUM_BY_TEAM, type Stadium } from "./stadiums";
import type { GameState, LeaseAsk, LeaseOffer, LeaseState } from "./types";
import { yearsFromMoneyYear } from "./pack";

const M = 1_000_000;

/** The 2026 terms, kept so a save's leases can be laid over them. */
const ORIGINAL: Record<string, Pick<Stadium, "leaseThrough" | "rent" | "upkeep" | "eventShare">> = Object.fromEntries(
  Object.values(STADIUM_BY_TEAM).map((s) => [s.team, { leaseThrough: s.leaseThrough, rent: s.rent, upkeep: s.upkeep, eventShare: s.eventShare }]),
);

/** Teams whose building is publicly owned and leased to them: the ones with a lease to renew. */
export function leased(team: string): boolean {
  const s = STADIUM_BY_TEAM[team];
  return !!s && !!ORIGINAL[team].leaseThrough && (s.structure === "publicTeam" || s.structure === "publicAuthority");
}

export function ensureLeases(state: GameState): void {
  if (state.leases) return;
  state.leases = {};
  for (const t of TEAMS) {
    if (!leased(t.id)) continue;
    const o = ORIGINAL[t.id];
    const l: LeaseState = { through: o.leaseThrough!, rent: o.rent, upkeep: o.upkeep, eventShare: o.eventShare, fund: 0, log: [] };
    // The Titans' new stadium opens in 2027 under a 30-year lease already signed with Nashville.
    if (t.id === "TEN") l.through = 2056;
    state.leases[t.id] = l;
  }
}

/** Lays the save's lease terms over the stadium data, so the books and the Business page use them. */
export function bindLeases(state: GameState): void {
  for (const [team, o] of Object.entries(ORIGINAL)) Object.assign(STADIUM_BY_TEAM[team], o);
  // A new building (construction.ts) comes with its own rent and upkeep, and a team-owned one with no lease.
  for (const n of state.construction?.opened ?? []) Object.assign(STADIUM_BY_TEAM[n.team], { leaseThrough: undefined, rent: n.rent, upkeep: n.upkeep });
  for (const [team, l] of Object.entries(state.leases ?? {})) {
    Object.assign(STADIUM_BY_TEAM[team], { leaseThrough: l.through, rent: l.rent, upkeep: l.upkeep, eventShare: l.eventShare });
  }
}

export function lease(state: GameState, team = state.userTeam): LeaseState | undefined {
  ensureLeases(state);
  return state.leases![team];
}

/** The renovation money a lease set aside, which our stadium projects use before our own. */
export function leaseFund(state: GameState): number {
  return lease(state)?.fund ?? 0;
}

export function drawFund(state: GameState, amount: number): number {
  const l = lease(state);
  if (!l) return 0;
  const used = Math.min(l.fund, Math.max(0, amount));
  l.fund -= used;
  return used;
}

/** The first season a new lease would cover. */
function nextSeason(state: GameState): number {
  return leagueYear(state.date) + (state.date >= RULES.keyDates.newLeagueYear ? 0 : 1);
}

// ---- The public side's offers ----

/** How generous the public side is, 0-1: an older building and a winning, popular team get more. */
function generosity(state: GameState, team: string): number {
  const s = STADIUM_BY_TEAM[team];
  const age = nextSeason(state) - s.opened;
  const rng = rngFor(state.seed, `lease-mood:${team}:${nextSeason(state)}`);
  const authority = s.structure === "publicAuthority" ? 0.1 : 0;
  // Our shared programs with the city count for something at the table.
  const goodwill = team === state.userTeam ? cityGoodwill(state) : 0;
  return Math.max(0.1, Math.min(0.95, 0.35 + Math.min(0.25, age / 100) + authority + goodwill + (rng() - 0.5) * 0.3));
}

function firstOffer(state: GameState, team: string): LeaseOffer {
  const s = STADIUM_BY_TEAM[team];
  const l = state.leases![team];
  const g = generosity(state, team);
  const rng = rngFor(state.seed, `lease-offer:${team}:${nextSeason(state)}`);
  const age = nextSeason(state) - s.opened;
  const scale = (1.03 ** yearsFromMoneyYear(nextSeason(state)));
  return {
    years: 10 + Math.floor(rng() * 4) * 5,
    rent: Math.round((Math.max(l.rent, 0.5 * M) * (1.5 - 0.4 * g)) / 50_000) * 50_000,
    upkeep: l.upkeep,
    publicMoney: Math.round(((age >= 18 ? 250 : 90) * M * g * scale) / M) * M,
    eventShare: l.eventShare,
  };
}

function describe(o: LeaseOffer): string {
  return `${o.years} years at ${money(o.rent)} a year in rent, with ${money(o.publicMoney)} of public money for renovations, ` +
    `${money(o.upkeep)} a year of upkeep on us, ${Math.round(o.eventShare * 100)}% of event income${o.option ? `, and ${o.option} option years` : ""}`;
}

/** Signs a lease: new terms from the next season on, and the public money goes into the renovation fund. */
function sign(state: GameState, team: string, o: LeaseOffer): void {
  const l = state.leases![team];
  const start = nextSeason(state);
  l.through = Math.max(l.through, start - 1) + o.years + (o.option ?? 0);
  l.rent = o.rent;
  l.upkeep = o.upkeep;
  l.eventShare = o.eventShare;
  l.fund += o.publicMoney;
  l.holdover = false;
  l.signed = state.date;
  delete l.talks;
  l.log.unshift({ date: state.date, text: `Signed a new lease through ${l.through}: ${describe(o)}.` });
  bindLeases(state);
  news(state, `The ${teamLabel(team)} sign a new lease at ${STADIUM_BY_TEAM[team].name} through ${l.through}, with ${money(o.publicMoney)} in public money for renovations`);
}

// ---- The owner's side of the talks ----

export function acceptLease(state: GameState): { ok: boolean; text: string } {
  const l = lease(state);
  if (!l?.talks?.offer || l.talks.waiting) return { ok: false, text: "There's no offer on the table." };
  sign(state, state.userTeam, l.talks.offer);
  return { ok: true, text: `Signed. The lease now runs through ${l.through}.` };
}

/** Pushes for better terms: the answer comes back in about a week. */
export function counterLease(state: GameState, ask: LeaseAsk): { ok: boolean; text: string } {
  const l = lease(state);
  if (!l?.talks || l.talks.waiting) return { ok: false, text: "We're waiting on their answer." };
  l.talks.waiting = { ask, date: state.date };
  return { ok: true, text: `We asked for ${ASK_TEXT[ask]}. They'll come back to us next week.` };
}

export function walkAway(state: GameState): { ok: boolean; text: string } {
  const l = lease(state);
  if (!l?.talks) return { ok: false, text: "There are no talks to leave." };
  delete l.talks;
  l.log.unshift({ date: state.date, text: "We broke off lease talks for the year." });
  return { ok: true, text: "Talks are off until next spring." };
}

export const ASK_TEXT: Record<LeaseAsk, string> = {
  money: "more public money", rent: "a lower rent", upkeep: "the city to take on more of the maintenance",
  events: "a bigger share of non-NFL events", option: "renewal options at the same rent",
};

function answer(state: GameState): void {
  const l = state.leases![state.userTeam];
  const t = l.talks!;
  const w = t.waiting!;
  if (daysBetween(w.date, state.date) < 7) return;
  delete t.waiting;
  t.round++;
  const s = STADIUM_BY_TEAM[state.userTeam];
  const rng = rngFor(state.seed, `lease-answer:${state.userTeam}:${state.date}`);
  const g = generosity(state, state.userTeam);
  // With the lease nearly out, the public side gives more; each push after the first wears on them.
  const left = l.through - nextSeason(state) + 1;
  const p = 0.25 + 0.4 * g + (left <= 1 ? 0.15 : 0) - 0.12 * (t.round - 1);
  const from = s.owner;
  if (rng() < p) {
    if (w.ask === "money") t.offer.publicMoney = Math.round((t.offer.publicMoney * (1.1 + 0.15 * rng()) + 10 * M) / M) * M;
    else if (w.ask === "rent") t.offer.rent = Math.round((t.offer.rent * (0.8 + 0.1 * rng())) / 50_000) * 50_000;
    // Maintenance duties: the public side picks up more of the building's capital repairs.
    else if (w.ask === "upkeep") t.offer.upkeep = Math.round((t.offer.upkeep * (0.82 + 0.08 * rng())) / 100_000) * 100_000;
    // Commercial rights: more of the concerts and other events the building books.
    else if (w.ask === "events") t.offer.eventShare = Math.min(1, Math.round((t.offer.eventShare + 0.1 + 0.1 * rng()) * 100) / 100);
    else t.offer.option = (t.offer.option ?? 0) + 5;
    send(state, "business", from, "Lease talks: a better offer", `We can move a little: ${describe(t.offer)}. We'd like to get this done.`);
  } else {
    t.patience--;
    if (t.patience <= 0) {
      delete l.talks;
      l.log.unshift({ date: state.date, text: `${from} broke off talks for the year.` });
      send(state, "business", from, "Lease talks are off", "We've gone as far as we can this year. We can pick this up next spring.");
      news(state, `Lease talks between the ${teamLabel(state.userTeam)} and ${from} break off`);
      return;
    }
    send(state, "business", from, "Lease talks: no movement", `That's not something we can do. Our offer stands: ${describe(t.offer)}.`);
  }
}

// ---- Each day ----

/** The lease year: talks open three seasons out, CPU teams settle, and expired leases roll over a year at a time. */
function newLeagueYear(state: GameState): void {
  const next = nextSeason(state);
  for (const [team, l] of Object.entries(state.leases!)) {
    const left = l.through - next + 1;
    if (l.through < next) {
      // Ran out unsigned: a year-to-year deal at a higher rent while the talks go on.
      l.through = next;
      l.rent = Math.round((l.rent * 1.15) / 50_000) * 50_000;
      l.holdover = true;
      l.log.unshift({ date: state.date, text: `The lease ran out; we're playing ${next} on a one-year extension at ${money(l.rent)}.` });
      bindLeases(state);
      news(state, `The ${teamLabel(team)} play ${next} at ${STADIUM_BY_TEAM[team].name} on a one-year lease extension`);
    }
    if (team === state.userTeam) {
      if (left <= 3 && !l.talks) {
        const offer = firstOffer(state, team);
        l.talks = { opened: state.date, round: 0, offer, patience: 3 };
        const s = STADIUM_BY_TEAM[team];
        send(state, "business", s.owner, "Talks on a new lease",
          `Our lease with you runs through ${l.through}. We'd like to start on the next one now: ${describe(offer)}. ` +
          "You can sign, push for more, or walk away for the year from the Business page.");
      }
      continue;
    }
    // Other teams settle with a season or two left, most of them on the first try.
    if (left <= 2 && rngFor(state.seed, `lease-cpu:${team}:${next}`)() < 0.7) sign(state, team, firstOffer(state, team));
  }
}

export function leasesDaily(state: GameState): void {
  ensureLeases(state);
  if (state.date === RULES.keyDates.newLeagueYear) newLeagueYear(state);
  const l = state.leases![state.userTeam];
  if (l?.talks?.waiting) answer(state);
}

/** The lease line for the Business page. */
export function leaseSummary(state: GameState): string | null {
  const l = lease(state);
  if (!l) return null;
  const parts = [`Runs through the ${l.through} season${l.holdover ? " (year to year)" : ""}; ${money(l.rent)} a year in rent.`];
  if (l.fund > 0) parts.push(`${money(l.fund)} of public renovation money is set aside for stadium projects.`);
  if (l.talks) parts.push(`Talks open since ${l.talks.opened}.`);
  return parts.join(" ");
}
