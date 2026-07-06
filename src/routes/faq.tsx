import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "الأسئلة الشائعة | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "إجابات عن أكثر الأسئلة شيوعًا حول حجز المواعيد، الخدمات، الصيدلية وطرق التواصل.",
      },
      { property: "og:title", content: "الأسئلة الشائعة — مجمع باعشن الطبي" },
    ],
  }),
  component: FAQPage,
});

const FAQS = {
  ar: [
    {
      q: "كيف أحجز موعدًا؟",
      a: "من صفحة «احجز موعدًا»، اختر التخصص ثم الطبيب ثم التاريخ والوقت، وأكمل بياناتك. سيتواصل معك فريقنا للتأكيد.",
    },
    {
      q: "هل الخدمة متاحة للجميع؟",
      a: "نعم، يمكن لأي مريض حجز موعد أو طلب دواء دون الحاجة لإنشاء حساب.",
    },
    {
      q: "هل يمكنني طلب دواء بدون وصفة؟",
      a: "بعض الأدوية تحتاج وصفة نظامية. أرفق صورة الوصفة إن وُجدت، وسيتواصل معك الصيدلي للتأكيد.",
    },
    {
      q: "ما هي مناطق التوصيل؟",
      a: "نوصل الأدوية داخل مدينة صبيا. يرجى إدخال الحي والعنوان بدقة.",
    },
    {
      q: "ما هي ساعات العمل؟",
      a: "السبت – الأربعاء: 9 صباحًا – 9 مساءً | الخميس: 9 صباحًا – 1 ظهرًا. الطوارئ على مدار الساعة.",
    },
  ],
  en: [
    {
      q: "How do I book an appointment?",
      a: "Go to Book Appointment, choose the specialty, doctor, date and time, then submit your details. Our team will confirm.",
    },
    {
      q: "Do I need an account?",
      a: "No, any patient can book an appointment or request medicine without signing up.",
    },
    {
      q: "Can I order medicine without a prescription?",
      a: "Some medicines require a valid prescription. Upload a photo if available and the pharmacist will confirm.",
    },
    {
      q: "What areas do you deliver to?",
      a: "We deliver within Sabya city. Please provide the district and full address.",
    },
    {
      q: "What are the working hours?",
      a: "Sat – Wed: 9am – 9pm | Thu: 9am – 1pm. Emergency 24/7.",
    },
  ],
};

function FAQPage() {
  const { t, lang } = useI18n();
  return (
    <div className="container-app py-12 max-w-3xl">
      <h1 className="text-4xl font-bold">{t("faq_title")}</h1>
      <div className="mt-8 space-y-3">
        {FAQS[lang].map((f, i) => (
          <details
            key={i}
            className="group rounded-xl border border-border bg-card p-5 open:shadow-sm"
          >
            <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
              {f.q}
              <span className="text-primary group-open:rotate-45 transition">+</span>
            </summary>
            <p className="mt-3 text-sm text-muted-foreground leading-7">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
