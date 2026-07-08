import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  Stethoscope,
  CheckCircle2,
  Loader2,
  Upload,
  X,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/second-opinion")({
  head: () => ({
    meta: [
      { title: "الرأي الطبي الثاني — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "احصل على رأي طبي ثانٍ من استشاريي مجمع باعشن قبل اتخاذ قرار علاجي — ارفع تقاريرك السابقة، وسيتواصل معك الفريق خلال 48 ساعة.",
      },
      { property: "og:title", content: "الرأي الطبي الثاني — مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "تأكّد من خيارك العلاجي عبر مراجعة استشاريّ مستقلّ لتقاريرك.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/second-opinion" },
    ],
  }),
  component: SecondOpinionPage,
});

const SPECIALTIES = [
  "الأورام",
  "جراحة القلب",
  "جراحة العظام",
  "المخ والأعصاب",
  "أمراض النساء والولادة",
  "طب الأطفال",
  "الجهاز الهضمي",
  "المسالك البولية",
  "الأمراض الجلدية",
  "الغدد الصماء",
  "أخرى",
];

const schema = z.object({
  patient_name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?966|00966|0)?5\d{8}$/, "أدخل رقم جوال سعودي صحيح"),
  email: z.string().trim().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  specialty: z.string().min(1, "اختر التخصص"),
  summary: z.string().trim().min(30, "اكتب ملخصًا لا يقلّ عن 30 حرفًا").max(2000),
});

const MAX_FILE_MB = 8;
const MAX_FILES = 5;

function SecondOpinionPage() {
  const [form, setForm] = useState({
    patient_name: "",
    phone: "",
    email: "",
    specialty: "",
    summary: "",
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`الحد الأقصى ${MAX_FILES} ملفات`);
        break;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`الملف "${f.name}" يتجاوز ${MAX_FILE_MB} ميجابايت`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string | undefined;
        if (k && !fe[k]) fe[k] = issue.message;
      }
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "راجع الحقول");
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading("جاري إرسال طلبك...");
    try {
      // Upload files first into a fresh folder
      const folder = crypto.randomUUID();
      const uploaded: string[] = [];
      for (const f of files) {
        const path = `${folder}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("second-opinion-uploads")
          .upload(path, f, { upsert: false, contentType: f.type || undefined });
        if (upErr) {
          toast.error(`تعذّر رفع الملف: ${upErr.message}`, { id: toastId });
          setSubmitting(false);
          return;
        }
        uploaded.push(path);
      }

      const { data, error } = await supabase
        .from("second_opinion_requests")
        .insert({
          patient_name: parsed.data.patient_name,
          phone: parsed.data.phone,
          email: parsed.data.email || null,
          specialty: parsed.data.specialty,
          summary: parsed.data.summary,
          upload_paths: uploaded,
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message, { id: toastId });
        return;
      }

      toast.success("تم استلام طلبك", { id: toastId });
      setDone(data.id);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <PageHero eyebrow="الرأي الطبي الثاني" title="تم استلام طلبك" />
        <section className="container-app py-10">
          <div className="max-w-2xl mx-auto rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <div>
                <h2 className="text-xl font-bold">استلمنا طلبك بنجاح</h2>
                <p className="text-sm text-muted-foreground">
                  سيراجع الفريق الطبي تقاريرك ويتواصل معك خلال 48 ساعة عمل.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-background/60 p-4 text-sm">
              <span className="text-muted-foreground">رقم طلبك: </span>
              <span className="font-mono font-bold tracking-wider">{done.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="خدمة استشارية"
        title="الرأي الطبي الثاني"
        subtitle="قبل أي قرار جراحي أو علاجي كبير، احصل على مراجعة مستقلة من استشاريّي مجمع باعشن — نستقبل تقاريرك ونعود إليك بتوصية موثّقة خلال 48 ساعة."
      />

      <section className="container-app py-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              خصوصية تامّة
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-6">
              تُعامَل تقاريرك بسريّة تامة ولا يُطّلع عليها إلا الاستشاري المعنيّ.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 font-bold">
              <Stethoscope className="h-5 w-5 text-primary" />
              متى تحتاجه؟
            </div>
            <ul className="mt-2 text-sm text-muted-foreground list-disc pr-5 space-y-1">
              <li>قبل جراحة كبرى</li>
              <li>تشخيص غير قاطع</li>
              <li>خطة علاجية طويلة</li>
              <li>حالة أورام أو مزمنة</li>
            </ul>
          </div>
        </aside>

        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={submitting}
          className="rounded-2xl border border-border bg-card p-6 space-y-4"
          aria-label="نموذج طلب رأي طبي ثانٍ"
        >
          <fieldset disabled={submitting} className="space-y-4 border-0 p-0 m-0 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="الاسم الكامل" error={errors.patient_name} id="so-name">
                <input
                  id="so-name"
                  value={form.patient_name}
                  onChange={update("patient_name")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label="رقم الجوال" error={errors.phone} id="so-phone" hint="05XXXXXXXX">
                <input
                  id="so-phone"
                  dir="ltr"
                  inputMode="tel"
                  value={form.phone}
                  onChange={update("phone")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label="البريد الإلكتروني (اختياري)" error={errors.email} id="so-email">
                <input
                  id="so-email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={update("email")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label="التخصص" error={errors.specialty} id="so-spec">
                <select
                  id="so-spec"
                  value={form.specialty}
                  onChange={update("specialty")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— اختر التخصص —</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="ملخّص الحالة" error={errors.summary} id="so-summary" hint="التشخيص السابق، العلاجات المتخذة، الأعراض الحالية">
              <textarea
                id="so-summary"
                rows={5}
                value={form.summary}
                onChange={update("summary")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </FormField>

            <div>
              <label className="mb-1 block text-xs font-semibold">
                تقارير سابقة (اختياري — PDF أو صور، حد أقصى {MAX_FILES} ملفات، {MAX_FILE_MB}MB لكل ملف)
              </label>
              <div className="rounded-lg border-2 border-dashed border-border p-4 text-center">
                <input
                  ref={fileInputRef}
                  id="so-files"
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => addFiles(e.target.files)}
                  className="hidden"
                />
                <label
                  htmlFor="so-files"
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-muted"
                >
                  <Upload className="h-4 w-4" />
                  اختر الملفات
                </label>
              </div>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-muted-foreground">
                          ({(f.size / 1024 / 1024).toFixed(1)}MB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="p-1 hover:bg-destructive/10 rounded"
                        aria-label="إزالة الملف"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
          </button>
        </form>
      </section>
    </>
  );
}

function FormField({
  label,
  error,
  hint,
  id,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
