/**
 * pharmacy (medicine_orders) friendly-error integration test.
 *
 * يحاكي مسار `src/routes/pharmacy.tsx` عبر anon client مباشرةً على جدول
 * `medicine_orders` ويؤكد أن الأخطاء الحقيقية من DB تُحوَّل عبر
 * `friendlyInsertError` إلى نفس السلاسل العربية الثابتة الظاهرة في UI،
 * بدون تسريب نص PostgREST.
 *
 * الحالات:
 *   A. RLS 42501 — patient_name أقصر من 2 حروف (تُخرقها سياسة INSERT
 *      WITH CHECK) → FRIENDLY_INSERT_MESSAGES.rls.
 *   B. Invalid enum 22P02 — delivery_type بقيمة غير موجودة →
 *      FRIENDLY_INSERT_MESSAGES.invalid.
 *   C. Not-null 23502 — patient_phone مفقود → FRIENDLY_INSERT_MESSAGES.missing.
 *   D. Success path — إدخال صالح ينجح ويُحذف عبر service role.
 *   E. Non-leak — لا يوجد token إنجليزي من err الخام داخل السلسلة العربية.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/pharmacy-friendly-errors.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { friendlyInsertError, FRIENDLY_INSERT_MESSAGES } from "../../src/lib/insert-errors";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

type PGErr = { message?: string; code?: string; details?: string | null; hint?: string | null };

let passed = 0,
  failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function assertNoLeak(mapped: string, err: PGErr, label: string) {
  const parts = [err.message, err.details, err.hint].filter(
    (x): x is string => typeof x === "string" && x.trim().length >= 4,
  );
  for (const p of parts) {
    const tokens = p
      .split(/[^A-Za-z]+/)
      .filter((t) => t.length >= 4)
      .map((t) => t.toLowerCase());
    for (const t of tokens) {
      if (mapped.toLowerCase().includes(t)) {
        throw new Error(
          `${label}: mapped Arabic string leaks provider token ${JSON.stringify(t)}: ${JSON.stringify(mapped)}`,
        );
      }
    }
  }
}

const MARKER = `PHARM-FIE-${Date.now()}`;

async function main() {
  console.log("pharmacy / friendly-insert-error");

  // A. RLS 42501 — name too short (violates INSERT WITH CHECK policy)
  await test("A. anon insert with 1-char name → rls Arabic (42501 mapped)", async () => {
    const { error } = await anon.from("medicine_orders").insert({
      patient_name: "x",
      patient_phone: "0501234567",
      delivery_type: "delivery",
    });
    assert(error, "expected RLS error for too-short name");
    assertEq((error as PGErr).code, "42501", "expected 42501");
    const mapped = friendlyInsertError(error as PGErr);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.rls, "mapped Arabic (rls)");
    assertNoLeak(mapped, error as PGErr, "A/no-leak");
  });

  // B. Invalid enum 22P02 — bogus delivery_type
  await test("B. anon insert with bogus delivery_type → invalid Arabic (22P02)", async () => {
    const { error } = await anon.from("medicine_orders").insert({
      patient_name: `${MARKER}-invalid`,
      patient_phone: "0501234567",
      // Deliberately bogus enum value; cast through unknown to bypass SDK typing.
      delivery_type: "definitely_not_a_delivery_type" as unknown as "delivery",
    });
    assert(error, "expected invalid-enum error");
    assertEq((error as PGErr).code, "22P02", "expected 22P02");
    const mapped = friendlyInsertError(error as PGErr);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.invalid, "mapped Arabic (invalid)");
    assertNoLeak(mapped, error as PGErr, "B/no-leak");
  });

  // C. Not-null 23502 — patient_phone missing
  await test("C. anon insert with missing patient_phone → missing Arabic (23502)", async () => {
    const { error } = await anon.from("medicine_orders").insert({
      patient_name: `${MARKER}-missing`,
      delivery_type: "delivery",
    } as unknown as { patient_name: string; patient_phone: string; delivery_type: "delivery" });
    assert(error, "expected not-null error");
    // Depending on policy ordering this may surface as 23502 (not-null) or
    // 42501 (RLS check on trimmed phone length). Both are valid; both must
    // map to a fixed Arabic string with no provider leak.
    const err = error as PGErr;
    const mapped = friendlyInsertError(err);
    const acceptable = [FRIENDLY_INSERT_MESSAGES.missing, FRIENDLY_INSERT_MESSAGES.rls] as const;
    assert(
      (acceptable as readonly string[]).includes(mapped),
      `mapped Arabic must be one of missing/rls; got ${JSON.stringify(mapped)} for code ${err.code}`,
    );
    assertNoLeak(mapped, err, "C/no-leak");
  });

  // D. Success path — insert a valid row via anon, verify+delete via service role
  await test("D. anon insert with valid payload succeeds; row visible via service role", async () => {
    const patient_name = `${MARKER}-ok`;
    const { error } = await anon.from("medicine_orders").insert({
      patient_name,
      patient_phone: "0501234567",
      delivery_type: "pickup",
      items_text: "Paracetamol 500mg",
    });
    assert(!error, `unexpected error on happy path: ${error?.message}`);

    const { data: rows, error: readErr } = await admin
      .from("medicine_orders")
      .select("id, patient_name, delivery_type")
      .eq("patient_name", patient_name);
    assert(!readErr, `read failed: ${readErr?.message}`);
    assertEq(rows?.length ?? 0, 1, "expected exactly one row");
    assertEq(rows![0].delivery_type, "pickup", "delivery_type persisted");

    // cleanup
    await admin.from("medicine_orders").delete().eq("patient_name", patient_name);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
