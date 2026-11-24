import { ACHIEVEMENTS, type AchievementGroup } from "../../engine/achievements";
import { DIFFICULTY, type Difficulty } from "../../engine/difficulty";
import { longDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";
import { Gauge, Icon, Pips } from "../gfx";

const GROUP_ICON: Record<AchievementGroup, string> = { Football: "football", Players: "star", "Roster building": "clipboard", Business: "money", Ownership: "key" };

const GROUPS: AchievementGroup[] = ["Football", "Players", "Roster building", "Business", "Ownership"];

/** Every achievement, earned ones first in each group, with when and on which difficulty. */
export function AchievementsScreen({ game }: { game: GameState }) {
  const earned = game.achievements?.earned ?? {};
  const count = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  return (
    <section className="stack">
      {!game.tutorial && <Gauge value={count / ACHIEVEMENTS.length} label="Achievements" text={`${count}/${ACHIEVEMENTS.length}`} sub="earned in this save" tone="good" />}
      <p className="muted">{game.tutorial ? "Tutorial games don't earn achievements." : "They're checked every Monday and the day after the Super Bowl."}</p>
      <div className="split">
        {GROUPS.map((g) => {
          const list = ACHIEVEMENTS.filter((a) => a.group === g).sort((a, b) => Number(!earned[a.id]) - Number(!earned[b.id]));
          return (
            <div key={g} className="panel stack tight">
              <div className="gx-row"><Icon name={GROUP_ICON[g]} size={20} /><h3 style={{ flex: 1 }}>{g}</h3><Pips n={list.filter((a) => earned[a.id]).length} of={list.length} /></div>
              {list.map((a) => {
                const e = earned[a.id];
                return (
                  <div key={a.id} className={`kit-ach${e ? " kit-ach-on" : ""}`}>
                    <strong className="gx-row" style={{ flexWrap: "nowrap" }}><span className={`ut-medal${e ? " on" : ""}`}><Icon name={e ? "trophy" : "lock"} size={16} /></span>{a.title}</strong>
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
