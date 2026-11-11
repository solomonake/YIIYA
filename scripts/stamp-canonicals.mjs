/**
 * Write canonical and og:url into the static photo documents from NEXT_PUBLIC_SITE_URL.
 * `npm run build` and `npm run dev` run this first, so a domain change is the env var.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { absoluteUrl, indexablePages, upsertCanonicalTags } from "../lib/seo/site-url.mjs";

for (const page of indexablePages) {
  if (!page.document) continue;
  const previous = readFileSync(page.document, "utf8");
  const next = upsertCanonicalTags(previous, absoluteUrl(page.path));
  if (next !== previous) writeFileSync(page.document, next);
}
