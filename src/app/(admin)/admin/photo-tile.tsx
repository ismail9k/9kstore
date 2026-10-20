import type { Photo } from "@/lib/catalog/schema";
import { photoSrc } from "@/lib/catalog/photo-src";

/** A soft-cornered photo-tile square; shows the photo when there is one. */
export function PhotoTile({ photo, size }: { photo: Photo | null; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg bg-muted"
      style={{ width: size, height: size }}
    >
      {photo ? (
        // A plain <img>: photos are served by our own route (#3), not next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={photoSrc(photo)} width={size} height={size} className="size-full object-cover" />
      ) : null}
    </div>
  );
}
