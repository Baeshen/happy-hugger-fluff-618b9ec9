import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";
type Ctx = { lang: Lang; dir: "rtl" | "ltr"; setLang: (l: Lang) => void; t: (k: keyof typeof STRINGS["ar"]) => string };

const STRINGS = {
  ar: {
    nav_home: "الرئيسية",
    nav_specialties: "التخصصات",
    nav_doctors: "الأطباء",
    nav_book: "احجز موعدًا",
    nav_pharmacy: "اطلب دواء",
    nav_about: "من نحن",
    nav_contact: "تواصل معنا",
    nav_faq: "الأسئلة الشائعة",
    cta_book: "احجز موعدًا",
    cta_medicine: "اطلب دواء",
    hero_title: "رعايتك تبدأ هنا",
    hero_sub: "مجمع طبي معتمد من CBAHI في صبيا، جازان — خدمات تخصصية وصيدلية داخلية على مدار الأسبوع.",
    why_title: "لماذا باعشن",
    why_1_title: "معتمد من CBAHI",
    why_1_desc: "منشأة صحية معتمدة من المركز السعودي لاعتماد المنشآت الصحية.",
    why_2_title: "صيدلية داخلية",
    why_2_desc: "صيدليات باعشن تخدم مراجعينا مع خيار توصيل الأدوية.",
    why_3_title: "فريق متخصص",
    why_3_desc: "أطباء استشاريون وأخصائيون في مختلف التخصصات.",
    specialties_title: "تخصصاتنا",
    specialties_sub: "اختر التخصص المناسب لك واحجز موعدك مباشرة.",
    doctors_title: "أطباؤنا",
    doctors_sub: "نخبة من الأطباء الاستشاريين والأخصائيين.",
    book_with_doctor: "احجز مع الطبيب",
    all_specialties: "كل التخصصات",
    search: "ابحث",
    footer_hours: "ساعات العمل",
    footer_hours_val: "السبت – الأربعاء: 9 ص – 9 م | الخميس: 9 ص – 1 م",
    footer_contact: "تواصل",
    footer_address: "العنوان",
    footer_rights: "جميع الحقوق محفوظة",
    lang_switch: "English",
    step: "الخطوة",
    of: "من",
    next: "التالي",
    back: "السابق",
    submit: "تأكيد الحجز",
    choose_specialty: "اختر التخصص",
    choose_doctor: "اختر الطبيب",
    any_available: "أي طبيب متاح",
    choose_datetime: "اختر التاريخ والوقت",
    patient_info: "بيانات المريض",
    name: "الاسم",
    phone: "رقم الجوال",
    national_id: "رقم الهوية / الإقامة (اختياري)",
    gender: "الجنس",
    male: "ذكر",
    female: "أنثى",
    reason: "سبب الزيارة",
    date: "التاريخ",
    time: "الوقت",
    booking_success: "تم استلام طلب الحجز",
    booking_success_desc: "سيتواصل معك فريقنا لتأكيد الموعد.",
    booking_ref: "رقم الحجز",
    med_title: "طلب توصيل دواء",
    med_sub: "ارفع صورة الوصفة أو اكتب أسماء الأدوية، وسنتواصل معك للتأكيد.",
    prescription_image: "صورة الوصفة (اختياري)",
    medicines_list: "قائمة الأدوية",
    address: "العنوان",
    district: "الحي",
    delivery_type: "طريقة الاستلام",
    delivery: "توصيل للمنزل",
    pickup: "استلام من الصيدلية",
    notes: "ملاحظات",
    submit_order: "إرسال الطلب",
    order_success: "تم استلام طلبك",
    order_success_desc: "سيتصل بك فريق الصيدلية لتأكيد الطلب.",
    about_title: "عن المجمع",
    contact_title: "تواصل معنا",
    faq_title: "الأسئلة الشائعة",
    required: "مطلوب",
    loading: "جارٍ التحميل…",
    no_doctors: "لا يوجد أطباء في هذا التخصص حاليًا.",
  },
  en: {
    nav_home: "Home",
    nav_specialties: "Specialties",
    nav_doctors: "Doctors",
    nav_book: "Book Appointment",
    nav_pharmacy: "Order Medicine",
    nav_about: "About",
    nav_contact: "Contact",
    nav_faq: "FAQ",
    cta_book: "Book an Appointment",
    cta_medicine: "Order Medicine",
    hero_title: "Your Care Starts Here",
    hero_sub: "A CBAHI-accredited medical complex in Sabya, Jazan — specialty care and in-house pharmacy, all week.",
    why_title: "Why Baeshen",
    why_1_title: "CBAHI Accredited",
    why_1_desc: "Accredited by the Saudi Central Board for Accreditation of Healthcare Institutions.",
    why_2_title: "In-House Pharmacy",
    why_2_desc: "Baeshen Pharmacies serve our patients with a home delivery option.",
    why_3_title: "Specialist Team",
    why_3_desc: "Consultant and specialist doctors across a wide range of fields.",
    specialties_title: "Our Specialties",
    specialties_sub: "Choose the right specialty and book your appointment directly.",
    doctors_title: "Our Doctors",
    doctors_sub: "A selection of consultants and specialists.",
    book_with_doctor: "Book with doctor",
    all_specialties: "All specialties",
    search: "Search",
    footer_hours: "Working Hours",
    footer_hours_val: "Sat – Wed: 9am – 9pm | Thu: 9am – 1pm",
    footer_contact: "Contact",
    footer_address: "Address",
    footer_rights: "All rights reserved",
    lang_switch: "العربية",
    step: "Step",
    of: "of",
    next: "Next",
    back: "Back",
    submit: "Confirm Booking",
    choose_specialty: "Choose specialty",
    choose_doctor: "Choose doctor",
    any_available: "Any available doctor",
    choose_datetime: "Choose date & time",
    patient_info: "Patient information",
    name: "Full name",
    phone: "Phone number",
    national_id: "National / Iqama ID (optional)",
    gender: "Gender",
    male: "Male",
    female: "Female",
    reason: "Reason for visit",
    date: "Date",
    time: "Time",
    booking_success: "Booking request received",
    booking_success_desc: "Our team will contact you to confirm the appointment.",
    booking_ref: "Booking ref",
    med_title: "Medicine Delivery Request",
    med_sub: "Upload a prescription image or list medicines, and we'll contact you to confirm.",
    prescription_image: "Prescription image (optional)",
    medicines_list: "Medicines list",
    address: "Address",
    district: "District",
    delivery_type: "Fulfillment",
    delivery: "Home delivery",
    pickup: "Pickup from pharmacy",
    notes: "Notes",
    submit_order: "Submit order",
    order_success: "Order received",
    order_success_desc: "The pharmacy team will contact you to confirm.",
    about_title: "About the Complex",
    contact_title: "Contact Us",
    faq_title: "Frequently Asked Questions",
    required: "required",
    loading: "Loading…",
    no_doctors: "No doctors currently listed in this specialty.",
  },
} as const;

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && (localStorage.getItem("lang") as Lang | null)) || "ar";
    setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  const value: Ctx = {
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    setLang,
    t: (k) => STRINGS[lang][k],
  };
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
