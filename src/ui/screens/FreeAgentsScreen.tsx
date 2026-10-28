import { useState } from "react";
import { accruedSeasons, capSummary, teamPlayerIds } from "../../engine/cap";
import { claimedDeal, dealCapHit, leagueYear, practiceWeekly } from "../../engine/contracts";
import { ageOn, shortDate } from "../../engine/dates";
import { canSignAtMinimum, isMarketOpen, marketYear, priceEstimate, signAtMinimum } from "../../engine/freeagency";
import { PLAYER_BY_ID, RULES, TEAMS } from "../../engine/league";
import { marketView } from "../../engine/market";
import { talksFor } from "../../engine/negotiation";
import { isOffseason } from "../../engine/offseason";
import { gradeShort } from "../../engine/reports";
import {
  canPoach, canSignToPracticeSquad, freeAgents, isProtected, poachFromPracticeSquad, POSITION_ORDER, practiceSquad,
  promoteFromPracticeSquad, PS_VETERAN_SLOTS, releasePlayer, rosterCount, rosterLimit, signToPracticeSquad,
} from "../../engine/roster";
import { canClaim, claimDueLabel, putInClaim, waiverOrder, withdrawClaim } from "../../engine/waivers";
import type { GameState, Position } from "../../engine/types";
import { money, recentSeasonLine } from "../format";
import { useUi } from "../ui";

type Tab = "available" | "waivers" | "ps" | "wire";
const TABS: [Tab, string][] = [["available", "Available"], ["waivers", "Waiver wire"], ["ps", "Practice squad"], ["wire", "Transactions"]];

export function FreeAgentsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("available");
  const us = game.userTeam;
  const counts = rosterCount(game, us);
  const order = waiverOrder(game);
  const onWire = Object.keys(game.waivers ?? {}).length;
  return (
    <section className="stack">
      <h2>Free agents</h2>
      <p className="muted">
        {counts.roster} of {rosterLimit(game)} roster spots used{counts.ps ? `, ${counts.ps} of ${RULES.rosterLimits.practiceSquad} on the practice squad` : ""}.
        {" "}We're {ordinal(order.indexOf(us) + 1)} in the waiver order.
        {game.settings.capRules === "real" ? ` Cap space: ${money(capSummary(game, us).space)}.` : ""}
      </p>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}{k === "waivers" && onWire ? ` (${onWire})` : ""}
          </button>
        ))}
      </div>
      {tab === "available" && <Available game={game} changed={changed} />}
      {tab === "waivers" && <Waivers game={game} changed={changed} />}
      {tab === "ps" && <PracticeSquad game={game} changed={changed} />}
      {tab === "wire" && <Wire game={game} />}
    </section>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

function PosSelect({ pos, setPos }: { pos: Position | "all"; setPos: (p: Position | "all") => void }) {
  return (
    <select value={pos} onChange={(e) => setPos(e.target.value as Position | "all")} aria-label="Position">
      <option value="all">All positions</option>
      {POSITION_ORDER.map((x) => <option key={x}>{x}</option>)}
    </select>
  );
}

function Available({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const [pos, setPos] = useState<Position | "all">("all");
  const [source, setSource] = useState<"street" | "ps">("street");
  const [msg, setMsg] = useState<string | null>(null);
  const year = marketYear(game.date);
  const future = year > leagueYear(game.date);
  const inSeason = game.date >= RULES.keyDates.regularSeasonStart && !isOffseason(game.date);
  const ids = source === "street"
    ? freeAgents(game)
    : TEAMS.filter((t) => t.id !== us).flatMap((t) => practiceSquad(game, t.id));
  const rows = ids
    .filter((id) => pos === "all" || PLAYER_BY_ID[id].position === pos)
    .map((id) => ({ id, v: marketView(game, id) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 150);

  function act(fn: () => void, text: string) {
    fn();
    setMsg(text);
    changed();
  }

  return (
    <div className="stack tight">
      <p className="muted">
        {isMarketOpen(game.date)
          ? "Free agency is open: offers go through contract talks, and the Contracts page has the full market."
          : future
            ? `Our season is over or nearly so: free agents now sign reserve/future deals for ${year}, which start with the new league year.`
            : "Unsigned players sign one-year deals for the weeks that are left, most of them near the minimum. Veterans who were on a roster for Week 1 are owed their full salary if cut later; anyone signed after that isn't."}
      </p>
      <div className="btn-row">
        <PosSelect pos={pos} setPos={setPos} />
        {inSeason && (
          <select value={source} onChange={(e) => setSource(e.target.value as "street" | "ps")} aria-label="Source">
            <option value="street">Free agents</option>
            <option value="ps">Other teams' practice squads</option>
          </select>
        )}
      </div>
      {msg && <div className="notice">{msg}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">Exp</th><th>{source === "ps" ? "Team" : "Last team"}</th>
              <th>Scouts</th><th>Last season</th><th className="num">GM's price</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id }) => {
              const p = PLAYER_BY_ID[id];
              const ps = game.players[id];
              const quick = source === "street" ? canSignAtMinimum(game, us, id) : { ok: false };
              const psOk = source === "street" ? canSignToPracticeSquad(game, us, id) : { ok: false };
              const poach = source === "ps" ? canPoach(game, us, id) : { ok: false, reason: "" };
              const talks = source === "street" && talksFor(game, us, id).ok;
              const price = source === "street" ? priceEstimate(game, us, id) : 0;
              return (
                <tr key={id} className="clickable" onClick={() => ui.openPlayer(id)}>
                  <td className="name">{p.name}</td>
                  <td>{p.position}</td>
                  <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
                  <td className="num">{p.yearsExp === 0 ? "R" : p.yearsExp}</td>
                  <td>{source === "ps" ? ps.team : ps.lastTeam ?? ""}</td>
                  <td className="muted">{gradeShort(game, id)}</td>
                  <td className="muted">{recentSeasonLine(game, id)}</td>
                  <td className="num">{source === "ps" ? "" : Number.isFinite(price) ? (price <= 1_400_000 ? "Minimum" : money(price)) : ""}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="btn-row">
                      {quick.ok && (
                        <button className="btn small" onClick={() => act(() => signAtMinimum(game, us, id), `${p.name} signed a one-year minimum deal${future ? " (reserve/future)" : ""}.`)}>
                          {future ? "Future deal" : "Sign (min)"}
                        </button>
                      )}
                      {psOk.ok && <button className="btn small" onClick={() => act(() => signToPracticeSquad(game, us, id), `${p.name} joins the practice squad.`)}>Practice squad</button>}
                      {talks && <button className="btn small" onClick={() => ui.openTalks(id)}>Talks</button>}
                      {source === "ps" && (poach.ok
                        ? <button className="btn small" onClick={() => act(() => poachFromPracticeSquad(game, us, id), `${p.name} signed to our 53. He has to stay on it for three weeks.`)}>Sign to our 53</button>
                        : <span className="muted">{poach.reason}</span>)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">Nobody here.</td></tr>}
          </tbody>
        </table>
      </div>
      <span className="muted">
        Top 150 by the league's consensus. "GM's price" is what the GM hears agents are asking for a one-year deal; it isn't exact.
        {source === "ps" ? " A practice squad player signed to our 53 gets at least three game checks and has to stay on the roster for three weeks. Each team protects up to four a week." : ""}
      </span>
    </div>
  );
}

function Waivers({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const [pos, setPos] = useState<Position | "all">("all");
  const [drop, setDrop] = useState<Record<string, string>>({});
  const year = leagueYear(game.date);
  const wire = Object.values(game.waivers ?? {})
    .filter((w) => pos === "all" || PLAYER_BY_ID[w.player].position === pos)
    .sort((a, b) => marketView(game, b.player) - marketView(game, a.player));
  const roster = teamPlayerIds(game, us).filter((id) => ["active", "camp"].includes(game.players[id].status))
    .sort((a, b) => PLAYER_BY_ID[a].position.localeCompare(PLAYER_BY_ID[b].position) || PLAYER_BY_ID[a].name.localeCompare(PLAYER_BY_ID[b].name));
  const full = rosterCount(game, us).roster >= rosterLimit(game);
  return (
    <div className="stack tight">
      <p className="muted">
        Players with fewer than four accrued seasons go on waivers when they're released{game.date >= RULES.keyDates.veteranWaiversBegin && !isOffseason(game.date) ? ", and since the trade deadline every released player does" : ""}.
        Claims are due at 4 PM ET the next business day and go to the team highest in the waiver order, which follows the {RULES.season} draft order until {shortDate(RULES.keyDates.waiverOrderByStandings)}, then the standings.
        A claiming team takes over the rest of the contract; the bonus money stays with the team that cut him.
      </p>
      <PosSelect pos={pos} setPos={setPos} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th>From</th><th>Scouts</th><th className="num">{year} cap hit</th><th className="num">Yrs</th><th>Claims due</th><th>Our claim</th></tr></thead>
          <tbody>
            {wire.map((w) => {
              const p = PLAYER_BY_ID[w.player];
              const deal = claimedDeal(w.deal, us, game.date, p.yearsExp);
              const mine = w.claims.find((c) => c.team === us);
              const ok = canClaim(game, us, w.player);
              return (
                <tr key={w.player} className="clickable" onClick={() => ui.openPlayer(w.player)}>
                  <td className="name">{p.name}</td><td>{p.position}</td>
                  <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
                  <td>{w.from}</td>
                  <td className="muted">{gradeShort(game, w.player)}</td>
                  <td className="num">{money(dealCapHit(deal, year))}</td>
                  <td className="num">{deal.years.length}</td>
                  <td>{claimDueLabel(w)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {w.from === us ? <span className="muted">Ours</span> : mine ? (
                      <div className="btn-row">
                        <span className="pill keep">Claim in{mine.drop ? `, cutting ${PLAYER_BY_ID[mine.drop].name}` : ""}</span>
                        <button className="btn small" onClick={() => { withdrawClaim(game, us, w.player); changed(); }}>Withdraw</button>
                      </div>
                    ) : ok.ok ? (
                      <div className="btn-row">
                        {full && (
                          <select value={drop[w.player] ?? ""} onChange={(e) => setDrop({ ...drop, [w.player]: e.target.value })} aria-label="Player to release">
                            <option value="">GM picks who to cut</option>
                            {roster.map((id) => <option key={id} value={id}>Cut {PLAYER_BY_ID[id].position} {PLAYER_BY_ID[id].name}</option>)}
                          </select>
                        )}
                        <button className="btn small" onClick={() => { putInClaim(game, us, w.player, drop[w.player] || undefined); changed(); }}>Claim</button>
                      </div>
                    ) : <span className="muted">{ok.reason}</span>}
                  </td>
                </tr>
              );
            })}
            {wire.length === 0 && <tr><td colSpan={9} className="muted">Nobody is on waivers right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PracticeSquad({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const [msg, setMsg] = useState<string | null>(null);
  const squad = practiceSquad(game, us).sort((a, b) => POSITION_ORDER.indexOf(PLAYER_BY_ID[a].position) - POSITION_ORDER.indexOf(PLAYER_BY_ID[b].position));
  const protectedIds = game.psProtect?.[us] ?? [];
  const vets = squad.filter((id) => PLAYER_BY_ID[id].yearsExp >= 3).length;

  function toggleProtect(id: string) {
    const prot = (game.psProtect ??= {});
    const cur = prot[us] ?? [];
    prot[us] = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-4);
    changed();
  }

  if (game.date < RULES.keyDates.practiceSquadSigningOpens || isOffseason(game.date)) {
    return <p className="muted">Practice squads are formed the day after the cutdown ({shortDate(RULES.keyDates.practiceSquadSigningOpens)}) and run until a team's season ends.</p>;
  }
  return (
    <div className="stack tight">
      <p className="muted">
        {squad.length} of {RULES.rosterLimits.practiceSquad} spots, {vets} of {PS_VETERAN_SLOTS} veteran spots. Practice squad players are paid by the week and are free agents:
        any team can sign one to its 53 unless we protect him (four a week). The head coach can elevate two for a game day, three times per player each season.
      </p>
      {msg && <div className="notice">{msg}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">Exp</th><th>Coach</th><th className="num">Weekly</th><th className="num">Elevations</th><th>Protected</th><th></th></tr></thead>
          <tbody>
            {squad.map((id) => {
              const p = PLAYER_BY_ID[id];
              const prot = isProtected(game, us, id) || protectedIds.includes(id);
              return (
                <tr key={id} className="clickable" onClick={() => ui.openPlayer(id)}>
                  <td className="name">{p.name}</td><td>{p.position}</td>
                  <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
                  <td className="num">{p.yearsExp === 0 ? "R" : p.yearsExp}</td>
                  <td className="muted">{gradeShort(game, id)}</td>
                  <td className="num">{money(practiceWeekly(accruedSeasons(id, game.date)))}</td>
                  <td className="num">{game.players[id].elevations ?? 0} / 3</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <label><input type="checkbox" checked={prot} onChange={() => toggleProtect(id)} /> {prot ? "Protected" : "Open"}</label>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="btn-row">
                      <button className="btn small" onClick={() => {
                        const r = promoteFromPracticeSquad(game, us, id);
                        setMsg(r.ok ? `${p.name} signed to the 53 on a one-year minimum deal.` : r.reason!);
                        changed();
                      }}>Sign to 53</button>
                      <button className="btn small danger" onClick={() => { releasePlayer(game, id); setMsg(`${p.name} released from the practice squad.`); changed(); }}>Release</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {squad.length === 0 && <tr><td colSpan={9} className="muted">The practice squad is empty. Sign players from the Available tab.</td></tr>}
          </tbody>
        </table>
      </div>
      <span className="muted">If you don't choose, the GM protects the four players he values most each Tuesday.</span>
    </div>
  );
}

function Wire({ game }: { game: GameState }) {
  const ui = useUi();
  const [mine, setMine] = useState(false);
  const [elevations, setElevations] = useState(false);
  const rows = (game.transactions ?? [])
    .filter((t) => (!mine || t.team === game.userTeam) && (elevations || t.kind !== "elevated"))
    .slice(0, 300);
  return (
    <div className="stack tight">
      <div className="btn-row">
        <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only our moves</label>
        <label><input type="checkbox" checked={elevations} onChange={(e) => setElevations(e.target.checked)} /> Show game-day elevations</label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Team</th><th>Move</th></tr></thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={`${t.date}-${t.player}-${i}`} className="clickable" onClick={() => ui.openPlayer(t.player)}>
                <td>{shortDate(t.date)}</td><td>{t.team}</td><td>{t.text.charAt(0).toUpperCase() + t.text.slice(1)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="muted">No moves yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
