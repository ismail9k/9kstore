"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { destroySession, requireOwner } from "@/lib/auth/session";
import { reorderProducts, setPublished } from "@/lib/catalog";

import { checkOrderIds, checkToggleArgs } from "./action-args";

/** Logs the owner out and sends them to the login page. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

/** Publishes or hides one product. Throws for bad arguments or an unknown id. */
export async function togglePublished(id: string, published: boolean): Promise<void> {
  await requireOwner();
  const args = checkToggleArgs(id, published);
  await setPublished(args.id, args.published);
  revalidatePath("/admin");
}

/** Saves the products-list order: `ids` from first to last. */
export async function saveOrder(ids: string[]): Promise<void> {
  await requireOwner();
  await reorderProducts(checkOrderIds(ids));
  revalidatePath("/admin");
}
