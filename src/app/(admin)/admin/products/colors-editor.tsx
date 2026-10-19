"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useId, useState, type Dispatch } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Color } from "@/lib/catalog/schema";

import { describedBy, FieldError } from "./field-error";
import type { Action, Draft } from "./form-state";
import { PhotoSlot } from "./photo-slot";
import type { SaveErrors } from "./save-input";

const HEX = /^#[0-9a-f]{6}$/i;

/** A card per color, reorderable by dragging, and "Add color". */
export function ColorsEditor({
  colors,
  soldOut,
  errors,
  dispatch,
  onPendingChange,
}: {
  colors: Color[];
  soldOut: Draft["soldOut"];
  errors: SaveErrors;
  dispatch: Dispatch<Action>;
  /** Reported by each color's photo strip when its uploads start or stop being in flight. */
  onPendingChange: (pending: boolean) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = colors.findIndex((c) => c.key === active.id);
    const to = colors.findIndex((c) => c.key === over.id);
    if (from >= 0 && to >= 0) dispatch({ type: "moveColor", from, to });
  }

  return (
    <div className="flex flex-col gap-4">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={colors.map((c) => c.key)} strategy={verticalListSortingStrategy}>
          {colors.map((color, index) => (
            <ColorCard
              key={color.key}
              color={color}
              index={index}
              hasSoldOut={soldOut.some((s) => s.color === color.key)}
              errors={errors}
              dispatch={dispatch}
              onPendingChange={onPendingChange}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addColor" })}>
          Add color
        </Button>
      </div>
    </div>
  );
}

function ColorCard({
  color,
  index,
  hasSoldOut,
  errors,
  dispatch,
  onPendingChange,
}: {
  color: Color;
  index: number;
  hasSoldOut: boolean;
  errors: SaveErrors;
  dispatch: Dispatch<Action>;
  onPendingChange: (pending: boolean) => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: color.key });

  const name = color.nameEn.trim() || `Color ${index + 1}`;
  const errorFor = (field: string) => errors[`colors.${index}.${field}`];
  // A color key comes from the English name, so its error shows there.
  const nameEnError = errorFor("nameEn") ?? errorFor("key");
  const nameArError = errorFor("nameAr");
  const swatchError = errorFor("swatch");

  const set = (field: "nameEn" | "nameAr" | "swatch", value: string) =>
    dispatch({ type: "colorField", key: color.key, name: field, value });
  const remove = () => dispatch({ type: "removeColor", key: color.key });

  function handleRemove() {
    if (color.photos.length > 0 || hasSoldOut) setConfirming(true);
    else remove();
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex gap-3 rounded-xl border border-border bg-background p-4 ${isDragging ? "relative z-10 shadow-sm" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${name}`}
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-en`}>English name</Label>
            <Input
              id={`${id}-en`}
              value={color.nameEn}
              onChange={(e) => set("nameEn", e.target.value)}
              aria-invalid={nameEnError ? true : undefined}
              aria-describedby={describedBy(nameEnError && `${id}-en-error`)}
            />
            <FieldError id={`${id}-en-error`} message={nameEnError} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-ar`}>Arabic name</Label>
            <Input
              id={`${id}-ar`}
              dir="rtl"
              lang="ar"
              value={color.nameAr}
              onChange={(e) => set("nameAr", e.target.value)}
              aria-invalid={nameArError ? true : undefined}
              aria-describedby={describedBy(nameArError && `${id}-ar-error`)}
            />
            <FieldError id={`${id}-ar-error`} message={nameArError} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-hex`}>Swatch</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${name} swatch picker`}
              value={HEX.test(color.swatch) ? color.swatch.toLowerCase() : "#000000"}
              onChange={(e) => set("swatch", e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Input
              id={`${id}-hex`}
              value={color.swatch}
              onChange={(e) => set("swatch", e.target.value.trim())}
              className="w-32 font-mono"
              spellCheck={false}
              aria-invalid={swatchError ? true : undefined}
              aria-describedby={describedBy(swatchError && `${id}-hex-error`)}
            />
          </div>
          <FieldError id={`${id}-hex-error`} message={swatchError} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Photos</span>
          <PhotoSlot
            photos={color.photos}
            label={`${name} photo`}
            kind="color"
            onAdd={(photo) => dispatch({ type: "addPhoto", key: color.key, photo })}
            onRemove={(photoKey) => dispatch({ type: "removePhoto", key: color.key, photoKey })}
            onMove={(from, to) => dispatch({ type: "movePhoto", key: color.key, from, to })}
            onPendingChange={onPendingChange}
          />
        </div>

        <div>
          <Button type="button" variant="ghost" className="text-destructive" onClick={handleRemove}>
            Remove color
          </Button>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {color.photos.length > 0 && hasSoldOut
                ? "Its photos and sold-out marks will be removed too."
                : color.photos.length > 0
                  ? "Its photos will be removed too."
                  : "Its sold-out marks will be removed too."}{" "}
              Nothing changes until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep color</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Remove color
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
