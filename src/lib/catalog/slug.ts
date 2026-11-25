/** The slug rules on their own, so the Worker entry can check a path without pulling in zod. */

/** The slug and color-key rule: lowercase letters and digits in hyphen-separated runs. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest slug the store accepts; routes reject longer ones before reading D1. */
export const SLUG_MAX = 80;
