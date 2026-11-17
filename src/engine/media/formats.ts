// Story formats: how a desk writes a fact up. A straight game story, a
// breaking alert, a sourced report, a cap breakdown, a numbers piece, a film
// study, a column, a radio rant, the beat notebook, a grades roundup, a
// feature. Each says which outlets run it, which byline writes it, and whether
// it leads with news or with an opinion.
import type { Bank } from "./grammar";

export type FormatId =
  | "recap" | "alert" | "report" | "breakdown" | "analytics" | "film"
  | "column" | "hottake" | "notebook" | "grades" | "feature"
  // Shared by every family (media/blend.ts).
  | "explainer" | "qa" | "podcast";

/** Which lede a family writes for the format. */
export type Group = "news" | "analysis" | "opinion" | "beat" | "grades" | "feature";

export interface FormatDef {
  id: FormatId;
  group: Group;
  label: string;
  /** Byline role at the outlet (see engine/outlets.ts). */
  role: "insider" | "columnist" | "analyst" | "draft" | "reporter";
  /** Outlets that run it, with how often each one does. */
  outlets: [string, number][];
  /** "head" for a news headline, "take" for an opinion headline. */
  style: "head" | "take";
  quote: boolean;
}

export const FORMATS: Record<FormatId, FormatDef> = {
  recap: { id: "recap", group: "news", label: "Game story", role: "reporter", outlets: [["ledger", 1], ["sideline", 1], ["afw", 1]], style: "head", quote: true },
  alert: { id: "alert", group: "news", label: "Breaking", role: "insider", outlets: [["afw", 3], ["sideline", 2], ["capspace", 1], ["ledger", 1]], style: "head", quote: false },
  report: { id: "report", group: "news", label: "Report", role: "insider", outlets: [["sideline", 1], ["ledger", 1], ["capspace", 1], ["afw", 1], ["journal", 1]], style: "head", quote: true },
  breakdown: { id: "breakdown", group: "analysis", label: "Cap breakdown", role: "analyst", outlets: [["capspace", 1], ["journal", 0.5]], style: "head", quote: false },
  analytics: { id: "analytics", group: "analysis", label: "By the numbers", role: "analyst", outlets: [["xp", 3], ["ledger", 1], ["sideline", 0.5]], style: "head", quote: false },
  film: { id: "film", group: "analysis", label: "Film room", role: "analyst", outlets: [["sideline", 1], ["ledger", 1], ["xp", 1]], style: "head", quote: false },
  column: { id: "column", group: "opinion", label: "Column", role: "columnist", outlets: [["ledger", 2], ["sideline", 1], ["capspace", 1], ["journal", 1], ["xp", 0.5]], style: "take", quote: false },
  hottake: { id: "hottake", group: "opinion", label: "Hot take", role: "columnist", outlets: [["blitz", 1]], style: "take", quote: false },
  notebook: { id: "notebook", group: "beat", label: "Beat notebook", role: "reporter", outlets: [["beat", 1]], style: "head", quote: true },
  grades: { id: "grades", group: "grades", label: "Grades", role: "analyst", outlets: [["capspace", 2], ["ledger", 1]], style: "head", quote: false },
  explainer: { id: "explainer", group: "analysis", label: "Explainer", role: "insider", outlets: [["afw", 1], ["sideline", 1], ["ledger", 1], ["journal", 0.5]], style: "head", quote: false },
  qa: { id: "qa", group: "analysis", label: "Ask the insider", role: "insider", outlets: [["ledger", 1], ["sideline", 1], ["capspace", 1], ["afw", 0.5]], style: "head", quote: false },
  podcast: { id: "podcast", group: "opinion", label: "Podcast", role: "columnist", outlets: [["blitz", 1], ["xp", 1], ["sideline", 1], ["ledger", 0.5]], style: "take", quote: false },
  feature: { id: "feature", group: "feature", label: "Feature", role: "reporter", outlets: [["ledger", 1], ["sideline", 1], ["journal", 0.5]], style: "head", quote: true },
};

/** Words every family shares: openers, kickers and verbs, with tone variants. */
export const SHARED_BANK: Bank = {
  "open.column": [
    "[Here is what matters.|Strip away the noise and one thing is left.|Let's be clear about what this was.]",
    "[Every season has a moment that tells you who a team is.|Some results are just results. This one wasn't.|It's easy to overreact in this league. It's also easy to underreact.]",
    "[I've covered this league long enough to know when something is real.|The tape and the numbers agree on this one.|Go back and watch it again.]",
  ],
  "open.hottake": [
    "[I'm going to say what everybody's thinking.|Lock the doors, because I'm only saying this once.|Somebody has to say it, so I will.]",
    "[You want a hot take? Here's a hot take.|Phones are lit up this morning, and the callers are right.|I said it in August and I'll say it again.]",
    "[Big Lou doesn't do lukewarm.|Spare me the 'it's just one game' stuff.|Mark it down.]",
  ],
  "kick.column": [
    "[The rest of the season will tell us whether that's a trend or a blip.|We'll know a lot more in a month.|Remember this one when the standings settle.]",
    "[For now, that's the story.|That's the part that should worry somebody.|File it away.]",
  ],
  "kick.column.hot": ["[And if you disagree, that's what the comments are for.|You heard it here.|Don't say nobody warned you.]"],
  "kick.hottake": [
    "[Call in and tell me I'm wrong.|I'll be here all week.|Lines are open.]",
    "[That's the show. Argue with your friends.|Bookmark it.|You can thank me in January.]",
  ],
  "kick.report": [
    "[More as it develops.|The team has not commented.|Expect more details in the coming days.]",
    "[Nothing is final until the paperwork is filed.|Both sides declined to comment on the record.|The league office has been informed.]",
  ],
  "kick.analytics": [
    "[The numbers don't care about narratives.|Small samples lie, but this one is getting bigger.|Process over results, until the results stop showing up.]",
    "[It's one data point. It's also the kind that predicts.|Regression is coming for somebody; the question is who.]",
  ],
  "kick.film": [
    "[Watch it again with that in mind and the game looks different.|That's where it was won, and it's repeatable.|Coaches will copy that by next week.]",
  ],
  "kick.notebook": [
    "[Practice resumes Wednesday.|The locker room was quiet afterward, and nobody was in a hurry to leave.|The team is back on the field midweek.]",
    "[Next up is a short week.|The coaching staff meets with the front office Monday morning.|Players had the day off Tuesday.]",
  ],
  "kick.breakdown": [
    "[The cap math always comes due. The only question is when.|Every dollar here is a dollar that can't go somewhere else.|Restructures can push it down the road, not away.]",
  ],
  "kick.feature": [
    "[He isn't done yet.|The rest of the league has noticed.|The next chapter starts next week.]",
  ],
  "kick.grades": ["[Grades at signing are a guess; the real ones come in two years.|Ask again in December.]"],
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
