import { describe, expect, it } from "vitest";
import { isClosed, pickComponents, pointInPolygon, pointInRect } from "./lasso";

describe("lasso geometry", () => {
  it("point-in-rect basic", () => {
    expect(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(pointInRect({ x: 15, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("point-in-polygon for a square", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 }
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
  });

  it("detects closed paths within threshold", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
      { x: 20, y: 20 }
    ];
    expect(isClosed(path)).toBe(true);
  });

  it("picks components inside a marquee", () => {
    const components = [
      { id: "a", box: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "b", box: { x: 50, y: 50, w: 10, h: 10 } }
    ];
    // Drag rectangle from (0,0) to (20,20).
    const ids = pickComponents(components, [
      { x: 0, y: 0 },
      { x: 20, y: 20 }
    ]);
    expect(ids).toEqual(["a"]);
  });
});
