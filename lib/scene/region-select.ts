import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";
import { BufferAttribute, Color, Vector3 } from "three";

/**
 * Geometric part selection for generated meshes — the "make THIS wheel chrome"
 * primitive.
 *
 * Provider GLBs arrive as a single fused primitive with no part nodes or
 * names (verified 2026-07-10 against real Tripo/Hunyuan outputs), so part
 * targeting can't use scene structure. Instead: the user clicks the mesh,
 * we BFS outward from the hit triangle over shared-position adjacency, and
 * accept triangles whose centroid stays within a radius proportional to the
 * mesh's bounding sphere. The result is a vertex set we can tint via vertex
 * colors — instant, free, reversible, no provider involvement.
 */

export type Region = {
  /** Indices into the geometry's position attribute (expanded, per-vertex). */
  vertexIndices: number[];
  /** World-space-ish (object-local) seed point the region grew from. */
  seed: [number, number, number];
};

/** Quantized position key so split vertices at the same point weld together. */
function posKey(x: number, y: number, z: number): string {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
}

/**
 * Grow a region from a hit triangle. `radiusFraction` bounds the region to a
 * fraction of the geometry's bounding-sphere diameter (default 18% — about
 * "a wheel of a car", tuned for the click-a-part use case).
 */
export function computeRegion(
  geometry: BufferGeometry,
  faceIndex: number,
  radiusFraction = 0.18
): Region | null {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (faceIndex < 0 || faceIndex >= triCount) return null;

  const vert = (tri: number, corner: number): number =>
    index ? index.getX(tri * 3 + corner) : tri * 3 + corner;

  // Adjacency via shared quantized positions: two triangles are neighbors if
  // they share at least one welded vertex position.
  const keyToTris = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const v = vert(t, c);
      const k = posKey(pos.getX(v), pos.getY(v), pos.getZ(v));
      const arr = keyToTris.get(k);
      if (arr) arr.push(t);
      else keyToTris.set(k, [t]);
    }
  }

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const diameter = (geometry.boundingSphere?.radius ?? 1) * 2;
  const maxDist = diameter * radiusFraction;

  // Seed = centroid of the clicked triangle.
  const seed = new Vector3();
  for (let c = 0; c < 3; c++) {
    const v = vert(faceIndex, c);
    seed.x += pos.getX(v) / 3;
    seed.y += pos.getY(v) / 3;
    seed.z += pos.getZ(v) / 3;
  }

  const visited = new Set<number>([faceIndex]);
  const queue: number[] = [faceIndex];
  const centroid = new Vector3();

  while (queue.length > 0) {
    const t = queue.pop() as number;
    for (let c = 0; c < 3; c++) {
      const v = vert(t, c);
      const k = posKey(pos.getX(v), pos.getY(v), pos.getZ(v));
      for (const n of keyToTris.get(k) ?? []) {
        if (visited.has(n)) continue;
        centroid.set(0, 0, 0);
        for (let nc = 0; nc < 3; nc++) {
          const nv = vert(n, nc);
          centroid.x += pos.getX(nv) / 3;
          centroid.y += pos.getY(nv) / 3;
          centroid.z += pos.getZ(nv) / 3;
        }
        if (centroid.distanceTo(seed) > maxDist) continue;
        visited.add(n);
        queue.push(n);
      }
    }
  }

  const vertexIndices: number[] = [];
  const seen = new Set<number>();
  Array.from(visited).forEach((t) => {
    for (let c = 0; c < 3; c++) {
      const v = vert(t, c);
      if (!seen.has(v)) {
        seen.add(v);
        vertexIndices.push(v);
      }
    }
  });

  return { vertexIndices, seed: [seed.x, seed.y, seed.z] };
}

const HIGHLIGHT = new Color("#d9a13c");

/**
 * Tints a region via vertex colors, initializing the color attribute to white
 * on first use (white multiplies to identity against any base texture).
 * Pass `color` = null to paint the amber selection highlight.
 */
export function tintRegion(mesh: Mesh, region: Region, color: string | null): void {
  const geometry = mesh.geometry as BufferGeometry;
  const pos = geometry.getAttribute("position");
  if (!pos) return;

  let colors = geometry.getAttribute("color");
  if (!colors || colors.itemSize !== 3) {
    const arr = new Float32Array(pos.count * 3).fill(1);
    geometry.setAttribute("color", new BufferAttribute(arr, 3));
    colors = geometry.getAttribute("color");
  }

  const target = color ? new Color(color) : HIGHLIGHT;
  for (const v of region.vertexIndices) {
    colors.setXYZ(v, target.r, target.g, target.b);
  }
  colors.needsUpdate = true;

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    const sm = m as MeshStandardMaterial;
    if (sm && "vertexColors" in sm && !sm.vertexColors) {
      sm.vertexColors = true;
      sm.needsUpdate = true;
    }
  }
}

/** Resets every vertex color to white (identity) — clears highlight + tints. */
export function clearAllTints(mesh: Mesh): void {
  const geometry = mesh.geometry as BufferGeometry;
  const colors = geometry.getAttribute("color");
  if (!colors) return;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
  colors.needsUpdate = true;
}
