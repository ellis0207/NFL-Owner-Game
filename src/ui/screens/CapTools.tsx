// The cap tools beside the cap summary: the five-year planner with trial
// contracts, the compensatory pick forecast, open option bonuses and the
// analysts' cap optimizer.
import { useState } from "react";
import { capOptimizer, capEfficiency } from "../../engine/analysts";
import { capPlanner, compForecast, decideOption, openOptions, type PlanDeal } from "../../engine/contractextras";
import { leagueYear } from "../../engine/contracts";
import { PLAYER_BY_ID } from "../../engine/league";
import { shortDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function CapTools({ game, changed }: { game: GameState; changed: () => void }) {
  const [trial, setTrial] = useState<PlanDeal[]>([]);
  const [form, setForm] = useState({ label: "Trial deal", years: 4, apy: 20, bonus: 20, cut: "" });
  const [said, setSaid] = useState<string | null>(null);
  const year = leagueYear(game.date);
  const plan = capPlanner(game, game.userTeam, trial);
  const comp = compForecast(game);
  const options = openOptions(game);
  const opt = (game.analytics?.level ?? 0) > 0 ? capOptimizer(game) : [];
  const eff = (game.analytics?.level ?? 0) > 0 ? capEfficiency(game) : [];

  function add() {
    const total = Math.round(form.apy * 1e6 * form.years);
    const terms = { years: form.years, total, signingBonus: Math.round(form.bonus * 1e6), guaranteed: Math.round(form.bonus * 1e6), injuryGuaranteed: 0, voidYears: 0, shape: "flat" as const };
    setTrial([...trial, { label: form.label, terms, firstYear: year, cutAfter: form.cut ? Number(form.cut) : undefined }]);
  }

  return (
    <div className="stack">
      <h3>Cap planner</h3>
      <p className="muted">The next five league years with what's on the books, dead money already owed, and any trial deals you add. A trial cut after a year moves its remaining bonus proration onto the next year as dead money.</p>
      <div className="row wrap">
        <label>Name <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
        <label>Years <input type="number" min={1} max={6} value={form.years} onChange={(e) => setForm({ ...form, years: Number(e.target.value) })} /></label>
        <label>Per year ($M) <input type="number" min={1} value={form.apy} onChange={(e) => setForm({ ...form, apy: Number(e.target.value) })} /></label>
        <label>Signing bonus ($M) <input type="number" min={0} value={form.bonus} onChange={(e) => setForm({ ...form, bonus: Number(e.target.value) })} /></label>
        <label>Cut after <input placeholder="year" value={form.cut} onChange={(e) => setForm({ ...form, cut: e.target.value })} /></label>
        <button onClick={add}>Add trial deal</button>
        {trial.length > 0 && <button onClick={() => setTrial([])}>Clear trials</button>}
      </div>
      {trial.length > 0 && <span className="muted">Trials: {trial.map((t) => `${t.label} (${t.terms.years} yrs, ${money(t.terms.total)}${t.cutAfter ? `, cut after ${t.cutAfter}` : ""})`).join("; ")}</span>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Year</th><th className="num">Cap</th><th className="num">Committed</th><th className="num">Dead</th><th className="num">Trials</th><th className="num">Space</th></tr></thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.year}>
                <td>{p.year}</td><td className="num">{money(p.cap)}</td><td className="num">{money(p.committed)}</td><td className="num">{money(p.dead)}</td>
                <td className="num">{p.added ? money(p.added) : "-"}</td><td className={`num ${p.space < 0 ? "bad" : "good"}`}>{money(p.space)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {options.length > 0 && (
        <>
          <h3>Option bonuses</h3>
          {said && <p className="notice">{said}</p>}
          {options.map((o) => (
            <div className="row" key={o.id}>
              <span>{PLAYER_BY_ID[o.id].name}: {money(o.amount)} due by {shortDate(o.by)} for {o.year} on.</span>
              <button onClick={() => { setSaid(decideOption(game, o.id, true) ?? "Exercised."); changed(); }}>Exercise</button>
              <button onClick={() => { setSaid(decideOption(game, o.id, false) ?? "Declined; he is a free agent."); changed(); }}>Decline</button>
            </div>
          ))}
        </>
      )}

      {comp && (
        <>
          <h3>Compensatory picks for {comp.draftYear}</h3>
          <p className="muted">The league's formula, as it stands: free agents lost and signed by contract value, adjusted for playing time and honors. Only the net losses earn picks, and they are given out after the season.</p>
          <div className="split">
            <div>
              <strong>Lost</strong>
              <ul>{comp.lost.map((l) => <li key={l.player}>{PLAYER_BY_ID[l.player]?.name ?? l.player} to {l.to}, {money(l.apy)} a year (round {l.round} value)</li>)}{!comp.lost.length && <li className="muted">None</li>}</ul>
            </div>
            <div>
              <strong>Signed</strong>
              <ul>{comp.gained.map((l) => <li key={l.player}>{PLAYER_BY_ID[l.player]?.name ?? l.player} from {l.from}, {money(l.apy)} a year (round {l.round} value)</li>)}{!comp.gained.length && <li className="muted">None</li>}</ul>
            </div>
          </div>
          <span>Projected: {comp.picks.length ? comp.picks.map((p) => `round ${p.round} for ${PLAYER_BY_ID[p.player]?.name ?? p.player}`).join(", ") : "no compensatory picks"}.</span>
        </>
      )}

      {opt.length > 0 && (
        <>
          <h3>Cap optimizer</h3>
          <p className="muted">The analysts' list of the moves that free the most room this year, and what each costs later. Restructures and releases are made from the player's page.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Move</th><th className="num">Saves {year}</th><th className="num">Costs later</th></tr></thead>
              <tbody>{opt.map((o) => <tr key={o.id + o.move}><td className="name">{PLAYER_BY_ID[o.id].name}</td><td>{o.move}</td><td className="num">{money(o.saves)}</td><td className="num">{money(o.later)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {eff.length > 0 && (
        <>
          <h4>Paid most above production</h4>
          <ul>{eff.map((e) => <li key={e.id}>{PLAYER_BY_ID[e.id].name}: {money(e.hit)} cap hit, production worth about {money(e.worth)}</li>)}</ul>
        </>
      )}
    </div>
  );
}
