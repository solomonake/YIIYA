/**
 * Sitemap of the public pages that exist in this app.
 *
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
import type { MetadataRoute } from "next";

import { absoluteUrl, indexablePages } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return indexablePages.map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority
  }));
}
