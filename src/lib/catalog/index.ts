/**
 * The catalog: schemas, pure helpers and the D1 data-access layer.
 *
 * Server-only: this index pulls in `./repo`, which imports "server-only".
 * Client components must import from `./schema` and `./helpers` directly.
 *
 * Reads are never cached. Customer pages that show product data must opt out
 * of static rendering and read at request time, so admin edits go live
 * without a deploy. The catalog and product pages are cached as whole
 * responses by Workers Cache instead, and the admin's writes purge them
 * (`src/lib/cache`).
 */
export * from "./schema";
export * from "./helpers";
export * from "./repo";
