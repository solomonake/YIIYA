/**
 * robots.txt
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/spawn", "/scan/", "/admin"]
    },
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
