/**
 * Generates a printable confirmation document and opens the browser's
 * print dialog so the user can save it as PDF (or print). This avoids
 * bundling a heavy PDF library and preserves proper Arabic shaping/RTL
 * via the browser's native text rendering.
 */

export type BookingConfirmationData = {
  reference: string;
  patient_name: string;
  patient_phone?: string;
  appointment_date: string;
  appointment_time: string;
  service?: string;
  centerName?: string;
  doctor_name?: string;
  specialty?: string;
  status?: string;
  note?: string;
};

function formatArabicDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function esc(v: string | undefined | null): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string | undefined | null, mono = false): string {
  if (!value) return "";
  return `
    <tr>
      <th>${esc(label)}</th>
      <td${mono ? ' class="mono" dir="ltr"' : ""}>${esc(value)}</td>
    </tr>`;
}

export function downloadBookingConfirmationPdf(data: BookingConfirmationData): void {
  const generatedAt = new Date().toLocaleString("ar-SA", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تأكيد الحجز ${esc(data.reference)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; }
  body {
    font-family: "Tajawal", "Segoe UI", "Noto Sans Arabic", "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; line-height: 1.6;
  }
  .sheet { padding: 24px; max-width: 780px; margin: 0 auto; }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid #0ea5a4; padding-bottom: 16px; margin-bottom: 24px;
  }
  .brand { font-size: 22px; font-weight: 800; color: #0f766e; }
  .brand small { display: block; font-size: 12px; font-weight: 500; color: #64748b; margin-top: 4px; }
  .badge {
    padding: 6px 14px; border-radius: 999px; background: #ecfeff;
    color: #0e7490; font-weight: 700; font-size: 12px; border: 1px solid #a5f3fc;
  }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .ref-box {
    border: 2px dashed #0ea5a4; border-radius: 12px; padding: 16px 20px;
    background: #f0fdfa; margin: 20px 0 28px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .ref-box .lbl { font-size: 12px; color: #64748b; }
  .ref-box .num {
    font-family: "Courier New", monospace; font-size: 24px; font-weight: 800;
    letter-spacing: 2px; color: #0f766e; direction: ltr;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: right; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  th { color: #64748b; font-weight: 600; width: 35%; background: #f8fafc; }
  td { font-weight: 600; color: #0f172a; }
  td.mono { font-family: "Courier New", monospace; text-align: left; }
  .note {
    margin-top: 24px; padding: 14px 16px; border-radius: 10px;
    background: #fef9c3; border: 1px solid #fde68a; color: #713f12; font-size: 13px;
  }
  .footer {
    margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;
    font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  .actions { margin: 16px 0; text-align: center; }
  .actions button {
    padding: 10px 20px; margin: 0 4px; border-radius: 8px; border: 0;
    font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .actions .primary { background: #0f766e; color: #fff; }
  .actions .secondary { background: #e2e8f0; color: #0f172a; }
  @media print { .actions { display: none; } .sheet { padding: 0; } }
</style>
</head>
<body>
  <div class="actions">
    <button class="primary" onclick="window.print()">تحميل / طباعة PDF</button>
    <button class="secondary" onclick="window.close()">إغلاق</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div class="brand">مجمع باعشن الطبي<small>Baashen Medical Complex</small></div>
      <div class="badge">تأكيد حجز</div>
    </div>

    <h1>تفاصيل الموعد</h1>
    <p style="color:#475569;font-size:13px;margin:0 0 8px;">
      شكرًا لاختياركم مجمع باعشن الطبي — نرجو الاحتفاظ بهذه الوثيقة والاطلاع على رقم الطلب.
    </p>

    <div class="ref-box">
      <div>
        <div class="lbl">رقم الطلب</div>
        <div class="num">${esc(data.reference)}</div>
      </div>
      <div style="text-align:left;">
        <div class="lbl">تاريخ الإصدار</div>
        <div style="font-size:13px;font-weight:600;">${esc(generatedAt)}</div>
      </div>
    </div>

    <table>
      ${row("اسم المريض", data.patient_name)}
      ${row("رقم الجوال", data.patient_phone, true)}
      ${row("المركز", data.centerName)}
      ${row("الخدمة", data.service)}
      ${row("التخصص", data.specialty)}
      ${row("الطبيب", data.doctor_name)}
      ${row("تاريخ الموعد", formatArabicDate(data.appointment_date))}
      ${row("وقت الموعد", data.appointment_time?.slice(0, 5), true)}
      ${row("الحالة", data.status)}
    </table>

    <div class="note">
      ${esc(
        data.note ??
          "قد يتواصل معكم فريق الاستقبال لتأكيد التوقيت النهائي حسب توفر الطبيب. يُرجى الحضور قبل الموعد بـ 15 دقيقة، وإحضار هذه الوثيقة أو رقم الطلب عند الاستقبال.",
      )}
    </div>

    <div class="footer">
      <span>مجمع باعشن الطبي — جميع الحقوق محفوظة</span>
      <span>baashen.com</span>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.print(); } catch (e) {} }, 350);
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=880,height=1000");
  if (!win) {
    // Popup blocked — fallback: download as .html file the user can open & print.
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-${data.reference}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
