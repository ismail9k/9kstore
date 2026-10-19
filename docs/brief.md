# 9k Store — Catalog Site Brief

Status: draft v1 · 2026-10-18

## What this is

A catalog website for 9k Store, a single clothing brand. Customers browse the
products, choose one with its color and size, and tap a button. The button opens
WhatsApp with the order already written out: product, color, size and price. The
owner confirms the order and handles payment and delivery in that chat.

It serves one shop. It is not a platform or a marketplace, and it is not a
checkout.

## Why

Customers already order through WhatsApp, usually after finding the brand on
Instagram. Today they have to describe what they want in their own words ("the
black one from your story, medium?"), and the owner replies with photos and
prices. The site does that step for them: the customer sees everything that's
available, and the first message the owner receives is already a complete,
unambiguous order.

## What success looks like

- A customer coming from an Instagram link reaches a correct WhatsApp order
  message in under 30 seconds, on a phone, without help.
- Orders arrive with no follow-up questions about which product, color, size or
  price.
- The owner can add a new product with photos, or mark a size as sold out, from
  a laptop in a couple of minutes, without touching code.

## Goals (v1)

1. A browsable, mobile-first catalog of the brand's products.
2. A product page with a photo gallery, color choice, size choice and price.
3. A WhatsApp order button that opens a pre-written order message.
4. Arabic and English, with a toggle and correct right-to-left layout for Arabic.
5. Prices in Egyptian pounds (EGP).
6. Sold-out marking per color and size.
7. A password-protected admin page where the owner manages products, photos,
   prices and stock from a laptop.
8. A shareable link for each product, with a proper preview (image, name,
   price) when the link is pasted into Instagram or WhatsApp.

## Non-goals (v1)

- Customer accounts or login.
- A cart or multi-item orders. One order button sends one product.
- Online payment of any kind.
- Delivery fees, shipping zones or address collection. These are handled in
  the WhatsApp chat.
- Multiple shops, vendors or brands.
- An order database, or tracking order status. The WhatsApp chat is the record.

## Anti-goals

Any of these would make v1 a failure, even if every feature works:

- **It looks like a generic store template.** It should feel like the brand's
  own space, with the products' photos doing most of the work.
- **It's slow on mobile data,** or heavy inside Instagram's in-app browser,
  where most visitors will land.
- **The WhatsApp button doesn't work** in the Instagram in-app browser, or
  opens WhatsApp with a broken or empty message.
- **A customer can order something that's sold out,** or the price in the
  message differs from the price on the page.
- **The admin page needs technical knowledge** to use.
- **Arabic is an afterthought:** mirrored layouts that break, mixed-direction
  text that scrambles prices, or untranslated labels.

## Who uses it

- **Customers:** mostly on phones, mostly arriving from Instagram (the link in
  bio, story links, links to specific products). Arabic or English speakers in
  Egypt.
- **The owner:** one person managing the catalog from a laptop.

## Scale

Under 50 products at a time, released in small drops. Traffic comes in bursts
after an Instagram post or story.

## Customer experience

### Catalog (home)

- The brand header (9k Store logo), a language toggle, and a grid of products.
- Each card shows the main photo, name and price. If every color and size of a
  product is sold out, the card is marked "Sold out", and stays visible.
- Products appear in the order the owner sets. New products go first by
  default.
- A simple footer with links to Instagram and WhatsApp.

### Product page

- A photo gallery that can be swiped on a phone. The photos follow the selected
  color.
- Name, price in EGP, and a short description.
- A color picker that shows a swatch and the color's name.
- A size picker for the selected color. Sold-out sizes are visible but
  disabled and labeled as sold out.
- An optional size chart image, if the owner added one.
- The order button ("Order on WhatsApp" / "اطلب على واتساب"):
  - It is disabled until a size is chosen, and makes it clear that a size is
    needed.
  - It opens `https://wa.me/<owner number>?text=<message>`.
- If a product has only one color, the color picker is hidden or shown as
  already selected.

### The order message

It is written in the language the customer is browsing in, and it contains:

- the product name
- the color
- the size
- the price in EGP
- a link to the product page (so the owner sees exactly what was ordered)
- a short product code, if the product has one

Example (English):

```
Hi 9k Store, I'd like to order:
Oversized Tee — Black
Size: L
Price: 850 EGP
https://<domain>/en/p/oversized-tee?color=black
```

Example (Arabic):

```
أهلاً 9k Store، حابب أطلب:
تيشيرت أوفر سايز — أسود
المقاس: L
السعر: 850 جنيه
https://<domain>/ar/p/oversized-tee?color=black
```

The owner can edit the wording of the greeting line in the admin settings.

### Language

- Arabic and English, with a toggle on every page. The customer's choice is
  remembered.
- Every product name, description and color name has an Arabic and an English
  version.
- Arabic pages are right-to-left. Prices, sizes and product codes stay readable
  inside right-to-left text.

### Sharing

- Every product has a stable URL that can be shared in each language.
- Pasting a product link into Instagram or WhatsApp shows the product photo,
  name and price (Open Graph tags).
- A product URL can pre-select a color, so a link from a story about the black
  tee opens on the black tee.

## Owner experience (admin)

- It lives at a hidden path (for example `/admin`) behind one owner login. It
  is built for a laptop screen. It doesn't need to be optimized for phones.
- **Products list:** every product with its photo, name, price and status. The
  owner can reorder products, hide or show one (drafts are hidden from
  customers), and open one to edit it.
- **Add/edit product:**
  - name and description, in Arabic and English
  - price (EGP)
  - product code (optional)
  - sizes, a list the owner defines per product (for example S/M/L/XL, or
    30/32/34)
  - colors, each with an Arabic name, an English name, a swatch color, and its
    own photos (uploaded from the computer and reordered by dragging)
  - availability, a grid of color × size where each cell is either in stock or
    sold out
  - size chart (optional image)
  - visibility (hidden or published)
- **Settings:** the WhatsApp number orders go to, the greeting line for the
  order message (in Arabic and English), the Instagram link, and the store
  name and logo.
- Photos are resized and compressed automatically on upload, so the owner can
  upload full-size camera photos without preparing them first.
- Changes appear on the live site within a minute, with no manual "deploy"
  step.

## Product data (summary)

| Field | Notes |
|---|---|
| name | Arabic + English |
| description | Arabic + English, short |
| price | EGP. One price per product, shared by all colors and sizes |
| code | optional, shown in the order message |
| sizes | ordered list, defined per product |
| colors | each with an Arabic name, an English name, a swatch, and photos |
| availability | in stock / sold out, per color × size |
| size chart | optional image |
| visibility | published / hidden |
| sort order | set by the owner |

## Constraints

- **Mobile first.** Most visits come from Instagram's in-app browser on a phone.
- **Fast on slow connections.** Images are served in modern formats at sizes
  that fit the screen. The catalog page should be usable on 4G in about 2
  seconds.
- **The WhatsApp link must work** in iOS and Android browsers and in the
  Instagram in-app browser. Test this on real devices.
- **Low running cost.** For a site of this size, hosting should be free or
  close to it.
- **One owner account.** There is no need to manage multiple users or roles.

## Decided by the owner

- The catalog is managed through an admin page, not by editing files.
- The site is in Arabic and English, and prices are in EGP.
- Customers pick a color and a size. Stock is tracked as sold out or not, per
  size within each color.
- The catalog has under 50 products, and most traffic comes from Instagram.
- There are no accounts, no cart and no online payment. Each order is one
  product, sent through WhatsApp.

## Calls made by Claude (open to change)

- **Arabic is the default language** for a first visit, with English one tap
  away. Each language has its own URL (`/ar/...`, `/en/...`) so that shared
  links open in the right language.
- **One price per product.** Colors and sizes don't change the price.
- **Sold-out products stay visible,** marked "Sold out", rather than being
  hidden, so links shared in old stories still work.
- **There are no categories or filters in v1.** With under 50 products, a
  single grid in the owner's order is enough.
- **The size chart is in v1,** because it is an optional field and it heads off
  the most common question asked in WhatsApp.
- **Western digits (0–9) in both languages,** for prices and sizes.
- **The language in the URL wins** over a language the customer chose earlier,
  so a shared link always opens in the language it was shared in. The
  remembered choice only applies to visits to the bare domain.
- **A hidden product's link** shows a friendly "no longer available" page that
  links back to the catalog, instead of a 404.
- **Stock is checked again when the order button is tapped,** in case the page
  has been open for a while. If the size has sold out in the meantime, the
  customer is told and WhatsApp doesn't open.
- **The catalog card shows the first photo of the first color.** The owner
  controls this by ordering colors and photos.
- **Suggested stack:** host on Cloudflare (Workers for the site and the admin,
  D1 for product data, R2 for photos). This fits the low-cost constraint and
  updates the site instantly without a rebuild. The builder may choose another
  stack that meets the constraints above.

## Left to the builder

- Framework, component library and styling approach.
- How the admin login works (a single password, a magic link to the owner's
  email, or Cloudflare Access), as long as it is secure and easy to use.
- How images are processed and served.
- The exact visual design, within the anti-goals. The owner supplies the logo
  and brand colors.

## Open items for the owner

- The WhatsApp number that orders go to.
- The domain name.
- The logo files, brand colors and any fonts.
- The first batch of products and photos (to test with and to launch with).

## Backlog (good ideas, not v1)

- **Cart / multi-item order:** pick several products and send them in one
  WhatsApp message.
- **Quantity selector** in the order message.
- **Sale prices:** show the old price struck through next to the new one.
- **Categories and filters** (tops, bottoms, accessories) once the catalog
  grows.
- **Drops:** a scheduled release time with a countdown and a "coming soon"
  page.
- **Back-in-stock requests:** the customer taps "notify me" and it opens
  WhatsApp with a restock request for that size.
- **Order-tap analytics:** count WhatsApp button taps per product, color and
  size, in a privacy-friendly way, to see what sells.
- **Meta pixel / Instagram Shopping:** export the catalog as a product feed for
  Instagram Shopping tags and dynamic ads.
- **Delivery info:** cities, delivery fees and times, shown on the product page
  or added to the order message.
- **Promo codes** that are included in the WhatsApp message.
- **Lookbook pages:** styled outfit photos that link to the products in them.
- **Customer photos / reviews.**
- **Photo storage sweep:** delete R2 objects no product references (removed
  photos keep their files in v1).
- **Search,** once there are more than about 50 products.
- **Phone-friendly admin,** at least for quick jobs like marking a size sold
  out.
- **Multiple admin users** (for example, a helper who only marks stock).
- **WhatsApp Business API automation:** auto-replies and order confirmations.
- **Low-stock counts** ("only 2 left") instead of just in stock or sold out.
