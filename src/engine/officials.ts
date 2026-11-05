// The officials and instant replay.
//
// Most calls on the field are right. When one isn't, the team it hurt can
// challenge it (two challenges a game, a third after winning both, and a
// timeout lost with each failed one), and the replay booth reviews every
// turnover, every score and anything inside two minutes of a half on its own.
// Replay only reverses a call when the video is clear, so some mistakes stand.
// Calls the officials miss or get wrong are noted, and a club can ask the
// league office about them after the game (gameops.ts). The league's finding
// is the truth; nobody inside the game sees it.
//
// Officials draw on their own random stream, so the plays themselves come out
// the same as they would without them except where a call changes a result.
import { rngFor, type Rng } from "./rng";
import type { DisputedCall } from "./types";

/**
 * catch: the pass was caught, but might be ruled incomplete.
 * drop: the pass fell incomplete, but might be ruled a catch.
 * fumble: the ball came out and was recovered by the defense, but might be ruled down by contact.
 */
export type Ruling = "catch" | "drop" | "fumble";

/** How often each kind of play is ruled wrong on the field. */
const WRONG: Record<Ruling, number> = { catch: 0.012, drop: 0.012, fumble: 0.07 };
/** How often a wrong call is reversed once it's reviewed: the video has to be clear. */
const CLEAR_VIDEO = 0.84;

export interface CallContext {
  q: number;
  clock: number;
  offense: string;
  defense: string;
  /** Yards or field position at stake, for a coach weighing a challenge. */
  stake: number;
  /** Each team's timeouts left and its head coach's game management (about 40 to 95). */
  timeouts: Record<string, number>;
  judgment: Record<string, number>;
  spendTimeout: (team: string) => void;
}

export class Officials {
  rng: Rng;
  challenges: Record<string, number>;
  won: Record<string, number>;
  calls: DisputedCall[] = [];

  constructor(seed: number, gameId: string, away: string, home: string) {
    this.rng = rngFor(seed, `officials:${gameId}`);
    this.challenges = { [away]: 2, [home]: 2 };
    this.won = { [away]: 0, [home]: 0 };
  }

  /** The booth, not the coaches, reviews plays inside two minutes of each half and in overtime. */
  boothTime(c: CallContext): boolean {
    return ((c.q === 2 || c.q >= 4) && c.clock <= 120) || c.q >= 5;
  }

  canChallenge(team: string, c: CallContext): boolean {
    return !this.boothTime(c) && this.challenges[team] > 0 && c.timeouts[team] > 0;
  }

  /** Whether a coach throws the red flag, from what the booth upstairs tells them and what's at stake. */
  throwsFlag(team: string, c: CallContext, wrong: boolean): boolean {
    if (!this.canChallenge(team, c)) return false;
    const sense = (c.judgment[team] - 70) * 0.012;
    const p = wrong ? 0.5 + sense + c.stake * 0.012 : 0.004 + c.stake * 0.0006 - sense * 0.05;
    return this.rng() < Math.min(0.92, Math.max(0, p));
  }

  challengeResult(team: string, c: CallContext, upheld: boolean): void {
    this.challenges[team]--;
    if (upheld) {
      this.won[team]++;
      if (this.won[team] === 2) this.challenges[team]++;
    } else c.spendTimeout(team);
  }

  /**
   * The officials rule on a play whose true result is `kind`. Returns whether
   * the true result stands after any review, and a note for the play-by-play.
   */
  rule(kind: Ruling, c: CallContext): { stands: boolean; note: string } {
    const hurt = kind === "catch" ? c.offense : c.defense;
    const other = hurt === c.offense ? c.defense : c.offense;
    const wrong = this.rng() < WRONG[kind];
    const onField = kind === "catch" ? (wrong ? "incomplete" : "complete") : kind === "drop" ? (wrong ? "a catch" : "incomplete") : wrong ? "down by contact" : "a fumble";
    const what = kind === "fumble" ? (wrong ? "Runner ruled down by contact" : "Fumble ruled on the field") : `Pass ruled ${onField}`;
    if (!wrong) {
      // A coach sometimes challenges a call that was right; the call stands.
      if (c.stake >= 15 && this.throwsFlag(other, c, false)) {
        this.challengeResult(other, c, false);
        this.calls.push({ q: c.q, clock: c.clock, team: other, text: `${what}; ${other}'s challenge failed`, wrong: false });
        return { stands: true, note: ` ${other} challenged the ruling of ${onField}; it stands, and ${other} loses a timeout.` };
      }
      return { stands: true, note: "" };
    }
    // In the last two minutes the booth decides; otherwise it's the hurt coach's call.
    let reviewed = this.boothTime(c);
    let challenged = false;
    if (!reviewed && this.throwsFlag(hurt, c, true)) {
      reviewed = true;
      challenged = true;
    }
    if (reviewed) {
      const reversed = this.rng() < CLEAR_VIDEO;
      if (challenged) this.challengeResult(hurt, c, reversed);
      const who = challenged ? `${hurt} challenged` : "The replay booth reviewed it";
      if (reversed) return { stands: true, note: ` Ruled ${onField} on the field. ${who}, and the ruling was reversed.` };
      this.calls.push({ q: c.q, clock: c.clock, team: hurt, text: `${what}; ${challenged ? "our challenge failed" : "replay let it stand"}`, wrong: true });
      return { stands: false, note: ` ${who}; the ruling stands${challenged ? `, and ${hurt} loses a timeout` : ""}.` };
    }
    this.calls.push({ q: c.q, clock: c.clock, team: hurt, text: `${what}; not reviewed`, wrong: true });
    return { stands: false, note: "" };
  }

  /** A flag thrown: some are wrong, and some right ones are disputed anyway. */
  flag(c: CallContext, against: string, what: string, yards: number): void {
    if (yards < 10) return;
    const r = this.rng();
    if (r < 0.08) this.calls.push({ q: c.q, clock: c.clock, team: against, text: `${what} called`, wrong: true });
    else if (r < 0.13) this.calls.push({ q: c.q, clock: c.clock, team: against, text: `${what} called`, wrong: false });
  }

  /** An incomplete pass on a money down where the offense wanted a flag for interference. */
  noFlag(c: CallContext): boolean {
    const r = this.rng();
    if (r >= 0.03) return false;
    this.calls.push({ q: c.q, clock: c.clock, team: c.offense, text: "No flag for pass interference", wrong: r < 0.014 });
    return true;
  }
}
