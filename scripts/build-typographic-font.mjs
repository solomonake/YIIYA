#!/usr/bin/env node
/**
 * build-typographic-font.mjs
 *
 * Ensures public/fonts/dm-serif-display.json exists. The TypographicPlaceholder
 * R3F component (components/scene/typographic-placeholder.tsx) loads this file
 * via drei's <Text3D>; without it the INTENT-stage placeholder renders nothing.
 *
 * Currently the bundled face is the public-domain Droid Serif typeface.json
 * from the three.js examples — a serif that visually approximates DM Serif
 * Display. To swap to the real DM Serif Display:
 *
 *   1. Download DM Serif Display from Google Fonts.
 *   2. Convert it with facetype.js:
 *        npx facetype.js DMSerifDisplay-Regular.ttf > public/fonts/dm-serif-display.json
 *   3. Commit the new JSON.
 *
 * This script only runs when the file is missing, so a custom swap is preserved
 * across installs. It is wired as a `prebuild` step in package.json so deploys
 * never ship without a font.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fontPath = resolve(here, "..", "public", "fonts", "dm-serif-display.json");
const sourceUrl =
  "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/droid/droid_serif_regular.typeface.json";

async function main() {
  if (existsSync(fontPath)) {
    console.log(`[font] already present at ${fontPath}`);
    return;
  }
  mkdirSync(dirname(fontPath), { recursive: true });
  console.log(`[font] fetching ${sourceUrl}`);
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    console.warn(
      `[font] download failed (${res.status}). Placeholder will render nothing until you generate the file manually.`
    );
    process.exit(0); // never fail the build over a placeholder asset
  }
  const text = await res.text();
  // Sanity check: this should be JSON with a `glyphs` key.
  if (!text.includes('"glyphs"')) {
    console.warn("[font] downloaded payload was not a valid typeface.json; skipping write.");
    process.exit(0);
  }
  writeFileSync(fontPath, text, "utf8");
  console.log(`[font] wrote ${text.length} bytes → ${fontPath}`);
}

main().catch((err) => {
  console.warn("[font] unexpected error:", err);
  process.exit(0);
});
