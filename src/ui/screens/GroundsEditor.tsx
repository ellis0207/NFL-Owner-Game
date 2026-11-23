// The Grounds page's 3D editor: our lots, garages and leased lots drawn in the
// Stadium Lab's district view, with a garage or a lease the owner is weighing
// drawn in as proposed beside what it does on a sold-out day. The money comes
// from the grounds model (grounds.ts), the same one the gate reads.
import { useMemo, useState } from "react";
import { DEPOSIT, buildGarage, groundsImpact, leaseLot, leaseOffers, type GroundsChange } from "../../engine/grounds";
import { groundsScene } from "../../engine/stadiumlab";
import type { GameState } from "../../engine/types";
import { Card } from "../kit";
import { money } from "../format";
import { Slider, Stage } from "./StadiumLabScreen";

const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** Lot colors as the Lab draws them (district-model.js palette). */
const KEY: [string, string][] = [["#738b85", "Ours"], ["#c6a55b", "Leased"], ["#b9c4b0", "Going up"], ["#718fa8", "Independent"], ["#408c68", "Proposed"]];

type Mode = "none" | "garage" | "lease";

export function GroundsEditor({ game, changed, say, date }: { game: GameState; changed: () => void; say: (x: string) => void; date: string }) {
  const [mode, setMode] = useState<Mode>("none");
  const [spaces, setSpaces] = useState(2000);
  const offers = useMemo(() => leaseOffers(game), [game, date, game.grounds?.leases.length]);
  const [pick, setPick] = useState<string>("");
  const lot = offers.find((o) => o.id === pick) ?? offers[0];
  const change: GroundsChange | undefined = mode === "garage" ? { garage: spaces } : mode === "lease" && lot ? { lease: lot.id } : undefined;
  const key = `${mode}:${spaces}:${lot?.id}:${date}:${game.grounds?.garages.length}:${game.grounds?.leases.length}`;
  const { view, scene } = useMemo(() => groundsScene(game, change), [key]);
  const impact = change ? groundsImpact(game, change) : undefined;
  const commit = () => {
    if (!change) return;
    const r = "garage" in change ? buildGarage(game, change.garage) : leaseLot(game, 0, change.lease);
    say(r ?? ("garage" in change ? "The garage is under way; it opens for the next season." : `${lot?.name} is ours to run for three seasons.`));
    if (!r) setMode("none");
    changed();
  };
  const net = impact ? impact.season - impact.yearly : 0;
  return (
    <div className="sl-page">
      <div className="sl-main">
        <Stage labId={view.labId} known={view.known} building={view.building} editable={false} design={scene} designTitle="Our grounds" camera="district" />
        <div className="sl-legend" aria-label="Lot colors">
          {KEY.map(([c, label]) => <span key={label}><i style={{ background: c }} />{label}</span>)}
        </div>
      </div>
      <div className="sl-editor">
        <Card title="Parking" kicker="Garages and leases">
          <div className="sl-tabs" role="group" aria-label="What to add">
            <button aria-pressed={mode === "garage"} onClick={() => setMode(mode === "garage" ? "none" : "garage")}>Build a garage</button>
            <button aria-pressed={mode === "lease"} onClick={() => setMode(mode === "lease" ? "none" : "lease")} disabled={!offers.length}>Lease a lot</button>
          </div>
          {mode === "none" && <p className="muted">Pick a garage or a nearby lot to see it on the map and what it would earn on a sold-out day.{offers.length ? "" : " Every nearby lot for lease is already ours."}</p>}
          {mode === "garage" && <Slider label="Garage spaces" value={spaces} min={500} max={4000} step={250} show={n(spaces)} help="Goes up on part of our surface lots: about four times the cars on the same land. Opens for the next season." onChange={setSpaces} />}
          {mode === "lease" && (
            <div className="stack tight">
              {offers.map((o) => (
                <button key={o.id} className="sl-parcel" aria-pressed={o.id === lot?.id} onClick={() => setPick(o.id)}>
                  <b>{o.name}</b>
                  <small>{n(o.spaces)} {o.kind === "garage" ? "garage" : "surface"} spaces, {o.walk} minutes' walk, {money(o.rent)} a season</small>
                </button>
              ))}
              <p className="muted">A closer lot costs more, since it fills first. Leases run three seasons.</p>
            </div>
          )}
          {impact && (
            <>
              <div className="sl-impact">
                {impact.cost > 0
                  ? <div className="sl-big"><span>To build</span><b>{money(impact.cost)}</b><small>{Math.round(DEPOSIT * 100)}% now, the rest monthly until it opens</small></div>
                  : <div className="sl-big"><span>Rent</span><b>{money(impact.yearly)}</b><small>A season, paid quarterly</small></div>}
                <div className="sl-big"><span>Parking money a sold-out game</span><b>{impact.perGame >= 0 ? "+" : ""}{money(impact.perGame)}</b><small>{money(impact.before.revenue)} now, {money(impact.after.revenue)} with it</small></div>
                <div className="sl-big"><span>A season, after {impact.cost > 0 ? "upkeep" : "rent"}</span><b>{net >= 0 ? "+" : ""}{money(net)}</b><small>{impact.cost > 0 ? (net > 0 && impact.cost / net <= 40 ? `Pays back in about ${Math.ceil(impact.cost / net)} seasons` : "Our lots already hold the crowd, so it won't pay back in parking alone") : `${money(impact.season)} in parking less the rent`}</small></div>
                <div className="sl-big"><span>Cars with nowhere close</span><b>{n(impact.after.short)}</b><small>{impact.before.short !== impact.after.short ? `${n(impact.before.short)} now; fans who can't park buy fewer tickets` : "No change at a full house"}</small></div>
              </div>
              {impact.blocked && <p className="notice">{impact.blocked}</p>}
              <button className="primary" disabled={!!impact.blocked} onClick={commit}>{"garage" in change! ? "Build this garage" : "Sign this lease"}</button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
