// The stylesheets are split by room (src/ui/styles). Two files that both
// define the same class clash the way the field view's `.field` once broke
// the form fields (PR #60), so each class is owned by one file, and the room
// files and shared pieces only define classes under their own prefix.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "src/ui/styles";
const files = [
  ...readdirSync(DIR).filter((f) => f.endsWith(".css")),
  ...readdirSync(join(DIR, "rooms")).filter((f) => f.endsWith(".css")).map((f) => `rooms/${f}`),
];

/** Prefixes a file's own classes must carry; files not listed are the older, shared ones. */
const PREFIX: Record<string, string[]> = {
  "kit.css": ["kit-"],
  "masthead.css": ["mh", "nav-head-label", "nav-icon", "page-body"],
  "rooms/desk.css": ["dk-"],
  "rooms/team.css": ["tm-"],
  "rooms/building.css": ["rb-"],
  "rooms/draft.css": ["wr-"],
  "rooms/office.css": ["bd-"],
  "rooms/league.css": ["lg-"],
  "rooms/game.css": ["ut-"],
  "lab.css": ["sl-", "district-labels"],
};

/**
 * The classes a file defines: selectors that are one class on its own (with
 * an element or a state like :hover). A class restyled in context (`.side
 * .badge`) or for a room (`.main[data-room]`) is not a new definition.
 */
function owned(css: string): Set<string> {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of body.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (head.startsWith("@")) continue;
    for (const sel of head.split(",")) {
      const c = sel.trim().match(/^(?:[a-z]+)?\.([a-zA-Z][\w-]*)(?::{1,2}[\w-]+(?:\([^)]*\))?)*$/);
      if (c) out.add(c[1]);
    }
  }
  return out;
}

describe("stylesheets", () => {
  const byFile = new Map(files.map((f) => [f, owned(readFileSync(join(DIR, f), "utf8"))]));

  it("each class is defined by one file", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [file, classes] of byFile) {
      for (const c of classes) {
        const other = seen.get(c);
        if (other && other !== file) clashes.push(`.${c} in ${other} and ${file}`);
        else seen.set(c, file);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("room files and shared pieces define only their own prefixed classes", () => {
    const stray: string[] = [];
    for (const [file, prefixes] of Object.entries(PREFIX)) {
      for (const c of byFile.get(file) ?? []) {
        if (!prefixes.some((p) => c.startsWith(p))) stray.push(`.${c} in ${file}`);
      }
    }
    expect(stray).toEqual([]);
  });
});
