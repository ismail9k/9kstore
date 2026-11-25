/** An inline form error; the field points at it with `aria-describedby={id}`. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** The ids an input's `aria-describedby` should list: helper text, then the error when there is one. */
export function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const list = ids.filter(Boolean).join(" ");
  return list || undefined;
}
