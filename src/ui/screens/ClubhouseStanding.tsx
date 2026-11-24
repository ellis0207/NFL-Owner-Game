// How players around the league see the owner and the club, and the
// medical staff the owner can replace.
import { useState } from "react";
import { care, DOCTOR_COST, DOCTOR_ROLE, franchiseReputation, ownerStanding, replaceDoctor } from "../../engine/playercare";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Bars, Dials, Gauge, toneFor } from "../gfx";

export function StandingPanel({ game }: { game: GameState }) {
  const s = ownerStanding(game);
  const rep = franchiseReputation(game, game.userTeam);
  return (
    <section className="panel stack">
      <h3>How players see the club</h3>
      <div className="gx-row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
        <Dials>
          <Gauge value={s.score / 100} label="Players' survey" text={`${s.score}`} sub="of 100" zones />
        </Dials>
        <div style={{ flex: "1 1 260px" }}>
          <Bars rows={s.parts.map(([k, v]) => ({ label: k, value: v, text: String(v), tone: toneFor(v / 100, false, [0.45, 0.65]) }))} max={100} />
        </div>
      </div>
      <p className="muted">Agents rate the owner {s.score >= 70 ? "well" : s.score >= 50 ? "about average" : "poorly"} ({s.score} of 100 in the players' association survey), and the franchise's reputation with players is {rep >= 0.65 ? "strong" : rep >= 0.45 ? "middling" : "weak"}. Free agents who care about stability and loyalty lean toward well-run clubs.</p>
    </section>
  );
}

export function DoctorsPanel({ game, changed }: { game: GameState; changed: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const c = care(game);
  return (
    <section className="panel stack">
      <h3>Medical staff</h3>
      <p className="muted">Better doctors give sharper first estimates on injuries; the trainer and rehab director shorten long recoveries. A change costs {money(DOCTOR_COST)} in buyout and search fees.</p>
      {said && <p className="notice">{said}</p>}
      <ul>
        {c.doctors.map((d) => (
          <li key={d.role}>
            {DOCTOR_ROLE[d.role]}: {d.name}, since {d.since}.{" "}
            <span className="muted">{d.skill >= 75 ? "Players trust him." : d.skill >= 60 ? "Well regarded." : "Players have doubts about his calls."}</span>{" "}
            <button className="link" onClick={() => { const n = replaceDoctor(game, d.role); setSaid(`${n.name} replaces ${d.name}.`); changed(); }}>Replace</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
