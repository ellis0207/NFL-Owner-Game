// Player stories: big days and injuries. Performance slots: P (playerSlots),
// T and O (his team and the opponent), day, result, score, yds, td, sacks,
// ints, fgm, age, pay. Injury slots: P, T, injury, weeks, span, next, hit.
import { always, on, type FamilyContent } from "../angles";

const PERF_KIND: Record<string, string> = {
  "perf.pass": "passing", "perf.rush": "rushing", "perf.rec": "receiving", "perf.rush_end": "pass-rushing", "perf.ballhawk": "ball-hawking", "perf.kick": "kicking",
};
export { PERF_KIND };

export const PERFORMANCE: FamilyContent = {
  family: "performance",
  formats: ["report", "analytics", "column", "hottake", "feature", "notebook"],
  lede: {
    news: [
      "{day} in {result} for the {T.nick} against the {O.nick}<score?, {score}>.",
      "{P.pos} {P.name} [had the game of his season|put together a monster day|was everywhere] against the {O.nick}: {day}.",
    ],
    analysis: [
      "{P.name}'s line against the {O.nick} ({day}) [was the most efficient of the week|grades out as one of the best of the season|wasn't empty volume].",
      "[By any measure|By the expected-points math|On a per-play basis], {P.name} was the most valuable player on the field against the {O.nick}.",
    ],
    opinion: ["{@open.column} {P.name} [just reminded everyone who he is|is playing at a different level|deserves more attention than he gets]. {day}."],
    beat: ["{P.name} was the talk of the {T.nick} locker room after {result} over the {O.nick}: {day}."],
    feature: [
      "{P.name} came into the league as {P.draft} out of {P.college}, and he is in his {ord:P.year} season. Against the {O.nick}, {day}.",
      "[Long before the big day against the {O.nick},|Ask anyone who has coached him and they'll tell you the same thing:] {P.name} [was the hardest worker in the building|did it the hard way|had to wait his turn]. {day}.",
    ],
  },
  details: ["<P.line?On the season, {P.name:last} has {P.line}. ><tag.post?It came in the playoffs, where every snap is magnified. >"],
  quote: (f) => ({ bank: Number(f.tags.presence) >= 0.6 ? "pq.loud" : "pq.quiet", who: String((f.slots.P as { name: string }).name), role: `the ${(f.slots.T as { nick: string }).nick} ${(f.slots.P as { pos: string }).pos}` }),
  bank: {
    "kick.report": ["[He'll try to do it again next week.|Next up for the {T.nick} is a chance to build on it.|Expect defensive coordinators to take note.]"],
    "pq.loud": ["I told y'all. Nobody's checking me.", "That's what I do. Write it down.", "Give me the ball and get out of the way.", "I've been saying it. Now everybody sees it.", "It's a statement. To the league, to everybody."],
    "pq.quiet": ["It's about the team. I just did my job.", "Credit to the guys up front. They made it easy.", "We'll enjoy it tonight and get back to work tomorrow.", "I didn't really look at the numbers. We won, that's what matters.", "Coaches put me in good spots. I just had to make the play."],
  },
  angles: [
    {
      id: "plain", when: always(0.5),
      head: ["{P.name} [stars|shines|takes over] for {T.nick} against {O.nick}", "{P.name} [puts on a show|has a monster day|carries the load] against the {O.nick}"],
      take: ["{P.name} deserves more credit than he gets"],
      para: ["It was the kind of [day|performance|afternoon] that [changes how teams game-plan for him|ends up on the season highlight reel|scouts circle on the tape]."],
    },
    {
      id: "inLoss", when: on("lost", 1.2),
      head: ["{P.name}'s big day not enough for {T.nick}", "{P.name} shines in {T.nick} loss"],
      take: ["The {T.nick} wasted a great day from {P.name}"],
      para: ["The bad news for the {T.nick}: it came in {result}. [Great individual days are hard to come by, and wasting one stings.|He did his part; not enough of his teammates did theirs.]"],
    },
    {
      id: "rookie", when: on("rookie", 3),
      head: ["Rookie {P.name} breaks out for {T.nick}", "{T.nick} rookie {P.name} announces himself", "{P.name}, a rookie, steals the show against {O.nick}"],
      take: ["{P.name} is already the steal of the draft", "The {T.nick} found a star in {P.name}"],
      para: ["{P.name} is a rookie, {P.draft} out of {P.college}, and [nobody expected this so soon|the league is taking notice|he's already earning more snaps]."],
    },
    {
      id: "contractYear", when: on("contractYear", 2.5),
      head: ["{P.name} picks a good time for a big day: his contract year", "Contract-year {P.name} drives up his price"],
      take: ["Pay {P.name}. Now.", "{P.name} is going to get very rich this spring"],
      para: ["Timing matters. {P.name} is in the last year of his contract, and every game like this one [adds to the number his agent will ask for|makes the {T.nick}' decision harder|is a reminder of what free agency could look like]."],
    },
    {
      id: "revenge", when: on("revenge", 3),
      head: ["{P.name} burns his old team in {T.nick}' game with {O.nick}", "Revenge game: {P.name} torches {O.nick}"],
      take: ["The {O.nick} let {P.name} go. That looks worse every week"],
      para: ["{P.name} used to play for the {O.nick}. [He said it was just another game. Nobody believed him.|He had that one circled.|His old coaches had a front-row seat.]"],
    },
    {
      id: "ageless", when: on("veteran", 2.5),
      head: ["At {age}, {P.name} still has it", "Ageless {P.name} delivers for {T.nick}"],
      take: ["Stop asking when {P.name} will slow down"],
      para: ["{P.name} is {age}, an age when most players at his position [are long retired|are hanging on|have moved into coaching]. [He isn't most players.|Somebody forgot to tell him.]"],
    },
    {
      id: "nextMan", when: on("backup", 2.5),
      head: ["Backup {P.name} steps in and shines for {T.nick}", "{P.name} makes the most of his chance"],
      take: ["The {T.nick} have a decision to make about {P.name}"],
      para: ["{P.name} wasn't the first name on the {T.nick} depth chart. [He might be now.|He made a case to stay on the field.|Injuries opened the door and he walked through it.]"],
    },
    {
      id: "bargain", when: (t) => (t.bargain && !t.rookie ? 2 : 0),
      head: ["{P.name}, on a {pay} deal, outplays the stars", "The {T.nick}' best bargain: {P.name}"],
      take: ["{P.name} is the best value contract in football"],
      para: ["The {T.nick} are paying {P.name} {pay} this year. [Players making ten times that didn't play this well.|That's a front office win.|His next contract will look very different.]"],
    },
    {
      id: "undrafted", when: (t) => (t.undrafted && !t.rookie ? 1.5 : 0),
      head: ["Undrafted {P.name} keeps proving people wrong", "From undrafted to star: {P.name}"],
      take: ["Thirty-two teams passed on {P.name}. Oops"],
      para: ["Every team passed on {P.name} in the draft. He made a roster anyway, and now [he's doing this|he's one of the reasons the {T.nick} win|nobody remembers he went undrafted]."],
    },
    {
      id: "mvp", when: on("mvp", 2.5),
      head: ["{P.name} makes his MVP case against {O.nick}", "MVP watch: {P.name} keeps rolling"],
      take: ["{P.name} is the MVP, and it isn't close", "Hold on before handing {P.name} the MVP"],
      para: ["The {T.nick} are {T.rec}, and {P.name} is the biggest reason. [The MVP talk is getting louder.|Voters notice games like this.|He's on every short list.]"],
    },
    {
      id: "spotlight", when: on("prime", 1.2),
      head: ["{P.name} owns the spotlight against {O.nick}", "Prime-time {P.name} lights up the {O.nick}"],
      take: ["The whole country just found out about {P.name}"],
      para: ["With the league watching in prime time, {P.name} [delivered|put on a show|made himself a household name]."],
    },
    {
      id: "playoffHero", when: on("post", 4),
      head: ["{P.name} delivers in the playoffs for {T.nick}", "Playoff star: {P.name} carries {T.nick}"],
      take: ["{P.name} is built for January"],
      para: ["Playoff games make legends, and {P.name} [just started building his|added a chapter|showed why the {T.nick} trust him]."],
    },
  ],
};

export const INJURY: FamilyContent = {
  family: "injury",
  formats: ["alert", "report", "analytics", "column", "hottake", "notebook"],
  lede: {
    news: [
      "{P.pos} {P.name} has {an:injury}<tag.camp?, suffered in camp>, according to people familiar with the diagnosis. <tag.season?He is out for the season.><!tag.season?The {T.nick} hope to have him back in {span}.>",
      "The {T.nick} will be without {P.pos} {P.name} <tag.season?for the rest of the season><!tag.season?for {span}> after he [suffered|was diagnosed with] {an:injury}.",
    ],
    analysis: [
      "[Losing|Playing without] {P.name} for {span} changes the {T.nick}' math. <tag.qb?Quarterback absences swing win probability more than any other position.><!tag.qb?The drop-off to the next man up is the real question.>",
    ],
    opinion: ["{@open.column} Losing {P.name}<tag.season? for the season><!tag.season? for {span}> [is a gut punch|could define the {T.nick}' season|exposes a roster built without a plan B]."],
    beat: ["The {T.nick} confirmed {P.name}'s {injury}. <tag.season?His season is over.><!tag.season?The early estimate is {span}.>"],
  },
  details: ["<P.line?{P.name:last} has {P.line} this season. ><next?{next.name} is next on the depth chart.>"],
  angles: [
    { id: "plain", when: always(0.5), head: ["{T.nick} {P.pos} {P.name} out <tag.season?for the season><!tag.season?{span}> with {injury}", "Sources: {P.name} out <tag.season?for the year><!tag.season?{span}> with {injury}"], take: ["The {T.nick} can't afford to lose {P.name}"], para: ["[It's a blow|It's the kind of injury every team dreads|It's bad timing] for a {T.nick} team that [needed him|leaned on him|has little depth behind him]."] },
    { id: "seasonOver", when: on("season", 3), head: ["{T.nick}' {P.name} out for the season", "Season over for {P.name}", "{T.nick} lose {P.name} for the year"], take: ["Losing {P.name} could sink the {T.nick}' season"], para: ["There's no timeline to wait on: {P.name} is done for the season. The {T.nick} [now have to rethink everything|have to find answers internally|may have to look outside the building]."] },
    { id: "qb", when: on("qb", 3), head: ["{T.nick} quarterback {P.name} sidelined <tag.season?for the season><!tag.season?{span}>", "Quarterback crisis: {P.name} hurt"], take: ["Without {P.name}, the {T.nick} are in trouble"], para: ["No injury changes a team like a quarterback injury. <next?It's {next.name}'s offense now, ready or not.><!next?The {T.nick} don't have an obvious answer behind him.>"] },
    { id: "star", when: on("star", 2), head: ["Big blow: {T.nick} star {P.name} hurt", "{T.nick} lose star {P.name} to {injury}"], take: ["Stars get hurt. Good teams survive it. Are the {T.nick} a good team?"], para: ["{P.name} is one of the best players at his position, and teams don't replace that with the next name on the depth chart."] },
    { id: "contractYear", when: on("contractYear", 2), head: ["{P.name}'s injury comes at the worst time: his contract year"], take: ["{P.name}'s injury just cost him money"], para: ["{P.name} is in the last year of his deal, and the injury [complicates his market|hands the {T.nick} leverage they didn't ask for|is the nightmare scenario for any player chasing a payday]."] },
    { id: "nextUp", when: on("next", 1.2), head: ["<next?{next.name} steps in as {T.nick} lose {P.name}><!next?{T.nick} lose {P.name}>"], take: ["<next?Is {next.name} ready? The {T.nick} are about to find out><!next?The {T.nick} need answers>"], para: ["<next?{next.name} gets the first chance to fill in. [He has waited for this.|Coaches like his preparation.|The drop-off is the question nobody wants to answer.]><!next?The depth chart is thin.>"] },
    { id: "bigDeal", when: on("bigDeal", 2), head: ["{T.nick} paying {hit} to a player who can't play: {P.name} hurt"], take: ["The {T.nick} have {hit} sitting in the training room"], para: ["{P.name} counts {hit} against the cap this year, and that money doesn't go away when he's out. [Front offices hate this part of the business.|It limits what the {T.nick} can do to replace him.]"] },
    { id: "push", when: on("push", 2.5), head: ["{P.name}'s injury hits the {T.nick} in the middle of a playoff push"], take: ["The {T.nick}' playoff hopes just took a hit"], para: ["The {T.nick} are {T.rec} and in the hunt. The timing [couldn't be worse|tests every bit of their depth|is the cruelest part]."] },
    { id: "again", when: on("repeat", 2), head: ["{P.name} hurt again, and the questions return"], take: ["Can the {T.nick} keep counting on {P.name}?"], para: ["It's become a pattern. {P.name} has missed time in recent seasons, and every new injury makes it harder to plan around him."] },
    { id: "camp", when: on("camp", 1.5), head: ["Camp injury: {T.nick} lose {P.name} <tag.season?for the year><!tag.season?{span}>"], take: ["The summer injury the {T.nick} feared"], para: ["Training camp is supposed to be about building. Instead the {T.nick} are [reshuffling the depth chart|already playing short-handed|hoping it isn't as bad as it looks]."] },
    { id: "rookie", when: on("rookie", 1.5), head: ["Rookie {P.name}'s first season interrupted by {injury}"], take: ["The {T.nick} need to be careful with {P.name}"], para: ["{P.name} is a rookie, and the {T.nick} had big plans for his development. [They'll be careful with the return.|It sets the learning curve back.]"] },
    { id: "age", when: on("age", 1.5), head: ["At {P.age}, {P.name} faces a long road back"], take: ["Is this the beginning of the end for {P.name}?"], para: ["{P.name} is {P.age}, and recoveries don't get easier with age. [The {T.nick} will have to think about the future.|He's come back before.]"] },
  ],
};
