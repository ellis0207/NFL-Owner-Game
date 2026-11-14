// Reads a row of a finished game's play-by-play as a play the animation can
// act out. Everything comes from the feed: its words, the look, the lineups
// kept with the row and what the row changed in the box score.
import { PLAYER_BY_ID } from "../../engine/league";
import { PLAY_FLAGS as F } from "../../engine/playlog";
import { STAT_INDEX } from "../../engine/stats";
import type { GameLog } from "../../engine/types";
import type { Call } from "./book";

const FORMATIONS = ["Under center", "Pistol", "Shotgun", "Empty"];

/** The yards a description gives a play: "for 7 yards", "for a loss of 2", "for no gain". */
function yardsIn(text: string, lead = "for"): number | null {
  const m = new RegExp(`${lead} (?:(\\d+) yards?|a loss of (\\d+)|(no gain))`).exec(text);
  return !m ? null : m[1] ? Number(m[1]) : m[2] ? -Number(m[2]) : 0;
}

/** A lineup the row points at, as player ids group by group. */
function lineup(log: GameLog, set: number): string[][] | null {
  const text = log.who?.sets[set];
  if (!text || !log.who) return null;
  const side = Number(text[0]);
  return text.slice(2).split("|").map((g) => (g ? g.split(",").map((i) => log.who!.ids[side][Number(i)]) : []));
}

/**
 * What row `n` of the log was, or null for a line with nothing to act out
 * (a timeout, an alert, a fourth-and-20 try in place of an onside kick).
 */
export function readCall(log: GameLog, n: number): Call | null {
  const row = log.plays[n];
  if (!row || row[8] & (F.note | F.story)) return null;
  const text = row[7], look = row[11] ?? "", flags = row[8];
  const ids: Call["ids"] = {};
  let tryKicker: string | undefined;
  const d = log.box?.[n];
  if (d && log.ids) {
    const q = d[1];
    for (let i = 0; i < q.length; i += 4) {
      const id = log.ids[q[i]][q[i + 1]], k = q[i + 2];
      if (k === STAT_INDEX.car) ids.carrier = id;
      else if (k === STAT_INDEX.att) ids.passer = id;
      else if (k === STAT_INDEX.tgt) ids.target = id;
      else if (k === STAT_INDEX.tklSolo || (k === STAT_INDEX.tklAst && !ids.tackler)) ids.tackler = id;
      else if (k === STAT_INDEX.defInt) ids.picker = id;
      else if (k === STAT_INDEX.sacks && !ids.sacker) ids.sacker = id;
      else if (k === STAT_INDEX.fga || k === STAT_INDEX.punts) ids.kicker = id;
      else if (k === STAT_INDEX.kr || k === STAT_INDEX.pr) ids.returner = id;
      else if (k === STAT_INDEX.xpa) tryKicker = id;
    }
  }
  const hint = row[15]?.split(".");
  const letters = hint?.[2] ?? "";
  const lane = / left/.test(text) ? 1 : / right/.test(text) ? -1 : 0;
  const call: Call = {
    kind: "run", lane, where: "middle", style: "", result: "gain", gain: 0, ret: 0, next: null,
    score: (flags & F.score) !== 0 || /TOUCHDOWN/.test(text), fumble: /FUMBLES|MUFFS| fumbles, /.test(text), turnover: (flags & F.turnover) !== 0,
    recoverer: /recovered by ([^.;]+?)(?: at the |\.(?: |$))/.exec(text)?.[1] ?? /; ([^.;]+?) recovers/.exec(text)?.[1],
    caption: /Penalty on (\w+: [^.]*?\d+ yards)/.exec(text)?.[1], flagged: look === "Play called back", brokenUp: /broken up/.test(text),
    formation: FORMATIONS.find((f) => look.startsWith(f)) ?? "Under center",
    playAction: letters.includes("a"), blitz: letters.includes("b") || /blitz|Fire zone/.test(look), man: letters.includes("m") || /Cover [01]|2-man/.test(look), twoHigh: letters.includes("2") || /Cover [24]|2-man/.test(look),
    ids, names: {}, off: hint ? lineup(log, Number(hint[0])) : null, def: hint ? lineup(log, Number(hint[1])) : null,
  };
  const room = 100 - row[5];
  const gained = (fallback: number) => (call.score && !call.flagged && !(flags & F.turnover) ? room : yardsIn(text) ?? fallback);

  // A change of possession: the next snap is the truest word on where the ball ended up.
  const after = log.plays.slice(n + 1, n + 6).find((p) => !(p[8] & (F.note | F.story)));
  if (after && after[3] > 0 && after[2] !== row[2] && after[6] !== row[6] && !/FUMBLES|MUFFS|TOUCHDOWN|touchback|PENALTY|Penalty/.test(text)) call.next = 100 - after[5] - row[5];

  // The try after a touchdown is on the touchdown's row. The offense scored unless the ball changed hands or was
  // kicked, and the last rise in that club's score says what the try was worth: six points with no word about a
  // try is a touchdown that ended overtime. (A kickoff brought back for a score is added to the row before it.)
  if (/TOUCHDOWN/.test(text) && !call.flagged) {
    const side = (row[3] === 0 || flags & (F.kick | F.turnover) || /INTERCEPTED/.test(text) ? 1 - row[2] : row[2]) as 0 | 1;
    const now = row[9 + side] as number;
    let was = 0;
    for (let j = n - 1; j >= 0; j--) if (log.plays[j][9 + side] !== now) { was = log.plays[j][9 + side] as number; break; }
    const two = /Two-point try/.test(text) || now - was === 8;
    const missed = / ([^.]*?) misses the extra point/.exec(text.slice(text.indexOf("TOUCHDOWN.") + 10))?.[1];
    if (now - was >= 7 || two || missed) call.try = { two, good: now - was >= 7, side, kicker: tryKicker, kickerName: missed };
  }

  // Kicks.
  if (row[3] === 0) {
    // An onside kick: the row says which club came up with it, and "!" marks the kicking team getting it back.
    const onside = /^(.*?) onside kick, recovered by (\w+)(!?)/.exec(text);
    if (onside) {
      call.kind = "kickoff"; call.style = "onside"; call.score = false;
      call.names = { kicker: onside[1] };
      call.recoverer = onside[2]; call.kept = onside[3] === "!";
      return call;
    }
    if (!/kicks off/.test(text)) return null;
    call.kind = "kickoff";
    call.names = { kicker: /^(.*?) kicks off/.exec(text)?.[1], returner: /; (.*?) returns it/.exec(text)?.[1] };
    call.style = /touchback/.test(text) ? "touchback" : "return";
    return call;
  }
  if (flags & F.kick) {
    if (/punt is BLOCKED/.test(text)) {
      // The defense takes over where the ball came to rest, eight yards behind the line when the log has no next snap.
      call.kind = "punt"; call.style = "blocked";
      call.names = { kicker: /^(.*?) punt is BLOCKED/.exec(text)?.[1] };
      call.recoverer = /; (\w+) recovers/.exec(text)?.[1];
      if (call.next === null) call.next = -8;
      return call;
    }
    if (/BLOCKED/.test(text)) return null;
    if (/ punts /.test(text)) {
      call.kind = "punt";
      call.names = { kicker: /^(.*?) punts/.exec(text)?.[1], returner: /; (.*?) (?:returns|MUFFS)/.exec(text)?.[1] };
      call.gain = Number(/punts (\d+) yards/.exec(text)?.[1] ?? 40);
      call.style = /touchback/.test(text) ? "touchback" : /MUFFS/.test(text) ? "muff" : /returns it/.test(text) ? "return" : /fair catch/.test(text) ? "fair" : /out of bounds/.test(text) ? "out" : "downed";
      call.ret = /returns it/.test(text) ? yardsIn(text, "returns it") ?? 0 : 0;
      return call;
    }
    if (/field goal/.test(text)) {
      call.kind = "fg";
      call.names = { kicker: /^(.*?) \d+-yard/.exec(text)?.[1] };
      call.style = /GOOD/.test(text) ? "good" : /wide left/.test(text) ? "left" : /wide right/.test(text) ? "right" : "short";
      return call;
    }
    return null;
  }
  if (look === "No play") {
    // A flag before the snap. The row keeps no lineups, so it borrows them from the nearest snap of the same drive.
    const foul = /^Penalty on \w+: (.*?),/.exec(text)?.[1];
    if (!foul) return null;
    call.kind = "flag"; call.style = foul; call.score = false;
    for (const j of [n + 1, n - 1, n + 2, n - 2]) {
      const near = log.plays[j];
      if (!near?.[15] || near[2] !== row[2] || near[6] !== row[6]) continue;
      const [a, b] = near[15].split(".");
      call.off = lineup(log, Number(a)); call.def = lineup(log, Number(b));
      call.formation = FORMATIONS.find((f) => (near[11] ?? "").startsWith(f)) ?? "Shotgun";
      break;
    }
    return call;
  }

  // Scrimmage plays.
  if (/ kneels\./.test(text)) { call.kind = "kneel"; call.gain = -1; return call; }
  if (/ sacked by /.test(text)) { call.kind = "sack"; call.gain = yardsIn(text) ?? -6; return call; }
  if (/ scrambles for /.test(text)) { call.kind = "scramble"; call.gain = gained(4); call.lane = n % 2 ? 1 : -1; return call; }
  if (/throws it away/.test(text)) { call.kind = "away"; call.lane = n % 2 ? 1 : -1; return call; }
  const keep = /(QB sneak|keeps it on the read option|keeps it|runs the QB draw)/.exec(text);
  if (keep) {
    call.kind = "keep";
    call.style = keep[1] === "QB sneak" ? "sneak" : /draw/.test(keep[1]) ? "draw" : /option/.test(keep[1]) ? "option" : "keep";
    call.lane = call.style === "sneak" || call.style === "draw" ? 0 : n % 2 ? 1 : -1;
    call.gain = gained(2);
    return call;
  }
  if (/ is stopped for no gain/.test(text)) { call.lane = n % 2 ? 1 : -1; return call; }
  const run = / runs (around|wide|off|behind the pulling guard|up the middle|left guard|right guard|for|into)/.exec(text);
  if (run) {
    call.where = run[1] === "around" || run[1] === "wide" ? "end" : run[1] === "off" || run[1].startsWith("behind") ? "tackle" : "middle";
    // The feed doesn't always say which side a run went to; then the row number decides, the same way every time.
    if (!call.lane || run[1] === "for" || run[1] === "into") call.lane = n % 2 ? 1 : -1;
    call.gain = /into the end zone/.test(text) ? room : gained(3);
    if (/into the end zone/.test(text)) call.score = true;
    return call;
  }
  if (/ pass /.test(text)) {
    call.kind = "pass";
    call.style = letters[0] && "csid".includes(letters[0]) ? letters[0] : /screen pass/.test(text) ? "c" : / deep/.test(text) ? "d" : "s";
    call.result = /INTERCEPTED/.test(text) ? "picked" : /incomplete/.test(text) ? "incomplete" : "gain";
    if (call.result === "picked") call.ret = /returned (\d+) yards for a/.test(text) ? 100 : yardsIn(text, "returned") ?? 0;
    else if (call.result === "gain") {
      call.gain = /into the end zone/.test(text) ? room : gained(6);
      if (/into the end zone/.test(text)) call.score = true;
    }
    if (call.style !== "c" && !/ (left|middle|right)/.test(text)) call.lane = [1, 0, -1][n % 3] as Call["lane"];
    return call;
  }
  return null;
}

let byName: Map<string, string> | null = null;

/** A player by the name the feed gives him, for the kicking game, where the log keeps no lineups. */
export function playerNamed(name: string | undefined): string | null {
  if (!name) return null;
  if (!byName) {
    byName = new Map();
    for (const p of Object.values(PLAYER_BY_ID)) if (!byName.has(p.name)) byName.set(p.name, p.id);
  }
  return byName.get(name) ?? null;
}
