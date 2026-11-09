import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { STADIUM_BY_TEAM } from "../../engine/stadiums";
import {
  ALCOHOL_LABEL, benchmark, BENCHMARK, buildBackups, DEFAULT_PLAN, EXPERIMENTS, LEVEL, MENU_LABEL, planCost, setPlan, SHOW_LABEL, startExperiment, TRANSIT_LABEL, venue,
} from "../../engine/venue";
import type { GameState, VenuePlan, VenueStaffing } from "../../engine/types";
import { money } from "../format";

function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label className="stack tight">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </label>
  );
}
const LEVELS = Object.fromEntries(LEVEL.map((l, i) => [String(i), l])) as Record<string, string>;

export function GameDay({ game, changed }: { game: GameState; changed: () => void }) {
  const v = venue(game);
  const p = v.plan;
  const cost = planCost(p);
  const extra = cost.labor + cost.security + cost.show + cost.other;
  const [msg, setMsg] = useState<string | null>(null);
  const [exp, setExp] = useState(Object.keys(EXPERIMENTS)[0]);
  const r = v.reports[0];
  const bm = benchmark(game);
  const s = STADIUM_BY_TEAM[game.userTeam];
  const set = (x: Partial<VenuePlan>) => { setPlan(game, x); changed(); };
  const level = (k: "staffing" | "security" | "medics", label: string) => (
    <Pick label={label} value={String(p[k])} options={LEVELS} onChange={(x) => set({ [k]: Number(x) as VenueStaffing })} />
  );
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Game-day plan</h3>
          <p className="muted">The stadium operations staff run every home game at {s.name}; these are the standing orders.</p>
          {level("staffing", "Ushers, gate and concession staff, cleaning crews")}
          {level("security", "Security")}
          {level("medics", "Medical crews")}
          <Pick label="Alcohol" value={p.alcohol} options={ALCOHOL_LABEL} onChange={(x) => set({ alcohol: x })} />
          <Pick label="Game presentation" value={p.show} options={SHOW_LABEL} onChange={(x) => set({ show: x })} />
          <Pick label="Menu" value={p.menu} options={MENU_LABEL} onChange={(x) => set({ menu: x })} />
          <Pick label="Getting there" value={p.transit} options={TRANSIT_LABEL} onChange={(x) => set({ transit: x })} />
          <label className="btn-row"><input type="checkbox" checked={p.weather} onChange={(e) => set({ weather: e.target.checked })} /> Severe weather plan: shelter areas, staff drills, a lightning protocol (about $20K a game)</label>
          <div className="btn-row">
            <button disabled={!!v.backupsBuilt} onClick={() => { setMsg(buildBackups(game) ?? "The backup power, networking and radios are in."); changed(); }}>
              {v.backupsBuilt ? `Backups installed ${shortDate(v.backupsBuilt)}` : "Install backup power, networking and radios ($3M)"}
            </button>
            {JSON.stringify(p) !== JSON.stringify({ ...DEFAULT_PLAN, backups: p.backups }) && <button onClick={() => set({ ...DEFAULT_PLAN, backups: p.backups })}>Back to standard</button>}
          </div>
          <span className="muted">{extra ? `${extra > 0 ? "Costs" : "Saves"} ${money(Math.abs(extra))} a home game against the game-day budget.` : "Inside the game-day budget."}</span>
        </div>
        <div className="panel stack tight">
          <h3>Against the league</h3>
          {bm ? (
            <table>
              <thead><tr><th></th><th className="num">Us</th><th className="num">League</th></tr></thead>
              <tbody>
                {([
                  ["Parking to seat (min)", bm.ours.arrival, BENCHMARK.arrival, true],
                  ["Worst gate line (min)", bm.ours.gateWait, BENCHMARK.gateWait, true],
                  ["Concession line (min)", bm.ours.foodWait, BENCHMARK.foodWait, true],
                  ["Restroom line (min)", bm.ours.restroomWait, BENCHMARK.restroomWait, true],
                  ["Complaints per 1,000 fans", bm.ours.complaints, BENCHMARK.complaints, true],
                  ["Food spend per fan", bm.ours.perCapFood, BENCHMARK.perCapFood, false],
                  ["Merchandise spend per fan", bm.ours.perCapMerch, BENCHMARK.perCapMerch, false],
                ] as [string, number, number, boolean][]).map(([l, us, lg, low]) => (
                  <tr key={l}><td>{l}</td><td className={`num ${(low ? us > lg * 1.1 : us < lg * 0.9) ? "bad" : ""}`}>{l.includes("spend") ? `$${us}` : us}</td><td className="num muted">{l.includes("spend") ? `$${lg}` : lg}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <span className="muted">Numbers come after the first home game.</span>}
          <span className="label">Try something</span>
          {v.experiment && !v.experiment.done ? (
            <span>Running: {v.experiment.label.toLowerCase()} ({v.experiment.games} of 3 games).</span>
          ) : (
            <div className="btn-row">
              <select value={exp} onChange={(e) => setExp(e.target.value)} aria-label="Experiment">
                {Object.entries(EXPERIMENTS).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
              </select>
              <button onClick={() => { setMsg(startExperiment(game, exp) ?? "Started; results after three home games."); changed(); }}>Start</button>
            </div>
          )}
          {v.experiments.length > 0 && (
            <ul>{v.experiments.slice(0, 5).map((e, i) => <li key={i}>{e.label}: survey {e.before.toFixed(1)} to {e.after.toFixed(1)} <span className="muted">({shortDate(e.date)})</span></li>)}</ul>
          )}
        </div>
      </div>
      {r ? (
        <div className="split">
          <div className="panel stack tight">
            <h3>Last home game, {shortDate(r.date)}</h3>
            <dl className="kv">
              <dt>Crowd</dt><dd>{r.attendance.toLocaleString()} in the building, {r.distributed.toLocaleString()} tickets out ({r.sold.toLocaleString()} sold)</dd>
              <dt>Lines</dt><dd>{r.arrival} min parking to seat; gates {r.gateWait}, food {r.foodWait}, restrooms {r.restroomWait} at the worst</dd>
              <dt>Spend per fan</dt><dd>${r.perCap.food} food and drink, ${r.perCap.merch} merchandise, ${r.perCap.parking} parking</dd>
              <dt>Food</dt><dd>{r.foodShort ? `${money(r.foodShort)} of sales lost to stands running out` : "Nobody ran out"}{r.foodWaste ? `; ${money(r.foodWaste)} thrown away` : ""}</dd>
              {r.merchShort > 0 && <><dt>Store</dt><dd>{money(r.merchShort)} of jersey sales lost to empty shelves</dd></>}
              {r.delay && <><dt>Delay</dt><dd>{r.delay} minutes for lightning</dd></>}
              {r.inspection && <><dt>Inspection</dt><dd>{r.inspection}</dd></>}
              {r.experiment && <><dt>Experiment</dt><dd>{r.experiment}</dd></>}
            </dl>
            {[...r.faults, ...r.incidents].length > 0 && <ul>{[...r.faults, ...r.incidents].map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </div>
          <div className="panel stack tight">
            <h3>The event's books</h3>
            <dl className="kv">
              <dt>Revenue</dt><dd>{money(r.revenue)}</dd>
              <dt>Staff</dt><dd>{money(r.costs.labor)}</dd>
              <dt>Security</dt><dd>{money(r.costs.security)}</dd>
              <dt>Presentation</dt><dd>{money(r.costs.show)}</dd>
              <dt>Other</dt><dd>{money(r.costs.other)}</dd>
              <dt>After the visitors' share</dt><dd className={r.profit < 0 ? "bad" : undefined}>{money(r.profit)}</dd>
            </dl>
            <span className="label">Complaints</span>
            <span>{Object.entries(r.complaints).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ") || "None worth noting"}</span>
            {v.flags.length > 0 && <span className="muted">Recurring: {v.flags.slice(0, 3).map((f) => `${f.cat} (${shortDate(f.date)})`).join(", ")}</span>}
            {v.investigations.length > 0 && (
              <>
                <span className="label">Reviews</span>
                <ul>{v.investigations.slice(0, 3).map((x, i) => <li key={i}>{shortDate(x.date)}: {x.text}. {x.finding}</li>)}</ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
