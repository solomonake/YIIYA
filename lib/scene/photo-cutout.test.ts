import { describe, expect, it } from "vitest";
import { isolateSubject, stages } from "../../features/photo-studio/isolation.mjs";
import { isolateSubject as classic } from "../../features/photo-studio/isolation-classic.mjs";
import { plausible, subjectFrame } from "../../features/photo-studio/frame.mjs";

type Rgb = [number, number, number];
const size = 160;
// A lightbox backdrop: grey that brightens down the frame, so it is not one flat colour.
const backdrop = (_x: number, y: number): Rgb => { const v = 190 + Math.round(50 * y / size); return [v, v, v]; };
const red: Rgb = [190, 40, 30], black: Rgb = [12, 12, 12];

function paint(side: number, color: (x: number, y: number) => Rgb, alpha: (x: number, y: number) => number = () => 255) {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) data.set([...color(x, y), alpha(x, y)], 4 * (x + y * side));
  return { width: side, height: side, data };
}
const inBox = (x: number, y: number, left: number, top: number, right: number, bottom: number) => x >= left && x < right && y >= top && y < bottom;
const at = (mask: Uint8Array, x: number, y: number, side = size) => mask[x + y * side];
const area = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0);

describe("isolateSubject", () => {
  it("uses the alpha channel of a transparent image", () => {
    const image = paint(40, () => red, (x, y) => inBox(x, y, 10, 10, 30, 30) ? 255 : 0);
    expect(area(isolateSubject(image))).toBe(400);
  });

  it("keeps every piece of a subject on a flat backdrop", () => {
    const image = paint(size, (x, y) => inBox(x, y, 30, 60, 60, 100) || inBox(x, y, 100, 60, 130, 100) ? red : [240, 240, 240]);
    const mask = isolateSubject(image);
    expect(at(mask, 45, 80)).toBe(1);
    expect(at(mask, 115, 80)).toBe(1);
    expect(area(mask)).toBe(2400);
  });

  // A red tool with a black head, and a black strip of clutter entering from the left edge.
  const tool = paint(size, (x, y) =>
    inBox(x, y, 60, 50, 100, 120) ? red : inBox(x, y, 60, 30, 100, 50) ? black : inBox(x, y, 0, 130, 30, 150) ? black : backdrop(x, y));

  it("keeps a subject colour that also appears in clutter at the frame edge", () => {
    const mask = isolateSubject(tool);
    expect(at(mask, 80, 40)).toBe(1);
    expect(at(mask, 80, 90)).toBe(1);
    expect(at(mask, 10, 140)).toBe(0);
    expect(area(mask)).toBe(40 * 90);
    // The first release learned black as backdrop from the frame edge and lost the head.
    expect(at(classic(tool), 80, 40)).toBe(0);
  });

  it("leaves the subject alone when the frame edge is too mixed to trust", () => {
    // Half the perimeter is a second backdrop colour: both stay backdrop.
    const image = paint(size, (x, y) => inBox(x, y, 60, 50, 100, 120) ? red : x < 80 ? backdrop(x, y) : [90, 120, 160]);
    expect(area(isolateSubject(image))).toBe(40 * 70);
  });

  // The subject, plus a checker of squares that meet only at their corners and touch it at one.
  const checker = (x: number, y: number) => inBox(x, y, 100, 100, 124, 124) && (Math.floor((x - 100) / 8) + Math.floor((y - 100) / 8)) % 2 === 0;
  const bridged = paint(size, (x, y) => inBox(x, y, 60, 50, 100, 100) || checker(x, y) ? red : backdrop(x, y));

  it("drops crumbs that hang on by a corner", () => {
    const mask = isolateSubject(bridged);
    expect(area(mask)).toBe(40 * 50);
    expect(at(mask, 103, 103)).toBe(0);
    expect(area(isolateSubject(bridged, 32, { ...stages, open: 0 }))).toBeGreaterThan(40 * 50);
  });

  it("does not shrink thumbnails, where a pixel is not a hairline", () => {
    const small = paint(64, (x, y) => inBox(x, y, 20, 20, 40, 40) || inBox(x, y, 40, 40, 44, 44) ? red : backdrop(x, y * size / 64));
    expect(area(isolateSubject(small))).toBe(400 + 16);
  });

  it("keeps a subject too thin to shrink", () => {
    const wire = paint(size, (x, y) => inBox(x, y, 40, 80, 120, 81) ? red : backdrop(x, y));
    expect(area(isolateSubject(wire))).toBe(80);
  });

  it("fills specks and keeps real openings", () => {
    // A frame with a large opening and a two-pixel glint of backdrop colour in its rim.
    const image = paint(size, (x, y) => {
      if (inBox(x, y, 70, 60, 110, 100) || inBox(x, y, 50, 46, 52, 47)) return backdrop(x, y);
      return inBox(x, y, 40, 40, 140, 120) ? red : backdrop(x, y);
    });
    const mask = isolateSubject(image);
    expect(at(mask, 50, 46)).toBe(1);
    expect(at(mask, 90, 80)).toBe(0);
    expect(area(mask)).toBe(100 * 80 - 40 * 40);
  });
});

describe("subjectFrame", () => {
  const mask = (left: number, top: number, right: number, bottom: number) => {
    const result = new Uint8Array(200 * 100);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) result[x + y * 200] = 1;
    return result;
  };

  it("frames a small subject with a margin, as fractions of the image", () => {
    const frame = subjectFrame(mask(90, 40, 110, 60), 200, 100, .5);
    expect(frame).toEqual({ x: .4, y: .3, width: .2, height: .4 });
  });

  it("stays inside the image", () => {
    const frame = subjectFrame(mask(0, 0, 20, 20), 200, 100, .5)!;
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.width).toBeCloseTo(.15);
    expect(frame.height).toBeCloseTo(.3);
  });

  it("returns nothing when the subject already fills the frame or is absent", () => {
    expect(subjectFrame(mask(20, 10, 180, 80), 200, 100)).toBeNull();
    expect(subjectFrame(new Uint8Array(200 * 100), 200, 100)).toBeNull();
  });

  it("rejects cutouts that are a speck or the whole frame", () => {
    expect(plausible(mask(0, 0, 10, 10))).toBe(false);
    expect(plausible(mask(0, 0, 200, 100))).toBe(false);
    expect(plausible(mask(50, 20, 150, 80))).toBe(true);
  });
});
