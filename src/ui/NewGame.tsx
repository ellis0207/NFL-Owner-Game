import { useMemo, useState } from "react";
import { capSummary } from "../engine/cap";
import { longDate, shortDate } from "../engine/dates";
import { TEAMS } from "../engine/league";
import { newGame, openingGame, veteranReportDate } from "../engine/season";
import { TEAM_COLORS } from "../engine/teamColors";
import { STADIUM_BY_TEAM, STRUCTURE_LABEL } from "../engine/stadiums";
import type { GameState, Settings } from "../engine/types";
import { BACKGROUNDS, DEFAULT_SETUP, GOAL_KEYS, GOALS, SCENARIOS, SPENDING, STYLES, WEALTH, DEFAULT_CUSTOM, type CustomStart, type OwnerSetup, type Scenario } from "../engine/ownership";
import { money, onColor } from "./format";

export function NewGame({ onStart, onBack }: { onStart: (s: GameState) => void; onBack: () => void }) {
  const [team, setTeam] = useState("DET");
  const [owner, setOwner] = useState("");
  const [capRules, setCapRules] = useState<Settings["capRules"]>("real");
  const [finances, setFinances] = useState<NonNullable<Settings["finances"]>>("real");
  const [profile, setProfile] = useState<OwnerSetup>(DEFAULT_SETUP);
  const [scouting, setScouting] = useState<NonNullable<Settings["scouting"]>>("real");
  const [ironman, setIronman] = useState(false);
  const custom = profile.custom ?? DEFAULT_CUSTOM;
  const setCustom = (c: Partial<CustomStart>) => setProfile({ ...profile, custom: { ...custom, ...c } });
  const set = (p: Partial<OwnerSetup>) => setProfile({ ...profile, ...p });

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
            <h2>Who you are</h2>
            <label className="field"><span className="label">Background</span>
              <select value={profile.background} onChange={(e) => set({ background: e.target.value as OwnerSetup["background"] })}>
                {Object.entries(BACKGROUNDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <span className="muted">{BACKGROUNDS[profile.background].what}</span>
            <label className="field"><span className="label">Your money outside the team</span>
              <select value={profile.wealth} onChange={(e) => set({ wealth: Number(e.target.value) as OwnerSetup["wealth"] })}>
                {WEALTH.map((w, i) => <option key={w.label} value={i}>{w.label}: {w.what}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">How involved you'll be</span>
              <select value={profile.style} onChange={(e) => set({ style: e.target.value as OwnerSetup["style"] })}>
                {Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Spending</span>
              <select value={profile.spending} onChange={(e) => set({ spending: e.target.value as OwnerSetup["spending"] })}>
                {Object.entries(SPENDING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Patience for a rebuild</span>
              <select value={profile.patience} onChange={(e) => set({ patience: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y} season{y > 1 ? "s" : ""}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">How you come in</span>
              <select value={profile.entry ?? "owner"} onChange={(e) => set({ entry: e.target.value as OwnerSetup["entry"] })}>
                <option value="owner">Controlling owner: you bought the club and run it</option>
                <option value="buyer">Buyer: the club is for sale, and you watch while you bid for it or another</option>
                <option value="minority">Minority partner: you own 10% and get distributions, and can buy more</option>
                <option value="heir">Heir: you just inherited the club, with siblings as partners and estate tax to pay</option>
              </select>
            </label>
            <label className="field"><span className="label">The club's finances when you take over</span>
              <select value={profile.scenario} onChange={(e) => set({ scenario: e.target.value as Scenario })}>
                {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.what}</option>)}
              </select>
            </label>
            {profile.scenario === "custom" && (
              <div className="stack tight">
                <label className="field"><span className="label">The club's cash</span>
                  <select value={custom.cash} onChange={(e) => setCustom({ cash: Number(e.target.value) })}>
                    {[0, 15, 50, 100, 250, 500].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
                  </select>
                </label>
                <label className="field"><span className="label">Acquisition debt (floating, seven years)</span>
                  <select value={custom.debt} onChange={(e) => setCustom({ debt: Number(e.target.value) })}>
                    {[0, 150, 300, 450, 700, 1000].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
                  </select>
                </label>
                <label className="field"><span className="label">Your own cash</span>
                  <select value={custom.liquid} onChange={(e) => setCustom({ liquid: Number(e.target.value) })}>
                    {[25, 100, 300, 800, 3000].map((m) => <option key={m} value={m * 1_000_000}>${m}M</option>)}
                  </select>
                </label>
                <label className="field"><span className="label">The front office you inherit</span>
                  <select value={custom.staff} onChange={(e) => setCustom({ staff: e.target.value as CustomStart["staff"] })}>
                    <option value="weak">Weak: below-average executives</option>
                    <option value="average">Ordinary</option>
                    <option value="strong">Strong: one of the best-run clubs</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="panel stack">
            <h2>What you want</h2>
            <span className="muted">How much each matters to you, 0 to 5. Every season is scored on all six; these weights make your overall grade. You can change them later.</span>
            {GOAL_KEYS.map((g) => (
              <div key={g} className="btn-row" style={{ justifyContent: "space-between" }}>
                <span title={GOALS[g].what}>{GOALS[g].label}</span>
                <div className="tabs" role="group" aria-label={GOALS[g].label}>
                  {[0, 1, 2, 3, 4, 5].map((v) => <button key={v} aria-pressed={profile.weights[g] === v} onClick={() => set({ weights: { ...profile.weights, [g]: v } })}>{v}</button>)}
                </div>
              </div>
            ))}
          </div>
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
            <span className="muted">{STADIUM_BY_TEAM[team].note}</span>
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
            <label className="field"><span className="label">Scouting precision</span>
              <select value={scouting} onChange={(e) => setScouting(e.target.value as typeof scouting)}>
                <option value="sharp">Sharper reads (easier)</option>
                <option value="real">Realistic</option>
                <option value="foggy">Foggier reads (harder)</option>
              </select>
            </label>
            <label className="toggle">
              <input id="ironman" type="checkbox" checked={ironman} onChange={(e) => setIronman(e.target.checked)} />
              <span><strong>Ironman</strong><br /><span className="muted">One continuing save: no loading an earlier save to undo a decision.</span></span>
            </label>
            <button className="btn primary" onClick={() => onStart(newGame(team, owner.trim() || "Owner", { capRules, finances, scouting, ...(ironman ? { ironman } : {}) }, undefined, profile))}>
              Take over the {selected.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
