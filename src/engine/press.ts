// Questions from the press for the owner. When something happens to the team,
// a reporter asks for comment; the owner picks one of four to six answers or
// lets the question go. What an answer does is never shown: it moves how the
// players, the head coach, agents, fans and each outlet feel, can give an
// agent leverage, can bring a league fine, and some answers are remembered and
// come back later.
import { agentFor, agentHidden, changeMorale, changeTrust, morale, priorities } from "./agents";
import { teamPlayerIds } from "./cap";
import { draftClass } from "./prospects";
import { schoolName } from "./collegeData";
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { DAY_ROUNDS, draftDayOf } from "./draft";
import { money, news, send } from "./inbox";
import { GAMES_BY_DATE, HIDDEN_STAFF, PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS, teamLabel } from "./league";
import { marketView } from "./market";
import { pick, surname } from "./media";
import { addStory, changeRel, MEDIA, MEDIA_BY_ID, mediaState, relOf } from "./outlets";
import { isPendingFreeAgent } from "./offseason";
import { rngFor, type Rng } from "./rng";
import { depthChart } from "./roster";
import { teamStaff } from "./staff";
import { veteranReportDate } from "./season";
import { standings } from "./standings";
import { seasonTotals } from "./stats";
import { parsePick, trades } from "./trades";
import type { GameState, PressOption, PressQuestion, Position } from "./types";

const KEY = RULES.keyDates;
/** Days the owner has to answer, counting the day after it's asked. */
const ANSWER_DAYS = 3;

const nick = (team: string) => TEAM_BY_ID[team].name;
const pname = (id: string) => PLAYER_BY_ID[id]?.name ?? "the player";
const last = surname;

function hc(state: GameState): string {
  return teamStaff(state.userTeam).HC?.name ?? "our head coach";
}
function gm(state: GameState): string {
  return teamStaff(state.userTeam).GM?.name ?? "our general manager";
}

// ---- Asking ----

interface Ask {
  topic: string;
  /** Asked once per key. */
  key: string;
  outlet: string;
  by: "insider" | "columnist" | "analyst" | "draft" | "reporter";
  context: string;
  question: string;
  options: PressOption[];
  player?: string;
  team?: string;
  prospect?: string;
}

const NO_COMMENT: PressOption = { key: "noComment", text: "No comment." };

function ourGameToday(state: GameState) {
  for (const g of GAMES_BY_DATE[state.date] ?? []) {
    const r = state.results[g.id];
    if (r && (r.home === state.userTeam || r.away === state.userTeam)) return { g, r };
  }
  return null;
}

function starters(state: GameState, team: string): Set<string> {
  const chart = depthChart(state, team);
  const n: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2 };
  return new Set(Object.entries(n).flatMap(([pos, k]) => chart[pos as Position]?.slice(0, k) ?? []));
}

/** What the press wants to ask about today, most newsworthy first. */
function candidates(state: GameState, rng: Rng): Ask[] {
  const us = state.userTeam;
  const date = state.date;
  const out: Ask[] = [];
  const m = mediaState(state);
  const todays = m.stories.filter((s) => s.date === date && s.teams?.includes(us));
  const hostile = (outlet: string) => relOf(state, outlet) < -12;

  // The business side: ticket prices and empty seats.
  const biz = state.business?.ask;
  if (biz && daysBetween(biz.date, date) <= 1) {
    out.push(biz.kind === "tickets"
      ? {
        topic: "tickets", key: `tickets:${biz.date}`, outlet: hostile("blitz") ? "blitz" : "ledger", by: "columnist", context: biz.context,
        question: "Fans are upset about ticket prices. What do you say to them?",
        options: [
          { key: "invest", text: "Every dollar goes back into winning. They'll see it on the field." },
          { key: "market", text: "We price to the market. The demand is there." },
          { key: "families", text: "We'll always keep affordable seats for families." },
          { key: "hear", text: "We hear them. We'll take another look." },
          NO_COMMENT,
        ],
      }
      : {
        topic: "attendance", key: `attendance:${biz.date}`, outlet: "blitz", by: "columnist", context: biz.context,
        question: "There were a lot of empty seats. What happened?",
        options: [
          { key: "earn", text: "Our fans have been loyal. It's on us to give them a reason to come." },
          { key: "noGiveaways", text: "We're not going to give tickets away. Win and they'll come." },
          { key: "prices", text: "We're looking at our prices. That's on us." },
          { key: "thanks", text: "I want to thank everyone who was there. That was a great crowd." },
          NO_COMMENT,
        ],
      });
  }
  // The draft: our picks today.
  const day = draftDayOf(date);
  if (day && state.draft?.daysDone.includes(day)) {
    const ours = state.draft.made.filter((x) => x.team === us && DAY_ROUNDS[day - 1].includes(parsePick(x.pick).round));
    if (ours.length) {
      const top = ours[0];
      const p = draftClass(state.seed).byId[top.player];
      out.push({
        topic: "draft", key: `draft:${day}`, outlet: "sentinel", by: "draft", prospect: top.player, player: top.player,
        context: `We took ${p.position} ${p.name} (${schoolName(p.school)}) at No. ${top.overall}.`,
        question: hostile("sentinel") ? `Most boards had ${p.name} going later. Did you reach?` : `What did you see in ${p.name}, and did you consider anyone else there?`,
        options: [
          { key: "topBoard", text: `${last(p.name)} was at the top of our board. We're thrilled he was there.` },
          { key: "process", text: "We trust our scouts and our process. That's all you can do." },
          { key: "mocks", text: "With respect, the mock drafts don't make our picks." },
          { key: "threeYears", text: "Grade it in three years. That's the only fair way." },
          { key: "gmCall", text: `That's ${gm(state)}'s call, and I back him.` },
          NO_COMMENT,
        ],
      });
    }
  }
  // Trades we made today.
  for (const rec of (state.trades?.log ?? []).filter((x) => x.date === date && x.teams.includes(us) && x.status !== "voided")) {
    const side = rec.teams[0] === us ? 0 : 1;
    const gone = rec.send[side].flatMap((a) => (a.kind === "player" ? [a.id] : [])).sort((a, b) => marketView(state, b) - marketView(state, a))[0];
    const got = rec.send[1 - side].flatMap((a) => (a.kind === "player" ? [a.id] : [])).sort((a, b) => marketView(state, b) - marketView(state, a))[0];
    const other = rec.teams[1 - side];
    out.push({
      topic: "trade", key: `trade:${rec.id}`, outlet: "capspace", by: "insider", player: gone ?? got, team: other,
      context: `We traded with the ${teamLabel(other)}${gone ? `, sending away ${pname(gone)}` : ""}${got ? ` and getting ${pname(got)}` : ""}.`,
      question: gone ? `Why move on from ${pname(gone)} now?` : `What does ${got ? pname(got) : "this trade"} bring to the team?`,
      options: [
        ...(gone ? [{ key: "thank", text: `We thank ${pname(gone)} for everything he gave this organization.` }] : []),
        { key: "better", text: "We believe we got better today. Simple as that." },
        { key: "business", text: "It's a business. We made the decision that's best for the team." },
        ...(gone ? [{ key: "criticize", text: "Frankly, it wasn't working. We needed a change." }] : [{ key: "allIn", text: "We're all in. We want to win right now." }]),
        NO_COMMENT,
      ],
    });
  }
  // Notable signings.
  for (const s of state.signings.filter((x) => x.date === date && x.team === us && x.apy >= 6_000_000 && (x.kind === "extension" || x.kind === "free-agent"))) {
    out.push({
      topic: "signing", key: `signing:${s.id}`, outlet: "capspace", by: "reporter", player: s.player,
      context: `${pname(s.player)} signed for ${money(s.total)} over ${s.years} years (${money(s.apy)} a year). Early grades: ${s.grades.map((g) => g.grade).join(", ")}.`,
      question: hostile("capspace") || s.grades.some((g) => g.grade.startsWith("C") || g.grade.startsWith("D")) ? `Some people think you overpaid ${pname(s.player)}. Did you?` : `What does ${pname(s.player)}'s deal say about where this team is going?`,
      options: [
        { key: "cornerstone", text: `${pname(s.player)} is a cornerstone. This deal is a statement.` },
        { key: "value", text: "We paid fair market value for a player we believe in." },
        { key: "scouts", text: "Our coaches and scouts pounded the table for him." },
        { key: "noObject", text: "We're trying to win. Money is no object." },
        NO_COMMENT,
      ],
    });
  }
  // Releases of real players.
  for (const t of (state.transactions ?? []).filter((x) => x.date === date && x.team === us && (x.kind === "released" || x.kind === "waived"))) {
    if (!PLAYER_BY_ID[t.player] || marketView(state, t.player) < 82) continue;
    out.push({
      topic: "release", key: `release:${t.player}:${date}`, outlet: "sideline", by: "reporter", player: t.player,
      context: `We released ${PLAYER_BY_ID[t.player].position} ${pname(t.player)}.`,
      question: `Why part ways with ${pname(t.player)}?`,
      options: [
        { key: "thank", text: `We thank ${pname(t.player)} for everything he gave us. This was hard.` },
        { key: "business", text: "It's a business. We made the decision that's best for the team." },
        { key: "criticize", text: "Frankly, it wasn't working. We needed a change." },
        { key: "depth", text: "We have the depth to move on. We like our young players." },
        NO_COMMENT,
      ],
    });
  }
  // Contract talks in the news, holdouts, trade requests.
  for (const s of todays.filter((x) => x.kind === "leak" && x.players?.length)) {
    const id = s.players![0];
    if (state.players[id]?.team !== us) continue;
    const out_ = state.players[id].holdout;
    out.push({
      topic: "contract", key: `contract:${id}:${s.id}`, outlet: "capspace", by: "insider", player: id,
      context: s.headline,
      question: out_ ? `${pname(id)} is ${out_.kind === "holdout" ? "holding out" : "not practicing"}. Will you get a deal done?` : `Where do things stand with ${pname(id)}?`,
      options: [
        { key: "willPay", text: `We want ${pname(id)} here long term, and we're going to get it done.` },
        { key: "firm", text: "We have a number we believe is fair. We won't negotiate in public." },
        { key: "private", text: "Those talks stay between us and his agent." },
        { key: "teamFirst", text: "Nobody is bigger than this team." },
        { key: "explore", text: "If it doesn't work out, we'll explore every option." },
        NO_COMMENT,
      ],
    });
  }
  for (const id of teamPlayerIds(state, us)) {
    const h = state.players[id].holdout;
    if (!h || h.since !== date || !PLAYER_BY_ID[id]) continue;
    out.push({
      topic: "contract", key: `holdout:${id}:${h.since}`, outlet: "sideline", by: "insider", player: id,
      context: `${pname(id)} is ${h.kind === "holdout" ? "holding out of camp" : "holding in: he reported but isn't practicing"} while he waits for a new deal.`,
      question: `Are you worried about ${pname(id)}?`,
      options: [
        { key: "willPay", text: `We want ${pname(id)} here long term, and we're going to get it done.` },
        { key: "firm", text: "We have a number we believe is fair. We won't negotiate in public." },
        { key: "private", text: "Those talks stay between us and his agent." },
        { key: "teamFirst", text: "Nobody is bigger than this team." },
        { key: "explore", text: "If it doesn't work out, we'll explore every option." },
        NO_COMMENT,
      ],
    });
  }
  for (const s of todays.filter((x) => x.kind === "rumor" && x.players?.length)) {
    const id = s.players![0];
    if (state.players[id]?.team !== us) continue;
    const requested = trades(state).requests[id] === date;
    out.push({
      topic: "rumor", key: `rumor:${id}:${date}`, outlet: "sideline", by: "insider", player: id,
      context: s.headline,
      question: requested ? `${pname(id)} wants out. Will you trade him?` : `Are you shopping ${pname(id)}?`,
      options: [
        { key: "untouchable", text: `${pname(id)} isn't going anywhere.` },
        { key: "listen", text: "We listen on everybody. That's our job." },
        { key: "love", text: `We love ${pname(id)}. That's all I'll say.` },
        { key: "askGm", text: `That's a question for ${gm(state)}.` },
        NO_COMMENT,
      ],
    });
  }
  // Long injuries to our starters.
  const firstTeam = starters(state, us);
  for (const id of teamPlayerIds(state, us)) {
    const inj = state.players[id].injury;
    if (!inj || inj.date !== date || !firstTeam.has(id) || !PLAYER_BY_ID[id]) continue;
    if (!inj.seasonEnding && daysBetween(date, inj.returnDate) < 21) continue;
    const pos = PLAYER_BY_ID[id].position;
    const backup = depthChart(state, us)[pos].find((x) => x !== id && !state.players[x]?.injury);
    out.push({
      topic: "injury", key: `injury:${id}:${date}`, outlet: "sideline", by: "reporter", player: id, prospect: backup,
      context: `${pname(id)} is ${inj.seasonEnding ? "out for the season" : `out about ${Math.round(daysBetween(date, inj.returnDate) / 7)} weeks`} (${inj.type.toLowerCase()}).`,
      question: `How does the team move on without ${pname(id)}?`,
      options: [
        ...(backup ? [{ key: "backup", text: `We believe in ${pname(backup)}. This is his chance.` }] : []),
        { key: "outside", text: "We'll look at every option, inside and outside the building." },
        { key: "wish", text: `Our thoughts are with ${pname(id)}. He'll come back stronger.` },
        { key: "optimistic", text: "He'll be back sooner than people think." },
        NO_COMMENT,
      ],
    });
  }
  // Games.
  const game = ourGameToday(state);
  if (game && game.g.type !== "PRE") {
    const { g, r } = game;
    const ours = r.home === us ? r.homeScore : r.awayScore;
    const theirs = r.home === us ? r.awayScore : r.homeScore;
    const opp = r.home === us ? r.away : r.home;
    const rec = standings(state)[us];
    const streak = rec.streak;
    const record = g.type === "REG" ? ` We're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.` : "";
    const elim = g.type === "POST" && ours < theirs;
    if (elim || (g.type === "POST" && g.round === "SB")) {
      out.push(seasonAsk(state, ours > theirs ? "champion" : "eliminated"));
    } else if (ours < theirs) {
      const lossStreak = streak.startsWith("L") ? Number(streak.slice(1)) : 1;
      const p = theirs - ours >= 17 || lossStreak >= 2 ? 0.9 : 0.55;
      if (rng() < p) {
        const outlet = rngFor(state.seed, `press:outlet:${g.id}`)() < 0.6 ? "ledger" : "blitz";
        out.push({
          topic: "loss", key: `loss:${g.id}`, outlet, by: outlet === "blitz" ? "columnist" : "reporter", team: opp,
          context: `We lost ${theirs}-${ours} to the ${teamLabel(opp)}.${record}${lossStreak >= 2 ? ` That's ${lossStreak} losses in a row.` : ""}`,
          question: hostile(outlet) || lossStreak >= 3 ? "What do you say to fans who are running out of patience?" : "What went wrong out there?",
          options: [
            { key: "backCoach", text: `I have full confidence in ${hc(state)} and the staff. We'll get it turned around.` },
            { key: "takeBlame", text: "That's on me. I'm responsible for what we put on the field." },
            { key: "callOut", text: "Our players have to execute. That performance isn't acceptable." },
            ...(theirs - ours <= 7 ? [{ key: "refs", text: "Some of those calls were hard to understand. The league should take a look." }] : []),
            { key: "changes", text: "Everything is on the table. Nobody's job is safe." },
            NO_COMMENT,
          ],
        });
      }
    } else if (ours > theirs) {
      const winStreak = streak.startsWith("W") ? Number(streak.slice(1)) : 1;
      const p = winStreak >= 3 || g.type === "POST" ? 0.8 : 0.4;
      if (rng() < p) {
        const outlet = rngFor(state.seed, `press:outlet:${g.id}`)() < 0.6 ? "ledger" : "blitz";
        out.push({
          topic: "win", key: `win:${g.id}`, outlet, by: outlet === "blitz" ? "columnist" : "reporter", team: opp,
          context: `We beat the ${teamLabel(opp)} ${ours}-${theirs}.${record}${winStreak >= 3 ? ` That's ${winStreak} straight.` : ""}`,
          question: winStreak >= 3 ? "Is this a championship team?" : "What did you like about that win?",
          options: [
            { key: "bold", text: "I'll say it: this is a Super Bowl team." },
            { key: "humble", text: "One game at a time. We haven't done anything yet." },
            { key: "creditCoach", text: `Credit to ${hc(state)} and the staff. They had a great plan.` },
            { key: "creditPlayers", text: "The players deserve all the credit. I just watch." },
            { key: "creditSelf", text: "We built this roster to win. The plan is working." },
            NO_COMMENT,
          ],
        });
      }
    }
    // A losing streak puts the coach on the hot seat.
    if (g.type === "REG" && streak.startsWith("L") && Number(streak.slice(1)) >= 3) {
      out.push({
        topic: "coach", key: `coach:${rec.w}-${rec.l}`, outlet: "blitz", by: "insider",
        context: `${Number(streak.slice(1))} losses in a row. The Blitz has ${hc(state)} on its hot seat list.`,
        question: `Is ${hc(state)}'s job safe?`,
        options: [
          { key: "fullSupport", text: `${hc(state)} is our coach. Period.` },
          { key: "endOfSeason", text: "We'll evaluate everything at the end of the season." },
          { key: "noOneSafe", text: "Nobody's job is safe in this building, including mine." },
          { key: "noEmotion", text: "I'm not going to make emotional decisions in the middle of a season." },
          NO_COMMENT,
        ],
      });
    }
  }
  // Camp opens: what's the goal this year?
  if (date === veteranReportDate(us)) {
    out.push({
      topic: "expect", key: `expect:${RULES.season}`, outlet: "ledger", by: "columnist",
      context: "Veterans reported to training camp today.",
      question: "What are your expectations for this season?",
      options: [
        { key: "title", text: "We expect to win the Super Bowl. Anything less is a disappointment." },
        { key: "playoffs", text: "We want to be in the playoffs. That's the standard here." },
        { key: "building", text: "We're building something. Judge us in a couple of years." },
        { key: "trust", text: `That's up to the players and ${hc(state)}. I trust them.` },
        NO_COMMENT,
      ],
    });
  }
  // Cutdown day.
  if (date === KEY.rosterCutdown) {
    out.push({
      topic: "cuts", key: `cuts:${RULES.season}`, outlet: "sideline", by: "reporter",
      context: "We trimmed the roster to 53 today.",
      question: "Were there any cuts that hurt?",
      options: [
        { key: "toughest", text: "Toughest day of the year. Those guys gave us everything." },
        { key: "best53", text: "We kept the best 53. Simple as that." },
        { key: "willPlay", text: "Some of the players we let go will play in this league for years." },
        { key: "upgrades", text: "We'll keep looking for upgrades every single day." },
        NO_COMMENT,
      ],
    });
  }
  // Season over without a playoff game.
  if (date === KEY.regularSeasonEnd && state.seeds && !state.seeds[TEAM_BY_ID[us].conference].includes(us)) out.push(seasonAsk(state, "missed"));
  // The week before the trade deadline.
  if (date === addDays(KEY.tradeDeadline, -6)) {
    const rec = standings(state)[us];
    out.push({
      topic: "deadline", key: "deadline", outlet: "ledger", by: "columnist",
      context: `The trade deadline is ${shortDate(KEY.tradeDeadline)}. We're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.`,
      question: "Buyers or sellers?",
      options: [
        { key: "buy", text: "Buyers. We're here to win this year." },
        { key: "sell", text: "We have to be realistic about where we are." },
        { key: "steady", text: "We like this group. We're not looking to shake it up." },
        { key: "either", text: "If the right deal is there, we'll make it either way." },
        NO_COMMENT,
      ],
    });
  }
  // A star of ours headed for free agency: midweek in season, and when the tag window opens.
  const midweek = weekday(date) === "Wednesday" && date > KEY.regularSeasonStart && date < KEY.regularSeasonEnd && rng() < 0.35;
  if (midweek || date === KEY.franchiseTagWindowOpens) {
    const expiring = teamPlayerIds(state, us).filter((id) => PLAYER_BY_ID[id] && isPendingFreeAgent(state, id) && !state.negotiations[id]?.status?.startsWith("agreed"))
      .map((id) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 85).sort((a, b) => b[1] - a[1]);
    const [id] = expiring.find(([x]) => !m.asked[`expiring:${x}`]) ?? [];
    if (id) {
      out.push({
        topic: "contract", key: `expiring:${id}`, outlet: "capspace", by: "reporter", player: id,
        context: `${PLAYER_BY_ID[id].position} ${pname(id)}'s contract runs out after this season.`,
        question: `Will ${pname(id)} be here next year?`,
        options: [
          { key: "willPay", text: `We want ${pname(id)} here long term, and we're going to get it done.` },
          { key: "firm", text: "We have a number we believe is fair. We won't negotiate in public." },
          { key: "private", text: "Those talks stay between us and his agent." },
          { key: "focus", text: "Right now everybody's focus is on winning games." },
          { key: "explore", text: "We'll see. Every option is open." },
          NO_COMMENT,
        ],
      });
    }
  }
  // Our quarterback, when it isn't going well.
  if (weekday(date) === "Tuesday" && date > addDays(KEY.regularSeasonStart, 28) && date < KEY.regularSeasonEnd) {
    const qb = depthChart(state, us).QB?.[0];
    const rec = standings(state)[us];
    const line = qb ? seasonTotals(state, "REG")[qb]?.line : undefined;
    if (qb && line && (line.g ?? 0) >= 5 && rec.w < rec.l && ((line.int ?? 0) >= (line.passTd ?? 0) || rng() < 0.3)) {
      out.push({
        topic: "qb", key: `qb:${qb}`, outlet: "ledger", by: "columnist", player: qb,
        context: `${pname(qb)} has ${line.passTd ?? 0} TD and ${line.int ?? 0} INT, and we're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.`,
        question: `Is ${pname(qb)} your quarterback going forward?`,
        options: [
          { key: "backQb", text: `${pname(qb)} is our quarterback. Period.` },
          { key: "evaluate", text: "We'll evaluate every position after the season." },
          { key: "lookingQb", text: "Every team in this league is always looking at quarterbacks." },
          { key: "coaches", text: "That's for the coaches to decide, not me." },
          NO_COMMENT,
        ],
      });
    }
  }
  // Free agency plans, the day before the negotiating window.
  if (date === addDays(KEY.negotiatingWindowOpens, -1)) {
    out.push({
      topic: "faPlans", key: "faPlans", outlet: "capspace", by: "columnist",
      context: "The negotiating window opens tomorrow.",
      question: "How aggressive will you be in free agency?",
      options: [
        { key: "aggressive", text: "Very. We want the best players, and we'll pay for them." },
        { key: "draft", text: "We build through the draft. Free agency fills holes." },
        { key: "smart", text: "We'll be smart. No panic signings." },
        { key: "ownFirst", text: "We take care of our own guys first." },
        NO_COMMENT,
      ],
    });
  }
  // Other teams' stars: a tampering trap.
  const requests = Object.entries(trades(state).requests).filter(([id, d]) => d === addDays(date, -1) && state.players[id]?.team && state.players[id].team !== us && PLAYER_BY_ID[id]);
  const window = date >= addDays(KEY.negotiatingWindowOpens, -14) && date < KEY.negotiatingWindowOpens;
  let target: string | undefined = requests[0]?.[0];
  if (!target && window && rng() < 0.15) {
    const pending = TEAMS.filter((t) => t.id !== us).flatMap((t) => teamPlayerIds(state, t.id)).filter((id) => PLAYER_BY_ID[id] && isPendingFreeAgent(state, id))
      .map((id) => [id, marketView(state, id)] as const).filter(([, v]) => v >= 90).sort((a, b) => b[1] - a[1]);
    target = pending.length ? pick(rng, pending.slice(0, 6))[0] : undefined;
  }
  if (target && rng() < 0.6) {
    const team = state.players[target].team!;
    out.push({
      topic: "tamper", key: `tamper:${target}`, outlet: "blitz", by: "columnist", player: target, team,
      context: `${PLAYER_BY_ID[target].position} ${pname(target)} of the ${teamLabel(team)} is the talk of the league.`,
      question: `Would you want ${pname(target)} on your team?`,
      options: [
        { key: "admire", text: "He's a great player. Any team would love to have him." },
        { key: "firstCall", text: "If he ever becomes available, we'll be the first call." },
        { key: "rules", text: "I can't talk about another team's player. You know that." },
        { key: "joke", text: "I'd love to have him. On my fantasy team." },
        NO_COMMENT,
      ],
    });
  }
  // Draft season: we're linked to a prospect.
  const mock = state.draft?.mocks[0];
  if (mock && mock.date === date && date >= KEY.scoutingCombineStart) {
    const i = mock.teams.indexOf(us);
    if (i >= 0 && i < 40) {
      const p = draftClass(state.seed).byId[mock.players[i]];
      out.push({
        topic: "prospect", key: `prospect:${p.id}`, outlet: "sentinel", by: "draft", prospect: p.id,
        context: `${mock.analyst}'s new mock has us taking ${p.position} ${p.name} (${schoolName(p.school)}) at No. ${i + 1}.`,
        question: `Is ${p.name} your guy?`,
        options: [
          { key: "praise", text: `${last(p.name)} is a special player. We'd be lucky to get him.` },
          { key: "smoke", text: "We're looking hard at a lot of positions. Quarterback included." },
          { key: "never", text: "We never talk about the draft before the draft." },
          { key: "bpa", text: "We'll take the best player on our board. Period." },
          NO_COMMENT,
        ],
      });
    }
  }
  return out.filter((a) => !m.asked[a.key]);
}

function seasonAsk(state: GameState, how: "champion" | "eliminated" | "missed"): Ask {
  const rec = standings(state)[state.userTeam];
  return {
    topic: "season", key: `season:${RULES.season}`, outlet: "ledger", by: "columnist",
    context: how === "champion" ? "We won the Super Bowl." : how === "eliminated" ? "Our season ended in the playoffs." : `Our season is over at ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}, out of the playoffs.`,
    question: how === "champion" ? "What's next after a championship?" : "How would you grade this season?",
    options: how === "champion"
      ? [
        { key: "proud", text: "I'm proud of every single person in this building. Enjoy it, then back to work." },
        { key: "dynasty", text: "We want more than one. We're going to run it back." },
        { key: "creditCoach", text: `This belongs to ${hc(state)} and the players.` },
        { key: "creditSelf", text: "We had a plan and we executed it. That's what this is." },
        NO_COMMENT,
      ]
      : [
        { key: "proud", text: "I'm proud of how we competed. We'll be back." },
        { key: "accountable", text: "Not good enough. That starts with me." },
        { key: "bigChanges", text: "Expect changes. This isn't the standard." },
        { key: "steady", text: "We have the right people. Stability wins in this league." },
        NO_COMMENT,
      ],
  };
}

// ---- Answering ----

function teamMorale(state: GameState, delta: number): void {
  for (const id of teamPlayerIds(state, state.userTeam)) {
    const st = state.players[id].status;
    if (st === "active" || st === "camp" || st === "ir") changeMorale(state, id, delta);
  }
}

function fans(state: GameState, delta: number): void {
  state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + delta));
}
function press(state: GameState, delta: number): void {
  state.pressure.media = Math.max(0, Math.min(100, state.pressure.media + delta));
}
function coach(state: GameState, delta: number): void {
  const m = mediaState(state);
  // A strong leader shrugs more of it off.
  const lead = HIDDEN_STAFF[teamStaff(state.userTeam).HC?.id ?? ""]?.leadership ?? 65;
  const scale = delta < 0 ? 1.2 - (lead - 50) / 100 : 1;
  m.coach = Math.max(0, Math.min(100, Math.round((m.coach + delta * scale) * 10) / 10));
}
function echo(state: GameState, days: number, kind: string, q: PressQuestion, extra: { player?: string; amount?: number } = {}): void {
  mediaState(state).echoes.push({ date: addDays(state.date, days), kind, question: q.id, ...extra });
}
function playerMorale(state: GameState, id: string | undefined, delta: number): void {
  if (!id || !PLAYER_BY_ID[id]) return;
  const pr = priorities(id);
  // Proud players take criticism harder; loyal ones take praise to heart.
  changeMorale(state, id, delta < 0 ? delta * (0.7 + pr.ego) : delta * (0.8 + pr.loyalty * 0.5));
}

/** Applies what an answer does. Everything here is hidden from the owner. */
function consequences(state: GameState, q: PressQuestion, key: string, rng: Rng): void {
  const m = mediaState(state);
  const r = () => 0.7 + rng() * 0.6;
  const id = q.player;
  const rec = standings(state)[state.userTeam];
  const losing = rec.w + rec.l >= 3 && rec.w < rec.l;
  switch (`${q.topic}:${key}`) {
    // Losses.
    case "loss:backCoach": coach(state, 8 * r()); fans(state, losing ? -2 : 0); break;
    case "loss:takeBlame": fans(state, 3 * r()); press(state, 3); changeRel(state, q.outlet, 3); coach(state, 3); teamMorale(state, 1); break;
    case "loss:callOut": {
      teamMorale(state, -3 * r()); fans(state, 2); coach(state, 2);
      const leader = teamPlayerIds(state, state.userTeam).filter((x) => PLAYER_BY_ID[x]).sort((a, b) => marketView(state, b) - marketView(state, a))[0];
      if (leader) {
        playerMorale(state, leader, -4);
        if (priorities(leader).ego > 0.5) echo(state, 1 + Math.floor(rng() * 2), "playerUpset", q, { player: leader });
      }
      break;
    }
    case "loss:refs":
      fans(state, 3); changeRel(state, "blitz", 4); changeRel(state, "ledger", -2);
      if (rng() < 0.7) echo(state, 2 + Math.floor(rng() * 3), "fineRefs", q, { amount: 100_000 + Math.round(rng() * 3) * 50_000 });
      break;
    case "loss:changes": coach(state, -15 * r()); teamMorale(state, -4 * r()); fans(state, 4); press(state, 2); echo(state, 1, "coachUpset", q); break;
    // Tickets and attendance.
    case "tickets:invest": fans(state, -1 * r()); coach(state, 1); break;
    case "tickets:market": fans(state, -3 * r()); press(state, -1); changeRel(state, "blitz", -2); changeRel(state, "capspace", 2); break;
    case "tickets:families": fans(state, 2 * r()); press(state, 1); break;
    case "tickets:hear": fans(state, 3 * r()); press(state, 1); changeRel(state, q.outlet, 2); break;
    case "attendance:earn": fans(state, 3 * r()); press(state, 1); break;
    case "attendance:noGiveaways": fans(state, -3 * r()); changeRel(state, "blitz", -3); break;
    case "attendance:prices": fans(state, 3 * r()); press(state, 1); break;
    case "attendance:thanks": fans(state, 1); break;
    // Wins.
    case "win:bold": fans(state, 4); changeRel(state, "blitz", 3); teamMorale(state, 1); m.stances.push({ kind: "playoffs", date: state.date }); break;
    case "win:humble": coach(state, 3); press(state, 1); break;
    case "win:creditCoach": coach(state, 6 * r()); break;
    case "win:creditPlayers": teamMorale(state, 2 * r()); break;
    case "win:creditSelf": fans(state, 1); press(state, -2); changeRel(state, q.outlet, -2); coach(state, -4); echo(state, 1, "hotTakeSelf", q); break;
    // Injuries.
    case "injury:backup": playerMorale(state, q.prospect, 6); fans(state, -1); break;
    case "injury:outside": playerMorale(state, q.prospect, -5); fans(state, 2); break;
    case "injury:wish": playerMorale(state, id, 5); if (id) changeTrust(state, agentFor(id).id, state.userTeam, 3); break;
    case "injury:optimistic":
      if (id && state.players[id].injury?.seasonEnding) { press(state, -3); changeRel(state, q.outlet, -4); echo(state, 2, "doctors", q, { player: id }); } else fans(state, 1);
      break;
    // Contracts.
    case "contract:willPay": {
      if (!id) break;
      const style = agentFor(id).style;
      const lev = (style === "leaker" || style === "hardball" ? 0.05 : 0.03) * r();
      m.leverage[id] = Math.min(0.08, (m.leverage[id] ?? 0) + lev);
      const neg = state.negotiations[id];
      if (neg?.status === "open" && neg.team === state.userTeam) {
        neg.floor *= 1 + lev;
        neg.ask *= 1 + lev * 0.8;
      }
      playerMorale(state, id, 6); fans(state, 3); changeTrust(state, agentFor(id).id, state.userTeam, 3);
      m.stances.push({ kind: "willPay", date: state.date, player: id });
      break;
    }
    case "contract:firm":
      if (!id) break;
      changeTrust(state, agentFor(id).id, state.userTeam, agentFor(id).style === "relationship" ? -8 : -4);
      playerMorale(state, id, -3); press(state, 1); if (marketView(state, id) >= 88) fans(state, -2);
      break;
    case "contract:private": changeRel(state, q.outlet, -1); if (id) changeTrust(state, agentFor(id).id, state.userTeam, 2); break;
    case "contract:teamFirst":
      if (!id) break;
      playerMorale(state, id, -8 * r()); teamMorale(state, -1); changeTrust(state, agentFor(id).id, state.userTeam, -8);
      fans(state, state.players[id].holdout ? 2 : -1);
      echo(state, 1 + Math.floor(rng() * 2), "agentFires", q, { player: id });
      break;
    case "contract:explore":
      if (!id) break;
      playerMorale(state, id, -10 * r()); changeTrust(state, agentFor(id).id, state.userTeam, -6); fans(state, -2);
      if (!trades(state).block.includes(id)) trades(state).block.push(id);
      break;
    case "contract:focus": playerMorale(state, id, 1); coach(state, 2); break;
    // The quarterback.
    case "qb:backQb": playerMorale(state, id, 7); coach(state, 2); fans(state, -2); break;
    case "qb:evaluate": playerMorale(state, id, -6 * r()); fans(state, 2); break;
    case "qb:lookingQb": {
      playerMorale(state, id, -5 * r()); fans(state, 2);
      const c = state.college;
      if (c) {
        const dc = draftClass(state.seed);
        const qb = Object.keys(c.hype).filter((x) => dc.byId[x]?.position === "QB").sort((a, b) => c.hype[b] - c.hype[a])[0];
        if (qb) c.hype[qb] = Math.round((c.hype[qb] + 0.5) * 10) / 10;
      }
      if (priorities(id ?? "").ego > 0.5) echo(state, 1 + Math.floor(rng() * 2), "playerUpset", q, { player: id });
      break;
    }
    case "qb:coaches": coach(state, 3); break;
    // Free agency.
    case "faPlans:aggressive": fans(state, 4); changeRel(state, "capspace", -1); changeRel(state, "blitz", 2); break;
    case "faPlans:draft": fans(state, -2); coach(state, 2); changeRel(state, "sentinel", 2); break;
    case "faPlans:smart": changeRel(state, "capspace", 2); break;
    case "faPlans:ownFirst":
      for (const x of teamPlayerIds(state, state.userTeam)) if (isPendingFreeAgent(state, x)) changeMorale(state, x, 3);
      fans(state, 1);
      break;
    // Expectations and cuts.
    case "expect:title": fans(state, 4); coach(state, -2); changeRel(state, "blitz", 2); m.stances.push({ kind: "playoffs", date: state.date }); break;
    case "expect:playoffs": fans(state, 2); break;
    case "expect:building": fans(state, -3); coach(state, 4); break;
    case "expect:trust": coach(state, 3); teamMorale(state, 1); break;
    case "cuts:toughest": teamMorale(state, 1); fans(state, 1); break;
    case "cuts:best53": coach(state, 2); break;
    case "cuts:willPlay": changeRel(state, q.outlet, 1); break;
    case "cuts:upgrades": teamMorale(state, -2 * r()); fans(state, 1); break;
    // Trade rumors.
    case "rumor:untouchable":
      playerMorale(state, id, 5);
      if (id) {
        trades(state).block = trades(state).block.filter((x) => x !== id);
        m.stances.push({ kind: "untouchable", date: state.date, player: id });
      }
      break;
    case "rumor:listen": playerMorale(state, id, -5 * r()); if (id && !trades(state).block.includes(id)) trades(state).block.push(id); break;
    case "rumor:love": playerMorale(state, id, 2); break;
    case "rumor:askGm": changeRel(state, q.outlet, -1); break;
    // Signings.
    case "signing:cornerstone": playerMorale(state, id, 5); fans(state, 3); echo(state, 2, "capTake", q, { player: id }); break;
    case "signing:value": changeRel(state, "capspace", 2); break;
    case "signing:scouts": coach(state, 3); break;
    case "signing:noObject": {
      fans(state, 4); changeRel(state, "blitz", 3); changeRel(state, "capspace", -3);
      // Every agent with a client in talks with us heard that.
      for (const n of Object.values(state.negotiations)) {
        if (n.team === state.userTeam && n.status === "open") {
          m.leverage[n.player] = Math.min(0.08, (m.leverage[n.player] ?? 0) + 0.02);
          n.floor *= 1.02;
          n.ask *= 1.02;
        }
      }
      break;
    }
    // Releases and trades.
    case "release:thank": case "trade:thank": fans(state, 1); teamMorale(state, 1); if (id) changeTrust(state, agentFor(id).id, state.userTeam, 4); break;
    case "release:business": case "trade:business": teamMorale(state, -1); press(state, 1); break;
    case "release:criticize": case "trade:criticize": {
      if (!id) break;
      const agent = agentFor(id);
      changeTrust(state, agent.id, state.userTeam, -10);
      // His agent's other clients on our roster hear about it.
      for (const x of teamPlayerIds(state, state.userTeam)) if (x !== id && agentFor(x).id === agent.id) changeMorale(state, x, -4);
      teamMorale(state, -1); fans(state, 1);
      echo(state, 1 + Math.floor(rng() * 2), "firesBack", q, { player: id });
      break;
    }
    case "release:depth": coach(state, 2); fans(state, -1); break;
    case "trade:better": case "trade:allIn": fans(state, key === "allIn" ? 3 : 2); echo(state, 1, "hotTakeTrade", q); break;
    // The draft.
    case "draft:topBoard": playerMorale(state, q.prospect, 6); coach(state, 1); break;
    case "draft:process": coach(state, 2); break;
    case "draft:mocks": for (const o of MEDIA.filter((x) => x.grader)) changeRel(state, o.id, -4); changeRel(state, "sentinel", -3); fans(state, 2); break;
    case "draft:threeYears": changeRel(state, q.outlet, 1); break;
    case "draft:gmCall": playerMorale(state, q.prospect, -2); changeRel(state, q.outlet, -1); break;
    // The deadline.
    case "deadline:buy": fans(state, losing ? -1 : 4); m.stances.push({ kind: "noSell", date: state.date }); break;
    case "deadline:sell": fans(state, -4); teamMorale(state, -3 * r()); coach(state, -4); break;
    case "deadline:steady": teamMorale(state, 2); coach(state, 3); break;
    case "deadline:either": break;
    // The coach.
    case "coach:fullSupport": coach(state, 12); fans(state, losing ? -3 : 0); press(state, -1); break;
    case "coach:endOfSeason": coach(state, -10 * r()); teamMorale(state, -2); fans(state, 1); break;
    case "coach:noOneSafe": coach(state, -14 * r()); teamMorale(state, -3); fans(state, 4); echo(state, 1, "coachUpset", q); break;
    case "coach:noEmotion": coach(state, 2); break;
    // Tampering.
    case "tamper:admire":
      fans(state, 2);
      if (rng() < 0.4) echo(state, 3 + Math.floor(rng() * 4), "fineTamper", q, { player: id, amount: 50_000 + Math.round(rng() * 2) * 50_000 });
      break;
    case "tamper:firstCall": {
      fans(state, 4);
      if (q.team) {
        const talks = (trades(state).talks[q.team] ??= { strikes: 0 });
        talks.strikes += 1;
      }
      if (rng() < 0.8) echo(state, 3 + Math.floor(rng() * 4), "fineTamper", q, { player: id, amount: 150_000 + Math.round(rng() * 3) * 50_000 });
      break;
    }
    case "tamper:rules": changeRel(state, q.outlet, -1); break;
    case "tamper:joke": changeRel(state, "blitz", 3); if (rng() < 0.15) echo(state, 4, "fineTamper", q, { player: id, amount: 50_000 }); break;
    // Prospects.
    case "prospect:praise": if (q.prospect && state.college) state.college.hype[q.prospect] = Math.round((state.college.hype[q.prospect] + 1.2 * r()) * 10) / 10; changeRel(state, "sentinel", 2); break;
    case "prospect:smoke": {
      const c = state.college;
      if (!c) break;
      const dc = draftClass(state.seed);
      const qb = Object.keys(c.hype).filter((x) => dc.byId[x]?.position === "QB" && !state.draft?.made.some((d) => d.player === x)).sort((a, b) => c.hype[b] - c.hype[a])[0];
      if (qb) c.hype[qb] = Math.round((c.hype[qb] + 0.8 * r()) * 10) / 10;
      break;
    }
    case "prospect:never": case "prospect:bpa": changeRel(state, q.outlet, key === "bpa" ? 1 : 0); break;
    // The season.
    case "season:proud": coach(state, 3); teamMorale(state, 2); fans(state, losing ? -2 : 2); break;
    case "season:accountable": fans(state, 3); press(state, 3); changeRel(state, q.outlet, 2); break;
    case "season:bigChanges": coach(state, -15); teamMorale(state, -3); fans(state, 3); echo(state, 1, "coachUpset", q); break;
    case "season:steady": coach(state, 8); fans(state, losing ? -4 : 1); break;
    case "season:dynasty": fans(state, 5); changeRel(state, "blitz", 3); break;
    case "season:creditCoach": coach(state, 8); break;
    case "season:creditSelf": coach(state, -6); press(state, -2); changeRel(state, q.outlet, -3); break;
    default:
      // No comment, and questions left unanswered.
      changeRel(state, q.outlet, -2 * r());
      if (q.topic === "contract" || q.topic === "loss" || q.topic === "coach") press(state, -1);
  }
}

/** The owner answers a question (or it lapses). Files the story and sets the hidden effects in motion. */
export function answerQuestion(state: GameState, qid: string, index: number): string | null {
  const m = mediaState(state);
  const q = m.questions.find((x) => x.id === qid);
  if (!q || q.answer !== undefined) return "That question has already been handled.";
  const opt = index >= 0 ? q.options[index] : undefined;
  if (index >= 0 && !opt) return "Pick one of the answers.";
  q.answer = index;
  q.answeredOn = state.date;
  const rng = rngFor(state.seed, `press:${q.id}:${index}`);
  consequences(state, q, opt?.key ?? "noComment", rng);
  ownerStory(state, q, opt);
  return null;
}

function ownerStory(state: GameState, q: PressQuestion, opt: PressOption | undefined): void {
  const outlet = MEDIA_BY_ID[q.outlet];
  const owner = state.ownerName;
  const team = teamLabel(state.userTeam);
  const quiet = !opt || opt.key === "noComment";
  addStory(state, {
    outlet: q.outlet, by: q.by, kind: "owner", teams: [state.userTeam], players: q.player && PLAYER_BY_ID[q.player] ? [q.player] : undefined,
    prospects: q.prospect && !PLAYER_BY_ID[q.prospect] ? [q.prospect] : undefined,
    headline: quiet ? `${nick(state.userTeam)} owner declines to comment` : `${owner}: "${opt!.text.length > 70 ? `${opt!.text.slice(0, 67).replace(/\s+\S*$/, "")}..."` : `${opt!.text}"`}`,
    body: `${q.context} Asked by ${outlet.name}'s ${q.by} "${q.question}", ` +
      (quiet ? `${owner}, who owns the ${team}, declined to comment.` : `${owner}, who owns the ${team}, said: "${opt!.text}"`),
  });
}

// ---- Later consequences ----

function runEcho(state: GameState, e: { kind: string; question: string; player?: string; amount?: number }): void {
  const m = mediaState(state);
  const us = state.userTeam;
  const owner = state.ownerName;
  const rng = rngFor(state.seed, `echo:${e.question}:${e.kind}`);
  const p = e.player;
  switch (e.kind) {
    case "fineRefs": case "fineTamper": {
      const amount = e.amount ?? 100_000;
      const reason = e.kind === "fineRefs" ? "public criticism of game officials" : `comments about ${p ? pname(p) : "another team's player"}, a violation of the league's anti-tampering policy`;
      m.fines.push({ date: state.date, amount, reason });
      fans(state, e.kind === "fineRefs" ? 1 : 0);
      send(state, "league", "League Office", "Fine notice",
        `The league has fined you ${money(amount)} for ${reason}. The fine is charged to the club's accounts and does not count against the salary cap.`);
      news(state, `The league fines ${teamLabel(us)} owner ${owner} ${money(amount)} for ${e.kind === "fineRefs" ? "criticizing officials" : "tampering comments"}`);
      addStory(state, {
        outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [us], players: p ? [p] : undefined,
        headline: `League fines ${nick(us)} owner ${owner} ${money(amount)}`,
        body: `The league fined ${owner} ${money(amount)} for ${reason}. ` +
          (e.kind === "fineTamper" && p ? `The ${nick(state.players[p]?.team ?? us)} are said to have complained to the league office.` : "The league doesn't comment on officiating complaints beyond the fine."),
      });
      break;
    }
    case "playerUpset": case "firesBack": case "agentFires": {
      if (!p || !PLAYER_BY_ID[p]) break;
      const mad = morale(state, p) < 55;
      const agent = agentFor(p);
      const quote = e.kind === "agentFires"
        ? `"My client has given everything to that organization. Those comments were disappointing, and we'll remember them," said ${agent.name}, ${last(pname(p))}'s agent.`
        : e.kind === "firesBack"
          ? `"I heard what was said. I'll let my play answer it," ${pname(p)} said. ${mad ? "People close to him say he was stung." : ""}`
          : `"I took it personally. I think we all did," ${pname(p)} said of the owner's comments. ${mad ? "Teammates were quieter, but nobody defended the remarks." : "He added that the locker room would respond the right way."}`;
      addStory(state, {
        outlet: "sideline", by: MEDIA_BY_ID.sideline.reporter, kind: "interview", teams: [us], players: [p],
        headline: e.kind === "agentFires" ? `${pname(p)}'s agent fires back at ${nick(us)} owner` : `${pname(p)} responds to owner's comments`,
        body: quote,
      });
      if (agentHidden(agent.id).leak > 0.4 && e.kind !== "firesBack") changeRel(state, "sideline", -1);
      break;
    }
    case "coachUpset": {
      const name = hc(state);
      if (m.coach < 50) {
        send(state, "staff", `${name}, head coach`, "Your comments",
          rng() < 0.5
            ? "I saw what you said to the press. I'd appreciate hearing things like that from you first, not from a reporter. The players read everything."
            : "The guys were asking me about your comments today. I told them to focus on the work. It would help if we were on the same page in public.");
      }
      addStory(state, {
        outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "trend", teams: [us],
        headline: `Big Lou: ${nick(us)} owner just put ${last(name)} on notice`,
        body: `"When the owner talks like that, everybody in the building hears it," Big Lou Marchetti said. "That's either a wake-up call or the beginning of the end for ${last(name)}." Kara Voss: "Or it's a guy who didn't have a better answer."`,
      });
      break;
    }
    case "doctors":
      addStory(state, {
        outlet: "sideline", by: MEDIA_BY_ID.sideline.insider, kind: "injury", teams: [us], players: p ? [p] : undefined,
        headline: `Owner's timeline on ${p ? pname(p) : "injured star"} doesn't match the medical`,
        body: `Despite ${owner}'s optimism, people familiar with the diagnosis say ${p ? pname(p) : "the player"} is not expected back this season. The team declined further comment.`,
      });
      break;
    case "capTake": case "hotTakeSelf": case "hotTakeTrade": {
      const warm = state.pressure.fans >= 55;
      addStory(state, {
        outlet: e.kind === "capTake" ? "capspace" : "blitz", by: e.kind === "capTake" ? MEDIA_BY_ID.capspace.columnist : MEDIA_BY_ID.blitz.columnist,
        kind: "trend", teams: [us], players: p ? [p] : undefined,
        headline: e.kind === "capTake" ? `Brandt: the ${nick(us)} owner is selling, but is anyone buying?` : warm ? `Big Lou: say what you want, the ${nick(us)} owner has guts` : `Big Lou: the ${nick(us)} owner needs to stop talking`,
        body: e.kind === "capTake"
          ? `"Calling someone a cornerstone is easy. The cap sheet in three years is the hard part," Leo Brandt wrote.`
          : warm ? `"Fans love it. You want an owner who wants to win," Big Lou Marchetti said.` : `"Every time he opens his mouth it's another headline. Let the football people talk," Big Lou Marchetti said.`,
      });
      break;
    }
  }
}

/** Public stances that come due. */
function resolveStances(state: GameState): void {
  const m = mediaState(state);
  const us = state.userTeam;
  for (const s of m.stances) {
    if (s.resolved) continue;
    const age = daysBetween(s.date, state.date);
    if (s.kind === "untouchable" && s.player) {
      if (state.players[s.player]?.team !== us && (state.trades?.log ?? []).some((t) => t.date >= s.date && t.teams.includes(us) && [...t.send[0], ...t.send[1]].some((a) => a.kind === "player" && a.id === s.player))) {
        s.resolved = true;
        for (const o of MEDIA) changeRel(state, o.id, -5);
        teamMorale(state, -3); fans(state, -3);
        addStory(state, {
          outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "owner", teams: [us], players: [s.player],
          headline: `So much for "not going anywhere"`,
          body: `On ${shortDate(s.date)}, ${state.ownerName} said ${pname(s.player)} wasn't going anywhere. Now he's gone. "Players around the league just learned what that owner's word is worth," Big Lou Marchetti said.`,
        });
      } else if (age > 150) s.resolved = true;
    }
    if (s.kind === "willPay" && s.player) {
      const signed = state.signings.some((x) => x.player === s.player && x.team === us && x.date >= s.date);
      const gone = state.players[s.player]?.team !== us;
      if (signed) {
        s.resolved = true;
        fans(state, 2);
      } else if (gone) {
        s.resolved = true;
        fans(state, -6); press(state, -3);
        for (const o of MEDIA) changeRel(state, o.id, -2);
        addStory(state, {
          outlet: "capspace", by: MEDIA_BY_ID.capspace.columnist, kind: "owner", teams: [us], players: [s.player],
          headline: `The ${nick(us)} promised to pay ${pname(s.player)}. They didn't.`,
          body: `"We're going to get it done," ${state.ownerName} said on ${shortDate(s.date)}. ${pname(s.player)} is no longer with the team.`,
        });
      } else if (state.date > addDays(KEY.newLeagueYear, 30)) s.resolved = true;
    }
    if (s.kind === "playoffs" && state.date === addDays(KEY.regularSeasonEnd, 1)) {
      s.resolved = true;
      const made = state.seeds?.[TEAM_BY_ID[us].conference].includes(us);
      fans(state, made ? 5 : -8);
      if (!made) {
        press(state, -4);
        addStory(state, {
          outlet: "blitz", by: MEDIA_BY_ID.blitz.columnist, kind: "owner", teams: [us],
          headline: `Remember when the ${nick(us)} owner called them a Super Bowl team?`,
          body: `The ${nick(us)} missed the playoffs. "He said it, not me," Big Lou Marchetti said. "Fans remember that stuff."`,
        });
      }
    }
    if (s.kind === "noSell" && state.date === addDays(KEY.tradeDeadline, 1)) {
      s.resolved = true;
      const sold = (state.trades?.log ?? []).some((t) => t.date >= s.date && t.teams.includes(us) &&
        t.send[t.teams[0] === us ? 0 : 1].some((a) => a.kind === "player" && marketView(state, a.id) >= 84));
      if (sold) {
        fans(state, -5);
        addStory(state, {
          outlet: "ledger", by: MEDIA_BY_ID.ledger.columnist, kind: "owner", teams: [us],
          headline: `"Buyers," the ${nick(us)} owner said. Then they sold.`,
          body: `A week after promising to buy, the ${nick(us)} moved a starter at the deadline. The fan base noticed.`,
        });
      }
    }
  }
  if (m.stances.length > 40) m.stances = m.stances.filter((s) => !s.resolved).concat(m.stances.filter((s) => s.resolved).slice(-10));
}

/** The head coach's faith in the owner shows up in the building. */
function coachWeekly(state: GameState): void {
  if (weekday(state.date) !== "Tuesday") return;
  const m = mediaState(state);
  m.coach += (60 - m.coach) * 0.04;
  if (m.coach < 30 && !(m.asked["coachTalk"] && daysBetween(m.asked["coachTalk"], state.date) < 28)) {
    m.asked["coachTalk"] = state.date;
    teamMorale(state, -2);
    send(state, "staff", `${hc(state)}, head coach`, "Can we talk?",
      "I want to be straight with you. Between what's been said in public and what I'm hearing from the players, it feels like we're not on the same page. " +
      "I can coach through a lot, but the room needs to know ownership and the staff are together.");
  }
}

// ---- The day ----

export function openQuestions(state: GameState): PressQuestion[] {
  return (state.media?.questions ?? []).filter((q) => q.answer === undefined);
}

/** End of the day: earlier answers come back around, stale questions lapse, and the press asks about today. */
export function pressDaily(state: GameState): void {
  const m = mediaState(state);
  const due = m.echoes.filter((e) => e.date <= state.date);
  m.echoes = m.echoes.filter((e) => e.date > state.date);
  for (const e of due) runEcho(state, e);
  for (const q of openQuestions(state)) if (q.expires <= state.date) answerQuestion(state, q.id, -1);
  resolveStances(state);
  coachWeekly(state);
  if (state.date >= addDays(KEY.draftStart, 3)) return;
  const rng = rngFor(state.seed, `press:${state.date}`);
  const asks = candidates(state, rng);
  if (!asks.length || openQuestions(state).length >= 3) return;
  const a = asks[0];
  m.asked[a.key] = state.date;
  const outlet = MEDIA_BY_ID[a.outlet];
  const q: PressQuestion = {
    id: `q-${state.date}-${m.questions.length}`, date: state.date, expires: addDays(state.date, ANSWER_DAYS),
    outlet: a.outlet, by: outlet[a.by], topic: a.topic, context: a.context, question: a.question, options: a.options,
    player: a.player, team: a.team, prospect: a.prospect,
  };
  // Older history drops off the end.
  m.questions.unshift(q);
  send(state, "media", `${q.by}, ${outlet.name}`, "Request for comment", `${a.context}\n\n"${a.question}"\n\nAnswer on the Media page by ${shortDate(q.expires)}, or the team will decline to comment.`);
}
