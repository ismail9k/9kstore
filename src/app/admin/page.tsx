import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/session";
import { listProducts } from "@/lib/catalog";

import { ProductsTable } from "./products-table";

function NewProductButton() {
  return (
    <Button asChild>
      <Link href="/admin/products/new">New product</Link>
    </Button>
  );
}

export default async function ProductsPage() {
  await requireOwner();
  const products = await listProducts();

  if (products.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex flex-col items-start gap-4 py-12">
          <p>No products yet. Add the first one.</p>
          <NewProductButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Products</h1>
        <NewProductButton />
      </div>
      <ProductsTable products={products} />
    </div>
  );
}
