// The Media page's reading side: front pages per outlet (national and every
// club's local media) with search, a story page with its follow-ups, and a
// page for each reporter with their record. Reporters' names carry hover cards.
import { useMemo, useState } from "react";
import { daysBetween, shortDate, weekday } from "../../engine/dates";
import { PLAYER_BY_ID, TEAM_BY_ID, TEAMS } from "../../engine/league";
import { corps, isLocal, outletOf, recordLine, working } from "../../engine/media/corps";
import { FORMATS, type FormatId } from "../../engine/media/formats";
import { NATIONAL, relLabel } from "../../engine/outlets";
import type { GameState, Reporter, Story } from "../../engine/types";
import { tip } from "../tip";
import { useUi } from "../ui";
import { AccessSelect } from "./MediaDesk";

export const KIND_LABEL: Record<Story["kind"], string> = {
  recap: "Game", injury: "Injury", signing: "Signing", release: "Release", trade: "Trade", rumor: "Rumor", leak: "Leak",
  interview: "Interview", trend: "Analysis", rankings: "Rankings", preview: "Preview", college: "College", draft: "Draft", owner: "Owner", league: "League",
};
export const ROLE: Record<string, string> = { insider: "Insider", columnist: "Columnist", analyst: "Analyst", draft: "Draft", reporter: "Reporter", beat: "Beat writer", host: "Host", anchor: "Anchor" };

const FILTERS = { all: "Everything", ours: "Our team", nfl: "NFL", rumors: "Rumors and leaks", college: "College and draft", owner: "About you" } as const;
type Filter = keyof typeof FILTERS;

function matches(s: Story, f: Filter, us: string): boolean {
  if (f === "all") return true;
  if (f === "ours") return !!s.teams?.includes(us) || s.kind === "owner";
  if (f === "nfl") return !s.college;
  if (f === "rumors") return s.kind === "rumor" || s.kind === "leak";
  if (f === "college") return !!s.college || s.kind === "draft";
  return s.kind === "owner";
}

/** Which stories an edition carries: one outlet, all national, or a club's local media. */
function inEdition(id: string, edition: string): boolean {
  if (edition === "national") return !isLocal(id);
  if (edition.startsWith("club:")) {
    const t = edition.slice(5);
    return isLocal(id) && id.endsWith(`:${t}`);
  }
  return id === edition;
}

/** How prominently a story plays: our club and the owner first, then big news kinds, then long reads. */
function weight(s: Story, us: string): number {
  const k: Partial<Record<Story["kind"], number>> = { trade: 5, signing: 4, recap: 4, owner: 4, injury: 3, rumor: 3, leak: 3, release: 2 };
  return (k[s.kind] ?? 1) + (s.teams?.includes(us) ? 3 : 0) + (s.format === "feature" ? 1 : 0) + Math.min(2, s.body.length / 600);
}

/** A reporter's name: a hover card, and a click opens their page. */
export function ReporterName({ id, name, onOpen }: { id?: string; name: string; onOpen?: (id: string) => void }) {
  if (!id) return <>{name}</>;
  return <button className="link" {...tip("reporter", id)} onClick={() => onOpen?.(id)}>{name}</button>;
}

export function FrontPage({ game, openStory, openReporter }: { game: GameState; openStory: (id: string) => void; openReporter: (id: string) => void }) {
  const us = game.userTeam;
  const [edition, setEdition] = useState("national");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(40);
  const all = game.media?.stories ?? [];
  const stories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => matches(s, filter, us) && (q ? `${s.headline} ${s.body} ${s.by}`.toLowerCase().includes(q) : inEdition(s.outlet, edition)));
  }, [all, all.length, filter, query, edition, us]);
  const day = stories[0]?.date;
  const today = query ? [] : stories.filter((s) => s.date === day).sort((a, b) => weight(b, us) - weight(a, us));
  const [lead, ...rest] = today;
  const earlier = query ? stories : stories.filter((s) => s.date !== day);
  let lastDate = "";
  return (
    <div className="stack">
      <div className="btn-row" style={{ alignItems: "center" }}>
        <label className="field">
          <select value={edition} onChange={(e) => { setEdition(e.target.value); setShown(40); }} aria-label="Edition">
            <optgroup label="National">
              <option value="national">All national outlets</option>
              {NATIONAL.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </optgroup>
            <optgroup label="Our local media">
              {[`local:${us}`, `radio:${us}`, `tv:${us}`].map((id) => <option key={id} value={id}>{outletOf(id).name}</option>)}
            </optgroup>
            <optgroup label="Every club's local media">
              {TEAMS.map((t) => <option key={t.id} value={`club:${t.id}`}>{t.city} {t.name}</option>)}
            </optgroup>
          </select>
        </label>
        <input type="search" placeholder="Search every story" value={query} onChange={(e) => { setQuery(e.target.value); setShown(40); }} aria-label="Search stories" style={{ flex: "1 1 14rem" }} />
      </div>
      <div className="tabs" role="group" aria-label="Filter">
        {(Object.keys(FILTERS) as Filter[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(40); }}>{FILTERS[f]}</button>)}
      </div>
      {stories.length === 0 && <p className="muted">{query ? "No stories match." : "Nothing in this edition yet. The outlets file every day as the league moves."}</p>}
      {lead && (
        <section className="mp-front">
          <span className="muted small">{weekday(lead.date)}, {shortDate(lead.date)}</span>
          <article className="mp-lead">
            <button className="link mp-head" onClick={() => openStory(lead.id)}>{lead.headline}</button>
            <div className="muted small">{outletOf(lead.outlet).name} · <ReporterName id={lead.reporter} name={lead.by} onOpen={openReporter} /></div>
            <p className="body">{lead.body.length > 420 ? `${lead.body.slice(0, 400).replace(/\s+\S*$/, "")}...` : lead.body}</p>
          </article>
          {rest.length > 0 && (
            <div className="mp-grid">
              {rest.slice(0, 9).map((s) => (
                <article key={s.id} className={`mp-card${s.teams?.includes(us) || s.kind === "owner" ? " ours" : ""}`}>
                  <span className={`pill kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  <button className="link" onClick={() => openStory(s.id)}>{s.headline}</button>
                  <span className="muted small">{outletOf(s.outlet).name} · {s.by}</span>
                </article>
              ))}
            </div>
          )}
          {rest.length > 9 && <div className="muted small">{rest.length - 9} more stories today below.</div>}
        </section>
      )}
      <div className="news-feed">
        {[...(query ? [] : rest.slice(9)), ...earlier].slice(0, shown).map((s) => {
          const head = s.date !== lastDate ? <h3 className="news-date">{weekday(s.date)}, {shortDate(s.date)}</h3> : null;
          lastDate = s.date;
          return (
            <div key={s.id}>
              {head}
              <Headline game={game} s={s} openStory={openStory} />
            </div>
          );
        })}
      </div>
      {earlier.length > shown && <button className="btn" onClick={() => setShown(shown + 60)}>Show more</button>}
    </div>
  );
}

function Headline({ game, s, openStory }: { game: GameState; s: Story; openStory: (id: string) => void }) {
  return (
    <article className={`story${s.teams?.includes(game.userTeam) || s.kind === "owner" ? " ours" : ""}`}>
      <button className="head" onClick={() => openStory(s.id)}>
        <span className={`pill kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
        <strong className="headline">{s.headline}</strong>
        <span className="muted byline">{outletOf(s.outlet).name} · {s.by}{s.format && FORMATS[s.format as FormatId] ? ` · ${FORMATS[s.format as FormatId].label}` : ""}</span>
      </button>
    </article>
  );
}

/** Stories about the same thing: the same players, or the same club and kind of news, within a month. */
function related(all: Story[], s: Story): { before: Story[]; after: Story[] } {
  const fact = s.type?.split("/")[0];
  const players = new Set(s.players ?? []);
  const teams = new Set(s.teams ?? []);
  const near = all.filter((x) => x.id !== s.id && Math.abs(daysBetween(x.date, s.date)) <= 30 && (
    (x.players ?? []).some((p) => players.has(p)) || (!!fact && x.type?.split("/")[0] === fact && (x.teams ?? []).some((t) => teams.has(t)))
  ));
  return { before: near.filter((x) => x.date < s.date).slice(0, 5), after: near.filter((x) => x.date >= s.date).reverse().slice(0, 8) };
}

export function StoryPage({ game, id, openStory, openReporter, back }: { game: GameState; id: string; openStory: (id: string) => void; openReporter: (id: string) => void; back: () => void }) {
  const ui = useUi();
  const all = game.media?.stories ?? [];
  const s = all.find((x) => x.id === id);
  if (!s) return <div className="stack"><button className="btn" onClick={back}>Back</button><p className="muted">That story has dropped out of the archive.</p></div>;
  const { before, after } = related(all, s);
  const list = (xs: Story[]) => xs.map((x) => <div key={x.id}><span className="muted small">{shortDate(x.date)} · {outletOf(x.outlet).name}</span> <button className="link" onClick={() => openStory(x.id)}>{x.headline}</button></div>);
  return (
    <div className="stack">
      <div><button className="btn small" onClick={back}>Back</button></div>
      <article className="panel stack tight mp-story">
        <span className="muted small"><span className={`pill kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span> {weekday(s.date)}, {shortDate(s.date)} · {outletOf(s.outlet).name}{s.format && FORMATS[s.format as FormatId] ? ` · ${FORMATS[s.format as FormatId].label}` : ""}</span>
        <h3>{s.headline}</h3>
        <div className="muted">By <ReporterName id={s.reporter} name={s.by} onOpen={openReporter} /></div>
        <p className="body">{s.body}</p>
        <div className="btn-row related">
          {s.gameId && game.box[s.gameId] && <button className="btn small" onClick={() => ui.openBox(s.gameId!)}>Box score</button>}
          {[...new Set(s.players ?? [])].filter((p) => PLAYER_BY_ID[p]).map((p) => <button key={p} className="link" {...tip("player", p)} onClick={() => ui.openPlayer(p)}>{PLAYER_BY_ID[p].name}</button>)}
          {[...new Set(s.teams ?? [])].filter((t) => TEAM_BY_ID[t]).map((t) => <span key={t} className="tip-name" {...tip("team", t)}>{TEAM_BY_ID[t].name}</span>)}
        </div>
      </article>
      {after.length > 0 && <section className="panel stack tight"><h3>Follow-ups</h3>{list(after)}</section>}
      {before.length > 0 && <section className="panel stack tight"><h3>Earlier</h3>{list(before)}</section>}
    </div>
  );
}

const OUTCOME = { hit: "Confirmed", miss: "Wrong", quiet: "Went quiet" } as const;

export function ReporterPage({ game, id, openStory, back, changed }: { game: GameState; id: string; openStory: (id: string) => void; back: () => void; changed: () => void }) {
  const r = corps(game).people.find((p) => p.id === id);
  if (!r) return <div className="stack"><button className="btn" onClick={back}>Back</button><p className="muted">No such reporter.</p></div>;
  const stories = (game.media?.stories ?? []).filter((s) => s.reporter === r.id || (!s.reporter && s.by === r.name)).slice(0, 25);
  const reports = corps(game).rumors.filter((x) => x.reporter === r.id && x.headline).slice(0, 20);
  return (
    <div className="stack">
      <div><button className="btn small" onClick={back}>Back</button></div>
      <section className="panel stack tight">
        <h3>{r.name}</h3>
        <div className="muted">{ROLE[r.role]}, {outletOf(r.outlet).name}{r.team && TEAM_BY_ID[r.team] ? `, covers the ${TEAM_BY_ID[r.team].name}` : ""} · since {r.since}{r.retired !== undefined ? " · retired" : ""}</div>
        <div>{recordLine(r)}</div>
        {r.awards.length > 0 && <div className="muted small">Awards: {r.awards.map((a) => `${a.name} ${a.season}`).join(", ")}</div>}
        <div><span className="label">How they cover you</span> {relLabel(r.rel)}</div>
        {r.retired === undefined && <div><span className="label">Access</span> <AccessSelect game={game} id={r.id} changed={changed} /></div>}
      </section>
      <section className="panel stack tight">
        <h3>Reports</h3>
        {reports.length === 0 ? <p className="muted">No sourced reports on the record.</p> : reports.map((x) => (
          <div key={x.id}><span className="muted small">{shortDate(x.date)}</span> {x.headline} <span className="pill">{x.outcome ? OUTCOME[x.outcome] : "Open"}</span></div>
        ))}
      </section>
      <section className="panel stack tight">
        <h3>Recent stories</h3>
        {stories.length === 0 ? <p className="muted">Nothing in the archive.</p> : stories.map((s) => (
          <div key={s.id}><span className="muted small">{shortDate(s.date)}</span> <button className="link" onClick={() => openStory(s.id)}>{s.headline}</button></div>
        ))}
      </section>
    </div>
  );
}

/** Every working reporter: search, a page each, records and access. */
export function ReporterList({ game, openReporter, changed }: { game: GameState; openReporter: (id: string) => void; changed: () => void }) {
  const us = game.userTeam;
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"ours" | "national" | "all">("ours");
  const people = working(game).filter((p: Reporter) =>
    (scope === "all" || (scope === "ours" ? p.team === us && isLocal(p.outlet) : !isLocal(p.outlet))) &&
    (!q || `${p.name} ${outletOf(p.outlet).name}`.toLowerCase().includes(q.toLowerCase())));
  people.sort((a, b) => (b.hits - b.misses) - (a.hits - a.misses) || a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <div className="btn-row" style={{ alignItems: "center" }}>
        <div className="tabs" role="group" aria-label="Reporters">
          {([["ours", "Our local media"], ["national", "National"], ["all", "Everyone"]] as const).map(([k, l]) => <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>)}
        </div>
        <input type="search" placeholder="Find a reporter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a reporter" style={{ flex: "1 1 12rem" }} />
      </div>
      <p className="muted">Reports are judged when the trade, signing, hire or firing happens, or when it plainly doesn't. Favored reporters get the first questions and the first calls (up to three); a banned one loses the credential, and the rest of the press notices.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Reporter</th><th>Outlet</th><th>Record</th><th>Access</th></tr></thead>
        <tbody>
          {people.slice(0, 80).map((p) => (
            <tr key={p.id}>
              <td><ReporterName id={p.id} name={p.name} onOpen={openReporter} /> <span className="muted small">{ROLE[p.role]}</span></td>
              <td>{outletOf(p.outlet).name}</td>
              <td className="small">{recordLine(p)}</td>
              <td><AccessSelect game={game} id={p.id} changed={changed} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
