// The top of every page: the room's picture (rendered in Blender, pipeline/art)
// behind the page's title, with the place it stands for and a line on what the
// page holds. The picture is optional: if it doesn't arrive, the band keeps
// the room's own color.
import type { ReactNode } from "react";
import { PAGE_ART, PAGE_HINT, PAGE_TITLE, ROOM_PLACE, roomOf, type Screen } from "./nav";

export function Masthead({ screen, title, children }: {
  screen: Screen;
  /** Overrides the page's usual title, such as the draft's year. */
  title?: string;
  /** Under the title: figures or controls that belong in the header. */
  children?: ReactNode;
}) {
  const room = roomOf(screen);
  return (
    <header className="mh" data-room={room} style={{ ["--mh-art" as string]: `url("art/${PAGE_ART[screen] ?? room}.webp")` }}>
      <div className="mh-text">
        <span className="mh-kicker">{ROOM_PLACE[room]}</span>
        <h1 className="mh-title">{title ?? PAGE_TITLE[screen] ?? screen}</h1>
        <p className="mh-hint">{PAGE_HINT[screen]}</p>
        {children}
      </div>
      <span className="mh-rule" aria-hidden="true" />
    </header>
  );
}

/** A small line drawing for each sidebar group, in the sidebar's text color. */
export function RoomIcon({ group }: { group: string }) {
  const p = ICON[group];
  if (!p) return null;
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  );
}

const ICON: Record<string, ReactNode> = {
  // A desk lamp over the desk.
  home: <><path d="M2 14h12" /><path d="M5 14V9l4-4" /><path d="M7.5 3.5l3 3-3 1.5-1.5-1.5z" /></>,
  // A whistle.
  team: <><circle cx="6" cy="9.5" r="3.5" /><path d="M8.5 7l5-2v3l-4.2 0.8" /><circle cx="6" cy="9.5" r="0.8" /></>,
  // A ledger with a column of figures.
  moves: <><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 5h4M6 8h4M6 11h2" /></>,
  // An index card pinned to a board.
  draft: <><rect x="2" y="4" width="12" height="9" rx="1" /><path d="M5 8h6M5 10.5h4" /><circle cx="8" cy="4" r="1.2" /></>,
  // A building with columns.
  office: <><path d="M2 6l6-3.5L14 6" /><path d="M3 14h10" /><path d="M4.5 7v5.5M8 7v5.5M11.5 7v5.5" /></>,
  // A trophy.
  league: <><path d="M5 2.5h6v3a3 3 0 0 1-6 0z" /><path d="M5 4H3a2 2 0 0 0 2 2.5M11 4h2a2 2 0 0 1-2 2.5" /><path d="M8 8.5V11M5.5 13.5h5l-.6-2.5H6.1z" /></>,
  // A gear.
  game: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4" /></>,
};
