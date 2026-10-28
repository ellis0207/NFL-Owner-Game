import { useMemo, useState } from "react";
import { injuryNote, mediaRank, prospectLine, prospectTotals } from "../../engine/college";
import { COLLEGE_TEAMS, CONFERENCE_IDS, CONFERENCES, DEFENSE_NAMES, OFFENSE_NAMES, REGIONS, schoolName } from "../../engine/collegeData";
import { shortDate } from "../../engine/dates";
import { POSITION_ORDER } from "../../engine/roster";
import { CLASS_LABEL, draftClass } from "../../engine/prospects";
import {
  addAssignment, budgetLeft, DEPTHS, filterLabel, knowledge, knowledgeLabel, MAX_ASSIGNMENTS, onScoutList, quote,
  removeAssignment, scoutPlayer, scoutReport, setDepth, unscoutPlayer, weeklyCost, weeksLeft,
} from "../../engine/scouting";
import { teamStaff } from "../../engine/staff";
import type { CollegeConference, CollegeDefense, CollegeOffense, GameState, Position, Region, ScoutDepth, ScoutFilter } from "../../engine/types";
import { height, money } from "../format";
import { useUi } from "../ui";

type Tab = "plan" | "board" | "reports";
const TABS: [Tab, string][] = [["plan", "Scouting plan"], ["board", "Prospects"], ["reports", "Weekly reports"]];

export function ScoutingScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [tab, setTab] = useState<Tab>("plan");
  const s = game.college!.scouting;
  const director = teamStaff(game.userTeam).COL;
  return (
    <section className="stack">
      <h2>College scouting</h2>
      <p className="muted">
        {director ? `${director.name}, our director of college scouting, runs the staff. ` : ""}
        Point the scouts at a slice of the 2027 draft class each week. Narrow assignments learn a lot about a few players;
        broad ones learn a little about many. Travel adds up, and campuses far from our building cost more to reach.
        The week's work is filed every Sunday.
      </p>
      <Budget game={game} />
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}{k === "plan" ? ` (${s.plan.length})` : ""}</button>)}
      </div>
      {tab === "plan" && <Plan game={game} changed={changed} />}
      {tab === "board" && <Board game={game} changed={changed} />}
      {tab === "reports" && <Reports game={game} />}
    </section>
  );
}

function Budget({ game }: { game: GameState }) {
  const s = game.college!.scouting;
  const left = budgetLeft(game);
  const week = weeklyCost(game);
  const weeks = weeksLeft(game);
  const lasts = week > 0 ? Math.floor(left / week) : Infinity;
  return (
    <div className="panel stack tight">
      <div className="figures" style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div className="figure"><span className="label">Budget left</span><strong>{money(left)}</strong></div>
        <div className="figure"><span className="label">Spent</span><strong>{money(s.spent)}</strong></div>
        <div className="figure"><span className="label">This week's plan</span><strong>{money(week)}</strong></div>
        <div className="figure"><span className="label">Weeks to the draft</span><strong>{weeks}</strong></div>
      </div>
      <div className="meter" aria-label="Budget used"><span style={{ width: `${Math.min(100, (100 * s.spent) / s.budget)}%`, background: "var(--team)" }} /></div>
      <span className={`muted${lasts < weeks ? " warn" : ""}`}>
        {week === 0 ? "No assignments: the scouts are sitting in the office." : lasts >= weeks ? "At this pace the budget lasts through the draft." : `At this pace the budget runs out in about ${lasts} week${lasts === 1 ? "" : "s"}, ${weeks - lasts} short of the draft.`}
      </span>
    </div>
  );
}

const SCHEMES: (CollegeOffense | CollegeDefense)[] = [...Object.keys(OFFENSE_NAMES), ...Object.keys(DEFENSE_NAMES)] as (CollegeOffense | CollegeDefense)[];
const SCHEME_LABEL: Record<string, string> = { ...OFFENSE_NAMES, ...Object.fromEntries(Object.entries(DEFENSE_NAMES).map(([k, v]) => [k, `${v} defense`])) };

function Plan({ game, changed }: { game: GameState; changed: () => void }) {
  const s = game.college!.scouting;
  const [depth, setDepthChoice] = useState<ScoutDepth>("campus");
  const [region, setRegion] = useState<Region | "">("");
  const [conf, setConf] = useState<CollegeConference | "">("");
  const [school, setSchool] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [scheme, setScheme] = useState<CollegeOffense | CollegeDefense | "">("");
  const [msg, setMsg] = useState<string | null>(null);
  const filter: ScoutFilter = {
    ...(region ? { region } : {}), ...(conf ? { conference: conf } : {}), ...(school ? { school } : {}),
    ...(positions.length ? { positions } : {}), ...(scheme ? { scheme } : {}),
  };
  const q = quote(game, { filter, depth });
  const schools = COLLEGE_TEAMS.filter((t) => (!conf || t.conference === conf) && (!region || t.region === region)).sort((a, b) => a.school.localeCompare(b.school));
  const togglePos = (p: Position) => setPositions((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));

  function add() {
    const err = addAssignment(game, filter, depth);
    setMsg(err ?? `Added: ${DEPTHS[depth].label.toLowerCase()}, ${filterLabel(filter, game)}.`);
    if (!err) changed();
  }

  return (
    <div className="stack">
      <div className="stack tight">
        <h3>This week's assignments ({s.plan.length} of {MAX_ASSIGNMENTS})</h3>
        {s.plan.length === 0 && <p className="muted">Nothing assigned yet. Build an assignment below, or add specific players from the Prospects tab or a prospect's page.</p>}
        {s.plan.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Assignment</th><th>Depth</th><th className="num">Players</th><th className="num">Schools</th><th className="num">Travel</th><th className="num">Cost</th><th className="num">Per player</th><th></th></tr></thead>
              <tbody>
                {s.plan.map((a) => {
                  const aq = quote(game, a);
                  return (
                    <tr key={a.id}>
                      <td className="name">{filterLabel(a.filter, game)}</td>
                      <td>
                        <select value={a.depth} onChange={(e) => { setDepth(game, a.id, e.target.value as ScoutDepth); changed(); }} aria-label="Depth">
                          {(Object.keys(DEPTHS) as ScoutDepth[]).map((d) => <option key={d} value={d}>{DEPTHS[d].label}</option>)}
                        </select>
                      </td>
                      <td className="num">{aq.players}</td><td className="num">{aq.schools}</td>
                      <td className="num">{money(aq.travel)}</td><td className="num">{money(aq.cost)}</td>
                      <td className="num">{infoWords(aq.perPlayer)}</td>
                      <td><button className="btn small" onClick={() => { removeAssignment(game, a.id); changed(); }}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <span className="muted">Assignments repeat every week until you change them. "Per player" is how much a week of this work adds to each player's file.</span>
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>New assignment</h3>
        <div className="tabs" role="group" aria-label="Depth">
          {(Object.keys(DEPTHS) as ScoutDepth[]).map((d) => <button key={d} aria-pressed={depth === d} onClick={() => setDepthChoice(d)}>{DEPTHS[d].label}</button>)}
        </div>
        <span className="muted">{DEPTHS[depth].detail} {depth === "film" ? "Tops out at a first look." : depth === "campus" ? "Gets us most of the picture, not the background work." : "The only way to a complete file: makeup and medical."}</span>
        <div className="btn-row">
          <select value={region} onChange={(e) => { setRegion(e.target.value as Region | ""); setSchool(""); }} aria-label="Region">
            <option value="">Any region</option>
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select value={conf} onChange={(e) => { setConf(e.target.value as CollegeConference | ""); setSchool(""); }} aria-label="Conference">
            <option value="">Any conference</option>
            {CONFERENCE_IDS.map((id) => <option key={id} value={id}>{CONFERENCES[id].name}</option>)}
          </select>
          <select value={school} onChange={(e) => setSchool(e.target.value)} aria-label="School">
            <option value="">Any school</option>
            {schools.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}
          </select>
          <select value={scheme} onChange={(e) => setScheme(e.target.value as CollegeOffense | CollegeDefense | "")} aria-label="College system">
            <option value="">Any system</option>
            {SCHEMES.map((x) => <option key={x} value={x}>{SCHEME_LABEL[x]}</option>)}
          </select>
        </div>
        <div className="tabs" role="group" aria-label="Positions">
          {POSITION_ORDER.map((p) => <button key={p} aria-pressed={positions.includes(p)} onClick={() => togglePos(p)}>{p}</button>)}
          {positions.length > 0 && <button onClick={() => setPositions([])}>All positions</button>}
        </div>
        <div>
          <strong>{filterLabel(filter, game)}</strong>
          <div className="muted">
            {q.players ? `${q.players} prospect${q.players === 1 ? "" : "s"} at ${q.schools} school${q.schools === 1 ? "" : "s"} · ${money(q.cost)} a week${q.travel ? ` (${money(q.travel)} of it travel)` : ""} · ${infoWords(q.perPlayer)} per player each week` : "No prospects match."}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={!q.players || s.plan.length >= MAX_ASSIGNMENTS} onClick={add}>Add to the plan</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>
    </div>
  );
}

/** How much a week adds to a file, in words. */
function infoWords(points: number): string {
  if (points >= 30) return "a lot";
  if (points >= 15) return "a good amount";
  if (points >= 6) return "some";
  if (points >= 2) return "a little";
  return "very little";
}

type Sort = "media" | "grade" | "know" | "name";

function Board({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const dc = draftClass(game.seed);
  const [pos, setPos] = useState<Position | "all">("all");
  const [conf, setConf] = useState<CollegeConference | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [text, setText] = useState("");
  const [sort, setSort] = useState<Sort>("media");
  const [onlyKnown, setOnlyKnown] = useState(false);
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    return dc.prospects
      .filter((p) => pos === "all" || p.position === pos)
      .filter((p) => !conf || COLLEGE_TEAMS.find((x) => x.id === p.school)!.conference === conf)
      .filter((p) => !region || COLLEGE_TEAMS.find((x) => x.id === p.school)!.region === region)
      .filter((p) => !t || p.name.toLowerCase().includes(t) || schoolName(p.school).toLowerCase().includes(t))
      .filter((p) => !onlyKnown || knowledge(game, p.id) > 0)
      .map((p) => ({ p, media: mediaRank(game, p.id), know: knowledge(game, p.id), report: scoutReport(game, p.id) }))
      .sort((a, b) => sort === "media" ? a.media - b.media
        : sort === "grade" ? (a.report.round ?? 9) - (b.report.round ?? 9) || a.media - b.media
          : sort === "know" ? b.know - a.know || a.media - b.media
            : a.p.name.localeCompare(b.p.name))
      .slice(0, 250);
  }, [dc, game, pos, conf, region, text, sort, onlyKnown, game.college!.scouting.plan.length, Object.keys(game.college!.results).length]);
  return (
    <div className="stack tight">
      <div className="btn-row">
        <input type="search" placeholder="Name or school" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | "all")} aria-label="Position">
          <option value="all">All positions</option>
          {POSITION_ORDER.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={conf} onChange={(e) => setConf(e.target.value as CollegeConference | "")} aria-label="Conference">
          <option value="">Any conference</option>
          {CONFERENCE_IDS.map((id) => <option key={id} value={id}>{CONFERENCES[id].name}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value as Region | "")} aria-label="Region">
          <option value="">Any region</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="media">Sort: media big board</option>
          <option value="grade">Sort: our grade</option>
          <option value="know">Sort: how well we know them</option>
          <option value="name">Sort: name</option>
        </select>
        <label className="toggle"><input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} /> Scouted only</label>
      </div>
      <span className="muted">Media rank is the consensus big board, which moves with what players do on Saturdays. Our grade comes only from our own scouting.</span>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th className="num">Media</th><th>Prospect</th><th>Pos</th><th>School</th><th>Class</th><th>Listed</th><th>2026 season</th><th>Our file</th><th>Our grade</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(({ p, media, know, report }) => {
              const listed = onScoutList(game, p.id);
              const hurt = injuryNote(game, p.id);
              return (
                <tr key={p.id}>
                  <td className="num">{media <= 300 ? media : "—"}</td>
                  <td className="name"><button className="link" onClick={() => ui.openProspect(p.id)}>{p.name}</button>{hurt && <span className="bad" title={hurt}> ✚</span>}</td>
                  <td>{p.position}</td>
                  <td>{schoolName(p.school)}</td>
                  <td>{p.classYear}</td>
                  <td>{height(p.heightIn)}, {p.weightLb}</td>
                  <td className="muted">{prospectLine(p, prospectTotals(game, p.id))}</td>
                  <td>{knowledgeLabel(know)}</td>
                  <td>{report.grade ?? "—"}</td>
                  <td>
                    {listed
                      ? <button className="btn small" onClick={() => { unscoutPlayer(game, p.id); changed(); }}>Stop</button>
                      : <button className="btn small" onClick={() => { scoutPlayer(game, p.id, "deep"); changed(); }}>Scout</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="muted">"Scout" adds a player to this week's deep-dive list. {CLASS_LABEL.SR}s and redshirt seniors are out of eligibility; juniors and redshirt sophomores still have to declare.</span>
    </div>
  );
}

function Reports({ game }: { game: GameState }) {
  const ui = useUi();
  const dc = draftClass(game.seed);
  const weeks = game.college!.scouting.weeks;
  if (!weeks.length) return <p className="muted">No reports yet. The scouts file every Sunday once they have assignments.</p>;
  return (
    <div className="stack">
      {weeks.map((w) => (
        <div key={w.date} className="panel stack tight">
          <strong>Week ending {shortDate(w.date)} · {money(w.cost)}</strong>
          {w.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}
          {w.learned.length > 0 && (
            <div>Learned the most about: {w.learned.map((id, i) => (
              <span key={id}>{i ? ", " : ""}<button className="link" onClick={() => ui.openProspect(id)}>{dc.byId[id].name}</button></span>
            ))}</div>
          )}
        </div>
      ))}
    </div>
  );
}
