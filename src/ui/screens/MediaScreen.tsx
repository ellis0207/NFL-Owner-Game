import { useMemo, useState } from "react";
import { shortDate, weekday } from "../../engine/dates";
import { PLAYER_BY_ID, teamLabel } from "../../engine/league";
import { MEDIA, MEDIA_BY_ID, relLabel, relOf } from "../../engine/outlets";
import { answerQuestion, openQuestions } from "../../engine/press";
import { draftClass } from "../../engine/prospects";
import type { GameState, PressQuestion, Story } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";

const TABS = ["News", "Press room", "Outlets"] as const;
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
  const [tab, setTab] = useState<Tab>(open.length ? "Press room" : "News");
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
      {tab === "Outlets" && <Outlets game={game} />}
    </section>
  );
}

function NewsFeed({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [outlet, setOutlet] = useState<string>("");
  const [shown, setShown] = useState(60);
  const stories = useMemo(
    () => (game.media?.stories ?? []).filter((s) => matches(s, filter, game.userTeam) && (!outlet || s.outlet === outlet)),
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
            {MEDIA.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
  const o = MEDIA_BY_ID[s.outlet];
  const dc = s.prospects?.length && game.college ? draftClass(game.seed) : null;
  return (
    <article className={`story${s.teams?.includes(game.userTeam) || s.kind === "owner" ? " ours" : ""}`}>
      <button className="head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`pill kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
        <strong className="headline">{s.headline}</strong>
        <span className="muted byline">{o?.name ?? s.outlet} · {s.by}</span>
      </button>
      {open && (
        <>
          <p className="body">{s.body}</p>
          {(s.players?.length || s.prospects?.length || s.gameId) && (
            <div className="btn-row related">
              {s.gameId && game.box[s.gameId] && <button className="btn small" onClick={() => ui.openBox(s.gameId!)}>Box score</button>}
              {[...new Set(s.players ?? [])].filter((id) => PLAYER_BY_ID[id]).map((id) => (
                <button key={id} className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>
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
              <span className="muted">{shortDate(q.answeredOn ?? q.date)} · {MEDIA_BY_ID[q.outlet]?.name}</span>
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
  const o = MEDIA_BY_ID[q.outlet];
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

function Outlets({ game }: { game: GameState }) {
  const fines = game.media?.fines ?? [];
  return (
    <div className="stack">
      <div className="split">
        {MEDIA.map((o) => (
          <section key={o.id} className="panel stack tight">
            <h3>{o.name}</h3>
            <p className="muted">{o.what}</p>
            <div><span className="label">Staff</span> {[...new Set([o.insider, o.columnist, o.analyst, o.draft, o.reporter])].join(", ")}</div>
            <div><span className="label">How they cover you</span> {relLabel(relOf(game, o.id))}</div>
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
