import { supabase } from "@/integrations/supabase/client";

export type Accreditation = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  year: number | null;
  category: string | null;
  sort_order: number;
};

export const accreditationsQuery = () => ({
  queryKey: ["accreditations"],
  queryFn: async (): Promise<Accreditation[]> => {
    // Table is not yet in the generated Supabase types — cast until types regenerate.
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o?: { ascending: boolean }) => Promise<{ data: Accreditation[] | null; error: Error | null }>;
        };
      };
    })
      .from("accreditations")
      .select("id, title_ar, title_en, description_ar, description_en, image_url, year, category, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 5 * 60_000,
});

export const specialtyDoctorCountsQuery = () => ({
  queryKey: ["specialty-doctor-counts"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data, error } = await (supabase as unknown as {
      rpc: (name: string) => Promise<{
        data: Array<{ specialty_id: string; doctor_count: number }> | null;
        error: Error | null;
      }>;
    }).rpc("specialty_doctor_counts");
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.specialty_id] = Number(row.doctor_count);
    return map;
  },
  staleTime: 5 * 60_000,
});
