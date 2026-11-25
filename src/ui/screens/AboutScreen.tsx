import { longDate } from "../../engine/dates";
import { BASE_SEASON } from "../../engine/league";
import { Callout, Card } from "../kit";
import { BUILT_WITH, MADE_UP, RELEASED, SOURCES, VERSION, WHATS_NEW } from "../release";

/** The game itself: its version, what's new, where the real league comes from and what's made up. */
export function AboutScreen() {
  return (
    <section className="stack ut-about">
      <div className="ut-about-head">
        <div className="ut-about-mark" aria-hidden="true">{VERSION}</div>
        <div>
          <h3>NFL Owner Simulator, version {VERSION}</h3>
          <p className="muted">Released {longDate(RELEASED)}. You own a club in the real league as it stood when camps opened in July {BASE_SEASON}, and run both sides of it, day by day, for as long as you hold it.</p>
        </div>
      </div>

      <Card title={`What's new in ${VERSION}`} kicker="The finishing touches">
        <ul className="ut-about-list">
          {WHATS_NEW.map((n) => <li key={n.title}><b>{n.title}.</b> {n.text}</li>)}
        </ul>
      </Card>

      <div className="split">
        <Card title="Where the real league comes from" kicker="Data sources">
          <ul className="ut-about-list">
            {SOURCES.map((s) => <li key={s.name}><b>{s.name}.</b> {s.what}</li>)}
          </ul>
        </Card>
        <div className="stack">
          <Card title="What's made up" kicker="So nobody takes it for real">
            <ul className="ut-about-list">
              {MADE_UP.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </Card>
          <Card title="Built with" kicker="Credits">
            <ul className="ut-about-list">
              {BUILT_WITH.map((b) => <li key={b.name}><b>{b.name}:</b> {b.what}.</li>)}
            </ul>
          </Card>
        </div>
      </div>

      <Callout title="An unofficial fan game">
        NFL Owner Simulator isn't affiliated with or endorsed by the NFL, the NFL Players Association, any club or any data source above.
        Real names are used to describe the real league; every result after July {BASE_SEASON} is the game's own.
      </Callout>
    </section>
  );
}
