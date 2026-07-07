/**
 * Real GLB → OBJ / STL conversion.
 *
 * Reads a GLB with gltf-transform (Draco + meshopt aware), bakes node world
 * transforms, and writes:
 *   - Wavefront OBJ (positions, normals, UVs, triangle faces)
 *   - Binary STL (unit-normal + 3 vertices per triangle)
 *
 * These are actual format conversions — the old /api/3d/convert returned GLB
 * bytes with a renamed extension, which no DCC tool or slicer would open.
 */
import { NodeIO, type Document, type Mesh, type Node, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

type Mat4 = number[]; // column-major, length 16 (glTF convention)

type TriangleSink = {
  begin(name: string): void;
  vertex(
    position: [number, number, number],
    normal: [number, number, number] | null,
    uv: [number, number] | null
  ): void;
  face(a: number, b: number, c: number): void; // absolute 0-based vertex ids
};

let ioPromise: Promise<NodeIO> | null = null;

async function getIO(): Promise<NodeIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const deps: Record<string, unknown> = {};
      try {
        const draco3d = (await import("draco3dgltf")).default;
        deps["draco3d.decoder"] = await draco3d.createDecoderModule();
      } catch {
        // Draco decoder unavailable — uncompressed GLBs still convert.
      }
      try {
        const { MeshoptDecoder } = await import("meshoptimizer");
        await MeshoptDecoder.ready;
        deps["meshopt.decoder"] = MeshoptDecoder;
      } catch {
        // meshopt decoder unavailable — uncompressed GLBs still convert.
      }
      return io.registerDependencies(deps as Parameters<NodeIO["registerDependencies"]>[0]);
    })();
  }
  return ioPromise;
}

export async function readGlb(glb: Uint8Array): Promise<Document> {
  const io = await getIO();
  return io.readBinary(glb);
}

// ─── Matrix helpers (column-major 4x4) ────────────────────────────────────────

function transformPoint(m: Mat4, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

/** Normal matrix = inverse-transpose of the upper-left 3x3. */
function normalMatrix(m: Mat4): number[] | null {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const det =
    a[0] * (a[4] * a[8] - a[5] * a[7]) -
    a[1] * (a[3] * a[8] - a[5] * a[6]) +
    a[2] * (a[3] * a[7] - a[4] * a[6]);
  if (!det) return null;
  const id = 1 / det;
  // inverse, then transpose (rows of inverse become columns).
  return [
    (a[4] * a[8] - a[5] * a[7]) * id,
    (a[2] * a[7] - a[1] * a[8]) * id,
    (a[1] * a[5] - a[2] * a[4]) * id,
    (a[5] * a[6] - a[3] * a[8]) * id,
    (a[0] * a[8] - a[2] * a[6]) * id,
    (a[2] * a[3] - a[0] * a[5]) * id,
    (a[3] * a[7] - a[4] * a[6]) * id,
    (a[1] * a[6] - a[0] * a[7]) * id,
    (a[0] * a[4] - a[1] * a[3]) * id
  ];
}

function transformNormal(nm: number[], n: [number, number, number]): [number, number, number] {
  const [x, y, z] = n;
  const out: [number, number, number] = [
    nm[0] * x + nm[3] * y + nm[6] * z,
    nm[1] * x + nm[4] * y + nm[7] * z,
    nm[2] * x + nm[5] * y + nm[8] * z
  ];
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  return [out[0] / len, out[1] / len, out[2] / len];
}

// ─── Shared traversal ─────────────────────────────────────────────────────────

const TRIANGLES = 4;

function walkTriangles(doc: Document, sink: TriangleSink): number {
  let vertexBase = 0;
  let triangles = 0;

  const visit = (node: Node) => {
    const mesh = node.getMesh();
    if (mesh) {
      vertexBase = emitMesh(mesh, node.getWorldMatrix() as unknown as Mat4, sink, vertexBase, node.getName());
    }
    for (const child of node.listChildren()) visit(child);
  };

  const emitMesh = (mesh: Mesh, world: Mat4, s: TriangleSink, base: number, nodeName: string): number => {
    const nm = normalMatrix(world);
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode();
      if (mode !== TRIANGLES && mode !== undefined && mode !== null) continue;

      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const nrm = prim.getAttribute("NORMAL");
      const uv = prim.getAttribute("TEXCOORD_0");
      const count = pos.getCount();

      s.begin(nodeName || mesh.getName() || "mesh");

      const p: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        pos.getElement(i, p);
        const wp = transformPoint(world, p);
        let wn: [number, number, number] | null = null;
        if (nrm && nm) {
          const n: [number, number, number] = [0, 0, 0];
          nrm.getElement(i, n);
          wn = transformNormal(nm, n);
        }
        let wuv: [number, number] | null = null;
        if (uv) {
          const u: [number, number] = [0, 0];
          uv.getElement(i, u);
          wuv = [u[0], 1 - u[1]]; // glTF UV origin is top-left; OBJ is bottom-left
        }
        s.vertex(wp, wn, wuv);
      }

      const indices = prim.getIndices();
      const idxCount = indices ? indices.getCount() : count;
      for (let i = 0; i + 2 < idxCount; i += 3) {
        const a = indices ? indices.getScalar(i) : i;
        const b = indices ? indices.getScalar(i + 1) : i + 1;
        const c = indices ? indices.getScalar(i + 2) : i + 2;
        s.face(base + a, base + b, base + c);
        triangles++;
      }
      base += count;
    }
    return base;
  };

  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) visit(node);
  }
  return triangles;
}

// ─── OBJ ──────────────────────────────────────────────────────────────────────

export async function glbToObj(glb: Uint8Array): Promise<{ obj: string; triangles: number }> {
  const doc = await readGlb(glb);
  const lines: string[] = ["# Exported by YIIYA — https://yiiya.app", "# Units: meters"];
  let hasNormals = false;
  let hasUvs = false;
  const faces: string[] = [];

  const triangles = walkTriangles(doc, {
    begin(name) {
      lines.push(`o ${name.replace(/\s+/g, "_")}`);
    },
    vertex(p, n, uv) {
      lines.push(`v ${p[0]} ${p[1]} ${p[2]}`);
      if (uv) {
        hasUvs = true;
        lines.push(`vt ${uv[0]} ${uv[1]}`);
      }
      if (n) {
        hasNormals = true;
        lines.push(`vn ${n[0]} ${n[1]} ${n[2]}`);
      }
    },
    face(a, b, c) {
      const f = (i: number) => {
        const v = i + 1; // OBJ is 1-based
        if (hasUvs && hasNormals) return `${v}/${v}/${v}`;
        if (hasUvs) return `${v}/${v}`;
        if (hasNormals) return `${v}//${v}`;
        return `${v}`;
      };
      faces.push(`f ${f(a)} ${f(b)} ${f(c)}`);
    }
  });

  if (triangles === 0) throw new Error("GLB contains no triangle geometry");
  return { obj: [...lines, ...faces].join("\n") + "\n", triangles };
}

// ─── Binary STL ───────────────────────────────────────────────────────────────

export async function glbToStl(glb: Uint8Array): Promise<{ stl: Buffer; triangles: number }> {
  const doc = await readGlb(glb);
  const vertices: Array<[number, number, number]> = [];
  const tris: Array<[number, number, number]> = [];

  const triangles = walkTriangles(doc, {
    begin() {
      /* STL has no object grouping */
    },
    vertex(p) {
      vertices.push(p);
    },
    face(a, b, c) {
      tris.push([a, b, c]);
    }
  });

  if (triangles === 0) throw new Error("GLB contains no triangle geometry");

  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write("YIIYA binary STL export", 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);

  let off = 84;
  for (const [ia, ib, ic] of tris) {
    const va = vertices[ia];
    const vb = vertices[ib];
    const vc = vertices[ic];
    // Face normal from winding order.
    const ux = vb[0] - va[0], uy = vb[1] - va[1], uz = vb[2] - va[2];
    const vx = vc[0] - va[0], vy = vc[1] - va[1], vz = vc[2] - va[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    let vo = off + 12;
    for (const v of [va, vb, vc]) {
      buf.writeFloatLE(v[0], vo); buf.writeFloatLE(v[1], vo + 4); buf.writeFloatLE(v[2], vo + 8);
      vo += 12;
    }
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }

  return { stl: buf, triangles };
}
