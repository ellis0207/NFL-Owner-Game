import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { buildGarage, convertToPremium, garageCost, groundsModel, leaseCost, leaseLot, parkingDay, premiumCost, seatsOn, type GroundsModel, type Lot, type Section } from "../../engine/grounds";
import { MARKETS, STADIUM_BY_TEAM } from "../../engine/stadiums";
import type { GameState } from "../../engine/types";
import { money } from "../format";

const SITE_LABEL = { downtown: "Downtown", urban: "In the city, outside the core", suburban: "Suburban" } as const;
const CONTROL_LABEL = { owned: "Ours", leased: "Leased by us", operator: "Run by the stadium operator", independent: "Independent (earns us nothing)" } as const;
const KIND_LABEL: Record<Section["kind"], string> = { lower: "Lower bowl", upper: "Upper bowl", club: "Club seats", suite: "Suites", deck: "Party decks" };

const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** Fill for a lot by who controls it. */
function lotFill(l: Lot): string {
  if (l.control === "independent") return "var(--sunk)";
  if (l.control === "leased") return "color-mix(in srgb, var(--warn) 35%, var(--panel))";
  if (l.control === "operator") return "color-mix(in srgb, var(--muted) 30%, var(--panel))";
  return "color-mix(in srgb, var(--team) 30%, var(--panel))";
}

/**
 * The site from above: the club's land as a rounded block, the bowl in its
 * rings (suites and clubs inside, closed sections hatched), the lots sized by
 * spaces around it, and the independent lots outside the line.
 */
export function GroundsPlan({ m }: { m: GroundsModel }) {
  const W = 640, H = 400, cx = 250, cy = 200;
  const ring = (rx: number, ry: number, w: number, color: string, dash?: boolean, key?: string) => (
    <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash ? "6 4" : undefined} />
  );
  const sec = (k: Section["kind"]) => m.sections.filter((x) => x.kind === k && !x.closed).reduce((t, x) => t + x.seats, 0);
  const closed = m.sections.filter((x) => x.closed).reduce((t, x) => t + x.seats, 0);
  const total = Math.max(1, m.sections.reduce((t, x) => t + x.seats, 0));
  const width = (seats: number) => 4 + 30 * seats / total;
  // Lots placed around the bowl on the club's land, sized by area.
  const ours = m.lots.filter((l) => l.control !== "independent");
  const indep = m.lots.find((l) => l.control === "independent");
  const slots = [[30, 30], [30, 250], [400, 30], [400, 250], [170, 330], [170, 6]] as const;
  const side = (spaces: number) => Math.max(26, Math.min(150, Math.sqrt(spaces) * 1.25));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Site plan of ${m.stadium}`} style={{ width: "100%", maxWidth: W, height: "auto", display: "block" }}>
      <defs>
        <pattern id="closed-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad)" strokeWidth="2" />
        </pattern>
      </defs>
      <rect x={10} y={2} width={530} height={H - 4} rx={18} fill="none" stroke="var(--rule)" strokeWidth={2} strokeDasharray="8 5" />
      <text x={20} y={H - 10} fontSize={11} fill="var(--muted)">Club land: {n(m.acres)} acres{m.freeAcres ? `, ${m.freeAcres} open to build on` : ""}</text>
      {ours.map((l, i) => {
        const [x, y] = slots[i % slots.length];
        const s = side(l.spaces);
        return (
          <g key={l.id} opacity={l.opens ? 0.55 : 1}>
            <rect x={x} y={y} width={s * 1.3} height={s * 0.75} rx={l.kind === "garage" ? 2 : 8} fill={lotFill(l)} stroke={l.kind === "garage" ? "var(--ink)" : "var(--rule)"} strokeDasharray={l.opens ? "4 3" : undefined} />
            <text x={x + 4} y={y + 13} fontSize={10} fill="var(--ink)">{l.kind === "garage" ? "Garage" : "Lot"} {n(l.spaces)}</text>
          </g>
        );
      })}
      {/* The bowl: upper ring outside, lower, then clubs and suites at field level. */}
      {ring(118, 84, width(sec("upper")), "color-mix(in srgb, var(--muted) 45%, var(--panel))")}
      {ring(96, 66, width(sec("lower")), "color-mix(in srgb, var(--team) 55%, var(--panel))")}
      {closed > 0 && <path d={`M ${cx - 70} ${cy - 62} A 96 66 0 0 1 ${cx + 70} ${cy - 62}`} fill="none" stroke="url(#closed-hatch)" strokeWidth={width(closed) + 6} />}
      {ring(76, 50, width(sec("club")), "color-mix(in srgb, var(--good) 60%, var(--panel))")}
      {ring(62, 40, width(sec("suite")) + 2, "color-mix(in srgb, var(--warn) 70%, var(--panel))")}
      <rect x={cx - 42} y={cy - 20} width={84} height={40} rx={3} fill="color-mix(in srgb, var(--good) 35%, var(--panel))" stroke="var(--good)" />
      <text x={cx} y={cy + 4} fontSize={11} textAnchor="middle" fill="var(--ink)">{n(m.capacity)} seats</text>
      {indep && (
        <g>
          <rect x={560} y={60} width={70} height={Math.min(300, 40 + indep.spaces / 60)} rx={6} fill={lotFill(indep)} stroke="var(--rule)" />
          <text x={595} y={52} fontSize={10} textAnchor="middle" fill="var(--muted)">Independent</text>
          <text x={595} y={80} fontSize={10} textAnchor="middle" fill="var(--ink)">{n(indep.spaces)}</text>
        </g>
      )}
      {m.transit >= 0.1 && (
        <g>
          <line x1={540} y1={H - 30} x2={10} y2={H - 30} stroke="var(--muted)" strokeWidth={3} strokeDasharray="14 4" opacity={0.6} />
          <text x={440} y={H - 36} fontSize={10} fill="var(--muted)">Rail and bus: {Math.round(m.transit * 100)}% of fans</text>
        </g>
      )}
    </svg>
  );
}

export function Grounds({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [garage, setGarage] = useState(2000);
  const [lease, setLease] = useState(1000);
  const [seats, setSeats] = useState(1500);
  const [phased, setPhased] = useState(true);
  const m = groundsModel(game);
  const st = STADIUM_BY_TEAM[game.userTeam];
  const open = seatsOn(m);
  // A full house for the parking picture: every seat on sale, the usual no-shows aside.
  const full = parkingDay(m, open.general * 0.92 + open.premium * 0.8, MARKETS[game.userTeam].parking, game.business?.prices.parking ?? 1);
  const act = (r: string | null, ok: string) => { setMsg(r ?? ok); changed(); };
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="panel stack tight">
        <h3>{m.stadium}: site plan</h3>
        <p className="muted">
          {SITE_LABEL[m.site]} site. Seats, lots and closures here are the same figures the ticket office and the books use, so a change on this page shows up in the next home game's gate.
        </p>
        <GroundsPlan m={m} />
        {m.notes.map((x) => <p key={x} className="muted">{x}</p>)}
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Seating</h3>
          <table>
            <thead><tr><th>Section</th><th>Seats</th><th>Status</th></tr></thead>
            <tbody>
              {m.sections.map((x) => (
                <tr key={x.id}>
                  <td>{x.closed ? x.closed.why : KIND_LABEL[x.kind]}</td>
                  <td>{n(x.seats)}</td>
                  <td>{x.closed ? `Closed until ${shortDate(x.closed.to)}` : x.premium ? "Premium" : "General"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="kv">
            <dt>On sale</dt><dd>{n(open.general)} general, {n(open.premium)} premium</dd>
          </dl>
        </div>
        <div className="panel stack tight">
          <h3>Parking and getting there</h3>
          <table>
            <thead><tr><th>Lot</th><th>Spaces</th><th>Who runs it</th><th>Our share</th></tr></thead>
            <tbody>
              {m.lots.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}{l.opens ? ` (opens ${shortDate(l.opens)})` : ""}</td>
                  <td>{n(l.spaces)}</td>
                  <td>{CONTROL_LABEL[l.control]}</td>
                  <td>{Math.round(l.share * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="kv">
            <dt>How fans arrive</dt>
            <dd>{Math.round(m.modes.drive * 100)}% drive, {Math.round(m.modes.transit * 100)}% transit, {Math.round(m.modes.rideshare * 100)}% rideshare, {Math.round(m.modes.walk * 100)}% walk</dd>
            <dt>Cars at a full house</dt><dd>{n(full.cars)}: {n(full.club)} in our lots, {n(full.independent)} in independent lots{full.short ? `, ${n(full.short)} with nowhere close` : ""}</dd>
            <dt>Our parking money a game</dt><dd>{money(full.revenue)}</dd>
            <dt>Yearly upkeep we added</dt><dd>{money(m.upkeep)}</dd>
          </dl>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Changes</h3>
        {st.structure === "tenant" && <p className="muted">We rent {st.name}; changes to the bowl are {st.owner}'s call.</p>}
        <div className="btn-row">
          <select value={garage} onChange={(e) => setGarage(Number(e.target.value))} aria-label="Garage size">
            {[1000, 2000, 3000, 4000].map((x) => <option key={x} value={x}>{n(x)} spaces</option>)}
          </select>
          <button onClick={() => act(buildGarage(game, garage), `The garage is under way.`)}>Build a garage on our lots ({money(garageCost(game, garage))})</button>
        </div>
        <div className="btn-row">
          <select value={lease} onChange={(e) => setLease(Number(e.target.value))} aria-label="Lot size">
            {[500, 1000, 2000].map((x) => <option key={x} value={x}>{n(x)} spaces</option>)}
          </select>
          <button onClick={() => act(leaseLot(game, lease), "The lot is ours to run for three seasons.")}>Lease a nearby lot ({money(leaseCost(game, lease))} a year)</button>
        </div>
        <div className="btn-row">
          <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} aria-label="Seats to convert">
            {[500, 1000, 1500, 2500].map((x) => <option key={x} value={x}>{n(x)} seats</option>)}
          </select>
          <label className="btn-row"><input type="checkbox" checked={phased} onChange={(e) => setPhased(e.target.checked)} /> Build now, closing the section (outside February to May)</label>
          <button disabled={st.structure === "tenant"} onClick={() => act(convertToPremium(game, seats, phased), "The conversion is booked.")}>Convert lower-bowl seats to club seats ({money(premiumCost(game, seats))})</button>
        </div>
      </div>
    </div>
  );
}
