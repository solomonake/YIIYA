import * as THREE from "three";
import {MarchingCubes} from "three/examples/jsm/objects/MarchingCubes.js";

export function buildMug(landmarks, camera, color, closed = false) {
  const {cx,cy,scale}=camera;

  const {centerX,top,base,outerRadius,baseRadius,handle,handleRadius}=landmarks.front;
  const {outerDiameter,innerDiameter}=landmarks.overhead;
  const wall=outerRadius*(1-innerDiameter/outerDiameter);

  const material=new THREE.MeshStandardMaterial({color,roughness:.43});
  const curve=new THREE.CatmullRomCurve3(handle.map(([x,y])=>new THREE.Vector3(x,y,0)));
  const path=curve.getPoints(36);
  const radii=landmarks.front.handleRadii;
  const thickness=path.map((_,i)=>{
    if(!radii)return handleRadius;
    const t=i*(radii.length-1)/(path.length-1),j=Math.floor(t);
    return THREE.MathUtils.lerp(radii[j],radii[Math.min(j+1,radii.length-1)],t-j);
  });
  const maxRadius=Math.max(...thickness);
  const handleBounds={left:Math.min(...path.map(p=>p.x))-maxRadius,right:Math.max(...path.map(p=>p.x))+maxRadius,top:Math.min(...path.map(p=>p.y))-maxRadius,bottom:Math.max(...path.map(p=>p.y))+maxRadius};

  const rimFlare=outerRadius*(3.4/49);
  // Narrow traced sections need enough samples across their cross-section.
  const minRadius=Math.min(...thickness);
  const n=radii?Math.min(144,Math.max(104,Math.ceil(2.5*scale/minRadius))):104;
  const maxTriangles=Math.ceil(100000*(n/104)**2);
  const field=new MarchingCubes(n,material,false,false,maxTriangles);
  field.isolation=0;
  for(let k=0;k<n;k++) for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const u=cx+(2*i/n-1)*scale,v=cy-(2*j/n-1)*scale,z=(2*k/n-1)*scale;
    const height=base-top, frac=THREE.MathUtils.clamp((v-top)/height,0,1);
    const radius=THREE.MathUtils.lerp(outerRadius-rimFlare,baseRadius,frac)+rimFlare*Math.exp(-(((v-top)/(outerRadius*2.8/49))**2));
    const radial=Math.hypot(u-centerX,z*outerRadius/landmarks.side.outerRadius);
    let solid=Math.min(radius-radial,v-top,base-v);
    if(!closed){
      // Floor depth is a declared prior; the top frame constrains the opening diameter.
      const innerRadius=radius-wall;
      solid=Math.min(solid,Math.max(radial-innerRadius,v-(top+height*landmarks.assumedDepthFraction)));
    }
    if(u>=handleBounds.left&&u<=handleBounds.right&&v>=handleBounds.top&&v<=handleBounds.bottom&&Math.abs(z)<maxRadius*1.35){
      let handleField=-Infinity;
      for(let a=1;a<path.length;a++){
        const p=path[a-1],q=path[a],dx=q.x-p.x,dy=q.y-p.y;
        const f=THREE.MathUtils.clamp(((u-p.x)*dx+(v-p.y)*dy)/(dx*dx+dy*dy),0,1);
        const radiusAtPoint=THREE.MathUtils.lerp(thickness[a-1],thickness[a],f);
        const distance=Math.sqrt((u-p.x-f*dx)**2+(v-p.y-f*dy)**2+(z/1.30)**2);
        handleField=Math.max(handleField,radiusAtPoint-distance);
      }
      solid=Math.max(solid,handleField);
    }
    field.field[i+n*(j+n*k)]=solid;
  }
  field.update();
  if(field.count<3||field.count>field.positionArray.length/3)throw Error("Incomplete mesh");
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(field.positionArray.slice(0,3*field.count),3));
  geo.setAttribute("normal",new THREE.BufferAttribute(field.normalArray.slice(0,3*field.count),3));geo.normalizeNormals();
  // Register the lateral position observed at 90 degrees in the fixed input camera.
  geo.translate(0,0,(cx-landmarks.side.centerX)/scale);
  field.geometry.dispose();
  const mesh=new THREE.Mesh(geo,material);mesh.name="Photo-guided mug";
  return mesh;
}
