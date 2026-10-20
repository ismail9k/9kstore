/**
 * Zod schemas for the catalog. The single source of truth for what a product
 * and the store settings look like, and for the rules the server enforces on
 * save. Messages are shown to the owner as inline form errors, so they stay
 * in plain words (the slug field is labeled "Link name").
 */
import { z } from "zod";

import { MESSAGES } from "@/lib/photos/process";
import { PHOTO_ID } from "@/lib/photos/variants";

import { normalizeWhatsapp } from "./helpers";

const URL_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `Use at most ${max} characters for ${label}`);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters for ${label}`);

export const photoSchema = z.object({
  key: z.string().regex(PHOTO_ID),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** The hook's top as a fraction of the height (first visible row), measured in the admin at upload. */
  hookTop: z.number().min(0).max(1).optional(),
});

export const colorSchema = z.object({
  key: z.string().regex(URL_SAFE, "This color needs an English name with letters or numbers"),
  nameAr: requiredText("the Arabic color name", 60),
  nameEn: requiredText("the English color name", 60),
  swatch: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a color like #1A2B3C"),
  photos: z.array(photoSchema).max(20, MESSAGES.perColor),
});

const sizesSchema = z
  .array(z.string().trim().min(1, "A size can't be empty").max(20, "Use at most 20 characters for a size"))
  .min(1, "Add at least one size")
  .max(30, "A product can have at most 30 sizes")
  .refine((sizes) => new Set(sizes).size === sizes.length, "Each size can only appear once");

const colorsSchema = z
  .array(colorSchema)
  .min(1, "Add at least one color")
  .max(20, "A product can have at most 20 colors")
  .superRefine((colors, ctx) => {
    const seen = new Set<string>();
    colors.forEach((c, i) => {
      if (seen.has(c.key)) {
        ctx.addIssue({ code: "custom", path: [i, "key"], message: "Two colors have the same English name. Rename one of them." });
      }
      seen.add(c.key);
    });
  });

/** Fields shared by the input and the stored product; no refinements at this level so it can be extended. */
const productFields = z.object({
  slug: z
    .string()
    .min(1, "Enter a link name")
    .max(80, "Use at most 80 characters for the link name")
    .regex(URL_SAFE, "Use lowercase letters, numbers and hyphens only"),
  nameAr: requiredText("the Arabic name", 120),
  nameEn: requiredText("the English name", 120),
  descriptionAr: optionalText("the Arabic description", 1000),
  descriptionEn: optionalText("the English description", 1000),
  priceEgp: z
    .number()
    .int("Enter the price in whole pounds")
    .min(0, "The price can't be negative")
    .max(1_000_000, "The price can be at most 1,000,000"),
  code: optionalText("the code", 40)
    .nullable()
    .transform((code) => (code ? code : null)),
  sizes: sizesSchema,
  colors: colorsSchema,
  // Trimmed like the sizes, so a pair typed as " M " still matches the size "M".
  soldOut: z.array(z.object({ color: z.string().trim(), size: z.string().trim() })),
  sizeChart: photoSchema.nullable(),
  published: z.boolean(),
});

type StockShape = {
  sizes: string[];
  colors: { key: string }[];
  soldOut: { color: string; size: string }[];
};

/** Sold-out marks for a removed size or color are dropped, not rejected: removing them is the owner's intent. */
function dropOrphanSoldOut<T extends StockShape>(p: T): T {
  const sizes = new Set(p.sizes);
  const colors = new Set(p.colors.map((c) => c.key));
  return { ...p, soldOut: p.soldOut.filter((s) => colors.has(s.color) && sizes.has(s.size)) };
}

export const productInputSchema = productFields.transform(dropOrphanSoldOut);

export const productSchema = productFields
  .extend({
    id: z.string().min(1),
    sortOrder: z.number().int(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .transform(dropOrphanSoldOut);

const settingsFields = z.object({
  storeName: requiredText("the store name", 60),
  whatsappNumber: z
    .string()
    .transform(normalizeWhatsapp)
    .pipe(
      z
        .string()
        .regex(/^\d*$/, "Use digits only, country code first, e.g. 2010xxxxxxxx")
        .max(15, "That number is too long"),
    ),
  greetingAr: requiredText("the Arabic greeting", 200),
  greetingEn: requiredText("the English greeting", 200),
  instagramUrl: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, message: "Enter a full link starting with https://" })])),
  logo: photoSchema.nullable(),
});

export const settingsInputSchema = settingsFields;

export const settingsSchema = settingsFields.extend({
  updatedAt: z.string().min(1),
});

export type Photo = z.infer<typeof photoSchema>;
export type Color = z.infer<typeof colorSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type Product = z.infer<typeof productSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type Settings = z.infer<typeof settingsSchema>;
