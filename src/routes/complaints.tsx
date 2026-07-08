import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHero } from "@/components/PageShell";
import { MessageSquareWarning, ThumbsUp } from "lucide-react";

export const Route = createFileRoute("/complaints")({
  head: () => ({
    meta: [
      { title: "الشكاوى والمقترحات — مجمع باعشن الطبي" },
      { name: "description", content: "شاركنا ملاحظاتك، شكاواك، ومقترحاتك لتطوير خدماتنا." },
      { property: "og:title", content: "الشكاوى والمقترحات" },
      { property: "og:description", content: "شاركنا رأيك." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/complaints" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/complaints" }],
  }),
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageHero
        eyebrow="صوت المريض"
        title="ملاحظاتك تصنع الفرق"
        subtitle="نقرأ كل رسالة بعناية — سواء كانت شكوى نبحث فيها فوراً أو مقترحاً لتحسين تجربتك."
      />
      <section className="container-app py-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          {sent ? (
            <div className="py-10 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <ThumbsUp className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-xl font-bold">شكراً لك</h3>
              <p className="text-sm text-muted-foreground mt-1">تم استلام رسالتك وسيتواصل معك فريق تجربة المريض خلال 48 ساعة.</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
              className="grid gap-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="font-medium">الاسم</span>
                  <input required className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="text-sm">
                  <span className="font-medium">رقم الجوال</span>
                  <input required type="tel" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="text-sm">
                <span className="font-medium">نوع الرسالة</span>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option>شكوى</option>
                  <option>اقتراح</option>
                  <option>شكر</option>
                  <option>استفسار</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium">تفاصيل الرسالة</span>
                <textarea required rows={6} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <button className="rounded-md bg-primary text-primary-foreground font-semibold py-2.5">إرسال</button>
            </form>
          )}
        </div>
        <aside className="rounded-2xl border border-border bg-muted/40 p-6">
          <MessageSquareWarning className="h-8 w-8 text-primary" />
          <h4 className="mt-3 font-bold">ما بعد الإرسال</h4>
          <ul className="mt-2 text-sm text-muted-foreground space-y-2 list-disc ps-5">
            <li>يتم استلام الرسالة فوراً من قسم تجربة المريض.</li>
            <li>نتواصل معك خلال 48 ساعة عمل بأول رد.</li>
            <li>يُغلق البلاغ عند حل المشكلة وتأكيدك.</li>
          </ul>
        </aside>
      </section>
    </>
  );
}
