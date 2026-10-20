import type { Photo } from "@/lib/catalog/schema";
import { photoSrc } from "@/lib/photos/urls";

/** A soft-cornered photo-tile square; shows the photo when there is one. */
export function PhotoTile({ photo, size }: { photo: Photo | null; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg bg-muted"
      style={{ width: size, height: size }}
    >
      {photo ? (
        // A plain <img>: photos are served by /photos/[id]/[file], not next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={photoSrc(photo, 320)} width={size} height={size} className="size-full object-cover" />
      ) : null}
    </div>
  );
}
