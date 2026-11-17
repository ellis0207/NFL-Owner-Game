// The words for storylines: every arc kind's opening, phases and endings.
// Each step is an angle of its own, so a story type is arc kind, step and
// format. Slots: T (the club), X (another club: a rival, a new team), P (the
// player), W (the quarterback who lost the job), C (a coach), days (since the
// story began), n (which chapter this is), title (for preseason questions and
// promises), text.
import { on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

type Beat = [head: string[], take: string[], para: string[]];

const FORMATS: FormatId[] = ["report", "column", "hottake", "notebook", "feature"];

const FADE: Beat = [
  ["<T?The {T.nick} story quietly fades><!T?A story that ran out of steam>"],
  ["Some stories just stop"],
  ["Nobody announced an ending. The story simply stopped being the story, the way most of them do."],
];

const COMMON: AngleDef[] = [
  {
    id: "ours", when: on("ours", 0.6),
    head: ["<T?{T.nick}: >the story that won't go away"],
    take: ["The {US.nick} need to get ahead of this"],
    para: ["Around the {US.nick}, [nobody wants to talk about it, which says plenty|it is the first question at every press conference|people are tired of hearing about it, and it keeps coming up anyway]."],
  },
];

function arc(beats: Record<string, Beat>): FamilyContent {
  const all = { fade: FADE, ...beats };
  return {
    family: "arc",
    formats: FORMATS,
    lede: {
      news: ["<tag.opening?A new storyline:><!tag.opening?<tag.ending?It's over.><!tag.ending?The next chapter, {days} days in.>>", "<tag.opening?Something is starting.><!tag.opening?<tag.ending?The ending came {days} days after it began.><!tag.ending?The story keeps moving.>>"],
      opinion: ["{@open.column}"],
      beat: ["<T?Around the {T.nick} building:><!T?Around the league:>"],
      feature: ["<tag.opening?Every long story starts somewhere.><!tag.opening?It has been {days} days, and the story has had {n} chapters.>"],
    },
    details: ["<T.rec?The {T.nick} are {T.rec}.>"],
    angles: [
      // The general piece comes first: a second story on the same step, from another outlet, takes it.
      {
        id: "plain", when: () => 0.2,
        head: ["<P?{P.name}><!P?<T?The {T.nick}><!T?The league>>: [the story so far|where things stand|what it all means]"],
        take: ["<tag.ending?What we learned><!tag.ending?Where this goes from here>"],
        para: ["<tag.opening?It is early, and there is more to come.><!tag.opening?<tag.ending?That's the end of it, at least for now.><!tag.ending?There is more to come.>>"],
      },
      ...Object.entries(all).map(([id, [head, take, para]]): AngleDef => ({ id, when: on(id, 10), head, take, para })),
      ...COMMON,
    ],
  };
}

export const ARC_CONTENT: Record<string, FamilyContent> = {
  hotSeat: arc({
    open: [["Hot seat: how long does {C.name} have?", "{C.name}'s job is officially a story"], ["{C.name} is coaching for his job", "It's time to ask the question about {C.name}"], ["At {T.rec}, the questions about {C.name}'s future have gone from whispers to the main topic in {T.city}."]],
    reprieve: [["{C.name} buys himself time", "Three straight wins cool {C.name}'s seat"], ["Don't let a win streak fool you about {C.name}", "{C.name} answered the critics. For now"], ["Three wins in a row have changed the conversation, at least for a week. The seat is still warm."]],
    scorching: [["{C.name}'s seat is scorching", "Another loss, and {C.name}'s job is in real danger"], ["It's over for {C.name}. Everyone knows it", "Firing {C.name} midseason won't save this year"], ["{T.losses} straight losses, and the owner's box has gone quiet. That's never a good sign for a coach."]],
    fired: [["The {T.nick} fire {C.name}", "{C.name} is out in {T.city}"], ["Firing {C.name} was the easy part", "The {T.nick} waited too long on {C.name}"], ["The storyline ended the way these usually do: with a short statement and a search."]],
    survived: [["{C.name} survives the season", "{C.name} is coming back"], ["Keeping {C.name} is a bet. Here's why", "Ownership just tied itself to {C.name}"], ["Through all the noise, {C.name} kept his job. The pressure starts again in September."]],
  }),
  qbSwitch: arc({
    open: [["<W?The {T.nick} turn to {P.name} over {W.name}><!W?The {T.nick} make a quarterback change>", "Quarterback switch in {T.city}: {P.name} takes over"], ["The {T.nick} picked the right quarterback. Finally", "Benching <W?{W.name}><!W?the starter> is a panic move"], ["<W?{W.name} is out and {P.name} is in.><!W?{P.name} is the new starter.> Every quarterback change is a referendum on the whole building."]],
    settling: [["{P.name} is settling in", "Two wins, and {P.name} looks like the answer"], ["{P.name} is the {T.nick} quarterback now. Stop asking"], ["Two straight wins have quieted the debate, and {last:P.name} is playing like a starter."]],
    pressure: [["The heat rises on {P.name}", "{P.name}'s grip on the job is slipping"], ["The {T.nick} swapped quarterbacks and nothing changed"], ["The switch was supposed to fix things. Two straight losses later, the questions are back."]],
    benched: [["The {T.nick} go back to the drawing board at quarterback", "{P.name} loses the job"], ["The {T.nick} don't have a quarterback, and that's the whole story"], ["The experiment is over. The {T.nick} are on to another quarterback, and another set of questions."]],
    keptJob: [["{P.name} finishes the season as the starter", "{P.name} kept the job"], ["{P.name} earned a real shot next year"], ["Whatever happens in the offseason, {last:P.name} held the job through the end of the season."]],
  }),
  holdout: arc({
    open: [["{P.name} holds out", "{P.name} stays away from the {T.nick}"], ["Pay {P.name}. This isn't complicated", "{P.name} is making a mistake"], ["{P.name} isn't practicing until he gets a new deal, and the {T.nick} have to decide how long they can wait."]],
    fines: [["The fines are piling up for {P.name}", "{P.name}'s standoff hits a second week"], ["This standoff is costing everybody"], ["Every day away costs {last:P.name} money and the {T.nick} practice reps. Neither side has blinked."]],
    paid: [["{P.name} gets paid, ends standoff", "{P.name} and the {T.nick} reach a deal"], ["The {T.nick} blinked, and it was the right call"], ["The standoff ends with a contract. Holdouts usually end this way: a number nobody loved, and a player back on the field."]],
    reported: [["{P.name} reports without a new deal", "{P.name} ends his holdout"], ["{P.name} lost the standoff"], ["{last:P.name} is back without the deal he wanted. The contract question hasn't gone away, it's just quieter."]],
    traded: [["The {T.nick} trade holdout {P.name}", "{P.name}'s standoff ends with a trade"], ["The {T.nick} solved the problem by giving it away"], ["The holdout ended with {last:P.name} in a new uniform."]],
  }),
  contractYear: arc({
    open: [["{P.name} is playing for his next contract", "Contract year: {P.name} bets on himself"], ["Pay {P.name} now or pay more later"], ["{P.name} is in the last year of his deal, and every game is an audition, for the {T.nick} or for everyone else."]],
    deadline: [["Decision time on {P.name}", "Tag, extend or let him walk: the {T.nick} and {P.name}"], ["The {T.nick} can't let {P.name} reach the market"], ["The window is closing. The {T.nick} have to decide what {last:P.name} is worth to them."]],
    extended: [["{P.name} gets his extension", "{P.name} stays with the {T.nick}"], ["{P.name} bet on himself and won"], ["The contract-year story ends with a new deal. {last:P.name} played his way into it."]],
    tagged: [["The {T.nick} tag {P.name}", "{P.name} gets the franchise tag"], ["The tag only delays the {P.name} question"], ["The franchise tag buys a year, and pushes the real negotiation into next summer."]],
    leaves: [["{P.name} leaves the {T.nick}", "{P.name} signs elsewhere"], ["The {T.nick} let {P.name} walk. They'll regret it"], ["The contract year ended the way the {T.nick} feared: with {last:P.name} wearing another uniform."]],
    traded: [["The {T.nick} trade {P.name} before he can walk", "{P.name} traded in his contract year"], ["Getting something for {P.name} beats getting nothing"], ["Rather than risk losing him for nothing, the {T.nick} moved {last:P.name}."]],
  }),
  tradeRequest: arc({
    open: [["{P.name} wants out", "{P.name} asks the {T.nick} for a trade"], ["The {T.nick} have to trade {P.name} now"], ["The request is out in the open. Requests like this rarely go away quietly."]],
    deadline: [["Deadline day: is {P.name} going anywhere?"], ["Move {P.name} today or live with it"], ["The deadline is here, and {last:P.name} is still a {T.nick} player. For a few more hours, anyway."]],
    traded: [["{P.name} gets his wish<X?: traded to the {X.nick}>", "The {T.nick} trade {P.name}"], ["The {T.nick} got what they could for {P.name}"], ["The request ends with a trade<X?, and {last:P.name} heads to the {X.nick}>."]],
    paid: [["{P.name} and the {T.nick} make up, with a new contract"], ["Money fixes most trade requests"], ["A new contract turned a trade request into a reunion."]],
    settled: [["{P.name}'s trade request goes quiet"], ["{P.name} and the {T.nick} patched it up. For now"], ["The request is off the table, at least officially."]],
  }),
  scandal: arc({
    open: [["{P.name} suspended", "League suspends {P.name}"], ["{P.name} let the {T.nick} down"], ["The suspension puts {last:P.name} and the {T.nick} in a story nobody wanted."]],
    fallout: [["The fallout from {P.name}'s suspension", "The {T.nick} move on without {P.name}"], ["The {T.nick} owe their fans more than a statement"], ["A week later, the {T.nick} are still answering questions about {last:P.name}."]],
    served: [["{P.name}'s suspension ends"], ["{P.name} gets a second chance. Make it count"], ["The suspension is over. The questions follow him for a while longer."]],
  }),
  stadium: arc({
    open: [["The {T.nick} stadium fight begins", "{T.city} stadium plans enter the arena"], ["{T.city} should build it. Or shouldn't"], ["A stadium fight is a story about money, politics and a team's future in its city, and it runs for years."]],
    approved: [["{T.nick} stadium plan wins approval", "The {T.nick} get their stadium approved"], ["Approval is the easy part. Now build it"], ["The vote went the {T.nick}' way. The hard part, building it on time and on budget, starts now."]],
    stalled: [["{T.nick} stadium plan stalls", "Setback for the {T.nick} stadium"], ["The {T.nick} stadium plan was always shaky"], ["The plan hit a wall, and with it the {T.nick}' timeline."]],
    opened: [["The {T.nick} open their new stadium", "A new home for the {T.nick}"], ["Was the new stadium worth it?"], ["Years of fighting end with a ribbon cutting and a sold-out opener."]],
  }),
  relocation: arc({
    open: [["The {T.nick} want to move", "{T.nick} relocation bid goes to the owners"], ["Moving the {T.nick} would be a betrayal"], ["The {T.nick} have asked to leave {T.city}. Owners decide whether they can."]],
    approved: [["Owners approve the {T.nick} move", "The {T.nick} are leaving"], ["{T.city} lost its team. Here's how"], ["It's done. The {T.nick} are on their way to a new city."]],
    rejected: [["Owners block the {T.nick} move", "The {T.nick} stay put, for now"], ["The owners got this one right"], ["The league said no. The {T.nick} stay, and the relationship with {T.city} has some repair work ahead."]],
    withdrawn: [["The {T.nick} withdraw their move"], ["The {T.nick} never had the votes"], ["The application is off the table, and the {T.nick} stay home."]],
  }),
  sale: arc({
    open: [["The {T.nick} could be for sale", "{T.nick} owners explore a sale"], ["A new owner is exactly what the {T.nick} need"], ["A sale changes everything about a franchise, from the front office to the stadium plan."]],
    sold: [["The {T.nick} have a new owner", "{T.nick} sale is done"], ["What the {T.nick} sale means for fans"], ["The sale is done, and the {T.nick} begin a new era."]],
  }),
  labor: arc({
    open: [["Lockout: the owners lock out the players", "Labor fight shuts the league down"], ["Both sides lose in a lockout"], ["The league is in a labor fight, and nothing moves until it ends."]],
    deal: [["Labor peace: owners and players agree", "The lockout is over"], ["Who won the labor fight?"], ["A deal ends the fight. Football is back."]],
  }),
  winStreak: arc({
    open: [["The {T.nick} have won five straight", "Five in a row for the {T.nick}"], ["The {T.nick} are for real"], ["Five straight wins, and the {T.nick} have the league's attention."]],
    rolling: [["The {T.nick} are rolling", "Seven straight for the {T.nick}"], ["Nobody wants to play the {T.nick} right now"], ["Seven in a row. The {T.nick} streak is the story of the season so far."]],
    historic: [["Ten straight: the {T.nick} streak gets historic"], ["This {T.nick} streak belongs in the record books"], ["Ten straight wins puts the {T.nick} in rare company."]],
    snapped: [["The {T.nick} streak ends", "Streak snapped: the {T.nick} finally lose"], ["The streak ended. The {T.nick} didn't"], ["Every streak ends. What matters is what the {T.nick} do next."]],
    seasonEnd: [["The {T.nick} finish the season on a streak"], ["The {T.nick} are the team nobody wants in January"], ["The {T.nick} carried the streak all the way to the end of the season."]],
  }),
  losingStreak: arc({
    open: [["Five straight losses for the {T.nick}", "The {T.nick} skid reaches five"], ["Something is broken in {T.city}"], ["Five straight losses, and the patience around the {T.nick} is gone."]],
    freefall: [["Eight straight: the {T.nick} in freefall"], ["Blow it up in {T.city}"], ["Eight in a row. The season is gone; jobs are next."]],
    snapped: [["The {T.nick} finally win", "Skid over: the {T.nick} get a win"], ["One win doesn't fix the {T.nick}"], ["The losing streak is over, and the relief in the locker room was obvious."]],
    seasonEnd: [["The {T.nick} limp to the finish"], ["The {T.nick} season can't end soon enough"], ["The {T.nick} never found a way out of the slide."]],
  }),
  unbeaten: arc({
    open: [["Still perfect: the {T.nick} are 6-0", "The {T.nick} are the league's last unbeaten team"], ["The {T.nick} are the best team in football"], ["Six games, six wins. The {T.nick} are the league's best story."]],
    chase: [["The {T.nick} chase perfection", "Unbeaten deep into the season: the {T.nick}"], ["Should the {T.nick} rest starters or chase history?"], ["Eleven wins without a loss, and the talk has turned to history."]],
    firstLoss: [["The {T.nick} lose for the first time", "Perfect no more: the {T.nick} fall"], ["Losing might be the best thing for the {T.nick}"], ["The unbeaten run is over. The {T.nick} are still the team to beat."]],
    perfect: [["A perfect regular season for the {T.nick}"], ["The {T.nick} did something almost nobody does"], ["The {T.nick} went through the regular season without a loss."]],
  }),
  winless: arc({
    open: [["The {T.nick} are 0-6", "Still searching: the {T.nick} haven't won"], ["How did the {T.nick} get this bad?"], ["Six games, no wins, and the {T.nick} are the story nobody in {T.city} wanted."]],
    firstWin: [["The {T.nick} finally win one", "First win of the season for the {T.nick}"], ["One win, and a long way to go for the {T.nick}"], ["The winless streak is over. The celebration in the locker room said everything."]],
    winlessSeason: [["The {T.nick} finish without a win"], ["The {T.nick} hit bottom. Now rebuild"], ["A season without a win is a rare thing, and the {T.nick} will hear about it for years."]],
  }),
  rookie: arc({
    open: [["Rookie watch: {P.name} is turning heads", "{P.name} is the rookie everyone's talking about"], ["{P.name} is already a star"], ["{P.name} came in as {P.draft} out of {P.college}, and he's playing like he's been in the league for years<P.line?: {P.line}>."]],
    award: [["{P.name} leads the rookie of the year race", "Rookie of the year talk grows around {P.name}"], ["Give {P.name} the rookie award now"], ["With the season winding down, {last:P.name} is in the middle of the rookie of the year conversation."]],
    seasonEnd: [["{P.name}'s rookie season, by the numbers", "A rookie year to remember for {P.name}"], ["{P.name} is just getting started"], ["The rookie season is in the books<P.line?: {P.line}>."]],
  }),
  breakout: arc({
    open: [["Breakout: {P.name} has arrived", "{P.name} is having the season of his young career"], ["{P.name} is the real deal"], ["In his {ord:P.year} season, {P.name} has become one of the {T.nick}' most important players<P.line?: {P.line}>."]],
    seasonEnd: [["{P.name}'s breakout season"], ["Pay {P.name} before the price goes up"], ["The breakout was real<P.line?: {P.line}>."]],
    hurt: [["{P.name}'s breakout season ends early"], ["Don't let the injury erase what {P.name} did"], ["An injury cut short what had been a breakout season."]],
  }),
  comeback: arc({
    open: [["{P.name} faces a long road back", "{P.name} out for an extended stretch"], ["The {T.nick} can't replace {P.name}"], ["{P.name} is facing weeks of rehab, and the {T.nick} have to find a way without him."]],
    setback: [["Setback for {P.name}", "{P.name}'s return is delayed"], ["The {T.nick} rushed {P.name}"], ["The road back just got longer for {last:P.name}."]],
    returned: [["{P.name} is back", "{P.name} returns to the {T.nick}"], ["{P.name}'s return changes the {T.nick} season"], ["After weeks away, {last:P.name} is cleared, and the {T.nick} get a key player back."]],
    lost: [["{P.name}'s season is over"], ["Losing {P.name} hurts the {T.nick} more than anyone admits"], ["The comeback ends without a return this season."]],
  }),
  injuries: arc({
    open: [["The {T.nick} injury list keeps growing", "Injuries pile up for the {T.nick}"], ["The {T.nick} have a medical problem"], ["Five key players out, and the {T.nick} depth is being tested every week."]],
    healthy: [["The {T.nick} are getting healthy"], ["A healthy {T.nick} team is a dangerous one"], ["The injury list is finally shrinking."]],
    seasonEnd: [["The {T.nick} season, defined by injuries"], ["The {T.nick} never had a fair chance"], ["The injuries never let up."]],
  }),
  search: arc({
    open: [["The {T.nick} coaching search begins", "{T.nick} start looking for a head coach"], ["What the {T.nick} need in their next coach"], ["The search is on, and the {T.nick} pick will shape the next five years."]],
    interviews: [["The {T.nick} coaching search heats up", "Interviews pile up in the {T.nick} search"], ["The {T.nick} are interviewing the wrong people"], ["The list of candidates is long, and the {T.nick} are taking their time."]],
    finalist: [["<C?{C.name} emerges in the {T.nick} search><!C?The {T.nick} zero in on their coach>"], ["<C?{C.name} is the right call for the {T.nick}><!C?The {T.nick} found their coach>"], ["The search is down to its final stage."]],
    hired: [["<C?The {T.nick} hire {C.name}><!C?The {T.nick} have their new coach>", "Search over: the {T.nick} pick a coach"], ["<C?Grading the {C.name} hire><!C?Grading the {T.nick} hire>"], ["The search is over, and a new era starts in {T.city}."]],
  }),
  faChase: arc({
    open: [["Who lands {P.name}?", "The race for {P.name} is on"], ["Whoever signs {P.name} wins the offseason"], ["{P.name} is the biggest name on the market, and half the league is interested."]],
    signs: [["{P.name} picks <X?the {X.nick}><!X?a new team>", "The {P.name} chase is over"], ["<X?The {X.nick} won the {P.name} sweepstakes><!X?Someone won the {P.name} sweepstakes>"], ["The chase ends<X? with {last:P.name} in a {X.nick} uniform>."]],
    returns: [["{P.name} stays <T?with the {T.nick}><!T?home>"], ["Smart move by {P.name}"], ["After testing the market, {last:P.name} went back <T?to the {T.nick}><!T?where he was>."]],
  }),
  capCrunch: arc({
    open: [["The {T.nick} have a cap problem", "Over the cap: the {T.nick} have work to do"], ["The {T.nick} spent like there was no tomorrow. Tomorrow is here"], ["The {T.nick} are over next year's cap, and the cuts and restructures have to come before the league year opens."]],
    cleared: [["The {T.nick} get under the cap"], ["The {T.nick} found the money. At a price"], ["Cuts and restructures got the {T.nick} under the cap, and the bill comes due later."]],
    deadline: [["The {T.nick} cap crunch reaches the deadline"], ["The {T.nick} cap mess was avoidable"], ["The league year is open, and the {T.nick} are still squeezing."]],
  }),
  topPick: arc({
    open: [["The race for the No. 1 pick: the {T.nick}", "The {T.nick} and the top of the draft"], ["The {T.nick} should play for the future"], ["At {T.rec}, the {T.nick} are in the race nobody wants to win, with the top pick as the prize."]],
    first: [["The {T.nick} land the No. 1 pick"], ["The {T.nick} can't miss with the top pick"], ["The worst record in football comes with a consolation prize: the first pick in the draft."]],
    passed: [["The {T.nick} miss out on the No. 1 pick"], ["Winning late cost the {T.nick} the top pick"], ["Late wins cost the {T.nick} a shot at the top pick."]],
  }),
  division: arc({
    open: [["Division race: {T.nick} vs. {X.nick}", "The {T.div} race comes down to the {T.nick} and {X.nick}"], ["The {T.nick} will win the {T.div}. Here's why"], ["The {T.nick} and {X.nick} are separated by a game at most, and the {T.div} title is on the line."]],
    won: [["The {T.nick} win the {T.div}", "Division champions: the {T.nick}"], ["The {T.nick} earned that division title"], ["The race is over, and the {T.nick} held off the {X.nick}."]],
    lost: [["The {X.nick} edge the {T.nick} for the {T.div}"], ["The {T.nick} let the division slip away"], ["The {X.nick} finished ahead, and the {T.nick} are left wondering what might have been."]],
  }),
  lastRide: arc({
    open: [["Is this {P.name}'s last ride?", "At {P.age}, {P.name} keeps going"], ["Enjoy {P.name} while he's still out there"], ["{P.name} is {P.age}, and every week could be one of his last."]],
    decision: [["{P.name} weighs his future", "Will {P.name} be back?"], ["{P.name} should play as long as he wants"], ["The season is over, and the question for {last:P.name} is whether there's another one."]],
    retires: [["{P.name} retires", "{P.name} calls it a career"], ["{P.name} went out on his terms"], ["After all those seasons, {last:P.name} is done. The tributes have already started."]],
  }),
  feud: arc({
    open: [["Tension between the {T.nick} coach and GM", "Trouble in the {T.nick} front office"], ["The {T.nick} owner has to fix this"], ["People around the {T.nick} describe a coach and a general manager pulling in different directions."]],
    split: [["The {T.nick} front office shake-up", "The {T.nick} coach-GM feud ends with a change"], ["Someone had to go in {T.city}"], ["The feud ended with a change at the top."]],
    mended: [["The {T.nick} coach and GM patch it up"], ["The {T.nick} front office found its footing"], ["Whatever the tension was, people around the team say it has eased."]],
  }),
  question: arc({
    open: [["The question for the {T.nick}: {title}"], ["{title}"], ["It's the question that will follow the {T.nick} all season."]],
    answered: [["{title} The season answered it"], ["The {T.nick} answered the big question"], ["The season gave a good answer."]],
    unanswered: [["{title} Still waiting"], ["The {T.nick} never answered the big question"], ["The question is still hanging over the team."]],
  }),
  promise: arc({
    open: [["The {T.nick} owner makes a promise", "On the record: {title}"], ["The {T.nick} owner just raised the stakes"], ["The owner said it in public: {title}. Fans will remember."]],
    kept: [["The {T.nick} owner kept his word", "Promise kept: {title}"], ["Say what you want, the {T.nick} owner delivered"], ["The owner said it, and it happened."]],
    broken: [["The {T.nick} owner's promise falls through", "Promise broken: {title}"], ["Words mean something. The {T.nick} owner just learned that"], ["The owner said it in public. It didn't happen, and people noticed."]],
  }),
};
