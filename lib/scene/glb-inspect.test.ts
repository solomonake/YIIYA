import { describe, expect, it } from "vitest";

import {
  DEGENERATE_TRIANGLE_LIMIT,
  inspectGlbBuffer,
  inspectGlbUrl,
  MIN_GLB_BYTES
} from "@/lib/scene/glb-inspect";

/** Build a syntactically valid GLB whose JSON chunk is `gltf`. */
function makeGlb(gltf: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const padded = (4 - (json.byteLength % 4)) % 4;
  const chunkLength = json.byteLength + padded;
  const total = 12 + 8 + chunkLength;

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true); // version
  view.setUint32(8, total, true); // total length
  view.setUint32(12, chunkLength, true); // JSON chunk length
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength, 20 + chunkLength); // pad with spaces

  return bytes;
}

/** A single indexed triangle-mesh primitive with `triangles` triangles. */
function meshGltf(
  triangles: number,
  options: {
    attributes?: Record<string, number>;
    mode?: number;
    indexed?: boolean;
    min?: number[];
    max?: number[];
    materials?: number;
    nodes?: unknown[];
    scenes?: unknown[];
  } = {}
) {
  const indexed = options.indexed ?? true;
  const vertexCount = indexed ? triangles * 3 : triangles * 3;

  return {
    scene: 0,
    scenes: options.scenes ?? [{ nodes: [0] }],
    nodes: options.nodes ?? [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            ...(indexed ? { indices: 1 } : {}),
            ...(options.mode !== undefined ? { mode: options.mode } : {}),
            attributes: options.attributes ?? { POSITION: 0 }
          }
        ]
      }
    ],
    accessors: [
      { count: vertexCount, min: options.min ?? [0, 0, 0], max: options.max ?? [1, 1, 1] },
      { count: triangles * 3 }
    ],
    materials: Array.from({ length: options.materials ?? 1 }, () => ({}))
  };
}

/** inspectGlbBuffer enforces a size floor, so tests declare a realistic size. */
const REAL_SIZE = MIN_GLB_BYTES * 10;

describe("inspectGlbBuffer", () => {
  it("rejects a buffer without the glTF magic header", () => {
    const bytes = new Uint8Array(64);
    const result = inspectGlbBuffer(bytes, REAL_SIZE);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/magic mismatch/);
  });

  it("rejects a file below the minimum plausible size", () => {
    const result = inspectGlbBuffer(makeGlb(meshGltf(1000)), 120);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too small/);
  });

  it("counts triangles for an indexed triangle mesh", () => {
    const result = inspectGlbBuffer(makeGlb(meshGltf(1200)), REAL_SIZE);

    expect(result.ok).toBe(true);
    expect(result.geometry?.triangles).toBe(1200);
    expect(result.geometry?.vertices).toBe(3600);
  });

  it("counts triangles for a NON-indexed primitive", () => {
    // The previous inline implementation ignored primitives without an
    // `indices` accessor and reported zero triangles for them.
    const result = inspectGlbBuffer(
      makeGlb(meshGltf(900, { indexed: false })),
      REAL_SIZE
    );

    expect(result.ok).toBe(true);
    expect(result.geometry?.triangles).toBe(900);
  });

  it("honours TRIANGLE_STRIP topology when counting", () => {
    // 300 indices in a strip is 298 triangles, not 100.
    const result = inspectGlbBuffer(makeGlb(meshGltf(100, { mode: 5 })), REAL_SIZE);

    expect(result.ok).toBe(true);
    expect(result.geometry?.triangles).toBe(298);
  });

  it("ignores line and point primitives", () => {
    const result = inspectGlbBuffer(makeGlb(meshGltf(500, { mode: 1 })), REAL_SIZE);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/No triangles/);
  });

  it("flags a degenerate provider placeholder mesh", () => {
    const result = inspectGlbBuffer(
      makeGlb(meshGltf(DEGENERATE_TRIANGLE_LIMIT - 1)),
      REAL_SIZE
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Degenerate mesh/);
    expect(result.geometry?.triangles).toBe(DEGENERATE_TRIANGLE_LIMIT - 1);
  });

  it("detects UV, normal, and vertex-colour attributes", () => {
    const withAttrs = inspectGlbBuffer(
      makeGlb(
        meshGltf(600, {
          attributes: { POSITION: 0, TEXCOORD_0: 0, NORMAL: 0, COLOR_0: 0 }
        })
      ),
      REAL_SIZE
    );

    expect(withAttrs.geometry?.hasUvs).toBe(true);
    expect(withAttrs.geometry?.hasNormals).toBe(true);
    expect(withAttrs.geometry?.hasVertexColors).toBe(true);

    const bare = inspectGlbBuffer(makeGlb(meshGltf(600)), REAL_SIZE);
    expect(bare.geometry?.hasUvs).toBe(false);
    expect(bare.geometry?.hasNormals).toBe(false);
  });

  it("computes bounds from accessor min/max", () => {
    const result = inspectGlbBuffer(
      makeGlb(meshGltf(600, { min: [-1, 0, -1], max: [1, 4, 1] })),
      REAL_SIZE
    );

    expect(result.geometry?.bounds?.size).toEqual([2, 4, 2]);
    expect(result.geometry?.bounds?.maxDimension).toBe(4);
    expect(result.geometry?.bounds?.center).toEqual([0, 2, 0]);
  });

  it("applies node scale when computing world bounds", () => {
    // A 1m cube under a node scaled 10x is a 10m cube in world space.
    // Reading accessor min/max alone would report 1m and break unit inference.
    const result = inspectGlbBuffer(
      makeGlb(
        meshGltf(600, {
          min: [0, 0, 0],
          max: [1, 1, 1],
          nodes: [{ mesh: 0, scale: [10, 10, 10] }]
        })
      ),
      REAL_SIZE
    );

    expect(result.geometry?.bounds?.maxDimension).toBeCloseTo(10, 5);
  });

  it("applies nested parent transforms", () => {
    const result = inspectGlbBuffer(
      makeGlb(
        meshGltf(600, {
          min: [0, 0, 0],
          max: [1, 1, 1],
          scenes: [{ nodes: [0] }],
          nodes: [{ children: [1], scale: [2, 2, 2] }, { mesh: 0, translation: [5, 0, 0] }]
        })
      ),
      REAL_SIZE
    );

    // child translated (5,0,0) then parent-scaled 2x -> spans x from 10 to 12.
    expect(result.geometry?.bounds?.min[0]).toBeCloseTo(10, 5);
    expect(result.geometry?.bounds?.max[0]).toBeCloseTo(12, 5);
  });

  it("reports pivot offset relative to model size", () => {
    const centred = inspectGlbBuffer(
      makeGlb(meshGltf(600, { min: [-1, -1, -1], max: [1, 1, 1] })),
      REAL_SIZE
    );
    expect(centred.geometry?.pivotOffsetRatio).toBeCloseTo(0, 5);

    const offset = inspectGlbBuffer(
      makeGlb(meshGltf(600, { min: [10, 0, 0], max: [11, 1, 1] })),
      REAL_SIZE
    );
    expect(offset.geometry?.pivotOffsetRatio ?? 0).toBeGreaterThan(1);
  });

  it("signals truncation instead of silently skipping the triangle check", () => {
    // A JSON chunk larger than the caller's window must be reported, not
    // treated as a pass with an unknown triangle count.
    const full = makeGlb(meshGltf(1000));
    const partial = full.subarray(0, 40);

    const result = inspectGlbBuffer(partial, REAL_SIZE);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("json_chunk_truncated");
  });
});

describe("inspectGlbUrl", () => {
  function respond(bytes: Uint8Array, totalSize: number) {
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      status: 206,
      headers: { "content-range": `bytes 0-${bytes.byteLength - 1}/${totalSize}` }
    });
  }

  it("rejects the internal placeholder route without fetching", async () => {
    let called = false;
    const result = await inspectGlbUrl("/api/3d/placeholder?x=1", {
      fetchImpl: (async () => {
        called = true;
        return new Response(null);
      }) as unknown as typeof fetch
    });

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Placeholder/);
  });

  it("widens the range request when the JSON chunk overflows the first window", async () => {
    // Pad the glTF so its JSON chunk exceeds the 64KB initial window.
    const big = meshGltf(5000) as Record<string, unknown>;
    big.padding = "x".repeat(70_000);
    const full = makeGlb(big);

    const ranges: number[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const header = (init.headers as Record<string, string>).Range;
      const end = Number(header.match(/bytes=0-(\d+)/)?.[1] ?? 0);
      ranges.push(end + 1);
      return respond(full.subarray(0, Math.min(end + 1, full.byteLength)), full.byteLength);
    }) as unknown as typeof fetch;

    const result = await inspectGlbUrl("https://example.test/model.glb", { fetchImpl });

    expect(ranges.length).toBe(2);
    expect(ranges[1]).toBeGreaterThan(ranges[0]);
    expect(result.ok).toBe(true);
    expect(result.geometry?.triangles).toBe(5000);
  });

  it("returns a structured failure on a transport error", async () => {
    const result = await inspectGlbUrl("https://example.test/model.glb", {
      fetchImpl: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/HTTP 404/);
  });
});
