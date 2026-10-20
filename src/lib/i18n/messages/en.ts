export const en = {
  meta: { description: "9k Store — browse the catalog and order on WhatsApp." },
  header: { switchLanguage: "Switch language" },            // aria-label on the toggle
  price: { unit: "EGP" },
  product: { soldOut: "Sold out", size: "Size", color: "Color", price: "Price",
             orderOnWhatsapp: "Order on WhatsApp" },
  notFound: { title: "Page not found",
              body: "This page doesn't exist or has moved.",
              back: "Back to the catalog" },
} as const;

/** The catalog's shape with every leaf widened to `string`, so `ar` must have the same keys but its own wording. */
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
