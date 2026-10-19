import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

const { PUBLISHED_PARAM, SET_PUBLISHED, UPDATE_COLUMNS, UPDATE_PRODUCT } = await import("./repo");

describe("UPDATE_PRODUCT", () => {
  test("was_published only rises, counting the row's pre-update published value", () => {
    expect(UPDATE_PRODUCT).toContain(`was_published = MAX(was_published, published, ?${PUBLISHED_PARAM})`);
  });

  test("the parameter at PUBLISHED_PARAM is bound to the published column", () => {
    expect(UPDATE_COLUMNS[PUBLISHED_PARAM - 1]).toBe("published");
    expect(UPDATE_PRODUCT).toContain(`published = ?${PUBLISHED_PARAM},`);
  });

  test("id is the last parameter", () => {
    expect(UPDATE_PRODUCT).toMatch(new RegExp(`WHERE id = \\?${UPDATE_COLUMNS.length + 1}$`));
    expect(UPDATE_COLUMNS).not.toContain("id");
    expect(UPDATE_COLUMNS).not.toContain("was_published");
  });
});

describe("SET_PUBLISHED", () => {
  test("hiding a live product marks it once-published", () => {
    expect(SET_PUBLISHED).toContain("was_published = MAX(was_published, published, ?1)");
  });
});
