// Where to look again when the subject is small in the photo.
//
// Returns the subject's bounding box plus a margin, as fractions of the image,
// or null when the subject already fills most of the frame. Cutting out a
// closer crop gives the outline more pixels and a backdrop sampled beside it.
export function subjectFrame(mask, width, height, margin = .18, fills = .6) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[x + y*width]) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return null;
  const w = right-left+1, h = bottom-top+1;
  if (Math.max(w/width, h/height) >= fills) return null;
  const pad = margin*Math.max(w, h);
  const x0 = Math.max(0, left-pad), y0 = Math.max(0, top-pad);
  const x1 = Math.min(width, right+1+pad), y1 = Math.min(height, bottom+1+pad);
  return {x: x0/width, y: y0/height, width: (x1-x0)/width, height: (y1-y0)/height};
}

// Whether a cutout is usable: not a speck, and not the whole frame.
export function plausible(mask) {
  let area = 0;
  for (let i = 0; i < mask.length; i++) area += mask[i];
  return area >= .006*mask.length && area <= .92*mask.length;
}
