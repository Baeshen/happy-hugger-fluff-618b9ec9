import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Building2, CheckCircle2, Loader2, HeartHandshake, Users, BadgePercent } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/corporate")({
  head: () => ({
    meta: [
      { title: "خدمات الشركات — اتفاقيات مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "اتفاقيات طبية مخصّصة لشركتك: فحوصات ما قبل التوظيف، رعاية طبية للموظفين، وخصومات مؤسسية على الباقات الشاملة.",
      },
      { property: "og:title", content: "خدمات الشركات — مجمع باعشن" },
      { property: "og:description", content: "اتفاقيات طبية مخصّصة للشركات في جازان." },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/corporate" }],
  }),
  component: CorporatePage,
});

const SERVICES = ["فحوصات ما قبل التوظيف", "رعاية طبية للموظفين", "باقات فحص سنوية", "تطعيمات جماعية", "أخرى"];

const schema = z.object({
  company_name: z.string().trim().min(2, "اسم الشركة قصير").max(200),
  contact_name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z.string().trim().regex(/^(?:\+?966|00966|0)?5\d{8}$/, "أدخل جوال سعودي صحيح"),
  email: z.string().trim().email("بريد غير صالح").optional().or(z.literal("")),
  employee_count: z.coerce.number().int().min(1, "عدد الموظفين مطلوب").max(1_000_000).optional(),
  service_type: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function CorporatePage() {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    employee_count: "",
    service_type: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse({
      ...form,
      employee_count: form.employee_count === "" ? undefined : form.employee_count,
    });
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
      const { error } = await supabase.from("corporate_requests").insert({
        company_name: parsed.data.company_name,
        contact_name: parsed.data.contact_name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        employee_count: parsed.data.employee_count ?? null,
        service_type: parsed.data.service_type || null,
        notes: parsed.data.notes || null,
      });
      if (error) {
        toast.error(error.message, { id: toastId });
        return;
      }
      toast.success("سيتواصل معك فريق الاتفاقيات قريبًا", { id: toastId });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="اتفاقيات مؤسسية"
        title="خدمات الشركات"
        subtitle="نصمّم لشركتك اتفاقية طبية مخصّصة تجمع بين الجودة والتوفير — من فحوصات ما قبل التوظيف إلى تغطية طبية شاملة لموظفيك."
      />

      <section className="container-app py-10 grid gap-8 lg:grid-cols-3">
        {[
          {
            icon: <Users className="h-6 w-6" />,
            title: "رعاية الموظفين",
            desc: "أولوية حجز، خصم على الاستشارات، ومسار سريع في الاستقبال لموظفي الشركات المتعاقدة.",
          },
          {
            icon: <BadgePercent className="h-6 w-6" />,
            title: "أسعار مؤسسية",
            desc: "خصومات على باقات الفحص السنوي والفحوصات المخبرية والأشعة حسب حجم الاتفاقية.",
          },
          {
            icon: <HeartHandshake className="h-6 w-6" />,
            title: "مدير حساب مخصّص",
            desc: "نقطة اتصال واحدة لتنسيق كل ما تحتاجه شركتك — تقارير شهرية، جدولة، وفوترة موحّدة.",
          },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              {c.icon}
            </div>
            <h3 className="font-bold text-lg">{c.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-6">{c.desc}</p>
          </div>
        ))}
      </section>

      <section className="container-app pb-14">
        <div className="max-w-3xl mx-auto">
          {done ? (
            <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-4 text-xl font-bold">تم استلام طلبك</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                سيتواصل معك فريق الاتفاقيات المؤسسية خلال يوم عمل واحد لمناقشة تفاصيل اتفاقيتك.
              </p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              aria-busy={submitting}
              className="rounded-2xl border border-border bg-card p-6 space-y-4"
              aria-label="نموذج طلب اتفاقية شركات"
            >
              <div>
                <h2 className="text-xl font-bold">اطلب اتفاقية</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  املأ البيانات وسنتواصل معك بأسرع وقت.
                </p>
              </div>
              <fieldset disabled={submitting} className="grid gap-3 sm:grid-cols-2 border-0 p-0 m-0 disabled:opacity-70">
                <Field label="اسم الشركة" error={errors.company_name} id="co-name">
                  <input id="co-name" value={form.company_name} onChange={update("company_name")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="اسم جهة الاتصال" error={errors.contact_name} id="co-contact">
                  <input id="co-contact" value={form.contact_name} onChange={update("contact_name")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="رقم الجوال" error={errors.phone} id="co-phone" hint="05XXXXXXXX">
                  <input id="co-phone" dir="ltr" inputMode="tel" value={form.phone} onChange={update("phone")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="البريد الإلكتروني" error={errors.email} id="co-email">
                  <input id="co-email" type="email" dir="ltr" value={form.email} onChange={update("email")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="عدد الموظفين" error={errors.employee_count} id="co-count">
                  <input id="co-count" type="number" min={1} value={form.employee_count} onChange={update("employee_count")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="نوع الخدمة" error={errors.service_type} id="co-service">
                  <select id="co-service" value={form.service_type} onChange={update("service_type")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— اختر —</option>
                    {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="ملاحظات إضافية" error={errors.notes} id="co-notes">
                    <textarea id="co-notes" rows={4} value={form.notes} onChange={update("notes")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </Field>
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                {submitting ? "جاري الإرسال..." : "إرسال طلب الاتفاقية"}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

function Field({
  label, error, hint, id, children,
}: {
  label: string; error?: string; hint?: string; id: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p>
        : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        : null}
    </div>
  );
}
