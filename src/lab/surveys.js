// Game patch: the OpenStreetMap district outlines (ODbL 1.0, © OpenStreetMap
// contributors) are about 2.3 MB, so the game serves them beside the page as
// lab/site-surveys.json and loads them when the Stadium page opens, instead of
// inlining site-surveys.js. Until they arrive a district draws without them.
export const surveys = {};
export function setSurveys(s){Object.assign(surveys,s);}
