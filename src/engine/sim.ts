// Play-by-play game simulation.
//
// Every snap is called by the team's real play-caller from their scheme's
// tendencies, adjusted for down, distance, score and clock. The play is then
// resolved from the traits of the players on the field: an outside-zone run
// leans on linemen who move well and a back with vision, a deep shot on a
// fast receiver, the quarterback's arm and the time the line buys against
// the rush. Rosters that fit their coaches' schemes play better, good
// play-callers make better calls, and luck still decides plenty of Sundays.
import { addLine, pack, stat, type StatLine } from "./stats";
import { isHurt } from "./injuries";
import { PLAYER_BY_ID, SCHEDULE } from "./league";
import { LEAGUE_RULES } from "./rules";
import { gaussian } from "./rng";
import { type CallContext } from "./officials";
import { fourthDownAdvice } from "./strategy";
import { formation, PLAY_FLAGS as F, spotText } from "./playlog";
import { type Personnel, type RunType } from "./schemes";
import { bigMoment, defensiveRead, poise, returnShape, selfScout, tendencyBucket } from "./simtactics";
import type { BoxScore, GameResult, GameState, ScheduledGame } from "./types";
import { SimPass } from "./simpass";
import { QUARTER, clamp, gameDayActives, yardsText, type DefLineup, type Lineup, type Package, type PlayOutcome, type Side, type SimOutput, type Team } from "./simteam";

export type { SimOutput };
export { gameDayActives };

export function simulateGame(state: GameState, game: ScheduledGame, away: string, home: string): SimOutput {
  return new GameSim(state, game, away, home).play();
}

class GameSim extends SimPass {
  // ---- Game flow ----

  play(): SimOutput {
    const away = this.t.away;
    const home = this.t.home;
    this.receivedFirst = this.rng() < 0.5 ? "away" : "home";
    this.pregameNotes();
    this.kickoff(this.other(this.receivedFirst));
    let guard = 0;
    while (!this.over && guard++ < 400) this.snap();
    this.rec.closeDrive(this, this.rec.why || "End of game");

    const result: GameResult = { away: away.id, home: home.id, awayScore: away.score, homeScore: home.score, overtime: this.ot.active };
    const players = { away: {} as Record<string, number[]>, home: {} as Record<string, number[]> };
    for (const side of ["away", "home"] as const) {
      for (const [id, line] of Object.entries(this.t[side].stats)) players[side][id] = pack(line);
    }
    const box: BoxScore = {
      quarters: { away: away.quarters, home: home.quarters },
      team: { away: away.box, home: home.box },
      players,
      scoring: this.scoring,
      inactives: { away: away.inactive, home: home.inactive },
      injuries: this.injuries,
      ...(this.refs.calls.length ? { calls: this.refs.calls } : {}),
      adv: this.rec.adv,
      pe: this.rec.pe,
      ...(this.cond.weather.indoor ? {} : { weather: this.cond.weather }),
    };
    return { result, box, log: this.rec.log(this.game.date) };
  }

  // ---- Storylines in the feed ----

  /** The quarterback who threw the most passes in this club's last game that counted, if it has played one. */
  lastStarter(team: string): string | undefined {
    let last: ScheduledGame | undefined;
    for (const g of SCHEDULE) {
      if (g.type === "PRE" || g.date >= this.game.date || (g.away !== team && g.home !== team) || !this.state.box[g.id]) continue;
      if (!last || g.date > last.date) last = g;
    }
    const r = last && this.state.results[last.id];
    if (!last || !r) return undefined;
    const lines = this.state.box[last.id].players[r.away === team ? "away" : "home"];
    let best: string | undefined;
    for (const [id, v] of Object.entries(lines)) if (stat(v, "att") > (best ? stat(lines[best], "att") : 0)) best = id;
    return best;
  }

  /** Before kickoff: who starts at quarterback, and whether that is a change from last week. */
  pregameNotes(): void {
    for (const side of ["away", "home"] as const) {
      const t = this.t[side];
      const qb = this.pool(t, "QB")[0];
      if (!qb) continue;
      const was = this.pre ? undefined : this.lastStarter(t.id);
      if (!was || was === qb) {
        this.rec.note(this, `${this.name(qb)} starts at quarterback for ${t.id}.`);
        continue;
      }
      const why = t.inactive.includes(was) || isHurt(this.state, was, this.game.date) ? `${this.name(was)} is out injured`
        : !this.isOn(t, was) ? `${this.name(was)} is no longer with the club`
        : `the coaches have benched ${this.name(was)}`;
      this.rec.alert(this, side, `Quarterback change: ${this.name(qb)} starts for ${t.id}; ${why}.`);
    }
  }

  /** A new quarterback under center during the game. */
  noteQb(o: Team, qb: string): void {
    const was = o.qbNow;
    o.qbNow = qb;
    if (!was || was === qb) return;
    const why = o.out.has(was) ? `${this.name(was)} is out of the game with an injury`
      : this.pre ? `${this.name(was)} is done for the day` : `${this.name(was)} goes to the bench`;
    this.rec.alert(this, o.side, `Quarterback change: ${this.name(qb)} takes over for ${o.id}; ${why}.`);
  }

  /**
   * What the crowd saw on a snap wiped out by a foul during the play. The
   * sim settles the down from the foul alone, so the gain described here is
   * for the feed only and comes from the feed's own random stream.
   */
  calledBack(o: Team, offense: boolean, what: string): string {
    const qb = this.name(o.qbNow ?? this.pool(o, "QB")[0]);
    const rb = this.name(this.pool(o, "RB")[0]);
    const wr = this.name(this.rec.pick(this.pool(o, "WR").slice(0, 3)));
    const n = 4 + Math.floor(this.rec.flavor() * 18);
    const gain = n >= 100 - this.ydl ? "into the end zone" : `for ${n} yards`;
    const back = n >= 100 - this.ydl ? "but there is a flag down and the touchdown comes back" : "but there is a flag down and it comes back";
    if (offense) {
      if (what === "Offensive pass interference") return `${qb} pass complete to ${wr} ${gain}, ${back}.`;
      if (what === "Offensive holding" && this.rec.flavor() < 0.5) return `${qb} pass complete to ${wr} ${gain}, ${back}.`;
      return `${rb} runs ${gain}, ${back}.`;
    }
    if (what === "Defensive pass interference") return `${qb} pass deep intended for ${wr} falls incomplete, with a flag on the coverage.`;
    if (what === "Defensive holding" || what === "Illegal contact") return `${qb} pass intended for ${wr} is incomplete, with a flag in the secondary.`;
    if (what === "Roughing the passer") return `${qb} throws it away and is hit late.`;
    return `${rb} is stopped for no gain, with a flag on the tackle.`;
  }

  /** What the officials need to weigh a ruling and a challenge. */
  callContext(o: Team, d: Team, stake: number): CallContext {
    return {
      q: this.q, clock: Math.max(0, Math.round(this.clock)), offense: o.id, defense: d.id, stake,
      timeouts: { [o.id]: o.timeouts, [d.id]: d.timeouts },
      judgment: { [o.id]: o.fx.gameManagement, [d.id]: d.fx.gameManagement },
      spendTimeout: (team) => {
        const t = team === o.id ? o : d;
        t.timeouts = Math.max(0, t.timeouts - 1);
      },
    };
  }

  spot(ydl: number, o: Team, d: Team): string {
    return spotText(ydl, o.id, d.id);
  }

  /** Points scored: tracks quarter totals and the scoring summary. */
  score(team: Team, points: number, text: string): void {
    team.score += points;
    team.quarters[Math.min(this.q, 5) - 1] = (team.quarters[Math.min(this.q, 5) - 1] ?? 0) + points;
    this.scoring.push({ q: this.q, clock: Math.max(0, Math.round(this.clock)), team: team.id, text, away: this.t.away.score, home: this.t.home.score });
  }

  tick(seconds: number): void {
    const before = this.clock;
    this.t[this.pos].box.top += Math.max(0, Math.min(seconds, before));
    this.clock -= seconds;
    if ((this.q === 2 || this.q === 4) && before > 120 && this.clock <= 120) this.clock = 120; // two-minute warning
  }

  endOfPeriodCheck(): void {
    if (this.clock > 0) return;
    if (this.ot.active) {
      // Regular-season overtime is one 10-minute period; playoff games keep going.
      if (this.game.type === "POST") {
        this.q++;
        this.clock = QUARTER;
        return;
      }
      this.over = true;
      return;
    }
    if (this.q === 2) {
      this.rec.closeDrive(this, "End of half");
      if (!this.pre) this.halftime();
      this.q = 3;
      this.clock = QUARTER;
      this.t.away.timeouts = 3;
      this.t.home.timeouts = 3;
      this.kickoff(this.receivedFirst);
      return;
    }
    if (this.q === 4) {
      if (this.t.away.score !== this.t.home.score || this.pre) {
        this.over = true;
        return;
      }
      this.rec.closeDrive(this, "End of regulation");
      this.startOvertime();
      return;
    }
    this.q++;
    this.clock = QUARTER;
  }

  startOvertime(): void {
    this.ot.active = true;
    this.q = 5;
    this.clock = this.game.type === "POST" ? QUARTER : LEAGUE_RULES.otMinutes * 60;
    this.t.away.timeouts = 2;
    this.t.home.timeouts = 2;
    const receiver: Side = this.rng() < 0.5 ? "away" : "home";
    this.kickoff(this.other(receiver));
  }

  /** Called whenever a possession ends; decides overtime outcomes. */
  possessionEnded(by: Side): void {
    if (!this.ot.active) return;
    this.ot.possessions[by]++;
    const a = this.t.away.score;
    const h = this.t.home.score;
    if (this.ot.possessions.away >= 1 && this.ot.possessions.home >= 1) {
      if (a !== h) this.over = true;
      else this.ot.suddenDeath = true;
    }
  }

  newPossession(side: Side, ydl: number): void {
    this.rec.closeDrive(this);
    this.pos = side;
    this.ydl = clamp(ydl, 1, 99);
    this.down = 1;
    this.dist = Math.min(10, 100 - this.ydl);
    this.driveStartClock = this.clock;
    this.driveReachedRz = false;
    this.t[side].drives++;
    this.rec.openDrive(this, side);
  }

  turnover(newYdl: number): void {
    const was = this.pos;
    this.t[was].box.turnovers++;
    this.possessionEnded(was);
    if (this.over) return;
    this.newPossession(this.other(was), newYdl);
  }

  // ---- Kicks ----

  kickoff(kicking: Side): void {
    const k = this.t[kicking];
    const r = this.t[this.other(kicking)];
    const kicker = this.specialist(k, "K");
    this.snaps(k, [kicker, ...this.coverage(k)], "stSnaps");
    this.snaps(r, this.coverage(r), "stSnaps");
    // Onside kick when trailing late.
    const trail = r.score - k.score;
    if (this.q >= 4 && this.clock < 150 && trail > 0 && trail <= 16 && !this.ot.active) {
      this.tick(4);
      // The 4th-and-20 alternative, where it's allowed, keeps the ball more often than an onside kick.
      if (this.rng() < (LEAGUE_RULES.fourthAndTwenty ? 0.22 : 0.12)) {
        this.rec.kick(this, kicking, LEAGUE_RULES.fourthAndTwenty ? `${k.id} converts the 4th-and-20 play and keeps the ball.` : `${this.name(kicker)} onside kick, recovered by ${k.id}!`, F.big);
        this.newPossession(kicking, LEAGUE_RULES.fourthAndTwenty ? 45 : 48);
        return;
      }
      this.rec.kick(this, kicking, LEAGUE_RULES.fourthAndTwenty ? `${k.id} fails on 4th-and-20; ${r.id} takes over.` : `${this.name(kicker)} onside kick, recovered by ${r.id}.`);
      this.newPossession(r.side, 52);
      return;
    }
    // 2025 kickoff rules: touchbacks come out to the 35, and most kicks are returned. A closer
    // touchback spot makes kicking it deep more attractive; a farther one keeps more kicks in play.
    const power = this.tr(kicker, "kickPower");
    const tb = LEAGUE_RULES.touchback;
    if (this.rng() < 0.28 + (35 - tb) * 0.025 + (power - 80) * 0.006) {
      this.rec.kick(this, kicking, `${this.name(kicker)} kicks off; touchback, ${r.id} ball at the ${spotText(tb, r.id, k.id)}.`);
      this.newPossession(r.side, tb);
      return;
    }
    const ret = this.returner(r, "kr");
    const skill = this.tr(ret, "speed") - 80 + (r.fx.specialTeams - k.fx.specialTeams) * 0.15;
    const plan = returnShape(r.st.returns);
    let yards = Math.round(23 + plan.yards + gaussian(this.rng) * 5 + skill * 0.15);
    const burst = this.rng();
    if (burst < (0.035 + skill * 0.001) * plan.burst) yards += 15 + Math.round(this.rng() * 40);
    this.tick(6);
    this.add(r, ret, "kr");
    if (burst < 0.003 + skill * 0.0002 || yards >= 100) {
      this.add(r, ret, "krYds", 100);
      this.add(r, ret, "krTd");
      const row = this.rec.kick(this, kicking, `${this.name(kicker)} kicks off; ${this.name(ret)} returns it all the way for a TOUCHDOWN.`, F.score | F.big);
      this.newPossession(r.side, 99);
      this.quietTd = true;
      this.touchdown(r, `${this.name(ret)} kickoff return`, ret);
      this.quietTd = false;
      row[9] = this.t.away.score;
      row[10] = this.t.home.score;
      return;
    }
    yards = clamp(yards, 5, 95);
    this.add(r, ret, "krYds", yards);
    const kt = this.tackle(k, this.coverage(k), 0);
    const kText = `${this.name(kicker)} kicks off; ${this.name(ret)} returns it to the ${spotText(yards, r.id, k.id)}${kt ? ` (${this.name(kt)})` : ""}.`;
    if (this.rng() < 0.006 * plan.fumble) {
      this.rec.kick(this, kicking, `${kText} ${this.name(ret)} FUMBLES; ${k.id} recovers.`, F.turnover | F.big);
      // Muffed or fumbled return.
      this.add(r, ret, "fum");
      this.add(r, ret, "fumLost");
      this.newPossession(kicking, 100 - yards);
      this.t[r.side].box.turnovers++;
      return;
    }
    this.rec.kick(this, kicking, kText, yards >= 45 ? F.big : 0);
    this.newPossession(r.side, yards);
  }

  punt(): void {
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const punter = this.specialist(o, "P");
    this.snaps(o, [punter, this.specialist(o, "LS"), ...this.coverage(o)], "stSnaps");
    this.snaps(d, this.coverage(d), "stSnaps");
    this.tick(7);
    if (this.rng() < 0.006) {
      // Blocked.
      this.rec.say(`${this.name(punter)} punt is BLOCKED; ${d.id} recovers.`, F.kick | F.turnover | F.big);
      this.rec.why = "Blocked punt";
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - Math.max(1, this.ydl - 8));
      return;
    }
    const power = this.tr(punter, "kickPower");
    const placement = this.tr(punter, "placement");
    // Directional punting gives up distance to keep the ball away from the returner.
    const directional = o.st.punts === "directional";
    let gross = Math.round(50.4 - (directional ? 2.5 : 0) + (power - 80) * 0.22 + gaussian(this.rng) * 7 + (o.fx.specialTeams - 70) * 0.03);
    const room = 100 - this.ydl;
    // Short-field punts are aimed inside the 20 instead of hit for distance.
    if (room < 45) gross = Math.round(room - 5 - this.rng() * 8 + (placement - 80) * 0.1);
    gross = clamp(gross, 20, 75);
    this.add(o, punter, "punts");
    this.rec.why = "Punt";
    let landing = this.ydl + gross;
    if (landing >= 100) {
      this.rec.say(`${this.name(punter)} punts ${room} yards into the end zone; touchback.`, F.kick);
      this.add(o, punter, "puntYds", room);
      this.add(o, punter, "puntLong", room);
      this.add(o, punter, "puntTb");
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 20);
      return;
    }
    this.add(o, punter, "puntYds", gross);
    this.add(o, punter, "puntLong", gross);
    const r = this.rng();
    let ret = 0;
    const returner = this.returner(d, "pr");
    const rplan = returnShape(d.st.returns);
    const returnRate = (directional ? 0.3 : 0.42) * (d.st.returns === "aggressive" ? 1.15 : d.st.returns === "safe" ? 0.8 : 1);
    if (landing < 90 && r < returnRate) {
      const skill = this.tr(returner, "agility") - 80 + (d.fx.specialTeams - o.fx.specialTeams) * 0.15;
      ret = Math.round(Math.max(0, 8 + rplan.yards - (directional ? 2 : 0) + gaussian(this.rng) * 6 + skill * 0.15));
      if (this.rng() < (0.03 + skill * 0.001) * rplan.burst) ret += 15 + Math.round(this.rng() * 50);
      this.add(d, returner, "pr");
      if (landing - ret <= 0) {
        this.add(d, returner, "prYds", landing);
        this.add(d, returner, "prTd");
        this.possessionEnded(o.side);
        if (this.over) return;
        this.rec.say(`${this.name(punter)} punts ${gross} yards; ${this.name(returner)} returns it ${landing} yards for a`, F.kick | F.big);
        this.newPossession(d.side, 99);
        this.touchdown(d, `${this.name(returner)} ${landing}-yard punt return`, returner);
        return;
      }
      this.add(d, returner, "prYds", ret);
      const pt = this.tackle(o, this.coverage(o), 0);
      this.rec.say(`${this.name(punter)} punts ${gross} yards; ${this.name(returner)} returns it ${yardsText(ret)}${pt ? ` (${this.name(pt)})` : ""}.`, F.kick | (ret >= 20 ? F.big : 0));
      if (this.rng() < 0.01 * rplan.fumble) {
        this.rec.say(`${this.name(punter)} punts ${gross} yards; ${this.name(returner)} MUFFS it and ${o.id} recovers!`, F.kick | F.turnover | F.big);

        // Muffed punt recovered by the kicking team.
        this.add(d, returner, "fum");
        this.add(d, returner, "fumLost");
        d.box.turnovers++;
        this.newPossession(o.side, landing - ret);
        return;
      }
    } else if (landing >= 95) {
      landing = 90 + Math.floor(this.rng() * 8);
      this.rec.say(`${this.name(punter)} punts ${gross} yards, downed at the ${spotText(100 - landing, d.id, o.id)}.`, F.kick);
    } else this.rec.say(`${this.name(punter)} punts ${gross} yards, ${this.rec.pick(["fair catch", "fair catch", "downed", "out of bounds"])} at the ${spotText(100 - landing, d.id, o.id)}.`, F.kick);
    landing -= ret;
    if (landing >= 80) this.add(o, punter, "puntIn20");
    this.possessionEnded(o.side);
    if (!this.over) this.newPossession(d.side, 100 - landing);
  }

  fgMakeChance(kicker: string | undefined, distance: number): number {
    const power = this.tr(kicker, "kickPower");
    const acc = this.tr(kicker, "kickAccuracy");
    const l50 = 62.5 + (power - 80) * 0.25 - this.cond.kickRange;
    const p = 1 / (1 + Math.exp((distance - l50) / 6));
    return clamp(p * (0.985 + (acc - 80) * 0.002 - this.cond.kickAcc), 0.02, 0.995);
  }

  fieldGoal(): void {
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const kicker = this.specialist(o, "K");
    const distance = 100 - this.ydl + 17;
    this.snaps(o, [kicker, this.specialist(o, "LS"), this.specialist(o, "P"), ...this.coverage(o)], "stSnaps");
    this.snaps(d, this.coverage(d), "stSnaps");
    this.tick(5);
    this.add(o, kicker, "fga");
    if (distance >= 50) this.add(o, kicker, "fga50");
    else if (distance >= 40) this.add(o, kicker, "fga40");
    const lead = o.score - d.score;
    const moment = bigMoment(this.q, this.clock, lead, this.ot.active, this.game.type === "POST") && lead <= 0;
    // About one kick in seventy is blocked: the one in a hundred well-struck kicks that used to drift wide for no
    // reason, and the worst-struck of the misses, which come off the foot low. The same draws decide it, so makes
    // and misses fall exactly as they did.
    const struck = this.rng();
    const onLine = struck < clamp(this.fgMakeChance(kicker, distance) + (moment && kicker ? poise(this.state, kicker) * 0.04 : 0), 0.02, 0.99);
    const made = onLine && this.rng() > 0.01;
    if (!made && (onLine || struck > 0.994)) {
      // The defense takes over where the ball was kicked from, seven yards behind the line.
      this.rec.say(`${this.name(kicker)} ${distance}-yard field goal is BLOCKED; ${d.id} recovers.`, F.kick | F.big);
      this.rec.why = "Blocked field goal";
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - Math.max(1, this.ydl - 7));
      return;
    }
    if (made) {
      this.add(o, kicker, "fgm");
      this.add(o, kicker, "fgLong", distance);
      if (distance >= 50) this.add(o, kicker, "fgm50");
      else if (distance >= 40) this.add(o, kicker, "fgm40");
      this.score(o, 3, `${this.name(kicker)} ${distance}-yard field goal`);
      this.rec.say(`${this.name(kicker)} ${distance}-yard field goal is GOOD.`, F.kick | F.score);
      this.rec.why = "Field goal";
      this.possessionEnded(o.side);
      if (this.over) return;
      this.kickoff(o.side);
      return;
    }
    this.rec.say(`${this.name(kicker)} ${distance}-yard field goal is ${this.rec.pick(["wide left", "wide right", "short", "wide right", "wide left"])}.`, F.kick);
    this.rec.why = "Missed field goal";
    this.possessionEnded(o.side);
    if (!this.over) this.newPossession(d.side, Math.max(20, 100 - (LEAGUE_RULES.missedFgAtLos ? this.ydl : this.ydl - 7)));
  }

  touchdown(team: Team, text: string, scorer?: string): void {
    void scorer;
    this.score(team, 6, text);
    if (this.rec.drive?.o === team.side) this.rec.why = "Touchdown";
    this.tdNote(" TOUCHDOWN.", F.score);
    if (this.ot.active && this.ot.suddenDeath) {
      this.over = true;
      return;
    }
    // Extra point or two-point try.
    const opp = this.t[this.other(team.side)];
    const diff = team.score - opp.score;
    const late = this.q >= 4 || (this.q === 3 && this.clock < 300);
    const chart = late && [-2, -5, -10, 1, 5, -13, -16].includes(diff);
    // A longer extra point or a shorter two-point try sends more coaches for two.
    const twoBias = (LEAGUE_RULES.twoPointLine === 1 ? 0.1 : 0) + (LEAGUE_RULES.xpLine - 15) * 0.006;
    const goForTwo = (!this.ot.active || !this.ot.suddenDeath) && (chart || this.rng() < 0.03 + twoBias + (team.fx.gameManagement - 70) * 0.001);
    const kicker = this.specialist(team, "K");
    this.snaps(team, [kicker, this.specialist(team, "LS"), ...this.coverage(team)], "stSnaps");
    const last = this.scoring[this.scoring.length - 1];
    if (goForTwo) {
      const lineup = this.offenseLineup(team, "11");
      const ok = this.rng() < (LEAGUE_RULES.twoPointLine === 1 ? 0.56 : 0.47) + (this.ab(lineup.qb) - 80) * 0.004;
      if (ok) {
        team.score += 2;
        team.quarters[Math.min(this.q, 5) - 1] = (team.quarters[Math.min(this.q, 5) - 1] ?? 0) + 2;
        const scorer2 = this.rng() < 0.6 ? lineup.wrs[0] ?? lineup.qb : lineup.rbs[0] ?? lineup.qb;
        this.add(team, scorer2, "twoPt");
        last.text += " (two-point conversion good)";
      } else last.text += " (two-point try failed)";
      this.tdNote(ok ? " Two-point try is good." : " Two-point try fails.");
    } else {
      this.add(team, kicker, "xpa");
      const acc = this.tr(kicker, "kickAccuracy");
      // Snapped from farther back, the extra point is just a longer field goal.
      const xpScale = LEAGUE_RULES.xpLine === 15 ? 1 : this.fgMakeChance(kicker, LEAGUE_RULES.xpLine + 18) / this.fgMakeChance(kicker, 33);
      const struck = this.rng();
      if (struck < (0.968 + (acc - 80) * 0.002) * xpScale) {
        this.add(team, kicker, "xpm");
        team.score += 1;
        team.quarters[Math.min(this.q, 5) - 1] = (team.quarters[Math.min(this.q, 5) - 1] ?? 0) + 1;
        last.text += ` (${this.name(kicker)} kick)`;
      } else if (struck > 0.992) {
        // The lowest of the missed kicks never clear the line. The ball is dead; nobody runs a blocked try back.
        last.text += " (kick blocked)";
        this.tdNote(` ${this.name(kicker)}'s extra point is BLOCKED.`);
      } else {
        last.text += " (kick failed)";
        this.tdNote(` ${this.name(kicker)} misses the extra point.`);
      }
    }
    last.away = this.t.away.score;
    last.home = this.t.home.score;
    this.tick(4);
    this.possessionEnded(team.side);
    if (this.over) return;
    this.kickoff(team.side);
  }

  /** Adds to the play that scored; a kick return's own line already says it. */
  tdNote(text: string, flags = 0): void {
    if (this.rec.inPlay && !this.quietTd) this.rec.more(text, flags);
  }

  safety(defense: Team): void {
    defense.score += 2;
    defense.quarters[Math.min(this.q, 5) - 1] = (defense.quarters[Math.min(this.q, 5) - 1] ?? 0) + 2;
    this.scoring.push({ q: this.q, clock: Math.max(0, Math.round(this.clock)), team: defense.id, text: "Safety", away: this.t.away.score, home: this.t.home.score });
    this.rec.more(" SAFETY.", F.score | F.big);
    this.rec.why = "Safety";
    if (this.ot.active) {
      this.over = true;
      return;
    }
    // Free kick from the 20.
    this.newPossession(defense.side, 40 + Math.round(gaussian(this.rng) * 6));
  }

  /** A touchdown on a drive that reached the red zone (or started the play inside it). */
  redZoneTouchdown(o: Team): void {
    if (this.driveReachedRz || this.ydl >= 80) {
      if (!this.driveReachedRz) o.box.redZoneAtt++;
      o.box.redZoneTd++;
    }
  }


  /** Credits the tackle and returns who made it. */
  tackle(d: Team, candidates: (string | undefined)[], yards: number, weights?: number[]): string | undefined {
    const list = candidates.filter(Boolean) as string[];
    if (!list.length) return undefined;
    const pickOne = () => {
      if (!weights) return list[Math.floor(this.rng() * list.length)];
      const total = weights.reduce((s, w) => s + w, 0);
      let r = this.rng() * total;
      for (let i = 0; i < list.length; i++) {
        r -= weights[i] ?? 0;
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    };
    const a = pickOne();
    // About two tackles in five are shared in the league's books (each man gets an assist).
    if (this.rng() < 0.28 && list.length > 1) {
      let b = pickOne();
      if (b === a) b = list[(list.indexOf(a) + 1) % list.length];
      this.add(d, a, "tklAst");
      this.add(d, b, "tklAst");
    } else this.add(d, a, "tklSolo");
    if (yards < 0) this.add(d, a, "tfl");
    return a;
  }

  // ---- A snap ----

  snap(): void {
    if (this.over) return;
    this.rec.begin(this);
    this.playSnap();
    this.rec.end(this);
  }

  playSnap(): void {
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    const lead = o.score - d.score;
    const late = this.q >= 4;

    // End-of-half and end-of-game decisions.
    if (this.shouldKneel(o, d)) {
      this.kneel(o, d);
      return;
    }
    const fgDist = 100 - this.ydl + 17;
    const kicker = this.specialist(o, "K");
    const fgChance = this.fgMakeChance(kicker, fgDist);
    const lastPlay = this.clock <= 8 && (this.q === 2 || (this.q === 4 && lead >= -3 && lead <= 0) || (this.ot.active && lead >= -3 && lead <= 0));
    if (lastPlay && fgChance > 0.3) {
      this.fieldGoal();
      this.afterPlay(0, false);
      return;
    }
    if (this.ot.active && this.ot.suddenDeath && ((fgChance > 0.65 && this.down >= 3) || (fgChance > 0.9 && this.down >= 2))) {
      this.fieldGoal();
      this.afterPlay(0, false);
      return;
    }
    if (this.down === 4) {
      let choice = this.fourthDown(o, fgChance, lead);
      // The owner's analysts weigh in on fourth downs outside the late-game scramble.
      if (o.id === this.state.userTeam && !this.pre && !this.ot.active && !(this.q === 4 && this.clock < 300) && o.plan) {
        const before = o.plan.fourth.length;
        choice = fourthDownAdvice(this.state, this.game.id, this.dist, this.ydl, fgChance, choice, this.advice());
        const call = o.plan.fourth[before];
        if (call) this.rec.tail = call[2] ? ` (The analysts said ${call[0]}; the coach agreed.)` : ` (The analysts said ${call[0]}; the coach chose to ${call[1]}.)`;
      }
      if (choice === "punt") {
        this.punt();
        this.afterPlay(0, false);
        return;
      }
      if (choice === "fg") {
        this.fieldGoal();
        this.afterPlay(0, false);
        return;
      }
    }

    const hurry = (late && lead < 0 && this.clock < 300) || (late && lead <= -9 && this.clock < 600) || (this.q === 2 && this.clock < 120)
      || (this.ot.active && this.game.type !== "POST" && lead <= 0 && this.clock < 360);
    const milk = late && lead > 0 && this.clock < 420;

    // Penalties before or instead of the play.
    if (this.penalty(o, d)) {
      this.afterPlay(hurry ? 12 : milk ? Math.min(38, LEAGUE_RULES.playClock - 2) : 30 * (1 - (1 - LEAGUE_RULES.playClock / 40) * 0.5), true);
      return;
    }
    if (this.down === 3) o.box.thirdAtt++;
    if (this.down === 4) o.box.fourthAtt++;

    // A good coordinator who has become predictable in a situation breaks his own tendency now and then.
    const dd = tendencyBucket(this.down, this.dist, "");
    const passProb = clamp(this.passProbability(o, lead, hurry, milk) + (hurry || milk ? 0 : selfScout(o.seen, dd, o.fx.offCalling)), 0.12, 0.95);
    const isPass = this.rng() < passProb;
    const personnel = this.choosePersonnel(o, isPass, hurry);
    // The defense charts what this offense calls by down, distance and personnel, and sometimes sits on it.
    const bucket = tendencyBucket(this.down, this.dist, personnel);
    this.read = hurry || this.pre ? 0 : defensiveRead(o.seen, bucket, d.fx.defCalling, isPass, this.rng(), this.rng());
    for (const b of [dd, bucket]) {
      const x = (o.seen[b] ??= [0, 0]);
      x[0] += isPass ? 1 : 0;
      x[1]++;
    }
    const lineup = this.offenseLineup(o, personnel);
    this.noteQb(o, lineup.qb);
    const pkg: Package = this.down >= 3 && this.dist >= 7 ? "dime" : personnel === "12" || personnel === "13" || personnel === "21" ? "base" : "nickel";
    const def = this.defenseLineup(d, pkg);
    const onField = [lineup.qb, ...lineup.rbs, ...lineup.wrs, ...lineup.tes, lineup.fb, ...lineup.ol];
    this.rec.stage(o.side, [[lineup.qb], lineup.rbs, [lineup.fb], lineup.wrs, lineup.tes, lineup.ol], [def.edge, def.idl, def.lb, def.cb, def.s]);
    this.snaps(o, onField, "offSnaps");
    this.snaps(d, [...def.edge, ...def.idl, ...def.lb, ...def.cb, ...def.s], "defSnaps");
    o.box.plays++;

    const startDown = this.down;
    const before = this.ydl;
    const outcome = isPass ? this.passPlay(o, d, lineup, def, hurry) : this.runPlay(o, d, lineup, def);
    this.maybeInjure(o, d, outcome.involved, [...onField, ...def.edge, ...def.idl, ...def.lb, ...def.cb, ...def.s]);
    if (outcome.ended) {
      this.afterPlay(0, false);
      return;
    }
    this.advance(o, d, outcome.yards, startDown, before);
    // The play clock sets how long an offense can take between snaps. Most snaps come with time to spare,
    // so a shorter clock trims only part of the time between plays.
    const clockScale = 1 - (1 - LEAGUE_RULES.playClock / 40) * 0.5;
    const runoff = outcome.clockStops ? 0 : hurry ? 12 : milk ? Math.min(38, LEAGUE_RULES.playClock - 2) : (29 + o.off.tempo) * clockScale;
    this.tick(outcome.playTime);
    this.afterPlay(runoff, outcome.clockStops);
  }

  /** Moves the ball and handles downs, first downs, touchdowns and safeties after a normal play. */
  advance(o: Team, d: Team, yards: number, startDown: number, before: number): void {
    if (this.over) return;
    this.ydl = before + yards;
    if (this.ydl >= 80 && !this.driveReachedRz) {
      this.driveReachedRz = true;
      o.box.redZoneAtt++;
    }
    if (this.ydl >= 100) return; // the play itself scored
    if (this.ydl <= 0) {
      this.possessionEnded(o.side);
      this.safety(d);
      return;
    }
    if (yards >= this.dist) {
      o.box.firstDowns++;
      if (startDown === 3) o.box.thirdConv++;
      if (startDown === 4) o.box.fourthConv++;
      this.down = 1;
      this.dist = Math.min(10, 100 - this.ydl);
      return;
    }
    this.dist -= yards;
    this.down++;
    if (this.down > 4) {
      // Turnover on downs.
      this.rec.more(" Turnover on downs.");
      this.rec.why = "Downs";
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - this.ydl);
    }
  }

  afterPlay(runoff: number, stopped: boolean): void {
    if (this.over) return;
    const o = this.t[this.pos];
    const d = this.t[this.other(this.pos)];
    // Timeouts: a trailing defense stops the clock late; a hurrying offense saves time.
    if (!stopped && runoff > 0) {
      const lead = o.score - d.score;
      const lateHalf = (this.q === 2 && this.clock < 120) || (this.q >= 4 && this.clock < 180);
      if (lateHalf && lead > 0 && d.timeouts > 0 && this.q >= 4 && d.fx.gameManagement > 45) {
        d.timeouts--;
        runoff = 0;
        this.rec.note(this, `Timeout, ${d.id}. It has ${d.timeouts} left.`);
      } else if (lateHalf && lead <= 0 && o.timeouts > 0 && this.clock < 60) {
        o.timeouts--;
        runoff = 0;
        this.rec.note(this, `Timeout, ${o.id}. It has ${o.timeouts} left.`);
      }
    }
    this.tick(Math.min(runoff, Math.max(0, this.clock)));
    this.endOfPeriodCheck();
  }

  shouldKneel(o: Team, d: Team): boolean {
    const lead = o.score - d.score;
    if (lead <= 0) return false;
    if (this.q === 4 || (this.ot.active && this.game.type === "POST")) {
      const downsLeft = 5 - this.down;
      return this.clock <= downsLeft * 40 - d.timeouts * 38 && this.clock > 0;
    }
    return this.q === 2 && this.clock <= 30 && this.ydl < 60;
  }

  kneel(o: Team, d: Team): void {
    const lineup = this.offenseLineup(o, "11");
    this.rec.say(`${this.name(lineup.qb)} kneels.`);
    this.rec.look = "Victory formation";
    this.snaps(o, [lineup.qb, ...lineup.rbs, ...lineup.wrs, ...lineup.tes, ...lineup.ol], "offSnaps");
    this.add(o, lineup.qb, "car");
    this.add(o, lineup.qb, "rushYds", -1);
    o.box.rushAtt++;
    o.box.rushYds -= 1;
    o.box.yards -= 1;
    o.box.plays++;
    this.ydl -= 1;
    this.down++;
    this.dist++;
    const timeoutStop = d.timeouts > 0 && this.q === 4 && (d.timeouts--, true);
    if (timeoutStop) this.rec.note(this, `Timeout, ${d.id}. It has ${d.timeouts} left.`);
    this.tick(timeoutStop ? 2 : 40);
    if (this.down > 4) {
      this.rec.why = "Downs";
      this.possessionEnded(o.side);
      if (!this.over) this.newPossession(d.side, 100 - this.ydl);
    }
    this.endOfPeriodCheck();
  }

  fourthDown(o: Team, fgChance: number, lead: number): "go" | "punt" | "fg" {
    const late = this.q === 4;
    const gm = (o.fx.gameManagement - 70) / 30; // -1 conservative .. +1 aggressive and sharp
    const r = this.rng();
    if (late && lead < 0) {
      if (this.clock < 120 || (lead < -8 && this.clock < 360) || (lead < -3 && this.clock < 240)) {
        return lead >= -3 && fgChance > 0.5 && this.clock < 30 ? "fg" : "go";
      }
    }
    if (late && lead > 0 && this.clock < 120 && this.ydl > 50 && fgChance < 0.8 && this.dist > 2) return "punt";
    if (this.ot.active) {
      // Overtime: a field goal wins sudden death; otherwise nobody wants to settle for a tie.
      if (lead === 0 && this.ot.suddenDeath && fgChance > 0.45) return "fg";
      if (lead < 0 && lead >= -3 && fgChance > 0.45 && this.clock < 90) return "fg";
      if (lead <= 0 && this.ydl >= 40 && this.dist <= 4) return "go";
      if (lead <= 0 && this.clock < 240 && this.ydl >= 30) return "go";
    }
    const opp = this.ydl >= 60;
    if (this.dist <= 1) {
      // Today's coaches go for it far more than they used to, above all on fourth and short past midfield.
      const go = opp ? 0.86 + 0.1 * gm : this.ydl >= 45 ? 0.7 + 0.2 * gm : this.ydl >= 30 ? 0.3 + 0.15 * gm : 0.05;
      if (r < go) return "go";
    } else if (this.dist <= 2) {
      const go = opp ? 0.6 + 0.15 * gm : this.ydl >= 45 ? 0.42 + 0.15 * gm : 0.04;
      if (r < go) return "go";
    } else if (this.dist <= 4 && opp) {
      if (r < (fgChance < 0.75 ? 0.36 : 0.12) + 0.12 * gm) return "go";
    }
    // Long tries from past 60 yards are rare: most coaches punt there.
    if (fgChance >= 0.5 && this.ydl >= 57) return "fg";
    if (this.ydl >= 62 && this.dist <= 5 && r < 0.4) return "go";
    if (this.ydl >= 65) return fgChance >= 0.3 ? "fg" : "go";
    return "punt";
  }

  passProbability(o: Team, lead: number, hurry: boolean, milk: boolean): number {
    let p = o.off.passRate + o.passLean + this.trend.pass;
    if (this.down === 1) p -= 0.06;
    if (this.down === 2 && this.dist >= 8) p += 0.08;
    if (this.down === 2 && this.dist <= 3) p -= 0.12;
    if (this.down >= 3) p = this.dist >= 5 ? 0.9 : this.dist >= 3 ? 0.68 : 0.42;
    if (this.ydl >= 98) p -= 0.15;
    // Inside the twenty a coach leans on his quarterback as far as he trusts him: the best passers
    // finish drives through the air, which is how their touchdown totals pull away from the pack.
    if (this.ydl >= 80 && o.qbNow) p += clamp((this.ab(o.qbNow) - 86) * 0.045, 0, 0.32);
    if (hurry) p = Math.max(p, 0.8);
    if (milk) p -= 0.25;
    if (this.q >= 3 && lead >= 14) p -= 0.12;
    if (this.q >= 3 && lead <= -14) p += 0.12;
    return clamp(p, 0.12, 0.95);
  }

  choosePersonnel(o: Team, isPass: boolean, hurry: boolean): Personnel {
    if (hurry || (this.down >= 3 && this.dist >= 7)) return o.off.personnel["10"] && this.rng() < 0.3 ? "10" : "11";
    if (this.dist <= 1 && (this.down >= 3 || this.ydl >= 97)) return this.rng() < 0.6 ? "13" : "12";
    const mix = o.off.personnel;
    const entries = Object.entries(mix) as [Personnel, number][];
    let total = 0;
    for (const [k, w] of entries) total += w * (isPass ? (k === "11" || k === "10" ? 1.3 : 0.8) : k === "11" || k === "10" ? 0.75 : 1.3);
    let r = this.rng() * total;
    for (const [k, w] of entries) {
      r -= w * (isPass ? (k === "11" || k === "10" ? 1.3 : 0.8) : k === "11" || k === "10" ? 0.75 : 1.3);
      if (r <= 0) {
        if (k === "21" && !this.pool(o, "FB").length) return "12";
        return k;
      }
    }
    return "11";
  }

  // ---- Penalties ----

  penalty(o: Team, d: Team): boolean {
    const discipline = (t: Team) => 1.15 - (t.fx.leadership - 70) * 0.008;
    const r = this.rng();
    const offRate = 0.047 * discipline(o);
    const defRate = 0.04 * discipline(d);
    if (r >= offRate + defRate) return false;
    const offense = r < offRate;
    const kind = this.rng();
    const team = offense ? o : d;
    // Fouls before the snap stop the play; the rest happen during one that then doesn't count.
    const live = kind >= (offense ? 0.33 : 0.35);
    let yards: number;
    let autoFirst = false;
    let replay = true;
    let what: string;
    if (offense) {
      if (kind < 0.33) {
        yards = 5; // false start, delay, illegal formation
        what = this.rec.pick(["False start", "False start", "False start", "Delay of game", "Illegal formation", "Illegal shift"]);
      } else if (kind < 0.85) {
        yards = 10; // holding
        what = "Offensive holding";
      } else {
        yards = 15; // personal foul, offensive pass interference, illegal block
        what = this.rec.pick(["Offensive pass interference", "Unnecessary roughness", "Illegal block in the back", "Chop block"]);
      }
      // Half the distance to the goal when inside it.
      yards = Math.min(yards, Math.floor(this.ydl / 2));
      this.ydl -= yards;
      this.dist += yards;
      if (kind >= 0.33) this.tick(6);
    } else {
      if (kind < 0.35) {
        yards = 5; // offside, neutral zone, encroachment
        what = this.rec.pick(["Defensive offside", "Neutral zone infraction", "Encroachment", "Defensive offside"]);
      } else if (kind < 0.55) {
        yards = 5; // defensive holding, illegal contact
        autoFirst = true;
        what = this.rec.pick(["Defensive holding", "Defensive holding", "Illegal contact"]);
      } else if (kind < 0.8) {
        yards = Math.min(LEAGUE_RULES.dpiCap, Math.round(8 + this.rng() * 28)); // defensive pass interference: a spot foul
        autoFirst = true;
        what = "Defensive pass interference";
      } else {
        // Roughing, unnecessary roughness, face mask; replay takes back some of the roughing calls.
        if (LEAGUE_RULES.roughingReview && this.rng() < 0.2) return false;
        yards = 15;
        autoFirst = true;
        what = this.rec.pick(["Roughing the passer", "Unnecessary roughness", "Face mask", "Roughing the passer"]);
      }
      yards = Math.min(yards, Math.max(1, Math.floor((100 - this.ydl) / 2)));
      if (kind >= 0.55 && kind < 0.8) yards = Math.min(yards, 99 - this.ydl);
      this.ydl += yards;
      if (autoFirst || yards >= this.dist) {
        this.down = 1;
        this.dist = Math.min(10, 100 - this.ydl);
        o.box.firstDowns++;
        replay = false;
      } else this.dist -= yards;
      if (kind >= 0.35) this.tick(6);
    }
    void replay;
    team.box.penalties++;
    team.box.penYds += yards;
    const ruling = `Penalty on ${team.id}: ${what}, ${yards} yards${!offense && autoFirst ? ", automatic first down" : ""}.`;
    this.rec.say(live ? `${this.calledBack(o, offense, what)} ${ruling} The play doesn't count.` : ruling, F.penalty);
    this.rec.look = live ? "Play called back" : "No play";
    this.refs.flag(this.callContext(o, d, yards), team.id, what, yards);
    return true;
  }

  // ---- Runs ----

  runPlay(o: Team, d: Team, lu: Lineup, def: DefLineup): PlayOutcome {
    let type = this.pickRun(o, lu);
    const carrier = type === "qbRun" ? lu.qb : lu.rbs[0] ?? lu.qb;
    if (carrier === lu.qb && type !== "qbRun") type = "qbRun";
    const tr = (id: string | undefined, t: string) => this.tr(id, t);
    // Blocking: each run concept asks something different of the line.
    const blockTrait = (id: string | undefined) =>
      type === "outsideZone" ? 0.5 * tr(id, "runBlock") + 0.3 * tr(id, "agility") + 0.2 * tr(id, "speed")
        : type === "gap" ? 0.5 * tr(id, "runBlock") + 0.5 * tr(id, "strength")
          : 0.7 * tr(id, "runBlock") + 0.3 * tr(id, "strength");
    let block = this.avg(lu.ol, blockTrait);
    const helpers = [...lu.tes.map((id) => tr(id, "blocking")), ...(lu.fb ? [tr(lu.fb, "blocking")] : [])];
    if (helpers.length) block = (block * 5 + helpers.reduce((a, b) => a + b, 0) * 0.6) / (5 + helpers.length * 0.6);
    const front = [...def.idl, ...def.edge, ...def.lb];
    const frontTrait = (id: string | undefined) =>
      type === "outsideZone" ? 0.6 * tr(id, "runStop") + 0.4 * tr(id, "speed") : 0.7 * tr(id, "runStop") + 0.3 * tr(id, "strength");
    let stop = this.avg(front, frontTrait);
    // Box count: light boxes against two-back and heavy sets give up yards.
    const boxSafety = this.rng() > d.def.twoHigh ? def.s[0] : undefined;
    if (boxSafety) stop = (stop * front.length + tr(boxSafety, "box")) / (front.length + 1) + 1.2;
    if (def.pkg === "nickel") stop -= 1.2 * (0.5 + d.def.lightBox);
    if (def.pkg === "dime") stop -= 3;
    stop += d.adjRun;
    const runner = type === "outsideZone" ? 0.5 * tr(carrier, "vision") + 0.3 * tr(carrier, "burst") + 0.2 * tr(carrier, "agility")
      : type === "gap" ? 0.5 * tr(carrier, "power") + 0.3 * tr(carrier, "vision") + 0.2 * tr(carrier, "strength")
        : type === "qbRun" ? 0.6 * tr(carrier, "mobility") + 0.4 * tr(carrier, "speed")
          : 0.5 * tr(carrier, "vision") + 0.3 * tr(carrier, "power") + 0.2 * tr(carrier, "burst");
    const motion = o.off.motion * 1.5 - (d.def.disguise * 0.5);
    const e = 0.55 * block + 0.45 * runner - stop + this.baseEdge(o, d) + motion + o.innov.run - this.read * 1.6;

    const shortYardage = this.dist <= 2 && this.down >= 3;
    const goalLine = this.ydl >= 97;
    const redZone = this.ydl >= 80 ? 0.07 : 0;
    let pStuff = clamp(0.155 - 0.006 * e + (shortYardage || goalLine ? 0.06 : 0) + redZone, 0.06, 0.4);
    if (type === "qbRun" && this.dist <= 1) pStuff *= LEAGUE_RULES.tushPush ? 0.6 : 0.8; // the sneak, with or without the push
    const burst = type === "qbRun" ? tr(carrier, "speed") : tr(carrier, "burst");
    // Explosive runs come from the blocking and the back's burst; even the best backs break a big one
    // on only about one carry in seven.
    const pBig = clamp(0.108 + 0.004 * e + (burst - 82) * 0.0017, 0.03, 0.2);
    const r = this.rng();
    let yards: number;
    if (r < pStuff) {
      const k = this.rng();
      yards = k < 0.45 ? 0 : k < 0.7 ? -1 : k < 0.85 ? -2 : -3 - Math.floor(this.rng() * 3);
    } else if (r < pStuff + pBig) {
      yards = 10 + Math.round(-Math.log(Math.max(1e-6, this.rng())) * (7.5 + (tr(carrier, "speed") - 82) * 0.1));
    } else {
      const mode = 3.55 + e * 0.045;
      yards = Math.max(1, Math.min(9, Math.round(mode + (this.rng() + this.rng() + this.rng() - 1.5) * 3.2)));
      // Contact: a runner with power and balance breaks the first tackle and keeps going.
      const tackler = front[Math.floor(this.rng() * front.length)];
      const pBreak = clamp(0.075 + ((tr(carrier, "power") + tr(carrier, "agility")) / 2 - 80) * 0.004 - (tr(tackler, "runStop") - 80) * 0.003, 0.02, 0.2);
      if (type !== "qbRun" && this.rng() < pBreak) {
        yards += 3 + Math.floor(this.rng() * 6);
        this.add(o, carrier, "brkTkl");
      }
    }
    const room = 100 - this.ydl;
    yards = Math.min(yards, room);
    const td = yards >= room;
    const where = type === "qbRun" ? (this.dist <= 1 && this.down >= 3 ? "QB sneak" : this.rec.pick(["keeps it", "keeps it on the read option", "runs the QB draw"]))
      : type === "outsideZone" ? this.rec.pick(["runs around left end", "runs around right end", "runs wide left", "runs wide right"])
        : type === "gap" ? this.rec.pick(["runs off left tackle", "runs off right tackle", "runs behind the pulling guard", "runs up the middle"])
          : this.rec.pick(["runs up the middle", "runs left guard", "runs right guard", "runs up the middle"]);
    this.rec.look = `${formation(this.rec, { pass: false, playAction: false, hurry: false, short: this.dist <= 2 && this.down >= 3, personnel: lu.personnel, passRate: o.off.passRate, longYardage: false })}, ${lu.personnel} personnel vs ${def.pkg}`;
    const runText = `${this.name(carrier)} ${where} for ${yardsText(yards)}`;
    this.rec.kind = "rush";
    // For the animation: a quarterback run, an outside run, a gap run with a puller, or an inside zone run.
    this.rec.call = type === "qbRun" ? "q" : type === "outsideZone" ? "o" : type === "gap" ? "g" : "z";
    this.rec.actors = { r: carrier };
    this.add(o, carrier, "car");
    this.add(o, carrier, "rushYds", yards);
    this.add(o, carrier, "rushLong", yards);
    o.box.rushAtt++;
    o.box.rushYds += yards;
    o.box.yards += yards;
    const outOfBounds = type === "outsideZone" || type === "qbRun" ? this.rng() < 0.14 : this.rng() < 0.05;
    const stops = this.clockStopsOnOutOfBounds(outOfBounds);
    if (td) {
      this.add(o, carrier, "rushTd");
      this.rec.say(runText + ".", F.big);
      this.tick(6);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(carrier)} ${yards}-yard run`, carrier);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [carrier, ...front.slice(0, 2)] };
    }
    // Fumbles.
    const fumbleP = (0.011 - (tr(carrier, "power") - 80) * 0.0001) * this.cond.fumbleMult;
    let fumbleNote = "";
    if (this.rng() < fumbleP) {
      const forcer = front[Math.floor(this.rng() * front.length)];
      const lost = this.rng() < 0.55;
      // A fumble the defense recovered can be ruled down by contact; replay can fix that.
      const ruling = lost ? this.refs.rule("fumble", this.callContext(o, d, 30)) : { stands: true, note: "" };
      if (ruling.stands) {
        this.add(o, carrier, "fum");
        this.add(d, forcer, "ff");
      }
      if (lost && ruling.stands) {
        this.add(o, carrier, "fumLost");
        const recoverer = front[Math.floor(this.rng() * front.length)];
        this.add(d, recoverer, "fr");
        this.tackle(d, front, yards);
        this.rec.say(`${runText}. ${this.name(carrier)} FUMBLES, forced by ${this.name(forcer)}; recovered by ${this.name(recoverer)} at the ${this.spot(this.ydl + yards, o, d)}.${ruling.note}`, F.turnover | (ruling.note ? F.review : 0));
        this.rec.why = "Fumble";
        this.tick(6);
        this.turnover(100 - (this.ydl + yards));
        return { yards, ended: true, playTime: 0, clockStops: true, involved: [carrier, forcer] };
      }
      if (!ruling.stands && ruling.note) this.rec.flags |= F.review;
      fumbleNote = !ruling.stands ? ` The ball came loose and ${d.id} recovered, but ${this.name(carrier)} was ruled down by contact.${ruling.note}`
        : ` ${this.name(carrier)} fumbles, forced by ${this.name(forcer)}, but ${o.id} recovers.`;
    }
    const tacklers = [...def.lb, ...def.idl, ...def.edge, ...def.s, ...def.cb];
    const long = yards >= 10;
    const weights = tacklers.map((id) => {
      const pos = PLAYER_BY_ID[id].position;
      if (long) return pos === "S" ? 1.5 : pos === "CB" ? 1.2 : pos === "LB" ? 1.3 : 0.3;
      // The middle linebacker, first in the list, is the one who fills the hole most, and a linebacker
      // who reads the run well gets there first: the league's tackle leaders are its best run-stoppers.
      if (pos === "LB") return (id === def.lb[0] ? 2.1 : 1.4) * clamp(1 + (tr(id, "runStop") - 80) * 0.025, 0.7, 1.5);
      return pos === "IDL" ? 1.3 : pos === "EDGE" ? 1.45 : pos === "S" ? 0.95 : 0.75;
    });
    const tk = this.tackle(d, tacklers, yards, weights);
    this.rec.say(`${runText}${tk ? ` (${this.name(tk)})` : ""}.${fumbleNote}`, yards >= 20 ? F.big : 0);
    return { yards, ended: false, playTime: 5, clockStops: stops, involved: [carrier, tacklers[0]] };
  }

  pickRun(o: Team, lu: Lineup): RunType {
    const mob = this.tr(lu.qb, "mobility");
    const mix = { ...o.off.runMix };
    mix.qbRun *= clamp(1 + (mob - 80) * 0.08, 0.2, 3);
    if (this.dist <= 1 && this.down >= 3) mix.qbRun += LEAGUE_RULES.tushPush ? 0.15 : 0.08; // sneaks
    const total = mix.outsideZone + mix.insideZone + mix.gap + mix.qbRun;
    let r = this.rng() * total;
    for (const k of ["outsideZone", "insideZone", "gap", "qbRun"] as RunType[]) {
      r -= mix[k];
      if (r <= 0) return k;
    }
    return "insideZone";
  }

  clockStopsOnOutOfBounds(oob: boolean): boolean {
    if (!oob) return false;
    return (this.q === 2 && this.clock < 120) || (this.q >= 4 && this.clock < 300);
  }
}

/** For tests and tuning: adds up box score lines. */
export function sumLines(lines: number[][]): StatLine {
  const t: StatLine = {};
  for (const l of lines) addLine(t, l);
  return t;
}
