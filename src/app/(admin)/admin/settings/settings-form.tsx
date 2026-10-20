"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Settings, SettingsInput } from "@/lib/catalog/schema";

import { describedBy, FieldError } from "../products/field-error";
import { PhotoSlot } from "../products/photo-slot";
import { SAVE_FAILED, type SaveErrors } from "../products/save-input";
import { saveSettings } from "./actions";
import { settingsFormError, settingsToInput } from "./settings-input";

const CHECK_FIELDS = "Couldn't save. Check the marked fields.";
const WHATSAPP_HELP = "Country code first, no plus or spaces, e.g. 2010xxxxxxxx";
const NO_LOGO = "No logo yet — upload arrives with the next release.";

type TextField = Exclude<keyof SettingsInput, "logo">;

/** The store settings form: one Save that sends every field to `saveSettings`. */
export function SettingsForm({ initial }: { initial: Settings }) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<SettingsInput>(() => settingsToInput(initial));
  const [errors, setErrors] = useState<SaveErrors>({});
  const [saving, startSaving] = useTransition();

  // After a failed save, move focus to the first marked field.
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [errors]);

  const id = (field: TextField) => `${uid}-${field}`;
  const errorId = (field: TextField) => `${id(field)}-error`;
  const formError = settingsFormError(errors);

  /** Value, change handler, aria-invalid and aria-describedby for a text input. */
  function fieldProps(field: TextField, helpId?: string) {
    const message = errors[field];
    return {
      id: id(field),
      value: values[field],
      onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value })),
      "aria-invalid": message ? true : undefined,
      "aria-describedby": describedBy(helpId, message && errorId(field)),
    } as const;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    startSaving(async () => {
      let result;
      try {
        result = await saveSettings(values);
      } catch {
        toast.error(SAVE_FAILED);
        return;
      }
      if (result.ok) {
        // Show what was stored, e.g. the WhatsApp number as digits only.
        setValues(settingsToInput(result.settings));
        setErrors({});
        toast.success("Saved");
        return;
      }
      setErrors(result.errors);
      toast.error(result.errors.form ?? CHECK_FIELDS);
    });
  }

  const whatsappHelpId = `${id("whatsappNumber")}-help`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("storeName")}>Store name</Label>
        <Input {...fieldProps("storeName")} />
        <FieldError id={errorId("storeName")} message={errors.storeName} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("whatsappNumber")}>WhatsApp number</Label>
        <Input {...fieldProps("whatsappNumber", whatsappHelpId)} inputMode="tel" className="max-w-60" />
        <p id={whatsappHelpId} className="text-sm text-muted-foreground">
          {WHATSAPP_HELP}
        </p>
        <FieldError id={errorId("whatsappNumber")} message={errors.whatsappNumber} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("instagramUrl")}>Instagram link</Label>
        <Input
          {...fieldProps("instagramUrl")}
          type="url"
          inputMode="url"
          placeholder="https://instagram.com/…"
          spellCheck={false}
          autoCapitalize="off"
        />
        <FieldError id={errorId("instagramUrl")} message={errors.instagramUrl} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("greetingAr")}>Greeting line in Arabic</Label>
        <Input {...fieldProps("greetingAr")} dir="rtl" lang="ar" />
        <FieldError id={errorId("greetingAr")} message={errors.greetingAr} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("greetingEn")}>Greeting line in English</Label>
        <Input {...fieldProps("greetingEn")} />
        <FieldError id={errorId("greetingEn")} message={errors.greetingEn} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Logo</h2>
        <PhotoSlot
          photos={values.logo ? [values.logo] : []}
          emptyText={NO_LOGO}
          label="Logo"
          onRemove={() => setValues((v) => ({ ...v, logo: null }))}
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {formError ? (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
