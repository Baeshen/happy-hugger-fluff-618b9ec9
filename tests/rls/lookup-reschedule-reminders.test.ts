/**
 * Integration tests for the /lookup reschedule + reminder flow.
 *
 * Verifies that reminder preferences are correctly applied when a booking
 * is rescheduled through the anonymous ref+phone lookup path, mirroring the
 * exact RPC sequence used by src/routes/lookup.tsx:
 *
 *   1) reschedule_appointment_by_ref(_ref, _phone, _new_date, _new_time, _reason)
 *   2) update_reminders_by_ref(_ref, _phone, _reminder_24h, _reminder_2h)
 *
 * Run:  bun tests/rls/lookup-reschedule-reminders.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
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

  const admin: SupabaseClient = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });
  // Anonymous client — matches how /lookup calls the RPCs (no session).
  const anon: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false },
  });

  const created: string[] = [];
  const phone = "0500000000";

  async function newAppt(opts: {
    reminder_24h?: boolean;
    reminder_2h?: boolean;
  } = {}): Promise<{ id: string; ref: string }> {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "RR-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 86_400_000)
          .toISOString()
          .slice(0, 10),
        appointment_time: "10:00",
        status: "new",
        reminder_24h: opts.reminder_24h ?? true,
        reminder_2h: opts.reminder_2h ?? true,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;
    created.push(id);
    // Ref = first 8 chars of the UUID with dashes removed (matches lookup_appointment).
    const ref = id.replace(/-/g, "").slice(0, 8);
    return { id, ref };
  }

  async function readAppt(id: string) {
    const { data, error } = await admin
      .from("appointments")
      .select(
        "appointment_date, appointment_time, status, reminder_24h, reminder_2h",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  const futureDate = (daysAhead: number) =>
    new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

  console.log("\n── /lookup reschedule + reminder preferences ──");

  try {
    await test(
      "reschedule succeeds and new date/time is persisted",
      async () => {
        const { id, ref } = await newAppt();
        const newDate = futureDate(3);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: newDate,
            _new_time: "14:30:00",
            _reason: "إعادة جدولة من المراجع",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.appointment_date === newDate, "date not updated");
        assert(
          String(row.appointment_time).startsWith("14:30"),
          `time not updated: ${row.appointment_time}`,
        );
        assert(row.status === "new", `status expected new, got ${row.status}`);
      },
    );

    await test(
      "both reminders enabled → carried through unchanged",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        await anon.rpc("reschedule_appointment_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _new_date: futureDate(4),
          _new_time: "09:00:00",
          _reason: "r",
        } as never);
        const { error } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _reminder_24h: true,
            _reminder_2h: true,
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        const row = await readAppt(id);
        assert(row.reminder_24h === true, "reminder_24h expected true");
        assert(row.reminder_2h === true, "reminder_2h expected true");
      },
    );

    await test(
      "user disables both reminders → both are turned off",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        await anon.rpc("reschedule_appointment_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _new_date: futureDate(5),
          _new_time: "11:00:00",
          _reason: "r",
        } as never);
        const { data, error } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _reminder_24h: false,
            _reminder_2h: false,
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.reminder_24h === false, "reminder_24h expected false");
        assert(row.reminder_2h === false, "reminder_2h expected false");
      },
    );

    await test(
      "mixed selection → 24h off, 2h on is persisted exactly",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        await anon.rpc("reschedule_appointment_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _new_date: futureDate(6),
          _new_time: "12:00:00",
          _reason: "r",
        } as never);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: true,
        } as never);
        const row = await readAppt(id);
        assert(row.reminder_24h === false, "reminder_24h expected false");
        assert(row.reminder_2h === true, "reminder_2h expected true");
      },
    );

    await test(
      "reminders that were previously OFF can be turned back ON via reschedule",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: false,
          reminder_2h: false,
        });
        await anon.rpc("reschedule_appointment_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _new_date: futureDate(7),
          _new_time: "13:00:00",
          _reason: "r",
        } as never);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: true,
        } as never);
        const row = await readAppt(id);
        assert(row.reminder_24h === true, "reminder_24h expected true");
        assert(row.reminder_2h === true, "reminder_2h expected true");
      },
    );

    await test(
      "wrong phone → reschedule returns false and no changes",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "0599999999",
            _new_date: futureDate(8),
            _new_time: "15:00:00",
            _reason: "r",
          } as never,
        );
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date &&
            String(after.appointment_time) === String(before.appointment_time),
          "appointment must not change on wrong phone",
        );
      },
    );

    await test(
      "wrong phone → update_reminders_by_ref returns false and no changes",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        const { data } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: "0599999999",
            _reminder_24h: false,
            _reminder_2h: false,
          } as never,
        );
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(
          row.reminder_24h === true && row.reminder_2h === true,
          "reminders must not change on wrong phone",
        );
      },
    );
  } finally {
    if (created.length) {
      await admin.from("appointments").delete().in("id", created);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
