// What people say: the weekly press conferences and locker-room talk, camp
// notebooks and the hot seat. Talk slots: S (the speaker: name, role), T, O
// (next opponent), P (a player speaker, playerSlots). Camp slots: T, coach,
// battle {pos, a, b}, rookie, hold. Seat slots: T, coach.
import { always, on, type FamilyContent } from "../angles";

export const TALK: FamilyContent = {
  family: "talk",
  formats: ["report", "notebook", "column", "hottake"],
  lede: {
    news: [
      "<P?{P.pos} {P.name} talked to reporters at the {T.nick} facility.><!P?{S.name} met with reporters<O? ahead of the game against the {O.full}><!O? at the {T.nick} facility>.>",
      "<P?{P.name} stopped at his locker to talk after practice.><!P?{S.name} took questions for about fifteen minutes<O? as the {T.nick} turned to the {O.nick}>.>",
    ],
    beat: ["<P?{P.name} held court in the {T.nick} locker room.><!P?{S.name}'s midweek press conference had a little bit of everything.>"],
    opinion: ["{@open.column} <P?Listen to what {P.name} said this week.><!P?Listen closely to {S.name} this week.>"],
  },
  details: ["The {T.nick} are {T.rec}."],
  bank: {
    "tq.contract": ["I don't think about the contract. My agent handles that. I handle Sundays.", "I want to be here. That's all I'll say about it.", "Business takes care of itself. I just have to play.", "Everybody knows the situation. I'm not going to make it about me."],
    "tq.losing": ["Nobody's coming to save us. We have to look in the mirror.", "We're not far off. I know how that sounds at this record.", "It starts in practice. We haven't been good enough there either.", "You keep swinging. That's all you can do."],
    "tq.winning": ["We're not satisfied. Nobody in here is talking about January yet.", "It's fun right now. Practice is fun. That's how you know.", "We just keep stacking days. Don't look up.", "Winning is a habit, and so is losing. We picked the right one."],
    "tq.plain": ["I feel good. Body feels good. I'm just trying to stack days.", "We've got a lot of football left. I like this group.", "Every week's a new test. I like where we are.", "Just doing my job and trusting the guys next to me."],
    "tq.vet": ["I'll play as long as the body lets me. Right now it's letting me.", "I don't count the years. I count the Sundays I have left.", "The young guys keep me young. Don't tell them that."],
    "tq.rookie": ["Everything's faster up here. I'm learning every day.", "The vets have been great. I just try to keep my mouth shut and work.", "It's a dream. I'm trying not to act like it."],
    "cq.week": ["We had a good Wednesday. The focus is where it needs to be.", "Every week in this league is hard. We respect who we're playing.", "We've got to take care of the football and win on third down. Simple as that.", "It's a one-week season. That's how we approach it."],
    "cq.loss": ["We have to coach better, and I have to coach better. That's where it starts.", "We'll find out who we are this week.", "I'm not going to panic, and neither is that locker room."],
    "cq.win": ["Don't read the clippings. That's the message.", "We haven't done anything yet. It's a long season.", "Good teams stay hungry. We'll see if we're a good team."],
    "cq.hurt": ["The injury report is what it is. Next man up.", "We've got guys who've been waiting for this chance.", "Nobody's feeling sorry for us, and we're not feeling sorry for ourselves."],
  },
  angles: [
    { id: "plain", when: always(0.6), head: ["<P?{P.name}: \"[We've got a lot of football left|I like this group|Just doing my job]\"><!P?{last:S.name}: \"[We know what's in front of us|It's a one-week season|The guys are locked in]\">"], take: ["<P?{P.name} is saying the right things><!P?{S.name} is saying the right things. Is anyone listening?>"], para: ["<P?{last:P.name}><!P?{last:S.name}> said: \"<P?{@tq.plain}><!P?{@cq.week}>\""] },
    { id: "contractYear", when: on("contractYear", 3), head: ["<P?{P.name} on his contract year: \"[I want to be here|I handle Sundays|Business takes care of itself]\"><!P?Contract questions>"], take: ["<P?Pay {P.name} before this gets awkward><!P?Contract talk>"], para: ["\"{@tq.contract}\" <P?{last:P.name} is in the last year of his deal, and every week the question gets asked again.>"] },
    { id: "losing", when: (t) => (Number(t.lStreak) >= 3 ? 2.5 : 0), head: ["<P?{P.name} on the skid: \"[Nobody's coming to save us|We have to look in the mirror|You keep swinging]\"><!P?{last:S.name} on the skid: \"[We'll find out who we are|I'm not going to panic]\">"], take: ["The {T.nick} are talking. They need to start winning"], para: ["\"<P?{@tq.losing}><!P?{@cq.loss}>\" The {T.nick} have lost {T.losses} straight, and the patience around the team is thinning."] },
    { id: "winning", when: (t) => (Number(t.wStreak) >= 3 ? 2.5 : 0), head: ["<P?{P.name}: \"[We're not satisfied|Practice is fun|Don't look up]\"><!P?{last:S.name}: \"[Don't read the clippings|We haven't done anything yet]\">"], take: ["The {T.nick} are rolling, and they know it"], para: ["\"<P?{@tq.winning}><!P?{@cq.win}>\" The {T.nick} have won {T.wins} straight."] },
    { id: "veteran", when: on("veteran", 2), head: ["<P?At {P.age}, {P.name} isn't counting the years><!P?Veteran voices>"], take: ["<P?Enjoy {P.name} while he's still out there><!P?Veterans>"], para: ["\"{@tq.vet}\" <P?{last:P.name} is {P.age} and still one of the {T.nick}' most important players.>"] },
    { id: "rookie", when: on("rookie", 2), head: ["<P?Rookie {P.name}: \"[Everything's faster up here|It's a dream|I'm learning every day]\"><!P?Rookie voices>"], take: ["<P?{P.name} already gets it><!P?The rookies>"], para: ["\"{@tq.rookie}\" <P?{last:P.name} came in as {P.draft} out of {P.college}.>"] },
    { id: "opponent", when: on("opp", 1.2), head: ["<O?{last:S.name} on the {O.nick}: \"[We respect them|They're a good football team|It's a big test]\"><!O?{last:S.name} looks ahead>"], take: ["<O?The {O.nick} game says a lot about the {T.nick}><!O?A big week>"], para: ["<O?The {O.nick} come in at {O.rec}, and {last:S.name} [called them one of the best teams they'll see|said the week of preparation has been sharp|wouldn't give anything away about the plan].><!O?The week ahead matters.>"] },
    { id: "faith", when: on("faithHigh", 2.5), head: ["{last:S.name}: \"[We're all pulling in the same direction|I feel supported|Ownership has been great]\""], take: ["The {T.nick} are aligned from the top down"], para: ["Asked about ownership, {last:S.name} smiled: \"We're all pulling in the same direction. I feel supported.\""] },
    { id: "tension", when: on("faithLow", 3), head: ["{last:S.name} dodges questions about ownership", "{last:S.name}: \"[Next question|I'll keep those conversations in house]\""], take: ["Something is off between the {T.nick} coach and the owner"], para: ["{last:S.name} [bristled at a question about his relationship with ownership: \"Next question.\"|paused when asked about the owner's recent comments. \"I'll keep those conversations in house.\"]"] },
    { id: "injuries", when: on("hurtCount", 1.5), head: ["{last:S.name} on the injuries: \"[Next man up|Nobody's feeling sorry for us]\""], take: ["The {T.nick} depth is about to be tested"], para: ["\"{@cq.hurt}\" The {T.nick} are dealing with several injuries this week."] },
  ],
};

export const CAMP: FamilyContent = {
  family: "camp",
  formats: ["report", "notebook", "column", "hottake"],
  lede: {
    news: ["Practice notes from {T.nick} camp:", "[Another day of camp|A hot day at camp|A padded practice] for the {T.nick}, and a few things stood out."],
    beat: ["From the {T.nick} practice field today:"],
    opinion: ["{@open.column} Camp tells you less than people think, but it tells you something about the {T.nick}."],
  },
  details: [
    "<!angle.rookieWatch?<rookie?[Rookie|First-year] {rookie.pos} {rookie.name} [keeps showing up on the practice tape|had a rough day and heard about it from the position coach|is getting work with the starters|looks like a pick who'll play early]. >><!angle.holdout?<hold?{hold.name} is still away while he waits on a new deal. >>\"[Competition brings out the best in everybody,|Nobody's penciled in on the depth chart yet. It's earned,|Good, physical day. We needed that one,]\" {coach} said.",
  ],
  angles: [
    { id: "plain", when: always(0.4), head: ["{T.nick} camp notebook: [a physical day|the work continues|competition everywhere]"], take: ["What the {T.nick} camp is really telling us"], para: ["[The pace was high and the coaches were loud.|It was a teaching day, with a lot of walkthrough work.|Tempers flared once, which coaches didn't seem to mind.]"] },
    { id: "battle", when: on("battle", 2.5), head: ["<battle?{T.nick} camp notebook: {last:battle.a.name} vs. {last:battle.b.name}><!battle?{T.nick} camp notebook>"], take: ["<battle?The {battle.pos} battle in {T.nick} camp has a clear answer><!battle?Camp battles>"], para: ["<battle?The fight to watch: {battle.a.name} and {battle.b.name} for the starting {battle.pos} job. [{last:battle.a.name} has taken more first-team reps, but the gap is small.|Coaches have rotated them with the ones all week.|{last:battle.b.name} had the better day today.]><!battle?Every position is open, coaches say.>"] },
    { id: "qbBattle", when: on("qb", 3.5), head: ["<battle?Quarterback battle: {last:battle.a.name} and {last:battle.b.name} still neck and neck><!battle?Quarterback questions>"], take: ["<battle?The {T.nick} need to pick a quarterback and live with it><!battle?Quarterbacks>"], para: ["<battle?Nothing in camp is watched like a quarterback battle, and this one between {battle.a.name} and {battle.b.name} [is still open|is starting to tilt|has the locker room split].><!battle?The quarterback room is the story.>"] },
    { id: "rookieWatch", when: on("rookie", 2), head: ["<rookie?{T.nick} camp notebook: {last:rookie.name} turning heads><!rookie?Rookie watch>"], take: ["<rookie?{rookie.name} is going to start sooner than people think><!rookie?The rookies>"], para: ["<rookie?{rookie.name} came in as {rookie.draft} out of {rookie.college}, and coaches are already finding ways to get him on the field.><!rookie?The rookies are learning fast.>"] },
    { id: "holdout", when: on("hold", 3), head: ["<hold?{T.nick} camp notebook: {last:hold.name} watch continues><!hold?Holdout watch>"], take: ["<hold?Pay {hold.name} or trade him. The middle ground is worst><!hold?Holdouts>"], para: ["<hold?Every day {hold.name} stays away is a day of fines and missed reps, and the {T.nick} are getting a long look at life without him.><!hold?Contract business hangs over camp.>"] },
  ],
};

export const SEAT: FamilyContent = {
  family: "seat",
  formats: ["report", "hottake", "column", "notebook"],
  lede: {
    news: ["At {T.rec}, the {T.full} are <tag.ours?testing their owner's patience><!tag.ours?running out of time>, and the questions about {coach} are getting louder."],
    opinion: ["{@open.hottake} {coach} is coaching for his job."],
    beat: ["Nobody inside the {T.nick} building wants to talk about {coach}'s job security, which tells you how much everyone is thinking about it."],
  },
  details: ["\"You can feel it in that building,\" [Kara Voss said on The Blitz|one league executive said|a person close to the team said]. \"{last:coach} needs wins, and he needs them now.\""],
  angles: [
    { id: "plain", when: always(0.5), head: ["Hot seat watch: {coach}", "Is {coach}'s job in danger?"], take: ["It's time for the {T.nick} to make a change", "Firing {coach} won't fix the {T.nick}"], para: ["[Owners rarely fire coaches midseason, but it happens more than it used to.|The record says one thing; the effort on tape says another.|A coach's job is safe until it isn't.]"] },
    { id: "skid", when: (t) => (Number(t.lStreak) >= 3 ? 2.5 : 0), head: ["{T.losses} straight losses, and {coach}'s seat is scorching"], take: ["{T.losses} in a row. That's a fireable offense"], para: ["{T.losses} straight losses have turned a bad season into a crisis."] },
    { id: "winless", when: on("winless", 3.5), head: ["Still winless: how long can the {T.nick} wait on {coach}?"], take: ["Winless is unacceptable. {coach} has to go"], para: ["No wins yet. Nothing in this league gets a coach fired faster."] },
    { id: "owner", when: on("ours", 3), head: ["The {T.nick} owner faces a decision on {coach}"], take: ["The owner has to decide what he believes in"], para: ["The decision will come from the owner's box, and everybody in the league is watching how this owner handles it."] },
  ],
};
