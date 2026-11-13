// Per-viewer display preferences (text size, contrast, which Today panels show).
// They live in this browser only; every read and write tolerates blocked storage.
export interface Prefs {
  textSize: number;
  contrast: "normal" | "high";
  hidden: string[];
  /** Step through your own games a drive at a time when you play them from the Today page. */
  followGames: boolean;
  /** Draw the players on the field view and act out the plays it can. */
  animate: boolean;
  /** Sidebar sections the owner has folded away. */
  navClosed: string[];
  /** Light or dark pages, or follow the device. */
  theme: "auto" | "light" | "dark";
}

const KEY = "nfl-owner-prefs";
const DEFAULTS: Prefs = { textSize: 1, contrast: "normal", hidden: [], followGames: true, animate: true, navClosed: [], theme: "auto" };

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
  if (p.theme === "light" || p.theme === "dark") root.setAttribute("data-theme", p.theme);
  else root.removeAttribute("data-theme");
}
