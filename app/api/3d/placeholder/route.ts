import { type NextRequest, NextResponse } from "next/server";

// Minimal valid GLB binary (empty scene) to use as a placeholder
// while real generation is in progress.
function buildMinimalGLB(): Buffer {
  // GLB header: magic, version, length
  // JSON chunk: minimal glTF scene
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "YIIYA 3D Placeholder" },
    scene: 0,
    scenes: [{ name: "Placeholder", nodes: [0] }],
    nodes: [{ name: "placeholder", mesh: 0 }],
    meshes: [{
      name: "placeholder",
      primitives: [{ attributes: { POSITION: 0 }, indices: 1 }]
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3",
        max: [0.5, 0.5, 0], min: [-0.5, -0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 }
    ],
    buffers: [{ byteLength: 44 }]
  });

  const jsonBytes = Buffer.from(json, "utf8");
  // Pad to 4-byte boundary
  const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonChunk = Buffer.alloc(jsonPadded, 0x20);
  jsonBytes.copy(jsonChunk);

  // Binary chunk: triangle positions + indices
  const binData = Buffer.alloc(44, 0);
  // POSITION: 3 vertices of a flat triangle
  const positions = [
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [0, 0.5, 0]
  ];
  let offset = 0;
  for (const [x, y, z] of positions) {
    binData.writeFloatLE(x, offset); offset += 4;
    binData.writeFloatLE(y, offset); offset += 4;
    binData.writeFloatLE(z, offset); offset += 4;
  }
  // indices: 0, 1, 2
  binData.writeUInt16LE(0, offset); offset += 2;
  binData.writeUInt16LE(1, offset); offset += 2;
  binData.writeUInt16LE(2, offset); offset += 2;

  const binPadded = Math.ceil(binData.length / 4) * 4;
  const binChunk = Buffer.alloc(binPadded, 0);
  binData.copy(binChunk);

  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
  const glb = Buffer.alloc(totalLength);

  let pos = 0;
  // GLB header
  glb.writeUInt32LE(0x46546C67, pos); pos += 4; // magic "glTF"
  glb.writeUInt32LE(2, pos); pos += 4;           // version
  glb.writeUInt32LE(totalLength, pos); pos += 4; // total length

  // JSON chunk header
  glb.writeUInt32LE(jsonPadded, pos); pos += 4;
  glb.writeUInt32LE(0x4E4F534A, pos); pos += 4; // "JSON"
  jsonChunk.copy(glb, pos); pos += jsonPadded;

  // Binary chunk header
  glb.writeUInt32LE(binPadded, pos); pos += 4;
  glb.writeUInt32LE(0x004E4942, pos); pos += 4; // "BIN\0"
  binChunk.copy(glb, pos);

  return glb;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name") ?? "object";
  const glb = buildMinimalGLB();

  return new Response(glb, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "Content-Disposition": `inline; filename="${name}.glb"`,
      "Cache-Control": "no-store",
      "X-Yiiya-Placeholder": "true"
    }
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
