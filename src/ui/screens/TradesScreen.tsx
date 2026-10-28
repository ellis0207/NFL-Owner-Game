import { useState } from "react";
import { teamPlayerIds } from "../../engine/cap";
import { dealCapHit, dealOf, dealYearsLeft, lastYear, leagueYear } from "../../engine/contracts";
import { ageOn, shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, TEAMS, TEAM_BY_ID } from "../../engine/league";
import { gradeShort } from "../../engine/reports";
import { POSITION_ORDER } from "../../engine/roster";
import {
  acceptOffer, askPrice, canTradePlayer, checkTrade, declineOffer, describe, gmRead, hasNoTradeClause, headline,
  parsePick, PICK_YEARS, pickLabel, pickOwner, picksOf, projectedSlot, proposeTrade, toggleBlock, trades, tradeWindow, type Answer,
} from "../../engine/trades";
import type { GameState, TradeAsset, TradeDeal } from "../../engine/types";
import { money, recentSeasonLine } from "../format";
import { useUi } from "../ui";

type Tab = "make" | "offers" | "block" | "picks" | "league";
const TABS: [Tab, string][] = [["make", "Make a trade"], ["offers", "Offers"], ["block", "Trade block"], ["picks", "Draft picks"], ["league", "League trades"]];

export interface TradeStart {
  /** Another team's player we want, or one of ours to shop. */
  player: string;
}

export function TradesScreen({ game, changed, start }: { game: GameState; changed: () => void; start?: TradeStart | null }) {
  const [tab, setTab] = useState<Tab>("make");
  const w = tradeWindow(game);
  const offers = trades(game).offers.filter((o) => o.status === "open").length;
  return (
    <section className="stack">
      <h2>Trades</h2>
      <div className={`notice${w.open ? "" : " error"}`}>{w.text}</div>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}{k === "offers" && offers ? ` (${offers})` : ""}</button>
        ))}
      </div>
      {tab === "make" && <Builder game={game} changed={changed} start={start} />}
      {tab === "offers" && <Offers game={game} changed={changed} />}
      {tab === "block" && <Block game={game} changed={changed} />}
      {tab === "picks" && <Picks game={game} />}
      {tab === "league" && <LeagueTrades game={game} />}
    </section>
  );
}

const key = (a: TradeAsset) => (a.kind === "player" ? a.id : a.pick);

function sortRoster(game: GameState, team: string): string[] {
  return teamPlayerIds(game, team)
    .filter((id) => game.players[id].status !== "ps")
    .sort((a, b) => POSITION_ORDER.indexOf(PLAYER_BY_ID[a].position) - POSITION_ORDER.indexOf(PLAYER_BY_ID[b].position)
      || (dealOf(game, b)?.apy ?? 0) - (dealOf(game, a)?.apy ?? 0));
}

function Builder({ game, changed, start }: { game: GameState; changed: () => void; start?: TradeStart | null }) {
  const us = game.userTeam;
  const startTeam = start ? game.players[start.player]?.team : null;
  const [partner, setPartner] = useState<string>(startTeam && startTeam !== us ? startTeam : TEAMS.find((t) => t.id !== us)!.id);
  const [give, setGive] = useState<TradeAsset[]>(start && startTeam === us ? [{ kind: "player", id: start.player }] : []);
  const [get, setGet] = useState<TradeAsset[]>(start && startTeam && startTeam !== us ? [{ kind: "player", id: start.player }] : []);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const deal: TradeDeal = { teams: [us, partner], send: [give, get] };
  const ready = give.length > 0 && get.length > 0;
  const check = checkTrade(game, deal);
  const year = check.cap[0].year;

  function toggle(list: TradeAsset[], set: (l: TradeAsset[]) => void, a: TradeAsset) {
    set(list.some((x) => key(x) === key(a)) ? list.filter((x) => key(x) !== key(a)) : [...list, a]);
    setAnswer(null);
  }

  function propose() {
    const r = proposeTrade(game, deal);
    setAnswer(r);
    if (r.verdict === "accept") {
      setGive([]);
      setGet([]);
    }
    changed();
  }

  function takeCounter() {
    if (!answer?.counter) return;
    const r = proposeTrade(game, answer.counter);
    setAnswer(r);
    if (r.verdict === "accept") {
      setGive([]);
      setGet([]);
    } else if (r.counter) {
      setGive(r.counter.send[0]);
      setGet(r.counter.send[1]);
    }
    changed();
  }

  return (
    <div className="stack">
      <div className="btn-row">
        <label className="field">
          <span className="label">Trade partner</span>
          <select value={partner} onChange={(e) => { setPartner(e.target.value); setGet([]); setAnswer(null); }}>
            {TEAMS.filter((t) => t.id !== us).sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
        </label>
      </div>

      <div className="panel stack tight">
        <div className="split">
          <div className="stack tight">
            <span className="label">We send</span>
            <strong>{give.length ? describe(game, give, us) : "Nothing yet"}</strong>
          </div>
          <div className="stack tight">
            <span className="label">We get</span>
            <strong>{get.length ? describe(game, get, partner) : "Nothing yet"}</strong>
          </div>
        </div>
        {(give.length > 0 || get.length > 0) && (
          <>
            <dl className="kv">
              <dt>Our {year} cap space</dt>
              <dd>{money(check.cap[0].before)} → <span className={check.cap[0].space < 0 ? "bad" : undefined}>{money(check.cap[0].space)}</span></dd>
              <dt>Dead money we take on</dt>
              <dd>{money(check.cap[0].dead)}{check.cap[0].deadNext ? ` now, ${money(check.cap[0].deadNext)} in ${year + 1}` : ""}</dd>
              <dt>{TEAM_BY_ID[partner].name} cap space</dt>
              <dd>{money(check.cap[1].before)} → <span className={check.cap[1].space < 0 ? "bad" : undefined}>{money(check.cap[1].space)}</span></dd>
              <dt>Our roster after</dt>
              <dd>{check.roster[0].count} of {check.roster[0].limit}</dd>
            </dl>
            {ready && <p><span className="label">GM's read</span><br />{gmRead(game, deal)}</p>}
            {ready && !check.ok && <div className="notice error">{check.problems.join(" ")}</div>}
          </>
        )}
        {answer && (
          <div className={`notice${answer.verdict === "reject" ? " error" : ""}`}>
            {answer.text}
            {answer.verdict === "counter" && answer.counter && (
              <div className="stack tight" style={{ marginTop: "0.5rem" }}>
                <span>Their version: we send {describe(game, answer.counter.send[0], us)}; we get {describe(game, answer.counter.send[1], partner)}.</span>
                <span className="muted">GM's read: {gmRead(game, answer.counter)}</span>
                <div className="btn-row">
                  <button className="btn primary" onClick={takeCounter}>Accept their terms</button>
                  <button className="btn" onClick={() => { setGive(answer.counter!.send[0]); setGet(answer.counter!.send[1]); setAnswer(null); }}>Edit it</button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="btn-row">
          <button className="btn primary" disabled={!ready || !check.ok} onClick={propose}>Propose trade</button>
          <button className="btn" disabled={!get.length} onClick={() => setAnswer(askPrice(game, partner, get))}>What would it take?</button>
          <button className="btn" disabled={!give.length && !get.length} onClick={() => { setGive([]); setGet([]); setAnswer(null); }}>Clear</button>
        </div>
      </div>

      <div className="split">
        <AssetList game={game} team={us} chosen={give} toggle={(a) => toggle(give, setGive, a)} title="Our players and picks" other={partner} />
        <AssetList game={game} team={partner} chosen={get} toggle={(a) => toggle(get, setGet, a)} title={`${TEAM_BY_ID[partner].city} ${TEAM_BY_ID[partner].name}`} other={us} />
      </div>
      <span className="muted">
        The team that gets a player takes on the rest of his salary and guarantees for the weeks that are left. His signing bonus stays with the old team:
        this year's share stays on its cap and later years' land as dead money (on next year's cap for a trade after June 1).
        Scout grades are our staff's read, not the other team's.
      </span>
    </div>
  );
}

function AssetList({ game, team, chosen, toggle, title, other }: { game: GameState; team: string; chosen: TradeAsset[]; toggle: (a: TradeAsset) => void; title: string; other: string }) {
  const ui = useUi();
  const [view, setView] = useState<"players" | "picks">("players");
  const year = leagueYear(game.date);
  const picked = new Set(chosen.map(key));
  return (
    <div className="stack tight">
      <div className="btn-row" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div className="tabs" role="group" aria-label="Assets">
          <button aria-pressed={view === "players"} onClick={() => setView("players")}>Players</button>
          <button aria-pressed={view === "picks"} onClick={() => setView("picks")}>Picks</button>
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: "28rem", overflowY: "auto" }}>
        {view === "players" ? (
          <table>
            <thead><tr><th></th><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">{year} hit</th><th className="num">Thru</th><th>Scouts</th></tr></thead>
            <tbody>
              {sortRoster(game, team).map((id) => {
                const p = PLAYER_BY_ID[id];
                const ok = canTradePlayer(game, id, other);
                const deal = dealOf(game, id);
                const req = trades(game).requests[id];
                return (
                  <tr key={id} className="clickable" onClick={() => ui.openPlayer(id)} title={ok.ok ? recentSeasonLine(game, id) : ok.reason}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Include ${p.name}`} disabled={!ok.ok && !picked.has(id)} checked={picked.has(id)} onChange={() => toggle({ kind: "player", id })} />
                    </td>
                    <td className="name">
                      {p.name}
                      {game.players[id].status === "ir" && <span className="pill"> IR</span>}
                      {req && <span className="pill cut"> Wants out</span>}
                      {hasNoTradeClause(id) && <span className="pill"> No-trade</span>}
                      {!ok.ok && <span className="muted"> · {ok.reason}</span>}
                    </td>
                    <td>{p.position}</td>
                    <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
                    <td className="num">{money(capOf(game, id, year))}</td>
                    <td className="num">{deal ? (dealYearsLeft(deal, year) ? lastYear(deal) : "") : ""}</td>
                    <td className="muted">{gradeShort(game, id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th></th><th>Pick</th><th>Projected</th></tr></thead>
            <tbody>
              {picksOf(game, team).map((pick) => {
                const { year: y, round, from } = parsePick(pick);
                const slot = projectedSlot(game, from, y);
                return (
                  <tr key={pick}>
                    <td><input type="checkbox" aria-label={`Include ${pickLabel(game, pick, team)}`} checked={picked.has(pick)} onChange={() => toggle({ kind: "pick", pick })} /></td>
                    <td>{pickLabel(game, pick, team)}</td>
                    <td className="muted">{y === PICK_YEARS[0] ? `about #${(round - 1) * 32 + slot} overall` : "mid-round"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function capOf(game: GameState, id: string, year: number): number {
  return dealCapHit(dealOf(game, id), year);
}

function Offers({ game, changed }: { game: GameState; changed: () => void }) {
  const us = game.userTeam;
  const [msg, setMsg] = useState<string | null>(null);
  const all = trades(game).offers;
  const open = all.filter((o) => o.status === "open");
  const past = all.filter((o) => o.status !== "open").slice(0, 20);
  return (
    <div className="stack tight">
      <p className="muted">Teams call when they want one of our players, or have one to move. Put players on the trade block to get more calls.</p>
      {msg && <div className="notice">{msg}</div>}
      {open.length === 0 && <p className="muted">No offers on the table.</p>}
      {open.map((o) => {
        const check = checkTrade(game, o);
        return (
          <div key={o.id} className="panel stack tight">
            <strong>{TEAM_BY_ID[o.teams[0]].city} {TEAM_BY_ID[o.teams[0]].name}</strong>
            <span>{o.note}</span>
            <span>We get <strong>{describe(game, o.send[0], o.teams[0])}</strong> for <strong>{describe(game, o.send[1], us)}</strong>.</span>
            <span className="muted">
              Good until {shortDate(o.expires)}. Our cap space after: {money(check.cap[1].space)}{check.cap[1].dead ? `, with ${money(check.cap[1].dead)} in dead money` : ""}.
              {" "}GM's read: {gmRead(game, o)}
            </span>
            {!check.ok && <span className="bad">{check.problems.join(" ")}</span>}
            <div className="btn-row">
              <button className="btn primary" disabled={!check.ok} onClick={() => { setMsg(acceptOffer(game, o.id).text); changed(); }}>Accept</button>
              <button className="btn" onClick={() => { declineOffer(game, o.id); setMsg("We passed."); changed(); }}>Decline</button>
            </div>
          </div>
        );
      })}
      {past.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Team</th><th>Offer</th><th>Outcome</th></tr></thead>
            <tbody>
              {past.map((o) => (
                <tr key={o.id}>
                  <td>{shortDate(o.date)}</td><td>{o.teams[0]}</td>
                  <td>{describe(game, o.send[0], o.teams[0])} for {describe(game, o.send[1], us)}</td>
                  <td className="muted">{o.status === "accepted" ? "Accepted" : o.status === "declined" ? "Declined" : o.status === "expired" ? "Expired" : "Withdrawn"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Block({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const us = game.userTeam;
  const ts = trades(game);
  const year = leagueYear(game.date);
  const requests = Object.entries(ts.requests).filter(([id]) => game.players[id]?.team !== us);
  return (
    <div className="stack tight">
      <p className="muted">Players on the block are shopped to every team, and the calls come to the Offers tab. Teams pay less for a player they know we want to move.</p>
      <div className="table-wrap" style={{ maxHeight: "32rem", overflowY: "auto" }}>
        <table>
          <thead><tr><th>On the block</th><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">{year} hit</th><th>Scouts</th></tr></thead>
          <tbody>
            {sortRoster(game, us).map((id) => {
              const p = PLAYER_BY_ID[id];
              const ok = canTradePlayer(game, id);
              return (
                <tr key={id} className="clickable" onClick={() => ui.openPlayer(id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Shop ${p.name}`} disabled={!ok.ok} checked={ts.block.includes(id)} onChange={() => { toggleBlock(game, id); changed(); }} />
                  </td>
                  <td className="name">{p.name}{ts.requests[id] && <span className="pill cut"> Wants out</span>}{!ok.ok && <span className="muted"> · {ok.reason}</span>}</td>
                  <td>{p.position}</td>
                  <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
                  <td className="num">{money(capOf(game, id, year))}</td>
                  <td className="muted">{gradeShort(game, id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {requests.length > 0 && (
        <>
          <h3>Around the league: players who asked for a trade</h3>
          <ul>
            {requests.map(([id, date]) => (
              <li key={id}><button className="btn small" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].position} {PLAYER_BY_ID[id].name}</button> <span className="muted">{TEAM_BY_ID[game.players[id].team!]?.name}, since {shortDate(date)}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Picks({ game }: { game: GameState }) {
  const us = game.userTeam;
  const mine = picksOf(game, us);
  const moved = Object.entries(trades(game).picks).filter(([id, owner]) => owner !== parsePick(id).from).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="stack tight">
      <p className="muted">Picks in the next three drafts can be traded. The projection for the next draft follows the standings and how teams look; later drafts are anyone's guess.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pick</th><th>Projected</th></tr></thead>
          <tbody>
            {mine.map((pick) => {
              const { year, round, from } = parsePick(pick);
              return (
                <tr key={pick}>
                  <td>{pickLabel(game, pick, us)}</td>
                  <td className="muted">{year === PICK_YEARS[0] ? `about #${(round - 1) * 32 + projectedSlot(game, from, year)} overall` : "mid-round"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Picks that have changed hands</h3>
      <div className="table-wrap" style={{ maxHeight: "24rem", overflowY: "auto" }}>
        <table>
          <thead><tr><th>Pick</th><th>Original team</th><th>Now owned by</th></tr></thead>
          <tbody>
            {moved.map(([id]) => (
              <tr key={id}><td>{pickLabel(game, id, parsePick(id).from)}</td><td>{parsePick(id).from}</td><td>{pickOwner(game, id)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="muted">Before the game starts, three 2027 first-rounders had already moved: Green Bay's to Dallas (Micah Parsons), Indianapolis's and Dallas's to the Jets (Sauce Gardner, Quinnen Williams). Compensatory picks aren't modeled yet.</span>
    </div>
  );
}

function LeagueTrades({ game }: { game: GameState }) {
  const [mine, setMine] = useState(false);
  const rows = trades(game).log.filter((t) => !mine || t.teams.includes(game.userTeam));
  return (
    <div className="stack tight">
      <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only our trades</label>
      {rows.length === 0 && <p className="muted">No trades yet.</p>}
      {rows.map((t) => (
        <div key={t.id} className="panel stack tight">
          <span className="muted">{shortDate(t.date)}{t.blockbuster ? " · Blockbuster" : ""}{t.status === "agreed" ? " · Official at the new league year" : t.status === "voided" ? " · Fell through" : ""}</span>
          <strong>{headline(game, t)}</strong>
          {t.grades && (
            <div className="split">
              {t.teams.map((team) => (
                <div key={team} className="stack tight">
                  <span className="label">{TEAM_BY_ID[team].name}</span>
                  {t.grades![team].map((g) => <span key={g.outlet}><strong>{g.grade}</strong> <span className="muted">{g.outlet}: {g.take}</span></span>)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
