/**
 * Lasso selection — closed-path or drag-rectangle marquee that selects every
 * component whose bounding-box center falls inside the gesture.
 *
 * Pure logic; the React surface lives in components/cursor/lasso-overlay.tsx
 * (renders the hairline trail). This file only knows about geometry.
 */
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Path is closed when the head returns within this many pixels of the start. */
export const CLOSE_THRESHOLD_PX = 32;

/**
 * Standard ray-cast point-in-polygon test.
 * Handles concave polygons. Returns true if `p` is strictly inside `poly`.
 */
export function pointInPolygon(p: Point, poly: ReadonlyArray<Point>): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function isClosed(path: ReadonlyArray<Point>): boolean {
  if (path.length < 3) return false;
  const a = path[0];
  const b = path[path.length - 1];
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= CLOSE_THRESHOLD_PX;
}

/** Pick component IDs whose center is inside the given lasso path. */
export function pickComponents(
  components: ReadonlyArray<{ id: string; box: Rect }>,
  path: ReadonlyArray<Point>
): string[] {
  if (!isClosed(path) && path.length < 2) return [];
  const usePolygon = isClosed(path);
  const rect = usePolygon ? null : bboxOf(path);
  const out: string[] = [];
  for (const c of components) {
    const center: Point = { x: c.box.x + c.box.w / 2, y: c.box.y + c.box.h / 2 };
    if (usePolygon ? pointInPolygon(center, path) : pointInRect(center, rect!)) {
      out.push(c.id);
    }
  }
  return out;
}

function bboxOf(path: ReadonlyArray<Point>): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
