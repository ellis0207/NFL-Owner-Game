// The league wire written up: coaching moves, contract news, league votes,
// labor, discipline, the business side, stadiums, relocation, ownership,
// honors, retirements and camp news. The topic comes from the system that
// filed the line; angles add who it touches and what it means. Slots: text
// (the wire line), topic, T and T2 (teams named), P (first player named), US.
import { always, on, type AngleDef, type FamilyContent } from "../angles";
import type { FormatId } from "../formats";

/** Angles every topic can take: whose news it is and how big. */
const COMMON: AngleDef[] = [
  {
    id: "plain", when: always(0.5),
    head: ["{cap:text}", "<T?{T.nick}: >{cap:text}"],
    take: ["<T?What the {T.nick} news really means><!T?What this means for the league>", "Read between the lines of this one"],
    para: ["[It's the kind of move that gets lost in a busy week|It's worth more attention than it will get|Around the league, people noticed]."],
  },
  {
    id: "ours", when: on("ours", 2.5),
    head: ["{cap:text}", "{US.nick} news: {text}"],
    take: ["The {US.nick} need to get this one right", "What it means for the {US.nick}"],
    para: ["For the {US.nick}, it [touches everything from the roster to the front office|is the kind of decision that defines a season|will be judged for a long time]."],
  },
  {
    id: "rival", when: on("rival", 1.5),
    head: ["Division watch: {text}"],
    take: ["<T?The {T.nick} just changed the {T.div}><!T?A division rival makes a move>"],
    para: ["<T?The {T.nick} play in the {T.div}, so the {US.nick} will feel this one twice a year.><!T?It's a division rival, and that matters.>"],
  },
  {
    id: "star", when: on("star", 2),
    head: ["<P?{P.name}: ><!P?Star news: >{text}"],
    take: ["<P?This changes things for {P.name}><!P?Star power changes the story>"],
    para: ["<P?{P.name} is one of the league's best-known players<P.line? ({P.line} this season)>, so every move around him gets amplified.><!P?Stars move the needle.>"],
  },
  {
    id: "rumor", when: on("report", 2),
    head: ["Sources: {text}", "League buzz: {text}"],
    take: ["Don't dismiss this report"],
    para: ["Nothing is official yet, and [reports like this don't always pan out|the people involved aren't commenting|it may be someone floating a trial balloon]."],
  },
];

const topic = (formats: FormatId[], analysis: string[], context: string[], angles: AngleDef[], extra: Partial<FamilyContent> = {}): FamilyContent => ({
  family: "wire",
  formats,
  lede: {
    news: ["{cap:text}.", "{cap:text}<tag.report?, according to [league sources|people familiar with the matter]>."],
    analysis,
    opinion: ["{@open.column} {cap:text}."],
    beat: ["<tag.ours?Inside the {US.nick} building, the news was [no surprise|a talking point all day|met with a shrug from players]: {text}.><!tag.ours?{cap:text}.>"],
  },
  details: context,
  angles: [...COMMON, ...angles],
  ...extra,
});

const NEWS: FormatId[] = ["alert", "report", "column", "hottake", "notebook"];

export const WIRE_CONTENT: Record<string, FamilyContent> = {
  coaching: topic(NEWS, [], [
    "[Coaching changes ripple through a building: assistants, schemes and the players who fit them.|A new voice means a new playbook and a new pecking order.|Staff moves rarely end with one name.]",
  ], [
    { id: "fired", when: on("fired", 3), head: ["Out: {text}", "{cap:text}, and the search begins"], take: ["The firing was overdue", "Firing is the easy part"], para: ["[The search starts now, and the candidate pool is never as deep as owners hope.|Somebody upstairs decided the plan wasn't working.|It ends a run that started with a lot of promise.]"] },
    { id: "hired", when: on("hired", 2.5), head: ["{cap:text}", "New hire: {text}"], take: ["The hire looks smart on paper. Paper isn't the field", "This hire tells you what the front office values"], para: ["[First impressions come in the introductory press conference; real ones come in October.|The staff he builds will say as much as the hire itself.|Players say they want structure. They're about to get some.]"] },
    { id: "interim", when: on("interim", 3), head: ["Interim: {text}"], take: ["Interim coaches are auditioning, and the players know it"], para: ["Interim jobs are hard: a short runway, a locker room that just lost its coach, and every week an audition."] },
    { id: "coordinator", when: on("coordinator", 2), head: ["Coordinator change: {text}"], take: ["Changing coordinators midstream rarely fixes the real problem"], para: ["Coordinator changes are a signal: the head coach either chose it or had it chosen for him."] },
    { id: "hotSeat", when: (t) => (t.report && t.ours ? 3 : 0), head: ["Speculation grows: {text}"], take: ["The silence from the owner's box says plenty"], para: ["Nobody in the building is saying it out loud, which is usually how these things start."] },
  ]),
  contracts: topic(["alert", "breakdown", "column", "hottake", "notebook"], [
    "[The cap math behind it is the real story.|Follow the money: every contract decision shifts next year's cap.]",
  ], ["[Contract business never stops in this league.|Agents around the league watch moves like this for precedent.|It's the kind of decision that shows up on a cap sheet for years.]"], [
    { id: "holdout", when: on("holdout", 3), head: ["Standoff: {text}", "{cap:text}"], take: ["Pay the man, or move on. The middle ground costs more", "Holdouts never end well for anyone"], para: ["Fines pile up every day he stays away, and [neither side wants to blink first|the relationship gets harder to repair|teammates are starting to notice]."] },
    { id: "franchiseTag", when: on("tag", 3), head: ["Tagged: {text}"], take: ["The tag is a band-aid, not a plan"], para: ["The tag buys time; a long-term deal can still be done before the summer deadline."] },
    { id: "option", when: on("option", 2.5), head: ["Option decision: {text}"], take: ["Option decisions are the front office grading its own draft"], para: ["Fifth-year option decisions say a lot about how a front office sees its own picks."] },
    { id: "payCut", when: on("payCut", 3), head: ["Pay cut: {text}"], take: ["Taking less to stay is rare. Respect it"], para: ["Players don't take pay cuts lightly. This one buys the team cap room and keeps a familiar face."] },
    { id: "overCap", when: on("overCap", 3), head: ["Cap trouble: {text}"], take: ["Cap hell is a choice, and somebody made it"], para: ["Every team has to get under the cap; the ones that wait until the last minute pay for it in releases and restructures."] },
    { id: "offerSheet", when: on("offerSheet", 3), head: ["Offer sheet: {text}"], take: ["Match it, or regret it"], para: ["Offer sheets are rare because they're awkward: the original team now has five days to match or take the draft compensation."] },
  ]),
  freeagency: topic(["alert", "report", "column", "hottake", "notebook"], [], ["[Free agency runs on rumors, visits and deadlines.|The market sets itself one deal at a time.|Every signing changes what the next player asks for.]"], [
    { id: "visit", when: on("visit", 2.5), head: ["Visit: {text}"], take: ["Visits are leverage, not commitments"], para: ["A visit isn't a deal, but teams don't fly players in for the scenery."] },
    { id: "interest", when: on("interest", 2.5), head: ["The market: {text}"], take: ["Interest is cheap. Guarantees aren't"], para: ["Agents talk, and the numbers in the market get bigger every time they do."] },
    { id: "bidding", when: on("bidding", 3.5), head: ["Bidding war: {text}"], take: ["Somebody is about to overpay"], para: ["Bidding wars make agents rich and winners nervous: the team that 'wins' usually pays the most."] },
    { id: "offerSheet", when: on("offerSheet", 3), head: ["Offer sheet: {text}"], take: ["The offer sheet is a power move"], para: ["The original team has five days to match, or let him go for draft compensation."] },
  ]),
  trades: topic(["alert", "report", "column", "hottake"], [], ["[The trade market is never quiet for long.|Front offices talk every day; few talks become deals.]"], [
    { id: "calledOff", when: on("fail", 3), head: ["Deal off: {text}", "{cap:text}"], take: ["A failed trade leaves scars on both sides"], para: ["Trades fall apart more often than fans know, usually over physicals, money or a last-minute change of heart. The awkward part is the player who knows he was nearly gone."] },
    { id: "deadlineDay", when: on("deadline", 3), head: ["Deadline: {text}"], take: ["Deadline winners and losers"], para: ["Rosters are what they are now: teams can only add free agents the rest of the way."] },
  ]),
  league: topic(["alert", "report", "analytics", "column", "hottake"], [
    "[The numbers behind the decision matter more than the headline.|Follow the money and it makes sense.]",
  ], ["[League business shapes every club, even the ones not in the headline.|These decisions outlast the people who make them.]"], [
    { id: "vote", when: on("vote", 3), head: ["Owners vote: {text}", "{cap:text}"], take: ["The owners got this one wrong", "The owners finally got one right"], para: ["It takes 24 of 32 owners to pass most measures, so [the lobbying started months ago|alliances shifted to get it done|the holdouts had to be won over one by one]."] },
    { id: "capSet", when: on("cap", 3), head: ["The cap: {text}"], take: ["The new cap changes every team's math"], para: ["Teams near the line now have to restructure or release players before the new league year."] },
    { id: "tvMoney", when: on("tv", 3), head: ["TV money: {text}"], take: ["TV money runs this league, and it just changed"], para: ["National TV money is the biggest revenue line every club has, and it flows straight into the salary cap."] },
    { id: "hostCity", when: on("award", 2), head: ["Awarded: {text}"], take: ["Hosting is about the city, not the team"], para: ["Hosting brings hotels, restaurants and a week of national attention; owners vote on it every spring."] },
  ]),
  labor: topic(["alert", "report", "analytics", "column", "hottake"], [
    "[The fight is about the split of revenue, and everything else follows from it.|Every percentage point of revenue is hundreds of millions of dollars.]",
  ], ["[Labor talks move slowly, then all at once.|Both sides need a deal more than they admit.|Fans don't care about revenue splits; they care about games.]"], [
    { id: "lockout", when: on("lockout", 4), head: ["Labor: {text}"], take: ["A lockout is a failure on both sides"], para: ["No games, no paychecks, no signings: a work stoppage freezes the whole league and tests every club's finances."] },
    { id: "deal", when: on("deal", 3), head: ["Labor peace: {text}"], take: ["Who won the labor deal?"], para: ["A new agreement sets the rules for years: the cap, the season, the benefits and the share of revenue that goes to players."] },
  ]),
  discipline: topic(["alert", "report", "column", "hottake", "notebook"], [], ["[The league office has its own timeline.|Appeals can drag on for weeks.|The league wants its policies to be seen as consistent.]"], [
    { id: "suspension", when: on("suspended", 3.5), head: ["Suspended: {text}"], take: ["The suspension sends the right message", "The league overreached"], para: ["The suspension [leaves a hole on the depth chart|costs him game checks|puts the team's depth to the test], and the team has to plan around it."] },
    { id: "fine", when: on("fine", 2.5), head: ["Fined: {text}"], take: ["Fines are a cost of doing business"], para: ["Fines rarely change behavior on their own, but the league keeps a record, and repeat cases draw bigger penalties."] },
  ]),
  business: topic(["alert", "report", "breakdown", "column", "hottake"], [
    "[The business side shows up in the ticket price and the cap budget eventually.|Revenue lines like this one decide how much a club can spend.]",
  ], ["[Clubs are businesses first on days like this.|Money decisions shape the football ones.]"], [
    { id: "sponsor", when: on("sponsor", 2.5), head: ["Sponsors: {text}"], take: ["Sponsors follow winning, and they leave when it stops"], para: ["Sponsorship money is a growing slice of club revenue, and the deals come with obligations both ways."] },
    { id: "trouble", when: on("fail", 3), head: ["Trouble: {text}"], take: ["The front office needs a plan B"], para: ["Nobody plans for this, which is why insurance, reserves and contingency plans exist."] },
    { id: "venue", when: on("injury", 2.5), head: ["Stadium trouble: {text}"], take: ["Fans will judge how the club handles this"], para: ["Repairs, refunds and relocated events: the bill adds up fast."] },
  ]),
  stadiums: topic(["alert", "report", "breakdown", "column", "hottake", "notebook"], [
    "[Stadium math comes down to who pays: the club, the city or the league.|A modern stadium is a billion-dollar bet on decades of revenue.]",
  ], ["[Stadium projects run on politics as much as concrete.|Every new building changes the economics of a franchise.]"], [
    { id: "approved", when: (t) => (t.vote && !t.fail ? 3 : 0), head: ["Approved: {text}"], take: ["Taxpayers just made a big bet"], para: ["Approval is the start of a long road: financing, contractors, overruns and years of construction."] },
    { id: "stalled", when: on("fail", 3), head: ["Stalled: {text}"], take: ["The stadium fight isn't over"], para: ["Failed stadium plans don't disappear; they come back with a new site, a new price or a threat to leave."] },
    { id: "opening", when: on("opens", 3), head: ["Opening: {text}"], take: ["The new building changes everything for the club"], para: ["A new stadium means new premium seats, new sponsors and a new home-field feel."] },
  ]),
  relocation: topic(["alert", "report", "analytics", "column", "hottake", "notebook"], [
    "[Relocation math: the fee, the lease exit and the new market's ceiling.|A move resets a club's fan base and its revenue at the same time.]",
  ], ["[Relocation is the rarest and loudest story in sports business.|Cities fight hard to keep teams, and harder to get them.]"], [
    { id: "application", when: on("apply", 3), head: ["Relocation bid: {text}"], take: ["Moving a team is a betrayal, whatever the spreadsheet says"], para: ["An application starts a league review: committee hearings, market studies, and eventually a vote of 24 owners."] },
    { id: "decision", when: on("vote", 3.5), head: ["Owners decide: {text}"], take: ["The owners' relocation vote will be studied for years"], para: ["The vote weighs good faith, the market and what the move does to every other club's revenue."] },
    { id: "withdrawn", when: on("withdraw", 3), head: ["Staying put: {text}"], take: ["The relocation threat worked, or backfired"], para: ["Withdrawing an application can be a win, if the threat brought the city back to the table."] },
  ]),
  ownership: topic(["alert", "report", "breakdown", "column", "hottake"], [
    "[Franchise values keep climbing, and so does the price of a stake.|Ownership changes ripple through every department.]",
  ], ["[Owners set the tone for everything.|A club's ownership is its longest-lasting decision.]"], [
    { id: "sale", when: on("sale", 3), head: ["For sale: {text}", "Ownership change: {text}"], take: ["New owners always promise to win. Few deliver"], para: ["League owners have to approve every sale, and they look hard at the buyer's money and debt."] },
    { id: "stake", when: on("stake", 2.5), head: ["Stake sale: {text}"], take: ["Selling a stake says something about the owner's finances"], para: ["Minority stakes bring in cash without giving up control, but partners expect a say."] },
    { id: "supervision", when: on("fail", 3), head: ["League steps in: {text}"], take: ["The league doesn't step in lightly"], para: ["League supervision means the finance committee is watching every dollar, and distributions can be held back."] },
  ]),
  frontoffice: topic(["alert", "report", "column", "notebook"], [], ["[Front office changes rarely make headlines, but they shape every decision.|The people behind the scenes run the business.]"], [
    { id: "hire", when: on("hired", 2.5), head: ["Front office: {text}"], take: ["The front office hire says plenty"], para: ["Business hires show where an owner wants the club to grow."] },
    { id: "exit", when: on("fired", 2.5), head: ["Departure: {text}"], take: ["Losing good people is the cost of having them"], para: ["Executives leave for bigger jobs all the time; the test is whether the bench was ready."] },
  ]),
  honors: topic(["alert", "report", "feature", "column", "hottake"], [], ["[Honors are how the league remembers.|Legacies get written in moments like this.]"], [
    { id: "hallOfFame", when: on("hof", 3.5), head: ["Canton: {text}"], take: ["The Hall of Fame voters got it right", "The Hall of Fame voters blew it again"], para: ["The Hall of Fame class is chosen by a panel of voters every year, and the debates never really end."] },
    { id: "snub", when: on("snub", 3), head: ["Snubbed: {text}"], take: ["The snub is indefensible"], para: ["Every year someone deserving is left out. The case gets louder each time."] },
    { id: "award", when: on("award", 2.5), head: ["Honored: {text}"], take: ["The right call on the award"], para: ["Awards are voted on, which means they're argued about."] },
    { id: "milestone", when: on("record", 3), head: ["Milestone: {text}"], take: ["Appreciate this while it lasts"], para: ["Milestones take years of availability and production. Few players ever get there."] },
  ], { formats: ["alert", "report", "feature", "column", "hottake"] }),
  retirement: topic(["alert", "feature", "column", "hottake", "notebook"], [], ["[Every career ends; few end on the player's own terms.|The next chapter starts now.]"], [
    { id: "farewell", when: on("retire", 2), head: ["Retiring: {text}", "{cap:text}"], take: ["An underappreciated career comes to an end", "A career worth remembering"], para: ["[Teammates paid tribute online within minutes.|He walks away with his health, which in this sport is its own win.|Coaches will tell you he was the same every day.]"] },
    { id: "starExit", when: on("star", 3), head: ["A star walks away: {text}"], take: ["A Hall of Fame case starts now"], para: ["<P?{P.name} leaves a hole in the league, and the debate about his legacy begins.><!P?A big name leaves the game.>"] },
  ]),
  camp: topic(["alert", "report", "column", "hottake", "notebook"], [], ["[Camp news moves fast in the summer.|Every practice is an audition this time of year.]"], [
    { id: "qbJob", when: on("qbJob", 3.5), head: ["QB decision: {text}"], take: ["The right quarterback won the job", "The quarterback decision could backfire"], para: ["Quarterback battles divide locker rooms and fan bases. The loser has to be ready on a day's notice."] },
    { id: "holdout", when: on("holdout", 3), head: ["Absent: {text}"], take: ["Skipping practice is a negotiating tactic, and it works"], para: ["Absences cost fines and reps; the leverage is the hole on the depth chart."] },
  ]),
};
