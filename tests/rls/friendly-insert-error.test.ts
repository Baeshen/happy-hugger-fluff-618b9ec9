/**
 * friendlyInsertError integration test.
 *
 * Guarantees that the mapping in src/lib/insert-errors.ts collapses raw
 * Supabase/PostgREST error objects — real ones from the live DB and
 * fabricated shape-only ones — into the same fixed Arabic strings from
 * FRIENDLY_INSERT_MESSAGES, WITHOUT re-emitting PostgREST text.
 *
 * Coverage:
 *
 *   A. Real 42501 (RLS reject): anon insert into appointments with a past
 *      appointment_date → live PostgREST error → mapped to
 *      FRIENDLY_INSERT_MESSAGES.rls.
 *
 *   B. Real 23505 (duplicate key): service-role inserts the same (user_id,
 *      role) row into public.user_roles twice → live PostgREST 23505 →
 *      mapped to FRIENDLY_INSERT_MESSAGES.duplicate.
 *
 *   C. Shape-only 23514 (check-constraint): fabricated error object with
 *      code='23514' and NO English message text → still mapped to
 *      FRIENDLY_INSERT_MESSAGES.check, proving mapping is code-first.
 *
 *   D. Text-only 42501: fabricated object with NO code but PostgREST's
 *      English "new row violates row-level security policy" text → mapped
 *      to FRIENDLY_INSERT_MESSAGES.rls, proving message-fallback works.
 *
 *   E. Network error: fabricated { message: 'Failed to fetch' } (no code) →
 *      mapped to FRIENDLY_INSERT_MESSAGES.network.
 *
 *   F. Unknown error: fabricated { code: 'XX999', message: 'weird' } →
 *      mapped to FRIENDLY_INSERT_MESSAGES.unknown.
 *
 *   G. Non-leak guarantee: for every real PostgREST error above, assert
 *      that the returned Arabic string does NOT contain ANY substring from
 *      err.message / err.details / err.hint. This is the invariant that
 *      guards against accidentally interpolating provider text into the
 *      user-facing string.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/friendly-insert-error.test.ts
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

/** Assert none of the raw provider fields leak into the mapped string. */
function assertNoLeak(mapped: string, err: PGErr, label: string) {
  const parts = [err.message, err.details, err.hint].filter(
    (x): x is string => typeof x === "string" && x.trim().length >= 4,
  );
  for (const p of parts) {
    // Split raw text into meaningful English tokens (≥ 4 chars, alpha).
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

async function main() {
  console.log("friendly-insert-error");

  // ---------- A. Real 42501 via anon insert with past date ----------
  let realRls: PGErr | null = null;
  await test("A. real 42501 from anon appointments insert (past date) → rls Arabic", async () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { error } = await anon.from("appointments").insert({
      patient_name: "FIE-RLS-Past",
      patient_phone: "0501234567",
      appointment_date: past,
      appointment_time: "10:00",
      specialty_id: null,
      doctor_id: null,
    });
    assert(error, "expected an error for past-date anon insert");
    realRls = error as PGErr;
    assertEq(realRls.code, "42501", "expected code 42501");
    const mapped = friendlyInsertError(realRls);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.rls, "mapped Arabic (rls)");
    assertNoLeak(mapped, realRls, "A/no-leak");
  });

  // ---------- B. Real 23505 via duplicate user_roles insert ----------
  let userId: string | null = null;
  let realDup: PGErr | null = null;
  try {
    await test("B. real 23505 duplicate user_roles insert → duplicate Arabic", async () => {
      const email = `fie-dup-${Date.now()}@test.local`;
      const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
      const { data: u, error: uerr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (uerr) throw uerr;
      userId = u.user.id;
      const first = await admin.from("user_roles").insert({ user_id: userId, role: "reception" });
      if (first.error) throw first.error;
      const second = await admin.from("user_roles").insert({ user_id: userId, role: "reception" });
      assert(second.error, "expected duplicate-key error on second insert");
      realDup = second.error as PGErr;
      assertEq(realDup.code, "23505", "expected code 23505");
      const mapped = friendlyInsertError(realDup);
      assertEq(mapped, FRIENDLY_INSERT_MESSAGES.duplicate, "mapped Arabic (duplicate)");
      assertNoLeak(mapped, realDup, "B/no-leak");
    });
  } finally {
    if (userId) {
      try { await admin.from("user_roles").delete().eq("user_id", userId); } catch {}
      try { await admin.auth.admin.deleteUser(userId); } catch {}
    }
  }

  // ---------- B2. Real 23502 (not-null) via user_roles missing user_id ----------
  let realNotNull: PGErr | null = null;
  await test("B2. real 23502 not-null on user_roles.user_id → missing Arabic", async () => {
    // Cast through unknown so the SDK type-check doesn't block the intentionally
    // malformed payload we need to reach the DB.
    const { error } = await admin.from("user_roles").insert(
      { role: "reception" } as unknown as { user_id: string; role: "reception" },
    );
    assert(error, "expected not-null error");
    realNotNull = error as PGErr;
    assertEq(realNotNull.code, "23502", "expected code 23502");
    const mapped = friendlyInsertError(realNotNull);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.missing, "mapped Arabic (missing)");
    assertNoLeak(mapped, realNotNull, "B2/no-leak");
  });

  // ---------- B3. Real 23503 (FK) via user_roles with non-existent user_id ----------
  let realFk: PGErr | null = null;
  await test("B3. real 23503 FK on user_roles.user_id → reference Arabic", async () => {
    const { error } = await admin.from("user_roles").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      role: "reception",
    });
    assert(error, "expected FK error");
    realFk = error as PGErr;
    assertEq(realFk.code, "23503", "expected code 23503");
    const mapped = friendlyInsertError(realFk);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.reference, "mapped Arabic (reference)");
    assertNoLeak(mapped, realFk, "B3/no-leak");
  });

  // ---------- B4. Real 22P02 (invalid enum) via user_roles.role = bogus ----------
  let realInvalid: PGErr | null = null;
  let bogusUserId: string | null = null;
  try {
    await test("B4. real 22P02 invalid enum value on user_roles.role → invalid Arabic", async () => {
      const email = `fie-enum-${Date.now()}@test.local`;
      const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
      const { data: u, error: uerr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (uerr) throw uerr;
      bogusUserId = u.user.id;
      const { error } = await admin.from("user_roles").insert(
        { user_id: bogusUserId, role: "definitely_not_a_role" } as unknown as {
          user_id: string; role: "reception";
        },
      );
      assert(error, "expected invalid-enum error");
      realInvalid = error as PGErr;
      assertEq(realInvalid.code, "22P02", "expected code 22P02");
      const mapped = friendlyInsertError(realInvalid);
      assertEq(mapped, FRIENDLY_INSERT_MESSAGES.invalid, "mapped Arabic (invalid)");
      assertNoLeak(mapped, realInvalid, "B4/no-leak");
    });
  } finally {
    if (bogusUserId) {
      try { await admin.from("user_roles").delete().eq("user_id", bogusUserId); } catch {}
      try { await admin.auth.admin.deleteUser(bogusUserId); } catch {}
    }
  }

  // ---------- C. Shape-only 23514 (no English text) ----------
  await test("C. code-only 23514 (empty message) → check Arabic (code-first mapping)", async () => {
    const fake: PGErr = { code: "23514", message: "" };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.check, "mapped Arabic (check)");
  });

  // ---------- C2. Shape-only 22001 length overflow → also `check` ----------
  await test("C2. code-only 22001 (string_data_right_truncation) → check Arabic", async () => {
    const fake: PGErr = { code: "22001", message: "" };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.check, "mapped Arabic (check)");
  });

  // ---------- C3. Text-only 23502 without code → `missing` ----------
  await test("C3. text-only null-value message (no code) → missing Arabic", async () => {
    const fake: PGErr = {
      message: 'null value in column "user_id" of relation "user_roles" violates not-null constraint',
    };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.missing, "mapped Arabic (missing via text)");
    assertNoLeak(mapped, fake, "C3/no-leak");
  });

  // ---------- C4. Text-only 23503 foreign-key message → `reference` ----------
  await test("C4. text-only foreign-key message (no code) → reference Arabic", async () => {
    const fake: PGErr = {
      message:
        'insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey"',
    };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.reference, "mapped Arabic (reference via text)");
    assertNoLeak(mapped, fake, "C4/no-leak");
  });

  // ---------- C5. Text-only 22P02 invalid input syntax → `invalid` ----------
  await test("C5. text-only 'invalid input syntax' (no code) → invalid Arabic", async () => {
    const fake: PGErr = { message: 'invalid input syntax for type uuid: "not-a-uuid"' };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.invalid, "mapped Arabic (invalid via text)");
    assertNoLeak(mapped, fake, "C5/no-leak");
  });

  // ---------- D. Text-only 42501 ----------
  await test("D. text-only RLS message (no code) → rls Arabic (text fallback)", async () => {
    const fake: PGErr = {
      message: 'new row violates row-level security policy for table "appointments"',
    };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.rls, "mapped Arabic (rls via text)");
    assertNoLeak(mapped, fake, "D/no-leak");
  });

  // ---------- E. Network-shaped error ----------
  await test("E. network-shaped error (Failed to fetch) → network Arabic", async () => {
    const fake: PGErr = { message: "TypeError: Failed to fetch" };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.network, "mapped Arabic (network)");
  });

  // ---------- F. Unknown error → generic fallback ----------
  await test("F. unknown code/message → unknown Arabic fallback", async () => {
    const fake: PGErr = { code: "XX999", message: "surprise from provider" };
    const mapped = friendlyInsertError(fake);
    assertEq(mapped, FRIENDLY_INSERT_MESSAGES.unknown, "mapped Arabic (unknown)");
    // Also: nullish inputs must not throw and must return the fallback.
    assertEq(friendlyInsertError(null), FRIENDLY_INSERT_MESSAGES.unknown, "null → unknown");
    assertEq(friendlyInsertError(undefined), FRIENDLY_INSERT_MESSAGES.unknown, "undefined → unknown");
    assertEq(friendlyInsertError({}), FRIENDLY_INSERT_MESSAGES.unknown, "{} → unknown");
  });

  // ---------- G. Distinctness: each key returns a DIFFERENT Arabic string ----------
  await test("G. every FRIENDLY_INSERT_MESSAGES value is unique and pure Arabic", async () => {
    const values = Object.values(FRIENDLY_INSERT_MESSAGES);
    const uniq = new Set(values);
    assertEq(uniq.size, values.length, "message values must be unique");
    for (const v of values) {
      if (/[A-Za-z0-9]/.test(v)) {
        throw new Error(`friendly message contains ASCII letters/digits: ${JSON.stringify(v)}`);
      }
      if (!/[\u0600-\u06FF]/.test(v)) {
        throw new Error(`friendly message has no Arabic range chars: ${JSON.stringify(v)}`);
      }
    }
  });

  // ---------- H. Global non-leak across every captured real error ----------
  await test("H. real PostgREST errors never leak provider tokens into mapped strings", async () => {
    const cases: Array<[string, PGErr | null]> = [
      ["rls",     realRls],
      ["dup",     realDup],
      ["notnull", realNotNull],
      ["fk",      realFk],
      ["invalid", realInvalid],
    ];
    for (const [label, e] of cases) {
      assert(e, `no real error captured for ${label}`);
      assertNoLeak(friendlyInsertError(e), e, `H/${label}`);
    }
  });


  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
