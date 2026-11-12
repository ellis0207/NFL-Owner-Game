import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameState } from "../engine/types";
import { tipCard, type TipCard } from "./tips";

/** One open card: what it is about and the element it hangs from. Level 1 hangs from the page, level 2 from inside level 1, and so on. */
interface Open {
  key: string;
  el: Element;
  /** Opened by a long press: it stays until a tap elsewhere. */
  pinned: boolean;
  /** A plain `title` on the same element: shown at the top of the card. */
  note?: string;
}

const OPEN_DELAY = 280;
/** A card inside a card waits a little longer, so sweeping the mouse across one doesn't flash the next. */
const NEST_DELAY = 420;
/** Time to move the mouse from a name into its card before the card closes. */
const CLOSE_DELAY = 260;
const LONG_PRESS = 450;
const TARGETS = "[data-tip],[data-tip-text],[title]";

/** The level of card a node sits in: 0 for the page. */
function levelOf(node: Element | null): number {
  const card = node?.closest("[data-tip-level]");
  return card ? Number(card.getAttribute("data-tip-level")) : 0;
}

/** The nearest element with a card. A plain `title` moves to `data-tip-text` so the browser's own tooltip doesn't show as well. */
function targetOf(node: Element | null): Element | null {
  const el = node?.closest?.(TARGETS);
  if (!el) return null;
  const title = el.getAttribute("title");
  if (title !== null) {
    el.removeAttribute("title");
    if (title) el.setAttribute("data-tip-text", title);
  }
  if (!el.getAttribute("data-tip") && !el.getAttribute("data-tip-text")) return null;
  return el;
}

function keyOf(el: Element): string {
  return el.getAttribute("data-tip") ?? `text:${el.getAttribute("data-tip-text") ?? ""}`;
}

/**
 * Hover cards for the whole game. Rest the mouse on a name, a figure or a
 * button to see its card; move into the card and rest on a name there for a
 * card about that. On a touch screen, press and hold instead; tap anywhere
 * else to close. Escape, scrolling or a click closes them.
 */
export function TipLayer({ game }: { game: GameState }) {
  const [stack, setStack] = useState<Open[]>([]);
  const ref = useRef(stack);
  ref.current = stack;

  useEffect(() => {
    let timer = 0;
    let press = 0;
    let pressAt: { x: number; y: number } | null = null;
    let eatClick = false;
    const later = (fn: () => void, ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(fn, ms); };
    const open = (el: Element, level: number, pinned: boolean) =>
      setStack((s) => [...s.slice(0, level), { key: keyOf(el), el, pinned, note: el.getAttribute("data-tip") ? el.getAttribute("data-tip-text") ?? undefined : undefined }]);
    const keep = (level: number) => setStack((s) => (s.length > level ? s.slice(0, level) : s));

    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const node = e.target as Element;
      const level = levelOf(node);
      const el = targetOf(node);
      const s = ref.current;
      // Cards opened by a long press stay put until a tap elsewhere.
      if (s.some((o) => o.pinned)) return;
      if (el && s[level]?.el === el) { window.clearTimeout(timer); keep(level + 1); return; }
      if (el) later(() => { if (el.isConnected) open(el, level, false); }, level ? NEST_DELAY : OPEN_DELAY);
      else if (s.length > level) later(() => keep(level), CLOSE_DELAY);
      else window.clearTimeout(timer);
    }
    function leaveWindow(e: PointerEvent) {
      if (e.pointerType === "touch" || e.relatedTarget) return;
      if (!ref.current.some((o) => o.pinned)) later(() => keep(0), CLOSE_DELAY);
    }
    function down(e: PointerEvent) {
      const node = e.target as Element;
      const level = levelOf(node);
      if (e.pointerType !== "touch") {
        // A click on the page closes the cards; a click inside one leaves it to the click.
        if (!level) { window.clearTimeout(timer); keep(0); }
        return;
      }
      if (!level && ref.current.length) keep(0);
      const el = targetOf(node);
      if (!el) return;
      pressAt = { x: e.clientX, y: e.clientY };
      window.clearTimeout(press);
      press = window.setTimeout(() => {
        pressAt = null;
        eatClick = true;
        window.setTimeout(() => { eatClick = false; }, 800);
        navigator.vibrate?.(8);
        if (el.isConnected) open(el, level, true);
      }, LONG_PRESS);
    }
    function move(e: PointerEvent) {
      if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) { window.clearTimeout(press); pressAt = null; }
    }
    function up() { window.clearTimeout(press); pressAt = null; }
    // The tap that ends a long press shouldn't also press the button underneath.
    function click(e: MouseEvent) {
      if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); return; }
      if (levelOf(e.target as Element)) window.setTimeout(() => keep(0), 0);
    }
    function menu(e: Event) { if (pressAt || eatClick) e.preventDefault(); }
    function key(e: KeyboardEvent) { if (e.key === "Escape" && ref.current.length) keep(0); }
    function scroll(e: Event) {
      // Scrolling inside a card is fine; scrolling the page moves the names out from under the cards.
      if (e.target instanceof Element && e.target.closest("[data-tip-level]")) return;
      if (ref.current.length) keep(0);
    }
    // Keyboard users get the card of whatever has focus.
    function focus(e: FocusEvent) {
      const node = e.target as Element;
      if (!node.matches?.(":focus-visible")) return;
      const el = targetOf(node);
      if (el === node) later(() => open(el, levelOf(node), false), OPEN_DELAY);
    }
    function blur(e: FocusEvent) { if (!levelOf(e.relatedTarget as Element | null)) later(() => keep(0), CLOSE_DELAY); }

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", leaveWindow);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu, true);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(press);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", leaveWindow);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu, true);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
    };
  }, []);

  // A card whose name left the page (a drawer closed, a row went away) closes with it.
  const live = stack.filter((o) => o.el.isConnected);
  return (
    <>
      {live.map((o, i) => <Card key={`${i}-${o.key}`} game={game} open={o} level={i + 1} onClose={() => setStack((s) => s.slice(0, i))} />)}
    </>
  );
}

function Card({ game, open, level, onClose }: { game: GameState; open: Open; level: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Read fresh every render: the card follows the game as days pass.
  let card: TipCard | null;
  if (open.key.startsWith("text:")) card = { title: "", body: open.key.slice(5) };
  else {
    try { card = tipCard(game, open.key); } catch { card = null; }
  }

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = open.el.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 6;
    let top = r.bottom + gap;
    if (top + h > vh - 8 && r.top - gap - h >= 8) top = r.top - gap - h;
    let left = r.left;
    // A card opened from inside another sits beside it, so both stay readable.
    const parent = level > 1 ? document.querySelector(`[data-tip-level="${level - 1}"]`)?.getBoundingClientRect() : undefined;
    if (parent) {
      if (parent.right + gap + w <= vw - 8) { left = parent.right + gap; top = r.top - 10; }
      else if (parent.left - gap - w >= 8) { left = parent.left - gap - w; top = r.top - 10; }
    }
    top = Math.max(8, Math.min(top, vh - h - 8));
    left = Math.max(8, Math.min(left, vw - w - 8));
    if (!pos || pos.left !== left || pos.top !== top) setPos({ left, top });
  });

  if (!card) return null;
  const plain = open.key.startsWith("text:");
  return (
    <div
      ref={box}
      className={`tip${plain ? " plain" : ""}`}
      role="tooltip"
      data-tip-level={level}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, zIndex: 60 + level }}
    >
      {open.pinned && <button className="tip-close" aria-label="Close" onClick={onClose}>×</button>}
      {card.title && <div className="tip-title">{card.title}</div>}
      {card.sub && <div className="tip-sub">{card.sub}</div>}
      {open.note && <div className="tip-note tip-flag">{open.note}</div>}
      {card.body && <div className="tip-body">{card.body}</div>}
      {card.foot && <div className="tip-foot">{card.foot}</div>}
    </div>
  );
}
