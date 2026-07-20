import { describe, expect, it } from "vitest";

import { analyzeTappedRegion, isObjectPixel } from "@/lib/vision/mask-region";

/** Build a width x height mask where `rect` pixels get `inside` and the rest `outside`. */
function rectMask(
  width: number,
  height: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  inside: number,
  outside: number
): Uint8Array {
  const mask = new Uint8Array(width * height).fill(outside);
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      mask[y * width + x] = inside;
    }
  }
  return mask;
}

const W = 20;
const H = 20;
const RECT = { x0: 4, y0: 6, x1: 9, y1: 13 }; // 6x8 = 48 px object

describe("analyzeTappedRegion", () => {
  it("finds the object when it is the NONZERO class (naive polarity)", () => {
    const mask = rectMask(W, H, RECT, 255, 0);
    const region = analyzeTappedRegion(mask, W, H, 6, 9); // tap inside

    expect(region).not.toBeNull();
    expect(region!.inverted).toBe(false);
    expect([region!.minX, region!.minY, region!.maxX, region!.maxY]).toEqual([4, 6, 9, 13]);
    expect(region!.area).toBe(48);
  });

  it("finds the object when it is the ZERO class (the production bug)", () => {
    // This is the mask the deployed segmenter actually received: object = 0,
    // background = nonzero. The old `> 0` reading whitened the object and
    // kept the background — the white-silhouette captures.
    const mask = rectMask(W, H, RECT, 0, 255);
    const region = analyzeTappedRegion(mask, W, H, 6, 9);

    expect(region).not.toBeNull();
    expect(region!.inverted).toBe(true);
    expect([region!.minX, region!.minY, region!.maxX, region!.maxY]).toEqual([4, 6, 9, 13]);
    expect(region!.area).toBe(48);
  });

  it("reports the same object for both polarities of the same scene", () => {
    const normal = analyzeTappedRegion(rectMask(W, H, RECT, 255, 0), W, H, 6, 9)!;
    const flipped = analyzeTappedRegion(rectMask(W, H, RECT, 0, 255), W, H, 6, 9)!;

    expect(flipped.minX).toBe(normal.minX);
    expect(flipped.maxY).toBe(normal.maxY);
    expect(flipped.area).toBe(normal.area);
    expect(flipped.centroidX).toBeCloseTo(normal.centroidX, 5);
    expect(flipped.centroidY).toBeCloseTo(normal.centroidY, 5);
  });

  it("computes the centroid of the object, not the background", () => {
    const mask = rectMask(W, H, RECT, 0, 255); // inverted polarity
    const region = analyzeTappedRegion(mask, W, H, 6, 9)!;

    // Object spans x 4..9 (centre 6.5) and y 6..13 (centre 9.5). The old code
    // tracked the background centroid (~frame centre) here, which is what
    // broke orbit tracking.
    expect(region.centroidX).toBeCloseTo(6.5, 5);
    expect(region.centroidY).toBeCloseTo(9.5, 5);
  });

  it("survives a tap on a small hole inside the object via neighborhood vote", () => {
    const mask = rectMask(W, H, RECT, 255, 0);
    mask[9 * W + 6] = 0; // single-pixel hole exactly under the tap
    const region = analyzeTappedRegion(mask, W, H, 6, 9);

    expect(region).not.toBeNull();
    expect(region!.inverted).toBe(false);
    expect(region!.area).toBe(47);
  });

  it("prefers the smaller class on a 50/50 edge tap", () => {
    // A full 5x5 neighborhood casts 25 votes (odd) and can never tie, so a
    // genuine tie needs a CLIPPED neighborhood at the frame border. Tap at
    // (0,1): the window clips to cols 0..2 x rows -1..3 -> 3x4 = 12 votes.
    // Rows 0-1 nonzero, rows 2-3 zero -> 6/6 tie -> the tiebreak must pick
    // the class with the smaller total area (the 2-row nonzero band).
    const mask = new Uint8Array(W * H).fill(0);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < W; x++) mask[y * W + x] = 255; // 40 px nonzero vs 360 zero
    }
    const region = analyzeTappedRegion(mask, W, H, 0, 1);

    expect(region).not.toBeNull();
    expect(region!.inverted).toBe(false); // nonzero band is smaller -> object
    expect(region!.maxY).toBe(1);
    expect(region!.area).toBe(2 * W);
  });

  it("clamps taps outside the frame instead of crashing", () => {
    const mask = rectMask(W, H, { x0: 15, y0: 15, x1: 19, y1: 19 }, 255, 0);
    const region = analyzeTappedRegion(mask, W, H, 25, 25); // beyond bottom-right

    expect(region).not.toBeNull();
    expect(region!.inverted).toBe(false);
  });

  it("returns null for an empty or malformed mask", () => {
    expect(analyzeTappedRegion(new Uint8Array(0), 0, 0, 0, 0)).toBeNull();
    expect(analyzeTappedRegion(new Uint8Array(10), W, H, 5, 5)).toBeNull(); // too short
  });

  it("returns null when the whole frame is one class and the tap picks the empty one", () => {
    // All-nonzero frame: zero class is empty. A tap anywhere votes nonzero,
    // so the object is the full frame — still a valid region.
    const full = new Uint8Array(W * H).fill(255);
    const region = analyzeTappedRegion(full, W, H, 10, 10);
    expect(region).not.toBeNull();
    expect(region!.area).toBe(W * H);
  });
});

describe("isObjectPixel", () => {
  it("respects polarity", () => {
    const normal = analyzeTappedRegion(rectMask(W, H, RECT, 255, 0), W, H, 6, 9)!;
    const flipped = analyzeTappedRegion(rectMask(W, H, RECT, 0, 255), W, H, 6, 9)!;
    const inside = 9 * W + 6;
    const outside = 0;

    expect(isObjectPixel(rectMask(W, H, RECT, 255, 0), inside, normal)).toBe(true);
    expect(isObjectPixel(rectMask(W, H, RECT, 255, 0), outside, normal)).toBe(false);
    expect(isObjectPixel(rectMask(W, H, RECT, 0, 255), inside, flipped)).toBe(true);
    expect(isObjectPixel(rectMask(W, H, RECT, 0, 255), outside, flipped)).toBe(false);
  });
});
