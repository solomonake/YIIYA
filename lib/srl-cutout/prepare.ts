import type { ReferenceImage } from "@/lib/store";
import weights from "./model.json";
import { chooseMask } from "./select.mjs";
import { isolateSubject } from "./isolation.mjs";

export async function prepareCutout(original: ReferenceImage): Promise<ReferenceImage> {
  const image = new Image();
  image.src = "data:" + original.mediaType + ";base64," + original.base64;
  await image.decode();
  function surface(limit: number) {
    const ratio = Math.min(1, limit / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(image.width*ratio));
    canvas.height = Math.max(1,Math.round(image.height*ratio));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Could not open this photo.");
    return {canvas, context};
  }
  const small = surface(224);
  small.context.drawImage(image,0,0,small.canvas.width,small.canvas.height);
  const pixels = small.context.getImageData(0,0,small.canvas.width,small.canvas.height);
  const {mask} = chooseMask(pixels,isolateSubject,weights);
  let kept = 0;
  for(let i=0;i<mask.length;i++) {
    kept += mask[i];
    pixels.data[4*i+3] = mask[i] ? pixels.data[4*i+3] : 0;
  }
  if (kept < mask.length*.006 || kept > mask.length*.92) throw Error("Couldn’t isolate the object. The original photo is still selected.");
  small.context.putImageData(pixels,0,0);
  const large = surface(1024);
  large.context.drawImage(image,0,0,large.canvas.width,large.canvas.height);
  large.context.globalCompositeOperation = "destination-in";
  large.context.drawImage(small.canvas,0,0,large.canvas.width,large.canvas.height);
  const previewUrl = large.canvas.toDataURL("image/png");
  return {...original, mediaType:"image/png", base64:previewUrl.split(",")[1], previewUrl};
}
