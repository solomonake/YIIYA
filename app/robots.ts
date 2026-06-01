/**
 * robots.txt
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yiiya.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/p/", "/gallery"],
        disallow: ["/api/", "/spawn", "/scan/", "/admin"]
      }
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE
  };
}
