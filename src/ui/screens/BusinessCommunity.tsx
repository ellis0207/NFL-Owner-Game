import { useState } from "react";
import { shortDate } from "../../engine/dates";
import {
  community, decideGrant, extraCost, FOCUS, OVERSIGHT, ownerGift, PROGRAMS, SERVICES, setAutoLimit, setClubGift, setFocus, setOversight, setPartnership, setProgram, setService, staffRead,
} from "../../engine/community";
import { owner } from "../../engine/ownership";
import { TEAM_BY_ID } from "../../engine/league";
import type { GameState } from "../../engine/types";
import { money } from "../format";

export function Community({ game, changed }: { game: GameState; changed: () => void }) {
  const c = community(game);
  const [msg, setMsg] = useState<string | null>(null);
  const [gift, setGift] = useState(1_000_000);
  const act = (fn: () => string | null | void, ok?: string) => { const r = fn(); setMsg(r ?? ok ?? null); changed(); };
  const pending = c.grants.filter((g) => g.status === "pending");
  const cost = extraCost(game);
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>The {TEAM_BY_ID[game.userTeam].name} Foundation</h3>
          <dl className="kv">
            <dt>Balance</dt><dd>{money(c.foundation.balance)}</dd>
            <dt>Given</dt><dd>{money(c.foundation.given)} in grants; fundraisers brought in {money(c.foundation.raised)}; your own gifts {money(c.foundation.ownerGiven)}</dd>
          </dl>
          <span className="label">Focus areas (up to three)</span>
          <div className="btn-row">
            {FOCUS.map((f) => (
              <label key={f} className="btn-row"><input type="checkbox" checked={c.focus.includes(f)} onChange={(e) => act(() => setFocus(game, e.target.checked ? [...c.focus, f] : c.focus.filter((x) => x !== f)))} /> {f}</label>
            ))}
          </div>
          <label className="stack tight">
            <span className="label">Oversight</span>
            <select value={c.oversight} onChange={(e) => act(() => setOversight(game, Number(e.target.value) as 0 | 1 | 2))}>
              {OVERSIGHT.map((o, i) => <option key={i} value={i}>{o}</option>)}
            </select>
          </label>
          <label className="stack tight">
            <span className="label">Staff approve sound grants up to {money(c.autoLimit)}</span>
            <input type="range" min={0} max={500_000} step={25_000} value={c.autoLimit} onChange={(e) => act(() => setAutoLimit(game, Number(e.target.value)))} />
          </label>
          <label className="stack tight">
            <span className="label">Club gift to the foundation: {money(c.foundation.clubGift)} a year</span>
            <input type="range" min={0} max={10_000_000} step={500_000} value={c.foundation.clubGift} onChange={(e) => act(() => setClubGift(game, Number(e.target.value)))} />
          </label>
          <div className="btn-row">
            <select value={gift} onChange={(e) => setGift(Number(e.target.value))} aria-label="Personal gift">
              {[250_000, 1_000_000, 5_000_000, 25_000_000].map((x) => <option key={x} value={x}>{money(x)}</option>)}
            </select>
            <button onClick={() => act(() => ownerGift(game, gift), "Thank you. The gift is in the foundation's account.")}>Give from your own money</button>
            <span className="muted">You have {money(owner(game).liquid)} outside the team.</span>
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Programs</h3>
          {Object.entries(PROGRAMS).map(([k, p]) => (
            <label key={k} className="btn-row"><input type="checkbox" checked={!!c.programs[k]} onChange={(e) => act(() => setProgram(game, k, e.target.checked))} /> {p.label} <span className="muted">({p.base ? "in the community budget" : `${money(p.cost)} a year`})</span></label>
          ))}
          <label className="btn-row"><input type="checkbox" checked={c.partnership} onChange={(e) => act(() => setPartnership(game, e.target.checked))} /> A shared initiative with the city (parks and youth fields) <span className="muted">($500K a year; the city remembers in lease talks)</span></label>
          <span className="muted">{cost ? `${cost > 0 ? "Costs" : "Saves"} ${money(Math.abs(cost))} a year against the community budget.` : "Inside the community budget."} Long commitments build more trust than one-off events.</span>
          <span className="muted">{c.appearances.count} player appearances this season, all voluntary and on days off.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Grant applications</h3>
          {pending.length ? pending.map((g) => (
            <div key={g.id} className="stack tight">
              <span><strong>{g.org}</strong> (made up), {g.area.toLowerCase()}: {money(g.amount)}</span>
              <span className="muted">Staff read: {staffRead(game, g) >= 0.7 ? "strong" : staffRead(game, g) >= 0.5 ? "sound" : "doubtful"}. Applied {shortDate(g.date)}.</span>
              <div className="btn-row">
                <button className="btn small primary" onClick={() => act(() => decideGrant(game, g.id, true), "Approved.")}>Approve</button>
                <button className="btn small" onClick={() => act(() => decideGrant(game, g.id, false), "Declined.")}>Decline</button>
              </div>
            </div>
          )) : <span className="muted">Nothing waiting. Small grants the staff likes go out on their own.</span>}
          <span className="label">Recent grants</span>
          <ul>{c.grants.filter((g) => g.status === "approved").slice(0, 6).map((g) => <li key={g.id}>{g.org}: {money(g.amount)}{g.outcome ? `. ${g.outcome}` : ""}</li>)}</ul>
        </div>
        <div className="panel stack tight">
          <h3>Player services</h3>
          <span className="muted">Run under the CBA's rules. What players share with well-being staff stays confidential and never reaches the owner.</span>
          {Object.entries(SERVICES).map(([k, p]) => (
            <label key={k} className="btn-row"><input type="checkbox" checked={!!c.services[k]} onChange={(e) => act(() => setService(game, k, e.target.checked))} /> {p.label} <span className="muted">({p.base ? "already run" : `${money(p.cost)} a year`})</span></label>
          ))}
          <span className="muted">Alumni: {c.alumni.names.length} former players{c.alumni.events ? `, ${c.alumni.events} events, last ${shortDate(c.alumni.last!)}` : ""}.</span>
          {c.reports[0] && <><span className="label">{c.reports[0].year} public report</span><span className="muted">{c.reports[0].text}</span></>}
        </div>
      </div>
    </div>
  );
}
