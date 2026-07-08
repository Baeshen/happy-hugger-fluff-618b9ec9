import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicBranch = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  city_ar: string | null;
  city_en: string | null;
  phone: string | null;
  emergency_phone: string | null;
  address_ar: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  description_ar: string | null;
  description_en: string | null;
  working_hours: Record<string, string> | null;
  map_embed_url: string | null;
  sort_order: number;
};

export const listPublicBranches = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBranch[]> => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase.rpc("list_public_branches");
    if (error) throw new Error(error.message);
    return (data ?? []) as PublicBranch[];
  },
);
