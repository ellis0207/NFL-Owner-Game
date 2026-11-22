// The new stadium in 3D (Stadium Lab's custom builder) during the design
// stage: shape, decks, roof, finishes and fit-out on the chosen site. Seats,
// roof and name go to the construction plan; the fit-out adds to its price
// and, once the building opens, to what it does (stadiumlab.ts).
import { useEffect, useMemo, useState } from "react";
import { baseCost, construction } from "../../engine/construction";
import { fitOutItems, newDesign, NEW_SEATS, setNewDesign, SUITE_SEATS } from "../../engine/stadiumlab";
import { inflation } from "../../engine/business";

import { constructionFactor } from "../../engine/economy";
import type { GameState } from "../../engine/types";
import { customVenue, facadeLabels, roofLabels, surfaceLabels } from "../../lab/economics.js";
import type { LabConfig } from "../../lab/types";
import { Card } from "../kit";
import { money as small } from "../format";
import { billions } from "../../engine/business";
import { Choose, Slider, Stage, Switch } from "./StadiumLabScreen";

const money = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : small(x));
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const BOARDS: Record<string, string> = { compact: "Basic scoreboard (included)", large: "Large end-zone screens", halo: "Suspended halo display", none: "No main display" };

export function NewStadiumDesigner({ game, changed }: { game: GameState; changed: () => void }) {
  const p = construction(game).plan!;
  const [d, setD] = useState<LabConfig>(() => newDesign(game)!);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setD(newDesign(game)!); }, [p.capacity, p.roof, p.name]);
  const edit = (patch: Partial<LabConfig>) => { setD({ ...d, ...patch }); setMsg(null); };
  const scene = useMemo(() => ({ v: { ...customVenue, name: d.name ?? p.name, capacity: d.capacity, roof: d.roof, color: d.color }, c: { ...d, custom: true, siteAcres: 150 } as LabConfig }), [d]);
  const items = fitOutItems(d);
  const scale = inflation(Number(game.date.slice(0, 4)), 0.04) * constructionFactor(game);
  const saved = !!p.lab && JSON.stringify(Object.fromEntries(Object.entries(d).filter(([, x]) => typeof x !== "object"))) === JSON.stringify(Object.fromEntries(Object.entries({ ...p.lab, capacity: p.capacity, name: p.name }).filter(([, x]) => typeof x !== "object")));
  return (
    <Card title="Design the building" kicker="Stadium Lab">
      <div className="sl-page">
        <div className="sl-main">
          <Stage known={false} building={p.name} editable={false} design={scene} designTitle={d.name ?? p.name} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fit-out beyond the base building</th><th className="num">Today</th></tr></thead>
              <tbody>
                {items.length ? items.map((l, i) => <tr key={i}><td>{l.label}<br /><small className="muted">{l.basis}</small></td><td className="num">{money(l.cost * 1.15 * scale)}</td></tr>)
                  : <tr><td colSpan={2} className="muted">A plain building: the bowl, the roof, a basic scoreboard and the field are in the base price.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted">With the design saved, the building is estimated at {money(baseCost(game, { ...p, lab: d as never, capacity: Math.max(NEW_SEATS[0], Math.min(NEW_SEATS[1], d.capacity)) }))} today, design fees included. Suites become premium seats, and the boards, concourses, Wi-Fi, plaza and lighting lift the gate once it opens.</p>
          <div className="row">
            <button className="primary" disabled={saved} onClick={() => { const r = setNewDesign(game, d); setMsg(r ?? "Design saved to the plan."); changed(); }}>{saved ? "Design saved" : "Use this design"}</button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </div>
        <aside className="kit-card sl-editor">
          <h3>Building</h3>
          <label className="sl-control"><span>Name</span><input type="text" maxLength={60} value={String(d.name ?? "")} onChange={(e) => edit({ name: e.target.value })} /></label>
          <Slider label="Seats" value={d.capacity} min={NEW_SEATS[0]} max={NEW_SEATS[1]} step={1000} show={n(d.capacity)} onChange={(x) => edit({ capacity: x })} />
          <Choose label="Roof" value={d.roof} options={roofLabels} help={d.roof === "canopy" ? "A canopy keeps fans dry; the field still plays in the weather." : undefined} onChange={(x) => edit({ roof: x })} />
          <Choose label="Bowl" value={String(d.shape ?? "oval")} options={{ oval: "Continuous oval", rectangular: "Rounded rectangle", horseshoe: "Open-end horseshoe" }} onChange={(x) => edit({ shape: x })} />
          <Choose label="Decks" value={String(d.decks ?? 0)} options={{ 0: "By capacity", 1: "One deck", 2: "Two decks", 3: "Three decks", 4: "Four decks" }} onChange={(x) => edit({ decks: Number(x) })} />
          <Choose label="Rake" value={String(d.rake ?? "balanced")} options={{ balanced: "Balanced", shallow: "Shallow terraces", steep: "Steep and close" }} onChange={(x) => edit({ rake: x })} />
          <Choose label="Exterior" value={d.facade} options={Object.fromEntries(Object.entries(facadeLabels).filter(([k]) => k !== "original"))} onChange={(x) => edit({ facade: x })} />
          <label className="sl-control"><span>Seat color<output>{d.color.toUpperCase()}</output></span><input type="color" value={d.color} onChange={(e) => edit({ color: e.target.value })} /></label>
          <Choose label="Playing surface" value={d.surface} options={surfaceLabels} onChange={(x) => edit({ surface: x })} />
          <Slider label="Premium suites" value={d.suites} min={0} max={100} step={5} show={String(d.suites)} help={`${SUITE_SEATS} premium seats each.`} onChange={(x) => edit({ suites: x })} />
          <Choose label="Video displays" value={d.board} options={BOARDS} onChange={(x) => edit({ board: x })} />
          <Switch on={!!d.plaza} built={false} label="Fan plaza" note="Event space and landscaping" onChange={(x) => edit({ plaza: x })} />
          <Switch on={!!d.amenities} built={false} label="Bigger concourses" note="Food service, access and restrooms" onChange={(x) => edit({ amenities: x })} />
          <Switch on={!!d.wifi} built={false} label="High-density Wi-Fi" note="Connectivity for fans and sponsors" onChange={(x) => edit({ wifi: x })} />
          <Switch on={!!d.led} built={false} label="LED lighting" note="Field and architectural lighting" onChange={(x) => edit({ led: x })} />
          <Switch on={!!d.solar} built={false} label="Solar canopy" note="Lower running costs" onChange={(x) => edit({ solar: x })} />
          <p className="muted">Parking comes with the site you pick above; land, ownership and public money are set in the plan.</p>
        </aside>
      </div>
    </Card>
  );
}
