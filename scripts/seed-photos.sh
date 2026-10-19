#!/bin/sh
# Puts the brand's cutouts (docs/brand/photos/*.webp) into the LOCAL photos
# bucket as masters, so the dev seed product (migrations/seed/dev.sql) has
# real photos. Variants are made by the serving route on first request.
# Local only: `--local` writes to Miniflare's state under .wrangler/, never
# to Cloudflare. The local bucket is named after the top-level bucket_name in
# wrangler.jsonc. Run from the repo root: `pnpm photos:seed:local`.
#
# POSIX sh (`pnpm` runs it as `sh scripts/seed-photos.sh`), so `set -eu`:
# `pipefail` is not POSIX and there are no pipelines here.
set -eu

found=0
for f in docs/brand/photos/*.webp; do
  [ -e "$f" ] || continue
  found=1
  name=$(basename "$f" .webp)
  pnpm exec wrangler r2 object put "9k-store-photos/photos/seed-${name}/master" \
    --file "$f" --content-type image/webp --local
done

if [ "$found" -eq 0 ]; then
  echo "No photos found in docs/brand/photos/ (run from the repo root)." >&2
  exit 1
fi
