import {reconstruct} from "./shape.mjs";

// Score the finished triangles in both input views on a small fixed grid.
function outlineFit(position,photo,height,view) {
  const size=64, raster=new Uint8Array(size*size);
  const horizontal=i=>view==="angle"?(position[i]-position[i+2])*Math.SQRT1_2:view==="right"?-position[i+2]:position[i];
  const screen=value=>(value+1)*size/2-.5;
  for(let i=0;i<position.length;i+=9){
    const ax=screen(horizontal(i)), ay=screen(position[i+1]);
    const bx=screen(horizontal(i+3)), by=screen(position[i+4]);
    const cx=screen(horizontal(i+6)), cy=screen(position[i+7]);
    const area=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(area)<1e-9)continue;
    const left=Math.max(0,Math.ceil(Math.min(ax,bx,cx))), right=Math.min(size-1,Math.floor(Math.max(ax,bx,cx)));
    const top=Math.max(0,Math.ceil(Math.min(ay,by,cy))),bottom=Math.min(size-1,Math.floor(Math.max(ay,by,cy)));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(raster[y*size+x])continue;
      const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/area,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/area;
      if(u>=-1e-6 && v>=-1e-6 && u+v<=1+1e-6)raster[y*size+x]=1;
    }
  }
  const scale=(photo.bottom-photo.top)/height;
  let both=0,either=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=Math.round((photo.left+photo.right)/2+((x+.5)*2/size-1)*scale);
    const v=Math.round((photo.top+photo.bottom)/2-((y+.5)*2/size-1)*scale);
    const target=(u>=0&&u<photo.w&&v>=0&&v<photo.h)?photo.mask[u+v*photo.w]:0;
    both+=raster[x+y*size]&target;either+=raster[x+y*size]|target;
  }
  return both/Math.max(1,either);
}
function scoreMesh(mesh,front,right,angle) {
  const {array}=mesh.geometry.attributes.position;
  if(array.length===0 || !array.every(Number.isFinite))throw Error("The mesh could not be verified.");
  const height=1.72/Math.max(1,front.aspect,right.aspect);
  const sum=outlineFit(array,front,height,"front")+outlineFit(array,right,height,"right");
  return angle?(sum+outlineFit(array,angle,height,"angle"))/3:sum/2;
}
function dispose(mesh){mesh.geometry.dispose();mesh.material.dispose();}
export function refineMesh(front,right,power=Infinity,angle=null) {
  const start=performance.now();
  const initial=reconstruct(front,right,power,56,angle);
  const first=scoreMesh(initial,front,right,angle);
  let mesh=initial, chosen=first,passes=1;
  if(first<.965 && performance.now()-start<120){
    let candidate;
    try{
      candidate=reconstruct(front,right,power,72,angle);
      const next=scoreMesh(candidate,front,right,angle);
      passes++;
      if(next>first+.002){mesh=candidate;chosen=next;dispose(initial);}
      else dispose(candidate);
    }catch{if(candidate)dispose(candidate);}
  }
  return {mesh,first,chosen,passes,seconds:(performance.now()-start)/1000};
}
