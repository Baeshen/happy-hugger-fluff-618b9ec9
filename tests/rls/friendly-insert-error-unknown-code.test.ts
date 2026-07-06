/**
 * Integration test: حالة رمز خطأ Postgres غير معروف من `friendlyInsertError`.
 *
 * الهدف: التأكد أن النظام عندما يصادف رمز SQLSTATE حقيقي غير مسجّل
 * صراحةً داخل `friendlyInsertError` (لا مطابقة code ولا مطابقة نصية)
 * يعيد رسالة `FRIENDLY_INSERT_MESSAGES.unknown` الواضحة، لا استثناء
 * ولا نص خام من PostgREST.
 *
 * ثلاث حالات مكمّلة:
 *
 *   1) خطأ حقيقي من الـ DB برمز غير مغطى: محاولة INSERT عبر anon على
 *      جدول غير موجود (`__nonexistent_table_for_friendly_error_test__`).
 *      يُنتج PostgREST خطأً برمز `PGRST205` (أو ما شابه) وهو غير مُدرج
 *      داخل `friendlyInsertError` — نتوقع فعليًا الوقوع في fallback
 *      `unknown` وعدم تسريب نص المزود.
 *
 *   2) خطأ حقيقي بـ SQLSTATE بوستقرس غير معروف بالنسبة للمابنغ:
 *      استدعاء RPC غير موجودة عبر service role — ينتج غالبًا `PGRST202`
 *      (Not Found) → أيضًا `unknown`.
 *
 *   3) shape-only: كائن خطأ بمُوّجّه رمز مصطنع غير مسجّل (مثلاً `XX000`
 *      internal_error، أو `40P01` deadlock_detected) للتأكد أن الفرع
 *      code-first لا يخطئ ويعيد `unknown` بدل الاستثناء.
 *
 * كل الحالات تتحقق أيضًا من:
 *   - النتيجة نص عربي مطابق حرفيًا لـ FRIENDLY_INSERT_MESSAGES.unknown.
 *   - عدم تسرّب أي token إنجليزي من err.message/details/hint.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/friendly-insert-error-unknown-code.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  friendlyInsertError,
  FRIENDLY_INSERT_MESSAGES,
} from "../../src/lib/insert-errors";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

type PGErr = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

let passed = 0, failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${(e as Error).message}`); failed++; }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
/** يمنع أي token إنجليزي من err الخام أن يتسرب داخل السلسلة العربية. */
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
          `${label}: mapped string leaks raw provider token ${JSON.stringify(t)}: ${JSON.stringify(mapped)}`,
        );
      }
    }
  }
}
/** أكواد Postgres/PostgREST المعروفة والمغطاة صراحةً داخل friendlyInsertError. */
const MAPPED_CODES = new Set([
  "23505", // duplicate
  "42501", // rls
  "23502", // missing
  "23503", // reference
  "23514", // check
  "22001", // check (length overflow)
  "22P02", // invalid
]);

async function main() {
  console.log("friendly-insert-error / unknown code fallback");

  // ---------- 1) خطأ حقيقي: INSERT على جدول غير موجود عبر anon ----------
  let realUnknownA: PGErr | null = null;
  await test("1. real error on nonexistent table → unknown Arabic (no throw, no leak)", async () => {
    // Bypass the SDK's typed table union to reach a real network error.
    const { error } = await (anon.from as unknown as (t: string) => ReturnType<typeof anon.from>)(
      "__nonexistent_table_for_friendly_error_test__",
    ).insert({ x: 1 } as never);
    assert(error, "expected an error inserting into a nonexistent table");
    realUnknownA = error as PGErr;
    // يجب ألا يكون الرمز واحدًا من الأكواد المغطاة صراحة — وإلا فقدت الحالة معناها.
    assert(
      !realUnknownA.code || !MAPPED_CODES.has(realUnknownA.code),
      `expected an UN-mapped Postgres/PostgREST code, got ${JSON.stringify(realUnknownA.code)}`,
    );
    const mapped = friendlyInsertError(realUnknownA);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.unknown, "mapped Arabic (unknown)");
    assertNoLeak(mapped, realUnknownA, "1/no-leak");
  });

  // ---------- 2) خطأ حقيقي: RPC غير موجودة عبر service role ----------
  let realUnknownB: PGErr | null = null;
  await test("2. real error on nonexistent RPC → unknown Arabic (no throw, no leak)", async () => {
    const { error } = await (admin.rpc as unknown as (name: string) => Promise<{ error: PGErr | null }>)(
      "__nonexistent_rpc_for_friendly_error_test__",
    );
    assert(error, "expected an error calling a nonexistent RPC");
    realUnknownB = error as PGErr;
    assert(
      !realUnknownB.code || !MAPPED_CODES.has(realUnknownB.code),
      `expected an UN-mapped code, got ${JSON.stringify(realUnknownB.code)}`,
    );
    const mapped = friendlyInsertError(realUnknownB);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.unknown, "mapped Arabic (unknown)");
    assertNoLeak(mapped, realUnknownB, "2/no-leak");
  });

  // ---------- 3) shape-only: SQLSTATE حقيقي لكنه غير مسجل في المابنغ ----------
  await test("3. shape-only unknown SQLSTATEs → unknown Arabic (no throw)", async () => {
    const cases: PGErr[] = [
      { code: "XX000", message: "internal_error" },       // internal_error
      { code: "40P01", message: "deadlock detected" },    // deadlock_detected (not mapped)
      { code: "53300", message: "too many connections" }, // too_many_connections
      { code: "08006", message: "connection failure" },   // connection_failure
      { code: "ZZ999", message: "totally made up" },      // completely fabricated
    ];
    for (const fake of cases) {
      assert(!MAPPED_CODES.has(fake.code!), `test bug: ${fake.code} should be unmapped`);
      const mapped = friendlyInsertError(fake);
      assertEq(
        mapped,
        FRIENDLY_INSERT_MESSAGES.unknown,
        `mapped Arabic (unknown) for code=${fake.code}`,
      );
      assertNoLeak(mapped, fake, `3/${fake.code}/no-leak`);
    }
  });

  // ---------- 4) الرسالة نفسها موجودة في الجدول وليست فارغة ----------
  await test("4. FRIENDLY_INSERT_MESSAGES.unknown is a non-empty Arabic string", async () => {
    const v = FRIENDLY_INSERT_MESSAGES.unknown;
    assert(typeof v === "string" && v.length > 0, "unknown message must be non-empty");
    assert(/[\u0600-\u06FF]/.test(v), "unknown message must contain Arabic characters");
    assert(!/[A-Za-z0-9]/.test(v), "unknown message must not contain ASCII letters/digits");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
