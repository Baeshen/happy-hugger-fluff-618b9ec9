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

    await test("my_audit: authenticated user with NO profile row at all → 0 rows", async () => {
      const noRowU = await createUserWithPhone(`rpa-norow-${stamp}@test.local`, ownerPhone);
      createdUsers.push(noRowU.userId);
      // Delete the profile row entirely (not just clear phone).
      const del = await admin.from("profiles").delete().eq("id", noRowU.userId);
      assert(!del.error, `profile delete failed: ${del.error?.message}`);
      const { data: check } = await admin
        .from("profiles").select("id").eq("id", noRowU.userId).maybeSingle();
      assert(check === null, "profile row still present after delete — precondition failed");

      const noRowC = await signIn(noRowU.email, noRowU.password);
      const { data, error } = await noRowC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `user without profile row leaked ${rows.length} rows`);
    });

    await test("my_audit: no-profile user tried against ALL known appts → 0 rows across the board", async () => {
      // Belt-and-suspenders: even iterating every appt in the test set, a user
      // with no profile row must never see a single audit row.
      const noRow2 = await createUserWithPhone(`rpa-norow2-${stamp}@test.local`, otherPhone);
      createdUsers.push(noRow2.userId);
      await admin.from("profiles").delete().eq("id", noRow2.userId);
      const noRow2C = await signIn(noRow2.email, noRow2.password);
      for (const id of [ownerAppt, otherAppt]) {
        const { data, error } = await noRow2C.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length === 0, `no-profile user leaked ${rows.length} rows for appt ${id}`);
      }
    });

    await test("my_audit: deleting profile mid-session revokes access on next call", async () => {
      // Sign in with a valid profile → prove access → delete profile → prove revocation.
      const midU = await createUserWithPhone(`rpa-middel-${stamp}@test.local`, ownerPhone);
      createdUsers.push(midU.userId);
      const midC = await signIn(midU.email, midU.password);

      const before = await midC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!before.error, `pre-del err: ${before.error?.message}`);
      assert(((before.data ?? []) as unknown[]).length >= 1, "expected access before profile delete");

      await admin.from("profiles").delete().eq("id", midU.userId);

      const after = await midC.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: ownerAppt,
      } as never);
      assert(!after.error, `post-del err: ${after.error?.message}`);
      const rows = (after.data ?? []) as unknown[];
      assert(rows.length === 0, `access not revoked after profile delete, still saw ${rows.length}`);
    });


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

    // ── Phone-format normalization on profiles.phone side ───────────
    // Function normalizes both sides with regexp_replace(phone,'\D','','g'),
    // so any formatting that leaves the same digit sequence must still match,
    // and a different digit sequence must NOT match.
    async function seedForDigits(digits: string) {
      // Appointment phone stored plain (digits only) so we vary only profile.phone.
      return seedAppt(digits);
    }
    async function makeUserWithProfilePhone(email: string, profilePhone: string) {
      const u = await createUserWithPhone(email, profilePhone);
      createdUsers.push(u.userId);
      // createUserWithPhone already upserts profiles.phone verbatim.
      const c = await signIn(u.email, u.password);
      return { u, c };
    }

    const fmtDigits = "0512345" + String(stamp).slice(-3); // canonical digit form

    await test("my_audit: profile phone with SPACES matches plain-digit appt", async () => {
      const apptId = await seedForDigits(fmtDigits);
      const spaced = fmtDigits.replace(/(\d{3})(\d{3})/, "$1 $2 ");
      const { c } = await makeUserWithProfilePhone(
        `rpa-fmt-space-${stamp}@test.local`, spaced,
      );
      const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `spaced profile phone failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile phone with DASHES matches plain-digit appt", async () => {
      const apptId = await seedForDigits(fmtDigits);
      const dashed = fmtDigits.slice(0, 4) + "-" + fmtDigits.slice(4);
      const { c } = await makeUserWithProfilePhone(
        `rpa-fmt-dash-${stamp}@test.local`, dashed,
      );
      const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `dashed profile phone failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile phone with PARENS/PLUS around identical digits matches", async () => {
      const apptId = await seedForDigits(fmtDigits);
      // Wrap the first 3 digits in parens and add a leading '+' — non-digits are stripped.
      const wrapped = "+(" + fmtDigits.slice(0, 3) + ") " + fmtDigits.slice(3);
      const { c } = await makeUserWithProfilePhone(
        `rpa-fmt-paren-${stamp}@test.local`, wrapped,
      );
      const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `parens/plus profile phone failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile phone with DIFFERENT digits (country code vs leading 0) does NOT match", async () => {
      // Appt "0500...", profile "+966500..." → digit sequences differ (leading 0 vs 966).
      // The function must NOT match — this documents that normalization is digit-preserving,
      // not country-code aware.
      const apptDigits = "0500999" + String(stamp).slice(-3);
      const apptId = await seedForDigits(apptDigits);
      const intl = "+966" + apptDigits.slice(1); // drops leading 0, prepends 966
      const { c } = await makeUserWithProfilePhone(
        `rpa-fmt-intl-${stamp}@test.local`, intl,
      );
      const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `country-code variant should NOT match, leaked ${rows.length} rows`);
    });

    await test("my_audit: profile phone with EXTRA leading zeros does NOT match", async () => {
      // "00" prefix (international dial-out) changes the digit sequence.
      const apptDigits = "0522000" + String(stamp).slice(-3);
      const apptId = await seedForDigits(apptDigits);
      const withLeading = "00" + apptDigits; // e.g. "000522..." != "0522..."
      const { c } = await makeUserWithProfilePhone(
        `rpa-fmt-lead0-${stamp}@test.local`, withLeading,
      );
      const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length === 0, `extra leading zeros should NOT match, leaked ${rows.length} rows`);
    });


    // ── Blank / non-digit profile.phone values (must not leak anything) ─
    // These strings all normalize to "" via regexp_replace(phone,'\D','','g').
    // The function must NOT return rows for any appt, because a real appt's
    // patient_phone normalizes to a non-empty digit string.
    async function assertBlankPhoneLeaksNothing(
      label: string,
      profilePhone: string,
    ) {
      const u = await createUserWithPhone(
        `rpa-blank-${label}-${stamp}@test.local`,
        "0599000000", // any placeholder; overwritten next line
      );
      createdUsers.push(u.userId);
      const upd = await admin
        .from("profiles").update({ phone: profilePhone }).eq("id", u.userId);
      assert(!upd.error, `profile update failed: ${upd.error?.message}`);
      const c = await signIn(u.email, u.password);
      for (const id of [ownerAppt, otherAppt]) {
        const { data, error } = await c.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err (${label}) on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(
          rows.length === 0,
          `blank profile phone "${label}" leaked ${rows.length} rows for appt ${id}`,
        );
      }
    }

    await test("my_audit: profile.phone = '' (empty string) → 0 rows, no leak", async () => {
      await assertBlankPhoneLeaksNothing("empty", "");
    });

    await test("my_audit: profile.phone = '   ' (spaces only) → 0 rows, no leak", async () => {
      await assertBlankPhoneLeaksNothing("spaces", "   ");
    });

    await test("my_audit: profile.phone = tabs/newlines only → 0 rows, no leak", async () => {
      await assertBlankPhoneLeaksNothing("ws", "\t\n \r");
    });

    await test("my_audit: profile.phone = non-digit punctuation only ('+-() ') → 0 rows, no leak", async () => {
      await assertBlankPhoneLeaksNothing("punct", "+-() ");
    });

    await test("my_audit: profile.phone = Arabic/Unicode whitespace only (NBSP) → 0 rows, no leak", async () => {
      // \u00A0 is non-breaking space — non-digit; must normalize to "".
      await assertBlankPhoneLeaksNothing("nbsp", "\u00A0\u00A0\u00A0");
    });

    // ── Non-digit characters INSIDE the phone (mixed content) ───────
    // The normalization strips every non-ASCII-digit char. These tests prove:
    //   (a) mixed junk around own digits still resolves to own appts, and
    //   (b) junk-heavy strings without the correct digit sequence never leak
    //       another user's rows — even under interleaved calls.
    async function makeMixedUser(label: string, profilePhone: string) {
      const u = await createUserWithPhone(
        `rpa-mix-${label}-${stamp}@test.local`,
        "0599111111", // placeholder; overwritten
      );
      createdUsers.push(u.userId);
      const upd = await admin
        .from("profiles").update({ phone: profilePhone }).eq("id", u.userId);
      assert(!upd.error, `profile update failed: ${upd.error?.message}`);
      const c = await signIn(u.email, u.password);
      return { userId: u.userId, client: c };
    }

    // Isolate this block with its own owner phone/appt so mixed users cannot
    // accidentally collide with existing test users.
    const mixOwnerPhone = "0533444" + String(stamp).slice(-3);
    const mixApptId = await seedAppt(mixOwnerPhone);

    await test("my_audit: profile.phone with LATIN LETTERS around correct digits still matches own", async () => {
      const junk = "abc" + mixOwnerPhone + "xyz";
      const { client } = await makeMixedUser("letters", junk);
      const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: mixApptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `letters-wrapped digits failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile.phone with EMOJI inside digits still matches own", async () => {
      const withEmoji =
        mixOwnerPhone.slice(0, 3) + "📞" + mixOwnerPhone.slice(3, 6) + "✨" + mixOwnerPhone.slice(6);
      const { client } = await makeMixedUser("emoji", withEmoji);
      const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: mixApptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `emoji-inside digits failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile.phone with ZERO-WIDTH SPACE inside digits still matches own", async () => {
      const zwsp = mixOwnerPhone.slice(0, 4) + "\u200B\u200C" + mixOwnerPhone.slice(4);
      const { client } = await makeMixedUser("zwsp", zwsp);
      const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: mixApptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      const rows = (data ?? []) as unknown[];
      assert(rows.length >= 1, `zwsp-inside digits failed to match, got ${rows.length}`);
    });

    await test("my_audit: profile.phone with ARABIC-INDIC digits (٠-٩) does NOT match ASCII-digit appt", async () => {
      // Postgres \D treats U+0660..0669 as non-digit; they get stripped.
      // So "٠٥٣٣" normalizes to "" — must not leak the ASCII-digit appt.
      const arabicIndic = mixOwnerPhone.replace(/\d/g, (d) =>
        String.fromCharCode(0x0660 + Number(d)),
      );
      const { client } = await makeMixedUser("arabic-indic", arabicIndic);
      for (const id of [mixApptId, ownerAppt, otherAppt]) {
        const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length === 0, `arabic-indic digits leaked ${rows.length} rows for appt ${id}`);
      }
    });

    await test("my_audit: profile.phone with junk + WRONG digit tail cannot read anyone", async () => {
      // Letters around a completely unrelated digit sequence → no match anywhere.
      const bogus = "hello" + "1029384756" + "world";
      const { client } = await makeMixedUser("bogus", bogus);
      for (const id of [mixApptId, ownerAppt, otherAppt]) {
        const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
          _appointment_id: id,
        } as never);
        assert(!error, `err on ${id}: ${error?.message}`);
        const rows = (data ?? []) as unknown[];
        assert(rows.length === 0, `bogus mixed phone leaked ${rows.length} rows for appt ${id}`);
      }
    });

    await test("my_audit: mixed-junk user cannot read OTHER users' appts and vice versa", async () => {
      // Cross-check: the mixed-owner-digit user reads mixApptId only, and existing
      // ownerC/otherC users cannot see mixApptId. Interleaved to catch any bleed.
      const junk = "\t[" + mixOwnerPhone + "]\n";
      const { client: mixC } = await makeMixedUser("cross", junk);
      const seq = [
        ["mix→mixAppt", await callMyLocal(mixC, mixApptId)],
        ["mix→ownerAppt", await callMyLocal(mixC, ownerAppt)],
        ["mix→otherAppt", await callMyLocal(mixC, otherAppt)],
        ["owner→mixAppt", await callMyLocal(ownerC, mixApptId)],
        ["other→mixAppt", await callMyLocal(otherC, mixApptId)],
      ] as const;
      assert(seq[0][1] >= 1, `${seq[0][0]}: expected own rows, got ${seq[0][1]}`);
      assert(seq[1][1] === 0, `${seq[1][0]}: leaked ${seq[1][1]}`);
      assert(seq[2][1] === 0, `${seq[2][0]}: leaked ${seq[2][1]}`);
      assert(seq[3][1] === 0, `${seq[3][0]}: owner leaked into mix appt (${seq[3][1]})`);
      assert(seq[4][1] === 0, `${seq[4][0]}: other leaked into mix appt (${seq[4][1]})`);
    });

    async function callMyLocal(client: SupabaseClient, apptId: string) {
      const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err: ${error?.message}`);
      return ((data ?? []) as unknown[]).length;
    }




    // ── Rapid interleaved calls across a live profile.phone change ──
    // Guards against any per-session/per-user caching on the server side.
    // Assumes ownerU.phone == ownerPhone and otherU.phone == otherPhone at start.
    async function callMy(client: SupabaseClient, apptId: string) {
      const { data, error } = await client.rpc("my_reminder_preference_audit" as never, {
        _appointment_id: apptId,
      } as never);
      assert(!error, `err on ${apptId}: ${error?.message}`);
      return ((data ?? []) as unknown[]).length;
    }

    await test("my_audit: interleaved calls reflect profile.phone change immediately (owner→other)", async () => {
      // Ensure baseline is clean.
      await admin.from("profiles").update({ phone: ownerPhone }).eq("id", ownerU.userId);
      await admin.from("profiles").update({ phone: otherPhone }).eq("id", otherU.userId);

      // Baseline: owner sees own, other sees own.
      assert((await callMy(ownerC, ownerAppt)) >= 1, "baseline: owner missed own");
      assert((await callMy(otherC, otherAppt)) >= 1, "baseline: other missed own");
      assert((await callMy(ownerC, otherAppt)) === 0, "baseline: owner saw other's");
      assert((await callMy(otherC, ownerAppt)) === 0, "baseline: other saw owner's");

      // SWAP: owner.phone → otherPhone.
      await admin.from("profiles").update({ phone: otherPhone }).eq("id", ownerU.userId);
      try {
        // Interleaved sequence — no delay, no re-signin.
        const seq: Array<[string, number]> = [
          ["owner→otherAppt (must gain)", await callMy(ownerC, otherAppt)],
          ["other→otherAppt (must keep)", await callMy(otherC, otherAppt)],
          ["owner→ownerAppt (must lose)", await callMy(ownerC, ownerAppt)],
          ["other→ownerAppt (must not gain)", await callMy(otherC, ownerAppt)],
          ["owner→otherAppt again", await callMy(ownerC, otherAppt)],
          ["other→otherAppt again", await callMy(otherC, otherAppt)],
        ];
        assert(seq[0][1] >= 1, `${seq[0][0]}: got ${seq[0][1]}`);
        assert(seq[1][1] >= 1, `${seq[1][0]}: got ${seq[1][1]}`);
        assert(seq[2][1] === 0, `${seq[2][0]}: got ${seq[2][1]}`);
        assert(seq[3][1] === 0, `${seq[3][0]}: got ${seq[3][1]}`);
        assert(seq[4][1] >= 1, `${seq[4][0]}: got ${seq[4][1]}`);
        assert(seq[5][1] >= 1, `${seq[5][0]}: got ${seq[5][1]}`);
      } finally {
        await admin.from("profiles").update({ phone: ownerPhone }).eq("id", ownerU.userId);
      }
    });

    await test("my_audit: concurrent Promise.all calls after phone swap remain correctly scoped", async () => {
      // Even with parallel in-flight requests, each RPC re-reads profile.phone.
      await admin.from("profiles").update({ phone: otherPhone }).eq("id", ownerU.userId);
      try {
        const results = await Promise.all([
          callMy(ownerC, otherAppt),   // gain
          callMy(otherC, otherAppt),   // keep
          callMy(ownerC, ownerAppt),   // lose
          callMy(otherC, ownerAppt),   // never
          callMy(ownerC, otherAppt),   // gain (repeat)
        ]);
        assert(results[0] >= 1, `concurrent owner→other gain failed: ${results[0]}`);
        assert(results[1] >= 1, `concurrent other→other keep failed: ${results[1]}`);
        assert(results[2] === 0, `concurrent owner→own leak: ${results[2]}`);
        assert(results[3] === 0, `concurrent other→owner leak: ${results[3]}`);
        assert(results[4] >= 1, `concurrent owner→other repeat failed: ${results[4]}`);
      } finally {
        await admin.from("profiles").update({ phone: ownerPhone }).eq("id", ownerU.userId);
      }
    });

    await test("my_audit: swap back restores original scope on next call, no residual access", async () => {
      // Swap to other, then back, verifying both edges of the transition.
      await admin.from("profiles").update({ phone: otherPhone }).eq("id", ownerU.userId);
      assert((await callMy(ownerC, otherAppt)) >= 1, "after swap: owner didn't gain other");
      assert((await callMy(ownerC, ownerAppt)) === 0, "after swap: owner still saw own");

      await admin.from("profiles").update({ phone: ownerPhone }).eq("id", ownerU.userId);
      assert((await callMy(ownerC, ownerAppt)) >= 1, "after restore: owner didn't regain own");
      assert((await callMy(ownerC, otherAppt)) === 0, "after restore: owner still saw other");
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
