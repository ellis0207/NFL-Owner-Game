// Game stories: the result, read through whatever made it news. Slots: W and L
// (winner and loser, see teamSlots), score, margin, label, where, venue,
// weather, night, deficit, changes, turning, star and lstar (playerSlots plus
// "day"), hurt, heat, wRun, lRun, sbNumber; US and THEM for the beat; tag.*.
import { always, on, type FamilyContent } from "../angles";

export const GAME: FamilyContent = {
  family: "game",
  formats: ["recap", "column", "hottake", "analytics", "film", "notebook"],
  lede: {
    news: [
      "<tag.tie?Neither team could find a winner in the {label} meeting between the {W.full} and the {L.full}, who settled for a {ws}-{ls} tie.><!tag.tie?The {W.full} {@verbWin} the {L.full} {score} {where}<tag.post? in the {label} round>.>",
      "<tag.tie?{ws}-{ls}, and nobody went home happy: the {W.nick} and {L.nick} played to a tie.><!tag.tie?The {W.full} [beat|got past|took care of] the {L.full} {score} {where} on {label} of the season<tag.post?'s playoffs>.>",
    ],
    analysis: [
      "<!tag.tie?The {W.nick}' {score} win over the {L.nick} [looked one way on the scoreboard and another in the numbers|came down to a handful of high-leverage snaps|was decided by efficiency, not volume].><tag.tie?A tie is the rarest result in football, and the numbers say the {W.nick} and {L.nick} earned it.>",
      "[Strip out garbage time and|Look past the final score of {score} and] <!tag.tie?the {W.nick}' edge over the {L.nick} shows up where it usually does: early downs and turnovers.><tag.tie?neither side could separate.>",
    ],
    opinion: [
      "{@open.column} <!tag.tie?The {W.nick} beat the {L.nick} {score}, and it told us more about both teams than any game so far.><tag.tie?A tie between the {W.nick} and {L.nick}, and somehow it settled nothing.>",
    ],
    beat: [
      "<US.won?The {US.nick} [beat|got past|took care of] the {THEM.nick} {score} {where}, and the locker room [knew what it meant|was loose afterward|wasn't celebrating for long].><!US.won?<!tag.tie?The {US.nick} lost {score} to the {THEM.nick} {where}, and the mood afterward was [quiet|tense|businesslike].><tag.tie?The {US.nick} and {THEM.nick} played to a {ws}-{ls} tie.>>",
      "<US.won?Another week, another result to build on: {US.nick} {ws}, {THEM.nick} {ls}.><!US.won?<!tag.tie?{THEM.nick} {ws}, {US.nick} {ls}. The film session this week won't be fun.><tag.tie?A tie, {ws}-{ls}, and nobody in the building knew quite how to feel.>>",
    ],
  },
  details: [
    "<weather?{weather} ><star?{star.day}. ><lstar?For the {L.nick}, {lstar.day}. ><!tag.post?<!tag.tie?The {W.nick} are {W.rec}<wRun? and have won {wRun} straight>; the {L.nick} fall to {L.rec}<lRun?, their {ord:lRun} loss in a row>.>><tag.post?<!tag.sb?The {W.nick} move on; the {L.nick}' season is over.>><hurt? Injuries: {hurt}.>",
  ],
  quote: (f) => {
    if (f.tags.tie) return null;
    const m = Number(f.tags.margin);
    const lossSide = !!f.tags.ours && (f.slots.L as { id: string }).id === (f.slots.US as { id?: string } | undefined)?.id;
    const winner = (f.slots.W as { coach: string }).coach, loser = (f.slots.L as { coach: string }).coach;
    if (lossSide || (f.id.length + m) % 2 === 0) return { bank: m >= 21 ? "q.blowout" : m <= 3 ? "q.closeLoss" : "q.loss", who: loser, role: `the ${(f.slots.L as { nick: string }).nick} coach` };
    return { bank: m >= 21 ? "q.rout" : m <= 3 ? "q.close" : "q.win", who: winner, role: `the ${(f.slots.W as { nick: string }).nick} coach` };
  },
  bank: {
    verbWin: ["beat", "defeated", "topped", "handled", "got past"],
    "verbWin.hot": ["beat", "manhandled", "took apart", "outclassed", "stunned"],
    "q.win": [
      "We found a way. That's what good teams do in this league.", "Proud of the guys. We played complementary football for four quarters.",
      "It wasn't always pretty, but nobody hands these out. We'll take it.", "That's a credit to the players. They prepared all week and it showed.",
      "We're not where we want to be yet, but we're getting there.", "Our defense set the tone and the offense did enough.",
    ],
    "q.rout": ["We played about as clean a game as you can play. Now we have to do it again.", "Everybody ate today. The message is: don't read the clippings.", "When we play like that, we're hard to beat. The trick is doing it every week."],
    "q.close": ["Those are the ones you remember. Our guys never blinked.", "Heart rate's still up. But that's a resilient group in that locker room.", "Games like that build a team. Nobody panicked."],
    "q.loss": ["We have to coach it better, and that starts with me.", "Turnovers killed us. You can't do that against a good football team.", "It's a long season. We'll look at the tape and get it fixed.", "We had our chances. We didn't make the plays when it mattered.", "Credit to them. They were the better team today."],
    "q.blowout": ["That's not who we are. I told the team that, and I'll tell you that.", "Embarrassing. There's no other word for it. Everybody in that room owns it, me first.", "We got beat in every phase. No excuses."],
    "q.closeLoss": ["One or two plays. That's the NFL. It hurts because we were right there.", "Tough way to lose. I'm not going to make excuses; we have to finish.", "We'll learn from it. We have to, because that one stings."],
  },
  angles: [
    {
      id: "plain", when: always(0.4),
      head: ["{W.nick} beat {L.nick} {score}", "{W.nick} [handle|top|get past] {L.nick} {score}", "{W.nick} [improve to|move to] {W.rec} with {score} win over {L.nick}"],
      take: ["What the {W.nick}' win over the {L.nick} really says", "Don't overlook the {W.nick} win"],
      para: ["[It was a workmanlike day for|There was nothing flashy about the effort from] the {W.nick}, who [controlled the line of scrimmage|did the little things|avoided the big mistake] and [let the scoreboard take care of itself|never let the {L.nick} settle in]."],
    },
    {
      id: "tie", when: on("tie", 5),
      head: ["{W.nick} and {L.nick} play to a {ws}-{ls} tie", "Nobody wins: {W.nick}, {L.nick} tie {ws}-{ls}"],
      take: ["A tie between the {W.nick} and {L.nick} is the worst of both worlds"],
      para: ["Overtime settled nothing. [Both teams had chances to end it.|Neither offense could finish a drive when it counted.] A tie counts as half a win in the standings, which by December could matter more than anyone wants to admit."],
    },
    {
      id: "upset", when: on("upset", 3),
      head: ["Upset: {W.nick} stun {L.nick} {score}", "{W.nick} shock {L.nick}, {score}", "Nobody saw this coming: {W.nick} {score} over {L.nick}"],
      take: ["The {L.nick} just lost to the {W.nick}. Let that sink in", "Don't call the {W.nick}' win over the {L.nick} a fluke", "The {L.nick} have a problem nobody wanted to talk about"],
      para: ["Nobody gave the {W.nick} much of a chance against a {L.nick} team that came in [rolling|with the better record|as the clear favorite]. [It didn't matter.|The {W.nick} didn't read the previews.|They played like they hadn't heard.]"],
    },
    {
      id: "comeback", when: (t) => (Number(t.deficit) >= 14 ? 4 : Number(t.deficit) >= 10 ? 2 : 0),
      head: ["{W.nick} rally from {deficit} down to stun {L.nick}", "Comeback: {W.nick} erase {deficit}-point hole, beat {L.nick} {score}", "{W.nick} come back from {deficit} down to beat {L.nick}"],
      take: ["The {L.nick} let a {deficit}-point lead get away, and that's on the coaching", "The {W.nick} comeback said everything about that locker room"],
      para: ["The {W.nick} were down {deficit} at one point, and [plenty of fans had already headed for the exits|the broadcast had started talking about next week|it looked like a lost afternoon]. [They kept chipping away.|One stop led to another, then a score, then another.|Nobody on that sideline flinched.]<turning? The swing came with {turning}.>"],
    },
    {
      id: "rout", when: (t) => (Number(t.margin) >= 28 ? 3 : Number(t.margin) >= 21 ? 2 : 0),
      head: ["{W.nick} rout {L.nick} {score}", "{W.nick} roll past {L.nick} {score}", "{W.nick} bury {L.nick}, {score}"],
      take: ["The {L.nick} were embarrassed, and it's time to ask hard questions", "The {W.nick} just sent a message to the whole league"],
      para: ["It was over [by halftime|early|before the fourth quarter]. The {W.nick} [scored on drive after drive|dominated both lines|forced mistakes and cashed them in], and the {L.nick} [never found an answer|looked a step slow all day|had no response]."],
    },
    {
      id: "nailbiter", when: (t) => (Number(t.margin) <= 3 && !t.tie ? 2 : 0),
      head: ["{W.nick} edge {L.nick} {score}", "{W.nick} hold off {L.nick} {score}", "{W.nick} survive {L.nick}, {score}"],
      take: ["The {W.nick} keep winning close games. Is it skill or luck?", "Close losses are piling up for the {L.nick}"],
      para: ["It came down to the final possessions. [One play either way changes everything.|Neither team could pull away.|The margin was a single score all afternoon.]<changes? The lead changed hands {changes} times.>"],
    },
    {
      id: "lateWinner", when: on("late", 3),
      head: ["{W.nick} win it late, {score} over {L.nick}", "Late drama: {W.nick} beat {L.nick} {score}", "{W.nick} take the lead late and beat {L.nick}"],
      take: ["The {W.nick} have a finisher's mentality", "The {L.nick} can't close"],
      para: ["The [decisive|go-ahead|final] score came in the closing minutes, and the {L.nick} [couldn't answer|ran out of time|had one last chance and came up short]."],
    },
    {
      id: "overtime", when: (t) => (t.ot && !t.tie ? 3 : 0),
      head: ["{W.nick} outlast {L.nick} in overtime, {score}", "{W.nick} beat {L.nick} in OT", "Overtime: {W.nick} over {L.nick}"],
      take: ["Overtime games like the {W.nick} win are why we watch"],
      para: ["Sixty minutes wasn't enough. In overtime, the {W.nick} [made the play|got the stop they needed|finally broke through], and the {L.nick} were left wondering about the chances they left on the field."],
    },
    {
      id: "shutout", when: on("shutout", 3),
      head: ["{W.nick} shut out {L.nick}, {ws}-0", "Zero: {W.nick} blank {L.nick}", "{W.nick} defense pitches a shutout against {L.nick}"],
      take: ["The {W.nick} defense is the real thing", "The {L.nick} offense hit rock bottom"],
      para: ["The {L.nick} never scored. Shutouts are rare in this league, and the {W.nick} defense [never gave them a short field|won every key third down|made it look easy]."],
    },
    {
      id: "shootout", when: on("shootout", 2),
      head: ["{W.nick} win a shootout with {L.nick}, {score}", "Points everywhere: {W.nick} {ws}, {L.nick} {ls}", "{W.nick} outscore {L.nick} {score}"],
      take: ["Somebody tell the defenses the game started", "The {W.nick} can win any kind of game"],
      para: ["Defense was optional. The teams combined for {ws} and {ls}, [traded touchdowns into the fourth quarter|punted only a handful of times|kept the scoreboard operator busy all day]."],
    },
    {
      id: "grinder", when: on("defense", 2),
      head: ["{W.nick} grind out a {score} win over {L.nick}", "{W.nick} win a defensive struggle with {L.nick}", "Low-scoring {W.nick} edge {L.nick} {score}"],
      take: ["Ugly wins count too, and the {W.nick} keep getting them"],
      para: ["Points were hard to come by. [Both defenses dominated.|Field position decided it.|Every yard was a fight.] The {W.nick} made one more play than the {L.nick}, and that was enough."],
    },
    {
      id: "streakRun", when: (t) => (Number(t.wStreak) >= 4 ? 3 : Number(t.wStreak) >= 3 ? 1.5 : 0),
      head: ["{W.nick} win {wRun} straight, beat {L.nick} {score}", "{W.nick} stay hot: {wRun} in a row after {score} win", "Streak reaches {wRun} as {W.nick} top {L.nick}"],
      take: ["The {W.nick} have won {wRun} straight. Time to take them seriously"],
      para: ["That's {wRun} wins in a row for the {W.nick}, who [have found an identity|are playing with real confidence|look nothing like the team from September]."],
    },
    {
      id: "skid", when: (t) => (Number(t.lStreak) >= 4 ? 3 : Number(t.lStreak) >= 3 ? 1.5 : 0),
      head: ["{L.nick} drop {ord:lRun} straight in {score} loss to {W.nick}", "The skid reaches {lRun}: {W.nick} beat {L.nick}", "{L.nick} slide continues against {W.nick}"],
      take: ["The {L.nick} have lost {lRun} straight. Something has to change", "How long can the {L.nick} keep doing this?"],
      para: ["The losing has become a habit for the {L.nick}: {lRun} straight now, [and the questions are getting louder|with no obvious fix in sight|and the locker room is running out of answers]."],
    },
    {
      id: "unbeaten", when: on("unbeaten", 3),
      head: ["{W.nick} stay perfect at {W.rec}", "Still unbeaten: {W.nick} beat {L.nick} {score}", "{W.nick} improve to {W.rec} with win over {L.nick}"],
      take: ["Can anyone beat the {W.nick}?", "The {W.nick} are undefeated, and it isn't a fluke"],
      para: ["The {W.nick} still haven't lost. [Nobody's talking about perfection yet, but everyone is thinking it.|At {W.rec}, they're the last unbeaten team standing in the conversation.]"],
    },
    {
      id: "winless", when: on("winless", 3),
      head: ["{L.nick} fall to {L.rec} with loss to {W.nick}", "Still winless: {L.nick} lose again", "{L.nick} drop to {L.rec}"],
      take: ["The {L.nick} are winless, and it's worse than the record", "Is it time to think about the draft for the {L.nick}?"],
      para: ["At {L.rec}, the {L.nick} are still looking for a first win, and the conversation in their market has turned to [the coaching staff|next April's draft|whether anything here is working]."],
    },
    {
      id: "firstWin", when: on("firstWin", 3),
      head: ["Finally: {W.nick} get first win, beat {L.nick} {score}", "{W.nick} break through against {L.nick}", "First win of the season for the {W.nick}"],
      take: ["One win doesn't fix the {W.nick}, but it helps"],
      para: ["After {W.l} losses, the {W.nick} are on the board. [The relief on the sideline was obvious.|Players soaked the coaches afterward.|Nobody pretended it fixed everything.]"],
    },
    {
      id: "snapped", when: on("snapped", 2),
      head: ["{W.nick} hand {L.nick} their first loss", "{W.nick} end the {L.nick}' unbeaten start", "{L.nick} finally lose, {score} to {W.nick}"],
      take: ["The {L.nick} were never as good as their record"],
      para: ["The {L.nick} came in unbeaten. The {W.nick} [didn't care|had a plan for that|found the cracks]."],
    },
    {
      id: "rivalry", when: on("rival", 2.5),
      head: ["{W.nick} win the latest round of the rivalry, {score} over {L.nick}", "{W.nick} take bragging rights from {L.nick}", "Rivalry week: {W.nick} beat {L.nick} {score}"],
      take: ["Beating the {L.nick} means more, and the {W.nick} know it"],
      para: ["Few games mean more to either fan base. This {heat} rivalry [got another chapter|added a new grudge|delivered again], and the {W.nick} will hear about it for months<!tag.ours? in a good way>."],
    },
    {
      id: "division", when: (t) => (t.division && !t.rival ? 1.2 : 0),
      head: ["{W.nick} win a {W.div} matchup with {L.nick}", "{W.nick} top division rival {L.nick}"],
      take: ["Division games decide seasons, and the {W.nick} just won a big one"],
      para: ["It counts twice in the {W.div}: a win for the {W.nick} and a loss for a team they'll be chasing or fending off all season."],
    },
    {
      id: "primetime", when: on("prime", 1.5),
      head: ["{W.nick} win on {night}, {score} over {L.nick}", "{night} lights: {W.nick} beat {L.nick}", "{W.nick} shine under the lights"],
      take: ["The whole country saw the {W.nick} on {night}. What did it see?"],
      para: ["With the whole league watching on {night}, the {W.nick} [rose to it|made their case|put on a show] and the {L.nick} [wilted|never got going|made too many mistakes]."],
    },
    {
      id: "weather", when: on("weather", 2),
      head: ["{W.nick} beat the weather and the {L.nick}, {score}", "Conditions don't stop {W.nick} against {L.nick}"],
      take: ["The {W.nick} won a weather game the old way"],
      para: ["{weather} The conditions shaped everything: [shorter passes, more runs, and a lot of nervous kickers|ball security was the whole game|the team that adjusted first won]."],
    },
    {
      id: "starDay", when: (t) => (t.starDay && !t.rookieStar ? 2 : 0),
      head: ["<star?{star.name} leads {W.nick} past {L.nick}><!star?{W.nick} beat {L.nick} {score}>", "<star?{star.name} carries {W.nick} to {score} win><!star?{W.nick} top {L.nick}>"],
      take: ["<star?{star.name} is the best player on the field every week><!star?The {W.nick} have stars and they showed it>"],
      para: ["<star?It was {star.name}'s day, and the {L.nick} [never figured him out|had no answer|tried everything].><!star?The {W.nick}' stars showed up.>"],
    },
    {
      id: "rookieStar", when: on("rookieStar", 3),
      head: ["<star?Rookie {star.name} stars as {W.nick} beat {L.nick}><!star?{W.nick} beat {L.nick}>", "<star?{star.name}'s breakout powers {W.nick}><!star?{W.nick} win>"],
      take: ["<star?{star.name} looks like a steal already><!star?The {W.nick} rookies are coming>"],
      para: ["<star?{star.name} is a rookie, {star.draft} out of {star.college}, and he played like a veteran.><!star?The {W.nick}' young players stepped up.>"],
    },
    {
      id: "revenge", when: on("revenge", 2.5),
      head: ["<star?{star.name} beats his old team as {W.nick} top {L.nick}><!star?{W.nick} top {L.nick}>", "<star?Revenge game: {star.name}, {W.nick} beat {L.nick}><!star?{W.nick} win>"],
      take: ["<star?The {L.nick} let {star.name} go, and he made them pay><!star?The {L.nick} got a reminder>"],
      para: ["<star?{star.name} used to play for the {L.nick}. He won't admit it meant more, but he [lingered on the field afterward|had a few words for his old sideline|smiled the whole way to the tunnel].><!star?Old teammates met again.>"],
    },
    {
      id: "qbDuel", when: on("qbDuel", 2),
      head: ["Quarterbacks trade blows as {W.nick} beat {L.nick} {score}", "Duel of passers ends with {W.nick} on top"],
      take: ["That quarterback duel is what this league is selling"],
      para: ["Both quarterbacks threw for more than 300 yards, and [the defenses spent the day guessing|neither secondary could keep up|every possession felt like it might score]."],
    },
    {
      id: "hotSeat", when: on("seat", 2.5),
      head: ["{L.nick} lose again, and {L.coach}'s seat gets hotter", "Pressure mounts on {L.coach} after loss to {W.nick}", "{L.nick} fall to {L.rec}; questions about {L.coach} grow"],
      take: ["It's time for the {L.nick} to make a change", "{L.coach} is running out of time"],
      para: ["At {L.rec}, the {L.nick} are [where nobody in the building expected|running out of runway|in danger of losing the locker room], and {L.coach} [deflected questions about his job|said he isn't thinking about his future|insisted the team is close]."],
    },
    {
      id: "race", when: on("race", 2),
      head: ["{W.nick} win a playoff-race showdown with {L.nick}", "Big swing in the playoff race: {W.nick} over {L.nick}"],
      take: ["The {W.nick}-{L.nick} result reshapes the playoff picture"],
      para: ["With the season's last weeks approaching, this one carried playoff weight: the {W.nick} gain ground and own a head-to-head edge, and the {L.nick} have [work to do|less margin for error|to start scoreboard-watching]."],
    },
    {
      id: "playoffs", when: (t) => (t.post && !t.sb ? 4 : 0),
      head: ["{label}: {W.nick} beat {L.nick} {score}", "{W.nick} advance past {L.nick} in the {label} round", "{label}: {W.nick} move on, {L.nick} go home"],
      take: ["The {L.nick}' season ended the way it was always going to", "The {W.nick} are built for January"],
      para: ["Win and keep playing; lose and clean out the locker. The {W.nick} [rose to it|survived it|took control early], and the {L.nick}' season [ends sooner than they hoped|is over|ends with questions]."],
    },
    {
      id: "superBowl", when: on("sb", 10),
      head: ["{W.full} win Super Bowl {sbNumber}, beating the {L.nick} {score}", "Champions: {W.nick} beat {L.nick} in Super Bowl {sbNumber}", "{W.nick} are Super Bowl champions"],
      take: ["How the {W.nick} built a champion", "The {L.nick} were one game short, and it will haunt them"],
      para: ["The {W.nick} are champions of the {season} season. [Confetti fell, coaches cried, and players hugged anyone within reach.|It was the end of a long climb.|For one night, everything they did all year was worth it.] The {L.nick} will spend the offseason [replaying the chances they missed|knowing how close they came]."],
    },
  ],
};
