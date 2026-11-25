"use client";

import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import { centeredScroll, DRAG_THRESHOLD, snapScroll } from "./rail-snap";

const subscribe = () => () => {};

// The hydrated scroller's opening position as a shift, for the server's HTML:
// the content (W wide) moved so the middle tee's center (C) sits at the
// screen's center, clamped to the reachable range like a scroll is. A tee is
// --tee wide and overlaps each neighbour by a ninth of it, so tees are
// 7/9 --tee apart and the row is padded by 1/9 --tee each side (`rail.tsx`).
const W = "var(--tee) * (7 * var(--n) + 2) / 9";
const C = "var(--tee) * (14 * var(--mid) + 9) / 18";
const OPENING_SHIFT = `translateX(clamp(min(0px, 100vw - ${W}), 50vw - ${C}, 0px))`;

type Drag = { pointerId: number; startX: number; startScroll: number; moved: boolean };

/**
 * The rail's sideways scroller: where the tees run off the screen's edges (a
 * phone), they and the bar slide along to bring the outer ones into view.
 * Always LTR, like the rail. `children` (the bar and the row of tees) sit in a
 * max-content box at least as wide as the screen, so the bar spans every tee
 * and fills the screen at any scroll position. That box carries `className`
 * (it sets `--tee`) and the tee count and middle index as `--n` and `--mid`.
 *
 * It opens with the `middle` tee centered. Until hydration there is no scroll
 * position to set, so the box is shifted by the same amount and only clipped;
 * once hydrated it becomes a scroll container scrolled there, set before
 * paint, so nothing moves.
 *
 * Touch scrolling is the browser's own. A mouse drag (past `DRAG_THRESHOLD`)
 * scrolls too, then snaps to the nearest tee (`[data-tee]`), and swallows
 * the click that ends it so it doesn't open a tee; a plain click still does.
 * The browser's native drag of the tees' links and images is off.
 */
export function RailScroll({
  count,
  middle,
  className,
  children,
}: {
  count: number;
  middle: number;
  className: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  useLayoutEffect(() => {
    const el = scroller.current;
    const tee = el?.querySelectorAll<HTMLElement>("[data-tee]")[middle];
    if (hydrated && el && tee) {
      el.scrollLeft = centeredScroll(tee.offsetLeft + tee.offsetWidth / 2, el.clientWidth, el.scrollWidth);
    }
  }, [hydrated, middle]);

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    swallowClick.current = true;
    const el = e.currentTarget;
    const centers = [...el.querySelectorAll<HTMLElement>("[data-tee]")].map((t) => t.offsetLeft + t.offsetWidth / 2);
    el.scrollTo({
      left: snapScroll(el.scrollLeft, centers, el.clientWidth, el.scrollWidth),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div
      ref={scroller}
      dir="ltr"
      className={`-mx-[50vw] w-screen self-center overflow-y-hidden select-none ${
        hydrated
          ? "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "overflow-x-hidden"
      }`}
      onPointerDown={(e) => {
        swallowClick.current = false;
        const el = e.currentTarget;
        if (e.pointerType !== "mouse" || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
        drag.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        const dx = e.clientX - d.startX;
        if (!d.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;
          d.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        e.currentTarget.scrollLeft = d.startScroll - dx;
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        style={
          {
            "--n": count,
            "--mid": middle,
            transform: hydrated ? undefined : OPENING_SHIFT,
          } as CSSProperties
        }
        className={`relative w-max min-w-full ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
