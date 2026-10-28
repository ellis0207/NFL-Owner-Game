import { useState } from "react";
import { capHit, capSummary, teamPlayerIds } from "../../engine/cap";
import { dealOf, dealYearsLeft, leagueYear, projectedCap } from "../../engine/contracts";
import { ageOn, shortDate } from "../../engine/dates";
import { cashNextYear, cashPaid } from "../../engine/finance";
import { cashBalance } from "../../engine/business";
import { regrade } from "../../engine/grades";
import { PLAYER_BY_ID, PLAYERS, RULES, TEAM_BY_ID, TEAMS } from "../../engine/league";
import { franchiseTag, rfaTender, TAG_GROUP, transitionTag, type TagGroup } from "../../engine/market";
import { extensionEligibility, startYearFor } from "../../engine/negotiation";
import { applyTag, applyTender, canTag, canTender, decideOption, faClass, isOffseason, NEXT, off, optionInfo, pendingFreeAgents, tagCost, TENDER_LABEL, tenderCost, type FaClass, type TenderChoice } from "../../engine/offseason";
import { canVisit, committed, compLabel, resolveSheet, scheduleVisit } from "../../engine/freeagency";
import { termsLine } from "../NegotiationPanel";
import { teamValue } from "../../engine/market";
import type { GameState, Position } from "../../engine/types";
import { money, recentSeasonLine } from "../format";
import { useUi } from "../ui";

type Tab = "talks" | "expiring" | "fa" | "extensions" | "league" | "ours" | "market";
const TABS: [Tab, string][] = [["talks", "Our talks"], ["expiring", "Our free agents"], ["fa", "Free agency"], ["extensions", "Extension candidates"], ["league", "League deals"], ["ours", "Our deals"], ["market", "Market"]];

const GROUP_POS: Record<TagGroup, Position> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", OL: "OT", DE: "EDGE", DT: "IDL", LB: "LB", CB: "CB", S: "S", ST: "K" };
const GROUP_NAME: Record<TagGroup, string> = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", OL: "Offensive line", DE: "Defensive end", DT: "Defensive tackle", LB: "Linebacker", CB: "Cornerback", S: "Safety", ST: "Kicker / punter" };

export function ContractsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const offseason = isOffseason(game.date);
  const [tab, setTab] = useState<Tab>(offseason ? "expiring" : "talks");
  const ui = useUi();
  const us = game.userTeam;
  const year = leagueYear(game.date);
  // Our own free agents' decisions only exist after the Super Bowl; the board of upcoming free agents is up all year.
  const tabs = TABS.filter(([k]) => offseason || k !== "expiring").map(([k, label]): [Tab, string] => [k, k === "fa" && !offseason ? "Upcoming free agents" : label]);
  const talks = Object.values(game.negotiations).filter((n) => n.team === us)
    .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.opened.localeCompare(a.opened));

  return (
    <section className="stack">
      <h2>Contracts</h2>
      <div className="tabs" role="group" aria-label="View">
        {tabs.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "talks" && (
        talks.length === 0
          ? <p className="muted">No contract talks yet. Open talks from a player's page or from Extension candidates.</p>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Player</th><th>Pos</th><th>Opened</th><th>Status</th><th>At the table</th><th>Latest</th></tr></thead>
                <tbody>
                  {talks.map((n) => {
                    const last = n.rounds[n.rounds.length - 1];
                    const status = n.status === "agreed" ? "Signed" : n.status === "ended" ? "Ended" : n.pending ? `Waiting on agent${n.replyOn ? ` (by ${shortDate(n.replyOn)})` : ""}` : last.from === "agent" ? "Our move" : "Open";
                    return (
                      <tr key={n.player} className="clickable" onClick={() => ui.openTalks(n.player)}>
                        <td className="name">{PLAYER_BY_ID[n.player].name}</td>
                        <td>{PLAYER_BY_ID[n.player].position}</td>
                        <td>{shortDate(n.opened)}</td>
                        <td>{status}</td>
                        <td>{n.handler === "gm" ? "GM" : "You"}</td>
                        <td className="num">{money(last.terms.total / last.terms.years)}/yr · {last.terms.years} yrs</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {tab === "extensions" && <Extensions game={game} />}
      {tab === "expiring" && offseason && <OurFreeAgents game={game} changed={changed} />}
      {tab === "fa" && <FreeAgencyBoard game={game} changed={changed} />}

      {tab === "league" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Player</th><th>Team</th><th className="num">Years</th><th className="num">Total</th><th className="num">Per year</th><th className="num">Guaranteed</th><th>Grades</th></tr></thead>
            <tbody>
              {game.signings.slice(0, 200).map((s) => (
                <tr key={s.id} className="clickable" onClick={() => ui.openPlayer(s.player)}>
                  <td>{shortDate(s.date)}</td>
                  <td className="name">{PLAYER_BY_ID[s.player].name} <span className="muted">{PLAYER_BY_ID[s.player].position}</span></td>
                  <td>{s.team}</td>
                  <td className="num">{s.years}</td><td className="num">{money(s.total)}</td><td className="num">{money(s.apy)}</td><td className="num">{money(s.guaranteed)}</td>
                  <td title={s.grades.map((g) => `${g.outlet}: ${g.grade}. ${g.take}`).join("\n")}>{s.grades.map((g) => g.grade).join(" · ")}</td>
                </tr>
              ))}
              {game.signings.length === 0 && <tr><td colSpan={8} className="muted">No new contracts signed yet this season.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "ours" && <OurDeals game={game} />}

      {tab === "market" && (
        <div className="split">
          <div className="stack tight">
            <h3>{year + 1} tags and tenders{game.league?.caps[year + 1] ? "" : " (projected)"}</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Position</th><th className="num">Franchise</th><th className="num">Transition</th></tr></thead>
                <tbody>
                  {(Object.keys(GROUP_POS) as TagGroup[]).map((g) => (
                    <tr key={g}><td>{GROUP_NAME[g]}</td><td className="num">{money(franchiseTag(game, GROUP_POS[g], year + 1))}</td><td className="num">{money(transitionTag(game, GROUP_POS[g], year + 1))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="muted">
              RFA tenders: first round {money(rfaTender(game, "first", year + 1))}, second round {money(rfaTender(game, "second", year + 1))}, right of first refusal {money(rfaTender(game, "original", year + 1))}.
              {" "}{game.league?.caps[year + 1]
                ? `The ${year + 1} cap is set at ${money(game.league.caps[year + 1])}.`
                : `The league projects a ${year + 1} cap of about ${money(projectedCap(year + 1))}; the real number is set in late February.`}
            </span>
          </div>
          <div className="stack">
            <TopContracts game={game} />
            {game.offseason?.draftOrder && (
              <div className="stack tight">
                <h3>{NEXT} draft order</h3>
                <p className="muted">{game.offseason.draftOrder.map((t, i) => `${i + 1}. ${t}`).join(" · ")}</p>
                <span className="muted">First round, before any trades. The draft itself is coming in a later update.</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="panel stack tight">
        <h3>Cash</h3>
        <dl className="kv">
          <dt>Paid to players in {year}</dt><dd>{money(cashPaid(game, us, year))}</dd>
          <dt>Owed in {year + 1} under current deals</dt><dd>{money(cashNextYear(game, us))}</dd>
          <dt>Cash in the bank</dt><dd>{money(cashBalance(game))}</dd>
        </dl>
        <span className="muted">Cash is not the cap: signing bonuses are paid when the deal is signed even though the cap spreads them over up to five years. The full books are on the Business page.</span>
      </div>
    </section>
  );
}

function Extensions({ game }: { game: GameState }) {
  const ui = useUi();
  const us = game.userTeam;
  const year = leagueYear(game.date);
  const rows = teamPlayerIds(game, us)
    .filter((id) => game.players[id].status !== "ps")
    .map((id) => ({ id, deal: dealOf(game, id), elig: extensionEligibility(game, id) }))
    .filter((r) => r.deal && dealYearsLeft(r.deal, year) <= 2)
    .map((r) => ({ ...r, value: teamValue(game, us, r.id, startYearFor(game, r.id, "extension")) }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="stack tight">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">Years left</th><th className="num">Current per year</th><th className="num">GM's value</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ id, deal, elig, value }) => {
              const n = game.negotiations[id];
              const status = n?.team === us ? (n.status === "open" ? "In talks" : n.status === "agreed" ? "Signed" : "Talks ended") : elig.ok ? "Eligible" : elig.reason;
              return (
                <tr key={id} className="clickable" onClick={() => ui.openTalks(id)}>
                  <td className="name">{PLAYER_BY_ID[id].name}{game.players[id].holdout ? <span className="pill inj" style={{ marginLeft: 6 }}>{game.players[id].holdout!.kind === "holdout" ? "Holdout" : "Hold-in"}</span> : null}</td>
                  <td>{PLAYER_BY_ID[id].position}</td>
                  <td className="num">{ageOn(PLAYER_BY_ID[id].birthDate, game.date) ?? ""}</td>
                  <td className="num">{dealYearsLeft(deal, year)}</td>
                  <td className="num">{money(deal!.apy)}</td>
                  <td className="num">{money(Math.round(value / 500_000) * 500_000)}</td>
                  <td className={elig.ok ? undefined : "muted"}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="muted">Players with two or fewer years left. GM's value is what your GM thinks a new deal is worth to us, only as good as the GM's eye.</span>
    </div>
  );
}

function OurDeals({ game }: { game: GameState }) {
  const ui = useUi();
  const mine = game.signings.filter((s) => s.team === game.userTeam);
  const year = leagueYear(game.date);
  const dead = Object.entries(game.deadMoney[game.userTeam] ?? {}).sort();
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Signed</th><th>Player</th><th className="num">Years</th><th className="num">Per year</th><th>Grades at signing</th><th>Public view now</th></tr></thead>
          <tbody>
            {mine.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => ui.openPlayer(s.player)}>
                <td>{shortDate(s.date)}</td>
                <td className="name">{PLAYER_BY_ID[s.player].name}</td>
                <td className="num">{s.years}</td><td className="num">{money(s.apy)}</td>
                <td title={s.grades.map((g) => `${g.outlet}: ${g.take}`).join("\n")}>{s.grades.map((g) => g.grade).join(" · ")}</td>
                <td>{regrade(game, s)}</td>
              </tr>
            ))}
            {mine.length === 0 && <tr><td colSpan={6} className="muted">You haven't signed anyone to a new contract yet. Your record as owner builds here: every deal, how it was graded, and how it looks now.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="stack tight">
        <h3>Dead money</h3>
        <p className="muted">
          {TEAM_BY_ID[game.userTeam].cap2026.deadMoney ? `${money(TEAM_BY_ID[game.userTeam].cap2026.deadMoney)} from moves made before you took over. ` : ""}
          {dead.length ? dead.map(([y, v]) => `${money(v)} in ${y} from your releases`).join("; ") + "." : "None from your own moves yet."}
          {dead.some(([y]) => Number(y) > year) ? " Money pushed into next year is a hangover the next cap has to carry." : ""}
        </p>
      </div>
    </div>
  );
}

function TopContracts({ game }: { game: GameState }) {
  const [pos, setPos] = useState<Position>("QB");
  const list = PLAYERS.filter((p) => p.position === pos)
    .map((p) => ({ p, d: dealOf(game, p.id) }))
    .filter((x) => x.d && x.d.kind !== "rookie" && game.players[x.p.id]?.team)
    .sort((a, b) => b.d!.apy - a.d!.apy).slice(0, 12);
  return (
    <div className="stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3>Top of the market</h3>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position)}>
          {(Object.keys(TAG_GROUP) as Position[]).map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Team</th><th className="num">Per year</th><th className="num">Guaranteed</th><th>Signed</th></tr></thead>
          <tbody>
            {list.map(({ p, d }) => (
              <tr key={p.id}><td className="name">{p.name}</td><td>{game.players[p.id].team}</td><td className="num">{money(d!.apy)}</td><td className="num">{money(d!.guaranteedAtSigning)}</td><td>{d!.signed.slice(0, 4)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CLASS_LABEL: Record<FaClass, string> = { UFA: "Unrestricted", RFA: "Restricted", ERFA: "Exclusive rights" };

function OurFreeAgents({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const o = game.offseason;
  const [level, setLevel] = useState<Record<string, TenderChoice>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const before = game.date < RULES.keyDates.newLeagueYear;
  const rows = pendingFreeAgents(game, us)
    .map((id) => ({ id, cls: faClass(id), value: teamValue(game, us, id, NEXT) }))
    .sort((a, b) => b.value - a.value);
  const gone = Object.values(game.fa ?? {}).filter((f) => f.from === us && f.status !== "signed" || (f.from === us && game.players[f.player]?.team !== us && f.status === "signed"));
  const options = teamPlayerIds(game, us).map((id) => ({ id, info: optionInfo(game, id) })).filter((x) => x.info.eligible);
  const sheets = (o?.sheets ?? []).filter((x) => x.from === us);
  const tag = o?.tags[us];
  return (
    <div className="stack">
      {sheets.map((sh) => (
        <div key={sh.player} className="notice error stack tight">
          <strong>Offer sheet: {PLAYER_BY_ID[sh.player].name}</strong>
          <span>The {TEAM_BY_ID[sh.to].name} offered {termsLine(sh.terms)}. Decide by {shortDate(sh.decideBy)}. {sh.compensation ? `If we don't match, we get their ${compLabel(sh.compensation)} pick.` : "If we don't match, we get nothing back."}</span>
          <div className="btn-row">
            <button className="btn primary" onClick={() => { resolveSheet(game, sh.player, true); changed(); }}>Match</button>
            <button className="btn" onClick={() => { resolveSheet(game, sh.player, false); changed(); }}>Let the player go</button>
          </div>
        </div>
      ))}
      {before ? (
        <>
          <p className="muted">
            Contracts that end with the {RULES.season} league year. Re-sign them before {shortDate(RULES.keyDates.negotiatingWindowOpens)}, when other teams can call.
            {" "}{tag ? `We've used our tag on ${PLAYER_BY_ID[tag.player].name}.` : `One franchise or transition tag, ${shortDate(RULES.keyDates.franchiseTagWindowOpens)} to ${shortDate(RULES.keyDates.franchiseTagDeadline)}.`}
            {" "}Restricted and exclusive-rights players need a tender by {shortDate(RULES.keyDates.newLeagueYear)} or they become unrestricted.
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th>Free agent</th><th className="num">{RULES.season} cap hit</th><th className="num">GM's value</th><th>Status</th><th>Tag or tender</th></tr></thead>
              <tbody>
                {rows.map(({ id, cls, value }) => {
                  const n = game.negotiations[id];
                  const talking = n?.team === us && n.status === "open";
                  const canT = canTag(game, us, id);
                  const canTd = canTender(game, us, id);
                  const lv = level[id] ?? (cls === "ERFA" ? "erfa" : "original");
                  return (
                    <tr key={id} className="clickable" onClick={() => ui.openTalks(id)}>
                      <td className="name">{PLAYER_BY_ID[id].name}</td>
                      <td>{PLAYER_BY_ID[id].position}</td>
                      <td className="num">{ageOn(PLAYER_BY_ID[id].birthDate, game.date) ?? ""}</td>
                      <td>{CLASS_LABEL[cls]}</td>
                      <td className="num">{money(capHit(id, RULES.season, game))}</td>
                      <td className="num">{money(Math.round(value / 500_000) * 500_000)}</td>
                      <td>{talking ? "In talks" : n?.team === us && n.status === "ended" ? "Talks ended" : "Not started"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {cls !== "ERFA" && canT.ok && value < tagCost(game, id, "transition") * 0.4 && !reveal[id] && (
                          <button className="link muted" onClick={() => setReveal({ ...reveal, [id]: true })}>GM: not worth a tag</button>
                        )}
                        {cls !== "ERFA" && canT.ok && (value >= tagCost(game, id, "transition") * 0.4 || reveal[id]) && (
                          <div className="btn-row">
                            <button className="btn small" onClick={() => { applyTag(game, us, id, "franchise"); changed(); }}>Franchise {money(tagCost(game, id, "franchise"))}</button>
                            <button className="btn small" onClick={() => { applyTag(game, us, id, "transition"); changed(); }}>Transition {money(tagCost(game, id, "transition"))}</button>
                          </div>
                        )}
                        {cls !== "UFA" && canTd.ok && (
                          <div className="btn-row">
                            {cls === "RFA" && (
                              <select value={lv} onChange={(e) => setLevel({ ...level, [id]: e.target.value as TenderChoice })}>
                                {(["original", "second", "first"] as TenderChoice[]).map((l) => <option key={l} value={l}>{TENDER_LABEL[l]} {money(tenderCost(game, id, l))}</option>)}
                              </select>
                            )}
                            <button className="btn small" onClick={() => { applyTender(game, us, id, lv); changed(); }}>Tender{cls === "ERFA" ? ` ${money(tenderCost(game, id, "erfa"))}` : ""}</button>
                          </div>
                        )}
                        {cls === "UFA" && !canT.ok && !off(game).tags[us] && <span className="muted">{canT.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={8} className="muted">Nobody left with an expiring deal.</td></tr>}
              </tbody>
            </table>
          </div>
          <span className="muted">Tap a player to open talks. GM's value is what a new deal from {NEXT} is worth to us in the GM's eyes.</span>
        </>
      ) : (
        <div className="stack tight">
          <p className="muted">The {NEXT} league year has begun: our unsigned free agents are on the open market. We can still bid on them like any other team, and they still give us some credit for the years here.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Pos</th><th>Status</th></tr></thead>
              <tbody>
                {gone.map((f) => (
                  <tr key={f.player} className="clickable" onClick={() => ui.openTalks(f.player)}>
                    <td className="name">{PLAYER_BY_ID[f.player].name}</td><td>{PLAYER_BY_ID[f.player].position}</td>
                    <td>{faStatus(game, f.player)}</td>
                  </tr>
                ))}
                {gone.length === 0 && <tr><td colSpan={3} className="muted">None.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {options.length > 0 && (
        <div className="stack tight">
          <h3>Fifth-year options</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Pos</th><th className="num">{NEXT + 1} option</th><th>Tier</th><th className="num">GM's value</th><th>Decision</th></tr></thead>
              <tbody>
                {options.map(({ id, info }) => {
                  const done = game.offseason?.options[id];
                  return (
                    <tr key={id}>
                      <td className="name">{PLAYER_BY_ID[id].name}</td><td>{PLAYER_BY_ID[id].position}</td>
                      <td className="num">{money(info.amount)}</td><td>{info.tier === "playingTime" ? "Playing time" : "Basic"}</td>
                      <td className="num">{money(Math.round(teamValue(game, us, id, info.year) / 500_000) * 500_000)}</td>
                      <td>{done ? (done === "exercised" ? "Exercised" : "Declined") : (
                        <div className="btn-row">
                          <button className="btn small" onClick={() => { decideOption(game, us, id, true); changed(); }}>Exercise</button>
                          <button className="btn small" onClick={() => { decideOption(game, us, id, false); changed(); }}>Decline</button>
                        </div>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="muted">First-round picks from {NEXT - 3}. The option is fully guaranteed once exercised; the deadline is in early May. The Pro Bowl tiers aren't modeled yet.</span>
        </div>
      )}
    </div>
  );
}

function faStatus(game: GameState, id: string): string {
  const f = game.fa?.[id];
  if (!f) return "";
  if (f.status === "agreed") return `Agreed with ${f.agreed!.team}`;
  if (f.status === "signed") return game.players[id]?.team ? `Signed with ${game.players[id].team}` : "Signed";
  return "Available";
}

function FreeAgencyBoard({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [note, setNote] = useState<string | null>(null);
  const us = game.userTeam;
  const [pos, setPos] = useState<Position | "all">("all");
  const [show, setShow] = useState<"available" | "all">("available");
  const [whose, setWhose] = useState<"league" | "ours" | "others">("league");
  const [kind, setKind] = useState<FaClass | "all">("UFA");
  const offseason = isOffseason(game.date);
  const open = offseason && game.date >= RULES.keyDates.negotiatingWindowOpens;
  // Before the window, the public list of players headed for free agency: next spring's class during the season.
  const ids = open
    ? Object.values(game.fa ?? {}).filter((f) => show === "all" || f.status === "open").map((f) => f.player)
    : TEAMS.flatMap((t) => pendingFreeAgents(game, t.id)).filter((id) => kind === "all" || faClass(id) === kind);
  const from = (id: string) => game.fa?.[id]?.from ?? game.players[id]?.team ?? game.players[id]?.lastTeam ?? "";
  // The GM's board: every name ranked by what our GM thinks the player is worth to us.
  const ranked = ids
    .map((id) => ({ id, value: teamValue(game, us, id, NEXT) }))
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const rows = ranked
    .filter((r) => pos === "all" || PLAYER_BY_ID[r.id].position === pos)
    .filter((r) => whose === "league" || (whose === "ours") === (from(r.id) === us))
    .slice(0, 150);
  const space = capSummary(game, us, NEXT).space - committed(game, us);
  const deadline = game.date < RULES.keyDates.franchiseTagDeadline ? ` Tags are due ${shortDate(RULES.keyDates.franchiseTagDeadline)}.` : "";
  return (
    <div className="stack tight">
      <p className="muted">
        {open
          ? `Free agency is open${game.date < RULES.keyDates.newLeagueYear ? ` (negotiating window: agreements are signed on ${shortDate(RULES.keyDates.newLeagueYear)})` : ""}. We have ${money(space)} of ${NEXT} cap space after deals we've agreed to.`
          : offseason
            ? `Players with expiring deals around the league. Their teams have them to themselves until ${shortDate(RULES.keyDates.negotiatingWindowOpens)}; some will re-sign or be tagged before then.${deadline}`
            : `Next spring's free agent class: players whose deals run out after the ${RULES.season} season. Their teams can extend them any time before then, and talking to another team's player is tampering.`}
      </p>
      <div className="btn-row">
        <select value={whose} onChange={(e) => setWhose(e.target.value as typeof whose)} aria-label="Whose players">
          <option value="league">Whole league</option><option value="ours">Ours</option><option value="others">Other teams'</option>
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | "all")} aria-label="Position">
          <option value="all">All positions</option>
          {(Object.keys(TAG_GROUP) as Position[]).map((x) => <option key={x}>{x}</option>)}
        </select>
        {!open && (
          <select value={kind} onChange={(e) => setKind(e.target.value as FaClass | "all")} aria-label="Kind of free agent">
            <option value="UFA">Unrestricted</option><option value="RFA">Restricted</option><option value="ERFA">Exclusive rights</option><option value="all">All kinds</option>
          </select>
        )}
        {open && (
          <select value={show} onChange={(e) => setShow(e.target.value as "available" | "all")} aria-label="Signed or not">
            <option value="available">Still available</option><option value="all">Everyone, signed too</option>
          </select>
        )}
      </div>
      {note && <div className="notice">{note}</div>}
      {open && game.date >= RULES.keyDates.newLeagueYear && <span className="muted">Bring a free agent in for a visit: the doctors get a look at him, the coaches meet him, and he tells us what matters to him. A good visit helps our offer, and he won't sign anywhere until it's done.</span>}
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">GM rank</th><th>Player</th><th>Pos</th><th className="num">Age</th><th>Team</th><th>{RULES.season} season</th><th className="num">GM's value</th><th>Status</th>{open && <th>Visit</th>}</tr></thead>
          <tbody>
            {rows.map(({ id, value, rank }) => {
              const ps = game.players[id];
              const talking = game.negotiations[id]?.team === us && game.negotiations[id].status === "open";
              const mine = from(id) === us;
              return (
                <tr key={id} className="clickable" onClick={() => (open || mine ? ui.openTalks(id) : ui.openPlayer(id))}>
                  <td className="num">{rank}</td>
                  <td className="name">{PLAYER_BY_ID[id].name}</td>
                  <td>{PLAYER_BY_ID[id].position}</td>
                  <td className="num">{ageOn(PLAYER_BY_ID[id].birthDate, game.date) ?? ""}</td>
                  <td>{from(id)}</td>
                  <td className="muted">{recentSeasonLine(game, id)}</td>
                  <td className="num">{money(Math.round(value / 250_000) * 250_000)}</td>
                  <td>{talking ? "In talks with us" : open ? faStatus(game, id) : ps?.team ? (faClass(id) === "UFA" ? "Under contract" : `Under contract (${faClass(id)})`) : "Free agent"}</td>
                  {open && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const v = game.fa?.[id]?.visits?.find((x) => x.team === us);
                        if (v) return <span className="muted">{v.done ? "Visited" : `Set for ${shortDate(v.date)}`}</span>;
                        const c = canVisit(game, us, id);
                        return c.ok ? <button className="btn small" onClick={() => { setNote(scheduleVisit(game, us, id).text); changed(); }}>Bring in</button> : null;
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">Nobody here.</td></tr>}
          </tbody>
        </table>
      </div>
      <span className="muted">Top 150 by your GM's value, which is only as good as your GM's eye. Offers other teams make aren't public: you hear about them from agents and the press.</span>
    </div>
  );
}

