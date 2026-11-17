// The Pro Football Hall of Fame: the newest class in bronze, the plaque and
// full career of every member, the vote by the panel of Hall of Famers, the
// classes the watchers see coming, and every class since 1963.
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, shortDate } from "../../engine/dates";
import { accomplishments, headline, hofCase, hofClasses, hofMembers, projectClasses, stillWaiting, waitLabel, type HofCase, type HofRow } from "../../engine/halloffame";
import { honors } from "../../engine/honors";
import { RULES } from "../../engine/league";
import type { GameState, HofEntry } from "../../engine/types";
import { useUi } from "../ui";

type View = "Class" | "Vote" | "Ahead" | "Classes" | "Members";
const VIEWS: [View, string][] = [["Class", "Newest class"], ["Vote", "The vote"], ["Ahead", "Coming up"], ["Classes", "Every class"], ["Members", "The members"]];

export function HallTab({ game }: { game: GameState }) {
  const [view, setView] = useState<View>("Class");
  const [sel, setSel] = useState<string | null>(null);
  const classes = useMemo(() => hofClasses(game), [game, game.date]);
  const years = Object.keys(classes).map(Number).sort((a, b) => b - a);
  const total = years.reduce((t, y) => t + classes[y].length, 0);
  const voteDay = addDays(RULES.keyDates.superBowl, -3);
  const voted = !!honors(game).hof.classes[RULES.season + 1];
  return (
    <div className="stack">
      <header className="hof-hero">
        <div className="hof-hero-mark" aria-hidden="true">HOF</div>
        <div className="hof-hero-text">
          <span className="hof-kicker">Canton, Ohio</span>
          <h3 className="hof-title">Pro Football Hall of Fame</h3>
          <span className="hof-sub">{total} enshrined in {years.length} classes since 1963. {voted ? `The class of ${RULES.season + 1} is elected.` : `The class of ${RULES.season + 1} is elected ${shortDate(voteDay)}.`}</span>
        </div>
      </header>
      <div className="tabs" role="group" aria-label="Hall of Fame">
        {VIEWS.map(([v, label]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>)}
      </div>
      {sel && <Plaque game={game} id={sel} onClose={() => setSel(null)} />}
      {view === "Class" && <NewestClass game={game} classes={classes} years={years} pick={setSel} />}
      {view === "Vote" && <Vote game={game} pick={setSel} />}
      {view === "Ahead" && <Ahead game={game} pick={setSel} />}
      {view === "Classes" && <EveryClass game={game} classes={classes} years={years} pick={setSel} />}
      {view === "Members" && <Members game={game} pick={setSel} />}
    </div>
  );
}

type Pick = (id: string) => void;

function Who({ game, id, pick }: { game: GameState; id: string; pick: Pick }) {
  const c = hofCase(game, id);
  return <button className="link" onClick={() => pick(id)}>{c?.name ?? id}</button>;
}

function list(game: GameState, ids: string[], pick: Pick) {
  return ids.map((id, i) => <span key={id}>{i ? ", " : ""}<Who game={game} id={id} pick={pick} /></span>);
}

const roleOf = (c: HofCase) => (c.kind === "player" ? c.pos ?? "" : c.kind === "coach" ? "Coach" : "Contributor");
const years = (c: HofCase) => (c.from === c.to ? `${c.from}` : `${c.from}-${c.to}`);

// ---- The bronze ----

function Bust({ c, onOpen }: { c: HofCase; onOpen: () => void }) {
  const initials = c.name.split(" ").filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  const wait = waitLabel(c);
  return (
    <button className="hof-bust" onClick={onOpen}>
      <span className="hof-medal" aria-hidden="true">{initials}</span>
      <span className="hof-bust-name">{c.name}</span>
      <span className="hof-bust-meta">{roleOf(c)} · {years(c)}</span>
      <span className="hof-bust-meta">{c.teams.slice(0, 4).join(" · ")}</span>
      <span className="hof-bust-line">{headline(c)}</span>
      {wait && <span className="hof-badge">{wait}</span>}
    </button>
  );
}

function NewestClass({ game, classes, years: ys, pick }: { game: GameState; classes: Record<number, string[]>; years: number[]; pick: Pick }) {
  const [shown, setShown] = useState(ys[0]);
  const y = shown ?? ys[0];
  const cases = (classes[y] ?? []).map((id) => hofCase(game, id)!).filter(Boolean);
  return (
    <div className="stack">
      <div className="btn-row hof-classbar">
        <h3>Class of {y}</h3>
        <label className="field">Class<select value={y} onChange={(e) => setShown(Number(e.target.value))}>{ys.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
      </div>
      {cases.length ? <div className="hof-busts">{cases.map((c) => <Bust key={c.id} c={c} onOpen={() => pick(c.id)} />)}</div> : <span className="muted">Nobody was elected that year.</span>}
    </div>
  );
}

// ---- A plaque ----

type Col = [string, string];
function columns(c: HofCase): Col[] {
  switch (c.pos) {
    case "QB": return [["g", "G"], ["cmp", "Cmp"], ["att", "Att"], ["passYds", "Yds"], ["passTd", "TD"], ["int", "Int"], ["rushYds", "Rush"], ["rushTd", "RTD"]];
    case "RB": case "FB": return [["g", "G"], ["car", "Car"], ["rushYds", "Yds"], ["rushTd", "TD"], ["rec", "Rec"], ["recYds", "RecYds"], ["recTd", "RecTD"]];
    case "WR": case "TE": return [["g", "G"], ["tgt", "Tgt"], ["rec", "Rec"], ["recYds", "Yds"], ["recTd", "TD"]];
    case "K": return [["g", "G"], ["fgm", "FGM"], ["fga", "FGA"], ["xpm", "XPM"]];
    case "P": return [["g", "G"], ["puntAvg", "Avg"]];
    case "EDGE": case "IDL": case "LB": case "CB": case "S": return [["g", "G"], ["tklSolo", "Solo"], ["tklAst", "Ast"], ["sacks", "Sacks"], ["defInt", "Int"], ["ff", "FF"], ["pd", "PD"]];
    default: return [["g", "G"]];
  }
}

const n = (v: unknown) => (typeof v === "number" && v ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1)) : "");

function CareerTable({ c }: { c: HofCase }) {
  const cols = columns(c).filter(([k]) => c.stats[k] || c.rows.some((r) => r[k]));
  if (!cols.length) return <span className="muted">{c.pos && ["OT", "OG", "C"].includes(c.pos) ? "Linemen leave no numbers: his case is the honors above and the seasons he started." : "No statistics on file for his era."}</span>;
  const rowSum = (k: string) => c.rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const main = cols.find(([k]) => k !== "g")?.[0] ?? "g";
  const before = c.rows.length && (c.stats[main] ?? 0) - rowSum(main) > 0.5 && c.rows[0].s > c.from;
  return (
    <div className="table-wrap"><table className="hof-stats">
      <thead><tr><th>Season</th><th>Club</th>{cols.map(([, l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
      <tbody>
        {before && <tr className="muted"><td>{c.from}-{c.rows[0].s - 1}</td><td>Earlier</td>{cols.map(([k]) => <td key={k} className="num">{n(Math.max(0, (c.stats[k] ?? 0) - rowSum(k)))}</td>)}</tr>}
        {c.rows.map((r: HofRow, i) => <tr key={i}><td>{r.s}</td><td>{r.t}</td>{cols.map(([k]) => <td key={k} className="num">{n(r[k])}</td>)}</tr>)}
        <tr className="hof-total"><td>Career</td><td>{c.to - c.from + 1} seasons</td>{cols.map(([k]) => <td key={k} className="num">{n(c.stats[k])}</td>)}</tr>
      </tbody>
    </table></div>
  );
}

function ballotHistory(game: GameState, id: string): { year: number; e: HofEntry; track: string }[] {
  const out: { year: number; e: HofEntry; track: string }[] = [];
  for (const [y, b] of Object.entries(honors(game).hof.ballots ?? {})) {
    for (const [track, list] of [["Modern era", b.modern], ["Senior", b.seniors], ["Coach or contributor", b.builders]] as const) {
      const e = list.find((x) => x.id === id);
      if (e) out.push({ year: Number(y), e, track });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

const STAGE: Record<number, string> = { 25: "Semifinalist", 15: "Finalist", 10: "Final 10", 5: "Final 5", 1: "Finalist" };

function Plaque({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const ui = useUi();
  const at = useRef<HTMLElement>(null);
  // Bring the plaque into view: it opens above the list that was clicked.
  useEffect(() => { at.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [id]);
  const c = hofCase(game, id);
  if (!c) return null;
  const votes = ballotHistory(game, id);
  const wait = waitLabel(c);
  return (
    <article className="hof-plaque-wrap" ref={at}>
      <div className="hof-plaque">
        <div className="hof-plaque-head">
          <span className="hof-kicker">{c.hofYear ? `Enshrined ${c.hofYear}` : c.eligible > RULES.season + 1 ? `Eligible ${c.eligible}` : "Not enshrined"}</span>
          <h3 className="hof-plaque-name">{c.name}</h3>
          <span className="hof-plaque-meta">{roleOf(c)} · {years(c)} · {c.teams.join(" · ")}</span>
          {wait && <span className="hof-badge">{wait}</span>}
        </div>
        <p className="hof-plaque-line">{headline(c)}</p>
        <ul className="hof-honors">{accomplishments(c).map((a) => <li key={a}>{a}</li>)}</ul>
      </div>
      <div className="stack hof-plaque-body">
        <div className="btn-row">
          {c.live && <button className="btn small" onClick={() => ui.openPlayer(c.id)}>Player page</button>}
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        {c.kind === "player" && <CareerTable c={c} />}
        {votes.length > 0 && (
          <div className="stack tight">
            <h3>On the ballot</h3>
            {votes.map(({ year, e, track }) => <span key={year}>{year}: {track.toLowerCase()} {STAGE[e.stage].toLowerCase()}{e.share !== undefined ? `, ${e.share}% of the panel` : ""}{e.elected ? ". Elected." : e.why ? `. ${e.why}` : "."}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}

// ---- The vote ----

function Vote({ game, pick }: { game: GameState; pick: Pick }) {
  const ballots = honors(game).hof.ballots ?? {};
  const ys = Object.keys(ballots).map(Number).sort((a, b) => b - a);
  const [shown, setShown] = useState(ys[0]);
  const y = shown ?? ys[0];
  const b = y ? ballots[y] : undefined;
  const about = (
    <p className="muted">A panel of 48 living Hall of Fame players votes each year. The Hall cuts the eligible list to 25 semifinalists and the panel to 15 finalists; two reduction votes take them to 10 and then 5, and each of the last five needs a yes from 80 percent of the panel. One senior (retired more than 25 seasons) and one coach or contributor get their own yes-or-no vote. Every voter judges a career his own way, and some hold a man's conduct or his fights with the press against him.</p>
  );
  if (!b) return <div className="panel stack tight"><h3>The vote</h3>{about}<span className="muted">No vote yet in this save. The first is three days before the Super Bowl; see Coming up for how the watchers expect it to go.</span></div>;
  const row = (e: HofEntry) => {
    const c = hofCase(game, e.id)!;
    return (
      <tr key={e.id} className={e.elected ? "hof-in" : ""}>
        <td className="name"><Who game={game} id={e.id} pick={pick} /></td><td>{roleOf(c)}</td><td className="num">{e.year}</td>
        <td>{STAGE[e.stage]}</td><td className="num">{e.share !== undefined ? `${e.share}%` : ""}</td>
        <td>{e.elected ? <strong className="hof-elected">Elected</strong> : <span className="muted">{e.why}</span>}</td>
      </tr>
    );
  };
  const finalists = b.modern.filter((e) => e.stage <= 15).sort((a, b2) => a.stage - b2.stage || (b2.share ?? 0) - (a.share ?? 0));
  return (
    <div className="stack">
      <div className="btn-row hof-classbar">
        <h3>Vote for the class of {y}</h3>
        {ys.length > 1 && <label className="field">Year<select value={y} onChange={(e) => setShown(Number(e.target.value))}>{ys.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
      </div>
      {about}
      <div className="table-wrap"><table>
        <thead><tr><th>Finalist</th><th>Pos</th><th className="num">Year</th><th>Reached</th><th className="num">Yes</th><th>Result</th></tr></thead>
        <tbody>{[...finalists, ...b.seniors, ...b.builders].map(row)}</tbody>
      </table></div>
      <span className="muted">Also semifinalists: {list(game, b.modern.filter((e) => e.stage === 25).map((e) => e.id), pick)}.</span>
      <span className="muted">The panel: {list(game, b.panel.slice(0, 12), pick)} and {Math.max(0, b.panel.length - 12)} more.</span>
    </div>
  );
}

// ---- Coming up ----

function Ahead({ game, pick }: { game: GameState; pick: Pick }) {
  const proj = useMemo(() => projectClasses(game, 4), [game, game.date]);
  const waiting = useMemo(() => stillWaiting(game, 12), [game, game.date]);
  return (
    <div className="stack">
      <p className="muted">How the Hall watchers see the next classes, from the candidates eligible so far. Careers still being played can't be in it yet, and the panel has surprised them before.</p>
      <div className="split">
        {proj.map((p) => (
          <div key={p.year} className="panel stack tight hof-proj">
            <h3>Class of {p.year}</h3>
            {p.ids.length ? p.ids.map((id) => { const c = hofCase(game, id)!; return <span key={id}><Who game={game} id={id} pick={pick} /> <span className="muted">{roleOf(c)}{c.eligible === p.year ? ", first year eligible" : ""}</span></span>; }) : <span className="muted">No one projected yet.</span>}
          </div>
        ))}
      </div>
      <div className="panel stack tight">
        <h3>Still waiting</h3>
        <span className="muted">The strongest cases the panel has passed over, and how long they have waited.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Player</th><th>Pos</th><th>Career</th><th>Record</th><th className="num">Years waited</th></tr></thead>
          <tbody>{waiting.map(({ c, years: w }) => <tr key={c.id}><td className="name"><Who game={game} id={c.id} pick={pick} /></td><td>{roleOf(c)}</td><td>{years(c)}</td><td className="muted">{headline(c)}</td><td className="num">{w}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ---- Every class and every member ----

function EveryClass({ game, classes, years: ys, pick }: { game: GameState; classes: Record<number, string[]>; years: number[]; pick: Pick }) {
  const decades = [...new Set(ys.map((y) => Math.floor(y / 10) * 10))];
  return (
    <div className="stack">
      {decades.map((d, i) => (
        <details key={d} className="panel" open={i === 0}>
          <summary><strong>{d}s</strong> <span className="muted">{ys.filter((y) => Math.floor(y / 10) * 10 === d).reduce((t, y) => t + classes[y].length, 0)} enshrined</span></summary>
          <div className="stack tight">{ys.filter((y) => Math.floor(y / 10) * 10 === d).map((y) => <span key={y}><strong>{y}</strong>: {classes[y].length ? list(game, classes[y], pick) : <span className="muted">nobody elected</span>}</span>)}</div>
        </details>
      ))}
    </div>
  );
}

const GROUPS: [string, string[]][] = [["All", []], ["Quarterbacks", ["QB"]], ["Running backs", ["RB", "FB"]], ["Receivers", ["WR", "TE"]], ["Line", ["OT", "OG", "C"]], ["Defensive line", ["EDGE", "IDL"]], ["Linebackers", ["LB"]], ["Secondary", ["CB", "S"]], ["Kickers", ["K", "P", "LS"]], ["Coaches", ["coach"]], ["Contributors", ["contributor"]]];

function Members({ game, pick }: { game: GameState; pick: Pick }) {
  const [g, setG] = useState("All");
  const [q, setQ] = useState("");
  const all = useMemo(() => hofMembers(game).map((id) => hofCase(game, id)!).filter(Boolean), [game, game.date]);
  const want = GROUPS.find(([l]) => l === g)![1];
  const rows = all.filter((c) => (!want.length || want.includes(c.kind === "player" ? c.pos ?? "" : c.kind)) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.teams.some((t) => t.toLowerCase() === q.toLowerCase())))
    .sort((a, b) => (b.hofYear ?? 0) - (a.hofYear ?? 0) || a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <div className="btn-row">
        <label className="field">Position<select value={g} onChange={(e) => setG(e.target.value)}>{GROUPS.map(([l]) => <option key={l}>{l}</option>)}</select></label>
        <label className="field">Name or club<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Rice or PIT" /></label>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Pos</th><th>Career</th><th>Clubs</th><th className="num">Class</th><th className="num">PB</th><th className="num">All-Pro</th><th className="num">Titles</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td className="name"><button className="link" onClick={() => pick(c.id)}>{c.name}</button></td><td>{roleOf(c)}</td><td>{years(c)}</td><td className="muted">{c.teams.slice(0, 4).join(", ")}</td><td className="num">{c.hofYear}</td><td className="num">{c.pb || ""}</td><td className="num">{c.ap || ""}</td><td className="num">{c.rings || ""}</td></tr>)}</tbody>
      </table></div>
      <span className="muted">{rows.length} of {all.length}. Pro Bowls count each era's all-star game; All-Pro counts first-team selections; titles count league championships, Super Bowls included.</span>
    </div>
  );
}
