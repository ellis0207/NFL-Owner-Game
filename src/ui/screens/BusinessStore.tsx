import { useState } from "react";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { RULES, TEAM_BY_ID } from "../../engine/league";
import {
  anniversary, brandLift, jerseyForecast, launchRetro, licensingIncome, merch, REBRAND, reorder, requestRebrand, setChannel, setEnforcement, setMerchPrice, setOrderDepth,
} from "../../engine/merch";
import type { GameState, MerchChannel, RebrandKind } from "../../engine/types";
import { money } from "../format";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function Store({ game, changed }: { game: GameState; changed: () => void }) {
  const m = merch(game);
  const s = m.seasons.find((x) => x.season === RULES.season);
  const last = m.seasons.find((x) => x.season === RULES.season - 1);
  const [kind, setKind] = useState<RebrandKind>("uniform");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const forecast = jerseyForecast(game);
  const ann = anniversary(game);
  const t = TEAM_BY_ID[game.userTeam];
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>The brand</h3>
          <dl className="kv">
            <dt>Name</dt><dd>{t.city} {m.brand.name}{m.brand.since !== RULES.season && m.brand.name !== t.name ? "" : ""}</dd>
            <dt>Marks</dt><dd>Name, primary logo, wordmark, colors and uniform set, licensed through the league</dd>
            <dt>Logo and uniforms</dt><dd>{m.brand.logo > 1 ? `Logo redesigned ${m.brand.logo - 1} time(s)` : "The club's current logo"}; {m.brand.uniform > 1 ? `${m.brand.uniform - 1} uniform change(s)` : "current uniforms"}</dd>
            <dt>Sales lift</dt><dd>{brandLift(game) > 1.001 ? `${pct(brandLift(game) - 1)} from the new look or throwbacks` : "None"}</dd>
          </dl>
          {m.rebrand ? (
            <span className="muted">{REBRAND[m.rebrand.kind].label}{m.rebrand.name ? ` (the ${m.rebrand.name})` : ""}: {!m.rebrand.decided ? `with the league since ${shortDate(m.rebrand.asked)}` : m.rebrand.approved ? `approved, launches with the ${m.rebrand.launches} season` : "not approved"}.</span>
          ) : null}
          {(!m.rebrand || m.rebrand.decided && !m.rebrand.approved) && (
            <div className="stack tight">
              <span className="label">Ask the league for a rebrand</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as RebrandKind)} aria-label="Rebrand">
                {(Object.keys(REBRAND) as RebrandKind[]).map((k) => <option key={k} value={k}>{REBRAND[k].label}: about {money(REBRAND[k].cost)}, {REBRAND[k].lead} season{REBRAND[k].lead > 1 ? "s" : ""} of lead time</option>)}
              </select>
              {kind === "name" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team name" aria-label="New team name" />}
              <span className="muted">Half the cost comes due when the league approves, the rest at launch. Stock with the old marks is written off; sales jump for a few seasons. A new name costs trust with fans who grew up with the old one.</span>
              <div><button className="btn small" onClick={() => { setMsg(requestRebrand(game, kind, name) ?? "Sent to the league's marks committee."); changed(); }}>Send to the league</button></div>
            </div>
          )}
        </div>
        <div className="panel stack tight">
          <h3>Stores and pricing</h3>
          <label className="field">
            <span className="label">Store prices: {pct(m.price)} of list (a jersey about ${Math.round(130 * m.price)})</span>
            <input type="range" min={80} max={130} step={5} value={Math.round(m.price * 100)} onChange={(e) => { setMerchPrice(game, Number(e.target.value) / 100); changed(); }} aria-label="Store prices" />
          </label>
          {(["stores", "online"] as const).map((w) => (
            <label key={w} className="field">
              <span className="label">{w === "stores" ? "Stadium stores and stands" : "Online store and fulfillment"}</span>
              <select value={m[w]} onChange={(e) => { setChannel(game, w, e.target.value as MerchChannel); changed(); }}>
                <option value="inHouse">Run it ourselves: keep the margin, carry the stock</option>
                <option value="partner">{w === "stores" ? "An operator, paying us 22% of sales" : "A licensed e-commerce partner, paying us 15% of sales"}</option>
              </select>
            </label>
          ))}
          <label className="btn-row"><input type="checkbox" checked={m.enforcement} onChange={(e) => { setEnforcement(game, e.target.checked); changed(); }} /> Go after counterfeit sellers at big games (investigators and civil seizures, about $35K a game)</label>
          <div className="btn-row">
            <button className="btn small" disabled={m.retro === RULES.season} onClick={() => { setMsg(launchRetro(game) ?? "The throwback line is in the stores."); changed(); }}>Launch a throwback line</button>
            <span className="muted">{m.retro === RULES.season ? "This season's throwbacks are out." : ann ? `It's ${ann} years since our title: throwbacks sell best now.` : "Throwbacks use our own historic marks, with the league's sign-off."}</span>
          </div>
          <span className="muted">League licensing royalties come back to us as part of national revenue: about {money(licensingIncome(leagueYear(game.date)))} this year.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Jerseys</h3>
        <label className="field">
          <span className="label">Preseason order: {pct(m.depth)} of the staff's forecast</span>
          <input type="range" min={60} max={150} step={5} value={Math.round(m.depth * 100)} onChange={(e) => { setOrderDepth(game, Number(e.target.value) / 100); changed(); }} aria-label="Order depth" />
        </label>
        <span className="muted">The order goes in six weeks before the season. Too few and fans leave without one; too many and they're marked down after the season. A player traded or cut leaves his jerseys to a liquidator.</span>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Player</th><th className="num">Forecast</th><th className="num">Ordered</th><th className="num">Sold</th><th></th></tr></thead>
            <tbody>{(Object.keys(m.stock).length ? Object.entries(m.stock).map(([id, st]) => ({ id, name: st.name, units: st.demand, st })) : forecast.map((f) => ({ ...f, st: undefined }))).map((r) => (
              <tr key={r.id}><td>{r.name}</td><td className="num">{r.units.toLocaleString("en-US")}</td><td className="num">{r.st ? r.st.ordered.toLocaleString("en-US") : "-"}</td><td className="num">{r.st ? Math.round(r.st.sold).toLocaleString("en-US") : "-"}</td>
                <td>{r.st && r.st.sold >= r.st.ordered * 0.9 && <button className="btn small" onClick={() => { reorder(game, r.id, Math.round(r.units * 0.25)); setMsg(`Rush order placed for ${r.name}, at 20% more a unit.`); changed(); }}>Rush reorder</button>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {[s, last].filter(Boolean).map((x) => (
        <div key={x!.season} className="panel stack tight">
          <h3>{x!.season} statement{x!.season === RULES.season ? " so far" : ""}</h3>
          <dl className="kv">
            <dt>Gross sales</dt><dd>{money(x!.gross)} ({money(x!.online)} online, {money(x!.stands)} at the stadium)</dd>
            <dt>Cost of goods</dt><dd>{money(x!.cogs)}</dd>
            <dt>Kept by operators and partners</dt><dd>{money(x!.operatorShare)}</dd>
            <dt>Returns and discounts</dt><dd>{money(x!.returns)} and {money(x!.discounts)}</dd>
            <dt>Markdowns and write-offs</dt><dd>{money(x!.markdowns)} and {money(x!.writeoffs)}</dd>
            <dt>Lost to counterfeits</dt><dd>{money(x!.counterfeit)}</dd>
            <dt>Missed for lack of stock</dt><dd>{money(x!.lostSales)}</dd>
          </dl>
        </div>
      ))}
    </div>
  );
}
