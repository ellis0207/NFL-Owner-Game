import { ACHIEVEMENTS, type AchievementGroup } from "../../engine/achievements";
import { DIFFICULTY, type Difficulty } from "../../engine/difficulty";
import { longDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";

const GROUPS: AchievementGroup[] = ["Football", "Players", "Roster building", "Business", "Ownership"];

/** Every achievement, earned ones first in each group, with when and on which difficulty. */
export function AchievementsScreen({ game }: { game: GameState }) {
  const earned = game.achievements?.earned ?? {};
  const count = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  return (
    <section className="stack">
      <p className="muted">{game.tutorial ? "Tutorial games don't earn achievements." : `${count} of ${ACHIEVEMENTS.length} earned in this save. They're checked every Monday and the day after the Super Bowl.`}</p>
      <div className="split">
        {GROUPS.map((g) => {
          const list = ACHIEVEMENTS.filter((a) => a.group === g).sort((a, b) => Number(!earned[a.id]) - Number(!earned[b.id]));
          return (
            <div key={g} className="panel stack tight">
              <h3>{g}</h3>
              {list.map((a) => {
                const e = earned[a.id];
                return (
                  <div key={a.id} className={`kit-ach${e ? " kit-ach-on" : ""}`}>
                    <strong>{e ? "★ " : "☆ "}{a.title}</strong>
                    <div className="muted">{a.what}</div>
                    {e && <div className="good">Earned {longDate(e.date)}{e.difficulty !== "standard" ? ` on ${DIFFICULTY[e.difficulty as Difficulty]?.label ?? e.difficulty}` : ""}.</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
