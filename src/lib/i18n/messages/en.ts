export const en = {
  meta: { description: "9k Store — browse the catalog and order on WhatsApp." },
  header: { switchLanguage: "Switch language" },            // aria-label on the toggle
  price: { unit: "EGP" },
  product: { soldOut: "Sold out", size: "Size", color: "Color", price: "Price",
             orderOnWhatsapp: "Order on WhatsApp", chooseSize: "Choose a size first",
             colorSoldOut: "This color is sold out", sizeChart: "Size chart",
             orderingUnavailable: "Ordering isn't available right now" },
  notFound: { title: "Page not found",
              body: "This page doesn't exist or has moved.",
              back: "Back to the catalog" },
  home: { eyebrow: "New drop", headlineTop: "Made for", headlineAccent: "every day.",
          viewProduct: "View product", empty: "Nothing here yet — follow us on Instagram." },
  footer: { instagram: "Instagram", whatsapp: "WhatsApp" },
  order: { code: "Code", soldOut: "That size just sold out — pick another one.",
           changed: "The price has changed — check it before ordering.",
           failed: "Something went wrong. Try again." },
} as const;

/** The catalog's shape with every leaf widened to `string`, so `ar` must have the same keys but its own wording. */
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
