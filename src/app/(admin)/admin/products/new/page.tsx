import { requireOwner } from "@/lib/auth/session";

import { emptyDraft } from "../form-state";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  await requireOwner();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductForm id={null} initial={emptyDraft()} published={false} />
    </div>
  );
}
