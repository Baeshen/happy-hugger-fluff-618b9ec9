/**
 * Single source of truth for how an appointment "reason" is normalized
 * before we compare it against the empty check or persist it into
 * appointment_audit.reason.
 *
 * The DB trigger `log_appointment_change` MUST apply the same rules
 * server-side (see the matching migration for the SQL implementation).
 *
 * Rules (kept intentionally strict and small):
 *   1. Strip all leading/trailing Unicode whitespace as defined by
 *      String#trim() — this includes ASCII spaces, \t, \n, \r, and
 *      NBSP U+00A0. (Zero-width space U+200B is deliberately NOT
 *      considered whitespace; if a user types one it survives.)
 *   2. Preserve internal whitespace verbatim — a user may legitimately
 *      paste a multi-line reason.
 *   3. Enforce a hard 500-character upper bound.
 *   4. `undefined` → `undefined` (caller may pass a null-equivalent).
 */

import { z } from "zod";

export const REASON_MAX = 500;

/** Normalize a raw reason input to its persisted form. */
export function normalizeReason(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  return trimmed.slice(0, REASON_MAX);
}

/**
 * `true` when the given trimmed reason is empty (`""` or nullish).
 * Use this instead of an ad-hoc truthy check so that the definition of
 * "empty" stays aligned with the DB trigger.
 */
export function isEmptyReason(normalized: string | undefined): boolean {
  return normalized === undefined || normalized === "";
}

/**
 * Zod schema mirroring the same rules; use in server-function inputValidator.
 * Accepts undefined and produces the normalized string (never leading/
 * trailing whitespace, capped at REASON_MAX).
 */
export const reasonSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => normalizeReason(v ?? undefined))
  .optional();

/** Statuses that require a non-empty reason (matches DB trigger). */
export const REASON_REQUIRED_STATUSES = ["cancelled", "no_show"] as const;
export type ReasonRequiredStatus = (typeof REASON_REQUIRED_STATUSES)[number];

export function reasonRequiredFor(status: string): boolean {
  return (REASON_REQUIRED_STATUSES as readonly string[]).includes(status);
}
