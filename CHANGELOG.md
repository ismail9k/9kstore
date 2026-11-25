# Changelog

All notable changes to 9k Store are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-25

The first production release: a bilingual catalog where customers browse
products and send an order through WhatsApp, with an admin where the owner
manages the catalog.

### Added

- **Catalog home page** with the hanging-rail hero and the product grid, in
  the owner's order. Sold-out products stay visible, marked "Sold out". The
  rail scrolls and drags with a mouse. Footer links to Instagram and WhatsApp.
  (#4, #11, #14)
- **Product page** at `/<lang>/p/<slug>`, with a swipeable gallery that follows
  the selected color, color and size pickers, sold-out sizes shown but
  disabled, and the size chart. (#5, #12)
- **Order on WhatsApp**: the button opens WhatsApp with the order message
  already typed, in the customer's language, with the product, color, size,
  price in EGP, code and a link back to the product. Stock is checked again
  on the tap, so a sold-out size never opens WhatsApp. It works in
  Instagram's in-app browser. (#5, #12)
- **Arabic and English** on every customer page, with a right-to-left Arabic
  layout, a language toggle that is remembered for the bare domain, and
  prices, sizes and codes that stay readable inside Arabic text. Arabic is
  the default. (#6, #9)
- **Shareable product links**: `?color=` opens a product on that color, link
  previews show the product's photo, name and price in the link's language,
  and a hidden product's link shows a "no longer available" page instead of a
  404. (#7, #13)
- **Owner admin** at `/admin` behind a single owner login: add, edit, publish,
  hide and reorder products, mark sizes sold out per color, and edit the
  store settings (WhatsApp number, order greeting, Instagram link, name and
  logo). Changes reach the live site without a deploy. (#2, #8)
- **Photo upload and delivery**: full-size photos are resized and compressed
  on upload through Cloudflare Images, stored in R2, and served in modern
  formats at screen-fitting sizes. (#3, #10)
- **Edge caching**: the catalog and product pages are served from Workers
  Cache, and every admin save purges the pages it changes. (#19)
- **Analytics** with PostHog in the browser only: page views, error tracking,
  session replay with inputs masked, and an `order_tapped` event. Visitors
  stay anonymous, and nothing under `/admin` is tracked. (#20)

### Security

- The owner login allows 5 tries in 15 minutes per address (an IPv6 /64
  counts as one), devices that have never logged in share 20 tries an hour,
  and a device that has logged in before keeps its own limit. (#15, #17)
- The login only checks passwords posted straight to `/admin/login`, and
  refuses attempts forwarded from other pages. (#16, #18)

### Deployment

- Production runs on the `9k-store` Worker at `https://store.9k.school`,
  deployed from `main` by Workers Builds, with Workers Logs on.
- The production D1 database needs migrations `0001` to `0003` applied
  (`pnpm db:migrate:prod`) before the first deploy, and the Worker needs the
  `ADMIN_PASSWORD` and `SESSION_SECRET` secrets. See the README's
  "First-time setup".

[Unreleased]: https://github.com/ismail9k/9kstore/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ismail9k/9kstore/releases/tag/v1.0.0
