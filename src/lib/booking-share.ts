import { SITE } from "@/lib/site";

export type ShareBooking = {
  ref: string;
  patient_name: string;
  patient_phone?: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:mm[:ss]
  doctor?: string | null;
  specialty?: string | null;
  reminder_24h?: boolean | null;
  reminder_2h?: boolean | null;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Build an ICS file body for the given appointment (30-minute default). */
export function buildIcs(b: ShareBooking, minutes = 30): string {
  const [y, mo, d] = b.appointment_date.split("-").map(Number);
  const [h, mi] = b.appointment_time.split(":").map(Number);
  // Treat time as local Asia/Riyadh (UTC+3) → convert to UTC.
  const startUTC = new Date(Date.UTC(y, mo - 1, d, h - 3, mi));
  const endUTC = new Date(startUTC.getTime() + minutes * 60000);
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
  const summary = `${SITE.nameAr} — موعد${b.doctor ? " مع " + b.doctor : ""}`;
  const desc = [
    `المريض: ${b.patient_name}`,
    b.specialty ? `التخصص: ${b.specialty}` : "",
    b.doctor ? `الطبيب: ${b.doctor}` : "",
    `رقم الحجز: ${b.ref}`,
    `هاتف المجمع: ${SITE.phoneDisplay}`,
  ]
    .filter(Boolean)
    .join("\\n");
  const alarms: string[] = [];
  const pushAlarm = (trigger: string, desc: string) => {
    alarms.push(
      "BEGIN:VALARM",
      `TRIGGER:${trigger}`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${desc}`,
      "END:VALARM",
    );
  };
  // Default to true when the field isn't provided (matches booking defaults).
  if (b.reminder_24h !== false) pushAlarm("-PT24H", `تذكير قبل 24 ساعة — ${summary}`);
  if (b.reminder_2h !== false) pushAlarm("-PT2H", `تذكير قبل ساعتين — ${summary}`);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BaeshenMedical//Booking//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.ref}@baeshenmedical.sa`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(startUTC)}`,
    `DTEND:${fmt(endUTC)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${SITE.addressAr}`,
    ...alarms,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(b: ShareBooking) {
  const blob = new Blob([buildIcs(b)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `booking-${b.ref}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build a Google Calendar "add event" URL for the given appointment. */
export function googleCalendarUrl(b: ShareBooking, minutes = 30): string {
  const [y, mo, d] = b.appointment_date.split("-").map(Number);
  const [h, mi] = b.appointment_time.split(":").map(Number);
  // Local Asia/Riyadh (UTC+3) → UTC.
  const startUTC = new Date(Date.UTC(y, mo - 1, d, h - 3, mi));
  const endUTC = new Date(startUTC.getTime() + minutes * 60000);
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
  const summary = `${SITE.nameAr} — موعد${b.doctor ? " مع " + b.doctor : ""}`;
  const details = [
    `المريض: ${b.patient_name}`,
    b.specialty ? `التخصص: ${b.specialty}` : "",
    b.doctor ? `الطبيب: ${b.doctor}` : "",
    `رقم الحجز: ${b.ref}`,
    `هاتف المجمع: ${SITE.phoneDisplay}`,
  ]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: summary,
    dates: `${fmt(startUTC)}/${fmt(endUTC)}`,
    details,
    location: SITE.addressAr,
    ctz: "Asia/Riyadh",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build a wa.me deep-link that opens WhatsApp with a bilingual (AR + EN)
 * booking-confirmation message pre-filled.
 *
 * Options:
 *  - `to`: E.164 digits only. Defaults to the clinic's WhatsApp number so the
 *    patient can tap once to send the confirmation to the clinic. Pass a
 *    patient number to let clinic staff open a chat with that patient.
 *  - `share`: when true, uses `https://wa.me/?text=` so WhatsApp asks the
 *    user to pick any contact (generic share sheet).
 */
export function whatsappShareUrl(
  b: ShareBooking,
  opts: { to?: string; share?: boolean } = {},
): string {
  const ar = [
    `✅ تأكيد حجز موعد — ${SITE.nameAr}`,
    ``,
    `👤 الاسم: ${b.patient_name}`,
    b.specialty ? `🩺 التخصص: ${b.specialty}` : "",
    b.doctor ? `👨‍⚕️ الطبيب: ${b.doctor}` : "",
    `📅 التاريخ: ${b.appointment_date}`,
    `⏰ الوقت: ${b.appointment_time}`,
    `🔖 رقم الحجز: ${b.ref}`,
    ``,
    `📞 للاستفسار: ${SITE.phoneDisplay}`,
  ].filter(Boolean);

  const en = [
    `— — — — — — — —`,
    `✅ Appointment Confirmation — ${SITE.nameEn ?? SITE.nameAr}`,
    ``,
    `Name: ${b.patient_name}`,
    b.specialty ? `Specialty: ${b.specialty}` : "",
    b.doctor ? `Doctor: ${b.doctor}` : "",
    `Date: ${b.appointment_date}`,
    `Time: ${b.appointment_time}`,
    `Reference: ${b.ref}`,
    ``,
    `Contact: ${SITE.phoneDisplay}`,
  ].filter(Boolean);

  const text = encodeURIComponent([...ar, ...en].join("\n"));
  const to = opts.share ? "" : (opts.to ?? SITE.whatsapp).replace(/\D/g, "");
  return `https://wa.me/${to}?text=${text}`;
}
