import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

import { isolateSubject } from "./isolation.mjs";

export function readSilhouette(image, mask = isolateSubject(image)) {
  const {width:w,height:h,data} = image;
  let left=w,right=-1,top=h,bottom=-1,count=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if (!mask[x+y*w]) continue;
    count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(count<w*h*.006||count>w*h*.92||bottom-top<4||right-left<4)throw Error("The outline is hard to see. Try a plain contrasting background with space around the object.");
  return {w,h,data,mask,left,right,top,bottom,aspect:(right-left+1)/(bottom-top+1)};
}
function project(photo,x,y,height){
  const scale=(photo.bottom-photo.top)/height;
  const u=Math.round((photo.left+photo.right)/2+x*scale);
  const v=Math.round((photo.top+photo.bottom)/2-y*scale);
  return u<0||u>=photo.w||v<0||v>=photo.h?-1:u+v*photo.w;
}
function colorAt(photo,x,y,height){
  const radius=height/(photo.bottom-photo.top);
  for(const [a,b] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-2,-2],[2,2]]){
    const j=project(photo,x+a*radius,y+b*radius,height);
    if(j>=0&&photo.mask[j]) return new THREE.Color().setRGB(photo.data[j*4]/255,photo.data[j*4+1]/255,photo.data[j*4+2]/255,THREE.SRGBColorSpace);
  }
}
// Normalize each contiguous run independently so empty gaps survive rounding.
function profileDistances(row, power) {
  const distances = new Float32Array(row.length);
  for (let first = 0; first < row.length;) {
    if (!row[first]) { first++; continue; }
    let end = first + 1;
    while (end < row.length && row[end]) end++;
    const middle = (first + end - 1) / 2;
    const radius = (end - first) / 2;
    for (let i = first; i < end; i++) distances[i] = (Math.abs(i - middle) / radius) ** power;
    first = end;
  }
  return distances;
}

export function reconstruct(front,side,profilePower=Infinity,size=56,angle=null){
  const height=1.72/Math.max(1,front.aspect,side.aspect);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84,metalness:0});
  const field=new MarchingCubes(size,material,false,false,65000);
  field.isolation=.48;
  for(let y=1;y<size-1;y++){
    const py=2*y/size-1;
    const f=new Uint8Array(size),s=new Uint8Array(size);
    for(let i=1;i<size-1;i++){
      const c=2*i/size-1;
      f[i]=front.mask[project(front,c,py,height)]||0;
      s[i]=side.mask[project(side,-c,py,height)]||0;
    }
    const round = Number.isFinite(profilePower);
    const frontDistance = round ? profileDistances(f, profilePower) : null;
    const sideDistance = round ? profileDistances(s, profilePower) : null;
    for (let z=1; z<size-1; z++) {
      if (!s[z]) continue;
      for (let x=1; x<size-1; x++) {
        if (!f[x] || (round && frontDistance[x] + sideDistance[z] > 1)) continue;
        // Moving from the front toward the object's right rotates projected
        // horizontal coordinates from +x toward -z.
        if (angle) {
          const diagonal=(x-z)*2/size*Math.SQRT1_2;
          if (!angle.mask[project(angle,diagonal,py,height)]) continue;
        }
        field.field[x+y*size+z*size*size]=1;
      }
    }
  }
  field.blur(.75);
  field.update();
  const count=field.count;
  if(count<3||count>field.positionArray.length/3){field.geometry.dispose();material.dispose();throw Error("Could not build a mesh from these outlines. Try another pair of photos.");}
  const geo=new THREE.BufferGeometry();
  const pos=field.positionArray.slice(0,count*3), normals=field.normalArray.slice(0,count*3);
  const colors=new Float32Array(pos.length);
  for(let i=0;i<pos.length;i+=3){
    const fc=colorAt(front,pos[i],pos[i+1],height),sc=colorAt(side,-pos[i+2],pos[i+1],height);
    const weight=Math.abs(normals[i])/(Math.abs(normals[i])+Math.abs(normals[i+2])+1e-8);
    const c=fc&&sc?fc.lerp(sc,weight):fc||sc||new THREE.Color(0x888579);
    c.toArray(colors,i);
  }
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  geo.setAttribute("normal",new THREE.BufferAttribute(normals,3));
  geo.normalizeNormals();
  geo.setAttribute("color",new THREE.BufferAttribute(colors,3));
  geo.computeBoundingSphere();field.geometry.dispose();
  const mesh=new THREE.Mesh(geo,material);mesh.name="YIIYA photo reconstruction";
  return mesh;
}
