import { ownerShare } from "../src/engine/investors";
import { readFileSync } from "node:fs";
import { termsFor } from "../src/engine/cbaterms";
import { rulesFor } from "../src/engine/rules";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { capSummary } from "../src/engine/cap";
import { RULES, TEAM_BY_ID } from "../src/engine/league";
import { advanceDay } from "../src/engine/season";
import { compress, decompress, parseSaveFile } from "../src/save/codec";

// Saves written by earlier versions of the game (made with the code of the
// pull request in the name, and gzipped). Every version has been published,
// so players have saves like these.
function load(name: string) {
  return parseSaveFile(gunzipSync(readFileSync(new URL(`./saves/${name}.json.gz`, import.meta.url))).toString());
}

describe("saves from older versions", () => {
  it("a mid-season save from the first offseason version keeps playing", async () => {
    const state = load("pr5-2026-11-15");
    expect(state.date).toBe("2026-11-15");
    for (let i = 0; i < 10; i++) advanceDay(state);
    expect(state.date).toBe("2026-11-25");
    expect(Number.isFinite(capSummary(state, state.userTeam).space)).toBe(true);
    const back = await decompress(await compress(state));
    expect(back.date).toBe(state.date);
  }, 60_000);

  it("a mid-season save with club books, a term loan and an owner profile keeps playing to the next paydays", async () => {
    const state = load("pr30-2026-11-15");
    expect(state.debt?.loans.length).toBeGreaterThan(0);
    const balance = state.debt!.loans[0].balance;
    for (let i = 0; i < 17; i++) advanceDay(state);
    expect(state.date).toBe("2026-12-02");
    expect(state.business?.ledger.some((e) => e.cat === "interest" && e.date === "2026-12-01")).toBe(true);
    expect(state.debt!.loans[0].balance).toBeLessThanOrEqual(balance);
    const back = await decompress(await compress(state));
    expect(back.owner?.purchase).toBe(state.owner?.purchase);
    // Saves from before the front office get a staffed executive team and the old ways of deciding.
    expect(state.execs?.chart.CFO).toBeDefined();
    expect(state.office?.modes.trades).toBe("owner");
  }, 60_000);

  it("a save with an executive search, delegated bookings and a task keeps them", async () => {
    const state = load("pr31-2026-11-15");
    expect(state.execs?.searches[0]?.role).toBe("FOPS");
    expect(state.office?.modes.events).toBe("delegate");
    for (let i = 0; i < 50; i++) advanceDay(state);
    expect(state.office?.tasks[0].status).toBe("done");
    const back = await decompress(await compress(state));
    expect(back.office?.trail.length).toBe(state.office?.trail.length);
    // Saves from before the culture model start with ordinary readings.
    expect(state.culture?.history.length).toBeGreaterThan(0);
  }, 90_000);

  it("a save with culture, foggy scouting and ironman keeps them", async () => {
    const state = load("pr32-2026-11-15");
    expect(state.culture?.development).toBe(3);
    expect(state.settings.ironman).toBe(true);
    for (let i = 0; i < 20; i++) advanceDay(state);
    expect(state.culture?.history.at(-1)?.month).toBe("2026-12");
    const back = await decompress(await compress(state));
    expect(back.settings.scouting).toBe("foggy");
  }, 90_000);

  it("a save with play-by-play, game-day checks and a question to the league keeps them", async () => {
    const state = load("pr33-2026-11-15");
    expect(Object.keys(state.pbp ?? {}).length).toBeGreaterThan(0);
    expect(state.gameOps?.inquiries.length).toBe(1);
    for (let i = 0; i < 12; i++) advanceDay(state);
    expect(state.gameOps?.inquiries[0].answer).toBeDefined();
    // Week-old play-by-play is gone; the newest games have theirs.
    for (const log of Object.values(state.pbp!)) expect(log.date >= "2026-11-17").toBe(true);
    const back = await decompress(await compress(state));
    expect(Object.keys(back.pbp ?? {}).length).toBe(Object.keys(state.pbp!).length);
  }, 90_000);

  it("a save with an analytics staff and game plans keeps them, and older saves get a small staff", async () => {
    const state = load("pr34-2026-11-15");
    expect(state.analytics?.level).toBe(3);
    expect(state.analytics?.priority).toBe("players");
    const plans = Object.keys(state.analytics!.plans).length;
    expect(plans).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) advanceDay(state);
    expect(Object.keys(state.analytics!.plans).length).toBeGreaterThan(plans);
    const old = load("pr33-2026-11-15");
    expect(old.analytics?.level).toBe(1);
    const back = await decompress(await compress(state));
    expect(back.analytics?.credibility).toBe(state.analytics!.credibility);
  }, 90_000);

  it("a save with clubhouse programs, plans and a position change keeps them, and older saves get defaults", async () => {
    const state = load("pr35-2026-11-15");
    const c = state.clubhouse!;
    expect(c.programs.workload).toBe("heavy");
    expect(Object.keys(c.plans).length).toBe(3);
    const moved = Object.keys(state.players).find((id) => state.players[id].retrain)!;
    expect(state.players[moved].pos).toBe("S");
    const drag = state.players[moved].retrain!.drag;
    for (let i = 0; i < 9; i++) advanceDay(state);
    expect(state.players[moved].retrain!.drag).toBeLessThan(drag);
    const old = load("pr34-2026-11-15");
    expect(old.clubhouse?.programs.workload).toBe("normal");
    expect(Object.keys(old.clubhouse!.chem).length).toBe(32);
    const back = await decompress(await compress(state));
    expect(back.clubhouse?.plans).toEqual(state.clubhouse!.plans);
  }, 90_000);

  it("a save with a scouting staff, a practice plan and a per-game bonus keeps them, and older saves get a staff", async () => {
    const state = load("pr36-2026-11-15");
    expect(state.scouts?.emphasis).toBe("testing");
    expect(state.scouts?.staff[0].id).toBe("scout-6");
    expect(state.clubhouse?.programs.emphasis).toBe("plan");
    expect(state.contracts["00-0033106"]?.years.some((y) => y.perGame === 20_000)).toBe(true);
    for (let i = 0; i < 5; i++) advanceDay(state);
    expect(Object.keys(state.gameWeek?.reports ?? {}).length).toBeGreaterThan(0);
    const old = load("pr35-2026-11-15");
    expect(old.scouts?.staff.length).toBe(5);
    const back = await decompress(await compress(state));
    expect(back.scouts?.staff).toEqual(state.scouts!.staff);
  }, 90_000);

  it("an end-of-season save with honors and records keeps them and moves into the offseason", async () => {
    const state = load("pr37-2027-02-15");
    const season = 2026;
    expect(state.honors?.awards[season].length).toBe(7);
    expect(Object.keys(state.records?.h2h ?? {}).length).toBeGreaterThan(100);
    for (let i = 0; i < 3; i++) advanceDay(state);
    expect(state.records?.values[season]).toBeDefined();
    const back = await decompress(await compress(state));
    expect(back.honors?.allPro[season]).toEqual(state.honors!.allPro[season]);
    const old = load("pr36-2026-11-15");
    expect(old.honors).toBeUndefined();
  }, 90_000);

  it("a save with ticket office settings and seat licenses keeps them through renewals", async () => {
    const state = load("pr38-2027-02-15");
    const t = state.business!.tix!;
    expect(t.zones.lowerSide).toBe(1.2);
    expect(t.dynamic).toBe(true);
    expect(t.psl?.price).toBe(3000);
    expect(state.fans?.trust).toBeLessThan(60);
    const back = await decompress(await compress(state));
    expect(back.business!.tix!.tiers.marquee).toBe(1.15);
    // An older save gets the fan base, the ticket office and the new sponsor categories when it first needs them.
    const old = load("pr37-2027-02-15");
    expect(old.fans).toBeUndefined();
    expect(old.business!.tix).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.fans).toBeDefined();
    expect(old.business!.local!.deals.some((d) => d.cat === "digital")).toBe(true);
  }, 90_000);

  it("a renamed club stays renamed, with its store, media and game-day settings", async () => {
    const state = load("pr39-2027-02-18");
    expect(TEAM_BY_ID.DET.name).toBe("Pioneers");
    expect(state.merch!.online).toBe("partner");
    expect(state.venue!.plan.show).toBe("premium");
    expect(state.teamMedia!.spokesperson).toBe("president");
    const back = await decompress(await compress(state));
    expect(back.merch!.brand.name).toBe("Pioneers");
    // An older save keeps the league's names and starts the new departments when it needs them.
    const old = load("pr38-2027-02-15");
    expect(TEAM_BY_ID.DET.name).toBe("Lions");
    expect(old.merch).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.merch).toBeDefined();
    expect(old.teamMedia).toBeDefined();
  }, 90_000);

  it("a save with building, community and department settings keeps them", async () => {
    const state = load("pr40-2027-03-02");
    expect(state.facilities!.plan).toBe("defer");
    expect(state.community!.programs.clinics).toBe(true);
    expect(state.departments!.travel.policy.arrive).toBe("early");
    const back = await decompress(await compress(state));
    expect(back.community!.services.family).toBe(true);
    // An older save starts the new departments on the first of a month.
    const old = load("pr39-2027-02-18");
    expect(old.facilities).toBeUndefined();
    for (let i = 0; i < 12; i++) advanceDay(old);
    expect(old.facilities).toBeDefined();
    expect(old.departments).toBeDefined();
  }, 90_000);

  it("a save with the coach's room, scouting budget and analysts keeps them, and older saves start them", async () => {
    const state = load("pr41-2027-03-15");
    expect(state.coachRoom!.preseason).toBe("rest");
    expect(state.coachRoom!.st!.punts).toBe("directional");
    expect(state.scoutOps!.split.video).toBeCloseTo(0.4, 5);
    expect(state.analysts!.feeds.tracking).toBe(true);
    for (let i = 0; i < 3; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.care!.doctors.length).toBe(4);
    // A save from before has none of it; the first days create what's needed.
    const old = load("pr40-2027-03-02");
    expect(old.care).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.care).toBeDefined();
  }, 90_000);

  it("a save with the treasury, staff memory and standing keeps them, and older saves start them", async () => {
    const state = load("pr42-2027-03-15");
    expect(state.treasury!.controls).toBe(2);
    expect(state.treasury!.cuts.marketing).toBeCloseTo(0.1, 5);
    expect(state.people!.qc).toHaveLength(1);
    expect(state.people!.agenda).toEqual(["Debt", "Football"]);
    expect(state.standing!.stance).toBe("handsOff");
    expect(state.office!.reports).toHaveLength(1);
    for (let i = 0; i < 3; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.people!.calendar.length).toBeGreaterThan(0);
    const old = load("pr41-2027-03-15");
    expect(old.treasury).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.treasury).toBeDefined();
    expect(old.standing).toBeDefined();
  }, 90_000);

  it("a save with a coalition, a seat request, an amended proposal and a money dispute keeps them, and older saves start the league office", async () => {
    const state = load("pr43-2027-03-20");
    expect(state.leagueOffice!.coalitions).toHaveLength(1);
    expect(state.leagueOffice!.seatAsk).toBe("finance");
    expect(state.leagueMoney!.dispute?.amount).toBe(1_250_000);
    expect(state.owners!.meeting!.proposals.some((p) => p.amended)).toBe(true);
    for (let i = 0; i < 3; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.leagueOffice!.commissioner.name).toBe(state.leagueOffice!.commissioner.name);
    const old = load("pr42-2027-03-15");
    expect(old.leagueOffice).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.leagueOffice).toBeDefined();
    expect(old.leagueMoney).toBeDefined();
  }, 90_000);

  it("a save with a league inquiry, a crisis and a dispute keeps them, and older saves start compliance and legal", async () => {
    const state = load("pr44-2027-05-20");
    expect(state.compliance!.leagueCases.some((k) => k.team === "DET" && k.kind === "equipment")).toBe(true);
    expect(state.compliance!.funding).toBe("cash");
    expect(state.crisis!.crises[0].plan.response).toBe("safety");
    expect(state.legal!.matters[0].kind).toBe("trademark dispute");
    for (let i = 0; i < 3; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.legal!.matters.length).toBeGreaterThan(0);
    const old = load("pr43-2027-03-20");
    expect(old.legal).toBeUndefined();
    for (let i = 0; i < 3; i++) advanceDay(old);
    expect(old.compliance!.filings).toBeDefined();
    expect(old.legal).toBeDefined();
  }, 90_000);

  it("a save with the economy, insurance and a stadium disruption keeps them, and older saves start the economy", async () => {
    const state = load("pr45-2026-10-10");
    expect(state.economy!.now.gap).toBeCloseTo(-2.2, 5);
    expect(state.shocks!.flood).toBe(true);
    expect(state.shocks!.disruptions[0].kind).toBe("power");
    expect(state.settings.economy).toBe("volatile");
    for (let i = 0; i < 25; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.economy!.history.length).toBeGreaterThan(0);
    const old = load("pr44-2027-05-20");
    expect(old.economy).toBeUndefined();
    for (let i = 0; i < 15; i++) advanceDay(old);
    expect(old.economy).toBeDefined();
    expect(old.shocks).toBeDefined();
  }, 120_000);

  it("a save made after a new labor deal keeps its terms bound, and older saves start under the 2020 agreement", async () => {
    const state = load("pr46-2026-10-10");
    expect(state.labor!.agreements.length).toBe(2);
    expect(termsFor(2031).share).toBe(0.5);
    expect(termsFor(2030).share).toBe(0.485);
    expect(rulesFor(state, 2031).games).toBe(18);
    expect(state.labor!.grievances[0].id).toBe("gr-fixture");
    for (let i = 0; i < 10; i++) advanceDay(state);
    const back = await decompress(await compress(state));
    expect(back.labor!.stance).toBe("hard");
    const old = load("pr45-2026-10-10");
    expect(old.labor).toBeUndefined();
    expect(termsFor(2031).share).toBe(0.485);
    advanceDay(old);
    expect(old.labor!.agreements[0].through).toBe(2030);
  }, 120_000);

  it("a save made mid-construction keeps building, plays in its temporary home, and older saves start with the league's real projects", async () => {
    const state = load("pr47-2026-10-10");
    const p = state.construction!.plan!;
    expect(p.stage).toBe("build");
    expect(p.roof).toBe("retractable");
    expect(state.construction!.temporary!.name).toBe("Michigan Stadium");
    expect(state.politics!.question!.partner).toBe("Fixture Partner");
    for (let i = 0; i < 25; i++) advanceDay(state);
    expect(p.paid).toBeGreaterThan(0);
    expect(state.politics!.question!.answered).toBe("quiet");
    const back = await decompress(await compress(state));
    expect(back.construction!.plan!.price).toBe(p.price);
    const old = load("pr46-2026-10-10");
    expect(old.construction).toBeUndefined();
    advanceDay(old);
    expect(old.construction!.cpu.map((b) => b.team)).toEqual(["TEN", "CLE", "WAS", "KC"]);
  }, 120_000);

  it("a save made after a move plays in the new market, and older saves stay home", async () => {
    const state = load("pr48-2026-10-10");
    expect(TEAM_BY_ID.DET.city).toBe("St. Louis");
    expect(state.relocation!.moves[0].fromCity).toBe("Detroit");
    expect(state.global!.rights[0].market).toBe("UK");
    for (let i = 0; i < 25; i++) advanceDay(state);
    expect(state.global!.rights[0].history.length).toBeGreaterThan(0);
    const back = await decompress(await compress(state));
    expect(back.relocation!.feeYears).toBe(9);
    expect(TEAM_BY_ID.DET.city).toBe("St. Louis");
    const old = load("pr47-2026-10-10");
    expect(old.relocation).toBeUndefined();
    expect(TEAM_BY_ID.DET.city).toBe("Detroit");
  }, 120_000);

  it("a save made after a stake sale keeps its partners, and older saves own the whole club", async () => {
    const state = load("pr50-2026-10-10");
    expect(state.investors!.partners.length).toBe(2);
    expect(ownerShare(state)).toBeCloseTo(0.72, 6);
    for (let i = 0; i < 25; i++) advanceDay(state);
    expect(state.investors!.reports.length).toBeGreaterThan(0);
    const back = await decompress(await compress(state));
    expect(ownerShare(back)).toBeCloseTo(0.72, 6);
    const old = load("pr48-2026-10-10");
    expect(old.investors).toBeUndefined();
    expect(ownerShare(old)).toBe(1);
  }, 120_000);

  it("a save after an inheritance keeps the new owner, the family partners and a sale under way; older saves age the owner from load", async () => {
    const state = load("pr53-2026-10-10");
    expect(state.succession!.generation).toBe(2);
    expect(state.investors!.partners.some((p) => p.kind === "family")).toBe(true);
    expect(state.tenure!.clubs.map((c) => c.how)).toContain("Handed on");
    for (let i = 0; i < 80; i++) advanceDay(state);
    expect(state.succession!.sale!.stage).not.toBe("marketing");
    const back = await decompress(await compress(state));
    expect(back.ownerName).toBe(state.ownerName);
    const old = load("pr52-2026-10-10");
    expect(old.succession).toBeUndefined();
    advanceDay(old);
    expect(old.succession!.heirs.length).toBeGreaterThan(1);
  }, 120_000);

  it("a save after a takeover and a CPU change of control keeps the new club, its partners and an open pursuit", async () => {
    const state = load("pr52-2026-10-10");
    expect(state.userTeam).toBe("JAX");
    expect(state.franchise!.control.MIA).toBe("the Harcastle partnership");
    expect(state.franchise!.deal!.stage).toBe("diligence");
    expect(state.tenure!.clubs.map((c) => c.team)).toEqual(["DET", "JAX"]);
    for (let i = 0; i < 40; i++) advanceDay(state);
    expect(state.franchise!.deal!.stage).not.toBe("diligence");
    const back = await decompress(await compress(state));
    expect(back.investors!.partners.length).toBeGreaterThan(0);
    const old = load("pr51-2026-10-10");
    expect(old.tenure).toBeUndefined();
    for (let i = 0; i < 5; i++) advanceDay(old);
    expect(old.franchise!.listings).toBeDefined();
  }, 120_000);

  it("a save with the owner's wealth keeps its trust, foundation and pending sale; older saves split their holdings on load", async () => {
    const state = load("pr51-2026-10-10");
    expect(state.wealth!.trust).toBe(400_000_000);
    expect(state.wealth!.pending.length).toBe(1);
    for (let i = 0; i < 25; i++) advanceDay(state);
    expect(state.wealth!.history.length).toBeGreaterThan(0);
    const back = await decompress(await compress(state));
    expect(back.wealth!.familyOffice).toBe(true);
    const old = load("pr50-2026-10-10");
    expect(old.wealth).toBeUndefined();
    for (let i = 0; i < 25; i++) advanceDay(old);
    expect(Math.round(Object.values(old.wealth!.holdings).reduce((t, v) => t + v, 0))).toBe(old.owner!.outside);
  }, 120_000);

  it("an older save starts keeping play-by-play with its next games", () => {
    const state = load("pr32-2026-11-15");
    expect(state.pbp).toBeUndefined();
    for (let i = 0; i < 8; i++) advanceDay(state);
    expect(Object.keys(state.pbp ?? {}).length).toBeGreaterThan(0);
  }, 90_000);

  it("a save from when the game ended with the draft moves on to the next season", () => {
    const state = load("pr12-2027-05-02");
    expect(state.season).toBe(2027);
    expect(RULES.season).toBe(2027);
    for (let i = 0; i < 5; i++) advanceDay(state);
    expect(state.date).toBe("2027-05-07");
  }, 60_000);
});
