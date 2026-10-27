import { useEffect, useState } from "react";
import { releaseCost } from "../engine/cap";
import { ageOn, longDate } from "../engine/dates";
import { PLAYER_BY_ID, SEASON, TEAM_BY_ID } from "../engine/league";
import { releasePlayer } from "../engine/roster";
import type { GameState } from "../engine/types";
import { draftLine, height, mergeSeason, money, statLine } from "./format";

const CONTRACT_SOURCE = {
  overthecap: "Year-by-year figures from OverTheCap.",
  "estimated-from-apy": "Cap hits estimated from the contract's average per year.",
  "estimated-minimum": "No contract on record; estimated at the league minimum.",
};

export function PlayerPanel({ game, id, onClose, changed }: { game: GameState; id: string; onClose: () => void; changed: () => void }) {
  const p = PLAYER_BY_ID[id];
  const state = game.players[id];
  const [confirming, setConfirming] = useState(false);
  const cost = releaseCost(id);
  const seasons = [...new Set(p.stats.map((s) => s.season))].sort((a, b) => b - a);
  const mine = state.team === game.userTeam;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function release() {
    releasePlayer(game, id);
    if (game.cutPlan) game.cutPlan = game.cutPlan.filter((x) => x !== id);
    game.inbox.unshift({
      id: `${game.date}-rel-${id}`, date: game.date, kind: "transaction", from: "General Manager",
      title: `${p.name} released`,
      body: `We released ${p.name}. ${money(cost.deadThisYear)} stays on this year's cap as dead money` +
        (cost.deadNextYear ? ` and ${money(cost.deadNextYear)} moves to next year.` : "."),
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
            <span className="muted">{p.position} · {state.team ? `${TEAM_BY_ID[state.team].city} ${TEAM_BY_ID[state.team].name}` : "Free agent"}{state.status === "ps" ? " (practice squad)" : ""}</span>
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

        <section className="stack">
          <h3>Contract</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Year</th><th className="num">Base</th><th className="num">Bonus (prorated)</th><th className="num">Other</th><th className="num">Guaranteed</th><th className="num">Cap hit</th></tr></thead>
              <tbody>
                {p.contract.seasons.map((s) => (
                  <tr key={s.year}>
                    <td>{s.year}</td>
                    <td className="num">{money(s.baseSalary)}</td>
                    <td className="num">{money(s.proratedBonus)}</td>
                    <td className="num">{money(s.rosterBonus + s.workoutBonus + s.optionBonus + s.otherBonus)}</td>
                    <td className="num">{money(s.guaranteedSalary)}</td>
                    <td className="num"><strong>{s.capHit ? money(s.capHit) : "Void year"}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted">
            {p.contract.signedYear ? `Signed ${p.contract.signedYear}` : ""}{p.contract.type ? ` · ${p.contract.type}` : ""}
            {p.contract.apy ? ` · ${money(p.contract.apy)} per year` : ""}. {CONTRACT_SOURCE[p.contract.source]}
          </span>
        </section>

        <section className="stack">
          <h3>Career stats</h3>
          {seasons.length === 0 && <p className="muted">{p.yearsExp === 0 ? "Rookie: no NFL stats yet." : "No regular-season stats in 2023-25."}</p>}
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
          <span className="muted">Snap share is of the team's snaps across the season. 2026 game stats arrive with the next update.</span>
        </section>

        {mine && state.status !== "ps" && (
          <section className="stack">
            <h3>Release</h3>
            {!confirming && <div><button className="btn danger" onClick={() => setConfirming(true)}>Release {p.name}</button></div>}
            {confirming && (
              <div className="confirm">
                <strong>Release {p.name}?</strong>
                <span>
                  Dead money: {money(cost.deadThisYear)} on the {SEASON} cap{cost.deadNextYear ? ` and ${money(cost.deadNextYear)} on ${SEASON + 1}` : ""}.
                  {" "}{cost.savingsThisYear >= 0 ? `Saves ${money(cost.savingsThisYear)}` : `Costs ${money(-cost.savingsThisYear)} more`} in {SEASON} cap space. This can't be undone.
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
