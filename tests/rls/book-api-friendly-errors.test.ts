/**
 * API test for POST /api/public/book/create.
 *
 * Asserts the server endpoint returns exactly the same Arabic user-facing
 * strings the /book UI shows, from BOTH failure classes:
 *
 *   Validation (Zod, before DB):
 *     - short name        → "الاسم قصير جدًا (٢ أحرف على الأقل)"
 *     - long name         → "الاسم طويل جدًا"
 *     - short phone       → "رقم الهاتف قصير جدًا"
 *     - bad phone chars   → "رقم الهاتف يحتوي على أحرف غير مسموحة"
 *     - reason 501 chars  → "السبب طويل جدًا (الحد الأقصى 500 حرفًا)"
 *     - bad date format   → "تاريخ غير صالح"
 *     - bad time format   → "وقت غير صالح"
 *     - garbage JSON body → FRIENDLY_INSERT_MESSAGES.unknown
 *
 *   DB / RLS (real live DB, past date bypasses Zod but trips RLS 42501):
 *     - past appointment_date → FRIENDLY_INSERT_MESSAGES.rls
 *       (identical string to what friendlyInsertError() would map)
 *
 *   Success path:
 *     - valid future booking → HTTP 200, { ok: true }, one row visible via
 *       service role, cleaned up after.
 *
 *   Non-leak invariant (repeated at API layer):
 *     - the RLS response body must NOT contain any English DB token
 *       ("row-level", "policy", "42501", "violates", "postgres", …).
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/book-api-friendly-errors.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { FRIENDLY_INSERT_MESSAGES } from "../../src/lib/insert-errors";

const URL = process.env.SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";
if (!URL || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });

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

const FUTURE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const validBody = (overrides: Record<string, unknown> = {}) => ({
  patient_name: `ApiBook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  patient_phone: "0501234567",
  appointment_date: FUTURE,
  appointment_time: "10:00",
  ...overrides,
});

async function post(body: unknown, opts: { raw?: string } = {}) {
  const res = await fetch(`${BASE}/api/public/book/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: opts.raw ?? JSON.stringify(body),
  });
  let json: { ok?: boolean; kind?: string; message?: string } | null = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

// English/technical tokens that must never appear in any /book response.
const LEAK_MARKERS = [
  "row-level", "row level", "violates", "policy", "postgres", "pgrst",
  "42501", "23505", "23514", "constraint", "duplicate key",
  "public.appointments", "rest/v1", "http://", "https://", '"details"',
  '"hint"', "column", "relation ",
];

function assertNoLeak(bodyText: string, label: string) {
  const lower = bodyText.toLowerCase();
  for (const m of LEAK_MARKERS) {
    if (lower.includes(m.toLowerCase())) {
      throw new Error(`${label}: response leaked forbidden token ${JSON.stringify(m)}: ${bodyText}`);
    }
  }
}

async function main() {
  console.log("book-api-friendly-errors");

  // ---------- Validation cases ----------
  await test("V1. short patient_name → Arabic validation message, 400, kind=validation", async () => {
    const { status, json } = await post(validBody({ patient_name: "ا" }));
    assertEq(status, 400, "status");
    assertEq(json?.ok, false, "ok");
    assertEq(json?.kind, "validation", "kind");
    assertEq(json?.message, "الاسم قصير جدًا (٢ أحرف على الأقل)", "message");
    assertNoLeak(JSON.stringify(json), "V1");
  });

  await test("V2. long patient_name → 'الاسم طويل جدًا'", async () => {
    const { json } = await post(validBody({ patient_name: "ا".repeat(200) }));
    assertEq(json?.message, "الاسم طويل جدًا", "message");
  });

  await test("V3. short phone → 'رقم الهاتف قصير جدًا'", async () => {
    const { json } = await post(validBody({ patient_phone: "0501" }));
    assertEq(json?.message, "رقم الهاتف قصير جدًا", "message");
  });

  await test("V4. bad phone chars → 'رقم الهاتف يحتوي على أحرف غير مسموحة'", async () => {
    const { json } = await post(validBody({ patient_phone: "abc<>xyz" }));
    assertEq(json?.message, "رقم الهاتف يحتوي على أحرف غير مسموحة", "message");
  });

  await test("V5. reason 501 → 'السبب طويل جدًا (الحد الأقصى 500 حرفًا)'", async () => {
    const { json } = await post(validBody({ reason: "س".repeat(501) }));
    assertEq(json?.message, "السبب طويل جدًا (الحد الأقصى 500 حرفًا)", "message");
  });

  await test("V6. bad appointment_date format → 'تاريخ غير صالح'", async () => {
    const { json } = await post(validBody({ appointment_date: "2099/01/01" }));
    assertEq(json?.message, "تاريخ غير صالح", "message");
  });

  await test("V7. bad appointment_time format → 'وقت غير صالح'", async () => {
    const { json } = await post(validBody({ appointment_time: "10 am" }));
    assertEq(json?.message, "وقت غير صالح", "message");
  });

  await test("V8. malformed JSON body → generic unknown Arabic fallback", async () => {
    const { status, json } = await post(null, { raw: "{not json" });
    assertEq(status, 400, "status");
    assertEq(json?.kind, "validation", "kind");
    assertEq(json?.message, FRIENDLY_INSERT_MESSAGES.unknown, "message");
  });

  // ---------- RLS / DB case ----------
  await test("D1. past appointment_date → 400, kind=db, message === FRIENDLY_INSERT_MESSAGES.rls (no leak)", async () => {
    const body = validBody({ appointment_date: PAST });
    const { status, json } = await post(body);
    assertEq(status, 400, "status");
    assertEq(json?.ok, false, "ok");
    assertEq(json?.kind, "db", "kind");
    assertEq(json?.message, FRIENDLY_INSERT_MESSAGES.rls, "message");
    assertNoLeak(JSON.stringify(json), "D1");
    // No row must have landed (defense in depth against a bad server change).
    const { data } = await admin.from("appointments")
      .select("id").eq("patient_name", body.patient_name);
    assert(!data || data.length === 0, `unexpected row for ${body.patient_name}`);
  });

  // ---------- Success case ----------
  await test("S1. valid future booking → 200 ok:true, row created, then cleaned up", async () => {
    const body = validBody();
    const { status, json } = await post(body);
    assertEq(status, 200, "status");
    assertEq(json?.ok, true, "ok");
    const { data } = await admin.from("appointments")
      .select("id,status,notes").eq("patient_name", body.patient_name);
    assert(data && data.length === 1, `expected 1 row for ${body.patient_name}, got ${data?.length ?? 0}`);
    assertEq(data![0].status, "new", "status");
    assertEq(data![0].notes, null, "notes");
    // Cleanup.
    await admin.from("appointment_audit").delete().eq("appointment_id", data![0].id);
    await admin.from("appointments").delete().eq("id", data![0].id);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
