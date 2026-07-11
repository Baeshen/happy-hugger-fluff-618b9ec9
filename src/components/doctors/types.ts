export type DoctorRow = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string;
  title_ar: string | null;
  title_en: string | null;
  photo_url: string | null;
  gender: string | null;
  years_experience: number | null;
  languages: string[] | null;
  specialty_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  branch_ids: string[] | null;
  branch_names_ar: string[] | null;
  branch_slugs: string[] | null;
  avg_rating: number;
  ratings_count: number;
  booking_enabled: boolean;
  total_count: number;
};

export const LANG_LABELS: Record<string, { ar: string; en: string }> = {
  ar: { ar: "العربية", en: "Arabic" },
  en: { ar: "الإنجليزية", en: "English" },
  ur: { ar: "الأوردو", en: "Urdu" },
  hi: { ar: "الهندية", en: "Hindi" },
  fr: { ar: "الفرنسية", en: "French" },
};
