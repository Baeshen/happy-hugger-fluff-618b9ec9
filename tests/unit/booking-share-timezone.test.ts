/**
 * Unit tests: reminder alarms (reminder_24h / reminder_2h) and event times
 * built by src/lib/booking-share.ts must be timezone-safe and DST-safe.
 *
 * Riyadh is fixed UTC+3 with no DST, so the conversion is deterministic —
 * these tests pin that behavior and also verify the alarms use *duration*
 * triggers (`-PT24H` / `-PT2H`) so they stay correct across DST-observing
 * viewers' calendars.
 *
 * Run:  bun tests/unit/booking-share-timezone.test.ts
 */
import { buildIcs, googleCalendarUrl, type ShareBooking } from "../../src/lib/booking-share";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
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

const base = (over: Partial<ShareBooking> = {}): ShareBooking => ({
  ref: "abcd1234",
  patient_name: "TZ-Test",
  appointment_date: "2026-07-15",
  appointment_time: "10:00",
  ...over,
});

console.log("\n── booking-share: reminder alarms across TZ / DST ──");

// ── DTSTART is Asia/Riyadh (UTC+3) → UTC, regardless of host TZ ──
test("10:00 Riyadh → 07:00 UTC (DTSTART in Z form)", () => {
  const ics = buildIcs(base({ appointment_date: "2026-07-15", appointment_time: "10:00" }));
  assert(ics.includes("DTSTART:20260715T070000Z"), `DTSTART wrong:\n${ics}`);
  assert(ics.includes("DTEND:20260715T073000Z"), `DTEND wrong (30min default)`);
});

test("summer (July) and winter (January) both convert with fixed +3 offset (no DST)", () => {
  const summer = buildIcs(base({ appointment_date: "2026-07-15", appointment_time: "14:00" }));
  const winter = buildIcs(base({ appointment_date: "2026-01-15", appointment_time: "14:00" }));
  assert(summer.includes("DTSTART:20260715T110000Z"), "summer DTSTART wrong");
  assert(winter.includes("DTSTART:20260115T110000Z"), "winter DTSTART wrong");
});

test("EU DST spring-forward day (2026-03-29) still uses +3 offset — Riyadh has no DST", () => {
  const ics = buildIcs(base({ appointment_date: "2026-03-29", appointment_time: "09:30" }));
  assert(ics.includes("DTSTART:20260329T063000Z"), `DST-day DTSTART wrong:\n${ics}`);
});

test("EU DST fall-back day (2026-10-25) still uses +3 offset", () => {
  const ics = buildIcs(base({ appointment_date: "2026-10-25", appointment_time: "09:30" }));
  assert(ics.includes("DTSTART:20261025T063000Z"), `fall-back DTSTART wrong`);
});

test("US DST spring-forward (2026-03-08, 02:00 local edge) still uses +3 offset", () => {
  const ics = buildIcs(base({ appointment_date: "2026-03-08", appointment_time: "02:30" }));
  // 02:30 Riyadh → 23:30 previous day UTC
  assert(ics.includes("DTSTART:20260307T233000Z"), `US-DST DTSTART wrong:\n${ics}`);
});

test("midnight Riyadh crosses to previous day in UTC", () => {
  const ics = buildIcs(base({ appointment_date: "2026-03-01", appointment_time: "00:30" }));
  assert(ics.includes("DTSTART:20260228T213000Z"), `midnight cross-day wrong:\n${ics}`);
});

test("year boundary: 2026-01-01 01:00 Riyadh → 2025-12-31 22:00 UTC", () => {
  const ics = buildIcs(base({ appointment_date: "2026-01-01", appointment_time: "01:00" }));
  assert(ics.includes("DTSTART:20251231T220000Z"), `year boundary wrong:\n${ics}`);
});

// ── VALARM triggers are duration-relative → DST-safe on the viewer side ──
test("reminder_24h alarm uses duration trigger -PT24H (DST-safe)", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: false }));
  assert(/BEGIN:VALARM[\s\S]*?TRIGGER:-PT24H[\s\S]*?END:VALARM/.test(ics),
    `24h VALARM missing or wrong trigger`);
  assert(!ics.includes("TRIGGER:-PT2H"), "2h VALARM must be omitted when false");
});

test("reminder_2h alarm uses duration trigger -PT2H (DST-safe)", () => {
  const ics = buildIcs(base({ reminder_24h: false, reminder_2h: true }));
  assert(/BEGIN:VALARM[\s\S]*?TRIGGER:-PT2H[\s\S]*?END:VALARM/.test(ics),
    `2h VALARM missing or wrong trigger`);
  assert(!ics.includes("TRIGGER:-PT24H"), "24h VALARM must be omitted when false");
});

test("both flags true → exactly two VALARM blocks (24h + 2h)", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
  const count = (ics.match(/BEGIN:VALARM/g) || []).length;
  assert(count === 2, `expected 2 VALARMs, got ${count}`);
  assert(ics.includes("TRIGGER:-PT24H") && ics.includes("TRIGGER:-PT2H"),
    "both triggers must be present");
});

test("both flags false → zero VALARM blocks", () => {
  const ics = buildIcs(base({ reminder_24h: false, reminder_2h: false }));
  assert(!ics.includes("BEGIN:VALARM"), "no VALARMs expected when both flags false");
});

test("undefined / null flags default to enabled (matches booking defaults)", () => {
  const und = buildIcs(base({}));
  const nul = buildIcs(base({ reminder_24h: null, reminder_2h: null }));
  for (const ics of [und, nul]) {
    assert(ics.includes("TRIGGER:-PT24H"), "24h VALARM expected by default");
    assert(ics.includes("TRIGGER:-PT2H"), "2h VALARM expected by default");
  }
});

// ── DST-safety: alarms fire N hours before start, so if the viewer's TZ
//    crosses DST between alarm and event, the *duration* form still fires
//    correctly. A fixed DATE-TIME trigger would drift by ±1h — assert we
//    never emit that shape.
test("VALARM triggers are never absolute DATE-TIME (would break across DST)", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
  const absoluteTrigger = /TRIGGER;VALUE=DATE-TIME:/;
  assert(!absoluteTrigger.test(ics),
    "absolute VALARM triggers are DST-unsafe — must use duration form");
});

// ── Independence from process TZ ──
test("output is identical regardless of process.env.TZ (fixed +3 conversion)", () => {
  const orig = process.env.TZ;
  const b = base({ appointment_date: "2026-07-15", appointment_time: "10:00" });
  const tzs = ["UTC", "America/New_York", "Europe/London", "Australia/Sydney", "Asia/Kolkata"];
  const outs = tzs.map((tz) => {
    process.env.TZ = tz;
    return buildIcs(b);
  });
  process.env.TZ = orig;
  const stripDtstamp = (s: string) => s.replace(/DTSTAMP:[^\r\n]+/g, "DTSTAMP:X");
  const first = stripDtstamp(outs[0]);
  for (let i = 1; i < outs.length; i++) {
    assert(stripDtstamp(outs[i]) === first,
      `TZ=${tzs[i]} produced different ICS than TZ=${tzs[0]}`);
  }
});

// ── Google Calendar URL: uses ctz=Asia/Riyadh + UTC dates ──
test("googleCalendarUrl pins ctz=Asia/Riyadh and encodes UTC dates", () => {
  const url = googleCalendarUrl(base({ appointment_date: "2026-07-15", appointment_time: "10:00" }));
  assert(url.includes("ctz=Asia%2FRiyadh"), `ctz missing: ${url}`);
  assert(url.includes("dates=20260715T070000Z%2F20260715T073000Z"),
    `dates param wrong: ${url}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
