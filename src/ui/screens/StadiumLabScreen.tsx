import { useEffect, useMemo, useRef, useState } from "react";
import { shortDate } from "../../engine/dates";
import { TEAMS, teamLabel } from "../../engine/league";
import { drawable, labDraft, labQuote, labVenue, saveDraft, startRenovation, SUITE_SEATS, type LabView } from "../../engine/stadiumlab";
import { STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../../engine/stadiums";
import { underWay } from "../../engine/labstate";
import type { GameState } from "../../engine/types";
import { facadeLabels, roofLabels, surfaceLabels } from "../../lab/economics.js";
import { normalizeParking, parkingPlan } from "../../lab/parking.js";
import { parcelPlan } from "../../lab/parcels.js";
import { references } from "../../lab/references.js";
import { setSurveys, surveys } from "../../lab/surveys.js";
import type { LabConfig, LabVenue } from "../../lab/types";
import { Viewer } from "../../lab/viewer.js";
import { Callout, Card, StatRow, StatTile } from "../kit";
import { money as small } from "../format";
import { billions } from "../../engine/business";

/** Dollars, in billions once a figure gets there. */
const money = (x: number) => (Math.abs(x) >= 1e9 ? billions(x) : small(x));
const when = (d: string) => `${shortDate(d)}, ${d.slice(0, 4)}`;

type Tab = "Structure" | "Experience" | "Parking" | "Land" | "Budget";
const TABS: Tab[] = ["Structure", "Experience", "Parking", "Land", "Budget"];
const CAMERAS = [["orbit", "Perspective"], ["top", "Top"], ["field", "Field"], ["district", "District"]] as const;
const BOARDS: Record<string, string> = { original: "Display as built", none: "Remove main display", compact: "Basic scoreboard", large: "Bigger end-zone screens", halo: "Suspended halo display" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** The OpenStreetMap district outlines load once, beside the page (about 2.3 MB). */
let surveyLoad: Promise<void> | null = null;
function loadSurveys(): Promise<void> {
  surveyLoad ??= fetch("lab/site-surveys.json").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.surveys) setSurveys(j.surveys); }).catch(() => undefined);
  return surveyLoad;
}

/** The Stadium Lab page: any club's building in 3D, and for our own a renovation designed, priced and started in the game. */
export function StadiumLabScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [team, setTeam] = useState(game.userTeam);
  const [msg, setMsg] = useState<string | null>(null);
  const ours = team === game.userTeam;
  const building = STADIUM_BY_TEAM[team]?.name;
  const view = useMemo(() => labVenue(game, team), [game, team, building, game.date, game.stadiumLab?.renovations.length, game.stadiumLab?.renovations.filter((r) => r.opened).length]);
  const [design, setDesign] = useState<LabConfig>(() => (ours ? labDraft(game, view) : view.built));
  useEffect(() => { setDesign(ours ? labDraft(game, view) : view.built); }, [view]);
  const edit = (patch: Partial<LabConfig>) => {
    const next = normalizeParking(view.venue, { ...design, ...patch } as LabConfig);
    setDesign(next);
    if (ours) saveDraft(game, next);
  };
  const quote = useMemo(() => labQuote(game, design, view), [design, view]);
  const busy = underWay(game, view.building);
  const builtScene = useMemo(() => drawable(view, view.built), [view]);
  const designScene = useMemo(() => drawable(view, design), [view, design]);
  const s = STADIUM_BY_TEAM[team];
  return (
    <section className="stack">
      <div className="sl-pick">
        <label className="field"><span className="label">Club</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{teamLabel(t.id)}{t.id === game.userTeam ? " (ours)" : ""}</option>)}
          </select>
        </label>
        <span className="muted">{view.known ? "Stadium Lab's model of the real building." : "A building Stadium Lab hasn't modeled: an estimated bowl from the game's numbers."}</span>
      </div>
      <StatRow>
        <StatTile label="Building" value={view.building} note={`${STRUCTURE_LABEL[s.structure]}${s.opened ? `, opened ${s.opened}` : ""}`} />
        <StatTile label="Seats" value={n(s.capacity)} note={view.renovations.length ? `${n(view.model.capacity)} before our work` : undefined} />
        <StatTile label="Roof" value={roofLabels[view.venue.roof] ?? view.venue.roof} />
        <StatTile label="Surface" value={surfaceLabels[view.venue.surface] ?? view.venue.surface} />
        {busy && <StatTile label="Under way" value={busy.title} note={`Opens ${when(busy.opens)}; ${money(busy.paid)} of ${money(busy.cost)} paid`} tone="warn" />}
      </StatRow>
      <div className={ours ? "sl-page" : "sl-page sl-wide"}>
        <div className="sl-main">
          <Stage labId={view.labId} known={view.known} building={view.building} editable={ours}
            built={builtScene} design={designScene} />
          {ours && <Impact game={game} view={view} design={design} quote={quote} msg={msg}
            start={() => { const r = startRenovation(game, design); setMsg(r); changed(); }}
            reset={() => { saveDraft(game, null); setDesign(view.built); setMsg(null); }} />}
          {!ours && <Callout title="Another club's building">You can look around any club's stadium. Only our own can be renovated, and only when we own or run it.</Callout>}
          <History game={game} view={view} />
        </div>
        {ours && <Editor view={view} design={design} edit={edit} />}
      </div>
    </section>
  );
}

/** The 3D stage: the design or the building as it stands, four cameras, night lighting, the photo and the map credit. */
export interface Scene { v: LabVenue; c: LabConfig }

export function Stage({ labId, known, building, editable, built, design, designTitle = "Our design", camera: startCamera = "orbit" }: {
  labId?: string; known: boolean; building: string; editable: boolean; built?: Scene; design: Scene; designTitle?: string; camera?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [asBuiltPick, setAsBuilt] = useState(!editable);
  const asBuilt = asBuiltPick && !!built;
  const [camera, setCamera] = useState(startCamera);
  const [flags, setFlags] = useState({ night: false, hideRoof: false, rotate: false });
  const [mapped, setMapped] = useState(!!labId && !!surveys[labId]);
  const [photo, setPhoto] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!box.current) return;
    let v: Viewer;
    try { v = new Viewer(box.current); } catch { return; }
    v.onSelect = (l) => setLabel(`${l.name}${l.match ? ` (${l.match})` : ""}`);
    if (startCamera !== "orbit") v.reset(startCamera);
    viewer.current = v;
    return () => { v.destroy(); viewer.current = null; };
  }, []);
  useEffect(() => { setAsBuilt(!editable); }, [editable]);
  useEffect(() => {
    if (labId && !surveys[labId]) void loadSurveys().then(() => setMapped(!!surveys[labId]));
    else setMapped(!!labId && !!surveys[labId]);
  }, [labId]);
  const shown = asBuilt && built ? built : design;
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    try { v.load(shown.v, shown.c); } catch { /* a model that fails to draw leaves the last one up */ }
  }, [shown, mapped]);
  const cam = (mode: string) => { setCamera(mode); const v = viewer.current; if (v) { v.hideRoof = flags.hideRoof; v.reset(mode); if (mode === "field") setFlags((f) => ({ ...f, hideRoof: true })); } };
  const flip = (k: keyof typeof flags) => { const next = { ...flags, [k]: !flags[k] }; setFlags(next); const v = viewer.current; if (v) { v[k] = next[k]; v.dirty = true; } };
  const ref = labId ? references[labId] : undefined;
  return (
    <Card title={asBuilt ? "As it stands" : designTitle} kicker={known ? "Architectural study" : "Design study"}>
      <div className="sl-stage" ref={box}>
        <div className="sl-stage-top">
          {editable && built ? (
            <div className="sl-seg" role="group" aria-label="Design or as built">
              <button aria-pressed={!asBuilt} onClick={() => setAsBuilt(false)}>Design</button>
              <button aria-pressed={asBuilt} onClick={() => setAsBuilt(true)}>As built</button>
            </div>
          ) : <span className="sl-badge">As built</span>}
          {ref && <button className="sl-photo" onClick={() => setPhoto((p) => !p)}><img src={`lab/${ref.file}`} alt="" />Photo</button>}
        </div>
        <div className="sl-stage-bottom">
          <div className="sl-seg" role="group" aria-label="Camera">
            {CAMERAS.map(([id, name]) => <button key={id} aria-pressed={camera === id} onClick={() => cam(id)}>{name}</button>)}
          </div>
          <div className="sl-seg" role="group" aria-label="View">
            <button aria-pressed={flags.rotate} title="Turn slowly" onClick={() => flip("rotate")}>Spin</button>
            <button aria-pressed={flags.hideRoof} title="Hide the roof" onClick={() => flip("hideRoof")}>Roof off</button>
            <button aria-pressed={flags.night} title="Night lighting" onClick={() => flip("night")}>Night</button>
          </div>
        </div>
      </div>
      <div className="sl-hint">
        <span>Drag to orbit, scroll or pinch to zoom, shift-drag to pan. In District, click a lot or a label.</span>
        <span>{mapped ? <>Site map <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a></> : "Directional site model, estimated footprint"}</span>
      </div>
      {label && <p className="muted">Selected: {label}</p>}
      {photo && ref && (
        <figure className="sl-figure">
          <img src={`lab/${ref.file}`} alt={building} />
          <figcaption>
            Photo: <a href={String(ref.url ?? "")} target="_blank" rel="noreferrer">{ref.title}</a> by {ref.credit},{" "}
            <a href={ref.licenseUrl} target="_blank" rel="noreferrer">{ref.license}</a>, via Wikimedia Commons. It shows the real building; the model is a study.
          </figcaption>
        </figure>
      )}
    </Card>
  );
}

function Impact({ game, view, design, quote: q, msg, start, reset }: {
  game: GameState; view: LabView; design: LabConfig; quote: ReturnType<typeof labQuote>; msg: string | null; start: () => void; reset: () => void;
}) {
  const [lines, setLines] = useState(false);
  const scale = q.estimate.total > 0 ? q.price / q.estimate.total : 1;
  const changes = q.items.length > 0;
  return (
    <Card title="What it costs and what it does" kicker={changes ? `${q.months} months of work` : "No changes yet"}>
      {!changes && <p className="muted">Change something in the plan (seats, roof, suites, parking, land) and the price, the dates and what it does to the club show here.</p>}
      {changes && <div className="sl-impact">
        <div className="sl-big"><span>Our share</span><b>{money(q.cost)}</b><small>{money(q.low)} to {money(q.high)} if it goes well or badly</small></div>
        <div className="sl-big"><span>Seats</span><b>{n(q.capacity)}</b><small>{q.delta ? `${q.delta > 0 ? "+" : ""}${n(q.delta)} from today` : "Same bowl"}{q.premium ? `, ${n(q.premium)} premium` : ""}</small></div>
        <div className="sl-big"><span>Opens</span><b>{changes ? when(q.opens) : "—"}</b><small>{q.closed ? `${n(q.closed)} seats closed in the seasons it runs through` : "Work fits in the offseason"}</small></div>
        <div className="sl-big"><span>A year at last season's numbers</span><b>{money(q.yearly)}</b><small>{q.payback ? `Pays back our share in about ${q.payback} years` : q.yearly <= 0 && changes ? "Doesn't pay for itself in money" : ""}</small></div>
      </div>}
      {changes && (
        <p className="muted">
          All in {money(q.price)} at {game.date.slice(0, 4)} prices in our city's building market, {money(q.contingency)} of our share held as contingency.{q.payer ? ` ${q.payer}.` : ""} The deposit is 20%, the rest monthly; whatever the contingency doesn't cover is paid when it opens.
        </p>
      )}
      {changes && (
        <ul className="sl-items">
          {q.items.map((it, i) => <li key={i} className={it.already ? "sl-dim" : undefined}><b>{it.label}</b><small>{it.already ?? it.does}</small></li>)}
        </ul>
      )}
      {q.blocked && changes && <Callout tone="warn">{q.blocked}</Callout>}
      {msg && <Callout>{msg}</Callout>}
      <div className="row">
        {changes && <button className="primary" disabled={!!q.blocked} onClick={start}>Start the renovation ({money(Math.round(q.cost * 0.2))} now)</button>}
        <button onClick={reset}>Back to the building as it stands</button>
        {changes && <button onClick={() => setLines((x) => !x)}>{lines ? "Hide" : "Show"} the cost breakdown</button>}
      </div>
      {lines && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Basis (2026 Stadium Lab rates)</th><th className="num">Cost now</th></tr></thead>
            <tbody>
              {q.estimate.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="muted">{l.basis}</td><td className="num">{money(l.cost * scale)}</td></tr>)}
              {q.estimate.regional ? <tr><td>City building market</td><td className="muted">{view.site} site</td><td className="num">{money(q.estimate.regional * scale)}</td></tr> : null}
              <tr><td>Design and soft costs</td><td className="muted">{design.soft}% of construction</td><td className="num">{money(q.estimate.soft * scale)}</td></tr>
              <tr><td>Contingency</td><td className="muted">{design.contingency}%</td><td className="num">{money(q.estimate.contingency * scale)}</td></tr>
              {q.estimate.land ? <tr><td>Land</td><td className="muted">Acquisition at the city's land price</td><td className="num">{money(q.estimate.land * scale)}</td></tr> : null}
              <tr><td><b>Total</b></td><td /><td className="num"><b>{money(q.price)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function History({ game, view }: { game: GameState; view: LabView }) {
  const list = (game.stadiumLab?.renovations ?? []).filter((r) => r.at === view.building);
  if (!list.length) return null;
  return (
    <Card title="Renovations here">
      {list.map((r) => (
        <p key={r.id}>
          <b>{r.title}</b>: {n(r.before.capacity)} to {n(r.capacity)} seats, {money(r.price)} all in, our share {money(r.cost)}.{" "}
          {r.opened ? `Opened ${shortDate(r.opens)}${r.overrun ? (r.overrun > 0 ? `, ${money(r.overrun)} over budget` : `, ${money(-r.overrun)} under budget`) : ""}.` : `Opens ${shortDate(r.opens)}; ${money(r.paid)} paid so far.`}
        </p>
      ))}
    </Card>
  );
}

// ---- The editor ----

export function Slider({ label, value, min, max, step, show, help, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; help?: string; onChange: (x: number) => void }) {
  return (
    <label className="sl-control">
      <span>{label}<output>{show}</output></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <p>{help}</p>}
    </label>
  );
}

export function Choose({ label, value, options, help, onChange }: { label: string; value: string; options: Record<string, string>; help?: string; onChange: (x: string) => void }) {
  return (
    <label className="sl-control">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {help && <p>{help}</p>}
    </label>
  );
}

function Num({ label, value, min, max, help, onChange }: { label: string; value: number; min: number; max: number; help?: string; onChange: (x: number) => void }) {
  return (
    <label className="sl-control">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} />
      {help && <p>{help}</p>}
    </label>
  );
}

export function Switch({ on, built, label, note, onChange }: { on: boolean; built: boolean; label: string; note: string; onChange: (x: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className="sl-switch" disabled={built} onClick={() => onChange(!on)}>
      <span><b>{label}</b><small>{built ? "Already built here" : note}</small></span>
      <span aria-hidden="true">{on ? "On" : "Off"}</span>
    </button>
  );
}

function Editor({ view, design: d, edit }: { view: LabView; design: LabConfig; edit: (p: Partial<LabConfig>) => void }) {
  const [tab, setTab] = useState<Tab>("Structure");
  const b = view.built;
  const v = view.venue;
  const facades = b.facade !== "original" ? Object.fromEntries(Object.entries(facadeLabels).filter(([k]) => k !== "original")) : facadeLabels;
  const boards = Object.fromEntries(Object.entries(BOARDS).filter(([k]) => k !== "original" || b.board === "original"));
  if (b.board !== "original") boards[b.board] = `${BOARDS[b.board]} (as built)`;
  return (
    <aside className="kit-card sl-editor">
      <h3>Renovation plan</h3>
      <div className="sl-tabs" role="group" aria-label="Editor">
        {TABS.map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === "Structure" && <>
        <Slider label="Seating change" value={d.capacity - v.capacity} min={-20000} max={25000} step={500} show={`${d.capacity - v.capacity > 0 ? "+" : ""}${n(d.capacity - v.capacity)}`}
          help={`From today's ${n(v.capacity)}. Added seats cost about $14,000 each installed (2026).`} onChange={(x) => edit({ capacity: Math.max(20000, v.capacity + x) })} />
        <Num label="Exact seats" value={d.capacity} min={Math.max(20000, v.capacity - 20000)} max={v.capacity + 25000} onChange={(x) => edit({ capacity: Math.round(Math.min(v.capacity + 25000, Math.max(20000, v.capacity - 20000, x))) })} />
        <Choose label="Roof" value={d.roof} options={roofLabels} help={d.roof !== v.roof ? "Retrofit price includes taking off what's there. A fixed or retractable roof takes games indoors." : undefined} onChange={(x) => edit({ roof: x })} />
        <Choose label="Exterior" value={d.facade} options={facades} onChange={(x) => edit({ facade: x })} />
        <label className="sl-control"><span>Seat color<output>{d.color.toUpperCase()}</output></span><input type="color" value={d.color} onChange={(e) => edit({ color: e.target.value })} /><p>New seats throughout lift demand a little.</p></label>
        <Choose label="Playing surface" value={d.surface} options={surfaceLabels} onChange={(x) => edit({ surface: x })} />
      </>}
      {tab === "Experience" && <>
        <Slider label="Premium suites" value={d.suites} min={b.suites} max={b.suites + 100} step={5} show={d.suites > b.suites ? `+${d.suites - b.suites}` : "None new"}
          help={`Each suite holds ${SUITE_SEATS} premium seats in place of general ones, at about $2.5 million (2026).`} onChange={(x) => edit({ suites: x })} />
        <Choose label="Video displays" value={d.board} options={boards} onChange={(x) => edit({ board: x })} />
        <Switch on={!!d.plaza} built={!!b.plaza} label="Fan plaza" note="Event space and landscaping" onChange={(x) => edit({ plaza: x })} />
        <Switch on={!!d.amenities} built={!!b.amenities} label="Concourse expansion" note="Food service, access and restrooms" onChange={(x) => edit({ amenities: x })} />
        <Switch on={!!d.wifi} built={!!b.wifi} label="High-density Wi-Fi" note="Connectivity for fans and sponsors" onChange={(x) => edit({ wifi: x })} />
        <Switch on={!!d.led} built={!!b.led} label="LED lighting" note="Field and architectural lighting" onChange={(x) => edit({ led: x })} />
        <Switch on={!!d.solar} built={!!b.solar} label="Solar canopy" note="Panels and controls; lower running costs" onChange={(x) => edit({ solar: x })} />
      </>}
      {tab === "Parking" && <ParkingControls view={view} d={d} edit={edit} />}
      {tab === "Land" && <LandControls view={view} d={d} edit={edit} />}
      {tab === "Budget" && <>
        <Slider label="Contingency" value={d.contingency} min={5} max={40} step={1} show={`${d.contingency}%`}
          help="Held in the budget for surprises. What it doesn't cover is paid when the work opens; what isn't used comes back." onChange={(x) => edit({ contingency: x })} />
        <p className="muted">The building market ({view.site} site), land prices, design fees (15%) and this year's construction costs come from the game, not the editor.</p>
      </>}
    </aside>
  );
}

function ParkingControls({ view, d, edit }: { view: LabView; d: LabConfig; edit: (p: Partial<LabConfig>) => void }) {
  const p = parkingPlan(view.venue, d);
  const lots = p.profile.facilities.filter((f) => f.control === "managed" && f.type === "surface");
  const maxConvert = Math.min(p.chosenLot?.spaces ?? 0, Math.floor(p.profile.rebuildAcres * 43560 / 330));
  return <>
    <p><b>{p.profile.context}</b><br /><span className="muted">{n(p.baseSurface + p.baseGarage)} spaces we run, {n(p.shared)} nearby that others run. {p.profile.acreage.toFixed(1)} acres to expand on.</span></p>
    <div className="sl-meter"><i style={{ width: `${p.profile.acreage ? Math.min(100, (p.newAcres / p.profile.acreage) * 100) : 0}%` }} /></div>
    <p className="muted">{p.newAcres.toFixed(1)} of {p.profile.acreage.toFixed(1)} acres used, room for {n(p.budget)} stalls on the ground.</p>
    <Num label="New surface spaces" value={d.parking} min={0} max={p.budget - d.garageFoot} onChange={(x) => edit({ parking: x })} />
    <Num label="New garage footprint (stalls)" value={d.garageFoot} min={0} max={p.budget - d.parking} help={`${n(d.garageFoot * d.levels)} garage spaces over ${d.levels} levels.`} onChange={(x) => edit({ garageFoot: x })} />
    <Choose label="Garage levels" value={String(d.levels)} options={{ 2: "2 levels", 3: "3 levels", 4: "4 levels", 5: "5 levels", 6: "6 levels" }} onChange={(x) => edit({ levels: Number(x) })} />
    {lots.length > 0 && <>
      <Choose label="Existing surface lot" value={d.convertLot} options={Object.fromEntries(lots.map((f) => [f.id, f.name]))} onChange={(x) => edit({ convertLot: x, convert: 0, retire: 0 })} />
      <Num label="Spaces rebuilt as a garage" value={d.convert} min={0} max={maxConvert} onChange={(x) => edit({ convert: x })} />
      <Num label="Spaces turned back to open space" value={d.retire} min={0} max={(p.chosenLot?.spaces ?? 0) - d.convert} onChange={(x) => edit({ retire: x })} />
    </>}
    <p className="muted">The cars that come, what parking costs and who keeps the money are the game's (Business, Grounds). Leasing nearby lots is there too.</p>
  </>;
}

function LandControls({ view, d, edit }: { view: LabView; d: LabConfig; edit: (p: Partial<LabConfig>) => void }) {
  const p = parcelPlan(view.venue, d);
  if (!p.all.length) return <p className="muted kit-none">No expansion zones here: the building's land is all in use, or it's a site Stadium Lab hasn't surveyed.</p>;
  const ids = new Set(String(d.parcelIds).split(",").filter(Boolean));
  const toggle = (id: string) => { ids.has(id) ? ids.delete(id) : ids.add(id); edit({ parcelMode: ids.size > 0, parcelIds: [...ids].join(",") }); };
  return <>
    <p className="muted">Buy land around the building in zones. Each zone is a study area, not a real property line; the harder ones cost more to clear and take longer to approve, which pushes back the start.</p>
    <p>{p.acres.toFixed(1)} acres chosen: {money(p.land)} land, {money(p.clearance)} clearance (2026), up to {p.approvalMonths} months of approvals.</p>
    {p.all.map((x) => (
      <button key={x.id} className="sl-parcel" aria-pressed={ids.has(x.id)} onClick={() => toggle(x.id)}>
        <span><b>{x.name}</b> {x.acres.toFixed(1)} acres</span>
        <small>{x.use}. {x.constraint}; about {x.approvalMonths} months.</small>
      </button>
    ))}
    <p className="muted">Bought zones count toward the parking you can lay out. Land is priced for a {view.site} site.</p>
  </>;
}
