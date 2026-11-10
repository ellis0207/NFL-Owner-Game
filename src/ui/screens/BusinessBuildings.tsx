import { useState } from "react";
import { shortDate } from "../../engine/dates";
import {
  backlog, commissionStudy, complexCondition, facilities, maintainsStadium, partDefs, PLAN_LABEL, readOf, replacePart, setPlan, stadiumCondition, stadiumValue, switchSurface, word,
} from "../../engine/facilities";
import { leagueYear } from "../../engine/contracts";
import { inflation } from "../../engine/business";
import { leaseSummary } from "../../engine/leases";
import { controlOf, STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../../engine/stadiums";
import type { FacilitiesState, GameState } from "../../engine/types";
import { money } from "../format";

export function Buildings({ game, changed }: { game: GameState; changed: () => void }) {
  const f = facilities(game);
  const us = game.userTeam;
  const s = STADIUM_BY_TEAM[us];
  const defs = partDefs(us);
  const year = leagueYear(game.date);
  const [msg, setMsg] = useState<string | null>(null);
  const act = (fn: () => string | null, ok: string) => { setMsg(fn() ?? ok); changed(); };
  const ours = maintainsStadium(us);
  const bl = backlog(game);
  const value = stadiumValue(game);
  const studied = f.study === year;
  const ctl = controlOf(s);
  const lease = leaseSummary(game);
  const table = (site: "stadium" | "complex") => (
    <table>
      <thead><tr><th>Part</th><th className="num">Condition</th><th className="num">Since</th><th className="num">Replace</th><th></th></tr></thead>
      <tbody>
        {Object.entries(defs).filter(([, d]) => d.site === site).map(([k, d]) => {
          const r = readOf(game, k);
          return (
            <tr key={k}>
              <td>{d.label}{k === "field" ? ` (${f.surface === "grass" ? "natural grass" : "artificial turf"})` : ""}</td>
              <td className={`num ${r.value < 25 ? "bad" : ""}`}>{word(r.value)} {r.measured ? `(${r.value})` : `(about ${Math.round(r.value / 5) * 5})`}</td>
              <td className="num">{f.parts[k]?.replaced}</td>
              <td className="num">{money(d.cost * inflation(year))}</td>
              <td>{k !== "roof" && (site === "complex" || ours) && <button className="btn small" onClick={() => act(() => replacePart(game, k), `${d.label} replaced.`)}>Replace</button>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>{s.name}</h3>
          <dl className="kv">
            <dt>Ownership</dt><dd>{STRUCTURE_LABEL[s.structure]} ({s.owner}); operated by {s.operator}</dd>
            <dt>Opened</dt><dd>{s.opened}, {s.capacity.toLocaleString()} seats, {s.roof === "open" ? "open air" : s.roof === "dome" ? "fixed roof" : "retractable roof"}</dd>
            <dt>Our rights</dt><dd>{ctl.booking === "full" ? "Book any event" : ctl.booking === "partner" ? "Events with the co-owner's yes" : ctl.booking === "approval" ? "Events with the landlord's approval" : "No event booking"}; {ctl.concessions ? "we set concession and parking prices" : "the landlord sets concession and parking prices"}</dd>
            {lease && <><dt>Lease</dt><dd>{lease}</dd></>}
            <dt>Condition</dt><dd>{studied ? `${Math.round(stadiumCondition(game))} of 100, measured` : `${word(stadiumCondition(game) + 0)} by the operations director's read`}</dd>
            <dt>Backlog</dt><dd className={bl.cost ? "bad" : undefined}>{bl.cost ? `${money(bl.cost)}: ${bl.parts.join(", ").toLowerCase()}` : "Nothing past due"}</dd>
            {value != null && <><dt>Value apart from the team</dt><dd>About {money(value)} {s.structure === "coowned" ? "(our half)" : ""}</dd></>}
          </dl>
          {ours ? (
            <label className="stack tight">
              <span className="label">Maintenance plan</span>
              <select value={f.plan} onChange={(e) => act(() => setPlan(game, e.target.value as FacilitiesState["plan"]), "Plan set.")}>
                {Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          ) : <span className="muted">{s.owner} maintains the building and decides what gets replaced.</span>}
          <div className="btn-row">
            <button disabled={studied} onClick={() => act(() => commissionStudy(game), "The study is in; the numbers below are measured.")}>{studied ? "Studied this year" : "Commission an engineering study (about $300K)"}</button>
            {ours && <button onClick={() => act(() => switchSurface(game, f.surface === "grass" ? "turf" : "grass"), "The new field is in.")}>Switch to {f.surface === "grass" ? "turf (about $2M)" : "natural grass (about $3M)"}</button>}
          </div>
          <span className="muted">Most players prefer grass; turf holds up better in a cold, busy building. Roof changes are a construction project for later.</span>
        </div>
        <div className="panel stack tight">
          <h3>Team facility</h3>
          <dl className="kv">
            <dt>Ownership</dt><dd>Owned by the club (approximate)</dd>
            <dt>Condition</dt><dd>{studied ? `${Math.round(complexCondition(game))} of 100, measured` : word(complexCondition(game))}</dd>
            <dt>Upkeep</dt><dd>Paid from the training facility budget; a bigger budget replaces things sooner</dd>
          </dl>
          <span className="label">Players' and staff survey</span>
          {f.surveys[0] ? (
            <>
              <ul>{Object.entries(f.surveys[0].scores).map(([k, v]) => <li key={k} className={v < 5.5 ? "bad" : undefined}>{k}: {v.toFixed(1)}</li>)}</ul>
              <span className="muted">{f.surveys[0].year}: {f.surveys[0].notes.join(" ")}</span>
            </>
          ) : <span className="muted">The survey goes out in June.</span>}
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Stadium parts</h3>
        {table("stadium")}
      </div>
      <div className="panel stack tight">
        <h3>Team facility parts</h3>
        {table("complex")}
      </div>
      {f.log.length > 0 && (
        <div className="panel stack tight">
          <h3>Replacements</h3>
          <ul>{f.log.slice(0, 10).map((x, i) => <li key={i}>{shortDate(x.date)} {x.date.slice(0, 4)}: {defs[x.key]?.label}{x.auto ? " (on schedule, in the budget)" : `, ${money(x.cost)}`}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
