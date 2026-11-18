// The passing game: the call, the read, protection, the throw and the catch.
// Part of the game sim (sim.ts); the teams and lineups are in simteam.ts.
import { PLAYER_BY_ID } from "./league";
import { gaussian } from "./rng";
import { type CallContext } from "./officials";
import { coverage as coverShell, formation, PLAY_FLAGS as F, spotText } from "./playlog";
import { OFFENSE } from "./schemes";
import { bigMoment, blitzPressure, pickupChance, poise, slideChance } from "./simtactics";
import { MISMATCH_TYPICAL, SimTeams, clamp, yardsText, type DefLineup, type Depth, type Lineup, type PlayOutcome, type Side, type Team } from "./simteam";

export abstract class SimPass extends SimTeams {
  abstract callContext(o: Team, d: Team, stake: number): CallContext;
  abstract clockStopsOnOutOfBounds(oob: boolean): boolean;
  abstract newPossession(side: Side, ydl: number): void;
  abstract possessionEnded(by: Side): void;
  abstract redZoneTouchdown(o: Team): void;
  abstract tackle(d: Team, candidates: (string | undefined)[], yards: number, weights?: number[]): string | undefined;
  abstract tick(seconds: number): void;
  abstract touchdown(team: Team, text: string, scorer?: string): void;
  abstract turnover(newYdl: number): void;


  // ---- Passes ----

  passPlay(o: Team, d: Team, lu: Lineup, def: DefLineup, hurry: boolean): PlayOutcome {
    const tr = (id: string | undefined, t: string) => this.tr(id, t);
    const qb = lu.qb;
    // The first read and how deep the throw goes are chosen together: the deep threat runs the go
    // routes and the slot the quick game, so each receiver's catches come at his own depth.
    const { target: first, depth } = this.pickPass(o, d, lu);
    const playAction = depth !== "screen" && this.down <= 2 && !hurry && this.rng() < o.off.playAction * 1.6;
    const blitz = this.rng() < d.def.blitz * (this.down === 3 ? 1.35 : 1);
    const man = this.rng() < d.def.man * (blitz ? 1.3 : 1);
    const twoHigh = !blitz && this.rng() < d.def.twoHigh + this.trend.twoHigh;
    const base = this.baseEdge(o, d);
    this.rec.look = `${formation(this.rec, { pass: true, playAction, hurry, short: false, personnel: lu.personnel, passRate: o.off.passRate, longYardage: this.down >= 3 && this.dist >= 7 })}, ${lu.personnel} personnel vs ${def.pkg}, ${coverShell(this.rec, blitz, man, twoHigh)}`;
    this.rec.kind = "pass";
    // For the animation: how deep the throw was meant to go (screen, short, intermediate, deep), then play action, a blitz, man coverage and two deep safeties.
    this.rec.call = `${depth === "screen" ? "c" : depth[0]}${playAction ? "a" : ""}${blitz ? "b" : ""}${man ? "m" : ""}${twoHigh ? "2" : ""}`;
    this.rec.actors = { q: qb };
    const dir = depth === "screen" ? "screen pass" : `pass ${depth === "deep" ? "deep" : "short"} ${this.rec.pick(["left", "middle", "right", "left", "right"])}`;

    // Protection against the rush.
    const protect = this.avg(lu.ol, (id) => 0.75 * tr(id, "passBlock") + 0.25 * tr(id, "agility"));
    const rushers = [...def.edge, ...def.idl];
    // A linebacker comes on every blitz; now and then a safety or the slot corner comes with him.
    const extra = blitz && this.rng() < 0.3 ? (this.rng() < 0.6 || def.cb.length < 3 ? def.s.slice(1, 2) : def.cb.slice(2, 3)) : [];
    const blitzers = blitz ? [...def.lb.slice(0, 1), ...extra] : [];
    const rushValue = this.avg(rushers, (id) => tr(id, "passRush")) + blitzers.length * 1.5 + (blitzers.length ? this.avg(blitzers, (id) => tr(id, "blitz") - 80) * 0.1 : 0);
    const holdTime = depth === "deep" ? 0.07 : depth === "inter" ? 0.02 : depth === "short" ? -0.07 : -0.25;
    const pocket = (tr(qb, "decisions") - 80) * 0.003 + (tr(qb, "mobility") - 80) * 0.001;
    // One-on-ones up front: each edge rusher against a tackle, each interior rusher against a guard or
    // the center. A line is only as good as its weakest pairing, so one bad mismatch adds pressure.
    const pairs = this.rushPairs(lu, rushers);
    // The protection call: who blocks the blitzer, and whether the line slides to its weakest matchup.
    const back = lu.rbs[0] ?? lu.tes[0];
    const pickedUp = blitz && this.rng() < pickupChance(tr(qb, "decisions"), tr(lu.ol[2] ?? lu.ol[0], "passBlock"), 0.5 * tr(back, "passBlock") + 0.5 * tr(back, "blocking"), o.fx.offCalling);
    const slide = this.rng() < slideChance(o.fx.offCalling);
    const mismatch = (pairs.worst - MISMATCH_TYPICAL) * 0.004 * (slide && pairs.worst > MISMATCH_TYPICAL ? 0.55 : slide ? 1.45 : 1);
    const pPressure = clamp(0.29 + (rushValue - protect) * 0.011 + (blitz ? blitzPressure(pickedUp) : 0) + holdTime - pocket - (playAction ? 0.0 : 0) - base * 0.004
      + mismatch + (this.read === -1 ? 0.025 : this.read === 1 ? -0.025 : 0), 0.04, 0.65);
    const pressured = this.rng() < pPressure;
    if (pressured) {
      this.add(o, qb, "pressured");
      const all = [...rushers, ...blitzers];
      const by = this.byRush(all, blitzers);
      if (by) this.add(d, by, "pressures");
      const beaten = by && pairs.blocker[by];
      if (beaten) this.add(o, beaten, "pressAllowed");
      if (blitz && !pickedUp) this.rec.why = "Blitz not picked up";
      else if (this.read === -1) this.rec.why = "Defense sat on the call";
    }

    if (pressured && depth !== "screen") {
      const pSack = clamp(0.23 - (tr(qb, "mobility") - 80) * 0.004 - (tr(qb, "decisions") - 80) * 0.002 + (depth === "deep" ? 0.06 : 0), 0.07, 0.42);
      const r = this.rng();
      if (r < pSack) return this.sack(o, d, qb, [...rushers, ...blitzers], pairs.blocker, { blitzers, free: blitz && !pickedUp, chasers: [...def.lb, ...def.s].filter((id) => !blitzers.includes(id)) });
      const pScramble = clamp(0.1 + (tr(qb, "mobility") - 80) * 0.007, 0.02, 0.32);
      if (r < pSack + pScramble) return this.scramble(o, d, qb, def);
      const hitter = this.byRush([...rushers, ...blitzers], blitzers);
      if (this.rng() < 0.4) this.add(d, hitter, "qbHits");
      if (this.rng() < 0.14) {
        // Throwaway.
        this.add(o, qb, "att");
        o.box.passAtt++;
        this.rec.say(`${this.name(qb)} throws it away under pressure from ${this.name(hitter)}.`);
        return { yards: 0, ended: false, playTime: 6, clockStops: true, involved: [qb] };
      }
    }

    // Who gets the ball.
    // Separation a target gets on his man or in his zone, for the first read and the second.
    const sepOf = (id: string) => {
      const pos = PLAYER_BY_ID[id].position;
      // A defense whose plan is to take away the pass can shadow the top receiver with its best man corner.
      const cover = this.coverFor(def, lu, id, man, man && d.plan?.stop === "pass" && (d.plan?.quality ?? 0) > 0.2);
      const recv = depth === "deep" ? 0.45 * tr(id, "deep") + 0.35 * tr(id, "speed") + 0.2 * tr(id, "routes")
        : depth === "screen" ? 0.5 * tr(id, "yac") + 0.5 * tr(id, "agility")
          : depth === "inter" ? 0.6 * tr(id, pos === "WR" ? "routes" : "receiving") + 0.2 * tr(id, "hands") + 0.2 * tr(id, "agility")
            : 0.6 * tr(id, pos === "WR" ? "routes" : "receiving") + 0.4 * tr(id, "agility");
      const cpos = cover ? PLAYER_BY_ID[cover].position : "LB";
      const coverSkill = !cover ? 40
        : cpos === "CB" ? (man ? 0.6 * tr(cover, "man") + 0.25 * tr(cover, "press") + 0.15 * tr(cover, "speed") : 0.7 * tr(cover, "zone") + 0.3 * tr(cover, "speed"))
          : cpos === "S" ? 0.6 * tr(cover, "coverage") + 0.4 * tr(cover, "range")
            : 0.7 * tr(cover, "coverage") + 0.3 * tr(cover, "speed");
      return { id, cover, cpos, sep: recv - coverSkill };
    };
    let read = sepOf(first);
    // Reading the coverage: with a clean pocket, a quarterback who processes well comes off a covered first read.
    if (!pressured && depth !== "screen" && read.sep < -3 && this.rng() < clamp(0.18 + (tr(qb, "decisions") - 80) * 0.02, 0.05, 0.5)) {
      const next = sepOf(this.pickTarget(o, d, lu, depth));
      if (next.id !== read.id && next.sep - 1.5 > read.sep) read = { ...next, sep: next.sep - 1.5 };
    }
    const target = read.id;
    const cover = read.cover;
    const cpos = read.cpos;
    this.rec.actors.t = target;
    let sep = read.sep;
    if (man) sep += o.off.motion * 2.2;
    if (playAction) sep += 2.5 + (o.passLean < 0 ? 1.5 : 0);
    if (depth === "deep") sep += twoHigh ? -4 : 2;
    if (depth === "short" && twoHigh) sep += 1.5;
    sep += base - d.adjPass + o.innov.pass - this.read * 1.4 + (pickedUp ? 1.5 : 0);
    // Poise when the game is on the line: the quarterback's temperament, experience and the week's preparation.
    const moment = bigMoment(this.q, this.clock, o.score - d.score, this.ot.active, this.game.type === "POST");
    const calm = moment ? poise(this.state, qb, o.plan?.quality ?? 0) : 0;
    const accuracy = (depth === "deep" ? 0.5 * tr(qb, "accuracy") + 0.5 * tr(qb, "arm") : tr(qb, "accuracy")) + calm * 4;
    const baseComp = { screen: 0.9, short: 0.81, inter: 0.63, deep: 0.405 }[depth];
    // The field shrinks inside the twenty; the most accurate passers still find the small windows.
    const compressed = this.ydl >= 80 ? 0.11 - clamp((accuracy - 88) * 0.006, 0, 0.04) : 0;
    let pComp = baseComp - compressed - this.cond.comp[depth] + sep * 0.008 + (accuracy - 80) * 0.0045 + (tr(target, "hands") - 80) * 0.0025 - (pressured ? 0.19 : 0);
    pComp = clamp(pComp, 0.1, 0.93);
    const decisions = tr(qb, "decisions") - d.def.disguise * 5;
    const baseInt = { screen: 0.004, short: 0.012, inter: 0.024, deep: 0.039 }[depth];
    const ballSkill = cover ? (cpos === "CB" ? tr(cover, "zone") : cpos === "S" ? tr(cover, "range") : tr(cover, "coverage")) : 60;
    const pInt = clamp(baseInt * clamp(1 - (decisions - 80) * 0.028, 0.5, 1.9) * (pressured ? 1.6 : 1) * (1 + (ballSkill - 80) * 0.02) * (1 - sep * 0.015), 0.002, 0.12);

    this.add(o, qb, "att");
    this.add(o, target, "tgt");
    o.box.passAtt++;
    const r = this.rng();
    if (r < pInt) {
      const backs = [...def.cb, ...def.s, ...def.lb];
      const picker = this.rng() < 0.68 && cover ? cover : backs[Math.floor(this.rng() * backs.length)] ?? cover;
      this.add(o, qb, "int");
      this.add(d, picker, "defInt");
      this.add(d, picker, "pd");
      const spot = this.ydl + ({ screen: 0, short: 6, inter: 14, deep: 28 }[depth]);
      let ret = Math.round(-Math.log(Math.max(1e-6, this.rng())) * 11);
      const theirYdl = 100 - Math.min(99, spot);
      if (theirYdl + ret >= 100 || this.rng() < 0.03) {
        ret = 100 - theirYdl;
        this.add(d, picker, "intYds", ret);
        this.add(d, picker, "defTd");
        this.tick(8);
        o.box.turnovers++;
        this.possessionEnded(o.side);
        this.rec.say(`${this.name(qb)} ${dir} intended for ${this.name(target)} is INTERCEPTED by ${this.name(picker)}, returned ${ret} yards for a`, F.turnover | F.big);
        this.rec.why = "Interception";
        if (!this.over) {
          this.newPossession(d.side, 99);
          this.touchdown(d, `${this.name(picker)} ${ret}-yard interception return`, picker);
        }
        return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [picker, target] };
      }
      this.add(d, picker, "intYds", ret);
      this.rec.say(`${this.name(qb)} ${dir} intended for ${this.name(target)} is INTERCEPTED by ${this.name(picker)} at the ${spotText(theirYdl, d.id, o.id)}, returned ${yardsText(ret)}.`, F.turnover);
      this.rec.why = "Interception";
      this.tick(8);
      this.turnover(Math.min(99, theirYdl + ret));
      return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [picker, target] };
    }
    if (r < pInt + (1 - pComp)) {
      const broken = cover && this.rng() < 0.22 - read.sep * 0.01;
      if (broken) this.add(d, cover, "pd");
      // An incompletion can be ruled a catch; the booth or a challenge can take it back.
      const ruling = this.refs.rule("drop", this.callContext(o, d, 8));
      if (!ruling.stands) {
        const caught = Math.min(100 - this.ydl - 1, { screen: 2, short: 5, inter: 11, deep: 22 }[depth]);
        this.completionStats(o, qb, target, caught);
        this.rec.say(`${this.name(qb)} ${dir} to ${this.name(target)} for ${yardsText(caught)}, ruled a catch.${ruling.note}`, ruling.note ? F.review : 0);
        return { yards: caught, ended: false, playTime: 6, clockStops: false, involved: [target, cover] };
      }
      const missed = this.down >= 3 && cover && this.refs.noFlag(this.callContext(o, d, 15));
      this.rec.say(`${this.name(qb)} ${dir} incomplete, intended for ${this.name(target)}${broken ? ` (broken up by ${this.name(cover)})` : ""}.${missed ? ` ${o.id} wanted a flag for interference; none was thrown.` : ""}${ruling.note}`, ruling.note ? F.review : 0);
      return { yards: 0, ended: false, playTime: 6, clockStops: true, involved: [target, cover] };
    }

    // Completion.
    // A vertical receiver's routes run longer at every depth than a possession receiver's.
    const stretch = PLAYER_BY_ID[target].position === "WR" ? clamp(0.5 * (tr(target, "deep") + tr(target, "speed")) - 0.5 * (tr(target, "routes") + tr(target, "hands")), -15, 15) : -4;
    const air = depth === "screen" ? -3 + Math.floor(this.rng() * 5)
      : depth === "short" ? 1 + Math.floor(this.rng() * 7)
        : depth === "inter" ? 9 + Math.floor(this.rng() * 8) + Math.round(stretch * 0.15)
          : 20 + Math.round(stretch * 0.4 + -Math.log(Math.max(1e-6, this.rng())) * 7);
    const yacSkill = 0.6 * tr(target, "yac") + 0.4 * tr(target, "speed");
    const tackleSpeed = cover ? tr(cover, "speed") : 70;
    const yacMean = { screen: 5.0, short: 3.0, inter: 2.3, deep: 3.0 }[depth] + (yacSkill - 80) * 0.07 + (o.off === OFFENSE.wideZone ? 0.5 : 0);
    let yac = Math.max(0, Math.round(-Math.log(Math.max(1e-6, this.rng())) * Math.max(1.5, yacMean)));
    if (this.rng() < 0.02 + (yacSkill - tackleSpeed) * 0.0015) yac += 10 + Math.round(this.rng() * 35);
    const room = 100 - this.ydl;
    const yards = Math.min(room, air + yac);
    // A catch can be ruled incomplete on the field; the booth or a challenge can fix it.
    const ruling = this.refs.rule("catch", this.callContext(o, d, Math.max(5, yards)));
    if (!ruling.stands) {
      this.rec.say(`${this.name(qb)} ${dir} to ${this.name(target)}, ruled incomplete.${ruling.note}`, ruling.note ? F.review : 0);
      return { yards: 0, ended: false, playTime: 6, clockStops: true, involved: [target, cover] };
    }
    if (ruling.note) this.rec.flags |= F.review;
    this.completionStats(o, qb, target, yards);
    const catchText = `${this.name(qb)} ${dir} to ${this.name(target)} for ${yardsText(yards)}`;
    if (yards >= room) {
      this.rec.say(`${catchText}.${ruling.note}`, F.big);
      this.add(o, qb, "passTd");
      this.add(o, target, "recTd");
      this.tick(7);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(qb)} ${yards}-yard pass to ${this.name(target)}`, target);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [target, cover] };
    }
    if (this.rng() < 0.006) {
      this.add(o, target, "fum");
      if (cover) this.add(d, cover, "ff");
      if (this.rng() < 0.6) {
        this.add(o, target, "fumLost");
        if (cover) this.add(d, cover, "fr");
        this.tackle(d, [cover], 0);
        this.rec.say(`${catchText}. ${this.name(target)} FUMBLES${cover ? `, forced and recovered by ${this.name(cover)}` : ""}.${ruling.note}`, F.turnover);
        this.rec.why = "Fumble";
        this.tick(7);
        this.turnover(100 - (this.ydl + yards));
        return { yards, ended: true, playTime: 0, clockStops: true, involved: [target, cover] };
      }
    }
    // Short catches are often run down by a lineman chasing from the rush.
    const front = yards <= 6 ? [...def.edge, ...def.idl] : [];
    const tacklers = [cover, ...def.lb, ...def.s, ...def.cb.filter((id) => id !== cover), ...front].filter(Boolean) as string[];
    const tk = this.tackle(d, tacklers, yards < 0 ? yards : 1, tacklers.map((id, i) => {
      const pos = PLAYER_BY_ID[id].position;
      return i === 0 ? 2.5 : pos === "CB" ? 0.5 : pos === "EDGE" || pos === "IDL" ? 0.3 : 1;
    }));
    this.rec.say(`${catchText}${tk ? ` (${this.name(tk)})` : ""}.${ruling.note}`, yards >= 20 ? F.big : 0);
    const oob = this.rng() < (hurry ? 0.4 : 0.18);
    return { yards, ended: false, playTime: 7, clockStops: this.clockStopsOnOutOfBounds(oob), involved: [target, cover] };
  }

  completionStats(o: Team, qb: string, target: string, yards: number): void {
    this.add(o, qb, "cmp");
    this.add(o, qb, "passYds", yards);
    this.add(o, qb, "passLong", yards);
    this.add(o, target, "rec");
    this.add(o, target, "recYds", yards);
    this.add(o, target, "recLong", yards);
    o.box.cmp++;
    o.box.passYds += yards;
    o.box.yards += yards;
  }

  /**
   * Who blocks whom in pass protection: edges against the tackles, interior rushers against the
   * guards and center. Returns each rusher's blocker and how far the worst pairing is from the average.
   */
  rushPairs(lu: Lineup, rushers: string[]): { blocker: Record<string, string>; worst: number } {
    const blocker: Record<string, string> = {};
    const diffs: number[] = [];
    let edges = 0;
    let inside = 0;
    for (const id of rushers) {
      const edge = PLAYER_BY_ID[id].position === "EDGE";
      const b = edge ? lu.ol[edges++] ?? lu.ol[0] : lu.ol[2 + inside++] ?? lu.ol[4] ?? lu.ol[0];
      if (!b) continue;
      blocker[id] = b;
      diffs.push(this.tr(id, "passRush") - (0.75 * this.tr(b, "passBlock") + 0.25 * this.tr(b, "agility")));
    }
    if (!diffs.length) return { blocker, worst: MISMATCH_TYPICAL };
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return { blocker, worst: Math.max(...diffs) - mean };
  }

  pickDepth(o: Team): Depth {
    const { screen, short, inter, deep } = this.depthWeights(o);
    const total = screen + short + inter + deep;
    const r = this.rng() * total;
    if (r < screen) return "screen";
    if (r < screen + short) return "short";
    if (r < screen + short + inter) return "inter";
    return "deep";
  }

  /** How often the offense throws to each depth on this down and distance. */
  depthWeights(o: Team): Record<Depth, number> {
    let { screen, short, deep } = o.off;
    if (this.down >= 3 && this.dist >= 8) {
      screen *= 0.6;
      short *= 0.6;
      deep *= 1.3;
    }
    if (this.down >= 3 && this.dist <= 4) {
      short *= 1.4;
      deep *= 0.6;
    }
    deep *= this.cond.deepMult;
    const room = 100 - this.ydl;
    if (room < 20) deep = 0;
    const inter = Math.max(0.05, 1 - o.off.screen - o.off.short - o.off.deep);
    return { screen, short, inter, deep };
  }

  /**
   * The first read and the depth of the throw together. The target is chosen by his share of the
   * looks, then the depth from the team's tendencies tilted toward his game: a speed receiver who
   * wins deep sees far more shots downfield than a possession receiver or the slot, backs catch
   * screens and checkdowns, tight ends work the short and middle areas.
   */
  pickPass(o: Team, d: Team, lu: Lineup): { target: string; depth: Depth } {
    const tr = (id: string, k: string) => this.tr(id, k);
    const q = (id: string, keys: string[]) => Math.max(0.4, 1 + (keys.reduce((s, k) => s + tr(id, k), 0) / keys.length - 80) * 0.017);
    const cands: string[] = [];
    const weights: number[] = [];
    const fits: Record<Depth, number>[] = [];
    const push = (id: string | undefined, w: number, fit: Record<Depth, number>) => {
      if (!id || w <= 0) return;
      cands.push(id);
      weights.push(w);
      fits.push(fit);
    };
    lu.wrs.forEach((id, i) => {
      // How much more he is a vertical threat than a route runner, and how much of a runner after the catch.
      const vert = clamp(0.5 * (tr(id, "deep") + tr(id, "speed")) - 0.5 * (tr(id, "routes") + tr(id, "hands")), -15, 15);
      const yac = clamp(tr(id, "yac") - tr(id, "routes"), -15, 15);
      const slot = i >= 2 ? 1 : 0;
      push(id, ([1, 0.72, 0.6, 0.5][i] ?? 0.45) * q(id, ["routes", "hands"]), {
        deep: Math.exp(vert * 0.16) * (slot ? 0.6 : i === 0 ? 1.3 : 1.05),
        inter: i === 0 ? 1.25 : 1,
        short: Math.exp(-vert * 0.06) * (slot ? 1.35 : i === 0 ? 0.8 : 0.9),
        screen: Math.exp(yac * 0.05 - vert * 0.03) * (slot ? 1.3 : 0.6),
      });
    });
    lu.tes.forEach((id, i) => push(id, (i === 0 ? 0.6 : 0.38) * o.off.teTargets * q(id, ["receiving"]), { deep: 0.45, inter: 1.15, short: 1.15, screen: 0.45 }));
    lu.rbs.forEach((id) => push(id, 0.6 * o.off.rbTargets * q(id, ["receiving"]), { deep: 0.06, inter: 0.35, short: 1.5, screen: 3.4 }));
    if (lu.fb) push(lu.fb, 0.06, { deep: 0.05, inter: 0.4, short: 2, screen: 1.5 });
    // Game plans built to take away the top option.
    const top = weights.indexOf(Math.max(...weights));
    if (top >= 0) weights[top] *= 1 - 0.18 * d.def.gamePlan;
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    let k = cands.length - 1;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) { k = i; break; }
    }
    if (k < 0) return { target: lu.qb, depth: this.pickDepth(o) };
    // The team's depth tendencies, divided by how the whole group leans, so the offense as a whole
    // still throws deep as often as its plan says; then tilted toward this receiver's game.
    const tend = this.depthWeights(o);
    const depths: Depth[] = ["screen", "short", "inter", "deep"];
    const w = depths.map((dp) => {
      const mean = fits.reduce((s, f, i) => s + f[dp] * weights[i], 0) / total;
      return tend[dp] * fits[k][dp] / Math.max(0.05, mean);
    });
    let x = this.rng() * w.reduce((a, b) => a + b, 0);
    let depth: Depth = "deep";
    for (let i = 0; i < depths.length; i++) {
      x -= w[i];
      if (x <= 0) { depth = depths[i]; break; }
    }
    return { target: cands[k], depth };
  }

  pickTarget(o: Team, d: Team, lu: Lineup, depth: Depth): string {
    const cands: string[] = [];
    const weights: number[] = [];
    const push = (id: string | undefined, w: number) => {
      if (!id || w <= 0) return;
      cands.push(id);
      weights.push(w);
    };
    // Better receivers draw more of the looks, but a progression spreads the ball: in the real league
    // a team's top target sees about a quarter of its targets, and backs about a sixth of all of them.
    const q = (id: string, keys: string[]) => Math.max(0.4, 1 + (keys.reduce((s, k) => s + this.tr(id, k), 0) / keys.length - 80) * 0.017);
    const job = (id: string, keys: string[]) => Math.max(0.15, 1 + (keys.reduce((s, k) => s + this.tr(id, k), 0) / keys.length - this.tr(id, "routes")) * 0.12) * q(id, keys);
    lu.wrs.forEach((id, i) => {
      const role = [1, 0.72, 0.6, 0.5][i] ?? 0.45;
      // Each receiver has his job: the deep threat sees the shots downfield, the slot the quick throws.
      const fit = depth === "deep" ? job(id, ["deep", "speed"]) : depth === "screen" ? job(id, ["yac"]) * 0.7 : q(id, ["routes", "hands"]);
      push(id, role * fit);
    });
    lu.tes.forEach((id, i) => push(id, (i === 0 ? 0.62 : 0.4) * o.off.teTargets * q(id, ["receiving"]) * (depth === "deep" ? 0.5 : 1)));
    lu.rbs.forEach((id) => push(id, 0.72 * o.off.rbTargets * q(id, ["receiving"]) * (depth === "screen" ? 2.2 : depth === "short" ? 1.2 : depth === "deep" ? 0.1 : 0.45)));
    if (lu.fb) push(lu.fb, 0.06);
    // Game plans built to take away the top option.
    const top = weights.indexOf(Math.max(...weights));
    if (top >= 0) weights[top] *= 1 - 0.18 * d.def.gamePlan;
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i];
    }
    return cands[0] ?? lu.qb;
  }

  coverFor(def: DefLineup, lu: Lineup, target: string, man: boolean, shadow = false): string | undefined {
    const pos = PLAYER_BY_ID[target].position;
    const wrIndex = lu.wrs.indexOf(target);
    if (shadow && wrIndex === 0 && def.cb.length) return [...def.cb].sort((a, b) => this.tr(b, "man") - this.tr(a, "man"))[0];
    if (wrIndex >= 0) {
      if (man || this.rng() < 0.65) return def.cb[wrIndex] ?? def.s[0] ?? def.cb[0];
      return def.s[Math.floor(this.rng() * def.s.length)] ?? def.cb[0];
    }
    if (pos === "TE") return this.rng() < 0.5 ? def.s[0] ?? def.lb[0] : def.lb[0] ?? def.s[0];
    return def.lb[Math.floor(this.rng() * def.lb.length)] ?? def.s[1] ?? def.s[0];
  }

  /** The rusher who got home on a pressure or a hit: the best pass rushers win most often. */
  byRush(all: string[], blitzers: string[]): string | undefined {
    if (!all.length) return undefined;
    const w = all.map((id) => (blitzers.includes(id) ? 0.9 : Math.max(0.25, 1 + (this.tr(id, "passRush") - 80) * 0.05) * (PLAYER_BY_ID[id].position === "EDGE" ? 1.3 : 0.85)));
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < all.length; i++) {
      r -= w[i];
      if (r <= 0) return all[i];
    }
    return all[all.length - 1];
  }

  sack(o: Team, d: Team, qb: string, rushers: string[], blockers: Record<string, string> = {}, how: { blitzers?: string[]; free?: boolean; chasers?: string[] } = {}): PlayOutcome {
    // The rusher who wins his one-on-one most often gets there. Edges finish more sacks than interior
    // linemen (about 57% and 23% of the league's); a blitzer nobody picked up has the clearest path;
    // and now and then a quarterback who escapes the pocket is run down by a linebacker or safety.
    const edgeOver = (id: string) => (blockers[id] ? (this.tr(id, "passRush") - this.tr(blockers[id], "passBlock")) * 0.015 : 0);
    const blitzing = new Set(how.blitzers ?? []);
    const weights = rushers.map((id) => blitzing.has(id) ? (how.free ? 2.4 : 1.1)
      : Math.max(0.35, 1 + (this.tr(id, "passRush") - 80) * 0.018 + edgeOver(id)) * (PLAYER_BY_ID[id].position === "EDGE" ? 1.4 : 0.7));
    const chaser = how.chasers?.length && this.rng() < 0.07 ? how.chasers[Math.floor(this.rng() * how.chasers.length)] : undefined;
    const pool = chaser ? [chaser] : rushers;
    const odds = chaser ? [1] : weights;
    const pick = () => {
      const total = odds.reduce((a, b) => a + b, 0);
      let r = this.rng() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= odds[i];
        if (r <= 0) return pool[i];
      }
      return pool[0];
    };
    const a = pick();
    const loss = Math.min(this.ydl, 4 + Math.round(this.rng() * 6));
    let sackText = `${this.name(qb)} sacked by ${this.name(a)}`;
    if (pool.length > 1 && this.rng() < 0.12) {
      let b = pick();
      if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
      sackText += ` and ${this.name(b)}`;
      this.add(d, a, "sacks", 0.5);
      this.add(d, b, "sacks", 0.5);
      this.add(d, a, "tklAst");
      this.add(d, b, "tklAst");
    } else {
      this.add(d, a, "sacks");
      this.add(d, a, "tklSolo");
    }
    this.add(d, a, "tfl");
    this.add(d, a, "qbHits");
    this.add(o, qb, "sacked");
    this.add(o, qb, "sackYds", loss);
    o.box.sacked++;
    o.box.sackYds += loss;
    o.box.yards -= loss;
    sackText += ` for ${yardsText(-loss)}${blockers[a] ? `, beating ${PLAYER_BY_ID[blockers[a]].position} ${this.name(blockers[a])}` : ""}.`;
    this.rec.say(sackText);
    // Strip sacks.
    if (this.rng() < 0.12) {
      this.add(o, qb, "fum");
      this.add(d, a, "ff");
      if (this.rng() < 0.55) {
        this.add(o, qb, "fumLost");
        const recovered = rushers[Math.floor(this.rng() * rushers.length)];
        this.add(d, recovered, "fr");
        this.rec.more(` ${this.name(qb)} FUMBLES; ${this.name(recovered)} recovers${this.ydl - loss <= 0 ? " in the end zone" : ""}.`, F.turnover | F.big);
        this.rec.why = "Fumble";
        this.tick(6);
        if (this.ydl - loss <= 0) {
          this.possessionEnded(o.side);
          if (!this.over) {
            this.newPossession(d.side, 99);
            this.touchdown(d, `${this.name(a)} fumble recovery in the end zone`, a);
          }
          o.box.turnovers++;
          return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [qb, a] };
        }
        this.turnover(100 - (this.ydl - loss));
        return { yards: 0, ended: true, playTime: 0, clockStops: true, involved: [qb, a] };
      }
    }
    return { yards: -loss, ended: false, playTime: 6, clockStops: false, involved: [qb, a] };
  }

  scramble(o: Team, d: Team, qb: string, def: DefLineup): PlayOutcome {
    const mob = this.tr(qb, "mobility");
    let yards = Math.max(-1, Math.round(4 + gaussian(this.rng) * 3 + (mob - 80) * 0.12));
    if (this.rng() < 0.08 + (mob - 80) * 0.004) yards += 10 + Math.round(this.rng() * 25);
    const room = 100 - this.ydl;
    yards = Math.min(yards, room);
    this.rec.say(`${this.name(qb)} scrambles for ${yardsText(yards)}.`, yards >= 20 ? F.big : 0);
    this.add(o, qb, "car");
    this.add(o, qb, "rushYds", yards);
    this.add(o, qb, "rushLong", yards);
    o.box.rushAtt++;
    o.box.rushYds += yards;
    o.box.yards += yards;
    if (yards >= room) {
      this.add(o, qb, "rushTd");
      this.tick(7);
      this.redZoneTouchdown(o);
      this.touchdown(o, `${this.name(qb)} ${yards}-yard run`, qb);
      return { yards, ended: true, playTime: 0, clockStops: true, involved: [qb] };
    }
    // Most scrambles end with a slide or out of bounds.
    if (this.rng() < 0.45) this.tackle(d, [...def.lb, ...def.s, ...def.edge], yards);
    return { yards, ended: false, playTime: 6, clockStops: this.clockStopsOnOutOfBounds(this.rng() < 0.4), involved: [qb] };
  }
}
