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
import { GripVertical, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";

import type { Photo } from "@/lib/catalog/schema";
import { MESSAGES } from "@/lib/photos/process";

import { PhotoTile } from "../photo-tile";
import {
  ACCEPT,
  precheckFile,
  takeFinished,
  takeUpTo,
  UploadError,
  uploadPhoto,
  type PhotoKind,
} from "../photos/upload";

const TILE = 72;
const MAX_IN_FLIGHT = 3;
const DEFAULT_MAX = 20;

type Upload = {
  id: number;
  file: File;
  /** Object URL of the file, for the preview; empty when the file was refused before upload. */
  url: string;
  /** `done`: uploaded, waiting for the uploads picked before it to finish. */
  status: "queued" | "uploading" | "done" | "failed";
  /** The stored photo, once `done`. */
  photo?: Photo;
  error?: string;
  /** False for a file refused client-side or by the server (4xx): retrying it would fail the same way. */
  retryable: boolean;
};

const inFlight = (u: Upload) => u.status !== "failed";

/**
 * A strip of photo tiles with a remove × on each, then one tile per upload in
 * progress, then an add tile that opens the file picker. The whole strip is
 * a drop target for files. With `onMove` the photo tiles reorder by
 * dragging. At most three uploads run at once; finished uploads are handed
 * to `onAdd` in the order they were picked (photo 1 is the catalog card
 * photo), each once every upload picked before it has finished or failed.
 * With `max` 1 the add tile reads "Replace" once a photo is present, and
 * `onAdd` is the replacement.
 */
export function PhotoSlot({
  photos,
  label,
  max = DEFAULT_MAX,
  kind,
  onAdd,
  onRemove,
  onMove,
  onPendingChange,
}: {
  photos: Photo[];
  /** Names the photos for screen readers, e.g. "Black photo". */
  label: string;
  /** 1 for the size chart and the logo. */
  max?: number;
  /** Sent as `X-Photo-Kind`. */
  kind: PhotoKind;
  /** Called once per finished upload, in the order the files were picked. */
  onAdd: (photo: Photo) => void;
  onRemove: (photoKey: string) => void;
  onMove?: (from: number, to: number) => void;
  /** Called when uploads start or stop being in flight (queued, uploading, or done but not yet added). */
  onPendingChange?: (pending: boolean) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // The queue. `listRef` is the source of truth that event handlers and
  // upload callbacks read and write (never a stale render's copy); `uploads`
  // mirrors it for rendering. Uploads start only from handlers, never from
  // an effect or a state updater, so StrictMode can't start one twice.
  const [uploads, setUploads] = useState<Upload[]>([]);
  const listRef = useRef<Upload[]>([]);
  const nextId = useRef(0);
  const mounted = useRef(true);

  // Latest callbacks, so an upload that finishes after a re-render (e.g. the
  // color's key changed) reaches the current handler.
  const onAddRef = useRef(onAdd);
  const onPendingRef = useRef(onPendingChange);
  useEffect(() => {
    onAddRef.current = onAdd;
    onPendingRef.current = onPendingChange;
  });

  const pending = uploads.some(inFlight);
  const reported = useRef(false);
  useEffect(() => {
    if (pending === reported.current) return;
    reported.current = pending;
    onPendingRef.current?.(pending);
  }, [pending]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const u of listRef.current) if (u.url) URL.revokeObjectURL(u.url);
      listRef.current = [];
      if (reported.current) {
        reported.current = false;
        onPendingRef.current?.(false);
      }
    };
  }, []);

  /**
   * Hand the leading finished uploads to `onAdd` in pick order and drop them
   * (`takeFinished`). Called only from `commit`, so only from handlers and
   * upload callbacks, never from an effect or a state updater.
   */
  function deliver(list: Upload[]): Upload[] {
    const { ready, rest } = takeFinished(list);
    for (const u of ready) {
      if (u.url) URL.revokeObjectURL(u.url);
      onAddRef.current(u.photo!);
    }
    return rest;
  }

  /** Deliver what's ready, store the rest, start queued uploads while fewer than three run. */
  function commit(list: Upload[]) {
    const rest = deliver(list);
    let running = rest.filter((u) => u.status === "uploading").length;
    const toStart: Upload[] = [];
    const next = rest.map((u) => {
      if (u.status !== "queued" || running >= MAX_IN_FLIGHT) return u;
      running += 1;
      const started = { ...u, status: "uploading" as const };
      toStart.push(started);
      return started;
    });
    listRef.current = next;
    setUploads(next);
    for (const u of toStart) start(u);
  }

  function start(upload: Upload) {
    uploadPhoto(upload.file, kind).then(
      (photo) => {
        // Dismissed, replaced or unmounted meanwhile: drop the result.
        if (!mounted.current || !listRef.current.some((u) => u.id === upload.id)) return;
        commit(listRef.current.map((u) => (u.id === upload.id ? { ...u, status: "done", photo } : u)));
      },
      (error: unknown) => {
        if (!mounted.current || !listRef.current.some((u) => u.id === upload.id)) return;
        const message = error instanceof Error && error.message ? error.message : MESSAGES.network;
        const retryable = error instanceof UploadError ? error.retryable : true;
        commit(
          listRef.current.map((u) =>
            u.id === upload.id ? { ...u, status: "failed", error: message, retryable } : u,
          ),
        );
      },
    );
  }

  function toUpload(file: File): Upload {
    const refusal = precheckFile(file);
    nextId.current += 1;
    return refusal
      ? { id: nextId.current, file, url: "", status: "failed", error: refusal, retryable: false }
      : { id: nextId.current, file, url: URL.createObjectURL(file), status: "queued", retryable: true };
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    if (max === 1) {
      // One slot: the newest file replaces whatever is queued or failed.
      for (const u of listRef.current) if (u.url) URL.revokeObjectURL(u.url);
      commit([toUpload(files[0]!)]);
      return;
    }
    const refused = files.filter((f) => precheckFile(f) !== null);
    const accepted = files.filter((f) => precheckFile(f) === null);
    // Failed tiles hold no place: they never become photos unless retried.
    const room = max - photos.length - listRef.current.filter(inFlight).length;
    const { taken, dropped } = takeUpTo(accepted, room);
    if (dropped > 0) toast.error(`${MESSAGES.perColor}.`);
    commit([...listRef.current, ...refused.map(toUpload), ...taken.map(toUpload)]);
  }

  function retry(id: number) {
    // A failed tile holds no place, so the slot may have filled up since.
    if (max > 1 && photos.length + listRef.current.filter(inFlight).length >= max) {
      toast.error(`${MESSAGES.perColor}.`);
      return;
    }
    commit(listRef.current.map((u) => (u.id === id ? { ...u, status: "queued", error: undefined } : u)));
  }

  function dismiss(id: number) {
    const upload = listRef.current.find((u) => u.id === id);
    if (upload?.url) URL.revokeObjectURL(upload.url);
    commit(listRef.current.filter((u) => u.id !== id));
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = ""; // so picking the same file again still fires
  }

  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // Ignore moves between the strip's own children.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setOver(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  const addText = max > 1 ? "Add photos" : photos.length > 0 ? "Replace" : "Add image";
  const active = uploads.filter(inFlight).length;
  const showAdd = max === 1 ? active === 0 : photos.length + active < max;

  const strip = (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-wrap gap-3 rounded-lg ${over ? "ring-2 ring-ring ring-offset-4 ring-offset-background" : ""}`}
    >
      {photos.map((photo, i) =>
        onMove ? (
          <SortableTile key={photo.key} photo={photo} name={`${label} ${i + 1}`} onRemove={onRemove} />
        ) : (
          <Tile key={photo.key} photo={photo} name={`${label} ${i + 1}`} onRemove={onRemove} />
        ),
      )}
      {uploads.map((upload) => (
        <UploadTile
          key={upload.id}
          upload={upload}
          label={label}
          onRetry={() => retry(upload.id)}
          onDismiss={() => dismiss(upload.id)}
        />
      ))}
      {showAdd ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={`${addText}: ${label}`}
          className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted p-2 text-center text-sm outline-none hover:border-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ width: TILE, height: TILE }}
        >
          {addText}
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        onChange={handleInput}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );

  if (!onMove) return strip;

  function handleDragEnd({ active, over: target }: DragEndEvent) {
    if (!target || active.id === target.id || !onMove) return;
    const from = photos.findIndex((p) => p.key === active.id);
    const to = photos.findIndex((p) => p.key === target.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.key)} strategy={horizontalListSortingStrategy}>
        {strip}
      </SortableContext>
    </DndContext>
  );
}

type TileProps = { photo: Photo; name: string; onRemove: (photoKey: string) => void };

function CornerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border bg-background outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
}

function RemoveButton({ photo, name, onRemove }: TileProps) {
  return <CornerButton label={`Remove ${name}`} onClick={() => onRemove(photo.key)} />;
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

/**
 * An upload in progress or finished and waiting for earlier ones (dimmed
 * preview and a spinner), or a failed one (its message, Retry when trying
 * again could work, ×).
 */
function UploadTile({
  upload,
  label,
  onRetry,
  onDismiss,
}: {
  upload: Upload;
  label: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const preview = upload.url ? (
    // A plain <img>: an object URL of the chosen file, not a served photo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      src={upload.url}
      width={TILE}
      height={TILE}
      className={`size-full object-cover ${upload.status === "failed" ? "opacity-30" : "opacity-50"}`}
    />
  ) : null;

  if (upload.status !== "failed") {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-lg bg-muted"
        style={{ width: TILE, height: TILE }}
        role="status"
      >
        {preview}
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-foreground" aria-hidden />
        </span>
        <span className="sr-only">Uploading {label}</span>
      </div>
    );
  }

  return (
    <div className="relative flex w-56 shrink-0 gap-2 rounded-lg border border-border bg-background p-2" style={{ minHeight: TILE }}>
      {preview ? (
        <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">{preview}</div>
      ) : null}
      <div className="flex min-w-0 flex-col items-start gap-1">
        {preview ? null : <p className="max-w-full truncate text-xs text-muted-foreground">{upload.file.name}</p>}
        <p role="alert" className="text-xs text-destructive">
          {upload.error}
        </p>
        {upload.retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm text-xs font-medium underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Retry
          </button>
        ) : null}
      </div>
      <CornerButton label={`Dismiss failed upload: ${upload.file.name}`} onClick={onDismiss} />
    </div>
  );
}
