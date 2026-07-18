/**
 * GLB inspector.
 *
 * Reads the glTF JSON chunk of a GLB and derives the geometry facts the
 * handoff layer promises: triangle/vertex counts, world-space bounding box,
 * pivot offset, UV/normal presence, and material coverage.
 *
 * This replaces two weaker implementations:
 *  - `meshValidation()` in /api/scene/generate, which returned hardcoded
 *    "planned" placeholders for every check.
 *  - `validateGlbUrl()` in interpret-pipeline.ts, which only counted indexed
 *    primitives and silently skipped the triangle check whenever the JSON
 *    chunk overflowed its fixed 32KB range request.
 *
 * Split into a pure buffer parser (easy to unit test) and a thin URL fetcher.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian
const CHUNK_JSON = 0x4e4f534a; // 'JSON' little-endian

/** Placeholder route returns ~120 bytes; real provider meshes are ≥ 2KB. */
export const MIN_GLB_BYTES = 2048;

/** A mesh under this many triangles is a degenerate provider placeholder. */
export const DEGENERATE_TRIANGLE_LIMIT = 50;

/** Initial range request. Covers the JSON chunk of most assets in one round trip. */
const INITIAL_RANGE_BYTES = 65_536;

/** Hard ceiling on JSON chunk re-fetch, so a hostile header cannot exhaust memory. */
const MAX_JSON_CHUNK_BYTES = 8 * 1024 * 1024;

export type Vec3 = [number, number, number];

export type GlbBounds = {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
  /** Largest dimension, in glTF units (metres, per spec). */
  maxDimension: number;
};

export type GlbGeometry = {
  triangles: number;
  vertices: number;
  meshes: number;
  primitives: number;
  nodes: number;
  materials: number;
  textures: number;
  hasUvs: boolean;
  hasNormals: boolean;
  hasVertexColors: boolean;
  /** Null when no POSITION accessor exposed min/max (rare; spec requires it). */
  bounds: GlbBounds | null;
  /**
   * Bounding-box centre distance from the origin, as a fraction of the
   * largest dimension. ~0 means the pivot sits at the model centre.
   */
  pivotOffsetRatio: number | null;
  /** True when the model rests on or above y=0 within a small tolerance. */
  restsOnGround: boolean | null;
  compression: "draco" | "meshopt" | "none";
};

export type GlbInspection = {
  ok: boolean;
  /** Null when ok; a short human-readable failure otherwise. */
  reason: string | null;
  sizeBytes: number;
  /** Null when the JSON chunk could not be parsed at all. */
  geometry: GlbGeometry | null;
};

type Gltf = {
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }>;
  meshes?: Array<{
    primitives?: Array<{
      indices?: number;
      mode?: number;
      material?: number;
      attributes?: Record<string, number>;
    }>;
  }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  materials?: unknown[];
  textures?: unknown[];
  extensionsUsed?: string[];
};

type Mat4 = number[]; // column-major, 16 entries, per glTF spec

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Compose a node's local matrix from either `matrix` or its TRS properties. */
function localMatrix(node: NonNullable<Gltf["nodes"]>[number]): Mat4 {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return [...node.matrix];
  }

  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];

  // Quaternion -> rotation matrix, then scale each basis column.
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1
  ];
}

function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

/**
 * Triangle count for a primitive, honouring the topology mode.
 * Modes 0-3 are points/lines and contribute no triangles.
 */
function trianglesForMode(mode: number, count: number): number {
  if (count <= 0) return 0;
  switch (mode) {
    case 4: // TRIANGLES
      return Math.floor(count / 3);
    case 5: // TRIANGLE_STRIP
    case 6: // TRIANGLE_FAN
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

/**
 * Parse a GLB buffer. `declaredSize` lets a caller pass the true total file
 * size when `bytes` holds only a leading range slice.
 */
export function inspectGlbBuffer(bytes: Uint8Array, declaredSize?: number): GlbInspection {
  const sizeBytes = declaredSize && declaredSize > 0 ? declaredSize : bytes.byteLength;

  if (bytes.byteLength < 12) {
    return { ok: false, reason: "Truncated GLB header", sizeBytes, geometry: null };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return { ok: false, reason: "Not a valid GLB (magic mismatch)", sizeBytes, geometry: null };
  }

  if (sizeBytes < MIN_GLB_BYTES) {
    return { ok: false, reason: `File too small (${sizeBytes} bytes)`, sizeBytes, geometry: null };
  }

  if (bytes.byteLength < 20) {
    return { ok: false, reason: "Truncated GLB chunk header", sizeBytes, geometry: null };
  }

  const jsonLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);

  if (chunkType !== CHUNK_JSON) {
    return { ok: false, reason: "First GLB chunk is not JSON", sizeBytes, geometry: null };
  }

  if (jsonLength <= 0 || jsonLength > MAX_JSON_CHUNK_BYTES) {
    return { ok: false, reason: "Implausible JSON chunk length", sizeBytes, geometry: null };
  }

  if (bytes.byteLength < 20 + jsonLength) {
    // Caller only holds a partial range; it must widen the request and retry.
    return { ok: false, reason: "json_chunk_truncated", sizeBytes, geometry: null };
  }

  let gltf: Gltf;
  try {
    const json = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
    gltf = JSON.parse(json) as Gltf;
  } catch {
    return { ok: false, reason: "Unparseable glTF JSON chunk", sizeBytes, geometry: null };
  }

  const geometry = readGeometry(gltf);

  if (geometry.triangles > 0 && geometry.triangles < DEGENERATE_TRIANGLE_LIMIT) {
    return {
      ok: false,
      reason: `Degenerate mesh (${geometry.triangles} triangles)`,
      sizeBytes,
      geometry
    };
  }

  if (geometry.triangles === 0) {
    return { ok: false, reason: "No triangles in mesh", sizeBytes, geometry };
  }

  return { ok: true, reason: null, sizeBytes, geometry };
}

function readGeometry(gltf: Gltf): GlbGeometry {
  const accessors = gltf.accessors ?? [];
  const meshes = gltf.meshes ?? [];
  const nodes = gltf.nodes ?? [];

  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  let hasUvs = false;
  let hasNormals = false;
  let hasVertexColors = false;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      primitives += 1;
      const mode = typeof prim.mode === "number" ? prim.mode : 4; // default TRIANGLES
      const attributes = prim.attributes ?? {};

      const positionCount = accessors[attributes.POSITION ?? -1]?.count ?? 0;
      vertices += positionCount;

      // Indexed primitives count via the index accessor; non-indexed ones fall
      // back to the POSITION count. The previous implementation dropped the
      // non-indexed case entirely and reported zero triangles.
      const indexCount =
        typeof prim.indices === "number" ? (accessors[prim.indices]?.count ?? 0) : positionCount;
      triangles += trianglesForMode(mode, indexCount);

      if (attributes.TEXCOORD_0 !== undefined) hasUvs = true;
      if (attributes.NORMAL !== undefined) hasNormals = true;
      if (attributes.COLOR_0 !== undefined) hasVertexColors = true;
    }
  }

  const bounds = computeBounds(gltf, nodes, meshes, accessors);
  const extensions = gltf.extensionsUsed ?? [];

  return {
    triangles,
    vertices,
    meshes: meshes.length,
    primitives,
    nodes: nodes.length,
    materials: (gltf.materials ?? []).length,
    textures: (gltf.textures ?? []).length,
    hasUvs,
    hasNormals,
    hasVertexColors,
    bounds,
    pivotOffsetRatio: bounds ? pivotOffsetRatio(bounds) : null,
    restsOnGround: bounds ? Math.abs(bounds.min[1]) <= bounds.maxDimension * 0.02 : null,
    compression: extensions.includes("KHR_draco_mesh_compression")
      ? "draco"
      : extensions.includes("EXT_meshopt_compression")
        ? "meshopt"
        : "none"
  };
}

/**
 * World-space bounds: walk the node hierarchy so parent transforms are applied.
 * Taking accessor min/max alone would report local-space numbers and make unit
 * inference wrong for any scaled or nested asset.
 */
function computeBounds(
  gltf: Gltf,
  nodes: NonNullable<Gltf["nodes"]>,
  meshes: NonNullable<Gltf["meshes"]>,
  accessors: NonNullable<Gltf["accessors"]>
): GlbBounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let found = false;

  const visit = (nodeIndex: number, parent: Mat4, depth: number) => {
    const node = nodes[nodeIndex];
    if (!node || depth > 64) return; // depth guard against cyclic node graphs

    const world = multiply(parent, localMatrix(node));

    if (typeof node.mesh === "number") {
      for (const prim of meshes[node.mesh]?.primitives ?? []) {
        const accessor = accessors[prim.attributes?.POSITION ?? -1];
        if (!accessor?.min || !accessor?.max) continue;
        if (accessor.min.length < 3 || accessor.max.length < 3) continue;

        const [ax, ay, az] = accessor.min as Vec3;
        const [bx, by, bz] = accessor.max as Vec3;

        // Transform all 8 corners: rotation can swing the extents outward.
        for (const corner of [
          [ax, ay, az],
          [bx, ay, az],
          [ax, by, az],
          [ax, ay, bz],
          [bx, by, az],
          [bx, ay, bz],
          [ax, by, bz],
          [bx, by, bz]
        ] as Vec3[]) {
          const p = transformPoint(world, corner);
          for (let i = 0; i < 3; i += 1) {
            if (p[i] < min[i]) min[i] = p[i];
            if (p[i] > max[i]) max[i] = p[i];
          }
          found = true;
        }
      }
    }

    for (const child of node.children ?? []) {
      visit(child, world, depth + 1);
    }
  };

  const sceneIndex = typeof gltf.scene === "number" ? gltf.scene : 0;
  const roots = gltf.scenes?.[sceneIndex]?.nodes ?? nodes.map((_, index) => index);
  for (const root of roots) {
    visit(root, IDENTITY, 0);
  }

  if (!found) return null;

  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  return {
    min,
    max,
    size,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    maxDimension: Math.max(size[0], size[1], size[2])
  };
}

function pivotOffsetRatio(bounds: GlbBounds): number | null {
  if (bounds.maxDimension <= 0) return null;
  const [cx, cy, cz] = bounds.center;
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / bounds.maxDimension;
}

/**
 * Fetch just enough of a remote GLB to inspect it.
 *
 * Issues a ranged request first, then widens it once if the JSON chunk turned
 * out to be larger than the initial window.
 */
export async function inspectGlbUrl(
  url: string,
  options: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    /** Extra request headers, e.g. provider auth for gated model hosts. */
    headers?: Record<string, string>;
  } = {}
): Promise<GlbInspection> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const doFetch = options.fetchImpl ?? fetch;
  const extraHeaders = options.headers ?? {};

  // Our own placeholder route is intentionally tiny; never treat it as a mesh.
  if (url.startsWith("/api/3d/placeholder") || url.includes("/placeholder?")) {
    return { ok: false, reason: "Placeholder URL", sizeBytes: 0, geometry: null };
  }

  const read = async (upTo: number) => {
    const res = await doFetch(url, {
      headers: { Range: `bytes=0-${upTo - 1}`, ...extraHeaders },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP ${res.status}`);
    }
    const contentRange = res.headers.get("content-range");
    const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
    const declaredSize = totalFromRange
      ? Number(totalFromRange)
      : Number(res.headers.get("content-length") ?? 0);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      declaredSize
    };
  };

  try {
    const first = await read(INITIAL_RANGE_BYTES);
    const initial = inspectGlbBuffer(first.bytes, first.declaredSize);

    if (initial.reason !== "json_chunk_truncated") {
      return initial;
    }

    // The JSON chunk overran the first window. Re-request exactly enough.
    const view = new DataView(
      first.bytes.buffer,
      first.bytes.byteOffset,
      first.bytes.byteLength
    );
    const needed = 20 + view.getUint32(12, true);
    if (needed > MAX_JSON_CHUNK_BYTES) {
      return {
        ok: false,
        reason: "glTF JSON chunk exceeds inspection limit",
        sizeBytes: first.declaredSize || first.bytes.byteLength,
        geometry: null
      };
    }

    const second = await read(needed);
    return inspectGlbBuffer(second.bytes, second.declaredSize || first.declaredSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message.slice(0, 120), sizeBytes: 0, geometry: null };
  }
}
