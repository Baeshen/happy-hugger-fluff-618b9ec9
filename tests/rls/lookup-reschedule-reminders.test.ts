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

    // ── Boundary-time tests ─────────────────────────────────────────────
    // The DB enforces `(_new_date + _new_time) > now()` (see
    // reschedule_appointment_by_ref). Date/time are timestamp-without-tz and
    // compared to now() in the DB session TZ (Supabase default = UTC), so we
    // build target date/time from UTC components.
    const toParts = (ms: number) => {
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
        time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      };
    };

    await test(
      "boundary: reschedule to 1 minute in the past → rejected, reminders untouched",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: false,
        });
        const before = await readAppt(id);
        const p = toParts(Date.now() - 60_000);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: p.date,
            _new_time: p.time,
            _reason: "r",
          } as never,
        );
        // DB raises: "الموعد الجديد يجب أن يكون في المستقبل"
        assert(
          error != null || data === false,
          `expected error or false, got data=${JSON.stringify(data)} err=${error?.message}`,
        );
        const row = await readAppt(id);
        assert(
          row.appointment_date === before.appointment_date &&
            String(row.appointment_time) === String(before.appointment_time),
          "appointment must not change when target is in the past",
        );
        assert(
          row.reminder_24h === true && row.reminder_2h === false,
          "reminders must not change when reschedule is rejected",
        );
      },
    );

    await test(
      "boundary: reschedule to exactly +2 hours preserves both reminders",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        // Add a small buffer past exactly-2h so we clear the strict '>' check
        // deterministically across clock skew (~30 s).
        const p = toParts(Date.now() + 2 * 3_600_000 + 30_000);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: p.date,
            _new_time: p.time,
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: true,
        } as never);
        const row = await readAppt(id);
        assert(
          row.appointment_date === p.date,
          `date mismatch: ${row.appointment_date} vs ${p.date}`,
        );
        assert(row.reminder_24h === true, "reminder_24h must remain true");
        assert(row.reminder_2h === true, "reminder_2h must remain true");
      },
    );

    await test(
      "boundary: reschedule to exactly +24 hours preserves both reminders",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        const p = toParts(Date.now() + 24 * 3_600_000 + 30_000);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: p.date,
            _new_time: p.time,
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: true,
        } as never);
        const row = await readAppt(id);
        assert(
          row.appointment_date === p.date,
          `date mismatch: ${row.appointment_date} vs ${p.date}`,
        );
        assert(row.reminder_24h === true, "reminder_24h must remain true");
        assert(row.reminder_2h === true, "reminder_2h must remain true");
      },
    );

    await test(
      "boundary: reschedule to less than +2 hours still accepts reminder choices as-is (no time-window enforcement)",
      async () => {
        const { id, ref } = await newAppt();
        // 30 minutes ahead — inside both reminder windows.
        const p = toParts(Date.now() + 30 * 60_000);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: p.date,
            _new_time: p.time,
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        // User keeps both toggles ON even though the appointment is only 30 min
        // away — the RPC must persist the raw booleans without silently
        // clearing "impossible" reminders.
        const { error: rerr } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _reminder_24h: true,
            _reminder_2h: true,
          } as never,
        );
        assert(!rerr, `rpc error: ${rerr?.message}`);
        const row = await readAppt(id);
        assert(row.reminder_24h === true, "reminder_24h must be persisted true");
        assert(row.reminder_2h === true, "reminder_2h must be persisted true");
      },
    );

    await test(
      "boundary: reschedule +5 seconds into the future is accepted and reminders can be updated",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: false,
          reminder_2h: false,
        });
        const p = toParts(Date.now() + 5_000);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: p.date,
            _new_time: p.time,
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: false,
        } as never);
        const row = await readAppt(id);
        assert(row.reminder_24h === true, "reminder_24h must flip to true");
        assert(row.reminder_2h === false, "reminder_2h must stay false");
      },
    );

    // ── Multi-step reschedule sequence ──────────────────────────────────
    // Simulate a user rescheduling several times in a row via /lookup and
    // adjusting reminder toggles each time. After every step, the row must
    // reflect the LAST choice — no leaking from prior steps, no reset to
    // the DB default.
    await test(
      "reminder preferences remain correct across 4 consecutive reschedules",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });

        const steps: Array<{
          offsetDays: number;
          hour: string;
          r24: boolean;
          r2: boolean;
        }> = [
          { offsetDays: 3, hour: "09:00:00", r24: true, r2: false }, // turn 2h off
          { offsetDays: 5, hour: "10:00:00", r24: false, r2: false }, // turn all off
          { offsetDays: 7, hour: "11:00:00", r24: false, r2: true }, // enable only 2h
          { offsetDays: 9, hour: "12:00:00", r24: true, r2: true }, // re-enable both
        ];

        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const newDate = futureDate(s.offsetDays);
          const { data: rData, error: rErr } = await anon.rpc(
            "reschedule_appointment_by_ref" as never,
            {
              _ref: ref,
              _phone: phone,
              _new_date: newDate,
              _new_time: s.hour,
              _reason: `r${i + 1}`,
            } as never,
          );
          assert(!rErr, `step ${i + 1} reschedule err: ${rErr?.message}`);
          assert(rData === true, `step ${i + 1} reschedule returned ${rData}`);

          const { data: uData, error: uErr } = await anon.rpc(
            "update_reminders_by_ref" as never,
            {
              _ref: ref,
              _phone: phone,
              _reminder_24h: s.r24,
              _reminder_2h: s.r2,
            } as never,
          );
          assert(!uErr, `step ${i + 1} reminders err: ${uErr?.message}`);
          assert(uData === true, `step ${i + 1} reminders returned ${uData}`);

          const row = await readAppt(id);
          assert(
            row.appointment_date === newDate,
            `step ${i + 1}: date mismatch ${row.appointment_date} vs ${newDate}`,
          );
          assert(
            String(row.appointment_time).startsWith(s.hour.slice(0, 5)),
            `step ${i + 1}: time mismatch ${row.appointment_time} vs ${s.hour}`,
          );
          assert(
            row.reminder_24h === s.r24,
            `step ${i + 1}: reminder_24h expected ${s.r24}, got ${row.reminder_24h}`,
          );
          assert(
            row.reminder_2h === s.r2,
            `step ${i + 1}: reminder_2h expected ${s.r2}, got ${row.reminder_2h}`,
          );
          // Reschedule must reset status to 'new' every time — never stuck.
          assert(
            row.status === "new",
            `step ${i + 1}: status expected new, got ${row.status}`,
          );
        }
      },
    );

    await test(
      "reschedule without calling update_reminders preserves the previous preferences",
      async () => {
        // User first reschedules and explicitly sets reminders to (false, true).
        // On a second reschedule they change only the date/time and skip the
        // reminder RPC entirely — the previous booleans must persist.
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });

        await anon.rpc("reschedule_appointment_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _new_date: futureDate(2),
          _new_time: "08:00:00",
          _reason: "r1",
        } as never);
        await anon.rpc("update_reminders_by_ref" as never, {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: true,
        } as never);

        // Second reschedule — no reminder update.
        const newDate = futureDate(6);
        const { error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: newDate,
            _new_time: "16:00:00",
            _reason: "r2",
          } as never,
        );
        assert(!error, `rpc err: ${error?.message}`);

        const row = await readAppt(id);
        assert(row.appointment_date === newDate, "second date not applied");
        assert(
          row.reminder_24h === false && row.reminder_2h === true,
          `reminders leaked: 24h=${row.reminder_24h}, 2h=${row.reminder_2h}`,
        );
      },
    );

    await test(
      "lookup returns the latest reminder preferences after consecutive reschedules",
      async () => {
        const { ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });

        const steps: Array<{
          offsetDays: number;
          time: string;
          reminder24h: boolean;
          reminder2h: boolean;
        }> = [
          { offsetDays: 10, time: "09:30:00", reminder24h: false, reminder2h: true },
          { offsetDays: 11, time: "10:30:00", reminder24h: false, reminder2h: false },
          { offsetDays: 12, time: "11:30:00", reminder24h: true, reminder2h: false },
          { offsetDays: 13, time: "12:30:00", reminder24h: true, reminder2h: true },
        ];

        for (const [index, step] of steps.entries()) {
          const nextDate = futureDate(step.offsetDays);
          const { data: rescheduleData, error: rescheduleError } = await anon.rpc(
            "reschedule_appointment_by_ref" as never,
            {
              _ref: ref,
              _phone: phone,
              _new_date: nextDate,
              _new_time: step.time,
              _reason: `lookup-chain-${index + 1}`,
            } as never,
          );
          assert(
            !rescheduleError,
            `step ${index + 1} reschedule err: ${rescheduleError?.message}`,
          );
          assert(
            rescheduleData === true,
            `step ${index + 1} reschedule returned ${rescheduleData}`,
          );

          const { data: remindersData, error: remindersError } = await anon.rpc(
            "update_reminders_by_ref" as never,
            {
              _ref: ref,
              _phone: phone,
              _reminder_24h: step.reminder24h,
              _reminder_2h: step.reminder2h,
            } as never,
          );
          assert(
            !remindersError,
            `step ${index + 1} reminders err: ${remindersError?.message}`,
          );
          assert(
            remindersData === true,
            `step ${index + 1} reminders returned ${remindersData}`,
          );

          const { data: lookupData, error: lookupError } = await anon.rpc(
            "lookup_appointment" as never,
            {
              _ref: ref,
              _phone: phone,
            } as never,
          );
          assert(!lookupError, `step ${index + 1} lookup err: ${lookupError?.message}`);

          const lookupRows = lookupData as Array<{
            appointment_date: string;
            appointment_time: string;
            reminder_24h: boolean;
            reminder_2h: boolean;
          }>;
          assert(
            Array.isArray(lookupRows) && lookupRows.length === 1,
            `step ${index + 1} lookup expected one row`,
          );
          const appointment = lookupRows[0];
          assert(
            appointment.appointment_date === nextDate,
            `step ${index + 1} lookup date mismatch`,
          );
          assert(
            String(appointment.appointment_time).startsWith(step.time.slice(0, 5)),
            `step ${index + 1} lookup time mismatch`,
          );
          assert(
            appointment.reminder_24h === step.reminder24h,
            `step ${index + 1} lookup reminder_24h expected ${step.reminder24h}, got ${appointment.reminder_24h}`,
          );
          assert(
            appointment.reminder_2h === step.reminder2h,
            `step ${index + 1} lookup reminder_2h expected ${step.reminder2h}, got ${appointment.reminder_2h}`,
          );
        }
      },
    );

    await test(
      "reschedule with wrong phone returns false and does not mutate",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "0599999999",
            _new_date: futureDate(7),
            _new_time: "08:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date &&
            String(after.appointment_time) === String(before.appointment_time),
          "appointment should not have been rescheduled with wrong phone",
        );
      },
    );

    await test("reschedule with unknown ref returns false", async () => {
      const { data, error } = await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: "deadbeef",
          _phone: phone,
          _new_date: futureDate(7),
          _new_time: "08:00:00",
          _reason: "r",
        } as never,
      );
      assert(!error, `rpc error: ${error?.message}`);
      assert(data === false, `expected false, got ${JSON.stringify(data)}`);
    });

    await test(
      "reschedule to a past date/time is rejected and does not mutate",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _new_date: futureDate(-3),
            _new_time: "09:00:00",
            _reason: "r",
          } as never,
        );
        assert(
          error != null || data === false,
          `expected error or false, got data=${JSON.stringify(data)}`,
        );
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "appointment must not move to a past date",
        );
      },
    );

    await test(
      "update_reminders with wrong phone returns false and does not mutate",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: false,
        });
        const { data, error } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: "0599999999",
            _reminder_24h: false,
            _reminder_2h: true,
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.reminder_24h === true, "reminder_24h should be unchanged");
        assert(row.reminder_2h === false, "reminder_2h should be unchanged");
      },
    );

    await test("update_reminders with unknown ref returns false", async () => {
      const { data, error } = await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: "deadbeef",
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: false,
        } as never,
      );
      assert(!error, `rpc error: ${error?.message}`);
      assert(data === false, `expected false, got ${JSON.stringify(data)}`);
    });

    await test(
      "update_reminders with null values keeps existing preferences (COALESCE)",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: false,
        });
        const { data, error } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _reminder_24h: null,
            _reminder_2h: null,
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(
          row.reminder_24h === true,
          `reminder_24h should stay true, got ${row.reminder_24h}`,
        );
        assert(
          row.reminder_2h === false,
          `reminder_2h should stay false, got ${row.reminder_2h}`,
        );
      },
    );

    await test(
      "phone matched digits-only — formatted phone with same digits works",
      async () => {
        const { id, ref } = await newAppt();
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "050-000-0000",
            _new_date: futureDate(8),
            _new_time: "15:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.appointment_date === futureDate(8), "date should update");
      },
    );

    await test("reschedule with empty phone returns false", async () => {
      const { id, ref } = await newAppt();
      const before = await readAppt(id);
      const { data, error } = await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: "",
          _new_date: futureDate(9),
          _new_time: "16:00:00",
          _reason: "r",
        } as never,
      );
      assert(!error, `rpc error: ${error?.message}`);
      assert(data === false, `expected false, got ${JSON.stringify(data)}`);
      const after = await readAppt(id);
      assert(
        after.appointment_date === before.appointment_date,
        "must not reschedule with empty phone",
      );
    });

    // ── Boundary tests: phone formats & reminder value edges ──

    await test(
      "phone with spaces and parentheses (same digits) matches",
      async () => {
        const { id, ref } = await newAppt();
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "(050) 000 0000",
            _new_date: futureDate(10),
            _new_time: "09:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.appointment_date === futureDate(10), "date should update");
      },
    );

    await test(
      "phone with country-code prefix +966 50 000 0000 (different digits) does NOT match",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "+966 50 000 0000",
            _new_date: futureDate(10),
            _new_time: "09:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "must not reschedule when digits differ",
        );
      },
    );

    await test(
      "phone containing only non-digit characters returns false",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "abc-def-ghij",
            _new_date: futureDate(11),
            _new_time: "10:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "must not reschedule with non-digit phone",
        );
      },
    );

    await test(
      "phone with letters mixed into digits doesn't accidentally match",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "050abc000xy00001extra", // digits → 050000000001 (12) ≠ 0500000000 (10)
            _new_date: futureDate(11),
            _new_time: "10:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "digit-count mismatch must not match",
        );
      },
    );

    await test(
      "very long phone (500 chars of digits) does not match and does not crash",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const longPhone = "9".repeat(500);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: longPhone,
            _new_date: futureDate(12),
            _new_time: "11:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "over-long phone must not match",
        );
      },
    );

    await test(
      "phone with Arabic-Indic digits (٠٥٠٠٠٠٠٠٠٠) does NOT match ASCII-stored phone",
      async () => {
        const { id, ref } = await newAppt();
        const before = await readAppt(id);
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "٠٥٠٠٠٠٠٠٠٠",
            _new_date: futureDate(12),
            _new_time: "11:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === false, `expected false, got ${JSON.stringify(data)}`);
        const after = await readAppt(id);
        assert(
          after.appointment_date === before.appointment_date,
          "Arabic-Indic digits are stripped by \\D and must not match ASCII digits",
        );
      },
    );

    await test(
      "phone with newlines / tabs (same digits) still matches",
      async () => {
        const { id, ref } = await newAppt();
        const { data, error } = await anon.rpc(
          "reschedule_appointment_by_ref" as never,
          {
            _ref: ref,
            _phone: "050\n000\t0000",
            _new_date: futureDate(13),
            _new_time: "12:00:00",
            _reason: "r",
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.appointment_date === futureDate(13), "date should update");
      },
    );

    await test(
      "update_reminders_by_ref: only one flag null keeps that flag, changes the other",
      async () => {
        const { id, ref } = await newAppt({
          reminder_24h: true,
          reminder_2h: true,
        });
        const { data, error } = await anon.rpc(
          "update_reminders_by_ref" as never,
          {
            _ref: ref,
            _phone: phone,
            _reminder_24h: false,
            _reminder_2h: null,
          } as never,
        );
        assert(!error, `rpc error: ${error?.message}`);
        assert(data === true, `expected true, got ${JSON.stringify(data)}`);
        const row = await readAppt(id);
        assert(row.reminder_24h === false, "24h should flip to false");
        assert(row.reminder_2h === true, "2h should stay true (null → COALESCE)");
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
