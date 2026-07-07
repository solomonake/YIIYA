import { describe, expect, it } from "vitest";
import { Document, NodeIO } from "@gltf-transform/core";

import { glbToObj, glbToStl } from "./mesh-export";

/** Build a one-triangle GLB entirely in memory. */
async function makeTriangleGlb(withNormalsAndUvs = true): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);

  const indices = doc
    .createAccessor("indices")
    .setType("SCALAR")
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);

  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices);

  if (withNormalsAndUvs) {
    prim.setAttribute(
      "NORMAL",
      doc
        .createAccessor("NORMAL")
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer)
    );
    prim.setAttribute(
      "TEXCOORD_0",
      doc
        .createAccessor("TEXCOORD_0")
        .setType("VEC2")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer)
    );
  }

  const mesh = doc.createMesh("tri").addPrimitive(prim);
  const node = doc.createNode("tri-node").setMesh(mesh).setTranslation([1, 2, 3]);
  doc.createScene("scene").addChild(node);

  return new NodeIO().writeBinary(doc);
}

describe("glbToObj", () => {
  it("produces a real OBJ with world-transformed vertices and faces", async () => {
    const glb = await makeTriangleGlb();
    const { obj, triangles } = await glbToObj(glb);

    expect(triangles).toBe(1);
    // Node translation [1,2,3] must be baked into vertex positions.
    expect(obj).toContain("v 1 2 3");
    expect(obj).toContain("v 2 2 3");
    expect(obj).toContain("v 1 3 3");
    expect(obj).toContain("vn 0 0 1");
    expect(obj).toContain("f 1/1/1 2/2/2 3/3/3");
  });

  it("handles meshes without normals or uvs", async () => {
    const glb = await makeTriangleGlb(false);
    const { obj, triangles } = await glbToObj(glb);
    expect(triangles).toBe(1);
    expect(obj).toContain("f 1 2 3");
    expect(obj).not.toContain("vn ");
  });

  it("throws on geometry-free GLBs instead of shipping an empty file", async () => {
    const doc = new Document();
    doc.createScene("empty");
    const glb = await new NodeIO().writeBinary(doc);
    await expect(glbToObj(glb)).rejects.toThrow(/no triangle geometry/i);
  });
});

describe("glbToStl", () => {
  it("produces a valid binary STL", async () => {
    const glb = await makeTriangleGlb();
    const { stl, triangles } = await glbToStl(glb);

    expect(triangles).toBe(1);
    // Binary STL: 80-byte header + uint32 count + 50 bytes/triangle.
    expect(stl.byteLength).toBe(84 + 50);
    expect(stl.readUInt32LE(80)).toBe(1);
    // Face normal for a CCW triangle in the XY plane is +Z.
    expect(stl.readFloatLE(84 + 8)).toBeCloseTo(1);
    // First vertex is world-transformed by the node translation.
    expect(stl.readFloatLE(84 + 12)).toBeCloseTo(1);
    expect(stl.readFloatLE(84 + 16)).toBeCloseTo(2);
    expect(stl.readFloatLE(84 + 20)).toBeCloseTo(3);
  });
});
