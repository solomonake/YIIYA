/** Offline export of the actual research artifact through YIIYA's converters. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { glbToObj, glbToStl } from "../lib/scene/mesh-export";

async function main() {
  const source = "outputs/image-3d-evaluations/diagnostic-002-sf3d/sf3d.glb";
  const output = "outputs/delivery-round-005";
  const bytes = await readFile(source);
  const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
  if (sha256(bytes) !== "ee3b0849d9b7f70b85d1d3a6cfa4ba4624e540db155478faf654c9c7b10b7a77") throw new Error("Research artifact hash mismatch");
  await mkdir(output, { recursive: false });
  const started = performance.now();
  const obj = await glbToObj(bytes);
  const stl = await glbToStl(bytes);
  await writeFile(output + "/dinosaur.obj", obj.obj, { flag: "wx" });
  await writeFile(output + "/dinosaur.stl", stl.stl, { flag: "wx" });
  const report = { source, source_sha256: sha256(bytes),
    obj: { triangles: obj.triangles, bytes: Buffer.byteLength(obj.obj), sha256: sha256(obj.obj) },
    stl: { triangles: stl.triangles, bytes: stl.stl.length, sha256: sha256(stl.stl) },
    elapsed_seconds: (performance.now() - started) / 1000,
    reimport_verified: false, visual_fidelity_reward: null,
    limitations: "Geometry exports; OBJ has no material/texture package and STL has no materials, UVs or declared physical units. Blender reimport is a separate gate." };
  await writeFile(output + "/export.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(() => { console.error("Generated artifact export check failed; inspect existing evidence before retrying."); process.exitCode = 1; });
