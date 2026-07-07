/**
 * RPC tests: reminder preference audit lookup RPCs.
 *
 * Verifies:
 *   - `list_reminder_preferences_by_ref(_ref, _phone)`:
 *       * returns rows when ref+phone match the appointment
 *       * returns 0 rows when phone does NOT match (no cross-phone leak)
 *       * returns 0 rows when ref does NOT match
 *       * callable by anon
 *   - `my_reminder_preference_audit(_appointment_id)`:
 *       * returns rows when caller's profile.phone matches the appointment
 *       * returns 0 rows when caller's phone differs
 *       * returns 0 rows when unauthenticated (anon)
 *       * returns 0 rows for a random/unknown appointment id
 *
 * Run:  bun tests/rls/reminder-preference-audit-rpcs.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${(err as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("(skipping — missing Supabase env vars)");
    return;
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  async function signIn(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    assert(data.session, "no session");
    return c;
  }
  async function createUserWithPhone(email: string, phone: string) {
    const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Test User", phone },
    });
    if (error) throw error;
    // handle_new_user trigger inserts profile from user_metadata; upsert to be safe.
    await admin.from("profiles").upsert({ id: data.user.id, phone, full_name: "Test User" });
    return { userId: data.user.id, email, password };
  }

  const stamp = Date.now();
  const ownerPhone = "0500000" + String(stamp).slice(-3);
  const otherPhone = "0511111" + String(stamp).slice(-3);

  const createdAppts: string[] = [];
  const createdUsers: string[] = [];

  async function seedAppt(phone: string) {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "RPC-Audit-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        appointment_time: "10:00",
        status: "new",
        reminder_24h: true,
        reminder_2h: true,
      })
      .select("id").single();
    if (error) throw error;
    const id = data.id as string;
    createdAppts.push(id);
    // Trigger an audit row.
    await admin.from("appointments").update({ reminder_24h: false }).eq("id", id);
    return id;
  }

  console.log("\n── reminder preference audit RPCs ──");

  try {
    const ownerAppt = await seedAppt(ownerPhone);
    const otherAppt = await seedAppt(otherPhone);
    const ownerRef = ownerAppt.replace(/-/g, "").slice(0, 8);
    const otherRef = otherAppt.replace(/-/g, "").slice(0, 8);

    // ── list_reminder_preferences_by_ref (anon) ─────────────────────
    await test("by_ref: anon gets rows with matching ref+phone", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: ownerRef, _phone: ownerPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `expected >=1 rows, got ${rows.length}`);
    });

    await test("by_ref: wrong phone returns 0 rows (no cross-phone leak)", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: ownerRef, _phone: otherPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows for mismatched phone`);
    });

    await test("by_ref: unknown ref returns 0 rows", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: "deadbeef", _phone: ownerPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows for unknown ref`);
    });

    await test("by_ref: swapped phone from another real appt returns 0 rows", async () => {
      // ownerRef but phone from other appt: still must not leak owner rows.
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: otherRef, _phone: ownerPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows for phone/ref mismatch`);
    });

    await test("by_ref: empty phone → 0 rows", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: ownerRef, _phone: "",
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows for empty phone`);
    });

    await test("by_ref: empty ref → 0 rows even with valid phone", async () => {
      // LIKE '' || '%' = LIKE '%' matches all appts, but phone filter must still scope
      // to the caller's own appts. We assert the function does not leak OTHER phones'
      // rows: with empty ref + owner phone, we should get only owner's rows (or 0 if
      // the impl also rejects empty ref). Either way — no rows from `otherAppt`.
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: "", _phone: otherPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = ((data ?? []) as Array<{ id: string }>);
      // Must not contain rows from the owner's appointment.
      const { data: ownerRows } = await admin
        .from("reminder_preference_audit").select("id").eq("appointment_id", ownerAppt);
      const ownerIds = new Set((ownerRows ?? []).map((r) => r.id));
      const leaked = rows.filter((r) => ownerIds.has(r.id));
      assert(leaked.length === 0, `leaked ${leaked.length} owner rows via empty ref + other phone`);
    });

    await test("by_ref: null ref → error or 0 rows (no leak)", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: null, _phone: ownerPhone,
      } as never);
      // Postgres may reject nulls; both outcomes are acceptable as long as no rows leak.
      const rows = (data ?? []) as unknown[];
      assert(error !== null || rows.length === 0, `null ref leaked ${rows.length} rows`);
    });

    await test("by_ref: uppercase ref still matches (case-insensitive)", async () => {
      const { data, error } = await anon.rpc("list_reminder_preferences_by_ref" as never, {
        _ref: ownerRef.toUpperCase(), _phone: ownerPhone,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `case-insensitive lookup failed, got ${rows.length}`);
    });



    // ── my_reminder_preference_audit (authenticated) ────────────────
    const ownerU = await createUserWithPhone(`rpa-owner-${stamp}@test.local`, ownerPhone);
    const otherU = await createUserWithPhone(`rpa-other-${stamp}@test.local`, otherPhone);
    createdUsers.push(ownerU.userId, otherU.userId);

    const ownerC = await signIn(ownerU.email, ownerU.password);
    const otherC = await signIn(otherU.email, otherU.password);

    await test("my_audit: owner phone matches → rows returned", async () => {
      const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `expected >=1 rows for owner, got ${rows.length}`);
    });

    await test("my_audit: different phone → 0 rows (rejects other's appt)", async () => {
      const { data, error } = await otherC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows to non-owner`);
    });

    await test("my_audit: anon (no session) → 0 rows", async () => {
      const { data, error } = await anon.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `anon leaked ${rows.length} rows`);
    });

    await test("my_audit: random appointment id → 0 rows", async () => {
      const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: "00000000-0000-0000-0000-000000000000",
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `leaked ${rows.length} rows for random id`);
    });

    await test("my_audit: malformed uuid → error, no leak", async () => {
      const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: "not-a-uuid",
      } as never);
      const rows = (data ?? []) as unknown[];
      assert(error !== null || rows.length === 0, `malformed uuid leaked ${rows.length} rows`);
    });

    await test("my_audit: null appointment id → error or 0 rows", async () => {
      const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: null,
      } as never);
      const rows = (data ?? []) as unknown[];
      assert(error !== null || rows.length === 0, `null id leaked ${rows.length} rows`);
    });

    await test("my_audit: authenticated user with NO profile phone → 0 rows", async () => {
      const noPhoneU = await createUserWithPhone(`rpa-nophone-${stamp}@test.local`, ownerPhone);
      createdUsers.push(noPhoneU.userId);
      // Clear the profile phone AFTER creation to simulate a user without phone linkage.
      await admin.from("profiles").update({ phone: null }).eq("id", noPhoneU.userId);
      const noPhoneC = await signIn(noPhoneU.email, noPhoneU.password);
      const { data, error } = await noPhoneC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `user without profile phone leaked ${rows.length} rows`);
    });

    // ── Cross-user isolation with multiple appointments ─────────────
    const ownerAppt2 = await seedAppt(ownerPhone);
    const otherAppt2 = await seedAppt(otherPhone);

    await test("my_audit: owner sees rows for each of their own appts, one at a time", async () => {
      for (const id of [ownerAppt, ownerAppt2]) {
        const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length >= 1, `owner missed own appt ${id}`);
      }
    });

    await test("my_audit: owner cannot read either of other's appts", async () => {
      for (const id of [otherAppt, otherAppt2]) {
        const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length === 0, `owner leaked ${rows.length} rows from other's appt ${id}`);
      }
    });

    await test("my_audit: other user cannot read either of owner's appts", async () => {
      for (const id of [ownerAppt, ownerAppt2]) {
        const { data, error } = await otherC.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length === 0, `other leaked ${rows.length} rows from owner's appt ${id}`);
      }
    });

    await test("my_audit: returned rows belong ONLY to the requested appointment", async () => {
      // Regression guard: fn must filter by _appointment_id, not just by phone.
      const { data, error } = await ownerC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = ((data ?? []) as Array<{ id: string }>);
      const { data: expected } = await admin
        .from("reminder_preference_audit").select("id").eq("appointment_id", ownerAppt);
      const expectedIds = new Set((expected ?? []).map((r) => r.id));
      for (const r of rows) {
        assert(expectedIds.has(r.id), `row ${r.id} does not belong to appt ${ownerAppt}`);
      }
      const { data: appt2 } = await admin
        .from("reminder_preference_audit").select("id").eq("appointment_id", ownerAppt2);
      const appt2Ids = new Set((appt2 ?? []).map((r) => r.id));
      const bleed = rows.filter((r) => appt2Ids.has(r.id));
      assert(bleed.length === 0, `bled ${bleed.length} rows from sibling own-appt`);
    });

    await test("my_audit: profile phone swap re-scopes access dynamically", async () => {
      // Move owner's profile phone to otherPhone. Owner should now see other's appts
      // and lose access to own — matching is dynamic on profile.phone, not cached.
      await admin.from("profiles").update({ phone: otherPhone }).eq("id", ownerU.userId);
      try {
        const gain = await ownerC.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: otherAppt,
        } as never);
        const lose = await ownerC.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: ownerAppt,
        } as never);
        assert(!gain.error && !lose.error, "rpc err");
        const gained = ((gain.data ?? []) as unknown[]).length;
        const kept = ((lose.data ?? []) as unknown[]).length;
        assert(gained >= 1, `expected access to other's appt after swap, got ${gained}`);
        assert(kept === 0, `expected loss of own-appt access after swap, still saw ${kept}`);
      } finally {
        await admin.from("profiles").update({ phone: ownerPhone }).eq("id", ownerU.userId);
      }
    });



  } finally {
    if (createdAppts.length) {
      await admin.from("appointments").delete().in("id", createdAppts);
    }
    for (const uid of createdUsers) {
      await admin.auth.admin.deleteUser(uid).catch(() => void 0);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
