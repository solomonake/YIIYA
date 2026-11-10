import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { readSilhouette } from "./shape.mjs";

import {isolateSubject} from "./isolation.mjs";
import {previewCutout, editCutout} from "./cutout.mjs";
import {chooseMask} from "./support/select.mjs";
import model from "./support/model.json";
import {refineMesh} from "./refine.mjs";
import {subjectFrame, plausible} from "./frame.mjs";

const views=["front","right","angle"];
const inputs={front:null,right:null,angle:null};
const el=id=>document.getElementById(id);
const photos={front:null,right:null,angle:null}, revisions={front:0,right:0,angle:0};
let example=true, mesh, renderer, controls, building=false;
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(35,1,.02,35);
const stage=el("viewport");
scene.background=new THREE.Color(0x050505);
scene.add(new THREE.HemisphereLight(0xfff9e9,0xa9b29c,2));
const sun=new THREE.DirectionalLight(0xfff1df,2.6);sun.position.set(3,5,5);scene.add(sun);
const rim=new THREE.DirectionalLight(0xe4efff,1.2);rim.position.set(-3,2,-2);scene.add(rim);
try{
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  stage.append(renderer.domElement);renderer.domElement.setAttribute("aria-label","3D model. Drag to orbit and scroll to zoom.");
  controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;
  controls.minDistance=1.6;controls.maxDistance=9;controls.autoRotate=!matchMedia("(prefers-reduced-motion: reduce)").matches;controls.autoRotateSpeed=.65;
  camera.position.set(2.1,1.05,3.65);controls.update();
  new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}}).observe(stage);
  renderer.setAnimationLoop(()=>{if(!document.hidden&&mesh){controls.update();renderer.render(scene,camera);}});
}catch{renderer=null;}
function tell(msg){el("status").textContent=msg;}
function sync(){
  for(const view of views)el("edit-"+view).disabled=building||!inputs[view]||example;
  el("remove-angle").disabled=building||(!inputs.angle&&!el("angle").files?.length);
  el("profile").disabled=building;el("reset").disabled=building;
  el("build").disabled=building||!photos.front||!photos.right||Boolean(el("angle").files?.length&&!photos.angle);
  el("save").disabled=building||!mesh;el("wire").disabled=!renderer||!mesh;
  el("wire").setAttribute("aria-pressed",String(Boolean(mesh?.material.wireframe)));
}
function clearMesh(){
  if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh=null;}
  if(renderer)renderer.domElement.hidden=true;
  el("fallback").hidden=!example;el("fallback-label").hidden=!example;
  sync();
}
async function imageData(source){
  const img=new Image();img.src=source;await img.decode();
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
  // Draw a region of the photo no larger than 224 pixels on a side and cut the subject out of it.
  const cut=(x,y,w,h)=>{
    const scale=Math.min(1,224/Math.max(w,h));
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    ctx.drawImage(img,x,y,w,h,0,0,canvas.width,canvas.height);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);
    return {image,mask:example?isolateSubject(image):chooseMask(image,isolateSubject,model).mask};
  };
  const whole=cut(0,0,img.width,img.height);
  // A small subject gets a second, closer look so its outline has more pixels.
  const frame=!example&&subjectFrame(whole.mask,whole.image.width,whole.image.height);
  if(!frame)return whole;
  const closer=cut(frame.x*img.width,frame.y*img.height,Math.max(1,frame.width*img.width),Math.max(1,frame.height*img.height));
  return plausible(closer.mask)?closer:whole;

}
async function load(view,src,epoch){
  try{
    const result=await imageData(src);if(epoch!==revisions[view])return;
    inputs[view]=result;
    const thumb=el(view+"-thumb");
    thumb.src=previewCutout(result.image,result.mask).toDataURL();thumb.hidden=false;
    thumb.alt=view+" object cutout";
    photos[view]=readSilhouette(result.image,result.mask);
    if(!example)tell(photos.front&&photos.right?"Ready to build.":"Choose the other view.");
  }catch(e){if(epoch===revisions[view])tell(inputs[view]?"Touch up the "+view+" cutout to keep the object.":(e.message||"This photo could not be read."));}
  sync();
}
async function build(){
  if(building||!photos.front||!photos.right||(el("angle").files?.length&&!photos.angle))return;
  const epochs=views.map(view=>revisions[view]);building=true;clearMesh();tell("Building the mesh…");
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  try{
    if(views.some((view,i)=>revisions[view]!==epochs[i]))return;
    const t=performance.now();
    const result=refineMesh(photos.front,photos.right,el("profile").value==="round"?2:Infinity,photos.angle);
    mesh=result.mesh;scene.add(mesh);
    if(renderer){el("fallback").hidden=true;el("fallback-label").hidden=true;renderer.domElement.hidden=false;}
    const faces=mesh.geometry.attributes.position.count/3;
    tell(faces.toLocaleString()+" triangles · "+((performance.now()-t)/1000).toFixed(2)+" s"+(renderer?" · Drag to orbit":" · 3D preview unavailable on this device. Download the mesh."));
  }catch(e){tell(e.message||"Could not build this mesh.");}finally{building=false;sync();}
}
async function restore(){
  example=true;el("profile").value="outline";clearMesh();el("name").textContent="Studio bonsai";tell("Loading the example…");
  for(const v of views){revisions[v]++;photos[v]=null;inputs[v]=null;el(v).value="";}
  await Promise.all(["front","right"].map(v=>load(v,"./"+v+".png",++revisions[v])));
  el("angle-thumb").hidden=true;el("angle-details").open=false;
  if(example)await build();
}
for(const view of views)el(view).addEventListener("change",async()=>{
  const file=el(view).files?.[0];if(!file)return;
  if(file.size>12*1024*1024){tell("Choose an image smaller than 12 MB.");return;}
  if(example){
    example=false;for(const v of views){photos[v]=null;inputs[v]=null;revisions[v]++;el(v+"-thumb").hidden=true;}
    el("name").textContent="Your reconstruction";
  }
  clearMesh();photos[view]=null;inputs[view]=null;el(view+"-thumb").hidden=true;sync();
  const url=URL.createObjectURL(file);
  try{await load(view,url,++revisions[view]);}finally{URL.revokeObjectURL(url);}
});
for(const view of views)el("edit-"+view).onclick=()=>{
  const input=inputs[view];
  if(!input)return;
  editCutout(view,input.image,input.mask,photo=>{
    revisions[view]++;input.mask=photo.mask;photos[view]=photo;
    el(view+"-thumb").src=previewCutout(input.image,input.mask).toDataURL();
    clearMesh();
    if(photos.front&&photos.right)void build();else tell("Choose the other view.");
  });
};
el("remove-angle").onclick=()=>{
  revisions.angle++;photos.angle=null;inputs.angle=null;
  el("angle").value="";el("angle-thumb").hidden=true;clearMesh();
  if(photos.front&&photos.right)void build();else tell("Choose the front and right views.");
};
el("profile").onchange=()=>{if(photos.front&&photos.right)void build();};
el("build").onclick=build;el("reset").onclick=restore;
el("wire").onclick=()=>{if(mesh){mesh.material.wireframe=!mesh.material.wireframe;sync();}};
el("save").onclick=async()=>{
  if(!mesh)return;el("save").disabled=true;
  try{
    const data=await new GLTFExporter().parseAsync(mesh,{binary:true});
    const url=URL.createObjectURL(new Blob([data],{type:"model/gltf-binary"}));
    const link=document.createElement("a");link.href=url;link.download=example?"yiiya-bonsai.glb":"yiiya-photo-mesh.glb";document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{tell("Download failed. Build the mesh and try again.");}finally{sync();}
};
async function start() {
  let handoff;
  try {
    const key="yiiya-photo-handoff";
    const serialized=sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if(serialized)handoff=JSON.parse(serialized);
  } catch { /* The picker works with storage disabled. */ }
  if(handoff && Date.now()-handoff.at>=0 && Date.now()-handoff.at<60_000 &&
      /^data:image\/(jpeg|png|webp);base64,/.test(handoff.src)) {
    example=false;el("name").textContent="Your reconstruction";
    for(const v of views)el(v+"-thumb").hidden=true;
    clearMesh();
    await load("front",handoff.src,++revisions.front);
    if(photos.front)tell("Front photo ready. Add a right-side photo of the same subject.");
    return;
  }
  await restore();
}
start();
