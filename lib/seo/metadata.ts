/**
 * Metadata builder for published YIIYA projects.
 *
 * Reads a project's content_json and stake, derives a title/description/OG
 * image set, and returns a Next.js `Metadata` object.
 *
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
import type { Metadata } from "next";
import { sanitizePlain } from "@/lib/security/sanitize";

export type PublishedProjectSummary = {
  slug: string;
  title: string | null;
  description: string | null;
  companyName: string | null;
  industry: string | null;
  primaryColor?: string;
  heroImageUrl?: string;
  publishedAt: string | null;
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yiiya.app";
const DEFAULT_TITLE = "YIIYA";
const DEFAULT_DESCRIPTION = "Made with YIIYA — 3D-first design.";

export function buildPublishedMetadata(p: PublishedProjectSummary): Metadata {
  const title = sanitizePlain(p.title ?? p.companyName ?? DEFAULT_TITLE).slice(0, 70);
  const description = sanitizePlain(p.description ?? DEFAULT_DESCRIPTION).slice(0, 160);
  const url = `${SITE}/p/${p.slug}`;
  const ogImageUrl = `${SITE}/p/${p.slug}/opengraph-image`;
  return {
    title,
    description,
    metadataBase: new URL(SITE),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "YIIYA",
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      locale: "en_US"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" }
    },
    other: {
      "theme-color": p.primaryColor ?? "#0A0A0A"
    }
  };
}
