import { initialTab } from "../ui";
import { Bars, Grade, Icon, TeamBadge } from "../gfx";
import { useState } from "react";
import { teamPlayerIds } from "../../engine/cap";
import { dealCapHit, dealOf, dealYearsLeft, lastYear, leagueYear } from "../../engine/contracts";
import { ageOn, shortDate } from "../../engine/dates";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAMS, TEAM_BY_ID } from "../../engine/league";
import { gradeShort } from "../../engine/reports";
import { POSITION_ORDER } from "../../engine/roster";
import {
  acceptOffer, askPrice, canTradePlayer, checkTrade, counterProblem, declineOffer, describe, gmRead, hasNoTradeClause, headline,
  parsePick, PICK_YEARS, pickLabel, pickOwner, picksOf, projectedSlot, proposeTrade, toggleBlock, trades, tradeWindow, type Answer,
} from "../../engine/trades";
import type { GameState, PickCondition, TradeAsset, TradeDeal, TradeOffer } from "../../engine/types";
import { conditionNote, statMark } from "../../engine/conditions";
import { money } from "../format";
import { useUi } from "../ui";
import { tip } from "../tip";

type Tab = "make" | "offers" | "block" | "picks" | "league";
const TABS: [Tab, string][] = [["make", "Make a trade"], ["offers", "Offers"], ["block", "Trade block"], ["picks", "Draft picks"], ["league", "League trades"]];

export interface TradeStart {
  /** Another team's player we want, or one of ours to shop. */
  player: string;
}

export function TradesScreen({ game, changed, start }: { game: GameState; changed: () => void; start?: TradeStart | null }) {
  const [tab, setTab] = useState<Tab>(() => initialTab<Tab>("Trades", ["make", "offers", "block", "picks", "league"], "make"));
  const w = tradeWindow(game);
  const offers = trades(game).offers.filter((o) => o.status === "open").length;
  // An offer we're countering opens in the trade builder with its pieces loaded.
  const [counterOf, setCounterOf] = useState<string | null>(null);
  return (
    <section className="stack">
      <div className={`notice${w.open ? "" : " error"}`}>{w.text}</div>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}{k === "offers" && offers ? ` (${offers})` : ""}</button>
        ))}
      </div>
      {tab === "make" && <Builder key={counterOf ?? "new"} game={game} changed={changed} start={counterOf ? null : start} counterOf={counterOf} endCounter={() => setCounterOf(null)} />}
      {tab === "offers" && <Offers game={game} changed={changed} counter={(id) => { setCounterOf(id); setTab("make"); }} />}
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

function Builder({ game, changed, start, counterOf, endCounter }: {
  game: GameState; changed: () => void; start?: TradeStart | null; counterOf?: string | null; endCounter?: () => void;
}) {
  const us = game.userTeam;
  const offer = counterOf ? trades(game).offers.find((o) => o.id === counterOf) : undefined;
  const startTeam = start ? game.players[start.player]?.team : null;
  const [partner, setPartner] = useState<string>(offer ? offer.teams[0] : startTeam && startTeam !== us ? startTeam : TEAMS.find((t) => t.id !== us)!.id);
  const [give, setGive] = useState<TradeAsset[]>(offer ? [...offer.send[1]] : start && startTeam === us ? [{ kind: "player", id: start.player }] : []);
  const [get, setGet] = useState<TradeAsset[]>(offer ? [...offer.send[0]] : start && startTeam && startTeam !== us ? [{ kind: "player", id: start.player }] : []);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const deal: TradeDeal = { teams: [us, partner], send: [give, get] };
  const ready = give.length > 0 && get.length > 0;
  const check = checkTrade(game, deal);
  const year = check.cap[0].year;
  const countering = offer?.status === "open" ? offer.id : undefined;
  const counterIssue = countering ? counterProblem(game, countering, deal) : null;

  function toggle(list: TradeAsset[], set: (l: TradeAsset[]) => void, a: TradeAsset) {
    set(list.some((x) => key(x) === key(a)) ? list.filter((x) => key(x) !== key(a)) : [...list, a]);
    setAnswer(null);
  }

  function setCond(side: 0 | 1, pick: string, cond: PickCondition | undefined) {
    const [list, set] = side === 0 ? [give, setGive] : [get, setGet];
    set(list.map((x) => (x.kind === "pick" && x.pick === pick ? (cond ? { kind: "pick", pick, cond } : { kind: "pick", pick }) : x)));
    setAnswer(null);
  }

  /** The conditions a pick can carry: about the players its sender gets in this deal, its team, or protection for a 1st. */
  function condOptions(side: 0 | 1, pick: string): { label: string; cond?: PickCondition }[] {
    const opts: { label: string; cond?: PickCondition }[] = [{ label: "No condition" }];
    if (parsePick(pick).round === 1) {
      for (const n of [3, 5, 10]) opts.push({ label: `Top-${n} protected`, cond: { kind: "protect", threshold: n } });
      return opts;
    }
    for (const x of deal.send[1 - side]) {
      if (x.kind !== "player") continue;
      const p = PLAYER_BY_ID[x.id];
      opts.push({ label: `Up a round if ${p.name} plays 50% of snaps`, cond: { kind: "snaps", threshold: 0.5, player: x.id } });
      const m = statMark(p.position);
      if (m) opts.push({ label: `Up a round if ${p.name} reaches ${m.threshold} ${m.kind === "sacks" ? "sacks" : "yards"}`, cond: { ...m, player: x.id } });
      opts.push({ label: `Up a round if ${p.name} is extended`, cond: { kind: "extend", threshold: 0, player: x.id } });
    }
    opts.push({ label: "Up a round if they make the playoffs", cond: { kind: "playoffs", threshold: 0 } });
    return opts;
  }

  function propose() {
    const r = proposeTrade(game, deal, countering);
    setAnswer(r);
    if (r.verdict === "accept") {
      setGive([]);
      setGet([]);
    }
    changed();
  }

  function takeCounter() {
    if (!answer?.counter) return;
    const via = countering && !counterProblem(game, countering, answer.counter) ? countering : undefined;
    const r = proposeTrade(game, answer.counter, via);
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
      {offer && (
        <div className="notice">
          {offer.status === "open"
            ? <>Countering the {TEAM_BY_ID[offer.teams[0]].city} {TEAM_BY_ID[offer.teams[0]].name} offer. Change the pieces on either side, but keep at least one from their offer. They called us, so they'll give a little ground; a lowball can end the talks.</>
            : <>The {TEAM_BY_ID[offer.teams[0]].name} offer is off the table now.</>}
          {" "}<button className="btn small" onClick={endCounter}>{offer.status === "open" ? "Stop countering" : "New trade"}</button>
        </div>
      )}
      <div className="btn-row">
        <label className="field">
          <span className="label">Trade partner</span>
          <select value={partner} disabled={!!countering} onChange={(e) => { setPartner(e.target.value); setGet([]); setAnswer(null); }}>
            {TEAMS.filter((t) => t.id !== us).sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
        </label>
      </div>

      <div className="panel stack tight">
        <div className="split">
          <div className="stack tight">
            <span className="label gx-row"><TeamBadge team={us} size={20} /> We send <Icon name="swap" size={14} /></span>
            <strong>{give.length ? describe(game, give, us) : "Nothing yet"}</strong>
          </div>
          <div className="stack tight">
            <span className="label gx-row"><TeamBadge team={partner} size={20} /> We get</span>
            <strong>{get.length ? describe(game, get, partner) : "Nothing yet"}</strong>
          </div>
        </div>
        {(give.length > 0 || get.length > 0) && (
          <>
            <div className="split">
              {([0, 1] as const).map((side) => {
                const c = check.cap[side];
                const top = Math.max(Math.abs(c.before), Math.abs(c.space), 1);
                return (
                  <div key={side} className="stack tight">
                    <span className="gx-row"><TeamBadge team={side ? partner : us} size={20} /><span className="gx-kicker">{year} cap space</span></span>
                    <Bars max={top} rows={[
                      { key: "b", label: "Before", value: Math.max(0, c.before), text: money(c.before), tone: undefined },
                      { key: "a", label: "After", value: Math.max(0, c.space), text: money(c.space), tone: c.space < 0 ? "bad" : c.space >= c.before ? "good" : "warn" },
                    ]} />
                  </div>
                );
              })}
            </div>
            <dl className="kv">
              <dt>Our {year} cap space</dt>
              <dd>{money(check.cap[0].before)} → <span className={check.cap[0].space < 0 ? "bad" : undefined}>{money(check.cap[0].space)}</span></dd>
              <dt>Dead money we take on</dt>
              <dd>{money(check.cap[0].dead)}{check.cap[0].deadNext ? ` now, ${money(check.cap[0].deadNext)} in ${year + 1}` : ""}</dd>
              <dt {...tip("cap", partner)}>{TEAM_BY_ID[partner].name} cap space</dt>
              <dd>{money(check.cap[1].before)} → <span className={check.cap[1].space < 0 ? "bad" : undefined}>{money(check.cap[1].space)}</span></dd>
              <dt>Our roster after</dt>
              <dd>{check.roster[0].count} of {check.roster[0].limit}</dd>
            </dl>
            {([0, 1] as const).some((side) => deal.send[side].some((x) => x.kind === "pick")) && (
              <div className="stack tight">
                <span className="label">Pick conditions</span>
                {([0, 1] as const).flatMap((side) => deal.send[side].filter((x): x is Extract<TradeAsset, { kind: "pick" }> => x.kind === "pick").map((x) => {
                  const opts = condOptions(side, x.pick);
                  const current = Math.max(0, opts.findIndex((o) => JSON.stringify(o.cond) === JSON.stringify(x.cond)));
                  return (
                    <label key={x.pick} className="field">
                      <span className="label">{side === 0 ? "Our" : "Their"} {pickLabel(game, x.pick, deal.teams[side])}</span>
                      <select value={current} onChange={(e) => setCond(side, x.pick, opts[Number(e.target.value)].cond)}>
                        {opts.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                      </select>
                    </label>
                  );
                }))}
              </div>
            )}
            {ready && <p><span className="label">GM's read</span><br />{gmRead(game, deal)}</p>}
            {ready && !check.ok && <div className="notice error">{check.problems.join(" ")}</div>}
            {ready && check.ok && counterIssue && <div className="notice error">{counterIssue}</div>}
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
          <button className="btn primary" disabled={!ready || !check.ok || !!counterIssue} onClick={propose}>{countering ? "Send counter" : "Propose trade"}</button>
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
                  <tr key={id} className="clickable" {...tip("player", id)} onClick={() => ui.openPlayer(id)} title={ok.ok ? undefined : ok.reason}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Include ${p.name}`} disabled={!ok.ok && !picked.has(id)} checked={picked.has(id)} onChange={() => toggle({ kind: "player", id })} />
                    </td>
                    <td className="name">
                      {p.name}
                      {game.players[id].status === "ir" && <span className="pill"> IR</span>}
                      {req && <span className="pill cut"> Wants out</span>}
                      {hasNoTradeClause(id, game) && <span className="pill"> No-trade</span>}
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
                    <td>{pickLabel(game, pick, team)}{conditionNote(game, pick) && <span className="muted"> · {conditionNote(game, pick)}</span>}</td>
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

function Offers({ game, changed, counter }: { game: GameState; changed: () => void; counter: (id: string) => void }) {
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
          <div key={o.id} className="panel stack tight rb-slip">
            <span className="rb-slip-label">Call from</span>
            <strong className="rb-slip-from">{TEAM_BY_ID[o.teams[0]].city} {TEAM_BY_ID[o.teams[0]].name}</strong>
            <span>{o.note}</span>
            <span>We get <strong>{describe(game, o.send[0], o.teams[0])}</strong> for <strong>{describe(game, o.send[1], us)}</strong>.</span>
            <span className="muted">
              Good until {shortDate(o.expires)}. Our cap space after: {money(check.cap[1].space)}{check.cap[1].dead ? `, with ${money(check.cap[1].dead)} in dead money` : ""}.
              {" "}GM's read: {gmRead(game, o)}
            </span>
            {!check.ok && <span className="bad">{check.problems.join(" ")}</span>}
            <div className="btn-row">
              <button className="btn primary" disabled={!check.ok} onClick={() => { setMsg(acceptOffer(game, o.id).text); changed(); }}>Accept</button>
              <button className="btn" disabled={!tradeWindow(game).open} onClick={() => counter(o.id)}>Counter</button>
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
                  <td className="muted">{offerOutcome(o)}</td>
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
                <tr key={id} className="clickable" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>
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
              <li key={id}><button className="btn small" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].position} {PLAYER_BY_ID[id].name}</button> <span className="muted">{TEAM_BY_ID[game.players[id].team!]?.name}, since {shortDate(date)}</span></li>
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
      <div className="gx-grid rb-picks">
        {mine.map((pick) => {
          const { year, round, from } = parsePick(pick);
          return (
            <div key={pick} className="gx-tile sunk gx-row">
              <span className={`rb-round r${round}`}>R{round}</span>
              <span style={{ display: "grid", lineHeight: 1.25, minWidth: 0 }}>
                <strong>{pickLabel(game, pick, us)}</strong>
                <span className="muted" style={{ fontSize: "0.78rem" }}>{year === PICK_YEARS[0] ? `about #${(round - 1) * 32 + projectedSlot(game, from, year)} overall` : "mid-round"}</span>
              </span>
              {from !== us && <TeamBadge team={from} size={22} />}
            </div>
          );
        })}
      </div>
      <h3>Picks that have changed hands</h3>
      <div className="table-wrap" style={{ maxHeight: "24rem", overflowY: "auto" }}>
        <table>
          <thead><tr><th>Pick</th><th>Original team</th><th>Now owned by</th></tr></thead>
          <tbody>
            {moved.map(([id]) => (
              <tr key={id}><td>{pickLabel(game, id, parsePick(id).from)}</td><td><TeamBadge team={parsePick(id).from} size={20} /></td><td><span className="gx-row"><Icon name="swap" size={13} /><TeamBadge team={pickOwner(game, id)} size={20} /></span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {RULES.season === BASE_SEASON && <span className="muted">Before the game starts, three 2027 first-rounders had already moved: Green Bay's to Dallas (Micah Parsons), Indianapolis's and Dallas's to the Jets (Sauce Gardner, Quinnen Williams).</span>}
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
        <div key={t.id} className={`panel stack tight rb-ticket${t.blockbuster ? " big" : ""}`}>
          <span className="muted">{shortDate(t.date)}{t.blockbuster ? " · Blockbuster" : ""}{t.status === "agreed" ? " · Official at the new league year" : t.status === "voided" ? " · Fell through" : ""}</span>
          <div className="gx-row">{t.teams.map((team, i) => <span key={team} className="gx-row">{i > 0 && <Icon name="swap" />}<TeamBadge team={team} size={30} /></span>)}<strong>{headline(game, t)}</strong></div>
          {t.grades && (
            <div className="split">
              {t.teams.map((team) => (
                <div key={team} className="stack tight">
                  <span className="label" {...tip("team", team)}>{TEAM_BY_ID[team].name}</span>
                  {t.grades![team].map((g) => <span key={g.outlet}><Grade g={g.grade} /> <span className="muted">{g.outlet}: {g.take}</span></span>)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Why an offer is off the table, in a few words. */
function offerOutcome(o: TradeOffer): string {
  if (o.status === "accepted") return "Accepted";
  if (o.status === "declined") return "We passed";
  if (o.status === "withdrawn") return "They pulled it (a counter or a piece moved)";
  // Offers still open on deadline day close with the deadline; the rest ran out without an answer.
  return o.expires >= RULES.keyDates.tradeDeadline && o.date <= RULES.keyDates.tradeDeadline ? "Closed at the trade deadline" : `No answer by ${shortDate(o.expires)}`;
}
