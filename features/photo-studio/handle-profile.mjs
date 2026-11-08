// Recover the half of a closed handle facing away from the body. Keep the
// visitor's two sockets as anchors when joining it to the cup.
export function traceHandle(mask, width, height, front) {
  const {centerX, outerRadius, baseRadius, top, base, handle, handleRadius} = front;
  const [upper, , far, , lower] = handle;
  const side = Math.sign(far[0] - centerX);
  const midY = (upper[1] + lower[1]) / 2;
  const bodyEdge = centerX + side * (outerRadius + (baseRadius - outerRadius) * (midY - top) / (base - top));
  let x = Math.round((bodyEdge + far[0]) / 2);
  const y = Math.round(midY);
  while(mask[x + y * width] && side*(x-bodyEdge)>1)x-=side;
  if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1 || mask[x + y * width]) return null;
  const queue = [x + y * width], seen = new Uint8Array(width * height);
  seen[queue[0]] = 1;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], u = p % width, v = Math.floor(p / width);
    if (u === 0 || v === 0 || u === width - 1 || v === height - 1) return null;
    sumX += u; sumY += v;
    for (const n of [p - 1, p + 1, p - width, p + width]) {
      if (!mask[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  if (queue.length < 12) return null;
  const exterior = new Uint8Array(width*height), border = [];
  function addBorder(n){if(!mask[n] && !exterior[n]){exterior[n]=1;border.push(n);}}
  for(let u=0;u<width;u++){addBorder(u);addBorder((height-1)*width+u);}
  for(let v=0;v<height;v++){addBorder(v*width);addBorder(v*width+width-1);}
  for(let i=0;i<border.length;i++){
    const n=border[i],u=n%width,v=Math.floor(n/width);
    if(u>0)addBorder(n-1);if(u+1<width)addBorder(n+1);
    if(v>0)addBorder(n-width);if(v+1<height)addBorder(n+width);
  }
  const cx = sumX / queue.length, cy = sumY / queue.length;
  const points = [upper], radii = [handleRadius];
  const limit = Math.ceil(Math.hypot(far[0] - bodyEdge, lower[1] - upper[1]) + 4 * handleRadius);
  for (let angle = -90; angle <= 90; angle += 15) {
    const a = angle * Math.PI / 180, dx = Math.cos(a) * side, dy = Math.sin(a);
    let near = -1, end = -1;
    for (let t = 0; t <= limit; t += 0.5) {
      const u = Math.round(cx + t * dx), v = Math.round(cy + t * dy);
      if (u < 0 || u >= width || v < 0 || v >= height) break;
      const inside = mask[u + v * width];
      if (near < 0 && inside) near = t;
      if (near >= 0 && exterior[u + v * width]) { end = t; break; }
    }
    if (near < 0 || end < near + 1 || end - near > handleRadius * 5) return null;
    const center = (near + end) / 2;
    points.push([cx + dx * center, cy + dy * center]);
    radii.push(Math.min(handleRadius * 1.3, Math.max(handleRadius * .55, (end - near) * .42)));
  }
  points.push(lower); radii.push(handleRadius);
  return {points, radii};
}


// A saturated handle on a neutral backdrop can share little RGB contrast with
// its own shadow. Hue separates it from that shadow without an extra tap.
export function handleColorMask(image, far) {
  const {data,width,height}=image;
  const offset=4*(Math.round(far[0])+width*Math.round(far[1]));
  const rgb=[data[offset],data[offset+1],data[offset+2]];
  const mean=rgb.reduce((a,b)=>a+b,0)/3;
  const direction=rgb.map(c=>c-mean), length=Math.hypot(...direction);
  if(!Number.isFinite(length) || length<24 || length/(mean+1)<.22)return null;
  const unit=direction.map(c=>c/length),mask=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++){
    const j=4*i, avg=(data[j]+data[j+1]+data[j+2])/3;
    const chroma=[data[j]-avg,data[j+1]-avg,data[j+2]-avg];
    const projection=chroma[0]*unit[0]+chroma[1]*unit[1]+chroma[2]*unit[2];
    mask[i]=Number(data[j+3]>100 && projection>.20*(avg+12) && projection>.86*Math.hypot(...chroma));
  }
  return mask;
}
