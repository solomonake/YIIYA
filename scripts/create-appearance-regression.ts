/** Negative control: deliberately damage a local mesh's appearance, never its source. */
import { NodeIO } from "@gltf-transform/core";
import { readFile, writeFile } from "node:fs/promises";

async function main() {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) throw new Error("Usage: vite-node scripts/create-appearance-regression.ts source.glb new-output.glb");
  const io = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(await readFile(source)));
  for (const material of doc.getRoot().listMaterials()) {
    material.setBaseColorTexture(null).setBaseColorFactor([1, 0, 1, 1]);
  }
  await writeFile(output, await io.writeBinary(doc), { flag: "wx" });
  console.log("Created deliberately incorrect magenta negative-control fixture; source unchanged.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
