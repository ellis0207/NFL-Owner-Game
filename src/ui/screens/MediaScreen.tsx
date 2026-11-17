import { FORMATS, type FormatId } from "../../engine/media/formats";
import { initialTab } from "../ui";
import { useMemo, useState } from "react";
import { shortDate, weekday } from "../../engine/dates";
import { PLAYER_BY_ID, teamLabel } from "../../engine/league";
import { NATIONAL, relLabel, relOf } from "../../engine/outlets";
import { corps, isLocal, outletOf, recordLine, working } from "../../engine/media/corps";
import { expectLabel } from "../../engine/review";
import { gradePoints } from "../../engine/grades";
import { TEAMS } from "../../engine/league";
import { answerQuestion, openQuestions } from "../../engine/press";
import { draftClass } from "../../engine/prospects";
import type { GameState, PressQuestion, Story, Storyline } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";
import { tip } from "../tip";

const TABS = ["News", "Press room", "Storylines", "Outlets", "Reporters"] as const;
type Tab = (typeof TABS)[number];

const FILTERS = {
  all: "Everything",
  ours: "Our team",
  nfl: "NFL",
  rumors: "Rumors and leaks",
  college: "College and draft",
  owner: "About you",
} as const;
type Filter = keyof typeof FILTERS;

const KIND_LABEL: Record<Story["kind"], string> = {
  recap: "Game", injury: "Injury", signing: "Signing", release: "Release", trade: "Trade", rumor: "Rumor", leak: "Leak",
  interview: "Interview", trend: "Analysis", rankings: "Rankings", preview: "Preview", college: "College", draft: "Draft", owner: "Owner", league: "League",
};

function outletMatch(id: string, want: string, us: string): boolean {
  if (!want) return true;
  if (want === "local:us") return id === "beat" || (isLocal(id) && id.endsWith(`:${us}`));
  if (want === "local:all") return isLocal(id);
  return id === want;
}

function matches(s: Story, f: Filter, us: string): boolean {
  if (f === "all") return true;
  if (f === "ours") return !!s.teams?.includes(us) || s.kind === "owner";
  if (f === "nfl") return !s.college;
  if (f === "rumors") return s.kind === "rumor" || s.kind === "leak";
  if (f === "college") return !!s.college || s.kind === "draft";
  return s.kind === "owner";
}

export function MediaScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const open = openQuestions(game);
  const [tab, setTab] = useState<Tab>(() => initialTab("Media", TABS, open.length ? "Press room" : "News"));
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Media</h2>
        <div className="tabs" role="group" aria-label="Media">
          {TABS.map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}{t === "Press room" && open.length > 0 ? ` (${open.length})` : ""}
            </button>
          ))}
        </div>
      </div>
      {tab === "News" && <NewsFeed game={game} />}
      {tab === "Press room" && <PressRoom game={game} changed={changed} />}
      {tab === "Storylines" && <Storylines game={game} />}
      {tab === "Outlets" && <Outlets game={game} />}
      {tab === "Reporters" && <Reporters game={game} />}
    </section>
  );
}

function NewsFeed({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [outlet, setOutlet] = useState<string>("");
  const [shown, setShown] = useState(60);
  const stories = useMemo(
    () => (game.media?.stories ?? []).filter((s) => matches(s, filter, game.userTeam) && outletMatch(s.outlet, outlet, game.userTeam)),
    [game.media?.stories, game.media?.stories.length, filter, outlet, game.userTeam],
  );
  let lastDate = "";
  return (
    <div className="stack">
      <div className="btn-row" style={{ alignItems: "center" }}>
        <div className="tabs" role="group" aria-label="Filter">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(60); }}>{FILTERS[f]}</button>
          ))}
        </div>
        <label className="field" style={{ marginLeft: "auto" }}>
          <select value={outlet} onChange={(e) => { setOutlet(e.target.value); setShown(60); }} aria-label="Outlet">
            <option value="">All outlets</option>
            {NATIONAL.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="local:us">Our local media</option>
            <option value="local:all">Every club's local media</option>
          </select>
        </label>
      </div>
      {stories.length === 0 && <p className="muted">Nothing here yet. The outlets file every day as the league moves.</p>}
      <div className="news-feed">
        {stories.slice(0, shown).map((s) => {
          const head = s.date !== lastDate ? <h3 className="news-date">{weekday(s.date)}, {shortDate(s.date)}</h3> : null;
          lastDate = s.date;
          return (
            <div key={s.id}>
              {head}
              <StoryCard game={game} s={s} />
            </div>
          );
        })}
      </div>
      {stories.length > shown && <button className="btn" onClick={() => setShown(shown + 60)}>Show more</button>}
    </div>
  );
}

export function StoryCard({ game, s, compact }: { game: GameState; s: Story; compact?: boolean }) {
  const ui = useUi();
  const [open, setOpen] = useState(!compact && (s.kind === "owner" || s.teams?.includes(game.userTeam) === true));
  const o = outletOf(s.outlet);
  const dc = s.prospects?.length && game.college ? draftClass(game.seed) : null;
  return (
    <article className={`story${s.teams?.includes(game.userTeam) || s.kind === "owner" ? " ours" : ""}`}>
      <button className="head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`pill kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
        <strong className="headline">{s.headline}</strong>
        <span className="muted byline">{o?.name ?? s.outlet} · {s.by}{s.format && FORMATS[s.format as FormatId] ? ` · ${FORMATS[s.format as FormatId].label}` : ""}</span>
      </button>
      {open && (
        <>
          <p className="body">{s.body}</p>
          {(s.players?.length || s.prospects?.length || s.gameId) && (
            <div className="btn-row related">
              {s.gameId && game.box[s.gameId] && <button className="btn small" onClick={() => ui.openBox(s.gameId!)}>Box score</button>}
              {[...new Set(s.players ?? [])].filter((id) => PLAYER_BY_ID[id]).map((id) => (
                <button key={id} className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>
              ))}
              {dc && [...new Set(s.prospects ?? [])].filter((id) => dc.byId[id] && !PLAYER_BY_ID[id]).map((id) => (
                <button key={id} className="link" onClick={() => ui.openProspect(id)}>{dc.byId[id].name}</button>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function PressRoom({ game, changed }: { game: GameState; changed: () => void }) {
  const open = openQuestions(game);
  const past = (game.media?.questions ?? []).filter((q) => q.answer !== undefined).slice(0, 30);
  return (
    <div className="stack">
      <p className="muted">
        Reporters want your comment when something happens to the team. What you say gets printed, and it can matter to
        players, the coaches, agents, fans and the league office in ways you won't see right away. Questions you don't answer in time get a "declined to comment."
      </p>
      {open.length === 0 && <p className="panel muted">No requests for comment right now.</p>}
      {open.map((q) => <QuestionCard key={q.id} game={game} q={q} changed={changed} />)}
      {past.length > 0 && (
        <section className="panel stack tight">
          <h3>What you've said</h3>
          {past.map((q) => (
            <div key={q.id} className="said">
              <span className="muted">{shortDate(q.answeredOn ?? q.date)} · {outletOf(q.outlet).name}</span>
              <div><strong>{q.question}</strong></div>
              <div>{q.answer === -1 || q.options[q.answer!]?.key === "noComment" ? <span className="muted">Declined to comment.</span> : <>"{q.options[q.answer!]?.text}"</>}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function QuestionCard({ game, q, changed }: { game: GameState; q: PressQuestion; changed: () => void }) {
  const o = outletOf(q.outlet);
  return (
    <section className="panel stack tight question">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">{q.by}, {o?.name}</span>
        <span className="muted">Answer by {shortDate(q.expires)}</span>
      </div>
      <p className="muted">{q.context}</p>
      <p className="ask">"{q.question}"</p>
      <div className="answers">
        {q.options.map((opt, i) => (
          <button key={opt.key} className="btn answer" onClick={() => { answerQuestion(game, q.id, i); changed(); }}>
            {opt.key === "noComment" ? <span className="muted">{opt.text}</span> : opt.text}
          </button>
        ))}
      </div>
    </section>
  );
}

const ROLE: Record<string, string> = { insider: "Insider", columnist: "Columnist", analyst: "Analyst", draft: "Draft", reporter: "Reporter", beat: "Beat writer", host: "Host", anchor: "Anchor" };

function Staff({ game, outlet }: { game: GameState; outlet: string }) {
  const people = working(game).filter((p) => p.outlet === outlet);
  return (
    <div className="stack tight">
      {people.map((p) => (
        <div key={p.id}>
          <strong>{p.name}</strong> <span className="muted">{ROLE[p.role]}{p.awards.length ? ` · ${p.awards.map((a) => `${a.name} ${a.season}`).join(", ")}` : ""}</span>
          <div className="muted small">{recordLine(p)}</div>
        </div>
      ))}
    </div>
  );
}

function Outlets({ game }: { game: GameState }) {
  const fines = game.media?.fines ?? [];
  const us = game.userTeam;
  return (
    <div className="stack">
      <h3>National</h3>
      <div className="split">
        {NATIONAL.map((o) => (
          <section key={o.id} className="panel stack tight">
            <h3>{o.name}</h3>
            <p className="muted">{o.what}</p>
            <Staff game={game} outlet={o.id} />
            <div><span className="label">How they cover you</span> {relLabel(relOf(game, o.id))}</div>
          </section>
        ))}
      </div>
      <h3>Our local media</h3>
      <div className="split">
        {[`local:${us}`, `radio:${us}`, `tv:${us}`].map((id) => (
          <section key={id} className="panel stack tight">
            <h3>{outletOf(id).name}</h3>
            <p className="muted">{outletOf(id).what}</p>
            <Staff game={game} outlet={id} />
          </section>
        ))}
      </div>
      <section className="panel stack tight">
        <h3>League fines</h3>
        {fines.length === 0 ? <p className="muted">The league office hasn't fined you.</p>
          : fines.map((f, i) => <div key={i}>{shortDate(f.date)}: {money(f.amount)} for {f.reason}.</div>)}
      </section>
      <p className="muted">{teamLabel(game.userTeam)} media relations keeps an eye on the coverage; nobody hands you a scorecard.</p>
    </div>
  );
}

const OUTCOME = { hit: "Confirmed", miss: "Wrong", quiet: "Went quiet" } as const;

/** Who broke what, and whether it turned out to be true: the only way to learn whom to believe. */
function Reporters({ game }: { game: GameState }) {
  const c = corps(game);
  const byId = new Map(c.people.map((p) => [p.id, p]));
  const judged = working(game).filter((p) => p.hits + p.misses >= 3).sort((a, b) => b.hits / (b.hits + b.misses) - a.hits / (a.hits + a.misses) || b.hits - a.hits);
  const reports = c.rumors.filter((r) => r.headline).slice(0, 40);
  return (
    <div className="stack">
      <section className="panel stack tight">
        <h3>Track records</h3>
        <p className="muted">Reports are judged when the trade, signing, hire or firing happens, or when it plainly doesn't.</p>
        {judged.length === 0 ? <p className="muted">Nobody has enough reports on the record yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Reporter</th><th>Outlet</th><th>Record</th></tr></thead>
            <tbody>
              {judged.slice(0, 30).map((p) => (
                <tr key={p.id}><td>{p.name}</td><td>{outletOf(p.outlet).name}</td><td>{recordLine(p)}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      <section className="panel stack tight">
        <h3>Recent reports</h3>
        {reports.length === 0 ? <p className="muted">No sourced reports yet.</p> : reports.map((r) => (
          <div key={r.id}>
            <span className="muted">{shortDate(r.date)}</span> {r.headline} <span className="muted">· {byId.get(r.reporter)?.name}</span>{" "}
            <span className="pill">{r.outcome ? OUTCOME[r.outcome] : "Open"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function Storylines({ game }: { game: GameState }) {
  const r = game.review;
  const grades = r?.grades;
  const us = game.userTeam;
  const rank = (outlet: string) => 1 + TEAMS.filter((t) => gradePoints(grades![outlet][t.id]) > gradePoints(grades![outlet][us])).length;
  const list = (items: Storyline[]) => items.map((s) => (
    <div key={s.id} className="report">
      <strong>{s.title}</strong>
      <span className="muted">{outletOf(s.outlet).name}{s.status === "open" ? "" : s.status === "answered" ? ": answered" : ": still open"}</span>
      {s.verdict && <span>{s.verdict}</span>}
    </div>
  ));
  return (
    <div className="stack">
      {r?.expect ? (
        <section className="panel stack tight">
          <h3>{r.season} season</h3>
          <span>Fans expect about {r.expect.wins} wins. {expectLabel(r.expect.wins)}.</span>
          {r.storylines.length ? list(r.storylines) : <span className="muted">The media haven't settled on their storylines yet.</span>}
        </section>
      ) : (
        <p className="muted">Fans and the media set their expectations in late June, once the offseason's work is done.</p>
      )}
      {grades && (
        <section className="panel stack tight">
          <h3>Offseason grades</h3>
          {Object.keys(grades).map((o) => <span key={o}>{o}: {grades[o][us]} <span className="muted">(No. {rank(o)} of 32, counting ties)</span></span>)}
          {r?.gm && <span>Our GM's own grade: {r.gm}</span>}
        </section>
      )}
      {r?.past && r.past.length > 0 && (
        <section className="panel stack tight">
          <h3>Last season's storylines</h3>
          {list(r.past)}
        </section>
      )}
      <p className="muted">{teamLabel(us)} fans measure a season against what they expected in the summer.</p>
    </div>
  );
}
