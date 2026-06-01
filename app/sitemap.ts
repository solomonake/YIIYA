/**
 * Dynamic sitemap. Reads every published slug from Supabase and emits an entry.
 * Cached for 5 minutes via Next.js revalidation.
 *
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
import type { MetadataRoute } from "next";
import { serviceClient } from "@/lib/supabase-server";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yiiya.app";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/gallery`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 }
  ];

  const client = serviceClient();
  if (!client) return staticEntries;

  const { data } = await client
    .from("projects")
    .select("slug, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const dynamicEntries: MetadataRoute.Sitemap = (data ?? []).map((row) => ({
    url: `${SITE}/p/${(row as { slug: string }).slug}`,
    lastModified: new Date((row as { created_at: string }).created_at),
    changeFrequency: "weekly",
    priority: 0.6
  }));

  return [...staticEntries, ...dynamicEntries];
}
