// The decision queue on Today: everything waiting on the owner, from every
// system, with why it matters, when it runs out, who recommends what and what
// happens if nothing is done. Most items can be answered right here; each one
// also links to the exact page where the details are.
import { useState } from "react";
import { answerOffer } from "../../engine/business";
import { decideProposal } from "../../engine/carousel";
import { daysBetween, shortDate } from "../../engine/dates";
import { decideMemo } from "../../engine/memos";
import { decideRoom } from "../../engine/positionCoaches";
import { decisionQueue, departmentReadings, hiddenMinor, INVOLVEMENT, involvement, markReviewed, setInvolvement, type Involvement, type QueueItem, type QueueLink } from "../../engine/queue";
import { acceptOffer, declineOffer } from "../../engine/trades";
import { answerDecision } from "../../engine/discipline";
import { appealCase, respondCase } from "../../engine/compliance";
import type { GameState } from "../../engine/types";
import type { Screen } from "../nav";
import { useUi } from "../ui";

const KIND_LABEL: Record<QueueItem["kind"], string> = {
  approval: "Needs your approval", deadline: "Deadline", problem: "Problem", recommendation: "Staff recommendation", review: "Review",
};

function when(game: GameState, d?: string): string | null {
  if (!d) return null;
  const n = daysBetween(game.date, d);
  return n <= 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due ${shortDate(d)} (${n} days)`;
}

export function DecisionQueue({ game, changed, go }: { game: GameState; changed: () => void; go: (s: Screen, tab?: string) => void }) {
  const ui = useUi();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const items = decisionQueue(game);
  const level = involvement(game);
  const minor = hiddenMinor(game);
  const follow = (l: QueueLink) => (l.talks ? ui.openTalks(l.talks) : l.player ? ui.openPlayer(l.player) : go(l.screen as Screen, l.tab));
  const act = (fn: () => string | null | void) => { setMsg(fn() ?? null); changed(); };

  function answers(i: QueueItem) {
    if (i.memo) {
      const m = game.office!.memos.find((x) => x.id === i.memo)!;
      return m.options.map((op, k) => (
        <button key={k} className={`btn small${k === m.recommend ? " primary" : ""}`} title={op.effect} onClick={() => act(() => decideMemo(game, m.id, k))}>{op.label}</button>
      ));
    }
    const c = i.choices;
    if (c) {
      return c.options.map((o) => (
        <button key={o.key} className={`btn small${o.key === c.recommended ? " primary" : ""}`} onClick={() => act(() =>
          c.kind === "decision" ? answerDecision(game, c.id, o.key) : c.kind === "case" ? respondCase(game, c.id, o.key as "cooperate") : appealCase(game, c.id))}>{o.label}</button>
      ));
    }
    const a = i.answer;
    if (!a) return null;
    const yesNo = (yes: () => string | null | void, no: () => string | null | void, labels = ["Accept", "Decline"]) => (
      <>
        <button className="btn small primary" onClick={() => act(yes)}>{labels[0]}</button>
        <button className="btn small" onClick={() => act(no)}>{labels[1]}</button>
      </>
    );
    if (a.kind === "trade") return yesNo(() => acceptOffer(game, a.id).text, () => declineOffer(game, a.id));
    if (a.kind === "booking") return yesNo(() => answerOffer(game, a.id, true), () => answerOffer(game, a.id, false));
    if (a.kind === "staff") return yesNo(() => decideProposal(game, a.id, "approve").text, () => decideProposal(game, a.id, "reject").text, ["Approve", "Reject"]);
    return yesNo(() => decideRoom(game, a.id, "approve").text, () => decideRoom(game, a.id, "reject").text, ["Approve", "Reject"]);
  }

  return (
    <section className="panel stack tight decision-queue">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Decision queue</h2>
        <label className="inline-field">
          <span className="label">Involvement</span>
          <select value={level} onChange={(e) => { setInvolvement(game, e.target.value as Involvement); changed(); }} title={INVOLVEMENT[level].what}>
            {Object.entries(INVOLVEMENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {items.length === 0 && <p className="muted">Nothing is waiting on you today.{minor ? ` The staff are handling ${minor} routine item${minor > 1 ? "s" : ""}.` : ""}</p>}
      {items.map((i) => {
        const due = when(game, i.expires);
        const expanded = open === i.id || items.length <= 4;
        return (
          <div key={i.id} className={`queue-item ${i.kind}${i.major ? " major" : ""}`}>
            <div className="queue-head">
              <span className={`queue-kind ${i.kind}`}>{KIND_LABEL[i.kind]}</span>
              <button className="link queue-title" aria-expanded={expanded} onClick={() => setOpen(open === i.id ? null : i.id)}>{i.title}</button>
              {due && <span className={daysBetween(game.date, i.expires!) <= 1 ? "bad" : "muted"}>{due}</span>}
            </div>
            {expanded && (
              <div className="queue-body">
                <div><span className="label">Why it matters</span> {i.why}</div>
                {i.recommends && <div><span className="label">Recommendation</span> {i.recommends}</div>}
                <div><span className="label">If you do nothing</span> {i.ifNothing}</div>
                <div className="btn-row">
                  {answers(i)}
                  {i.kind === "review" && <button className="btn small" onClick={() => act(() => markReviewed(game))}>Mark reviewed</button>}
                  <button className="btn small" onClick={() => follow(i.link)}>{i.link.talks ? "Open talks" : `Open ${i.link.tab ?? i.link.screen}`}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {level === "handsOff" && minor > 0 && items.length > 0 && <span className="muted">The staff are handling {minor} routine item{minor > 1 ? "s" : ""}; switch to Standard to see them.</span>}
      {level === "handsOn" && (
        <div className="stack tight">
          <span className="label">Departments</span>
          {departmentReadings(game).map((r) => (
            <div key={r.dept}>
              <button className="link" onClick={() => follow(r.link)}>{r.dept}</button>{" "}
              <span className={r.flag ? "warn" : "muted"}>{r.line}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
