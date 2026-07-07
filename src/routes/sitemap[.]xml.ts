import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";


const BASE_URL = "https://happy-hugger-fluff.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/complex", changefreq: "monthly", priority: "0.8" },
          { path: "/specialties", changefreq: "weekly", priority: "0.9" },
          { path: "/doctors", changefreq: "weekly", priority: "0.9" },
          { path: "/book", changefreq: "weekly", priority: "0.9" },
          { path: "/pharmacy", changefreq: "monthly", priority: "0.7" },
          { path: "/lookup", changefreq: "monthly", priority: "0.6" },
          { path: "/about", changefreq: "monthly", priority: "0.7" },
          { path: "/faq", changefreq: "monthly", priority: "0.7" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/health", changefreq: "weekly", priority: "0.8" },
        ];

        const entries: SitemapEntry[] = [...staticEntries];

        try {
          const url =
            import.meta.env.VITE_SUPABASE_URL ||
            process.env.VITE_SUPABASE_URL ||
            process.env.SUPABASE_URL;
          const key =
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_ANON_KEY;

          if (url && key) {
            const headers = { apikey: key };
            const [sr, dr, hr] = await Promise.all([
              fetch(
                `${url}/rest/v1/specialties?select=slug,created_at&is_active=eq.true&order=sort_order`,
                { headers },
              ),
              fetch(
                `${url}/rest/v1/doctors?select=slug,created_at&is_active=eq.true&slug=not.is.null&order=sort_order`,
                { headers },
              ),
              fetch(
                `${url}/rest/v1/health_articles?select=slug,updated_at,published_at&is_published=eq.true&order=published_at.desc`,
                { headers },
              ),
            ]);
            const specialtiesRes = sr.ok ? await sr.json() : [];
            const doctorsRes = dr.ok ? await dr.json() : [];
            const articlesRes = hr.ok ? await hr.json() : [];

            for (const s of (specialtiesRes as Array<{ slug: string; created_at: string }>) ?? []) {
              entries.push({
                path: `/specialties/${encodeURIComponent(s.slug)}`,
                lastmod: s.created_at?.slice(0, 10),
                changefreq: "monthly",
                priority: "0.8",
              });
            }
            for (const d of (doctorsRes as Array<{ slug: string; created_at: string }>) ?? []) {
              entries.push({
                path: `/doctors/${encodeURIComponent(d.slug)}`,
                lastmod: d.created_at?.slice(0, 10),
                changefreq: "monthly",
                priority: "0.7",
              });
            }
            for (const a of (articlesRes as Array<{ slug: string; updated_at: string; published_at: string | null }>) ?? []) {
              entries.push({
                path: `/health/${encodeURIComponent(a.slug)}`,
                lastmod: (a.updated_at || a.published_at || "").slice(0, 10) || undefined,
                changefreq: "monthly",
                priority: "0.7",
              });
            }
          }
        } catch (err) {
          console.error("sitemap: failed to load dynamic entries", err);
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
