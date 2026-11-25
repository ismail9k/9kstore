"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useOptimistic, useTransition, type MouseEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cardPhoto, isSoldOut } from "@/lib/catalog/helpers";
import type { Product } from "@/lib/catalog/schema";

import { saveOrder, togglePublished } from "./actions";
import { PhotoTile } from "./photo-tile";

const SAVE_FAILED = "Couldn't save. Try again.";

const priceFormat = new Intl.NumberFormat("en-US");

type OptimisticChange =
  | { type: "publish"; id: string; published: boolean }
  | { type: "order"; ids: string[] };

/** Applies a pending change on top of the server's list until the action settles. */
function applyChange(products: Product[], change: OptimisticChange): Product[] {
  if (change.type === "publish") {
    return products.map((p) => (p.id === change.id ? { ...p, published: change.published } : p));
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  return change.ids.flatMap((id) => byId.get(id) ?? []);
}

export function ProductsTable({ products }: { products: Product[] }) {
  // Optimistic edits show at once; when the action finishes the list falls
  // back to the server's (revalidated) `products`, so a failure reverts.
  const [rows, applyOptimistic] = useOptimistic(products, applyChange);
  const [, startTransition] = useTransition();
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: UniqueIdentifier) => rows.find((p) => p.id === id)?.nameEn ?? "Product";
  const positionOf = (id: UniqueIdentifier) => rows.findIndex((p) => p.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)} of ${rows.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${rows.length}.` : undefined,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  function handleToggle(id: string, published: boolean) {
    startTransition(async () => {
      applyOptimistic({ type: "publish", id, published });
      try {
        await togglePublished(id, published);
        toast.success("Saved");
      } catch {
        toast.error(SAVE_FAILED);
      }
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((p) => p.id === active.id);
    const to = rows.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    const ids = arrayMove(rows, from, to).map((p) => p.id);
    startTransition(async () => {
      applyOptimistic({ type: "order", ids });
      try {
        await saveOrder(ids);
      } catch {
        toast.error(SAVE_FAILED);
      }
    });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <span className="sr-only">Reorder</span>
            </TableHead>
            <TableHead className="w-16">Photo</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext items={rows.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {rows.map((product) => (
              <ProductRow key={product.id} product={product} onToggle={handleToggle} />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}

function ProductRow({
  product,
  onToggle,
}: {
  product: Product;
  onToggle: (id: string, published: boolean) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });
  const href = `/admin/products/${product.id}`;
  const switchId = `published-${product.id}`;

  // The whole row opens the product, except clicks on its controls.
  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest("a, button, label")) return;
    router.push(href);
  }

  return (
    <TableRow
      ref={setNodeRef}
      onClick={handleRowClick}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-10 cursor-pointer bg-background shadow-sm" : "cursor-pointer"}
    >
      <TableCell>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${product.nameEn}`}
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </TableCell>
      <TableCell>
        <PhotoTile photo={cardPhoto(product)} size={48} />
      </TableCell>
      <TableCell className="whitespace-normal">
        <Link href={href} className="block font-medium hover:underline">
          {product.nameEn}
        </Link>
        <div dir="rtl" className="text-left text-muted-foreground">
          {product.nameAr}
        </div>
      </TableCell>
      <TableCell>{priceFormat.format(product.priceEgp)} EGP</TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Switch
            id={switchId}
            checked={product.published}
            onCheckedChange={(checked) => onToggle(product.id, checked)}
          />
          <label htmlFor={switchId} className="w-20 cursor-pointer">
            {product.published ? "Published" : "Hidden"}
          </label>
          {isSoldOut(product) ? <Badge className="bg-foreground text-background">Sold out</Badge> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
