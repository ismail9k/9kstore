import { notFound } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { getProduct } from "@/lib/catalog";

import { draftFromProduct } from "../form-state";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requireOwner();
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{product.nameEn}</h1>
      {/* Keyed by id so moving between products starts a fresh draft. */}
      <ProductForm key={product.id} id={product.id} initial={draftFromProduct(product)} published={product.published} />
    </div>
  );
}
