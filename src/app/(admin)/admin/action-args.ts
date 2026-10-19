/**
 * Argument checks for the products-list Server Actions. Server Actions are
 * public endpoints, so their arguments are untrusted whatever the TypeScript
 * types say. Each check throws on bad input; the client shows its generic
 * "Couldn't save" toast.
 */

export function checkToggleArgs(id: unknown, published: unknown): { id: string; published: boolean } {
  if (typeof id !== "string" || id.length === 0) throw new Error("Invalid product id");
  if (typeof published !== "boolean") throw new Error("Invalid published flag");
  return { id, published };
}

export function checkOrderIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new Error("Invalid product order");
  if (!ids.every((id): id is string => typeof id === "string" && id.length > 0)) {
    throw new Error("Invalid product id in order");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate product id in order");
  return ids;
}
