// Contract tools the owner writes and reads: option bonuses the club has to
// exercise, cash beside cap for any deal, a cap planner that tries
// hypothetical deals across future years, the compensatory pick formula and
// its forecast, and our own offer sheets to other teams' restricted free
// agents.
//
// Option bonus: a lump the club pays by the fifth day of the second league
// year to keep the later years. Exercised, it is paid at once and spread over
// the years left (up to five) like a signing bonus; declined, the later years
// void and the player is a free agent, with the signing bonus he still had
// coming accelerating onto this year's cap.
import { addDeadMoney, capSummary, invalidateRosters, teamPlayerIds } from "./cap";
import { dealCapHit, lastYear, leagueYear, MAX_PRORATION_YEARS, salaryCap, writeDeal } from "./contracts";
import { addDays, shortDate } from "./dates";
import { payCash } from "./finance";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, teamLabel } from "./league";
import { honors } from "./honors";
import { tenderCompensation } from "./offseason";
import { logMove } from "./roster";
import { seasonTotals } from "./stats";
import type { Deal, GameState, OfferTerms } from "./types";

// ---- Option bonuses ----

/** Spreads an exercised option bonus over the years left, from the option year on. */
function exercise(state: GameState, deal: Deal): void {
  const o = deal.option!;
  o.exercised = true;
  const years = deal.years.filter((y) => y.year >= o.year).slice(0, MAX_PRORATION_YEARS);
  const per = Math.round(o.amount / Math.max(1, years.length));
  years.forEach((y, i) => (y.proration += i === years.length - 1 ? o.amount - per * (years.length - 1) : per));
  payCash(state, deal.team, o.amount, o.year);
  invalidateRosters(state);
}

/** Declining: the years from the option year void, and he leaves as a free agent. */
function decline(state: GameState, id: string, deal: Deal): void {
  const o = deal.option!;
  o.declined = true;
  const team = deal.team;
  const dead = deal.years.filter((y) => y.year >= o.year).reduce((s, y) => s + y.proration, 0);
  addDeadMoney(state, team, leagueYear(state.date), dead);
  const p = state.players[id];
  state.contracts[id] = null;
  state.players[id] = { team: null, status: "fa", injury: p.injury, dev: p.dev, pot: p.pot, exp: p.exp, morale: p.morale, lastTeam: team };
  invalidateRosters(state);
  logMove(state, team, id, "released", `declined the option on ${PLAYER_BY_ID[id].name}; he is a free agent`);
}

/** The owner's call on an option bonus. */
export function decideOption(state: GameState, id: string, keep: boolean): string | null {
  const deal = state.contracts[id];
  if (!deal?.option || deal.option.exercised || deal.option.declined) return "There is no open option on this contract.";
  if (state.players[id]?.team !== deal.team) return "He isn't on our roster.";
  if (keep && capSummary(state, deal.team, deal.option.year).space < deal.option.amount / Math.min(MAX_PRORATION_YEARS, deal.years.filter((y) => y.year >= deal.option!.year).length)) {
    return "Exercising it would put that year over the cap. Clear room first.";
  }
  if (keep) exercise(state, deal);
  else decline(state, id, deal);
  return null;
}

/** Open options, for the contract screens. */
export function openOptions(state: GameState, team = state.userTeam): { id: string; amount: number; by: string; year: number }[] {
  return teamPlayerIds(state, team).flatMap((id) => {
    const o = state.contracts[id]?.option;
    return o && !o.exercised && !o.declined ? [{ id, amount: o.amount, by: o.by, year: o.year }] : [];
  });
}

/** Reminds the owner a month out; on the day, the club exercises unless told not to (other teams decide on value). */
function optionsDaily(state: GameState): void {
  for (const [id, deal] of Object.entries(state.contracts)) {
    const o = deal?.option;
    if (!deal || !o || o.exercised || o.declined) continue;
    if (state.players[id]?.team !== deal.team) continue;
    const p = PLAYER_BY_ID[id];
    if (deal.team === state.userTeam && state.date === addDays(o.by, -30)) {
      send(state, "transaction", "Salary cap manager", `Option bonus due: ${p.name}`,
        `${p.name}'s ${money(o.amount)} option bonus is due by ${shortDate(o.by)}. Exercising it keeps him through ${lastYear(deal)} and spreads the money over the years left; declining it voids those years and makes him a free agent. Decide on his page. If we don't, the club exercises it on the day.`);
    }
    if (state.date < o.by) continue;
    if (deal.team === state.userTeam) { exercise(state, deal); continue; }
    const age = RULES.season - Number((p.birthDate ?? "1995").slice(0, 4));
    const hit = dealCapHit(deal, o.year) + o.amount / 3;
    const worth = (state.players[id]?.injury ? 0.6 : 1) * (age >= 32 ? 0.7 : 1) * salaryCap(state, o.year) * 0.06;
    if (hit <= worth * 3 || capSummary(state, deal.team, o.year).space > o.amount) exercise(state, deal);
    else { decline(state, id, deal); news(state, `The ${teamLabel(deal.team)} decline ${p.name}'s option bonus; he becomes a free agent`); }
  }
}

// ---- Cash beside cap ----

export interface CashCapRow { year: number; cash: number; cap: number; guaranteed: number; void: boolean }

/**
 * Each league year of a deal, cash paid against the cap charge: a signing
 * bonus is cash in the year signed but spread on the cap; roster bonuses are
 * cash in March; void years are cap with no cash.
 */
export function cashVsCap(deal: Deal): CashCapRow[] {
  const signedYear = leagueYear(deal.signed);
  return deal.years.map((y) => ({
    year: y.year,
    cash: y.void ? 0 : Math.round(y.base * (y.weeks ?? 18) / 18 + Math.max(0, y.bonus) + (y.year === signedYear ? deal.signingBonus : 0) + (deal.option?.year === y.year ? deal.option.amount : 0)),
    cap: dealCapHit(deal, y.year),
    guaranteed: y.void ? 0 : y.guaranteed + (y.year === signedYear ? deal.signingBonus : 0),
    void: !!y.void,
  }));
}

// ---- The cap planner ----

export interface PlanDeal { label: string; terms: OfferTerms; firstYear: number; cutAfter?: number }
export interface PlanYear { year: number; cap: number; committed: number; dead: number; added: number; space: number }

/**
 * The club's cap for the next five league years with hypothetical contracts
 * added: what is on the books, the dead money already owed, and what each
 * trial deal counts, including the dead money it leaves if he's cut after a
 * chosen year.
 */
export function capPlanner(state: GameState, team: string, deals: PlanDeal[], years = 5): PlanYear[] {
  const first = leagueYear(state.date);
  const trial = deals.map((d) => writeDeal({ ...d.terms }, { team, date: state.date, kind: "veteran", firstYear: d.firstYear, yearsExp: 4 }));
  const out: PlanYear[] = [];
  for (let year = first; year < first + years; year++) {
    const s = capSummary(state, team, year);
    let added = 0;
    trial.forEach((deal, i) => {
      const cut = deals[i].cutAfter;
      if (cut != null && year > cut) {
        // Cut after `cut`: the bonus proration still to come lands on the next year.
        if (year === cut + 1) added += deal.years.filter((y) => y.year > cut).reduce((t, y) => t + y.proration + y.guaranteed, 0);
        return;
      }
      added += dealCapHit(deal, year);
    });
    out.push({ year, cap: s.limit, committed: s.players, dead: s.dead, added: Math.round(added), space: Math.round(s.space - added) });
  }
  return out;
}

// ---- Compensatory picks ----

export interface CompLine { player: string; from: string; to: string; apy: number; value: number; round: number }
export interface CompResult { team: string; round: number; player: string; to: string; apy: number }

/**
 * The compensatory formula as the league runs it, closely enough: each
 * qualifying free agent (contract expired, signed elsewhere in the signing
 * period) is valued by his new contract's APY against the cap, nudged up for
 * playing time in his first season and for postseason honors. Values set a
 * round from 3 to 7. Only a net loss earns picks: each signing cancels a loss
 * of the same round, or else the best one below it, and what is left becomes
 * picks, at most four a team. Equal numbers with more value lost earn one
 * seventh-rounder. The league awards at most 32.
 */
export function compFormula(state: GameState, draftYear: number): { picks: CompResult[]; lines: Record<string, { lost: CompLine[]; gained: CompLine[] }> } {
  const moves = state.league?.cfa?.[draftYear] ?? [];
  const cap = salaryCap(state, draftYear - 1);
  const season = draftYear - 1;
  const live = RULES.season === season ? seasonTotals(state, "REG") : {};
  const h = honors(state);
  const valueOf = (m: { player: string; apy: number }) => {
    const snaps = PLAYER_BY_ID[m.player]?.snaps?.[String(season)];
    const share = snaps ? Math.max(snaps.offShare, snaps.defShare, snaps.stShare * 0.5)
      : (() => { const l = live[m.player]?.line; return l ? Math.min(1, ((l.offSnaps ?? 0) + (l.defSnaps ?? 0)) / 900) : 0.5; })();
    const pb = (h.proBowl[season] ?? []).includes(m.player) ? 0.004 : 0;
    const ap = h.allPro[season]?.first.includes(m.player) ? 0.008 : h.allPro[season]?.second.includes(m.player) ? 0.004 : 0;
    return m.apy / cap + (share - 0.5) * 0.01 + pb + ap;
  };
  const roundOf = (v: number) => (v >= 0.08 ? 3 : v >= 0.045 ? 4 : v >= 0.025 ? 5 : v >= 0.012 ? 6 : v >= 0.006 ? 7 : 0);
  const lines: Record<string, { lost: CompLine[]; gained: CompLine[] }> = {};
  for (const m of moves) {
    const value = valueOf(m);
    const round = roundOf(value);
    if (!round) continue;
    const line = { player: m.player, from: m.from, to: m.to, apy: m.apy, value, round };
    (lines[m.from] ??= { lost: [], gained: [] }).lost.push(line);
    (lines[m.to] ??= { lost: [], gained: [] }).gained.push(line);
  }
  const out: (CompResult & { value: number })[] = [];
  for (const [team, { lost, gained }] of Object.entries(lines)) {
    if (!lost.length) continue;
    const left = [...lost].sort((a, b) => b.value - a.value);
    for (const g of [...gained].sort((a, b) => a.round - b.round)) {
      let i = left.findIndex((l) => l.round === g.round);
      if (i < 0) i = left.findIndex((l) => l.round > g.round);
      if (i >= 0) left.splice(i, 1);
    }
    const net = lost.length - gained.length;
    if (net > 0) {
      for (const l of left.slice(0, Math.min(4, net))) out.push({ team, round: l.round, player: PLAYER_BY_ID[l.player]?.name ?? l.player, to: l.to, apy: l.apy, value: l.value });
    } else if (net === 0 && lost.reduce((t, l) => t + l.value, 0) > gained.reduce((t, l) => t + l.value, 0) && left.length) {
      const l = left[0];
      out.push({ team, round: 7, player: PLAYER_BY_ID[l.player]?.name ?? l.player, to: l.to, apy: l.apy, value: 0.0055 });
    }
  }
  out.sort((a, b) => b.value - a.value);
  const picks = out.slice(0, 32).sort((a, b) => a.round - b.round || b.value - a.value).map(({ value: _v, ...c }) => c);
  return { picks, lines };
}

/** The owner's forecast for the next compensatory awards: who we lost and signed, and the picks it projects. */
export function compForecast(state: GameState, team = state.userTeam): { draftYear: number; lost: CompLine[]; gained: CompLine[]; picks: CompResult[] } | null {
  const years = Object.keys(state.league?.cfa ?? {}).map(Number).filter((y) => y > RULES.season).sort((a, b) => a - b);
  const draftYear = years[0];
  if (!draftYear) return null;
  const r = compFormula(state, draftYear);
  return { draftYear, lost: r.lines[team]?.lost ?? [], gained: r.lines[team]?.gained ?? [], picks: r.picks.filter((p) => p.team === team) };
}

// ---- Our offer sheets ----

/**
 * An offer sheet to another team's restricted free agent. He signs it if it
 * beats what he'd take; his team then has five days to match, and if it
 * doesn't, he's ours and we owe the draft pick his tender calls for.
 */
export function canOfferSheet(state: GameState, id: string): { ok: boolean; reason?: string } {
  const o = state.offseason;
  const t = o?.tenders[id];
  if (!t) return { ok: false, reason: "He isn't a tendered restricted free agent." };
  if (t.team === state.userTeam) return { ok: false, reason: "He's ours." };
  if (t.level === "erfa") return { ok: false, reason: "Exclusive-rights free agents can only negotiate with their own team." };
  if (o!.sheets.some((s) => s.player === id)) return { ok: false, reason: "He has already signed an offer sheet." };
  const K = RULES.keyDates;
  if (state.date < K.newLeagueYear || state.date > addDays(K.draftStart, -7)) return { ok: false, reason: "Offer sheets can be signed from the new league year until the week before the draft." };
  return { ok: true };
}

export function sendOfferSheet(state: GameState, id: string, terms: OfferTerms, ask: number): string {
  const can = canOfferSheet(state, id);
  if (!can.ok) return can.reason!;
  const tender = state.offseason!.tenders[id];
  const compensation = tender.level === "erfa" ? undefined : tenderCompensation(id, tender.level);
  const year = leagueYear(state.date);
  const firstHit = writeDeal({ ...terms }, { team: state.userTeam, date: state.date, kind: "veteran", firstYear: year, yearsExp: 4 });
  if (capSummary(state, state.userTeam).space < dealCapHit(firstHit, year)) return "We don't have the cap room for the first year.";
  const apy = terms.total / terms.years;
  if (apy < Math.max(ask, tender.amount * 1.1)) return `${PLAYER_BY_ID[id].name}'s agent says he won't sign for that. It has to beat his tender clearly.`;
  state.offseason!.sheets.push({ player: id, from: tender.team, to: state.userTeam, terms, date: state.date, decideBy: addDays(state.date, 5), compensation });
  news(state, `${PLAYER_BY_ID[id].name} signs an offer sheet with the ${teamLabel(state.userTeam)}; the ${teamLabel(tender.team)} have five days to match`);
  return `He signed it. The ${teamLabel(tender.team)} have until ${shortDate(addDays(state.date, 5))} to match.`;
}

// ---- Daily ----

export function contractExtrasDaily(state: GameState): void {
  optionsDaily(state);
}
