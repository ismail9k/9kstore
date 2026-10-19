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
import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Size chips in order, reorderable by dragging, with an input that adds a size. */
export function SizesEditor({
  sizes,
  onAdd,
  onRemove,
  onMove,
  inputId,
  errorId,
}: {
  sizes: string[];
  onAdd: (size: string) => void;
  onRemove: (size: string) => void;
  onMove: (from: number, to: number) => void;
  inputId: string;
  /** Set when the sizes have an error, for the input's `aria-describedby`. */
  errorId?: string;
}) {
  const [text, setText] = useState("");
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function add() {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = sizes.indexOf(String(active.id));
    const to = sizes.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <div className="flex flex-col gap-3">
      {sizes.length > 0 ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sizes} strategy={horizontalListSortingStrategy}>
            <ul className="flex flex-wrap gap-2" aria-label="Sizes">
              {sizes.map((size) => (
                <SizeChip key={size} size={size} onRemove={onRemove} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted-foreground">No sizes yet.</p>
      )}
      <div className="flex max-w-xs gap-2">
        <Input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. M or 32"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SizeChip({ size, onRemove }: { size: string; onRemove: (size: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: size });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <Badge
        variant="outline"
        className={`h-8 gap-0 rounded-lg border-border bg-background pr-1 pl-0 text-sm font-semibold ${isDragging ? "relative z-10 shadow-sm" : ""}`}
      >
        <span
          {...attributes}
          {...listeners}
          aria-label={`Size ${size}, drag to reorder`}
          className="flex h-full cursor-grab touch-none items-center rounded-l-lg pr-1.5 pl-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          {size}
        </span>
        <button
          type="button"
          onClick={() => onRemove(size)}
          aria-label={`Remove size ${size}`}
          className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </Badge>
    </li>
  );
}
