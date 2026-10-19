"use client";

import { useEffect, useRef, useState } from "react";

import { Photo } from "@/components/photo";
import type { Photo as PhotoData } from "@/lib/catalog/schema";

/**
 * The selected color's photos as a swipeable scroll-snap strip on a square
 * tile, with position dots. No library, no arrows, no zoom. The strip is
 * always `dir="ltr"` so the first photo sits at scrollLeft 0 in both
 * languages. A color with no photos shows the bare tile.
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
  const [index, setIndex] = useState(0);
  const firstKey = photos[0]?.key;

  // A new color replaces the list: start again at its first photo.
  const [shownKey, setShownKey] = useState(firstKey);
  if (shownKey !== firstKey) {
    setShownKey(firstKey);
    setIndex(0);
  }
  useEffect(() => {
    // `scroll-smooth` is for swipes; the reset jumps.
    strip.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [firstKey]);

  return (
    <div dir="ltr" className="relative aspect-square overflow-hidden rounded-[10px] bg-muted">
      {photos.length > 0 && (
        <ul
          ref={strip}
          onScroll={(e) => {
            const { scrollLeft, clientWidth } = e.currentTarget;
            if (clientWidth > 0) setIndex(Math.round(scrollLeft / clientWidth));
          }}
          className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, i) => (
            <li key={photo.key} className="h-full w-full shrink-0 snap-center">
              <Photo
                photo={photo}
                alt={alt}
                sizes="(min-width: 768px) 50vw, 100vw"
                className="size-full object-contain"
                priority={priorityFirst && i === 0}
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
