import type { Photo as PhotoData } from "@/lib/catalog/schema";
import { photoAspect, photoSrc, photoSrcSet } from "@/lib/photos/urls";

/**
 * A product photo on a customer page: one `<img>` that lets the browser pick
 * the WebP copy that fits the slot (`srcset` + `sizes`) and reserves the box
 * from the stored dimensions. No hooks, no `"use client"`: safe in a Server
 * Component and ships no JavaScript.
 *
 * `sizes` is the slot's CSS width and is required:
 * - catalog cards (#4): `"(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"`,
 *   all lazy (they sit below the hero);
 * - the home page rail's tees (#4): `"(min-width: 1024px) 224px, (min-width: 640px) 30vw, 46vw"`,
 *   with `priority` (they are the above-the-fold photos);
 * - the product gallery (#5): `"(min-width: 768px) 50vw, 100vw"`.
 *
 * `priority` is for photos above the fold: eager, `fetchpriority="high"`.
 * The link-preview image (`og:image`, #7) is not this component: use
 * `photoOgSrc` from `@/lib/photos/urls`.
 */
export function Photo({
  photo,
  alt,
  sizes,
  priority = false,
  className,
}: {
  photo: PhotoData;
  /** The caller's responsibility; `""` for a decorative photo. */
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const aspect = photoAspect(photo);
  return (
    // A plain <img>: photos are served as ready-made variants by our own
    // /photos/[id]/[file] route, not by next/image (spec, Call 4).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoSrc(photo)}
      srcSet={photoSrcSet(photo)}
      sizes={sizes}
      alt={alt}
      className={className}
      width={aspect?.width}
      height={aspect?.height}
      loading={priority ? undefined : "lazy"}
      decoding={priority ? undefined : "async"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
