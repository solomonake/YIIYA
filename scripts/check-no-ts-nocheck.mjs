#!/usr/bin/env node
/**
 * Fail the build if `@ts-nocheck` reappears in source.
 *
 * The asset and 3D core carried 39 of these, which made `npm run typecheck`
 * pass while the riskiest files were entirely unchecked — two of them had been
 * silently broken against the post-pivot store for months. This guard keeps
 * that class of blind spot from coming back.
 *
 * Runs as part of `npm run typecheck`, so CI enforces it with no workflow edit.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app", "components", "lib", "services", "types"];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

const offenders = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // root not present in this checkout
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }

    if (!EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;

    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Match the pragma as a comment directive, not the word in prose.
      if (/^\s*(\/\/|\/\*)\s*@ts-nocheck\b/.test(line)) {
        offenders.push(`${relative(process.cwd(), full)}:${index + 1}`);
      }
    });
  }
}

for (const root of ROOTS) {
  walk(root);
}

if (offenders.length > 0) {
  console.error(
    `\n@ts-nocheck is not allowed (${offenders.length} occurrence${offenders.length === 1 ? "" : "s"}):\n`
  );
  for (const offender of offenders) {
    console.error(`  ${offender}`);
  }
  console.error(
    "\nFix the underlying types instead. For a single unavoidable line, use\n" +
      "@ts-expect-error with a comment explaining why.\n"
  );
  process.exit(1);
}

console.log("no @ts-nocheck found");
