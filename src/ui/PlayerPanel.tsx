import { useEffect, useState } from "react";
import { releaseCost } from "../engine/cap";
import { dealOf, leagueYear } from "../engine/contracts";
import { ageOn, longDate, shortDate } from "../engine/dates";
import { injuryStatus } from "../engine/injuries";
import { GAME_BY_ID, PLAYER_BY_ID, SCHEDULE, SEASON, TEAM_BY_ID } from "../engine/league";
import { playerReport } from "../engine/reports";
import { releasePlayer } from "../engine/roster";
import { claimDueLabel, onWaivers } from "../engine/waivers";
import { talksFor } from "../engine/negotiation";
import { isOffseason, restructure, restructurePreview } from "../engine/offseason";
import { acceptCounter, askPayCut, canJune1, june1Left, june1Preview, payCutInfo, releaseJune1 } from "../engine/capmoves";
import { gameTypeLabel, outLabel } from "../engine/season";
import { canTradePlayer, hasNoTradeClause, trades } from "../engine/trades";
import { matchup } from "../engine/standings";
import { gameLog, seasonTotals, unpack } from "../engine/stats";
import type { GameState } from "../engine/types";
import { ContractTable, dealSummary } from "./ContractTable";
import { draftLine, gameLine, height, mergeSeason, money, statLine } from "./format";
import { useUi } from "./ui";

const CONTRACT_SOURCE = {
  overthecap: "Year-by-year figures from OverTheCap.",
  "estimated-from-apy": "Cap hits estimated from the contract's average per year.",
  "estimated-minimum": "No contract on record; estimated at the league minimum.",
  "free-agent": "",
};

export function PlayerPanel({ game, id, onClose, changed }: { game: GameState; id: string; onClose: () => void; changed: () => void }) {
  const p = PLAYER_BY_ID[id];
  const state = game.players[id];
  const [confirming, setConfirming] = useState<false | "now" | "june1">(false);
  const [cutTo, setCutTo] = useState<number | null>(null);
  const [cutReply, setCutReply] = useState<string | null>(null);
  const ui = useUi();
  const cost = releaseCost(id, game);
  const year = leagueYear(game.date);
  const seasons = [...new Set(p.stats.map((s) => s.season))].sort((a, b) => b - a);
  const mine = state.team === game.userTeam;
  const deal = dealOf(game, id);
  const original = !(id in game.contracts);
  const report = playerReport(game, id);
  const log = gameLog(game, id);
  const phases = (["PRE", "REG", "POST"] as const).map((t) => [t, seasonTotals(game, t)[id]] as const).filter(([, s]) => s);
  const nextGame = state.team ? SCHEDULE.find((g) => g.date >= game.date && !game.results[g.id] && (() => {
    const m = matchup(game, g);
    return m && (m.away === state.team || m.home === state.team);
  })()) : undefined;
  const status = nextGame ? injuryStatus(game, id, nextGame.date) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function releaseLater() {
    const r = releaseJune1(game, id);
    if (!r) return;
    game.inbox.unshift({
      id: `${game.date}-rel-${id}`, date: game.date, kind: "transaction", from: "General Manager",
      title: `${p.name} released (post-June 1)`,
      body: `We released ${p.name} with a post-June 1 designation. His full ${money(r.held + r.dead)} cap charge stays on the ${r.year} books until June 2; ` +
        `then ${money(r.dead)} stays as dead money, ${money(r.held)} comes off, and ${money(r.deadNext)} moves to ${r.year + 1}.`,
      read: true,
    });
    changed();
    onClose();
  }

  function release() {
    const where = releasePlayer(game, id);
    const w = onWaivers(game, id);
    if (game.cutPlan) game.cutPlan = game.cutPlan.filter((x) => x !== id);
    game.inbox.unshift({
      id: `${game.date}-rel-${id}`, date: game.date, kind: "transaction", from: "General Manager",
      title: `${p.name} released`,
      body: `We released ${p.name}. ${money(cost.deadThisYear)} stays on this year's cap as dead money` +
        (cost.deadNextYear ? ` and ${money(cost.deadNextYear)} moves to next year.` : ".") +
        (where === "waivers" && w ? ` He's on waivers until ${claimDueLabel(w)}; a team that claims him takes over his salary.` : " He's a free agent now."),
      read: true,
    });
    changed();
    onClose();
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        <div className="btn-row" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={onClose}>Close</button></div>
        <header>
          <div>
            <h2>{p.name}</h2>
            <span className="muted">{p.position} · {state.team ? `${TEAM_BY_ID[state.team].city} ${TEAM_BY_ID[state.team].name}` : onWaivers(game, id) ? `On waivers (from ${TEAM_BY_ID[onWaivers(game, id)!.from].name}, claims due ${claimDueLabel(onWaivers(game, id)!)})` : `Free agent${state.lastTeam ? `, last with the ${TEAM_BY_ID[state.lastTeam]?.name ?? state.lastTeam}` : ""}`}{state.status === "ps" ? " (practice squad)" : state.status === "ir" ? " (injured reserve)" : ""}</span>
          </div>
          {p.jersey != null && <span className="jersey" style={{ marginLeft: "auto" }}>{p.jersey}</span>}
        </header>
        <dl className="kv">
          <dt>Age</dt><dd>{ageOn(p.birthDate, game.date) ?? "—"}{p.birthDate ? ` (born ${longDate(p.birthDate).replace(/^\w+, /, "")})` : ""}</dd>
          <dt>Size</dt><dd>{height(p.heightIn)}, {p.weightLb ?? "—"} lb</dd>
          <dt>College</dt><dd>{p.college ?? "—"}</dd>
          <dt>Draft</dt><dd>{draftLine(p)}</dd>
          <dt>Experience</dt><dd>{p.yearsExp === 0 ? "Rookie" : `${p.yearsExp} seasons`}</dd>
        </dl>

        {state.injury && state.injury.returnDate > game.date && (
          <div className="notice error">
            <strong>{state.injury.type}</strong> ({shortDate(state.injury.date)}): {outLabel(game.date, state.injury.returnDate, state.injury.seasonEnding)}
            {status && nextGame ? `. ${status} for ${shortDate(nextGame.date)}.` : "."}
          </div>
        )}

        <section className="report">
          <span className="label">{report.authorRole}'s report · {report.author}</span>
          <strong>{report.grade}</strong>
          {(report.strengths.length > 0 || report.concerns.length > 0) && (
            <ul>
              {report.strengths.map((t) => <li key={t}>{t}</li>)}
              {report.concerns.map((t) => <li key={t} className="muted">{t}</li>)}
            </ul>
          )}
          {report.summary && <span>{report.summary}</span>}
          {report.fit && <span className="muted">{report.fit}</span>}
        </section>

        {phases.length > 0 && (
          <section className="stack">
            <h3>{SEASON} season</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th></th><th className="num">G</th><th>Line</th><th className="num">Snaps</th></tr></thead>
                <tbody>
                  {phases.map(([t, s]) => (
                    <tr key={t}>
                      <td>{t === "PRE" ? "Preseason" : t === "REG" ? "Regular season" : "Playoffs"}</td>
                      <td className="num">{s!.line.g ?? 0}</td>
                      <td>{gameLine(p.position, s!.line)}</td>
                      <td className="num">{(s!.line.offSnaps ?? 0) + (s!.line.defSnaps ?? 0)}{s!.line.stSnaps ? ` + ${s!.line.stSnaps} ST` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {log.length > 0 && (
          <section className="stack">
            <h3>Game log</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Game</th><th>Opp</th><th className="num">Result</th><th>Line</th></tr></thead>
                <tbody>
                  {log.map((row) => {
                    const r = game.results[row.gameId];
                    const ours = row.home ? r.homeScore : r.awayScore;
                    const theirs = row.home ? r.awayScore : r.homeScore;
                    const g = GAME_BY_ID[row.gameId];
                    return (
                      <tr key={row.gameId} className="clickable" onClick={() => ui.openBox(row.gameId)}>
                        <td>{g.type === "REG" ? `Wk ${g.week}` : gameTypeLabel(g)} <span className="muted">{shortDate(g.date)}</span></td>
                        <td>{row.home ? "vs" : "@"} {row.opp}</td>
                        <td className={`num ${ours > theirs ? "good" : ours < theirs ? "bad" : ""}`}>{ours > theirs ? "W" : ours < theirs ? "L" : "T"} {ours}-{theirs}</td>
                        <td>{gameLine(p.position, unpack(row.values))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="stack">
          <h3>Contract</h3>
          {deal ? (
            <>
              <ContractTable deal={deal} from={original ? undefined : leagueYear(game.date)} />
              <span className="muted">
                {dealSummary(deal)}.{original ? ` ${CONTRACT_SOURCE[p.contract.source]}` : ` Signed ${shortDate(deal.signed)}.`}
              </span>
            </>
          ) : <p className="muted">No contract: free agent.</p>}
          {(mine && deal || (state.status === "fa" || isOffseason(game.date) && talksFor(game, game.userTeam, id).ok)) && (() => {
            const talking = game.negotiations[id]?.status === "open";
            const elig = talksFor(game, game.userTeam, id);
            if (!talking && !elig.ok) return <span className="muted">{elig.reason}</span>;
            return <div><button className="btn" onClick={() => ui.openTalks(id)}>{talking ? "Go to contract talks" : "Contract talks"}</button></div>;
          })()}
          {mine && restructurePreview(game, id) && (() => {
            const r = restructurePreview(game, id)!;
            return (
              <div className="confirm">
                <strong>Restructure</strong>
                <span>
                  Turn {money(r.amount)} of this year's salary into a signing bonus spread over the deal's remaining years.
                  It saves {money(r.savings)} of {year} cap space now and pushes that money onto later caps. The player gets the cash now.
                </span>
                <div className="btn-row">
                  <button className="btn" onClick={() => {
                    const saved = restructure(game, id);
                    game.inbox.unshift({
                      id: `${game.date}-rs-${id}`, date: game.date, kind: "transaction", from: "General Manager",
                      title: `${p.name} restructured`,
                      body: `We converted ${money(r.amount)} of ${p.name}'s salary into a bonus. That clears ${money(saved)} of ${year} cap space and adds it to the later years of the deal.`,
                      read: true,
                    });
                    changed();
                  }}>Restructure</button>
                </div>
              </div>
            );
          })()}
          {mine && (() => {
            const pc = payCutInfo(game, game.userTeam, id);
            if (!pc.ok) return null;
            const ask = game.league?.payCuts?.[id];
            const countered = ask && ask.team === game.userTeam && ask.year === pc.year && ask.answer === "countered" ? ask.counter : undefined;
            const value = cutTo ?? Math.round((pc.least + (pc.base - pc.least) * 0.5) / 50_000) * 50_000;
            return (
              <div className="confirm">
                <strong>Ask for a pay cut</strong>
                <span>
                  {p.name}'s {pc.year} base salary is {money(pc.base)}{pc.guaranteed ? `, ${money(pc.guaranteed)} of it guaranteed` : ""}.
                  {" "}He'll compare the number with what he thinks the market would pay him. Asking costs some goodwill whatever the answer.
                </span>
                <label className="field">New {pc.year} base salary ($M)
                  <input type="number" step={0.05} min={pc.least / 1e6} max={pc.base / 1e6} value={value / 1e6} onChange={(e) => setCutTo(Math.round(Number(e.target.value) * 1e6))} />
                </label>
                <div className="btn-row">
                  <button className="btn" onClick={() => { setCutReply(askPayCut(game, game.userTeam, id, value).text); changed(); }}>Ask</button>
                  {countered && <button className="btn primary" onClick={() => { setCutReply(acceptCounter(game, game.userTeam, id).text); changed(); }}>Agree to {money(countered)}</button>}
                </div>
                {cutReply && <span>{cutReply}</span>}
              </div>
            );
          })()}
          {mine && cutReply && !payCutInfo(game, game.userTeam, id).ok && <span>{cutReply}</span>}
        </section>

        {state.team && state.status !== "ps" && (
          <section className="stack">
            <h3>Trade</h3>
            {(() => {
              const ok = canTradePlayer(game, id, mine ? undefined : game.userTeam);
              if (!ok.ok) return <span className="muted">{ok.reason}</span>;
              return (
                <div className="btn-row">
                  <button className="btn" onClick={() => ui.openTrade(id)}>{mine ? "Shop him in a trade" : "Trade for him"}</button>
                  {hasNoTradeClause(id) && <span className="muted">No-trade clause: he has to agree to any deal.</span>}
                  {trades(game).requests[id] && <span className="bad">Has asked for a trade.</span>}
                </div>
              );
            })()}
          </section>
        )}

        <section className="stack">
          <h3>Career stats</h3>
          {seasons.length === 0 && <p className="muted">{p.yearsExp === 0 ? "Rookie: no NFL stats yet." : "No regular-season stats on record."}</p>}
          {seasons.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Season</th><th>Team</th><th className="num">G</th><th>Line</th><th className="num">Snaps</th></tr></thead>
                <tbody>
                  {seasons.map((season) => {
                    const s = mergeSeason(p.stats.filter((x) => x.season === season))!;
                    const snaps = p.snaps[String(season)];
                    const share = snaps ? Math.max(snaps.offShare, snaps.defShare) : 0;
                    return (
                      <tr key={season}>
                        <td>{season}</td><td>{s.team}</td><td className="num">{snaps?.games ?? s.g ?? ""}</td>
                        <td>{statLine(p.position, s, snaps)}</td>
                        <td className="num">{snaps ? `${Math.max(snaps.offense, snaps.defense) || snaps.st}${share ? ` (${Math.round(share * 100)}%)` : ""}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <span className="muted">Real NFL regular-season stats through 2025, then the seasons simulated in this save. Snap share is of the team's snaps across the season.</span>
        </section>

        {mine && state.status !== "ps" && state.status !== "ir" && (
          <section className="stack">
            <h3>Release</h3>
            {!confirming && (
              <div className="btn-row">
                <button className="btn danger" onClick={() => setConfirming("now")}>Release {p.name}</button>
                {canJune1(game, game.userTeam, id).ok && <button className="btn" onClick={() => setConfirming("june1")}>Release with a post-June 1 designation ({june1Left(game, game.userTeam)} left)</button>}
              </div>
            )}
            {confirming === "june1" && (() => {
              const pv = june1Preview(game, id);
              return (
                <div className="confirm">
                  <strong>Release {p.name} as a post-June 1 cut?</strong>
                  <span>
                    He leaves now, but his full {money(pv.now)} cap charge stays on the {year} books until June 2. After that {money(pv.dead)} stays as {year} dead money
                    {pv.deadNext ? ` and ${money(pv.deadNext)} moves to ${year + 1}` : ""}, saving {money(Math.max(0, pv.savingsAfter))} for the rest of {year}.
                    A normal release would put {money(cost.deadThisYear)} on {year} right away. Teams get two of these a year. This can't be undone.
                  </span>
                  <div className="btn-row">
                    <button className="btn danger" onClick={releaseLater}>Release after June 1</button>
                    <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                  </div>
                </div>
              );
            })()}
            {confirming === "now" && (
              <div className="confirm">
                <strong>Release {p.name}?</strong>
                <span>
                  Dead money: {money(cost.deadThisYear)} on the {year} cap{cost.deadNextYear ? ` and ${money(cost.deadNextYear)} on ${year + 1}` : ""}.
                  {" "}{cost.savingsThisYear >= 0 ? `Saves ${money(cost.savingsThisYear)}` : `Costs ${money(-cost.savingsThisYear)} more`} in {year} cap space. This can't be undone.
                </span>
                <div className="btn-row">
                  <button className="btn danger" onClick={release}>Release</button>
                  <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
