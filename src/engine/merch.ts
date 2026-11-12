// Merchandise and the brand. The league licenses every club's marks
// centrally: royalties from licensed goods sold anywhere go into the league's
// pool and come back as part of the national money, split 32 ways. What the
// club sells itself (the stadium stores and stands, and its own online store)
// is local money. The jersey business runs on a preseason order by player:
// order too few and fans go home without one, too many and they end up marked
// down, and a star traded or cut leaves stock nobody wants. Stores and the
// online shop can be run in house or by an operator for a share of sales.
// A rebrand (uniforms, logo or, rarely, the name) needs league approval and
// lead time; it costs real money, makes the old stock obsolete, and lifts
// sales for a few seasons. Throwback lines sell best around anniversaries, and
// counterfeiters work the crowds at big games.
import { demandFactor } from "./economy";
import { business, businessChief, inflation, nationalRevenue, post } from "./business";
import { teamPlayerIds } from "./cap";
import { marketability } from "./clubhouse";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { fanBase, reachLift, trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, SCHEDULE, TEAM_BY_ID, TEAMS } from "./league";
import { owners } from "./owners";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { history } from "./seasons";
import { gaussian, rngFor } from "./rng";
import { standings, winPct } from "./standings";
import { startSaga } from "./teammedia";
import type { GameState, MerchChannel, MerchSeason, MerchState, RebrandKind, ScheduledGame } from "./types";

const JERSEY_PRICE = 130;
const JERSEY_COST = 45;
/** Licensed goods' royalties in each club's share of national revenue. */
export const LICENSING_SHARE = 0.06;
/** What an operator or e-commerce partner pays the club, as a share of gross sales. */
const OPERATOR_SHARE = 0.22;
const PARTNER_SHARE = 0.15;
/** In-house stands keep about this share of gross after the goods and the staff. */
const STAND_MARGIN = 0.45;
export const REBRAND: Record<RebrandKind, { label: string; cost: number; lead: number; lift: number; gap: number }> = {
  uniform: { label: "New uniforms", cost: 4_000_000, lead: 1, lift: 1.15, gap: 5 },
  logo: { label: "New logo and uniforms", cost: 12_000_000, lead: 1, lift: 1.22, gap: 8 },
  name: { label: "New team name", cost: 30_000_000, lead: 2, lift: 1.35, gap: 15 },
};

/** The clubs' original names, so a save's rebrand can be laid over the league data and undone for another save. */
const ORIGINAL_NAMES: Record<string, string> = Object.fromEntries(TEAMS.map((t) => [t.id, t.name]));

export function merch(state: GameState): MerchState {
  return (state.merch ??= {
    brand: { name: TEAM_BY_ID[state.userTeam].name, logo: 1, uniform: 1, since: RULES.season },
    price: 1, depth: 1, stores: "inHouse", online: "inHouse", enforcement: false,
    stock: {}, seasons: [],
  });
}

/** Lays the save's team name over the league data (a renamed club), and puts the others back. */
export function bindBrand(state: GameState): void {
  for (const [id, name] of Object.entries(ORIGINAL_NAMES)) TEAM_BY_ID[id].name = name;
  // Clubs the owner rebranded and later left keep their new names.
  for (const [id, name] of Object.entries(state.tenure?.brands ?? {})) if (TEAM_BY_ID[id]) TEAM_BY_ID[id].name = name;
  const m = state.merch;
  if (m && m.brand.name !== ORIGINAL_NAMES[state.userTeam]) TEAM_BY_ID[state.userTeam].name = m.brand.name;
}

function season(state: GameState): MerchSeason {
  const m = merch(state);
  let s = m.seasons.find((x) => x.season === RULES.season);
  if (!s) {
    s = { season: RULES.season, gross: 0, cogs: 0, markdowns: 0, writeoffs: 0, returns: 0, discounts: 0, operatorShare: 0, counterfeit: 0, lostSales: 0, online: 0, stands: 0, units: {} };
    m.seasons.unshift(s);
    m.seasons.length = Math.min(m.seasons.length, 6);
  }
  return s;
}

/** Sales lift from a recent rebrand and this season's throwback line. */
export function brandLift(state: GameState): number {
  const m = merch(state);
  let lift = 1;
  const l = m.brand.lift;
  if (l) {
    const age = RULES.season - l.season;
    if (age >= 0 && age < 3) lift *= 1 + (REBRAND[l.kind].lift - 1) * (1 - age / 3);
  }
  if (m.retro === RULES.season) lift *= anniversary(state) ? 1.2 : 1.1;
  return lift;
}

/** A title anniversary this season (5, 10, 15... years). */
export function anniversary(state: GameState): number | null {
  for (const s of history(state).seasons) {
    const n = RULES.season - s.season;
    if (s.champion === state.userTeam && n > 0 && n % 5 === 0) return n;
  }
  return null;
}

// ---- Jerseys ----

/** The staff's forecast of jersey sales this season, by player, at today's price. */
export function jerseyForecast(state: GameState): { id: string; name: string; units: number }[] {
  const m = merch(state);
  const r = standings(state)[state.userTeam];
  const wp = r && r.w + r.l + r.t ? winPct(r.w, r.l, r.t) : 0.5;
  const scale = reachLift(state) * (0.85 + wp * 0.3) * Math.pow(m.price, -1.4) * brandLift(state);
  const list = teamPlayerIds(state, state.userTeam).map((id) => ({ id, name: PLAYER_BY_ID[id]?.name ?? id, units: Math.round(17_000 * Math.pow(marketability(state, id), 2.2) * scale) }))
    .sort((a, b) => b.units - a.units);
  const top = list.slice(0, 8);
  const rest = list.slice(8).reduce((a, x) => a + x.units, 0);
  return [...top, { id: "team", name: "Other players and blank jerseys", units: Math.round(rest * 0.18 + 2_500 * scale) }];
}

/** The preseason order: the forecast times how deep the owner wants to stock. */
export function placeOrder(state: GameState): void {
  const m = merch(state);
  m.stock = {};
  const cost = JERSEY_COST * inflation(leagueYear(state.date), 0.03) / inflation(RULES.season, 0.03);
  for (const f of jerseyForecast(state)) {
    // What fans actually buy differs from the forecast: a breakout, a slump, an injury (engine only).
    const rng = rngFor(state.seed, `jersey:${RULES.season}:${f.id}`);
    m.stock[f.id] = { ordered: Math.round(f.units * m.depth), sold: 0, cost, name: f.name, demand: f.units, luck: Math.max(0.5, 1 + gaussian(rng) * 0.18) };
  }
  m.orderedFor = RULES.season;
}

/** A midseason reorder for one player, at a rush premium. */
export function reorder(state: GameState, id: string, units: number): string | null {
  const st = merch(state).stock[id];
  if (!st) return "We don't stock that player.";
  st.ordered += units;
  st.cost = (st.cost * (st.ordered - units) + st.cost * 1.2 * units) / st.ordered;
  return null;
}

/** The club's take: its margin in house, or the operator's or partner's payment on gross sales. */
function net(gross: number, channel: MerchChannel, margin: number, rate: number): { net: number; share: number } {
  if (channel === "partner") return { net: gross * rate, share: gross * (1 - rate) };
  return { net: gross * margin, share: 0 };
}

/** A week of jersey sales, at games and online; returns what's lost to empty racks. */
function sellJerseys(state: GameState, week: number, big: boolean): number {
  const m = merch(state);
  const s = season(state);
  const price = JERSEY_PRICE * m.price * inflation(leagueYear(state.date), 0.03) / inflation(2026, 0.03);
  let lost = 0;
  for (const [id, st] of Object.entries(m.stock)) {
    if (id !== "team" && state.players[id]?.team !== state.userTeam) continue;
    // Demand follows the forecast, moved by how the season is going and what nobody could forecast.
    const r = standings(state)[state.userTeam];
    const form = r && r.w + r.l + r.t >= 3 ? (0.85 + winPct(r.w, r.l, r.t) * 0.3) / 1 : 1;
    const hurt = id !== "team" && state.players[id]?.injury ? 0.6 : 1;
    const want = st.demand * week * (st.luck ?? 1) * form * hurt;
    const sold = Math.min(want, st.ordered - st.sold);
    lost += Math.max(0, want - sold) * price;
    st.sold += sold;
    s.units[id] = (s.units[id] ?? 0) + Math.round(sold);
    const gross = sold * price;
    // Counterfeiters take a share of the sales around big games unless the club goes after them.
    const fake = big ? gross * (m.enforcement ? 0.02 : 0.08) : 0;
    const g = gross - fake;
    const online = g * 0.45;
    const stands = g - online;
    const a = net(online, m.online, 1 - st.cost / price - 0.12, PARTNER_SHARE);
    const b = net(stands, m.stores, 1 - st.cost / price - 0.08, OPERATOR_SHARE);
    s.gross += g; s.online += online; s.stands += stands; s.counterfeit += fake;
    s.cogs += m.online === "inHouse" ? online * st.cost / price : 0;
    s.cogs += m.stores === "inHouse" ? stands * st.cost / price : 0;
    s.operatorShare += a.share + b.share;
    s.returns += online * 0.03 * (m.online === "inHouse" ? 1 : 0);
    if (m.price < 1) s.discounts += g * (1 - m.price);
    const value = a.net + b.net - online * 0.03 * (m.online === "inHouse" ? 1 : 0);
    if (value) post(state, "merch", value, "Jersey sales, stores and online");
  }
  s.lostSales += lost;
  return lost;
}

/**
 * What the stands sell at a home game: the stadium merchandise from the gate
 * model, moved by price, the channel, counterfeits and a rebrand. Returns the
 * club's take and what was missed for lack of stock.
 */
export function merchGame(state: GameState, g: ScheduledGame, standsNet: number, big: boolean): { net: number; short: number } {
  const m = merch(state);
  const s = season(state);
  const gross = (standsNet / STAND_MARGIN) * Math.pow(m.price, -0.4) * brandLift(state);
  const fake = big ? gross * (m.enforcement ? 0.02 : 0.06) : 0;
  const sold = gross - fake;
  const r = net(sold, m.stores, STAND_MARGIN * (2 - 1 / m.price), OPERATOR_SHARE);
  s.gross += sold; s.stands += sold; s.counterfeit += fake; s.operatorShare += r.share;
  if (m.stores === "inHouse") s.cogs += sold * (1 - STAND_MARGIN) * 0.7;
  if (big && m.enforcement) post(state, "merch", -35_000, `${g.id}: counterfeit enforcement around the stadium`);
  // About 40% of a season's jerseys sell at the home games, the rest online through the season.
  const homes = SCHEDULE.filter((x) => x.type === "REG" && x.home === state.userTeam && !x.neutral).length;
  const short = g.type === "REG" ? sellJerseys(state, 0.4 / Math.max(1, homes), big) : 0;
  return { net: r.net, short };
}

/** Writes off a player's jerseys when he's gone: a liquidator pays 30 cents on the dollar. */
function writeOffGone(state: GameState): void {
  const m = merch(state);
  for (const [id, st] of Object.entries(m.stock)) {
    if (id === "team" || state.players[id]?.team === state.userTeam) continue;
    const left = st.ordered - st.sold;
    if (left <= 0) continue;
    const loss = left * st.cost * 0.7;
    season(state).writeoffs += loss;
    post(state, "merch", -loss, `${st.name} jerseys left after he left the team, sold to a liquidator`);
    st.ordered = st.sold;
    if (left > 500) send(state, "business", businessChief(state), `${Math.round(left).toLocaleString("en-US")} ${st.name} jerseys`,
      `With ${st.name} gone, his jerseys can't be sold at full price. A liquidator took them for 30 cents on the dollar; the loss was ${money(loss)}.`);
  }
}

/** At the end of the season: everything left is marked down, and the year's statement goes out. */
function closeSeason(state: GameState): void {
  const m = merch(state);
  const s = season(state);
  let loss = 0;
  for (const st of Object.values(m.stock)) loss += Math.max(0, st.ordered - st.sold) * st.cost * 0.5;
  if (loss) {
    s.markdowns += loss;
    post(state, "merch", -loss, "Season-end markdowns on unsold jerseys");
  }
  for (const st of Object.values(m.stock)) st.ordered = st.sold;
  const top = Object.entries(s.units).filter(([id]) => id !== "team").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, u]) => `${PLAYER_BY_ID[id]?.name ?? id} (${u.toLocaleString("en-US")})`);
  const lic = licensingIncome(leagueYear(state.date));
  send(state, "business", businessChief(state), `${RULES.season} merchandise and royalty statement`,
    `League licensing royalties (our 1/32 share, inside national revenue): about ${money(lic)}.\n` +
    `Our own sales: ${money(s.gross)} gross, ${money(s.online)} of it online. Cost of goods ${money(s.cogs)}, operator and partner shares ${money(s.operatorShare)}, returns ${money(s.returns)}, discounts ${money(s.discounts)}, markdowns ${money(s.markdowns)}, write-offs ${money(s.writeoffs)}.\n` +
    `Counterfeits cost us about ${money(s.counterfeit)}; empty racks about ${money(s.lostSales)} in missed jersey sales.` + (top.length ? `\nTop sellers: ${top.join(", ")}.` : ""));
}

/** Our share of the league's licensing royalties, part of the national money. */
export function licensingIncome(year: number): number {
  return nationalRevenue(year) * LICENSING_SHARE;
}

// ---- Online store ----

/** A week of the online store's other goods: apparel, hats, gifts. Strongest at the holidays. */
function onlineWeek(state: GameState): void {
  const m = merch(state);
  const s = season(state);
  const month = Number(state.date.slice(5, 7));
  const holiday = month === 12 ? 2.2 : month === 11 ? 1.4 : month >= 9 || month <= 1 ? 1 : 0.45;
  const f = fanBase(state);
  const gross = 90_000 * holiday * reachLift(state) * demandFactor(state, state.userTeam) * Math.pow(m.price, -1.2) * brandLift(state) * (0.9 + f.trust / 600) * inflation(leagueYear(state.date), 0.03) / inflation(2026, 0.03);
  const r = net(gross, m.online, 0.32, PARTNER_SHARE);
  s.gross += gross; s.online += gross; s.operatorShare += r.share;
  if (m.online === "inHouse") {
    s.cogs += gross * 0.5;
    s.returns += gross * 0.03;
  }
  post(state, "merch", r.net - (m.online === "inHouse" ? gross * 0.03 : 0), "Online store");
}

// ---- Rebrands ----

export function requestRebrand(state: GameState, kind: RebrandKind, name?: string): string | null {
  const m = merch(state);
  if (m.rebrand && !m.rebrand.decided) return "A rebrand is already with the league.";
  if (m.rebrand?.approved && m.rebrand.launches && m.rebrand.launches > RULES.season) return "A rebrand is already on the way.";
  if (kind === "name" && !(name ?? "").trim()) return "Pick the new name.";
  if (kind === "name" && TEAMS.some((t) => t.name.toLowerCase() === name!.trim().toLowerCase())) return "Another club already uses that name.";
  m.rebrand = { kind, name: name?.trim(), asked: state.date, cost: Math.round(REBRAND[kind].cost * inflation(leagueYear(state.date), 0.03)), paid: 0 };
  send(state, "league", "League Office", "Your rebrand request", `The league's marks committee has your request (${REBRAND[kind].label.toLowerCase()}${name ? `: the ${name}` : ""}). Expect an answer within a month.`);
  return null;
}

function decideRebrand(state: GameState): void {
  const m = merch(state);
  const r = m.rebrand!;
  const last = m.brand.lift?.season;
  const gap = last != null ? RULES.season - last : 99;
  const rel = Object.values(owners(state).relations);
  const rapport = rel.reduce((a, x) => a + x.rapport, 0) / Math.max(1, rel.length);
  // The league wants marks to last: a recent change, or a name change from a club other owners are cool on, gets turned down.
  const ok = gap >= REBRAND[r.kind].gap && (r.kind !== "name" || rapport > -10);
  r.decided = state.date;
  r.approved = ok;
  if (!ok) {
    send(state, "league", "League Office", "Rebrand not approved",
      gap < REBRAND[r.kind].gap ? `The marks committee won't approve another change so soon after the last one (${REBRAND[r.kind].gap} seasons is the norm).` : "The committee wasn't persuaded a new name is right for the club and the league. You can ask again next year.");
    return;
  }
  // Lead time: suppliers and licensees need a season, a new name two.
  r.launches = RULES.season + REBRAND[r.kind].lead;
  const half = Math.round(r.cost / 2);
  r.paid = half;
  post(state, "brand", -half, `${REBRAND[r.kind].label}: design, legal and the league's approval process`);
  send(state, "league", "League Office", "Rebrand approved",
    `The league approved ${r.kind === "name" ? `the new name, the ${r.name},` : REBRAND[r.kind].label.toLowerCase()} for the ${r.launches} season. The rest of the cost (${money(r.cost - half)}) comes due at launch: signage, the field, uniforms and licensee changeovers.`);
}

function launchRebrand(state: GameState): void {
  const m = merch(state);
  const r = m.rebrand!;
  post(state, "brand", -(r.cost - r.paid), `${REBRAND[r.kind].label}: signage, field, uniforms and licensee changeovers`);
  r.paid = r.cost;
  // Everything on the shelves with the old marks is obsolete.
  let loss = 0;
  for (const st of Object.values(m.stock)) {
    loss += Math.max(0, st.ordered - st.sold) * st.cost * 0.7;
    st.ordered = st.sold;
  }
  if (loss) post(state, "merch", -loss, "Old-brand stock written off");
  const us = state.userTeam;
  const old = TEAM_BY_ID[us].name;
  m.brand.lift = { kind: r.kind, season: RULES.season };
  if (r.kind === "uniform") m.brand.uniform++;
  else m.brand.logo++;
  if (r.kind === "name" && r.name) {
    m.brand.name = r.name;
    m.brand.since = RULES.season;
    bindBrand(state);
    // Generations of fans grew up with the old name.
    trustHit(state, -6, 2, `Renamed the club the ${r.name}`);
    const f = fanBase(state);
    f.core = Math.max(10, f.core - 4);
    startSaga(state, "rename", `The ${old} became the ${r.name}`, 6);
    news(state, `The ${TEAM_BY_ID[us].city} ${old} are now the ${TEAM_BY_ID[us].city} ${r.name}`);
  }
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.reporter, kind: "owner", teams: [us],
    headline: r.kind === "name" ? `Meet the ${TEAM_BY_ID[us].city} ${r.name}` : `${TEAM_BY_ID[us].name} unveil ${r.kind === "logo" ? "a new logo and uniforms" : "new uniforms"}`,
    body: r.kind === "name" ? `The team formerly known as the ${old} played its first season under the new name. Longtime fans are split; the new gear is flying off the shelves.` : "The new look is in the stores today, and early sales are strong.",
  });
  delete m.rebrand;
}

// ---- Settings ----

export function setMerchPrice(state: GameState, level: number): void {
  merch(state).price = Math.max(0.8, Math.min(1.3, Math.round(level * 100) / 100));
}
export function setOrderDepth(state: GameState, depth: number): void {
  merch(state).depth = Math.max(0.6, Math.min(1.5, Math.round(depth * 100) / 100));
}
export function setChannel(state: GameState, which: "stores" | "online", c: MerchChannel): void {
  merch(state)[which] = c;
}
export function setEnforcement(state: GameState, on: boolean): void {
  merch(state).enforcement = on;
}
export function launchRetro(state: GameState): string | null {
  const m = merch(state);
  if (m.retro === RULES.season) return "This season's throwback line is already out.";
  m.retro = RULES.season;
  post(state, "brand", -400_000 * inflation(leagueYear(state.date), 0.03), "Throwback line: design and the league's sign-off on the historic marks");
  return null;
}

/** Big games bring the crowds, and the counterfeiters. */
export function bigGame(state: GameState, g: ScheduledGame): boolean {
  const prime = g.weekday === "Monday" || g.weekday === "Thursday" || g.timeET >= "20:00";
  return g.type === "POST" || prime || (business(state).gates[0]?.game === g.id && business(state).gates[0].tier === "marquee");
}

export function merchDaily(state: GameState): void {
  const m = merch(state);
  const K = RULES.keyDates;
  if (m.orderedFor !== RULES.season && state.date >= addDays(K.regularSeasonStart, -45) && state.date < K.regularSeasonEnd) placeOrder(state);
  if (state.date.endsWith("-01") || state.date.endsWith("-15")) writeOffGone(state);
  const wd = new Date(state.date + "T12:00:00Z").getUTCDay();
  if (wd === 2) onlineWeek(state);
  // Jerseys sell online through the season, every week.
  if (wd === 3 && state.date >= K.regularSeasonStart && state.date <= K.superBowl) sellJerseys(state, 0.6 / 22, false);
  if (state.date === addDays(K.superBowl, 2)) closeSeason(state);
  if (m.rebrand && !m.rebrand.decided && state.date >= addDays(m.rebrand.asked, 30)) decideRebrand(state);
  if (m.rebrand?.approved && m.rebrand.launches != null && m.rebrand.launches <= RULES.season) launchRebrand(state);
}

