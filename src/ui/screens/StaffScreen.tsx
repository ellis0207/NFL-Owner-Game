import { useState } from "react";
import { SEASON, STAFF, TEAMS, TEAM_BY_ID } from "../../engine/league";
import { DEFENSE_LABEL, OFFENSE_LABEL } from "../../engine/schemes";
import { playCaller, teamSchemes, teamStaff } from "../../engine/staff";
import type { DefenseScheme, GameState, OffenseScheme, StaffPerson, StaffRole } from "../../engine/types";

const ROLE_NAMES: Record<StaffRole, string> = {
  HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", STC: "Special teams coordinator",
  GM: "General manager", TRN: "Head athletic trainer", PRO: "Director of pro scouting", COL: "Director of college scouting",
};

const ROLE_JOB: Partial<Record<StaffRole, string>> = {
  GM: "Runs the roster: cuts, signings, practice squad call-ups and, soon, trades and contracts.",
  TRN: "Keeps players healthy and gets injured players back on the field.",
  PRO: "Writes our reports on players around the league and in free agency.",
  COL: "Leads draft scouting: how much a week of scouting learns, and how accurate the college reports are.",
  STC: "Coaches the kicking game, returns and coverage units.",
};

function age(p: StaffPerson): string {
  const a = SEASON - p.birthYear;
  return p.birthYearEstimated ? `about ${a}` : `${a}`;
}

function schemeText(p: StaffPerson): string | null {
  if (!p.scheme) return null;
  return p.side === "offense"
    ? STAFF.schemeNames.offense[p.scheme as OffenseScheme]
    : STAFF.schemeNames.defense[p.scheme as DefenseScheme];
}

function injuriesThisSeason(game: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const box of Object.values(game.box)) for (const i of box.injuries) out[i.team] = (out[i.team] ?? 0) + 1;
  return out;
}

export function StaffScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<"ours" | "league">("ours");
  const staff = teamStaff(game.userTeam);
  const inj = injuriesThisSeason(game);
  const leagueAvg = Object.values(inj).reduce((a, b) => a + b, 0) / 32;

  return (
    <section className="stack">
      <h2>Staff</h2>
      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={view === "ours"} onClick={() => setView("ours")}>Our staff</button>
        <button aria-pressed={view === "league"} onClick={() => setView("league")}>Around the league</button>
      </div>

      {view === "ours" && (
        <>
          <div className="cards">
            {(["HC", "OC", "DC", "STC", "GM", "TRN", "PRO", "COL"] as StaffRole[]).map((role) => {
              const p = staff[role];
              if (!p) {
                return role === "DC" ? (
                  <div key={role} className="card">
                    <span className="role">{ROLE_NAMES[role]}</span>
                    <span className="muted">No coordinator: {staff.HC?.name} runs the defense.</span>
                  </div>
                ) : null;
              }
              const scheme = schemeText(p);
              return (
                <div key={role} className="card">
                  <span className="role">{ROLE_NAMES[role]}</span>
                  <span className="who">{p.name}</span>
                  <span className="muted">Age {age(p)} · {p.hiredYear >= SEASON ? "First season in the job" : `In the job since ${p.hiredYear}`}</span>
                  {p.background && <span>{p.background}</span>}
                  {scheme && <span><span className="label">Scheme</span> {scheme}</span>}
                  {p.callsPlays.length > 0 && <span><span className="label">Calls plays</span> {p.callsPlays.join(" and ")}</span>}
                  {ROLE_JOB[role] && <span className="muted">{ROLE_JOB[role]}</span>}
                  {role === "TRN" && Object.keys(game.box).length > 0 && (
                    <span>Game injuries so far: {inj[game.userTeam] ?? 0} (league average {leagueAvg.toFixed(1)})</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted">
            Coaches, coordinators and general managers are the real people in those jobs for 2026, running their real
            schemes. Ages marked "about" are estimates. Trainers and scouting directors are fictional.
          </p>
        </>
      )}

      {view === "league" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Team</th><th>Head coach</th><th>Offense</th><th>Defense</th><th>Play callers</th><th>GM</th></tr></thead>
            <tbody>
              {TEAMS.map((t) => {
                const s = teamStaff(t.id);
                const schemes = teamSchemes(t.id);
                const off = playCaller(t.id, "offense");
                const def = playCaller(t.id, "defense");
                return (
                  <tr key={t.id} className={t.id === game.userTeam ? "mine" : undefined}>
                    <td className="name">{TEAM_BY_ID[t.id].name}</td>
                    <td>{s.HC?.name}</td>
                    <td>{OFFENSE_LABEL[schemes.offense]}<div className="muted">OC {s.OC?.name ?? "none"}</div></td>
                    <td>{DEFENSE_LABEL[schemes.defense]}<div className="muted">DC {s.DC?.name ?? "none"}</div></td>
                    <td className="muted">O: {off.name}<br />D: {def.name}</td>
                    <td>{s.GM?.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
