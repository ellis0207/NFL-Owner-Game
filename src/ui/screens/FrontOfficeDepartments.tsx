import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { cyberRisk, departments, DEPTS, deptYearCost, replaceSystem, setDeptBudget, setDeptPolicy, SYSTEMS } from "../../engine/departments";
import { execRole } from "../../engine/executives";
import { RULES } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { money } from "../format";

const LEVELS = ["Lean", "Standard", "Strong", "Best in the league"];
const METRIC: Record<string, string> = {
  trips: "Trips", onTime: "On time (%)", costPerTrip: "Cost per trip", incidents: "Incidents", drills: "Drills", audits: "Credential audits",
  availability: "Systems up (%)", patched: "Patched (%)", accessReviews: "Access reviews", restoreTests: "Restore tests",
};

export function Departments({ game, changed }: { game: GameState; changed: () => void }) {
  const d = departments(game);
  const [msg, setMsg] = useState<string | null>(null);
  const cost = deptYearCost(game);
  const act = (fn: () => string | null | void, ok?: string) => { const r = fn(); setMsg(r ?? ok ?? null); changed(); };
  const trip = d.trips[0];
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <p className="muted">Support departments. The standard level is what the business budget already pays for; more costs money and makes trouble rarer and smaller.</p>
      <div className="split">
        {(Object.keys(DEPTS) as (keyof typeof DEPTS)[]).map((k) => {
          const def = DEPTS[k];
          const x = d[k];
          const boss = execRole(game, def.reports);
          const m = x.metrics[0];
          const extra = k === "it" ? cost.technology : k === "security" ? cost.security : cost.travel;
          return (
            <div key={k} className="panel stack tight">
              <h3>{def.label}</h3>
              <span className="muted">{x.director} (made up), {def.title.toLowerCase()}, reports to {boss ? `${boss.name}` : "an open executive job"}.</span>
              <label className="stack tight">
                <span className="label">Budget</span>
                <select value={x.budget} onChange={(e) => act(() => setDeptBudget(game, k, Number(e.target.value) as 0 | 1 | 2 | 3))}>
                  {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                </select>
              </label>
              {Object.entries(def.policies).map(([p, pd]) => (
                <label key={p} className="stack tight">
                  <span className="label">{pd.label}</span>
                  <select value={x.policy[p]} onChange={(e) => act(() => setDeptPolicy(game, k, p, e.target.value))}>
                    {Object.entries(pd.options).map(([o, l]) => <option key={o} value={o}>{l}</option>)}
                  </select>
                </label>
              ))}
              <span className="muted">{extra ? `${extra > 0 ? "Costs" : "Saves"} ${money(Math.abs(extra))} a year against the budget.` : "Inside the budget."}</span>
              {m && <span className="muted">{m.quarter}: {Object.entries(m.values).map(([n, v]) => `${METRIC[n] ?? n} ${n === "costPerTrip" ? money(v) : v}`).join(", ")}</span>}
            </div>
          );
        })}
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Core systems</h3>
          <table>
            <thead><tr><th>System</th><th className="num">In since</th><th className="num">Life</th><th></th></tr></thead>
            <tbody>
              {Object.entries(SYSTEMS).map(([k, sys]) => {
                const st = d.systems[k];
                const old = RULES.season - st.since > sys.life;
                return (
                  <tr key={k}>
                    <td>{sys.label}</td>
                    <td className={`num ${old ? "bad" : ""}`}>{st.since}</td>
                    <td className="num">{sys.life} yrs</td>
                    <td>{st.until && st.until > game.date ? <span className="muted">Migrating until {shortDate(st.until)}</span> : <button className="btn small" onClick={() => act(() => replaceSystem(game, k), "The migration has started.")}>Replace ({money(sys.cost)})</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <span className="muted">Chance of a serious attack this quarter, by the staff's estimate: about {Math.round(cyberRisk(game) * 1000) / 10}%.</span>
        </div>
        <div className="panel stack tight">
          <h3>Last road trip</h3>
          {trip ? (
            <dl className="kv">
              <dt>Where</dt><dd>{trip.where}, {shortDate(trip.date)} ({trip.miles.toLocaleString()} miles, {trip.people} people on the manifest)</dd>
              <dt>Costs</dt><dd>Charter {money(trip.costs.charter)}, hotel {money(trip.costs.hotel)}, buses {money(trip.costs.ground)}, meals {money(trip.costs.meals)}, equipment {money(trip.costs.equipment)}, security {money(trip.costs.security)}</dd>
              {trip.note && <><dt>Notes</dt><dd>{trip.note}</dd></>}
            </dl>
          ) : <span className="muted">The first report comes after the first road game.</span>}
          <span className="label">Incidents</span>
          {d.incidents.length ? <ul>{d.incidents.slice(0, 8).map((x, i) => <li key={i}>{shortDate(x.date)} {x.date.slice(0, 4)}: {x.text}{x.cost ? ` (${money(x.cost)})` : ""}</li>)}</ul> : <span className="muted">None so far.</span>}
        </div>
      </div>
    </div>
  );
}
