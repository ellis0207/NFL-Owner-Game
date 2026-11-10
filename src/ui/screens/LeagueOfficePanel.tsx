// The league office on the Owners page: the commissioner and who decides
// what, the committees and our seats, issue coalitions, technology trials,
// and on each proposal the office's briefing, an amendment to a trial and
// our case in committee.
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { teamLabel } from "../../engine/league";
import {
  amendProposal, argueCommittee, askForSeat, briefing, coalitionCandidates, committeeFor, committeeProposal, COMMITTEES, endCoalition, formCoalition,
  leagueOffice, onCommittee, POWERS, voteCommissioner,
} from "../../engine/leagueoffice";
import { currentMeeting, proposable } from "../../engine/owners";
import { ISSUES, RULE_BY_ID, type Issue } from "../../engine/rules";
import type { Committee, GameState, RuleProposal } from "../../engine/types";
import { Evidence } from "../Help";

export function LeagueOffice({ game, say }: { game: GameState; say: (t: string | null) => void }) {
  const lo = leagueOffice(game);
  const c = lo.commissioner;
  const [seat, setSeat] = useState<Committee | "">("");
  const [issue, setIssue] = useState<Issue>("money");
  const [rule, setRule] = useState("");
  const m = currentMeeting(game);
  const mine = (Object.keys(COMMITTEES) as Committee[]).filter((k) => onCommittee(game, k));
  const open = m && !m.done && game.date <= m.deadline && !m.proposals.some((p) => p.viaUs);
  const committeeRules = open ? proposable(game).filter((id) => mine.includes(committeeFor(RULE_BY_ID[id].issue))) : [];
  return (
    <div className="split">
      <section className="panel stack tight">
        <h3>The league office</h3>
        <span>Commissioner {c.name}, since {c.since}, under contract through {c.through}. Owners' view: {c.approval >= 70 ? "strong support" : c.approval >= 55 ? "steady support" : c.approval >= 45 ? "mixed" : "restless"} <Evidence kind="opinion" /></span>
        {c.renewal && c.renewal.passed === undefined && (
          <div className="btn-row">
            <span>The owners vote on extending his contract at the meeting.</span>
            <button className={`btn small${c.renewal.ourVote !== false ? " primary" : ""}`} onClick={() => { voteCommissioner(game, true); say(null); }}>Vote to extend</button>
            <button className={`btn small${c.renewal.ourVote === false ? " primary" : ""}`} onClick={() => { voteCommissioner(game, false); say(null); }}>Vote against</button>
          </div>
        )}
        <h4>Who decides</h4>
        {POWERS.map((p) => <span key={p.who}><strong>{p.who}:</strong> <span className="muted">{p.what}</span></span>)}
        <h4>Committees</h4>
        {(Object.keys(COMMITTEES) as Committee[]).map((k) => (
          <span key={k} title={COMMITTEES[k].what}><strong>{COMMITTEES[k].label}</strong>{onCommittee(game, k) ? " (we sit on it)" : ""}: <span className="muted">{lo.committees[k].filter((t) => t !== game.userTeam).map(teamLabel).join(", ")}</span></span>
        ))}
        <div className="btn-row">
          <select value={seat} onChange={(e) => setSeat(e.target.value as Committee)} aria-label="Committee">
            <option value="">Ask for a seat on…</option>
            {(Object.keys(COMMITTEES) as Committee[]).filter((k) => !onCommittee(game, k)).map((k) => <option key={k} value={k}>{COMMITTEES[k].label}</option>)}
          </select>
          <button className="btn small" disabled={!seat} onClick={() => { say(askForSeat(game, seat as Committee)); setSeat(""); }}>Ask</button>
          {lo.seatAsk && <span className="muted">Asked for the {COMMITTEES[lo.seatAsk].label}; appointments come after the draft.</span>}
        </div>
        {committeeRules.length > 0 && (
          <>
            <h4>Bring a proposal in the committee's name</h4>
            <div className="btn-row">
              <select value={rule} onChange={(e) => setRule(e.target.value)} aria-label="Committee proposal">
                <option value="">Choose…</option>
                {committeeRules.map((id) => <option key={id} value={id}>{RULE_BY_ID[id].title}</option>)}
              </select>
              <button className="btn small" disabled={!rule} onClick={() => { say(committeeProposal(game, rule, proposable(game), m!) ?? "On the agenda, with the committee's recommendation."); setRule(""); }}>Propose</button>
            </div>
          </>
        )}
      </section>
      <section className="panel stack tight">
        <h3>Coalitions</h3>
        <span className="muted">Owners line up issue by issue: a club with us on revenue sharing can oppose us on the schedule. A coalition's members vote our way on its issue only.</span>
        {lo.coalitions.map((co) => (
          <span key={co.issue}><strong>{ISSUES[co.issue as Issue]}</strong> (since {shortDate(co.formed)}): {co.members.map(teamLabel).join(", ")} <button className="link" onClick={() => { endCoalition(game, co.issue); say(null); }}>Dissolve</button></span>
        ))}
        <div className="btn-row">
          <select value={issue} onChange={(e) => setIssue(e.target.value as Issue)} aria-label="Issue">
            {(Object.keys(ISSUES) as Issue[]).map((k) => <option key={k} value={k}>{ISSUES[k]}</option>)}
          </select>
          <button className="btn small" onClick={() => say(formCoalition(game, issue))}>Build a coalition</button>
        </div>
        <span className="muted">Likely partners on {ISSUES[issue].toLowerCase()}: {coalitionCandidates(game, issue).slice(0, 8).map(teamLabel).join(", ") || "none right now"} <Evidence kind="opinion" /></span>
        {lo.log.length > 0 && <><h4>From the league office</h4>{lo.log.slice(0, 6).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}</>}
      </section>
    </div>
  );
}

/** A proposal's briefing, amendment and committee case. */
export function ProposalExtras({ game, p, say }: { game: GameState; p: RuleProposal; say: (t: string | null) => void }) {
  const [shown, setShown] = useState(!!p.briefing);
  const c = RULE_BY_ID[p.rule];
  const com = committeeFor(c.issue);
  const canAmend = !p.amended && (p.sponsor === game.userTeam || p.viaUs);
  return (
    <>
      <span className="muted">Issue: {ISSUES[c.issue]}.{p.amended ? " Narrowed to a one-season trial." : ""}{p.revised ? " Back in revised form after failing before." : ""}</span>
      <div className="btn-row">
        <button className="btn small" onClick={() => { briefing(game, p); setShown(true); say(null); }}>League office briefing</button>
        {canAmend && <button className="btn small" onClick={() => say(amendProposal(game, p))}>Narrow to a one-season trial</button>}
        {onCommittee(game, com) && !p.argued && <>
          <button className="btn small" onClick={() => say(argueCommittee(game, p, "for"))}>Argue for it in committee</button>
          <button className="btn small" onClick={() => say(argueCommittee(game, p, "against"))}>Argue against it in committee</button>
        </>}
      </div>
      {shown && p.briefing && <span className="muted">{p.briefing} <Evidence kind="estimate" /></span>}
    </>
  );
}
