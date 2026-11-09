// Foreground isolation benchmark for the on-device Photo Studio.
//
// Scores each cutout variant on real turntable photographs against the
// publisher's masks, then carves the two-photo mesh from the 0° and 90° cutouts
// and scores its outline at the 21° and 69° views neither cutout saw.
//
//   node scripts/evaluate-foreground.mjs [data-root] [--baseline origin/main] [--out report.json] [--sheet sheet.png]
//
// The data root holds the YCB files as delivery round 16 stored them:
//   <root>/<object>/rgb_highres/N1_<deg>.jpg   photograph
//   <root>/<object>/truth-<deg>.mask           224x224 bytes, publisher mask in the crop frame
// `crop` frames the object as a careful visitor would. `full` is the whole
// 4272x2848 photograph, where the object is small and the rig is in view.
import sharp from "sharp";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";
import {isolateSubject, stages} from "../features/photo-studio/isolation.mjs";
import {chooseMask} from "../features/photo-studio/support/select.mjs";
import {subjectFrame, plausible} from "../features/photo-studio/frame.mjs";
import {readSilhouette} from "../features/photo-studio/shape.mjs";
import {refineMesh} from "../features/photo-studio/refine.mjs";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const out = flag("--out"), sheet = flag("--sheet"), baseline = flag("--baseline") || "origin/main";
const root = args[0] || "/tmp/yiiya-r16-ycb";
const repo = new URL("..", import.meta.url).pathname;
const weights = JSON.parse(readFileSync(new URL("../features/photo-studio/support/model.json", import.meta.url)));
const S = 224;
// Fixed square crops from round 16.
const objects = {
  "003_cracker_box": {left: 1330, top: 100, width: 2500, height: 2500},
  "025_mug": {left: 1650, top: 1320, width: 1060, height: 1060},
  "035_power_drill": {left: 1380, top: 680, width: 1700, height: 1700},
};
const fitAngles = [0, 90], heldOut = [21, 69], all = [0, 21, 45, 69, 90];

// The cutout and its mask-choice weights as shipped on the baseline ref, read
// from git so the comparison is reproducible.
const show = path => execFileSync("git", ["-C", repo, "show", `${baseline}:features/photo-studio/${path}`]);
const old = join(mkdtempSync(join(tmpdir(), "yiiya-foreground-")), "isolation.mjs");
writeFileSync(old, show("isolation.mjs"));
const {isolateSubject: shipped} = await import(pathToFileURL(old).href);
const shippedWeights = JSON.parse(show("support/model.json"));

const without = stage => (image, threshold) => isolateSubject(image, threshold, {...stages, [stage]: 0});
const variants = {
  shipped: {isolate: shipped, weights: shippedWeights},
  candidate: {isolate: isolateSubject},
  "candidate, reframed": {isolate: isolateSubject, reframe: true},
  "without support": {isolate: without("support")},
  "without diagonal": {isolate: without("diagonal")},
  "without flood": {isolate: without("flood")},
  "without open": {isolate: without("open")},
  "without holes": {isolate: without("holes")},
  "without mask choice": {isolate: isolateSubject, plain: true},
};

// A preview of `region` (raw pixels) no larger than 224 on a side, as the studio draws it.
async function preview(obj, deg, region) {
  // The whole photo is resized straight from the file, as round 16 did, so its baseline reproduces.
  let picture = sharp(`${root}/${obj}/rgb_highres/N1_${deg}.jpg`);
  if (!region.whole) picture = picture.extract({left: region.left, top: region.top, width: region.width, height: region.height});
  const {data, info} = await picture
    .resize({width: S, height: S, fit: "inside", withoutEnlargement: true}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {pixels: {data, width: info.width, height: info.height}, toRaw: region.width/info.width, left: region.left, top: region.top};
}
async function cutout(obj, deg, mode, variant, size) {
  const cut = image => variant.plain ? variant.isolate(image) : chooseMask(image, variant.isolate, variant.weights || weights).mask;
  const whole = mode === "crop" ? objects[obj] : {left: 0, top: 0, width: size.width, height: size.height, whole: true};
  let view = await preview(obj, deg, whole), ms = 0;
  let start = performance.now();
  view.mask = cut(view.pixels);
  ms += performance.now() - start;
  const frame = variant.reframe && subjectFrame(view.mask, view.pixels.width, view.pixels.height);
  if (frame) {
    const region = {
      left: Math.round(whole.left + frame.x*whole.width), top: Math.round(whole.top + frame.y*whole.height),
      width: Math.max(1, Math.round(frame.width*whole.width)), height: Math.max(1, Math.round(frame.height*whole.height)),
    };
    const closer = await preview(obj, deg, region);
    start = performance.now();
    closer.mask = cut(closer.pixels);
    ms += performance.now() - start;
    if (plausible(closer.mask)) view = closer;
  }
  return {...view, ms};
}
const truth = (obj, deg) => readFileSync(`${root}/${obj}/truth-${deg}.mask`);
// Resample a preview mask into the 224x224 crop frame the publisher masks use.
function toCropFrame(view, roi) {
  const result = new Uint8Array(S*S), {pixels, mask, toRaw, left, top} = view;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = Math.floor((roi.left + (x+.5)*roi.width/S - left)/toRaw), v = Math.floor((roi.top + (y+.5)*roi.height/S - top)/toRaw);
    if (u >= 0 && u < pixels.width && v >= 0 && v < pixels.height) result[x + y*S] = mask[u + v*pixels.width];
  }
  return result;
}
function iou(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) { both += Number(a[i] > 0 && b[i] > 0); either += Number(a[i] > 0 || b[i] > 0); }
  return either ? both/either : 0;
}
// Orthographic outline of the mesh turned by `deg`, in the crop frame.
function render(mesh, deg, scale, cx, cy) {
  const mask = new Uint8Array(S*S);
  const pos = mesh.geometry.attributes.position.array, r = deg*Math.PI/180, c = Math.cos(r), s = Math.sin(r);
  for (let i = 0; i < pos.length; i += 9) {
    const xs = [], ys = [];
    for (let j = i; j < i+9; j += 3) { xs.push(cx + scale*(pos[j]*c - pos[j+2]*s)); ys.push(cy - scale*pos[j+1]); }
    const min = Math.max(0, Math.ceil(Math.min(...ys))), max = Math.min(S-1, Math.floor(Math.max(...ys)));
    for (let v = min; v <= max; v++) {
      const hits = [];
      for (let j = 0; j < 3; j++) {
        const k = (j+1)%3;
        if ((ys[j] <= v && ys[k] > v) || (ys[k] <= v && ys[j] > v)) hits.push(xs[j] + (xs[k]-xs[j])*(v-ys[j])/(ys[k]-ys[j]));
      }
      if (hits.length !== 2) continue;
      const left = Math.max(0, Math.ceil(Math.min(...hits))), right = Math.min(S-1, Math.floor(Math.max(...hits)));
      if (right >= left) mask.fill(1, v*S + left, v*S + right + 1);
    }
  }
  return mask;
}

const rows = [], tiles = [], sheetMode = process.env.SHEET_PROTOCOL || "crop";
for (const [obj, roi] of Object.entries(objects)) {
  const size = await sharp(`${root}/${obj}/rgb_highres/N1_0.jpg`).metadata();
  const backdrop = {};
  for (const deg of all) backdrop[deg] = (await preview(obj, deg, roi)).pixels;
  for (const mode of ["crop", "full"]) for (const [name, variant] of Object.entries(variants)) {
    const row = {object: obj, protocol: mode, variant: name, mask: {}, heldOut: {}, error: null};
    const views = {};
    let spent = 0;
    for (const deg of all) {
      const view = views[deg] = await cutout(obj, deg, mode, variant, size);
      spent += view.ms;
      const framed = toCropFrame(view, roi);
      row.mask[deg] = iou(framed, truth(obj, deg));
      if (sheet && mode === sheetMode) tiles.push({obj, name, deg, framed, pixels: backdrop[deg]});
    }
    row.maskMean = all.reduce((sum, deg) => sum + row.mask[deg], 0)/all.length;
    row.isolateMs = spent/all.length;
    try {
      const [front, right] = fitAngles.map(deg => readSilhouette(views[deg].pixels, views[deg].mask));
      const {mesh} = refineMesh(front, right, Infinity, null);
      // The mesh is centred on the front outline's box and scaled by its height.
      const view = views[0], perCrop = S/roi.width, height = 1.72/Math.max(1, front.aspect, right.aspect);
      const scale = (front.bottom-front.top)*view.toRaw*perCrop/height;
      const cx = ((front.left+front.right)/2*view.toRaw + view.left - roi.left)*perCrop;
      const cy = ((front.top+front.bottom)/2*view.toRaw + view.top - roi.top)*perCrop;
      for (const deg of heldOut) row.heldOut[deg] = iou(render(mesh, deg, scale, cx, cy), truth(obj, deg));
      row.heldOutMean = heldOut.reduce((sum, deg) => sum + row.heldOut[deg], 0)/heldOut.length;
      row.triangles = mesh.geometry.attributes.position.count/3;
    } catch (e) { row.heldOutMean = 0; row.error = e.message; }
    rows.push(row);
  }
}

const summary = {};
for (const row of rows) {
  const p = (summary[row.variant] ||= {})[row.protocol] ||= {mask: [], heldOut: [], ms: []};
  p.mask.push(row.maskMean); p.heldOut.push(row.heldOutMean); p.ms.push(row.isolateMs);
}
const mean = list => list.reduce((a, b) => a + b, 0)/list.length;
console.log("variant".padEnd(22), "protocol", "mask IoU", "worst ", "held-out", "worst ", "ms/photo");
for (const [variant, protocols] of Object.entries(summary)) for (const [protocol, p] of Object.entries(protocols)) {
  Object.assign(p, {maskMean: mean(p.mask), maskWorst: Math.min(...p.mask), heldOutMean: mean(p.heldOut), heldOutWorst: Math.min(...p.heldOut), msMean: mean(p.ms)});
  console.log(variant.padEnd(22), protocol.padEnd(8), p.maskMean.toFixed(4).padEnd(8), p.maskWorst.toFixed(4), p.heldOutMean.toFixed(4).padEnd(8), p.heldOutWorst.toFixed(4), p.msMean.toFixed(1));
}
if (out) writeFileSync(out, JSON.stringify({root, baseline, size: S, fitAngles, heldOut, stages, summary, rows}, null, 2) + "\n");
if (sheet) {
  // One row per object and variant, one column per angle. The cutout keeps the
  // photo's colours; green is object the cutout missed, blue is extra.
  const names = Object.keys(variants).filter(name => (process.env.SHEET_VARIANTS || "shipped,candidate").split(",").includes(name));
  const width = all.length*S, height = Object.keys(objects).length*names.length*S;
  const canvas = Buffer.alloc(width*height*3);
  for (const {obj, name, deg, framed, pixels} of tiles) {
    if (!names.includes(name)) continue;
    const reference = truth(obj, deg), ox = all.indexOf(deg)*S, oy = (Object.keys(objects).indexOf(obj)*names.length + names.indexOf(name))*S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = x + y*S, j = 3*(ox + x + (oy + y)*width);
      const rgb = [0, 1, 2].map(c => pixels.data[4*i + c]);
      const shade = framed[i] && reference[i] ? rgb : framed[i] ? [60, 110, 255] : reference[i] ? [40, 255, 80] : rgb.map(v => v*.3);
      canvas[j] = shade[0]; canvas[j+1] = shade[1]; canvas[j+2] = shade[2];
    }
  }
  await sharp(canvas, {raw: {width, height, channels: 3}}).png().toFile(sheet);
}
