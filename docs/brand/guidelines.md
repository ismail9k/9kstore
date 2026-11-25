# 9k Store — Brand Guidelines

Status: v1 · 2026-10-18

How 9k Store looks on the web. [`docs/brief.md`](../brief.md) says what the
site does; this file says how it should feel and what it's made of. Where the
two disagree, the brief wins on features and this file wins on looks.

## The idea

The site should feel like the brand's own shop wall: off-white, quiet, with
the clothes hanging on a rail doing most of the work. One green, used
sparingly, marks the brand and whatever the customer has picked.

[`reference.webp`](reference.webp) is the style to follow: the off-white
page, the heavy headline, the tees hanging on a metal rail, the green pill
button. Copy the style, not the features. The reference shows a cart, a
search icon, a cart count and an "Only 3 left" badge; 9k Store has none of
these. Customers order one product at a time on WhatsApp (see the brief's
non-goals).

## Color

Three colors. Nothing else is added.

| Color | Hex | Job |
|---|---|---|
| Green | `#1F4F34` | The only accent. The brand, and the customer's choices. |
| Off-white | `#F1EDE7` | The page. |
| Near-black | `#0A0A0A` | Text, and sold-out marks. |

### Where green goes

Green has one job: it marks the brand and what the customer has chosen. It
appears on:

- the logo
- the accent line of a headline
- prices
- the selected color (its ring) and the selected size
- the primary button, including the WhatsApp order button
- focus rings

Everything else is near-black on off-white. Green is never a background band,
header bar or footer block.

### Shades mixed from the three

These are the only in-between shades. Each comes from the three colors above.

| Shade | Value | Use |
|---|---|---|
| Photo tile | `#E7E2DA` | Behind flat photos in the product grid |
| Muted text | near-black at 65% on off-white (`#5B5957`) | Secondary text: subtitles, the "4 colors" line, the footer |
| Line | near-black at 13% on off-white (`#D3CFCA`) | Borders, dividers, unselected size chips |
| Faded | near-black at 40% on off-white (`#95928F`) | Sold-out size labels (always struck through as well) |

### Rules

- **No other accent colors.** No red for sale or errors, no blue links, no
  WhatsApp's own bright green on the order button. The order button is brand
  green.
- **Sold out is near-black, not red.** A sold-out size is struck through and
  faded. A product that is sold out in every color and size gets a small
  near-black pill with off-white text: "نفدت الكمية" / "Sold out". The message
  shown when a size sells out after the page was opened is near-black text
  too.
- **No dark mode.** The site stays off-white even when the phone is set to
  dark.
- **Product colors are not brand colors.** A swatch dot shows the real color of
  the garment, which the owner sets in the admin. The green tee is close to the
  brand green, so the selected ring sits a few pixels outside the dot (offset
  ring) to stay visible on any swatch.

### Contrast (WCAG)

| Pair | Ratio |
|---|---|
| Near-black on off-white | 16.98 |
| Off-white on green (button text) | 8.09 |
| Green on off-white (prices, logo) | 8.09 |
| Green on photo tile | 7.32 |
| Muted text on off-white | 5.98 |
| Muted text on photo tile | 5.41 |

All pass AA for body text. The faded sold-out label (2.65) is below AA on
purpose. It marks a disabled control, so it must always come with the
strike-through and a "sold out" label, never fading alone.

## Typography

**IBM Plex Sans Arabic** for both Arabic and English. It covers both
scripts, so the two languages share one voice. Load weights 400, 500, 600 and
700 with the Arabic and Latin subsets.

| Role | Weight | Notes |
|---|---|---|
| Headline | 700 | Large, tight line height (about 1.05). Two lines, the second in green. |
| Product name | 700 | |
| Labels, buttons, prices, chips | 600 | |
| Body, subtitles | 400 | Muted text color |

- 700 is the heaviest weight Plex Sans Arabic comes in. The reference's
  headline is heavier; get the impact from size and tight leading instead of
  adding a second, heavier font.
- **Never letter-space Arabic.** Spacing breaks the joins between Arabic
  letters. The spaced-out, uppercase eyebrow line in the reference ("NEW
  COLLECTION") is an English-only treatment. In Arabic, the same line is set
  at normal spacing.
- **Western digits (0–9) in both languages:** "4 ألوان", not "٤ ألوان".
- **Prices, sizes and codes stay readable in right-to-left text.** Wrap them
  as a left-to-right run (`<bdi dir="ltr">`) so "850" and "XL" never flip or
  jump around the Arabic words.

## The hanging rail

The rail is the brand's signature image: one metal bar with the tees hanging
from it on their wooden hangers.

**Where it appears:** the opening shot of the home page, as in the reference.
Order: header, an eyebrow line, a two-line headline, the rail, the product's
name and price, a green pill button, then the product grid below.

**Where it doesn't:** the product grid uses the flat photos on photo tiles,
not hangers. The product page's color picker uses swatch dots, not a mini
rail.

**What hangs on it:** every color of one featured product, the newest product
by default. Today that's the oversized tee in grey, black, green and cream.

**How it's built:**

- The bar is drawn in code: a thin bar about 3px high, with a soft vertical
  gradient from mid-grey to near-black and rounded ends. It runs the full width
  of the screen. Only the tees and hangers are photos.
- Each tee is positioned so the top of its hook sits on the bar. Hooks sit at
  slightly different heights in each photo, so each tee is aligned by its own
  hook (the first visible pixel from the top of the cutout), not by the image
  box.
- The tees always overlap slightly, on every screen size, so their sleeves
  stack. On a phone they also run off both edges of the screen, like the
  reference. The rail opens with the middle tee centered, and a sideways
  swipe (or a mouse drag, which settles on the nearest tee) slides the tees
  and the bar along to bring the outer ones into view.
- Tapping a hanging tee opens that product's page with the color already
  selected (`/<lang>/p/<slug>?color=<color>`), once the product page exists.

## Photography

Product photos live in [`photos/`](photos/). Every new product should be shot
the same way, so it can hang on the rail and sit in the grid next to the
others.

- **Cutouts on a transparent background.** No white or grey backdrop. The
  page's off-white shows through.
- **Square, centered, same scale.** The current set is 1200 × 1200 WebP, with
  the garment filling about the same width in every frame.
- **Two shots per color:**
  - **Hanger:** front view, on a natural wooden hanger with a dark metal hook,
    hook at the top center. Used on the rail and in the product page gallery.
  - **Flat:** front view, no hanger. Used on grid cards.
- **Soft, even light** and no hard shadows. The page supplies the setting, so
  the photo shouldn't.
- File names: `<product>-<color>-<shot>.webp`, for example
  `tee-black-hanger.webp`.
- On the site, photos are served as resized, phone-sized copies in modern
  formats, never the 1200px originals. The catalog has to be usable on 4G in
  about 2 seconds.

## Shape and components

- **Components come from shadcn/ui**, on customer pages and in the admin.
  Don't build a component from scratch when shadcn/ui has one. The hanging rail
  is the one custom piece, because no library has it.
- **Buttons are pills** (fully rounded). Primary buttons are green with
  off-white text. There is one primary button per screen.
- **Tiles and chips** have soft corners, about 8–10px.
- **Selected states are green:** the selected size chip is filled green, and the
  selected color dot gets a green offset ring.
- **Unselected chips** have a hairline border in the line shade.
- **The header is slim:** the logo, a language pill, and a hairline divider
  below. No cart, no search, no menu.
- **The footer is simple:** Instagram and WhatsApp links in muted text, above a
  hairline divider.
- **The layout is mobile first,** with 16px side margins. Arabic is the first
  design: right-to-left, laid out for Arabic, not English flipped over.

### shadcn/ui theme tokens

| Token | Value |
|---|---|
| `--background` | `#F1EDE7` |
| `--foreground` | `#0A0A0A` |
| `--card`, `--popover` | `#F1EDE7` |
| `--card-foreground`, `--popover-foreground` | `#0A0A0A` |
| `--primary` | `#1F4F34` |
| `--primary-foreground` | `#F1EDE7` |
| `--secondary`, `--muted`, `--accent` | `#E7E2DA` (photo tile) |
| `--secondary-foreground`, `--accent-foreground` | `#0A0A0A` |
| `--muted-foreground` | `#5B5957` |
| `--border`, `--input` | `#D3CFCA` |
| `--ring` | `#1F4F34` |
| `--destructive` | `#0A0A0A` (no red) |

`--accent` is shadcn's hover color. It stays the photo-tile shade, not green,
so green keeps meaning "chosen".

## Logo

Until the owner's logo files arrive, the logo is the wordmark "9k store",
set in Plex Sans Arabic Bold, in green, always left-to-right, even on Arabic
pages. Replace it when the logo files arrive.

## Don'ts

- Don't add colors, gradients (other than on the rail's bar) or a green
  background band.
- Don't use a white or grey photo backdrop, or mix photos shot in different
  styles.
- Don't letter-space Arabic, or use Arabic-Indic digits.
- Don't show a cart, search, a cart count or stock counts ("Only 3 left").
  Stock counts are in the brief's backlog, not v1.
- Don't hide sold-out products. Mark them.
- Don't make it look like a generic store template.

## Calls made by Claude (open to change)

- The three in-between shades and their values.
- Arabic pages show prices as "850 جنيه", matching the brief's Arabic order
  message. English pages show "850 EGP". (The early mockups used "EGP" in
  both.)
- The order button is brand green, not WhatsApp green.
- No dark mode.
- Product name weight 700; labels and prices 600.
- The selected color uses an offset ring, so it stays visible on the green
  swatch.

## Open items

- The logo files (the wordmark above stands in).
- The headline wording in Arabic and English.
- The Instagram handle and WhatsApp number for the footer.
