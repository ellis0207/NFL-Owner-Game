import { useMemo, useState } from "react";
import { capSummary } from "../engine/cap";
import { longDate, shortDate } from "../engine/dates";
import { TEAMS } from "../engine/league";
import { newGame, openingGame, veteranReportDate } from "../engine/season";
import { TEAM_COLORS } from "../engine/teamColors";
import { STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../engine/stadiums";
import type { GameState, Settings } from "../engine/types";
import { money, onColor } from "./format";

export function NewGame({ onStart, onBack }: { onStart: (s: GameState) => void; onBack: () => void }) {
  const [team, setTeam] = useState("DET");
  const [owner, setOwner] = useState("");
  const [capRules, setCapRules] = useState<Settings["capRules"]>("real");
  const [finances, setFinances] = useState<NonNullable<Settings["finances"]>>("real");

  const preview = useMemo(() => {
    const s = newGame(team, "preview", { capRules }, 1);
    const opener = openingGame(team);
    return { cap: capSummary(s, team), opener, report: veteranReportDate(team) };
  }, [team, capRules]);

  const selected = TEAMS.find((t) => t.id === team)!;
  const opp = preview.opener.home === team ? preview.opener.away : preview.opener.home;

  return (
    <div className="title-page">
      <div className="title-card">
        <div className="btn-row"><button className="btn small" onClick={onBack}>Back</button></div>
        <h1>Pick your franchise</h1>
        <div className="divisions">
          {(["AFC", "NFC"] as const).flatMap((conf) =>
            (["East", "North", "South", "West"] as const).map((div) => (
              <div key={conf + div} className="division">
                <h3>{conf} {div}</h3>
                {TEAMS.filter((t) => t.conference === conf && t.division === div).map((t) => {
                  const [c] = TEAM_COLORS[t.id];
                  return (
                    <button key={t.id} className="team-pick" aria-pressed={team === t.id} onClick={() => setTeam(t.id)}>
                      <span className="chip" style={{ background: c, color: onColor(c) }}>{t.id}</span>
                      <span>{t.city} {t.name}</span>
                    </button>
                  );
                })}
              </div>
            )),
          )}
        </div>
        <div className="split">
          <div className="panel stack">
            <h2>{selected.city} {selected.name}</h2>
            <dl className="kv">
              <dt>Stadium</dt><dd>{selected.stadium}</dd>
              <dt>Stadium control</dt><dd>{STRUCTURE_LABEL[STADIUM_BY_TEAM[team].structure]}</dd>
              <dt>Camp opens</dt><dd>{longDate(preview.report)}</dd>
              <dt>Opener</dt><dd>{shortDate(preview.opener.date)} {preview.opener.home === team ? "vs" : "at"} {opp}</dd>
              <dt>Cap space</dt><dd>{capRules === "off" ? "No cap" : money(preview.cap.space)}</dd>
              <dt>Dead money</dt><dd>{money(preview.cap.dead)}</dd>
            </dl>
          </div>
          <div className="panel stack">
            <label className="field">
              <span className="label">Owner name</span>
              <input id="owner-name" type="text" value={owner} placeholder="Your name" maxLength={40} onChange={(e) => setOwner(e.target.value)} />
            </label>
            <label className="toggle">
              <input id="cap-rules" type="checkbox" checked={capRules === "real"} onChange={(e) => setCapRules(e.target.checked ? "real" : "off")} />
              <span><strong>Real salary cap rules</strong><br /><span className="muted">Turn off to play without a salary cap. More realism settings come after playtesting.</span></span>
            </label>
            <label className="toggle">
              <input id="finances" type="checkbox" checked={finances === "real"} onChange={(e) => setFinances(e.target.checked ? "real" : "relaxed")} />
              <span><strong>Real owner finances</strong><br /><span className="muted">The team can run short of cash, and you cover it from your own pocket. Turn off to have the team's cash topped up automatically.</span></span>
            </label>
            <button className="btn primary" onClick={() => onStart(newGame(team, owner.trim() || "Owner", { capRules, finances }))}>
              Take over the {selected.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
