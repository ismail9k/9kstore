"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { saveProduct } from "./actions";
import { AvailabilityGrid } from "./availability-grid";
import { ColorsEditor } from "./colors-editor";
import { describedBy, FieldError } from "./field-error";
import { reduce, type Draft } from "./form-state";
import { PhotoSlot } from "./photo-slot";
import { errorUnder, formLevelError, parsePrice, SAVE_FAILED, type SaveErrors } from "./save-input";
import { SizesEditor } from "./sizes-editor";

const LEAVE_CONFIRM = "Leave this page? Your unsaved changes will be lost.";
const CHECK_FIELDS = "Couldn't save. Check the marked fields.";
const WAIT_FOR_UPLOADS = "Wait for the photos to finish uploading.";
const SLUG_HELP = "Part of the product's link. Changing it after sharing breaks old links.";
const VISIBILITY_HELP =
  "Hidden products don't appear on the site, but their links show a 'no longer available' page.";

type ScalarField = "nameAr" | "descriptionEn" | "descriptionAr" | "code" | "published";

/**
 * While `dirty`, asks before the tab closes or reloads (`beforeunload`) and
 * before any in-app link (Cancel, the header nav) navigates away.
 */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // opens a new tab
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      if (window.confirm(LEAVE_CONFIRM)) return;
      // Capture phase on document: runs before Next's <Link> handler and stops it.
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The add/edit product form: one draft, one Save that sends it to `saveProduct`. */
export function ProductForm({ id, initial, published }: { id: string | null; initial: Draft; published: boolean }) {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, dispatch] = useReducer(reduce, initial);
  // The price is kept as typed, so an empty field is reported rather than saved as 0.
  const [initialPrice] = useState(() => (id === null ? "" : String(initial.priceEgp)));
  const [priceText, setPriceText] = useState(initialPrice);
  const [initialJson] = useState(() => JSON.stringify(initial));
  const [errors, setErrors] = useState<SaveErrors>({});
  // Locked when the product was published at load; "Edit anyway" unlocks it.
  const [slugLocked, setSlugLocked] = useState(published);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  // How many photo strips have uploads in flight; Save waits for them.
  const [pendingUploads, setPendingUploads] = useState(0);
  const onPendingChange = useCallback(
    (pending: boolean) => setPendingUploads((n) => Math.max(0, n + (pending ? 1 : -1))),
    [],
  );
  const uploading = pendingUploads > 0;

  const edited = useMemo(
    () => !saved && (priceText !== initialPrice || JSON.stringify(draft) !== initialJson),
    [saved, priceText, initialPrice, draft, initialJson],
  );
  const dirty = edited || uploading;
  useUnsavedGuard(dirty);

  // After a failed save, move focus to the first marked field.
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [errors]);

  const ids = {
    nameEn: `${uid}-name-en`,
    nameAr: `${uid}-name-ar`,
    slug: `${uid}-slug`,
    descriptionEn: `${uid}-desc-en`,
    descriptionAr: `${uid}-desc-ar`,
    priceEgp: `${uid}-price`,
    code: `${uid}-code`,
    sizes: `${uid}-sizes`,
    published: `${uid}-published`,
  };
  const errorId = (field: keyof typeof ids) => `${ids[field]}-error`;
  const sizesError = errorUnder(errors, "sizes");
  const formError = formLevelError(errors);

  /** Props for an input bound to an error key: aria-invalid plus aria-describedby. */
  function errorProps(field: keyof typeof ids, helpId?: string) {
    const message = errors[field];
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": describedBy(helpId, message && errorId(field)),
    } as const;
  }

  const setField = (name: ScalarField, value: string | boolean) => dispatch({ type: "field", name, value });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploading) return;
    startSaving(async () => {
      let result;
      try {
        result = await saveProduct(id, { ...draft, priceEgp: parsePrice(priceText) });
      } catch {
        toast.error(SAVE_FAILED);
        return;
      }
      if (result.ok) {
        setSaved(true);
        toast.success("Saved");
        router.push("/admin");
        return;
      }
      setErrors(result.errors);
      // A form-level message (e.g. logged out) says more than "check the marked fields".
      toast.error(result.errors.form ?? CHECK_FIELDS);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      <Section title="Name and description">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.nameEn}>English name</Label>
            <Input
              id={ids.nameEn}
              value={draft.nameEn}
              onChange={(e) => dispatch({ type: "nameEn", value: e.target.value })}
              {...errorProps("nameEn")}
            />
            <FieldError id={errorId("nameEn")} message={errors.nameEn} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.nameAr}>Arabic name</Label>
            <Input
              id={ids.nameAr}
              dir="rtl"
              lang="ar"
              value={draft.nameAr}
              onChange={(e) => setField("nameAr", e.target.value)}
              {...errorProps("nameAr")}
            />
            <FieldError id={errorId("nameAr")} message={errors.nameAr} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.slug}>Link name</Label>
          <div className="flex items-center gap-3">
            <Input
              id={ids.slug}
              value={draft.slug}
              readOnly={slugLocked}
              onChange={(e) => dispatch({ type: "slug", value: e.target.value })}
              className={`max-w-md font-mono ${slugLocked ? "bg-muted" : ""}`}
              spellCheck={false}
              autoCapitalize="off"
              {...errorProps("slug", `${ids.slug}-help`)}
            />
            {slugLocked ? (
              <Button type="button" variant="ghost" className="underline" onClick={() => setSlugLocked(false)}>
                Edit anyway
              </Button>
            ) : null}
          </div>
          <p id={`${ids.slug}-help`} className="text-sm text-muted-foreground">
            {SLUG_HELP}
          </p>
          <FieldError id={errorId("slug")} message={errors.slug} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.descriptionEn}>English description</Label>
            <Textarea
              id={ids.descriptionEn}
              rows={4}
              value={draft.descriptionEn}
              onChange={(e) => setField("descriptionEn", e.target.value)}
              {...errorProps("descriptionEn")}
            />
            <FieldError id={errorId("descriptionEn")} message={errors.descriptionEn} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.descriptionAr}>Arabic description</Label>
            <Textarea
              id={ids.descriptionAr}
              dir="rtl"
              lang="ar"
              rows={4}
              value={draft.descriptionAr}
              onChange={(e) => setField("descriptionAr", e.target.value)}
              {...errorProps("descriptionAr")}
            />
            <FieldError id={errorId("descriptionAr")} message={errors.descriptionAr} />
          </div>
        </div>
      </Section>

      <Separator />

      <Section title="Price and code">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.priceEgp}>Price (EGP)</Label>
            <Input
              id={ids.priceEgp}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              className="max-w-40"
              {...errorProps("priceEgp")}
            />
            <FieldError id={errorId("priceEgp")} message={errors.priceEgp} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.code}>Product code</Label>
            <Input
              id={ids.code}
              value={draft.code ?? ""}
              onChange={(e) => setField("code", e.target.value)}
              className="max-w-60"
              {...errorProps("code")}
            />
            <FieldError id={errorId("code")} message={errors.code} />
          </div>
        </div>
      </Section>

      <Separator />

      <Section title="Sizes">
        <SizesEditor
          sizes={draft.sizes}
          inputId={ids.sizes}
          errorId={sizesError ? errorId("sizes") : undefined}
          onAdd={(size) => dispatch({ type: "addSize", size })}
          onRemove={(size) => dispatch({ type: "removeSize", size })}
          onMove={(from, to) => dispatch({ type: "moveSize", from, to })}
        />
        <FieldError id={errorId("sizes")} message={sizesError} />
      </Section>

      <Separator />

      <Section title="Colors">
        <ColorsEditor
          colors={draft.colors}
          soldOut={draft.soldOut}
          errors={errors}
          dispatch={dispatch}
          onPendingChange={onPendingChange}
        />
        <FieldError id={`${uid}-colors-error`} message={errors.colors} />
      </Section>

      {draft.sizes.length > 0 && draft.colors.length > 0 ? (
        <>
          <Separator />
          <Section title="Availability">
            <p className="text-sm text-muted-foreground">Checked means in stock.</p>
            <AvailabilityGrid
              sizes={draft.sizes}
              colors={draft.colors}
              soldOut={draft.soldOut}
              dispatch={dispatch}
            />
          </Section>
        </>
      ) : null}

      <Separator />

      <Section title="Size chart">
        <PhotoSlot
          photos={draft.sizeChart ? [draft.sizeChart] : []}
          label="Size chart"
          kind="size-chart"
          max={1}
          onAdd={(photo) => dispatch({ type: "setSizeChart", photo })}
          onRemove={() => dispatch({ type: "removeSizeChart" })}
          onPendingChange={onPendingChange}
        />
      </Section>

      <Separator />

      <Section title="Visibility">
        <div className="flex items-center gap-3">
          <Switch
            id={ids.published}
            checked={draft.published}
            onCheckedChange={(checked) => setField("published", checked)}
            aria-describedby={`${ids.published}-help`}
          />
          <Label htmlFor={ids.published} className="cursor-pointer">
            {draft.published ? "Published" : "Hidden"}
          </Label>
        </div>
        <p id={`${ids.published}-help`} className="text-sm text-muted-foreground">
          {VISIBILITY_HELP}
        </p>
        <FieldError id={errorId("published")} message={errors.published} />
      </Section>

      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-3 border-t border-border bg-background px-6 py-3">
        {formError ? (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        {uploading ? <p className="text-sm text-muted-foreground">{WAIT_FOR_UPLOADS}</p> : null}
        <Button asChild variant="outline">
          <Link href="/admin">Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving || uploading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
