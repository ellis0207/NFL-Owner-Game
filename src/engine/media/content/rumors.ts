// Sourced reports: trade requests, players being shopped, sellers and buyers
// at the deadline, free-agent markets, coaching interviews and favorites,
// coaches on the hot seat, stars "in play", leaks from inside a building and
// agents' accounts of contract talks. A report is first written by the
// reporter who has it; other outlets follow and credit them. Whether it is
// true is never in the words. Slots: R (the reporter: name, outlet), T (the
// club it's about), P (the player), X (another club named), list (clubs
// named, in words), C (a coach: name), pos, text and headline (for leaks).
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

const FORMATS: FormatId[] = ["report", "alert", "column", "hottake", "notebook"];

/** Angles every report can take. */
const COMMON: AngleDef[] = [
  {
    id: "ours", when: on("ours", 2.5),
    head: ["{US.nick} watch: what {R.name}'s report means"],
    take: ["The {US.nick} can't let this story run them", "What the {US.nick} should do about this report"],
    para: ["For the {US.nick}, the report [lands at an awkward time|says something about how the building works|will be the only question this week]."],
  },
  {
    id: "star", when: on("star", 1.8),
    head: ["<P?{P.name} report shakes up the league><!P?A report the whole league will read>"],
    take: ["<P?Players like {P.name} don't come available often><!P?This is bigger than it looks>"],
    para: ["<P?{P.name}<P.line? ({P.line} this season)> is the kind of player who changes a race, which is why every front office will chase this one down.><!P?Front offices around the league will chase this one down.>"],
  },
  {
    id: "deadline", when: on("deadline", 2),
    head: ["Deadline buzz: {R.name} reports the latest", "Trade deadline: the latest from {R.name}"],
    take: ["Deadline week does this to people", "The clock is the only thing that's certain at the deadline"],
    para: ["With the deadline [days away|this close|almost here], every report gets louder and every denial a little less convincing."],
  },
  {
    id: "denied", when: on("denied", 1.5),
    head: ["{T.nick} push back on report", "{T.nick} deny {R.name}'s report"],
    take: ["Denials are part of the game", "A denial is not the same as a no"],
    para: ["A {T.nick} spokesperson [called the report \"not accurate\"|said there was \"nothing to it\"|declined to comment, then called back to deny it]. That's what teams say either way."],
  },
  {
    id: "hedge", when: on("hot", 1.5),
    head: ["{R.name}: \"[I'm hearing|People are telling me|Don't be surprised]\"", "On the air: {R.name}'s latest"],
    take: ["Take this one with a grain of salt", "Radio rumors are free, and worth about that"],
    para: ["{R.name} [said it on the air|floated it in a segment|got the phones lighting up with it], and as usual, [nobody else has confirmed it yet|it's hard to know how solid it is|the other outlets were scrambling]."],
  },
  {
    id: "local", when: on("localReporter", 1.5),
    head: ["{T.nick} beat: {R.name}'s latest", "From the {T.nick} beat: what {R.name} is hearing"],
    take: ["The people who cover the {T.nick} every day know something"],
    para: ["{R.name} covers the {T.nick} every day for {R.outlet}, and [the people around the team talk to them|this is the kind of thing beat writers hear first|it fits what people around the team have been saying]."],
  },
];

/** A report kind: what is claimed, and how it is headlined and argued. */
function kind(claim: string[], head: string[], take: string[], para: string[], extra: AngleDef[] = []): FamilyContent {
  return {
    family: "rumor",
    formats: FORMATS,
    lede: {
      news: claim.flatMap((c) => [`${c}, according to {R.name} of {R.outlet}.`, `{R.name} of {R.outlet} reports that ${c}.`]),
      opinion: claim.map((c) => `{@open.column} {R.name} of {R.outlet} reported that ${c}.`),
      beat: claim.map((c) => `{R.name} reports that ${c}, a story people around the {T.nick} have been talking about.`),
      analysis: claim.map((c) => `{R.name} of {R.outlet} reports that ${c}.`),
    },
    details: ["[Nothing is official.|Nothing is final, according to people familiar with the situation.|It's a developing story.|Other outlets have not confirmed it.]"],
    angles: [{ id: "plain", when: always(0.8), head, take, para }, ...COMMON, ...extra],
  };
}

export const RUMOR_CONTENT: Record<string, FamilyContent> = {
  request: kind(
    ["{P.pos} {P.name} has asked the {T.full} for a trade", "{P.name} has told the {T.full} he wants out"],
    ["Sources: {P.name} has asked the {T.nick} for a trade", "{P.name} wants out of {T.city}, per {R.name}"],
    ["The {T.nick} have to move {last:P.name} now", "{P.name} wants out. The {T.nick} should listen"],
    ["Teams have already started calling. The {T.nick} aren't obligated to move him, but requests like this rarely go away quietly."],
  ),
  shopping: kind(
    ["the {T.full} have let teams know {P.pos} {P.name} is available", "the {T.full} are shopping {P.name}"],
    ["League sources: the {T.nick} are shopping {P.name}", "{P.name} is on the {T.nick}' trade block, per {R.name}"],
    ["Shopping {P.name} tells you where the {T.nick} think they are"],
    ["<P.line?{last:P.name} has {P.line} this season and ><!P.line?{last:P.name} >would draw interest from contenders."],
  ),
  seller: kind(
    ["the {T.full} are open to offers for {P.pos} {P.name}", "teams are calling the {T.full} about {P.name}"],
    ["{T.nick} open to offers for {P.name}", "Trade market heating up for {T.nick} {P.pos} {P.name}"],
    ["The {T.nick} should sell, and {P.name} is the first domino"],
    ["With the {T.nick} at {T.rec}, people around the league expect them to listen on veterans. The asking price is said to be steep."],
  ),
  buyer: kind(
    ["the {T.full} have made calls about {pos} help", "the {T.full} are hunting for {an:pos}"],
    ["{T.nick} hunting for {pos} help", "{T.nick} working the phones for {an:pos}"],
    ["The {T.nick} are one {pos} away. Go get one"],
    ["At {T.rec}, they think they're a piece away, and [contenders rarely get this chance twice|the price only goes up from here|they have the picks to do it]."],
  ),
  fa: kind(
    ["{P.pos} {P.name} has interest from {list}", "{list} are in the mix for {P.name}"],
    ["{P.name} market: {list} in the mix", "Who's in on {P.name}? {R.name} has names"],
    ["Whoever lands {P.name} is overpaying, and should"],
    ["His camp is in no hurry, and [the number keeps climbing|more teams could join|a decision could come quickly once the top offer is in]."],
  ),
  interview: kind(
    ["{C.name} is interviewing for the {T.full} head coaching job", "the {T.full} have requested an interview with {C.name}"],
    ["{T.nick} to interview {C.name} for head coach", "{C.name} on the {T.nick}' list, per {R.name}"],
    ["{C.name} is the right call for the {T.nick}"],
    ["The {T.nick} search is [just getting started|picking up speed|wide open], and {last:C.name} is one of several names in it."],
  ),
  favorite: kind(
    ["{C.name} is the favorite to become the {T.full}' next head coach", "the {T.full} are expected to hire {C.name}"],
    ["{C.name} emerges as {T.nick} favorite", "{T.nick} zeroing in on {C.name}, per {R.name}"],
    ["The {T.nick} found their coach. Now let him coach"],
    ["Nothing is signed, and searches have turned at the last minute before, but [the momentum is real|the second interview went well, according to people involved|ownership is said to be impressed]."],
  ),
  hotseat: kind(
    ["{C.name} is not expected to return as {T.full} head coach", "the {T.full} are preparing to move on from {C.name}"],
    ["{C.name}'s job in danger, per {R.name}", "{T.nick} expected to move on from {C.name}"],
    ["It's time, and everyone in {T.city} knows it", "Firing {last:C.name} won't fix what's wrong with the {T.nick}"],
    ["At {T.rec}, the [questions have gotten louder every week|patience in the owner's box is running out|locker room has heard the talk]."],
  ),
  inplay: kind(
    ["teams have called the {T.full} about {P.name}", "{P.name} could be in play"],
    ["\"I'm hearing {last:P.name} could be in play\"", "Is {P.name} available? {R.name} thinks so"],
    ["The {T.nick} would be crazy to move {P.name}", "Trade {P.name}? Only for a haul"],
    ["The {T.nick} [haven't said a word|would have to be overwhelmed|insist they aren't shopping him], and nobody else has confirmed it."],
  ),
  leak: kind(
    ["{uncap:text}"],
    ["{T.nick}: {headline}", "Inside the {T.nick}: {headline}"],
    ["The {T.nick} have a leak problem", "When a building leaks, it's never just one story"],
    ["Somebody in the building is talking, and [it isn't the first time|the front office won't like it|that may be the bigger story]."],
  ),
  talks: kind(
    ["{uncap:text}"],
    ["Sources: {headline}"],
    ["The {T.nick} can't let {P.name} talks drag"],
    ["The talks go on, but [the agent clearly wanted this out|public negotiations rarely end quickly|both sides know the clock is running]."],
  ),
};
