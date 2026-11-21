// The owner's own press work on the Media page: press conferences and
// interviews to answer, a sitdown or an exclusive to give, reports about the
// club to confirm or deny, the owner's Huddle account, guest columns, and the
// access policy for each reporter. What any of it does stays hidden; the
// coverage is what the owner sees.
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { corps, outletOf } from "../../engine/media/corps";
import {
  deskReady, deskReporters, exclusiveTopics, giveExclusive, holdPresser, OPED_TOPICS, opEdOutlets, openPressers, ownerDesk, ownerHandle,
  ownerPost, ownerPostOptions, reportsAboutUs, requestInterview, respondToReport, setAccess, writeOpEd,
} from "../../engine/media/ownerdesk";
import { TONE_LABEL } from "../../engine/media/content/ownerdesk";
import type { GameState, Presser } from "../../engine/types";

type Act = (fn: () => string | null | object) => void;

function useAct(changed: () => void): [string | null, Act] {
  const [msg, setMsg] = useState<string | null>(null);
  return [msg, (fn) => {
    const r = fn();
    setMsg(typeof r === "string" ? r : null);
    changed();
  }];
}

export function PresserCard({ game, p, changed }: { game: GameState; p: Presser; changed: () => void }) {
  const [picks, setPicks] = useState<number[]>(() => p.questions.map(() => -1));
  const [msg, act] = useAct(changed);
  const people = new Map(corps(game).people.map((r) => [r.id, r]));
  const ready = picks.every((x) => x >= 0);
  return (
    <section className="panel stack tight question">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3>{p.title}{p.reporter ? ` with ${people.get(p.reporter)?.name ?? "a reporter"}` : ""}</h3>
        <span className="muted">By {shortDate(p.expires)}</span>
      </div>
      {p.kind === "offrecord" && <p className="muted">Off the record: nothing is meant to be printed.</p>}
      {p.questions.map((q, i) => {
        const r = people.get(q.by);
        return (
          <div key={i} className="stack tight">
            <span className="label">{r ? `${r.name}, ${outletOf(r.outlet).name}` : "A reporter"}</span>
            <p className="ask">"{q.text}"</p>
            <div className="answers">
              {q.options.map((o, j) => (
                <button key={j} className="btn answer" aria-pressed={picks[i] === j} onClick={() => setPicks(picks.map((x, k) => (k === i ? j : x)))}>
                  <span className="muted small">{TONE_LABEL[o.tone]}</span> {o.text}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="btn-row">
        <button className="btn primary" disabled={!ready} onClick={() => act(() => holdPresser(game, p.id, picks))}>
          {p.kind === "presser" ? "Take the podium" : "Give the interview"}
        </button>
        {!ready && <span className="muted small">Pick an answer for each question.</span>}
      </div>
      {msg && <p className="error">{msg}</p>}
    </section>
  );
}

/** Everything the owner can start: interviews, exclusives, answers to reports, posts and columns. */
export function OwnerDeskPanel({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, act] = useAct(changed);
  const reps = deskReporters(game);
  const [who, setWho] = useState(reps[0]?.id ?? "");
  const topics = exclusiveTopics(game);
  const [topic, setTopic] = useState(topics[0]?.id ?? "plans");
  const outlets = opEdOutlets(game);
  const [outlet, setOutlet] = useState(outlets[0]?.id ?? "");
  const [oped, setOped] = useState(OPED_TOPICS[0].id);
  const ready = deskReady(game);
  const reports = reportsAboutUs(game);
  const people = new Map(corps(game).people.map((r) => [r.id, r]));
  const posts = ownerPostOptions(game);
  const mine = (game.media?.social?.posts ?? []).filter((x) => x.kind === "owner").slice(0, 5);
  const access = ownerDesk(game).access;
  const label = (id: string) => {
    const r = people.get(id);
    return r ? `${r.name} (${outletOf(r.outlet).name})${access[id] === "banned" ? ", banned" : access[id] === "favored" ? ", favored" : ""}` : id;
  };
  return (
    <div className="stack">
      {msg && <p className="error">{msg}</p>}
      <div className="split">
        <section className="panel stack tight">
          <h3>Sit down with a reporter</h3>
          <p className="muted small">An interview runs in that reporter's outlet. Off the record, nothing is meant to be printed, and the reporter learns more about the club.</p>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Reporter">
            {reps.map((r) => <option key={r.id} value={r.id}>{label(r.id)}</option>)}
          </select>
          <div className="btn-row">
            <button className="btn" disabled={!!ready.interview} onClick={() => act(() => requestInterview(game, who, false))}>On the record</button>
            <button className="btn" disabled={!!ready.interview} onClick={() => act(() => requestInterview(game, who, true))}>Off the record</button>
          </div>
          {ready.interview && <span className="muted small">Next interview {shortDate(ready.interview)}.</span>}
          <h3>Give an exclusive</h3>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Exclusive">
            {topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button className="btn" disabled={!!ready.exclusive} onClick={() => act(() => giveExclusive(game, who, topic))}>Give it to the reporter above</button>
          {ready.exclusive && <span className="muted small">Next exclusive {shortDate(ready.exclusive)}.</span>}
        </section>
        <section className="panel stack tight">
          <h3>Reports about us</h3>
          {reports.length === 0 ? <p className="muted">No fresh reports about the club to answer.</p> : reports.map((r) => (
            <div key={r.id} className="stack tight">
              <div><span className="muted">{shortDate(r.date)}</span> {r.headline ?? "A report"} <span className="muted">· {people.get(r.reporter)?.name}</span></div>
              <div className="btn-row">
                <button className="btn small" onClick={() => act(() => respondToReport(game, r.id, "confirm"))}>Confirm</button>
                <button className="btn small" onClick={() => act(() => respondToReport(game, r.id, "deny"))}>Deny</button>
                <button className="btn small" onClick={() => act(() => respondToReport(game, r.id, "ignore"))}>Ignore</button>
              </div>
            </div>
          ))}
          <p className="muted small">A denial puts your word on the line until the report is proved or disproved.</p>
        </section>
      </div>
      <div className="split">
        <section className="panel stack tight">
          <h3>Your Huddle account <span className="muted small">{ownerHandle(game)}</span></h3>
          {posts.length === 0 ? <p className="muted">You've posted today.</p> : (
            <div className="btn-row">{posts.map((o) => <button key={o.key} className="btn" onClick={() => act(() => ownerPost(game, o.key))}>{o.label}</button>)}</div>
          )}
          {mine.map((x) => <div key={x.id} className="small"><span className="muted">{shortDate(x.date)}</span> {x.text}</div>)}
        </section>
        <section className="panel stack tight">
          <h3>Write a guest column</h3>
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)} aria-label="Outlet">
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={oped} onChange={(e) => setOped(e.target.value)} aria-label="Topic">
            {OPED_TOPICS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="btn" disabled={!!ready.oped} onClick={() => act(() => writeOpEd(game, outlet, oped))}>Submit the column</button>
          {ready.oped && <span className="muted small">Next column {shortDate(ready.oped)}.</span>}
        </section>
      </div>
    </div>
  );
}

/** The access policy for one reporter: favored, normal or banned. */
export function AccessSelect({ game, id, changed }: { game: GameState; id: string; changed: () => void }) {
  const [msg, act] = useAct(changed);
  const level = ownerDesk(game).access[id] ?? "normal";
  return (
    <span>
      <select value={level} aria-label="Access" onChange={(e) => act(() => setAccess(game, id, e.target.value as "normal" | "favored" | "banned"))}>
        <option value="normal">Normal access</option>
        <option value="favored">Favored</option>
        <option value="banned">Banned</option>
      </select>
      {msg && <span className="error small"> {msg}</span>}
    </span>
  );
}

export { openPressers };
