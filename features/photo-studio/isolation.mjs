// Cut the subject out of a photo taken against a backdrop.
//
// The backdrop is learned from the image perimeter. Each stage below removes
// one way ordinary photos break that assumption; `scripts/evaluate-foreground.mjs`
// measures them one at a time.
export const stages = {
  support: .04, // share of the perimeter a colour needs to count as backdrop
  flood: true,  // drop clutter that enters through the frame edge
  open: .05,    // drop crumbs smaller than this share of the subject's largest part
  holes: .005,  // fill enclosed specks smaller than this share of the subject
  diagonal: true, // corner contact joins subject pixels
};

const dist2 = (data, i, p) => (data[4*i]-p[0])**2 + (data[4*i+1]-p[1])**2 + (data[4*i+2]-p[2])**2;

// Label connected regions of `mask === value`, by edge contact unless `diagonal`.
function regions(mask, width, height, value, diagonal = false) {
  const count = width*height, labels = new Int32Array(count), queue = new Int32Array(count), list = [];
  for (let start = 0; start < count; start++) {
    if (mask[start] !== value || labels[start]) continue;
    const region = {label: list.length+1, area: 0, score: 0, border: false};
    let end = 1; queue[0] = start; labels[start] = region.label;
    for (let pos = 0; pos < end; pos++) {
      const i = queue[pos], x = i % width, y = (i-x)/width;
      region.area++;
      // Central area, so an off-centre subject still beats small clutter.
      region.score += 1.5 - ((x+.5)/width-.5)**2 - ((y+.5)/height-.5)**2;
      if (x === 0 || y === 0 || x === width-1 || y === height-1) region.border = true;
      for (let yy = Math.max(0, y-1); yy <= Math.min(height-1, y+1); yy++) for (let xx = Math.max(0, x-1); xx <= Math.min(width-1, x+1); xx++) {
        if (!diagonal && xx !== x && yy !== y) continue;
        const n = xx + yy*width;
        if (mask[n] === value && !labels[n]) { labels[n] = region.label; queue[end++] = n; }
      }
    }
    region.pixels = queue.slice(0, end);
    list.push(region);
  }
  return {labels, list};
}

// Grow `kept` from `frontier` by edge-adjacent steps, staying inside `allowed`.
function grow(kept, frontier, allowed, width, steps) {
  for (let step = 0; step < steps; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % width;
      for (const n of [x > 0 ? i-1 : -1, x < width-1 ? i+1 : -1, i-width, i+width]) {
        if (n < 0 || n >= kept.length || kept[n] || !allowed[n]) continue;
        kept[n] = 1; next.push(n);
      }
    }
    frontier = next;
  }
}

export function isolateSubject(image, threshold = 32, options = stages) {
  const {width, height, data} = image, count = width*height;
  const mask = new Uint8Array(count);
  if ([0, width-1, count-width, count-1].filter(i => data[4*i+3] < 32).length >= 3) {
    for (let i = 0; i < count; i++) mask[i] = Number(data[4*i+3] > 100);
    return mask;
  }
  // A coarse look at the perimeter decides whether the backdrop is uniform.
  const coarse = [];
  const sample = pixel => {
    const i = 4*pixel, color = [data[i], data[i+1], data[i+2]];
    if (!coarse.some(p => p.every((v, c) => Math.abs(v-color[c]) < 12))) coarse.push(color);
  };
  const step = Math.max(1, Math.floor(Math.min(width, height)/40));
  for (let x = 0; x < width; x += step) { sample(x); sample(count-width+x); }
  for (let y = 0; y < height; y += step) { sample(y*width); sample(y*width+width-1); }
  // A uniform backdrop can contain a subject with disconnected pieces.
  // Preserve all of them, as for transparent input.
  if (coarse.length <= 2) {
    const p = coarse[0], near = coarse.length === 1 ? 12 : 30;
    for (let i = 0; i < count; i++) mask[i] = Number(data[4*i+3] > 100 && Math.sqrt(dist2(data, i, p)) > near);
    return mask;
  }

  // Every perimeter pixel votes, so a colour's share of the frame edge is known.
  let palette = [], rare = [];
  const vote = i => {
    for (const p of palette) if (Math.abs(data[4*i]-p[0]) < 12 && Math.abs(data[4*i+1]-p[1]) < 12 && Math.abs(data[4*i+2]-p[2]) < 12) { p[3]++; return; }
    palette.push([data[4*i], data[4*i+1], data[4*i+2], 1]);
  };
  for (let x = 0; x < width; x++) { vote(x); vote(count-width+x); }
  for (let y = 1; y < height-1; y++) { vote(y*width); vote(y*width+width-1); }
  if (options.support) {
    // Clutter crossing the frame edge is not backdrop. Set aside rare edge
    // colours, unless the common ones explain too little of the perimeter to
    // trust. A rare colour close to a common one is the same backdrop, a
    // little noisier, and stays.
    const votes = palette.reduce((sum, p) => sum + p[3], 0);
    const common = palette.filter(p => p[3] >= options.support*votes);
    const distinct = p => !common.includes(p) && common.every(q => (p[0]-q[0])**2 + (p[1]-q[1])**2 + (p[2]-q[2])**2 > (2*threshold)**2);
    if (common.reduce((sum, p) => sum + p[3], 0) >= .7*votes) { rare = palette.filter(distinct); palette = palette.filter(p => !rare.includes(p)); }
  }
  const limit = threshold**2;
  for (let i = 0; i < count; i++) mask[i] = Number(data[4*i+3] > 100 && !palette.some(p => dist2(data, i, p) < limit));
  if (options.flood && rare.length) {
    // Follow each rare edge colour inward from the perimeter and drop what it
    // reaches. The match is tight so the trail stops at the subject.
    const queue = new Int32Array(count), seen = new Uint8Array(count);
    let end = 0;
    const seed = i => { if (!seen[i] && mask[i] && rare.some(p => dist2(data, i, p) < limit/4)) { seen[i] = 1; queue[end++] = i; } };
    for (let x = 0; x < width; x++) { seed(x); seed(count-width+x); }
    for (let y = 0; y < height; y++) { seed(y*width); seed(y*width+width-1); }
    for (let pos = 0; pos < end; pos++) {
      const i = queue[pos], x = i % width, y = (i-x)/width;
      mask[i] = 0;
      for (let yy = Math.max(0, y-1); yy <= Math.min(height-1, y+1); yy++) for (let xx = Math.max(0, x-1); xx <= Math.min(width-1, x+1); xx++) seed(xx + yy*width);
    }
  }
  const {labels, list} = regions(mask, width, height, 1, Boolean(options.diagonal));
  let winner = null;
  for (const region of list) if (!winner || region.score > winner.score) winner = region;
  for (let i = 0; i < count; i++) mask[i] = Number(Boolean(winner) && labels[i] === winner.label);
  if (!winner) return mask;

  // Specks of glare and print are solid. Larger enclosed gaps stay open:
  // from colour alone a label cannot be told from a handle.
  const solid = [];
  if (options.holes) for (const gap of regions(mask, width, height, 0).list) {
    if (!gap.border && gap.area < options.holes*winner.area) solid.push(gap);
  }
  if (options.open && Math.min(width, height) >= 128) {
    // Shrink the subject by one pixel. Crumbs that fall off were joined only
    // by hairline bridges, so drop them and grow the solid parts back. Skipped
    // on thumbnails, where one pixel is not a hairline.
    const body = mask.slice(), core = new Uint8Array(count), kept = new Uint8Array(count), frontier = [];
    for (let y = 1; y < height-1; y++) for (let x = 1; x < width-1; x++) {
      const i = x + y*width;
      core[i] = mask[i] & mask[i-1] & mask[i+1] & mask[i-width] & mask[i+width];
    }
    const parts = regions(core, width, height, 1).list;
    const largest = parts.reduce((most, part) => Math.max(most, part.area), 0);
    // A subject too thin to survive shrinking is left as it was.
    if (largest) {
      for (const part of parts) if (part.area >= options.open*largest) for (const i of part.pixels) { kept[i] = 1; frontier.push(i); }
      grow(kept, frontier, body, width, 2);
      // Solid gaps rejoin where they touch what was kept, with the thin rims around them.
      const rim = [];
      for (const gap of solid) {
        if (!gap.pixels.some(i => kept[i-1] || kept[i+1] || kept[i-width] || kept[i+width])) continue;
        for (const i of gap.pixels) { kept[i] = 1; rim.push(i); }
      }
      grow(kept, rim, body, width, 2);
      return kept;
    }
  }
  for (const gap of solid) for (const i of gap.pixels) mask[i] = 1;
  return mask;
}
