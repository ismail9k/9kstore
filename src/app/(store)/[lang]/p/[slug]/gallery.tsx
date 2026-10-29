"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { Photo } from "@/components/photo";
import type { Photo as PhotoData } from "@/lib/catalog/schema";

import { DRAG_THRESHOLD } from "../../rail-snap";
import { settlePhoto } from "./gallery-snap";

type Drag = { pointerId: number; startX: number; startScroll: number; startIndex: number; moved: boolean };

/**
 * The selected color's photos as a swipeable scroll-snap strip on a square
 * tile, with position dots. No library, no arrows, no zoom. The strip is
 * always `dir="ltr"` so the first photo sits at scrollLeft 0 in both
 * languages. A color with no photos shows the bare tile.
 *
 * Touch swiping is the browser's own. A mouse drag (past `DRAG_THRESHOLD`)
 * scrolls the strip too: snapping and smooth scrolling are off while it moves
 * (`data-dragging`), and on release it glides to the photo `settlePhoto`
 * picks. The browser's native drag of the images is off.
 */
export function Gallery({
  photos,
  alt,
  priorityFirst,
}: {
  photos: PhotoData[];
  alt: string;
  priorityFirst: boolean;
}) {
  const strip = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const [index, setIndex] = useState(0);
  const firstKey = photos[0]?.key;

  // A new color replaces the list: start again at its first photo.
  const [shownKey, setShownKey] = useState(firstKey);
  if (shownKey !== firstKey) {
    setShownKey(firstKey);
    setIndex(0);
  }
  // Before paint, so the old color's scroll position never shows for a frame.
  useLayoutEffect(() => {
    // `scroll-smooth` is for swipes; the reset jumps.
    strip.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [firstKey]);

  function endDrag(e: PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    const el = e.currentTarget;
    const target = settlePhoto(d.startIndex, el.scrollLeft, el.clientWidth, photos.length);
    delete el.dataset.dragging;
    el.scrollTo({
      left: target * el.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <div dir="ltr" className="relative aspect-square overflow-hidden rounded-[10px] bg-muted">
      {photos.length > 0 && (
        <ul
          ref={strip}
          onScroll={(e) => {
            const { scrollLeft, clientWidth } = e.currentTarget;
            if (clientWidth > 0) setIndex(Math.round(scrollLeft / clientWidth));
          }}
          onPointerDown={(e) => {
            const el = e.currentTarget;
            if (e.pointerType !== "mouse" || e.button !== 0 || photos.length < 2 || el.clientWidth <= 0) return;
            drag.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startScroll: el.scrollLeft,
              startIndex: Math.round(el.scrollLeft / el.clientWidth),
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.pointerId) return;
            const el = e.currentTarget;
            const dx = e.clientX - d.startX;
            if (!d.moved) {
              if (Math.abs(dx) < DRAG_THRESHOLD) return;
              d.moved = true;
              el.dataset.dragging = "";
              el.setPointerCapture(e.pointerId);
            }
            el.scrollLeft = d.startScroll - dx;
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDragStart={(e) => e.preventDefault()}
          className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth select-none [scrollbar-width:none] data-dragging:snap-none data-dragging:scroll-auto [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, i) => (
            <li key={photo.key} className="h-full w-full shrink-0 snap-center">
              <Photo
                photo={photo}
                alt={alt}
                sizes="(min-width: 768px) 50vw, 100vw"
                className="size-full object-contain"
                priority={priorityFirst && i === 0}
                draggable={false}
              />
            </li>
          ))}
        </ul>
      )}
      {photos.length > 1 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {photos.map((photo, i) => (
            <span
              key={photo.key}
              className={`size-1.5 rounded-full ${i === index ? "bg-foreground" : "bg-foreground/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
