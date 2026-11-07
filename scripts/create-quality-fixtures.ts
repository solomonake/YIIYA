/** Procedural test assets, never represented as photo reconstruction evidence. */
import { Document, NodeIO } from "@gltf-transform/core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
const output = process.argv[2];
if (!output) throw new Error("Usage: npm run fixtures:3d -- output-dir");
await mkdir(output, { recursive: true });
for (const normals of [false, true]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  const directions: number[] = [];
  const indices: number[] = [];
  const rows = 16, columns = 32;
  for (let row = 0; row <= rows; row++) {
    const phi = Math.PI * row / rows;
    for (let col = 0; col <= columns; col++) {
      const theta = 2 * Math.PI * col / columns;
      const x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z); directions.push(x, y, z);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + columns + 1;
    if (row > 0) indices.push(a, a + 1, b);
    if (row < rows - 1) indices.push(a + 1, b + 1, b);
  }
  const primitive = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer))
    .setMaterial(doc.createMaterial().setBaseColorFactor([0.7, 0.3, 0.1, 1]));
  if (normals) primitive.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(directions)).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  const bytes = await new NodeIO().writeBinary(doc);
  await writeFile(path.join(output, normals ? "sphere-with-normals.glb" : "sphere-without-normals.glb"), bytes, { flag: "wx" });
}
console.log("Created procedural sphere fixtures; not image-to-3D outputs.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
