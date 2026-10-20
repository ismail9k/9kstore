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
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useId } from "react";

import type { Photo } from "@/lib/catalog/schema";

import { PhotoTile } from "../photo-tile";

const TILE = 72;

/**
 * A strip of photo tiles with a remove × on each, or `emptyText` when there
 * are none. With `onMove` the tiles reorder by dragging. No upload control:
 * uploads arrive with #3.
 */
export function PhotoSlot({
  photos,
  emptyText,
  label,
  onRemove,
  onMove,
}: {
  photos: Photo[];
  emptyText: string;
  /** Names the photos for screen readers, e.g. "Black photo". */
  label: string;
  onRemove: (photoKey: string) => void;
  onMove?: (from: number, to: number) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (photos.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  if (!onMove) {
    return (
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, i) => (
          <Tile key={photo.key} photo={photo} name={`${label} ${i + 1}`} onRemove={onRemove} />
        ))}
      </div>
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !onMove) return;
    const from = photos.findIndex((p) => p.key === active.id);
    const to = photos.findIndex((p) => p.key === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.key)} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap gap-3">
          {photos.map((photo, i) => (
            <SortableTile key={photo.key} photo={photo} name={`${label} ${i + 1}`} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type TileProps = { photo: Photo; name: string; onRemove: (photoKey: string) => void };

function RemoveButton({ photo, name, onRemove }: TileProps) {
  return (
    <button
      type="button"
      onClick={() => onRemove(photo.key)}
      aria-label={`Remove ${name}`}
      className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border bg-background outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
}

function Tile(props: TileProps) {
  return (
    <div className="relative">
      <PhotoTile photo={props.photo} size={TILE} />
      <RemoveButton {...props} />
    </div>
  );
}

function SortableTile(props: TileProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.photo.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-10" : "relative"}
    >
      <PhotoTile photo={props.photo} size={TILE} />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${props.name}`}
        className="absolute bottom-1 left-1 flex size-6 cursor-grab touch-none items-center justify-center rounded-md bg-background/90 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <RemoveButton {...props} />
    </div>
  );
}
