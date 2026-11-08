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
  const handleBounds={left:Math.min(...path.map(p=>p.x))-handleRadius,right:Math.max(...path.map(p=>p.x))+handleRadius,top:Math.min(...path.map(p=>p.y))-handleRadius,bottom:Math.max(...path.map(p=>p.y))+handleRadius};

  const rimFlare=outerRadius*(3.4/49);
  const n=104, field=new MarchingCubes(n,material,false,false,100000);
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
    if(u>=handleBounds.left&&u<=handleBounds.right&&v>=handleBounds.top&&v<=handleBounds.bottom&&Math.abs(z)<handleRadius*1.35){
      let d2=Infinity;
      for(let a=1;a<path.length;a++){
        const p=path[a-1],q=path[a],dx=q.x-p.x,dy=q.y-p.y;
        const f=THREE.MathUtils.clamp(((u-p.x)*dx+(v-p.y)*dy)/(dx*dx+dy*dy),0,1);
        d2=Math.min(d2,(u-p.x-f*dx)**2+(v-p.y-f*dy)**2);
      }
      solid=Math.max(solid,handleRadius-Math.sqrt(d2+(z/1.30)**2));
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
