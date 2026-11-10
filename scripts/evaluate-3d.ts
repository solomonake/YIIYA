/** Offline only. No provider calls, uploads, training, or automatic promotion. */
import { createHash } from "node:crypto";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectGlbBuffer } from "../lib/scene/glb-inspect";
import { compareQualityRewards, evaluateQualityReward } from "../lib/scene/quality-reward";

async function main() {
const [beforePath, afterPath, outputDir, provenance] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputDir || !provenance) {
  throw new Error("Usage: npm run evaluate:3d -- before.glb after.glb output-dir 'input provenance'");
}
async function inspect(filename: string) {
  const info = await stat(filename);
  if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error("Expected GLB file <= 100 MiB");
  const bytes = await readFile(filename);
  const inspection = inspectGlbBuffer(bytes);
  return {
    file: path.basename(filename), sha256: createHash("sha256").update(bytes).digest("hex"),
    inspection, quality: evaluateQualityReward(inspection.geometry, inspection.ok)
  };
}
const before = await inspect(beforePath);
const after = await inspect(afterPath);
const report = {
  recordedAt: new Date().toISOString(), provenance,
  mode: "offline-metadata-comparison", before, after,
  comparison: compareQualityRewards(before.quality, after.quality),
  limitations: "No image-to-render comparison, full binary validation, trained reward model, provider generation or production change."
};
await mkdir(outputDir, { recursive: true });
const filename = path.join(outputDir, `evaluation-${Date.now()}-${after.sha256.slice(0, 12)}.json`);
await writeFile(filename, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ report: filename, ...report.comparison }, null, 2));
if (!after.inspection.ok || !after.quality.eligible) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
