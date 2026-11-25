import { notFound } from "next/navigation";

// Only a top-level app/not-found handles unmatched URLs, and this app has two
// root layouts and no top-level one. Catching every unknown customer path here
// and calling notFound() renders the localized [lang]/not-found.tsx inside the
// store layout instead of Next's built-in 404. Specific routes still win.
export default function UnknownPath() {
  notFound();
}
