import { useState } from "react";
import { billions } from "../../engine/business";
import { shortDate } from "../../engine/dates";
import { RULES } from "../../engine/league";
import {
  BACKGROUNDS, COACH_TARGETS, GOAL_KEYS, GOALS, owner, ownerEquity, ownerReturn, scorecard, scoreWord, setCoachTarget, setPatience,
  setWeights, SPENDING, STYLES, takeSuggestion,
} from "../../engine/ownership";
import type { GameState, OwnerGoal } from "../../engine/types";
import { OwnerStanding } from "./OwnerStanding";
import { OwnerMoney } from "./OwnerMoney";
import { concentrationWord, netWorth } from "../../engine/wealth";
import { ownerShare } from "../../engine/investors";
import { money } from "../format";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function OwnerScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const o = owner(game);
  const card = scorecard(game);
  const ret = ownerReturn(game);
  const nw = netWorth(game);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "money" | "standing">("overview");
  const target = o.coachTarget?.season === RULES.season ? o.coachTarget.goal : "none";
  const weight = (g: OwnerGoal, v: number) => { setWeights(game, { ...o.weights, [g]: v }); changed(); };
  return (
    <section className="stack">
      <h2>Owner's office</h2>
      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
        <button aria-pressed={tab === "money"} onClick={() => setTab("money")}>Money</button>
        <button aria-pressed={tab === "standing"} onClick={() => setTab("standing")}>Standing</button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {tab === "overview" && o.suggestion && (
        <div className="panel stack tight">
          <h3>Rethinking your priorities</h3>
          <span>{o.suggestion.why}</span>
          <span className="muted">Suggested: {GOAL_KEYS.filter((g) => o.suggestion!.weights[g]).map((g) => `${GOALS[g].label.toLowerCase()} ${o.suggestion!.weights[g]}`).join(", ")}.</span>
          <div className="btn-row">
            <button className="btn small primary" onClick={() => { takeSuggestion(game, true); changed(); }}>Take it</button>
            <button className="btn small" onClick={() => { takeSuggestion(game, false); changed(); }}>Keep mine</button>
          </div>
        </div>
      )}
      {tab === "overview" && <div className="split">
        <div className="panel stack tight">
          <h3>{RULES.season} scorecard so far</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {GOAL_KEYS.map((g) => (
                  <tr key={g}>
                    <td title={GOALS[g].what}>{GOALS[g].label}</td>
                    <td className="num">{card.scores[g]}</td>
                    <td className="muted">{scoreWord(card.scores[g])}</td>
                    <td className="muted">weight {o.weights[g]}</td>
                  </tr>
                ))}
                <tr><td><strong>By your priorities</strong></td><td className="num"><strong>{card.overall}</strong></td><td><strong>{scoreWord(card.overall)}</strong></td><td /></tr>
              </tbody>
            </table>
          </div>
          <span className="muted">Every season is scored on all six, whatever your weights: a club can make money and lose, or win and lose money. Scores run 0 to 100; 50 is an ordinary year.</span>
        </div>
        <div className="panel stack tight">
          <h3>Your stake</h3>
          <dl className="kv">
            <dt>Bought</dt><dd>{shortDate(o.since)} {o.since.slice(0, 4)} at {billions(o.purchase)}</dd>
            {ownerShare(game) < 1 && <><dt>Your share of the club</dt><dd>{pct(ownerShare(game))} <span className="muted">(Ownership page)</span></dd></>}
            <dt>Your equity now</dt><dd>{billions(ownerEquity(game))}</dd>
            <dt>Put in since</dt><dd>{money(o.putIn)}</dd>
            <dt>Taken out</dt><dd>{money(o.takenOut)}</dd>
            <dt>Return a year</dt>{ret.years < 0.75 ? <dd className="muted">Too early to say</dd> : <dd className={ret.annual >= ret.benchmark ? "good" : "bad"}>{pct(ret.annual)} <span className="muted">against about {pct(ret.benchmark)} in the stock market</span></dd>}
            <dt>Club debt to value</dt><dd>{pct(ret.leverage)}</dd>
          </dl>
          <span className="muted">The return counts what the stake is worth, what you took out and what you put in. Borrowing raises it in good years and lowers it in bad ones.</span>
        </div>
      </div>}
      {tab === "overview" && <div className="split">
        <div className="panel stack tight">
          <h3>Who you are</h3>
          <dl className="kv">
            <dt>Background</dt><dd>{BACKGROUNDS[o.background].label}</dd>
            <dt>Style</dt><dd>{STYLES[o.style]}</dd>
            <dt>Spending</dt><dd>{SPENDING[o.spending]}</dd>
          </dl>
          <span className="muted">{BACKGROUNDS[o.background].what}</span>
          <label className="field"><span className="label">Patience for a rebuild</span>
            <select value={o.patience} onChange={(e) => { setPatience(game, Number(e.target.value)); changed(); }}>
              {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y} season{y > 1 ? "s" : ""}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">This season's target for the head coach</span>
            <select value={target} onChange={(e) => { setMsg(setCoachTarget(game, e.target.value as keyof typeof COACH_TARGETS)); changed(); }}>
              {Object.entries(COACH_TARGETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="panel stack tight">
          <h3>Your wealth</h3>
          <dl className="kv">
            <dt>Net worth</dt><dd>{billions(nw.total)}</dd>
            <dt>In the team</dt><dd>{Math.round(nw.concentration * 100)}%</dd>
          </dl>
          <span className="muted">{concentrationWord(nw.concentration)}. Your holdings, family arrangements, foundation and public profile are on the Money tab.</span>
        </div>
      </div>}
      {tab === "overview" && <>
      <div className="panel stack tight">
        <h3>Your priorities</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              {GOAL_KEYS.map((g) => (
                <tr key={g}>
                  <td><strong>{GOALS[g].label}</strong><br /><span className="muted">{GOALS[g].what}</span></td>
                  <td>
                    <div className="tabs" role="group" aria-label={GOALS[g].label}>
                      {[0, 1, 2, 3, 4, 5].map((v) => <button key={v} aria-pressed={o.weights[g] === v} onClick={() => weight(g, v)}>{v}</button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {o.legacy.length > 0 && (
        <div className="panel stack tight">
          <h3>Your record as owner</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Season</th><th>Record</th><th>Playoffs</th><th className="num">Revenue</th><th className="num">Operating</th><th className="num">Value</th>{GOAL_KEYS.map((g) => <th key={g} className="num" title={GOALS[g].label}>{GOALS[g].label.split(" ").slice(-1)[0]}</th>)}<th className="num">Overall</th><th>Coach's target</th></tr></thead>
              <tbody>
                {o.legacy.slice().reverse().map((r) => (
                  <tr key={r.season}>
                    <td>{r.season}</td><td>{r.record}</td><td>{r.playoffs ? { WC: "Wild card", DIV: "Divisional", CONF: "Conference title game", SB: "Lost the Super Bowl", CHAMP: "Won the Super Bowl" }[r.playoffs] ?? r.playoffs : ""}</td>
                    <td className="num">{money(r.revenue)}</td><td className="num">{money(r.operating)}</td><td className="num">{billions(r.value)}</td>
                    {GOAL_KEYS.map((g) => <td key={g} className="num">{r.scores[g]}</td>)}
                    <td className="num"><strong>{r.overall}</strong></td>
                    <td>{r.coachTarget ? `${r.coachTarget.goal}: ${r.coachTarget.met ? "met" : "missed"}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {o.log.length > 0 && (
        <div className="panel stack tight">
          <h3>Notes</h3>
          {o.log.slice(0, 12).map((l, i) => <span key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.text}</span>)}
        </div>
      )}
      </>}
      {tab === "money" && <OwnerMoney game={game} say={(m) => { setMsg(m); changed(); }} />}
      {tab === "standing" && <OwnerStanding game={game} changed={changed} />}
    </section>
  );
}
