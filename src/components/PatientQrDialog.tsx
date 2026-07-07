import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Printer, Download, X } from "lucide-react";

const CLINIC_NAME = "مجمع باعشن الطبي";

type Props = {
  patientId: string;
  mrn: string;
  fullNameAr: string;
  branchNameAr?: string | null;
  /** Rendered trigger. Defaults to a small icon button. */
  variant?: "icon" | "button";
};

export function PatientQrDialog({
  patientId,
  mrn,
  fullNameAr,
  branchNameAr,
  variant = "icon",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="بطاقة QR للمريض"
          aria-label="بطاقة QR للمريض"
          className="inline-flex items-center justify-center rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
        >
          <QrCode className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <QrCode className="h-4 w-4 text-primary" />
          بطاقة QR
        </button>
      )}

      {open && (
        <QrModal
          patientId={patientId}
          mrn={mrn}
          fullNameAr={fullNameAr}
          branchNameAr={branchNameAr}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QrModal({
  patientId,
  mrn,
  fullNameAr,
  branchNameAr,
  onClose,
}: {
  patientId: string;
  mrn: string;
  fullNameAr: string;
  branchNameAr?: string | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/patients/${patientId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${mrn || fullNameAr.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const printCard = () => {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(fullNameAr)}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; margin:0; padding:40px; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; }
        .card { width: 360px; padding: 32px; border-radius: 20px; background:#fff; box-shadow: 0 8px 30px rgba(0,0,0,.08); text-align:center; border: 2px solid #3b82f6; }
        .clinic { font-size: 11px; color:#666; letter-spacing: 2px; text-transform: uppercase; margin-bottom:8px; }
        h1 { font-size: 22px; margin: 8px 0; }
        .sub { color:#666; font-size: 14px; margin-bottom: 20px; font-family: ui-monospace, monospace; }
        img { width: 240px; height: 240px; margin: 0 auto; display:block; }
        .hint { margin-top: 16px; font-size: 13px; color: #444; }
        .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; color:#888; font-size: 12px; }
        @media print { body { background:#fff; padding:0; } .card { box-shadow:none; } }
      </style></head><body>
      <div class="card">
        <div class="clinic">${esc(CLINIC_NAME)}</div>
        <h1>${esc(fullNameAr)}</h1>
        <div class="sub">رقم الملف: ${esc(mrn)}</div>
        <img src="${dataUrl}" alt="QR" />
        <div class="hint">امسح لفتح ملف المريض والتقارير</div>
        <div class="footer">${esc(branchNameAr ?? CLINIC_NAME)}</div>
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> بطاقة QR للمريض
          </h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 text-center">
          <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-2">
            {CLINIC_NAME}
          </p>
          <h2 className="text-xl font-bold">{fullNameAr}</h2>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            رقم الملف: {mrn}
          </p>
          <div className="mt-5 mx-auto w-56 h-56 bg-white rounded-xl p-3 shadow-inner grid place-items-center">
            {dataUrl ? (
              <img src={dataUrl} alt="QR" className="w-full h-full" />
            ) : (
              <p className="text-xs text-muted-foreground">جارٍ توليد الرمز…</p>
            )}
          </div>
          <p className="mt-4 text-sm font-medium">امسح لفتح الملف والتقارير</p>
          <p
            className="mt-3 text-[11px] text-muted-foreground border-t pt-3 break-all font-mono"
            dir="ltr"
          >
            {url}
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={printCard}
            disabled={!dataUrl}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button
            onClick={download}
            disabled={!dataUrl}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> تنزيل PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
