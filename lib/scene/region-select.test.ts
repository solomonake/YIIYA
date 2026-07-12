import { describe, it, expect } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import { computeRegion } from "./region-select";

/**
 * Two clusters of triangles far apart — a click in cluster A must never leak
 * into cluster B (they're not adjacent AND far beyond the radius).
 */
function twoClusterGeometry(): BufferGeometry {
  // Cluster A: two triangles sharing an edge around the origin.
  // Cluster B: one triangle 100 units away.
  const positions = new Float32Array([
    // A - tri 0
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    // A - tri 1 (shares the 1,0,0 / 0,1,0 edge)
    1, 0, 0, 1, 1, 0, 0, 1, 0,
    // B - tri 2 (far away)
    100, 0, 0, 101, 0, 0, 100, 1, 0
  ]);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  return g;
}

describe("computeRegion — geometric part selection", () => {
  it("grows across shared-position adjacency within the radius", () => {
    const g = twoClusterGeometry();
    const region = computeRegion(g, 0, 0.18);
    expect(region).not.toBeNull();
    // Both cluster-A triangles' vertices (6 raw verts, welded positions shared)
    // are in; cluster B's are not.
    const verts = new Set(region!.vertexIndices);
    expect(verts.has(0)).toBe(true); // tri 0
    expect(verts.has(3)).toBe(true); // tri 1
    expect(verts.has(6)).toBe(false); // tri 2 (cluster B)
    expect(verts.has(7)).toBe(false);
  });

  it("never leaks into disconnected distant geometry", () => {
    const g = twoClusterGeometry();
    const region = computeRegion(g, 2, 0.18); // click cluster B
    const verts = new Set(region!.vertexIndices);
    expect(verts.has(6)).toBe(true);
    expect(verts.has(0)).toBe(false);
    expect(verts.has(3)).toBe(false);
  });

  it("returns null for a bogus face index or missing positions", () => {
    const g = twoClusterGeometry();
    expect(computeRegion(g, 999)).toBeNull();
    expect(computeRegion(new BufferGeometry(), 0)).toBeNull();
  });

  it("bounds the region by radius even when connected", () => {
    // A long strip: 20 triangles in a row, each sharing an edge with the next.
    // With a small radius fraction, a click at one end must not select the
    // whole strip.
    const tris: number[] = [];
    for (let i = 0; i < 20; i++) {
      tris.push(i, 0, 0, i + 1, 0, 0, i, 1, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(tris), 3));
    const region = computeRegion(g, 0, 0.1); // 10% of a ~21-unit strip ≈ 2.1 units
    const xs = region!.vertexIndices.map(v => g.getAttribute("position").getX(v));
    expect(Math.max(...xs)).toBeLessThan(6); // stayed local to the click
  });
});
