/**
 * JSON-LD structured data generator.
 *
 * Emits Organization + WebSite + BreadcrumbList. Pasted into the <head>
 * via a <script type="application/ld+json"> tag — see app/p/[slug]/page.tsx.
 *
 * Reference: https://schema.org / https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
 */
import type { PublishedProjectSummary } from "./metadata";
import { absoluteUrl, siteUrl } from "@/lib/seo/site";

export function projectJsonLd(p: PublishedProjectSummary): Record<string, unknown>[] {
  const url = absoluteUrl(`/p/${p.slug}`);
  const orgName = p.companyName ?? "YIIYA Project";
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      url,
      name: orgName,
      description: p.description ?? undefined,
      inLanguage: "en"
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: orgName,
      url,
      logo: p.heroImageUrl
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl() },
        { "@type": "ListItem", position: 2, name: orgName, item: url }
      ]
    }
  ];
}
