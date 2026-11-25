// A new owner's first season: five things worth doing before the opener, each
// ticked off from what the save records, with a button to the page that does
// it. It goes away once they're done, after the first season, or when the
// owner dismisses it (Settings > Today panels brings it back).
import type { GameState } from "../engine/types";
import { emphasis } from "../engine/gameweek";
import { SCHEDULE } from "../engine/league";
import type { Screen } from "./nav";
import { Icon } from "./gfx";
import { Card } from "./kit";

interface Step { id: string; icon: string; title: string; why: string; done: boolean; open: [Screen, string?] }

export function firstSteps(game: GameState): Step[] {
  const us = game.userTeam;
  const played = SCHEDULE.some((g) => g.type === "REG" && (g.home === us || g.away === us) && game.results[g.id]);
  return [
    { id: "memo", icon: "clipboard", title: "Decide something on your desk", why: "Memos, offers and price calls wait on Today. Leave one and the staff decide it their way.", done: (game.office?.memos ?? []).some((m) => m.status === "decided"), open: ["Today"] },
    { id: "practice", icon: "whistle", title: "Set the week's practice", why: "Game plan, fundamentals or recovery: it shapes Sunday, growth and practice injuries.", done: emphasis(game) !== "balanced", open: ["Game week"] },
    { id: "price", icon: "ticket", title: "Price a home game", why: "Each home game sells by demand. Fill the building or charge for a big draw.", done: !!game.business?.tix?.game?.memo || (game.business?.tix?.calls?.length ?? 0) > 0, open: ["Business", "Tickets"] },
    { id: "press", icon: "megaphone", title: "Talk to the press", why: "A press conference, an interview or a post. Fans and the press remember what you promise.", done: Object.keys(game.media?.desk?.last ?? {}).length > 0, open: ["Media", "Press room"] },
    { id: "opener", icon: "football", title: "Watch your opener", why: "Run the clock to kickoff with Next game and follow it on the field view.", done: played, open: ["Schedule"] },
  ];
}

/** Whether the card should show at all: a real save, still in its first season, with something left to do. */
export function showFirstSteps(game: GameState): boolean {
  return !game.tutorial && !(game.history?.seasons.length) && firstSteps(game).some((s) => !s.done);
}

export function FirstSteps({ game, go, dismiss }: { game: GameState; go: (s: Screen, tab?: string) => void; dismiss: () => void }) {
  const steps = firstSteps(game);
  const left = steps.filter((s) => !s.done).length;
  return (
    <Card className="dk-steps" kicker="Your first season" title={`${steps.length - left} of ${steps.length} done`}
      actions={<button className="btn small" onClick={dismiss}>Hide</button>}>
      <ol className="dk-steps-list">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "done" : ""}>
            <span className="dk-steps-mark">{s.done ? <Icon name="check" size={16} /> : <Icon name={s.icon} size={16} />}</span>
            <span className="dk-steps-text"><b>{s.title}</b><small>{s.why}</small></span>
            {!s.done && <button className="btn small" onClick={() => go(s.open[0], s.open[1])}>Go</button>}
          </li>
        ))}
      </ol>
      <p className="muted">The Guide explains the cap, the money and the rest of the job, a chapter at a time.</p>
    </Card>
  );
}
