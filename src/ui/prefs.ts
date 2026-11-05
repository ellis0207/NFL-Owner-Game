// Per-viewer display preferences (text size, contrast, which Today panels show).
// They live in this browser only; every read and write tolerates blocked storage.
export interface Prefs {
  textSize: number;
  contrast: "normal" | "high";
  hidden: string[];
}

const KEY = "nfl-owner-prefs";
const DEFAULTS: Prefs = { textSize: 1, contrast: "normal", hidden: [] };

export function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the preference lasts for this visit only.
  }
  applyPrefs(p);
}

export function applyPrefs(p: Prefs = readPrefs()): void {
  const root = document.documentElement;
  root.style.fontSize = `${Math.round(16 * p.textSize)}px`;
  if (p.contrast === "high") root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
}
