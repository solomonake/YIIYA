/** AVFoundation lensDistortionLookupTable convention: undistorted radius -> distorted radius. */
export function inverseRadialMap(center, table, width, height) {
  if (!Array.isArray(center)||center.length!==2||!center.every(Number.isFinite)||!Array.isArray(table)||table.length<2||!table.every(Number.isFinite)||![width,height].every(x=>Number.isInteger(x)&&x>0)) throw new Error('Invalid radial calibration');
  const [cx,cy]=center;
  if(cx<0||cy<0||cx>width||cy>height) throw new Error('Optical center outside image');
  const maxRadius=Math.hypot(Math.max(cx,width-cx),Math.max(cy,height-cy));
  // Piecewise-linear magnification gives a quadratic radius map. Require its
  // derivative positive at both ends of every interval before inversion.
  const step=maxRadius/(table.length-1);
  for(let i=0;i<table.length-1;i++) {
    const slope=(table[i+1]-table[i])/step;
    if(Math.min(1+table[i]+i*step*slope,1+table[i+1]+(i+1)*step*slope)<=0) throw new Error('Non-invertible radial table');
  }
  if(1+table.at(-1)<=0) throw new Error('Invalid radial endpoint');
  function distorted(r) {
    const index=Math.min(r/maxRadius*(table.length-1),table.length-1);
    const lo=Math.floor(index),hi=Math.min(lo+1,table.length-1),fraction=index-lo;
    return r*(1+table[lo]*(1-fraction)+table[hi]*fraction);
  }
  return (x,y)=>{
    const dx=x-cx,dy=y-cy,target=Math.hypot(dx,dy);
    if(!target)return [cx,cy];
    let low=0,high=Math.max(maxRadius,target/(1+table.at(-1)));
    for(let i=0;i<40;i++){const mid=(low+high)/2;if(distorted(mid)<target)low=mid;else high=mid;}
    const scale=(low+high)/2/target;
    return [cx+dx*scale,cy+dy*scale];
  };
}
