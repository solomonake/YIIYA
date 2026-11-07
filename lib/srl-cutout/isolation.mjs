// Learn a small palette from the image perimeter. Keep the central connected
// subject so fabric folds and shadows elsewhere don't get projected into 3D.
export function isolateSubject({width, height, data}, threshold = 32) {
  const count = width * height;
  const alpha = [0, width-1, count-width, count-1].filter(i => data[4*i+3] < 32).length >= 3;
  const mask = new Uint8Array(count);
  if (alpha) {
    for (let i = 0; i < count; i++) mask[i] = Number(data[4*i+3] > 100);
    return mask;
  }
  const palette = [];
  const add = pixel => {
    const i = 4*pixel;
    const color = [data[i], data[i+1], data[i+2]];
    if (!palette.some(p => p.every((v,c) => Math.abs(v-color[c]) < 12))) palette.push(color);
  };
  const step = Math.max(1, Math.floor(Math.min(width,height)/40));
  for (let x=0; x<width; x+=step) { add(x); add(count-width+x); }
  for (let y=0; y<height; y+=step) { add(y*width); add(y*width+width-1); }
  // A uniform backdrop can contain a subject with disconnected pieces.
  // Preserve all of them, as for transparent input.
  if (palette.length <= 2) {
    for (let i=0; i<count; i++) {
      const offset=i*4, p=palette[0];
      mask[i]=Number(data[offset+3]>100 && Math.hypot(data[offset]-p[0],data[offset+1]-p[1],data[offset+2]-p[2])>62);
    }
    return mask;
  }
  for (let i=0; i<count; i++) {
    if (data[i*4+3] < 101) continue;
    const r=data[4*i], g=data[4*i+1], b=data[4*i+2];
    mask[i] = Number(!palette.some(p => (p[0]-r)**2 + (p[1]-g)**2 + (p[2]-b)**2 < threshold**2));
  }
  // Label neighboring pixels. Pick by central area, allowing off-center objects.
  const labels = new Int32Array(count), queue = new Int32Array(count);
  let label = 0, winner = 0, best = 0;
  for (let start=0; start<count; start++) {
    if (!mask[start] || labels[start]) continue;
    label++;
    let end=1, score=0;
    queue[0]=start;
    labels[start]=label;
    for (let pos=0; pos<end; pos++) {
      const i=queue[pos], x=i%width, y=Math.floor(i/width);
      score += 1.5 - ((x+.5)/width-.5)**2 - ((y+.5)/height-.5)**2;
      for (let yy=Math.max(0,y-1); yy<=Math.min(height-1,y+1); yy++) {
        for (let xx=Math.max(0,x-1); xx<=Math.min(width-1,x+1); xx++) {
          const n=xx+yy*width;
          if (!mask[n] || labels[n]) continue;
          labels[n]=label; queue[end++]=n;
        }
      }
    }
    if (score>best) {best=score;winner=label;}
  }
  for (let i=0; i<count; i++) mask[i] = Number(winner !== 0 && labels[i]===winner);
  return mask;
}
