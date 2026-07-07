import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  ArrowLeft,
  Printer,
  Download,
  User,
  Stethoscope,
  Star,
  Search,
  Building2,
  Users,
  FileText,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listBranchesForRatings, listDoctorsForRatings } from "@/lib/ratings.functions";
import { listPatientsAdvanced } from "@/lib/patients-mgmt.functions";

export const Route = createFileRoute("/_authenticated/qr-cards")({
  head: () => ({
    meta: [
      { title: "بطاقات QR | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QrCardsPage,
});

const CLINIC_NAME = "مجمع باعشن الطبي";

function QrCardsPage() {
  return (
    <div className="container-app py-10 space-y-8" dir="rtl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <QrCode className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">بطاقات QR السريعة</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بطاقات للطباعة أو التنزيل — لمساعدة المرضى على الوصول السريع للملف أو الحجز أو التقييم.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/ratings" className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <Star className="h-4 w-4 text-amber-500" /> التقييمات
          </Link>
          <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> لوحة التحكم
          </Link>
        </div>
      </div>

      <Tabs defaultValue="patient" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="patient"><User className="h-4 w-4 ml-1.5" />بطاقة مريض</TabsTrigger>
          <TabsTrigger value="booking"><Stethoscope className="h-4 w-4 ml-1.5" />بطاقة حجز</TabsTrigger>
          <TabsTrigger value="rating"><Star className="h-4 w-4 ml-1.5" />بطاقة تقييم</TabsTrigger>
        </TabsList>

        <TabsContent value="patient"><PatientCardTab /></TabsContent>
        <TabsContent value="booking"><BookingCardTab /></TabsContent>
        <TabsContent value="rating"><RatingCardTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------- Patient MRN card ----------------------------- */

function PatientCardTab() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{ id: string; mrn: string; full_name_ar: string; branch_name_ar?: string | null } | null>(null);
  const listFn = useServerFn(listPatientsAdvanced);

  const searchQ = useQuery({
    queryKey: ["qr-patients", q],
    queryFn: () => listFn({ data: { q: q || undefined, page: 1, pageSize: 20 } }),
    enabled: q.length >= 2,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = selected ? `${origin}/patients/${selected.id}` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="text-sm font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          ابحث عن مريض (اسم / رقم ملف / جوال)
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اكتب حرفين على الأقل…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="max-h-96 overflow-auto rounded-md border border-border divide-y divide-border">
          {q.length < 2 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">ابدأ بالكتابة للبحث…</p>
          ) : searchQ.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">جارٍ البحث…</p>
          ) : (searchQ.data?.rows ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">لا نتائج.</p>
          ) : (
            (searchQ.data?.rows ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected({ id: p.id, mrn: p.mrn, full_name_ar: p.full_name_ar, branch_name_ar: p.branch_name_ar })}
                className={`w-full text-right px-3 py-2 hover:bg-muted transition ${selected?.id === p.id ? "bg-primary/10" : ""}`}
              >
                <p className="text-sm font-medium">{p.full_name_ar}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.mrn}{p.phone ? ` · ${p.phone}` : ""}</p>
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        {selected ? (
          <CardPreview
            title={selected.full_name_ar}
            subtitle={`رقم الملف: ${selected.mrn}`}
            footer={selected.branch_name_ar ?? CLINIC_NAME}
            url={url}
            hint="امسح لفتح ملف المريض"
            tone="primary"
          />
        ) : (
          <EmptyPreview label="اختر مريضًا لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Booking card ------------------------------- */

function BookingCardTab() {
  const doctorsFn = useServerFn(listDoctorsForRatings);
  const doctorsQ = useQuery({ queryKey: ["qr-doctors"], queryFn: () => doctorsFn(), staleTime: 60_000 });
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const selected = useMemo(() => (doctorsQ.data ?? []).find((d) => d.id === doctorId), [doctorsQ.data, doctorId]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = selected ? `${origin}/book?doctor=${selected.id}` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="text-sm font-semibold flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          اختر الطبيب
        </label>
        <select
          value={doctorId ?? ""}
          onChange={(e) => setDoctorId(e.target.value || null)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {(doctorsQ.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name_ar}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          امسح QR ليفتح المريض صفحة الحجز مباشرة عند هذا الطبيب.
        </p>
      </div>
      <div>
        {selected ? (
          <CardPreview
            title={selected.name_ar}
            subtitle={selected.name_en ?? ""}
            footer="احجز موعدك الآن"
            url={url}
            hint="امسح للحجز"
            tone="emerald"
          />
        ) : (
          <EmptyPreview label="اختر طبيبًا لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Rating card ------------------------------- */

function RatingCardTab() {
  const branchesFn = useServerFn(listBranchesForRatings);
  const doctorsFn = useServerFn(listDoctorsForRatings);
  const branchesQ = useQuery({ queryKey: ["qr-r-branches"], queryFn: () => branchesFn(), staleTime: 60_000 });
  const doctorsQ = useQuery({ queryKey: ["qr-r-doctors"], queryFn: () => doctorsFn(), staleTime: 60_000 });

  const [branchId, setBranchId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const filteredDoctors = useMemo(
    () => (branchId ? (doctorsQ.data ?? []).filter((d) => d.branch_id === branchId) : (doctorsQ.data ?? [])),
    [doctorsQ.data, branchId],
  );

  const branch = (branchesQ.data ?? []).find((b) => b.id === branchId);
  const doctor = (doctorsQ.data ?? []).find((d) => d.id === doctorId);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (branchId) params.set("branch", branchId);
  if (doctorId) params.set("doctor", doctorId);
  const url = branchId || doctorId ? `${origin}/rate?${params.toString()}` : "";

  const title = doctor?.name_ar || branch?.name_ar || "";
  const subtitle = doctor && branch ? branch.name_ar : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> الفرع
          </label>
          <select value={branchId ?? ""} onChange={(e) => { setBranchId(e.target.value || null); setDoctorId(null); }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">—</option>
            {(branchesQ.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" /> الطبيب (اختياري)
          </label>
          <select value={doctorId ?? ""} onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">—</option>
            {filteredDoctors.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          امسح QR لفتح صفحة التقييم مع تحديد الفرع/الطبيب مسبقًا.
        </p>
      </div>
      <div>
        {url ? (
          <CardPreview
            title={title || "قيّم تجربتك"}
            subtitle={subtitle}
            footer="رأيك يهمنا"
            url={url}
            hint="امسح للتقييم"
            tone="amber"
          />
        ) : (
          <EmptyPreview label="اختر الفرع أو الطبيب لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Shared ---------------------------------- */

function EmptyPreview({ label }: { label: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CardPreview({
  title,
  subtitle,
  footer,
  url,
  hint,
  tone,
}: {
  title: string;
  subtitle: string;
  footer: string;
  url: string;
  hint: string;
  tone: "primary" | "emerald" | "amber";
}) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  const toneMap = {
    primary: { bg: "from-primary/10 to-primary/5", accent: "text-primary", ring: "border-primary/30" },
    emerald: { bg: "from-emerald-500/10 to-emerald-500/5", accent: "text-emerald-600", ring: "border-emerald-500/30" },
    amber: { bg: "from-amber-500/10 to-amber-500/5", accent: "text-amber-600", ring: "border-amber-500/30" },
  }[tone];

  const printCard = () => {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; margin:0; padding:40px; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; }
        .card { width: 360px; padding: 32px; border-radius: 20px; background:#fff; box-shadow: 0 8px 30px rgba(0,0,0,.08); text-align:center; border: 2px solid ${tone === "primary" ? "#3b82f6" : tone === "emerald" ? "#10b981" : "#f59e0b"}; }
        .clinic { font-size: 11px; color:#666; letter-spacing: 2px; text-transform: uppercase; margin-bottom:8px; }
        h1 { font-size: 22px; margin: 8px 0; }
        .sub { color:#666; font-size: 14px; margin-bottom: 20px; }
        img { width: 240px; height: 240px; margin: 0 auto; display:block; }
        .hint { margin-top: 16px; font-size: 13px; color: #444; }
        .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; color:#888; font-size: 12px; }
        @media print { body { background:#fff; padding:0; } .card { box-shadow:none; } }
      </style></head><body>
      <div class="card">
        <div class="clinic">${CLINIC_NAME}</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
        <img src="${dataUrl}" alt="QR" />
        <div class="hint">${escapeHtml(hint)}</div>
        <div class="footer">${escapeHtml(footer)}</div>
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>`);
    w.document.close();
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${title.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border-2 ${toneMap.ring} bg-gradient-to-br ${toneMap.bg} p-8 text-center shadow-sm`}>
        <p className={`text-[10px] uppercase tracking-widest ${toneMap.accent} font-bold mb-2`}>{CLINIC_NAME}</p>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        <div className="mt-5 mx-auto w-56 h-56 bg-white rounded-xl p-3 shadow-inner grid place-items-center">
          {dataUrl ? (
            <img src={dataUrl} alt="QR" className="w-full h-full" />
          ) : (
            <p className="text-xs text-muted-foreground">جارٍ توليد الرمز…</p>
          )}
        </div>
        <p className="mt-4 text-sm font-medium">{hint}</p>
        <p className="mt-3 text-[11px] text-muted-foreground border-t pt-3 break-all font-mono" dir="ltr">{url}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={printCard} disabled={!dataUrl}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40">
          <Printer className="h-4 w-4" /> طباعة
        </button>
        <button onClick={download} disabled={!dataUrl}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-40">
          <Download className="h-4 w-4" /> تنزيل PNG
        </button>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
