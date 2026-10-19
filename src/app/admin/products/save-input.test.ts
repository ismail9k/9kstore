import { describe, expect, it } from "vitest";

import { productInputSchema } from "@/lib/catalog/schema";

import { emptyDraft, reduce, type Draft } from "./form-state";
import {
  errorUnder,
  formLevelError,
  isShownByField,
  issuesToErrors,
  ownerErrorMap,
  parsePrice,
  prepareDraft,
  PRICE_INVALID,
  type SaveErrors,
} from "./save-input";

function validDraft(overrides: Partial<Draft> = {}): Draft {
  let d = emptyDraft();
  d = reduce(d, { type: "nameEn", value: "Oversized Tee" });
  d = reduce(d, { type: "field", name: "nameAr", value: "تيشيرت واسع" });
  d = reduce(d, { type: "field", name: "priceEgp", value: 850 });
  d = reduce(d, { type: "addSize", size: "S" });
  const key = d.colors[0]!.key;
  d = reduce(d, { type: "colorField", key, name: "nameEn", value: "Black" });
  d = reduce(d, { type: "colorField", key, name: "nameAr", value: "أسود" });
  return { ...d, ...overrides };
}

/** prepareDraft + the schema with the owner error map, as the save action runs them. */
function validate(draft: unknown) {
  const prepared = prepareDraft(draft);
  if (!prepared.ok) throw new Error("draft rejected");
  const none: SaveErrors = {};
  const parsed = productInputSchema.safeParse(prepared.input, { error: ownerErrorMap });
  return parsed.success ? { data: parsed.data, errors: none } : { data: null, errors: issuesToErrors(parsed.error.issues) };
}

describe("prepareDraft", () => {
  it("rejects anything that isn't a draft-shaped object", () => {
    for (const bad of [null, undefined, "x", 1, [], {}, { slugEdited: "yes" }]) {
      expect(prepareDraft(bad)).toEqual({ ok: false });
    }
    expect(prepareDraft({ ...validDraft(), colors: "black" })).toEqual({ ok: false });
    expect(prepareDraft({ ...validDraft(), colors: [null] })).toEqual({ ok: false });
    expect(prepareDraft({ ...validDraft(), colors: [{ key: 1, nameEn: "x" }] })).toEqual({ ok: false });
    expect(prepareDraft({ ...validDraft(), soldOut: [null] })).toEqual({ ok: false });
  });

  it("falls back to 'product' when an auto-filled link name came out empty", () => {
    const draft = validDraft();
    const arabicOnly = reduce(draft, { type: "nameEn", value: "تيشيرت" });
    expect(arabicOnly.slug).toBe("");
    expect(validate(arabicOnly).data?.slug).toBe("product");
    const punctuation = reduce(draft, { type: "nameEn", value: "!!!" });
    expect(validate(punctuation).data?.slug).toBe("product");
  });

  it("leaves an owner-typed empty link name for the schema to reject", () => {
    const draft = reduce(validDraft(), { type: "slug", value: "" });
    expect(validate(draft).errors.slug).toBe("Enter a link name");
  });

  it("keys new colors from their English names and passes slugEdited through", () => {
    const prepared = prepareDraft(validDraft());
    expect(prepared).toMatchObject({ ok: true, slugEdited: false });
    if (!prepared.ok) return;
    expect((prepared.input as Draft).colors[0]!.key).toBe("black");
  });
});

describe("save validation messages", () => {
  it("a valid draft passes", () => {
    expect(validate(validDraft()).errors).toEqual({});
  });

  it("an empty price (NaN) reads as plain words, not a type error", () => {
    expect(validate(validDraft({ priceEgp: Number.NaN })).errors).toEqual({ priceEgp: PRICE_INVALID });
    expect(validate({ ...validDraft(), priceEgp: "850" }).errors).toEqual({ priceEgp: PRICE_INVALID });
  });

  it("keeps the schema's own message for a fractional price", () => {
    expect(validate(validDraft({ priceEgp: 1.5 })).errors.priceEgp).toBe("Enter the price in whole pounds");
  });

  it("wrong types elsewhere never surface zod's technical wording", () => {
    const { errors } = validate({ ...validDraft(), published: "yes", sizeChart: 3 });
    expect(Object.values(errors).join(" ")).not.toMatch(/expected|received|invalid input/i);
    expect(Object.keys(errors).sort()).toEqual(["published", "sizeChart"]);
  });

  it("keys errors by dotted path, keeping the first message per field", () => {
    const draft = validDraft();
    const bad = reduce(draft, { type: "colorField", key: draft.colors[0]!.key, name: "swatch", value: "black" });
    expect(validate(bad).errors).toEqual({ "colors.0.swatch": "Pick a color like #1A2B3C" });
    expect(
      issuesToErrors([
        { path: ["slug"], message: "first" },
        { path: ["slug"], message: "second" },
        { path: [], message: "whole" },
      ]),
    ).toEqual({ slug: "first", form: "whole" });
  });
});

describe("parsePrice", () => {
  it("never turns an empty field into 0", () => {
    expect(parsePrice("")).toBeNaN();
    expect(parsePrice("  ")).toBeNaN();
    expect(parsePrice(" 850 ")).toBe(850);
    expect(parsePrice("0")).toBe(0);
    expect(validate(validDraft({ priceEgp: parsePrice("") })).errors).toEqual({ priceEgp: PRICE_INVALID });
  });
});

describe("where errors show", () => {
  it("errorUnder finds a field's own message or one nested below it", () => {
    expect(errorUnder({ "sizes.1": "dup" }, "sizes")).toBe("dup");
    expect(errorUnder({ sizes: "none", "sizes.1": "dup" }, "sizes")).toBe("none");
    expect(errorUnder({ sizesX: "no" }, "sizes")).toBeUndefined();
  });

  it("fields the form renders are shown; the rest go to the form-level notice", () => {
    for (const key of ["slug", "priceEgp", "sizes", "sizes.3", "colors", "colors.2.swatch", "colors.0.key"]) {
      expect(isShownByField(key)).toBe(true);
    }
    for (const key of ["form", "soldOut.0.color", "sizeChart", "colors.0.photos.1.key"]) {
      expect(isShownByField(key)).toBe(false);
    }
    expect(formLevelError({ slug: "a", sizeChart: "b" })).toBe("b");
    expect(formLevelError({ slug: "a" })).toBeUndefined();
  });
});
