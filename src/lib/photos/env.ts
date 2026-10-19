/**
 * The one gate for degraded photo paths (serving the master, uploading
 * without variants). True only for `pnpm dev` / `pnpm preview`, whose
 * `.dev.vars` set `NEXTJS_ENV=development`; no deployed Worker has it.
 */
export function isDevelopment(env: { NEXTJS_ENV?: string }): boolean {
  return env.NEXTJS_ENV === "development";
}
