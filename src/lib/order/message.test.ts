import { describe, expect, test } from "vitest";
import { buildOrderMessage, whatsappUrl, type OrderDetails } from "./message";

const details: OrderDetails = {
  greeting: "Hi 9k Store, I'd like to order:",
  productName: "Oversized Tee",
  colorName: "Black",
  size: "L",
  priceEgp: 850,
  code: "TEE-01",
  link: "https://example.com/en/p/oversized-tee?color=black",
};

describe("buildOrderMessage", () => {
  test("English matches the brief's example plus the code line", () => {
    expect(buildOrderMessage(details, "en")).toBe(
      "Hi 9k Store, I'd like to order:\nOversized Tee — Black\nSize: L\nPrice: 850 EGP\nCode: TEE-01\nhttps://example.com/en/p/oversized-tee?color=black",
    );
  });
  test("Arabic isolates size, price and code", () => {
    const ar = buildOrderMessage(
      { ...details, greeting: "أهلاً 9k Store، حابب أطلب:", productName: "تيشيرت أوفر سايز", colorName: "أسود",
        link: "https://example.com/ar/p/oversized-tee?color=black" },
      "ar",
    );
    expect(ar).toBe(
      "أهلاً 9k Store، حابب أطلب:\nتيشيرت أوفر سايز — أسود\nالمقاس: ⁦L⁩\nالسعر: ⁦850 جنيه⁩\nالكود: ⁦TEE-01⁩\nhttps://example.com/ar/p/oversized-tee?color=black",
    );
    expect(ar).not.toMatch(/[٠-٩]/);
  });
  test("drops the code line when there is no code", () => {
    expect(buildOrderMessage({ ...details, code: null }, "en")).not.toContain("Code:");
    expect(buildOrderMessage({ ...details, code: null }, "ar")).not.toContain("الكود");
    expect(buildOrderMessage({ ...details, code: null }, "en").split("\n")).toHaveLength(5);
  });
  test("groups thousands with a comma and isolates the whole price in Arabic", () => {
    expect(buildOrderMessage({ ...details, priceEgp: 1250 }, "en")).toContain("Price: 1,250 EGP");
    expect(buildOrderMessage({ ...details, priceEgp: 1250 }, "ar")).toContain("السعر: ⁦1,250 جنيه⁩");
  });
});

test("whatsappUrl encodes the message as the text parameter", () => {
  expect(whatsappUrl("201011111111", "a\nب")).toBe("https://wa.me/201011111111?text=a%0A%D8%A8");
});
