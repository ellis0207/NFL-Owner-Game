// Roster moves: signings, releases, waiver claims and trades. Signing slots:
// P, T, years, total, apy, gtd, space, share, from, grades, gradeTake.
// Release and claim slots: P, T, age. Trade slots: A, B, winner, loser,
// sendA, sendB, head, star, picks, gradesA, gradesB, pending.
import { always, on, type FamilyContent } from "../angles";

export const SIGNING: FamilyContent = {
  family: "signing",
  formats: ["alert", "breakdown", "grades", "column", "hottake", "notebook"],
  lede: {
    news: [
      "<tag.ext?The {T.nick} and {P.pos} {P.name} agreed on an extension><tag.tag?{P.pos} {P.name} signed his franchise tag with the {T.full}><tag.fa?{P.pos} {P.name} agreed to terms with the {T.full}>: {years} year{s:years}, {total}, {gtd} guaranteed, an average of {apy} a year.",
      "<tag.fa?<from?{P.name} is leaving the {from}: >he's signing with the {T.nick} for {years} year{s:years} and {total}.><tag.ext?{P.name} is staying put. The {T.nick} gave him {yearsWord} more year{s:years} at {apy} a year.><tag.tag?{P.name} and the {T.nick} will go year to year for now: he signed the tag.>",
    ],
    analysis: [
      "{P.name}'s deal with the {T.nick} averages {apy}, about {share} of this year's cap, with {gtd} guaranteed<tag.long? over {years} years>.",
      "The headline is {total}. The real number is {gtd}: that's what the {T.nick} are committed to paying {P.name} no matter what.",
    ],
    opinion: ["{@open.column} The {T.nick} just gave {P.name} {total} over {years} year{s:years}<tag.ext? to stay><tag.fa? to come aboard>."],
    beat: ["<tag.ext?The {T.nick} locked up {P.name} on a {years}-year, {total} extension, a deal people in the building had been working on for weeks.><!tag.ext?The {T.nick} added {P.pos} {P.name} on a {years}-year, {total} deal.>"],
    grades: ["Grades are in on {P.name}'s {years}-year, {total} deal with the {T.nick}: {grades}. {gradeTake}"],
  },
  details: ["<P.line?{P.name:last} has {P.line} this season. ><tag.tight?It leaves the {T.nick} with about {space} in cap space. >"],
  angles: [
    { id: "plain", when: always(0.5), head: ["<tag.ext?{T.nick} extend {P.pos} {P.name}: {years} years, {total}><tag.fa?{P.name} agrees to {years}-year, {total} deal with {T.nick}><tag.tag?{P.name} signs his tag with the {T.nick}>", "<tag.fa?{T.nick} land {P.pos} {P.name}><tag.ext?{P.name} gets paid by the {T.nick}><tag.tag?{P.name} plays on the tag for {T.nick}>"], take: ["What the {P.name} deal tells us about the {T.nick}"], para: ["[It's a fair deal for both sides|It fits the market|It's roughly what everyone expected]: {apy} a year for a player with his résumé."] },
    { id: "topOfMarket", when: on("top", 3), head: ["{P.name} resets the {P.pos} market at {apy} a year", "Record territory: {P.name}, {T.nick} agree at {apy} a year"], take: ["{P.name} is worth every penny of {apy}", "Nobody is worth {apy}. Not even {P.name}"], para: ["At {apy} a year, {P.name} is among the highest-paid players at his position, and every agent with a {P.pos} client [just raised his asking price|is circling the number|sent a thank-you note]."] },
    { id: "bargain", when: on("bargain", 2.5), head: ["The {T.nick} got a bargain in {P.name}", "Value signing: {P.name} at {apy} a year"], take: ["The {T.nick} fleeced the market with {P.name}"], para: ["The graders love it, and it's easy to see why: {apy} a year is [below what similar players got|a discount for this production|a deal the {T.nick} will be glad they made]."] },
    { id: "overpay", when: on("overpay", 2.5), head: ["Did the {T.nick} overpay for {P.name}?", "{T.nick} pay up for {P.name}, and the graders wince"], take: ["The {T.nick} just lit money on fire", "Somebody explain the {P.name} contract to the fans"], para: ["The early verdict isn't kind. [Evaluators around the league think the {T.nick} bid against themselves.|That's a lot of money for this production.|The guarantees are what worry people.]"] },
    { id: "ageRisk", when: on("old", 2), head: ["{T.nick} bet {total} on {P.age}-year-old {P.name}", "Age is the question in {P.name}'s new deal"], take: ["Paying {P.name} at {P.age} is a mistake"], para: ["{P.name} is {P.age}. The {T.nick} are paying for what he's done; the risk is what the years do to him."] },
    { id: "fragile", when: on("fragile", 2), head: ["Injury history hangs over {P.name}'s new deal"], take: ["The {T.nick} are gambling on {P.name}'s health"], para: ["{P.name} has missed time in recent seasons, and that's the risk the {T.nick} are taking on. [The guarantees suggest they're confident.|The structure protects them a little.]"] },
    { id: "reunion", when: on("reunion", 3), head: ["{P.name} returns to the {T.nick}", "Homecoming: {P.name} back with the {T.nick}"], take: ["Reunions rarely work. The {P.name} one might"], para: ["{P.name} has been here before. [He knows the building and the city.|Old teammates lobbied for it.|Some reunions are about nostalgia; this one is about fit.]"] },
    { id: "poached", when: on("rival", 3), head: ["{T.nick} pry {P.name} away from division rival {from}", "{P.name} switches sides in the {T.div}"], take: ["The {T.nick} just stuck it to the {from}"], para: ["{P.name} isn't just changing teams; he's changing sides in the {T.div}. The {from} will see him twice a year."] },
    { id: "guaranteed", when: on("loaded", 2), head: ["{P.name}'s deal is loaded with guarantees: {gtd}"], take: ["The guarantees in {P.name}'s deal are the real story"], para: ["{gtd} of the {total} is guaranteed, a sign of how badly the {T.nick} wanted this done."] },
    { id: "prove", when: (t) => (t.prove && t.fa ? 2 : 0), head: ["{P.name} bets on himself with a one-year deal"], take: ["{P.name}'s one-year deal is smart for everyone"], para: ["One year, {total}. {P.name} [gets a chance to rebuild his value|gets a stage|keeps his options open], and the {T.nick} take on little risk."] },
    { id: "long", when: on("long", 1.5), head: ["{T.nick} commit to {P.name} for {years} years"], take: ["{years} years is a long time to bet on {P.name}"], para: ["The {T.nick} see {P.name} as part of the core for a long time. [Long deals are about cash flow and cap control.|The back years are where these get interesting.]"] },
    { id: "capCrunch", when: on("tight", 2), head: ["{P.name} deal leaves the {T.nick} tight against the cap"], take: ["The {T.nick} are running out of cap room"], para: ["After this one, the {T.nick} have about {space} in cap space, [which means another move may be coming|which will force a restructure or two|which limits what comes next]."] },
    { id: "franchise", when: on("tag", 3), head: ["{P.name} signs the tag, and the clock starts on a long-term deal"], take: ["The {T.nick} should have paid {P.name} long-term"], para: ["The tag buys time. A long-term deal can still get done before the summer deadline; if not, {P.name} plays on a one-year number and the conversation starts again."] },
    { id: "winNow", when: on("winNow", 1.5), head: ["Contending {T.nick} add {P.name}"], take: ["The {T.nick} are all in, and {P.name} is the proof"], para: ["At {T.rec}, the {T.nick} are built to win now, and {P.name} [fills a need|raises the floor|is the missing piece, they hope]."] },
    { id: "youngCore", when: on("young", 1.5), head: ["{T.nick} build around young {P.name}"], take: ["Locking up {P.name} young is how good teams stay good"], para: ["{P.name} is {P.age}, and the {T.nick} are betting his best football is ahead of him."] },
    { id: "qbMoney", when: on("qb", 2), head: ["Quarterback money: {P.name} and the {T.nick} agree at {apy} a year"], take: ["Quarterback contracts are broken, and {P.name}'s proves it"], para: ["Quarterback deals set the course of a franchise. This one ties the {T.nick}' next few seasons to {P.name}."] },
  ],
};

export const RELEASE: FamilyContent = {
  family: "release",
  formats: ["alert", "breakdown", "column", "hottake", "notebook"],
  lede: {
    news: ["The {T.full} <tag.waived?waived><!tag.waived?released> {P.pos} {P.name}<age?, {age},> today.", "{P.name} is <tag.waived?on waivers><!tag.waived?a free agent>: the {T.nick} <tag.waived?waived><!tag.waived?released> him."],
    analysis: ["Releasing {P.name} clears his salary off the {T.nick}' books, though some of it stays behind as dead money.", "[The cap math explains the {P.name} release|It's a money move as much as a football one]: the {T.nick} free up room by cutting {P.name}."],
    opinion: ["{@open.column} The {T.nick} cutting {P.name} [tells you where the franchise is headed|is the right call, even if it stings|is going to look bad in about a month]."],
    beat: ["The {T.nick} let go of {P.name}, a move that had been [discussed for weeks|a surprise to some in the locker room|expected]."],
  },
  details: ["<P.line?{P.name:last} had {P.line} this season. ><tag.waived?Any team can put in a claim before he clears waivers.><!tag.waived?He is free to sign anywhere.>"],
  angles: [
    { id: "plain", when: always(0.5), head: ["{T.nick} <tag.waived?waive><!tag.waived?release> {P.pos} {P.name}"], take: ["The {T.nick} were right to move on from {P.name}"], para: ["It's the business side of the game: [roster spots are scarce|the {T.nick} needed the spot|younger players pushed him out]."] },
    { id: "capCasualty", when: on("march", 2.5), head: ["Cap casualty: {T.nick} cut {P.name}", "{T.nick} release {P.name} to clear cap space"], take: ["The {T.nick} cut {P.name} to fix a cap mess they made"], para: ["March is when the cap bill comes due. Cutting {P.name} [clears room for free agency|gets the {T.nick} under the line|was the price of past contracts]."] },
    { id: "vetCut", when: on("old", 2), head: ["{T.nick} move on from {age}-year-old {P.name}", "Veteran {P.name} cut by {T.nick}"], take: ["{P.name} still has something left. Someone should sign him"], para: ["At {age}, {P.name} [may still find a home with a contender|has a decision to make about his future|was a casualty of the youth movement]."] },
    { id: "surprise", when: on("productive", 2), head: ["Surprise: {T.nick} release productive {P.name}"], take: ["Cutting {P.name} is a mistake the {T.nick} will regret"], para: ["{P.name} was still producing, which makes the move [a surprise|hard to explain|a sign of a bigger plan]."] },
    { id: "bust", when: on("bust", 3), head: ["{T.nick} give up on first-round pick {P.name}", "First-round pick {P.name} released by {T.nick}"], take: ["The {P.name} pick was a miss, and the {T.nick} just admitted it"], para: ["{P.name} was {P.draft}. Cutting a first-round pick this early [is an admission of a scouting miss|stings for the people who picked him|says the {T.nick} are done waiting]."] },
    { id: "hurtCut", when: on("hurt", 2), head: ["{T.nick} part ways with injured {P.name}"], take: ["Cutting an injured {P.name} is cold, but it's business"], para: ["{P.name} is still recovering, and the {T.nick} decided not to wait. [Teams will check his medicals closely.|Someone will take a chance once he's healthy.]"] },
    { id: "campCut", when: on("camp", 2), head: ["Camp cut: {T.nick} let {P.name} go"], take: ["The {T.nick}' cut of {P.name} says a lot about their depth"], para: ["Roster cuts are the hardest week of the summer, and {P.name} [didn't win his battle|got squeezed by numbers|is a name other teams will watch on the waiver wire]."] },
  ],
};

export const CLAIM: FamilyContent = {
  family: "claim",
  formats: ["alert", "notebook", "column"],
  lede: {
    news: ["The {T.full} claimed {P.pos} {P.name} off waivers.", "{P.name} has a new home: the {T.nick} put in a waiver claim and got him."],
    opinion: ["{@open.column} Claiming {P.name} [was the quietest smart move of the week|costs the {T.nick} nothing but a roster spot]."],
    beat: ["The {T.nick} added {P.name} off waivers, and he's expected to [compete right away|take a practice-squad-to-roster path|add depth]."],
  },
  details: ["<P.line?{P.name:last} had {P.line} this season.>"],
  angles: [
    { id: "plain", when: always(1), head: ["{T.nick} claim {P.pos} {P.name} off waivers", "Waiver pickup: {P.name} to the {T.nick}"], take: ["The {T.nick} got {P.name} for nothing"], para: ["Waiver claims go in reverse order of the standings, which [helps teams near the bottom|is how good depth gets built|rewards teams paying attention]."] },
    { id: "star", when: on("star", 2), head: ["{T.nick} land {P.name} on waivers"], take: ["How did {P.name} make it to the {T.nick} on waivers?"], para: ["It's rare for a player like {P.name} to be claimed rather than signed. The {T.nick} [moved fast|got lucky|had a plan]."] },
  ],
};

export const TRADE: FamilyContent = {
  family: "trade",
  formats: ["alert", "grades", "column", "hottake", "analytics", "notebook"],
  lede: {
    news: ["The {A.full} send {sendA} to the {B.full} for {sendB}{pending}.", "<tag.blockbuster?A blockbuster: ><!tag.blockbuster?A trade: >the {A.nick} get {sendB}, and the {B.nick} get {sendA}{pending}."],
    analysis: ["By the value charts, the {winner.nick} came out ahead in the deal with the {loser.nick}, but trades are about fit as much as math.", "Run the trade through any value model and the {winner.nick} [win it on paper|got more than they gave|did well]. Paper isn't the field."],
    opinion: ["{@open.column} The {A.nick} and {B.nick} made a deal, and one of them is going to regret it."],
    beat: ["<tag.ours?The {US.nick} made a trade with the {THEM.nick}. ><!tag.ours?A trade between the {A.nick} and {B.nick}. >It came together [quickly|over several days of talks|late at night], according to people involved."],
    grades: ["Grades for the {A.nick}: {gradesA}. For the {B.nick}: {gradesB}."],
  },
  details: ["<!fmt.grades?<gradesA?Grades for the {A.nick}: {gradesA}. For the {B.nick}: {gradesB}.>>"],
  angles: [
    { id: "plain", when: always(0.5), head: ["Trade: {head}", "{A.nick} and {B.nick} make a deal: {head}"], take: ["Who won the {A.nick}-{B.nick} trade?"], para: ["[Both sides get what they wanted, at least on paper.|It fills a need for each side.|Neither side gave away the farm.]"] },
    { id: "blockbuster", when: on("blockbuster", 3), head: ["Blockbuster: {head}", "Stunner: {head}"], take: ["The {winner.nick} just won the trade of the year", "Winners and losers: the {winner.nick} fleeced somebody"], para: ["Deals this big don't happen often. [The league will feel this one for years.|Front offices around the league were on the phone within minutes.|It changes both rosters.]"] },
    { id: "deadline", when: on("deadline", 2.5), head: ["Deadline deal: {head}", "Trade deadline: {A.nick} and {B.nick} strike a deal"], take: ["The {A.nick}-{B.nick} deadline deal is the one that matters"], para: ["With the deadline [days away|closing in|close], the market [is moving|got its first big domino|is heating up]."] },
    { id: "offseason", when: on("agreed", 2.5), head: ["Agreed: {head}, official in March"], take: ["The {A.nick}-{B.nick} deal is the first big move of the offseason"], para: ["It can't become official until the new league year opens, but the framework is done."] },
    { id: "lopsided", when: on("lopsided", 2.5), head: ["The {winner.nick} win the trade with the {loser.nick}, graders say"], take: ["The {loser.nick} got fleeced", "What were the {loser.nick} thinking?"], para: ["The graders don't see it as close: the {winner.nick} [got the better end|got more value|made the smarter deal], and the {loser.nick} [will have to explain it|paid a steep price|are betting on fit over value]."] },
    { id: "divisionDeal", when: on("division", 2), head: ["Rare division trade: {head}"], take: ["The {A.nick} and {B.nick} traded inside the division. Someone's going to regret it"], para: ["Division rivals rarely help each other. [They'll see the result twice a year.|One of them thinks it got the better of a rival.]"] },
    { id: "qbTrade", when: on("qb", 3), head: ["Quarterback trade: {head}"], take: ["A quarterback trade changes two franchises at once"], para: ["Quarterback trades don't happen often, and they [reshape both franchises|tell you where each team thinks it is|come with a lot of pressure]."] },
    { id: "pickHaul", when: on("picksOnly", 2), head: ["{head}: picks change hands"], take: ["Draft capital is the real prize in the {A.nick}-{B.nick} deal"], para: ["There are {picks} draft picks in this deal, which [is a bet on the future|gives somebody ammunition for April|is how rebuilds start]."] },
    { id: "sellers", when: on("seller", 1.5), head: ["Sellers make a move: {head}"], take: ["The selling has started"], para: ["One side is looking at next year. [Trading veterans for futures is how losing seasons end up being useful.|The fire sale may not be over.]"] },
    { id: "buyers", when: on("contender", 1.5), head: ["A contender loads up: {head}"], take: ["Going all in is right, and this deal proves it"], para: ["A contender saw a chance and took it. [Windows close fast in this league.|It's a bet on this season.]"] },
    { id: "reunion", when: on("reunion", 2), head: ["<star?{star.name} heads back to a familiar place><!star?{head}>"], take: ["<star?{star.name}'s homecoming is a smart move><!star?Homecomings>"], para: ["<star?{star.name} has played there before.><!star?A familiar face returns.>"] },
  ],
};
