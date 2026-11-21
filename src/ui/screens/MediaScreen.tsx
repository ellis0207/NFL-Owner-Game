import { FORMATS, type FormatId } from "../../engine/media/formats";
import { initialTab } from "../ui";
import { useState } from "react";
import { daysBetween, shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, teamLabel } from "../../engine/league";
import { NATIONAL, relLabel, relOf } from "../../engine/outlets";
import { outletOf, recordLine, working } from "../../engine/media/corps";
import { expectLabel } from "../../engine/review";
import { ARC_LABEL, arcStage, arcState } from "../../engine/media/arcs";
import { sentiment, sentimentWord, trending } from "../../engine/media/social";
import { gradePoints } from "../../engine/grades";
import { TEAMS } from "../../engine/league";
import { answerQuestion, openQuestions } from "../../engine/press";
import { draftClass } from "../../engine/prospects";
import type { Arc, GameState, OwnerTone, PressQuestion, Story, Storyline } from "../../engine/types";
import { TONE_LABEL } from "../../engine/media/content/ownerdesk";
import { money } from "../format";
import { useUi } from "../ui";
import { tip } from "../tip";
import { OwnerDeskPanel, PresserCard, openPressers } from "./MediaDesk";
import { FrontPage, KIND_LABEL, ReporterList, ReporterName, ReporterPage, ROLE, StoryPage } from "./MediaPages";

const TABS = ["Front page", "Huddle", "Press room", "Storylines", "Reporters", "Outlets"] as const;
type Tab = (typeof TABS)[number];

export function MediaScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const open = [...openQuestions(game), ...openPressers(game)];
  const [tab, setTabRaw] = useState<Tab>(() => initialTab("Media", TABS, open.length ? "Press room" : "Front page"));
  // A story or reporter opened from any tab shows in place, with Back to return.
  const [page, setPage] = useState<{ story?: string; reporter?: string }[]>([]);
  const top = page[page.length - 1];
  const openStory = (id: string) => setPage([...page, { story: id }]);
  const openReporter = (id: string) => setPage([...page, { reporter: id }]);
  const back = () => setPage(page.slice(0, -1));
  const setTab = (t: Tab) => { setTabRaw(t); setPage([]); };
  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="tabs" role="group" aria-label="Media">
          {TABS.map((t) => (
            <button key={t} aria-pressed={tab === t && !top} onClick={() => setTab(t)}>
              {t}{t === "Press room" && open.length > 0 ? ` (${open.length})` : ""}
            </button>
          ))}
        </div>
      </div>
      {top?.story && <StoryPage game={game} id={top.story} openStory={openStory} openReporter={openReporter} back={back} />}
      {top?.reporter && <ReporterPage game={game} id={top.reporter} openStory={openStory} back={back} changed={changed} />}
      {!top && tab === "Front page" && <FrontPage game={game} openStory={openStory} openReporter={openReporter} />}
      {!top && tab === "Huddle" && <Huddle game={game} />}
      {!top && tab === "Press room" && <PressRoom game={game} changed={changed} />}
      {!top && tab === "Storylines" && <Storylines game={game} />}
      {!top && tab === "Outlets" && <Outlets game={game} openReporter={openReporter} />}
      {!top && tab === "Reporters" && <ReporterList game={game} openReporter={openReporter} changed={changed} />}
    </section>
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
  const pressers = openPressers(game);
  const past = (game.media?.questions ?? []).filter((q) => q.answer !== undefined).slice(0, 30);
  const held = (game.media?.desk?.pressers ?? []).filter((p) => p.held && !p.skipped).slice(0, 8);
  return (
    <div className="stack">
      <p className="muted">
        Reporters want your comment when something happens to the team. What you say gets printed, and it can matter to
        players, the coaches, agents, fans and the league office in ways you won't see right away. Questions you don't answer in time get a "declined to comment."
      </p>
      {pressers.map((p) => <PresserCard key={p.id} game={game} p={p} changed={changed} />)}
      {open.length === 0 && pressers.length === 0 && <p className="panel muted">No requests for comment right now.</p>}
      {open.map((q) => <QuestionCard key={q.id} game={game} q={q} changed={changed} />)}
      <OwnerDeskPanel game={game} changed={changed} />
      {held.length > 0 && (
        <section className="panel stack tight">
          <h3>Press conferences and interviews</h3>
          {held.map((p) => (
            <details key={p.id}>
              <summary>{shortDate(p.held!)} · {p.title}</summary>
              {p.questions.map((q, i) => <div key={i} className="said"><div><strong>{q.text}</strong></div><div>"{q.options[q.answer ?? 2]?.text}"</div></div>)}
            </details>
          ))}
        </section>
      )}
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
            {opt.key === "noComment" ? <span className="muted">{opt.text}</span> : opt.key.startsWith("tone:") ? <><span className="muted small">{TONE_LABEL[opt.key.slice(5) as OwnerTone]}</span> {opt.text}</> : opt.text}
          </button>
        ))}
      </div>
    </section>
  );
}


function Staff({ game, outlet, openReporter }: { game: GameState; outlet: string; openReporter: (id: string) => void }) {
  const people = working(game).filter((p) => p.outlet === outlet);
  return (
    <div className="stack tight">
      {people.map((p) => (
        <div key={p.id}>
          <strong><ReporterName id={p.id} name={p.name} onOpen={openReporter} /></strong> <span className="muted">{ROLE[p.role]}{p.awards.length ? ` · ${p.awards.map((a) => `${a.name} ${a.season}`).join(", ")}` : ""}</span>
          <div className="muted small">{recordLine(p)}</div>
        </div>
      ))}
    </div>
  );
}

function Outlets({ game, openReporter }: { game: GameState; openReporter: (id: string) => void }) {
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
            <Staff game={game} outlet={o.id} openReporter={openReporter} />
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
            <Staff game={game} outlet={id} openReporter={openReporter} />
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
      <ArcTracker game={game} />
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

/** The running stories around the league: ours first, then the biggest, with how far along each one is. */
function ArcTracker({ game }: { game: GameState }) {
  const us = game.userTeam;
  const all = game.media?.arcs ? arcState(game).list : [];
  const mine = (a: Arc) => a.team === us || a.other === us;
  const open = all.filter((a) => !a.ending).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.beats.length - a.beats.length || a.opened.localeCompare(b.opened));
  const ended = all.filter((a) => a.ending).sort((a, b) => b.ended!.localeCompare(a.ended!)).slice(0, 15);
  const subject = (a: Arc) => a.title || [a.player && PLAYER_BY_ID[a.player]?.name, teamLabel(a.team), a.other && `and ${teamLabel(a.other)}`].filter(Boolean).join(", ");
  const row = (a: Arc) => (
    <tr key={a.id}>
      <td>{ARC_LABEL[a.kind] ?? a.kind}{mine(a) && <span className="pill">Ours</span>}</td>
      <td>{subject(a)}</td>
      <td>{arcStage(a.ending ?? a.phase)}</td>
      <td className="muted">{a.ending ? shortDate(a.ended!) : `${daysBetween(a.opened, game.date)} days`}</td>
    </tr>
  );
  return (
    <section className="panel stack tight">
      <h3>Running stories</h3>
      <p className="muted">The stories the media keep coming back to. Each one moves through its chapters and ends one way or another.</p>
      {open.length === 0 ? <span className="muted">Nothing is running right now.</span> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Story</th><th>About</th><th>Where it stands</th><th>Running</th></tr></thead>
          <tbody>{open.slice(0, 40).map(row)}</tbody>
        </table></div>
      )}
      {ended.length > 0 && (
        <>
          <h4>Recently ended</h4>
          <div className="table-wrap"><table>
            <thead><tr><th>Story</th><th>About</th><th>How it ended</th><th>Ended</th></tr></thead>
            <tbody>{ended.map(row)}</tbody>
          </table></div>
        </>
      )}
    </section>
  );
}

const HUDDLE_FILTERS = { ours: "Our team", all: "Everyone", player: "Players", press: "Reporters" } as const;
type HuddleFilter = keyof typeof HUDDLE_FILTERS;

/** The Huddle, the league's social platform: the feed, what's trending and how each club's fans feel. */
function Huddle({ game }: { game: GameState }) {
  const [f, setF] = useState<HuddleFilter>("ours");
  const us = game.userTeam;
  const posts = (game.media?.social?.posts ?? []).filter((p) => f === "all" || (f === "ours" ? p.team === us : p.kind === f)).slice(0, 80);
  const trend = game.media?.social ? trending(game) : [];
  const moods = TEAMS.map((t) => ({ id: t.id, v: sentiment(game, t.id) })).sort((a, b) => b.v - a.v);
  const ours = sentiment(game, us);
  return (
    <div className="split">
      <section className="panel stack tight dk-feed">
        <div className="tabs" role="group" aria-label="Huddle filter">
          {(Object.keys(HUDDLE_FILTERS) as HuddleFilter[]).map((k) => (
            <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{HUDDLE_FILTERS[k]}</button>
          ))}
        </div>
        {posts.length === 0 ? <span className="muted">Nothing posted yet.</span> : posts.map((p) => (
          <div key={p.id} className={`dk-post kind-${p.kind}`}>
            <span className="dk-avatar" aria-hidden="true">{p.who.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>
            <div className="dk-post-body">
              <span><strong>{p.who}</strong>{p.kind === "press" && p.by ? <span className="muted"> · {p.by}</span> : null}{p.kind === "player" ? <span className="pill">Player</span> : p.kind === "club" ? <span className="pill">Club</span> : null}<span className="muted"> · {shortDate(p.date)}</span></span>
              <span>{p.text}</span>
            </div>
          </div>
        ))}
      </section>
      <div className="stack">
        <section className="panel stack tight">
          <h3>Trending</h3>
          {trend.length === 0 ? <span className="muted">Nothing yet.</span> : <ol>{trend.map((t) => <li key={t.topic}>{t.topic} <span className="muted">{t.posts} posts</span></li>)}</ol>}
        </section>
        <section className="panel stack tight">
          <h3>Fan mood</h3>
          <span>{teamLabel(us)} fans are {sentimentWord(ours)} ({Math.round(ours)} of 100).</span>
          <p className="muted">How fans feel online moves trust in the club and the pressure on it a little each week.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Club</th><th>Mood</th></tr></thead>
            <tbody>{moods.map((m) => <tr key={m.id}><td>{teamLabel(m.id)}{m.id === us && <span className="pill">Ours</span>}</td><td>{sentimentWord(m.v)} ({Math.round(m.v)})</td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
