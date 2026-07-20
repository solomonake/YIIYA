/**
 * Pure mask-region analysis for interactive segmentation.
 *
 * MediaPipe's InteractiveSegmenter category mask does NOT guarantee which
 * value class (0 vs nonzero) is the tapped object — in production the mask
 * came back with the OBJECT as 0 and the background nonzero, while
 * lib/vision/segment.ts assumed the opposite. The result: the capture flow
 * painted the tapped object white and kept the background, so the
 * image-to-3D providers received a white silhouette and faithfully
 * reconstructed a white blob. (Founder screenshot 2026-07-20; the studio
 * ANALYST log described the input as "a completely white silhouette" on "a
 * plain, light beige wall" — background kept, object erased.)
 *
 * Instead of flipping the assumption (which breaks again the next time the
 * model or delegate changes semantics), polarity is decided per invocation
 * from ground truth we always have: THE USER'S TAP IS ON THE OBJECT. The
 * value class at the tap point is the object class.
 *
 * Kept free of DOM/canvas dependencies so it unit-tests in node.
 */

export type MaskRegion = {
  /** True when the object is the mask's ZERO class (i.e. the naive `>0` reading is inverted). */
  inverted: boolean;
  /** Inclusive pixel bounding box of the object class. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Object-class centroid in pixels. */
  centroidX: number;
  centroidY: number;
  /** Object-class pixel count. */
  area: number;
};

type ClassStats = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  count: number;
};

function emptyStats(width: number, height: number): ClassStats {
  return { minX: width, minY: height, maxX: -1, maxY: -1, sumX: 0, sumY: 0, count: 0 };
}

/**
 * Decide which value class the tapped object belongs to and return its
 * bounding box, centroid, and area. Returns null when the chosen class is
 * empty (nothing segmented).
 *
 * @param mask   one byte per pixel, row-major; 0 or nonzero per class
 * @param tapX,tapY  tap position in PIXELS (not normalized)
 */
export function analyzeTappedRegion(
  mask: Uint8Array,
  width: number,
  height: number,
  tapX: number,
  tapY: number
): MaskRegion | null {
  if (width <= 0 || height <= 0 || mask.length < width * height) return null;

  // Single pass: accumulate stats for BOTH classes, then pick.
  const zero = emptyStats(width, height);
  const nonzero = emptyStats(width, height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const stats = mask[row + x] > 0 ? nonzero : zero;
      if (x < stats.minX) stats.minX = x;
      if (x > stats.maxX) stats.maxX = x;
      if (y < stats.minY) stats.minY = y;
      if (y > stats.maxY) stats.maxY = y;
      stats.sumX += x;
      stats.sumY += y;
      stats.count++;
    }
  }

  // Majority vote in a 5x5 neighborhood around the tap. A single-pixel read
  // is fragile — the tap can land on a mask hole, a speckle, or an edge.
  const cx = Math.min(width - 1, Math.max(0, Math.round(tapX)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(tapY)));
  let nonzeroVotes = 0;
  let totalVotes = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      totalVotes++;
      if (mask[y * width + x] > 0) nonzeroVotes++;
    }
  }

  let objectIsNonzero: boolean;
  if (nonzeroVotes * 2 > totalVotes) {
    objectIsNonzero = true;
  } else if (nonzeroVotes * 2 < totalVotes) {
    objectIsNonzero = false;
  } else {
    // Tie (tap exactly on an edge): a tapped object is almost always smaller
    // than the rest of the frame, so prefer the smaller class.
    objectIsNonzero = nonzero.count <= zero.count;
  }

  const object = objectIsNonzero ? nonzero : zero;
  if (object.count === 0 || object.maxX < object.minX || object.maxY < object.minY) {
    return null;
  }

  return {
    inverted: !objectIsNonzero,
    minX: object.minX,
    minY: object.minY,
    maxX: object.maxX,
    maxY: object.maxY,
    centroidX: object.sumX / object.count,
    centroidY: object.sumY / object.count,
    area: object.count
  };
}

/** True when the pixel at `index` belongs to the object class of `region`. */
export function isObjectPixel(mask: Uint8Array, index: number, region: MaskRegion): boolean {
  return region.inverted ? mask[index] === 0 : mask[index] > 0;
}
