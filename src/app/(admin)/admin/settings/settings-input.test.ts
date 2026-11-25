import { describe, expect, it } from "vitest";

import type { Settings } from "@/lib/catalog/schema";

import { SAVE_FAILED } from "../products/save-input";
import { parseSettingsInput, settingsFormError, settingsToInput } from "./settings-input";

const saved: Settings = {
  storeName: "9k Store",
  whatsappNumber: "201012345678",
  greetingAr: "أهلاً 9k Store، حابب أطلب:",
  greetingEn: "Hi 9k Store, I'd like to order:",
  instagramUrl: "",
  logo: null,
  updatedAt: "2026-10-19T00:00:00.000Z",
};
const valid = settingsToInput(saved);

describe("settingsToInput", () => {
  it("drops updatedAt and keeps every form field", () => {
    expect(valid).toEqual({
      storeName: "9k Store",
      whatsappNumber: "201012345678",
      greetingAr: "أهلاً 9k Store، حابب أطلب:",
      greetingEn: "Hi 9k Store, I'd like to order:",
      instagramUrl: "",
      logo: null,
    });
  });
});

describe("parseSettingsInput", () => {
  it.each([null, undefined, "settings", 42, []])("gives the generic message for %j", (input) => {
    expect(parseSettingsInput(input)).toEqual({ ok: false, errors: { form: SAVE_FAILED } });
  });

  it("normalizes a pasted WhatsApp number to digits", () => {
    const result = parseSettingsInput({ ...valid, whatsappNumber: "+20 10 1234 5678" });
    expect(result).toEqual({ ok: true, input: { ...valid, whatsappNumber: "201012345678" } });
  });

  it("marks letters in the WhatsApp number", () => {
    const result = parseSettingsInput({ ...valid, whatsappNumber: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["whatsappNumber"]);
  });

  it("asks for https:// on an Instagram link without it, and accepts one with it", () => {
    const bad = parseSettingsInput({ ...valid, instagramUrl: "instagram.com/9kstore" });
    expect(bad).toEqual({ ok: false, errors: { instagramUrl: "Enter a full link starting with https://" } });
    const good = parseSettingsInput({ ...valid, instagramUrl: "https://instagram.com/9kstore" });
    expect(good.ok).toBe(true);
  });

  it("reports a missing field in plain words", () => {
    const result = parseSettingsInput({ ...valid, storeName: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.storeName).toBe("Check this field and try again.");
    }
  });
});

describe("settingsFormError", () => {
  it("ignores errors a field shows and returns the rest", () => {
    expect(settingsFormError({ storeName: "Enter the store name" })).toBeUndefined();
    expect(settingsFormError({ storeName: "a", "logo.key": "b" })).toBe("b");
    expect(settingsFormError({ form: SAVE_FAILED })).toBe(SAVE_FAILED);
  });
});
