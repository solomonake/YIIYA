import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { traceHandle, handleColorMask } from "./handle-profile.mjs";
import { isolateSubject } from "./isolation-classic.mjs";
import { buildMug } from "./mug-shape.mjs";

const byId = id => document.getElementById(id);
const labels = {
  front: ["Left edge of the rim", "Right edge of the rim", "Right edge of the base", "Upper handle joint", "Center of the handle at its farthest side", "Lower handle joint", "Outside edge next to the handle center you marked"],
  overhead: ["Left outside edge of the rim", "Right outside edge of the rim", "Left inside edge of the opening", "Right inside edge of the opening"],
};
const photos = {};
let demo = false, revision = 0, downloadUrl, mesh, renderer, camera, controls;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfffaf1, 0xbbb4ae, 2.4));
const lamp = new THREE.DirectionalLight(0xffffff, 3);lamp.position.set(1,3,3);scene.add(lamp);
try {
  const stage = byId("stage");
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));stage.append(renderer.domElement);
  camera = new THREE.PerspectiveCamera(34,1,.02,40);
  controls = new OrbitControls(camera,renderer.domElement);controls.enablePan=false;
  const render = () => renderer.render(scene,camera);
  controls.addEventListener("change",render);
  new ResizeObserver(() => {const {width,height}=stage.getBoundingClientRect();if(width && height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}}).observe(stage);
} catch { renderer=null; }
function invalidate() {
  revision++;
  if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh=null;if(renderer)renderer.render(scene,camera);}
  if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
  const a=byId("download");a.hidden=true;a.removeAttribute("href");byId("progress").textContent="";
}
function draw(view) {
  const p=photos[view], ctx=p.canvas.getContext("2d");
  ctx.clearRect(0,0,224,224);p.canvas.hidden=!p.img;
  if(p.img)ctx.drawImage(p.img,...p.rect);
  p.points.forEach(([x,y],i)=>{ctx.fillStyle="#ffba59";ctx.strokeStyle="#19120a";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,3.2,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.fillStyle="white";ctx.fillText(i+1,x+4,y-4);});
  p.hint.textContent=p.img?(labels[view][p.points.length]?"Tap "+(p.points.length+1)+": "+labels[view][p.points.length]:"Outline marked."):"Choose a photo.";
  p.undo.disabled=!p.points.length;
  byId("make").disabled=!Object.keys(labels).every(v=>photos[v]?.points.length===labels[v].length);
}
function rectFor(img) {const s=224/Math.max(img.naturalWidth,img.naturalHeight),w=img.naturalWidth*s,h=img.naturalHeight*s;return [(224-w)/2,(224-h)/2,w,h];}
function clearDemo() {
  if(!demo)return;
  demo=false;
  for(const view of Object.keys(labels)){const p=photos[view];p.token++;p.points=[];p.img=null;p.input.value="";draw(view);}
}
for(const view of Object.keys(labels)){
  const box=document.createElement("div"),title=view==="front"?"Front photo":"Photo from above";
  box.innerHTML='<label>'+title+' <input type="file" accept="image/jpeg,image/png,image/webp"></label><p role="status"></p><canvas class="mark" width="224" height="224" hidden></canvas><button type="button">Undo last mark</button>';
  byId("pickers").append(box);
  const p=photos[view]={input:box.querySelector("input"),hint:box.querySelector("p"),canvas:box.querySelector("canvas"),undo:box.querySelector("button"),points:[],token:0};
  p.canvas.setAttribute("aria-label",title+" landmark editor");
  p.input.onchange=async()=>{const file=p.input.files[0];if(!file)return;clearDemo();invalidate();const token=++p.token;p.img=null;p.points=[];draw(view);
    if(file.size>12*1024*1024){p.hint.textContent="Choose a photo smaller than 12 MB.";return;}
    const url=URL.createObjectURL(file),img=new Image();img.src=url;
    try{await img.decode();if(p.token===token){p.img=img;p.rect=rectFor(img);draw(view);}}catch{if(p.token===token)p.hint.textContent="Could not read the photo.";}finally{URL.revokeObjectURL(url);}
  };
  p.canvas.onclick=e=>{if(!p.img||p.points.length===labels[view].length)return;const r=p.canvas.getBoundingClientRect();const x=(e.clientX-r.left)*224/r.width,y=(e.clientY-r.top)*224/r.height;const [l,t,w,h]=p.rect;if(x<l||y<t||x>l+w||y>t+h)return;demo=false;invalidate();p.points.push([x,y]);draw(view);};
  p.undo.onclick=()=>{demo=false;invalidate();p.points.pop();draw(view);};
}
function readFit(){
  const [left,right,base,upper,far,lower,edge]=photos.front.points;
  const top=(left[1]+right[1])/2,centerX=(left[0]+right[0])/2,outerRadius=(right[0]-left[0])/2;
  const baseRadius=base[0]-centerX,handleRadius=Math.hypot(edge[0]-far[0],edge[1]-far[1]);
  const [ol,or,il,ir]=photos.overhead.points;
  const outerDiameter=or[0]-ol[0],innerDiameter=ir[0]-il[0];
  if(outerRadius<8||base[1]-top<15||baseRadius<outerRadius*.35||baseRadius>outerRadius*1.3||upper[1]>=lower[1]||Math.abs(far[0]-centerX)<=outerRadius||handleRadius<1||handleRadius>outerRadius*.35)
    throw Error("Check the front marks. Mark the rim left to right, then the right base edge and the handle in order.");
  if(outerDiameter<12||il[0]<=ol[0]||ir[0]>=or[0]||innerDiameter/outerDiameter<.48||innerDiameter/outerDiameter>.97)
    throw Error("Check the overhead marks. Place both inside edges within the outer rim.");
  const dir=Math.sign(far[0]-centerX);
  const socket=p=>[centerX+dir*(THREE.MathUtils.lerp(outerRadius-3,baseRadius,(p[1]-top)/(base[1]-top))-handleRadius*.55),p[1]];
  const handle=[socket(upper),[(far[0]+upper[0])/2,upper[1]],[far[0],far[1]],[(far[0]+lower[0])/2,lower[1]],socket(lower)];
  const minX=Math.min(centerX-outerRadius,far[0]-handleRadius),maxX=Math.max(centerX+outerRadius,far[0]+handleRadius);
  const camera={cx:(minX+maxX)/2,cy:(top+base[1])/2,scale:Math.max(maxX-minX,base[1]-top,outerRadius*2)/1.7};
  const landmarks={front:{centerX,top,base:base[1],outerRadius,baseRadius,handle,handleRadius},side:{centerX:camera.cx,outerRadius},overhead:{outerDiameter,innerDiameter}};
  return {landmarks,camera};
}
let sample;
async function example(){
  invalidate();demo=true;
  const epochs={};for(const view of Object.keys(labels)){const p=photos[view];epochs[view]=++p.token;p.img=null;p.points=[];p.input.value="";draw(view);}
  try{
    sample??=await fetch("mug/fit.json").then(r=>{if(!r.ok)throw Error();return r.json();});
    for(const view of Object.keys(labels)){const p=photos[view],img=new Image();img.src="mug/"+view+".jpg";await img.decode();if(epochs[view]!==p.token||!demo)return;
      p.img=img;p.rect=rectFor(img);p.points=view==="front"?[[68,45],[166,45],[157,133],[75,59],[46,78],[79,111],[42.6,78]]:[[80,145],[245,145],[89,145],[235,145]].map(([x,y])=>[x*224/300,y*224/300]);draw(view);}
  }catch{byId("progress").textContent="The example could not load. Choose your own photos.";}
}
byId("depth").oninput=()=>{invalidate();byId("depth-value").textContent=byId("depth").value+"%";};
byId("example").onclick=example;
byId("make").onclick=async()=>{
  invalidate();const epoch=revision;
  try{
    const {landmarks,camera:fitCamera}=demo?structuredClone(sample):readFit();
    landmarks.assumedDepthFraction=Number(byId("depth").value)/100;
    const p=photos.front,canvas=document.createElement("canvas");canvas.width=canvas.height=224;
    const ctx=canvas.getContext("2d");ctx.drawImage(p.img,...p.rect);
    if(!demo){
      // Exclude letterboxing before learning the photo's background palette.
      const [x,y,w,h]=p.rect.map(Math.round);
      const crop=ctx.getImageData(x,y,Math.min(w,224-x),Math.min(h,224-y));
      const cutout=isolateSubject(crop), mask=new Uint8Array(224*224);
      for(let j=0;j<crop.height;j++)mask.set(cutout.subarray(j*crop.width,(j+1)*crop.width),(y+j)*224+x);
      const hue=handleColorMask(ctx.getImageData(0,0,224,224),landmarks.front.handle[2]);
      const profile=(hue && traceHandle(hue,224,224,landmarks.front)) || traceHandle(mask,224,224,landmarks.front);
      if(profile){landmarks.front.handle=profile.points;landmarks.front.handleRadii=profile.radii;}
    }
    const rgb=ctx.getImageData(Math.round(landmarks.front.centerX),Math.round((landmarks.front.base+landmarks.front.top)/2),1,1).data;
    const color=new THREE.Color().setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,THREE.SRGBColorSpace);
    const start=performance.now();mesh=buildMug(landmarks,fitCamera,color);const ms=performance.now()-start;
    scene.add(mesh);
    if(renderer){const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());camera.position.copy(center).add(new THREE.Vector3(.25,1.1,3.25));controls.target.copy(center);controls.update();renderer.render(scene,camera);}
    const data=await new GLTFExporter().parseAsync(mesh,{binary:true});if(epoch!==revision)return;
    downloadUrl=URL.createObjectURL(new Blob([data],{type:"model/gltf-binary"}));
    const a=byId("download");a.href=downloadUrl;a.hidden=false;byId("progress").textContent=mesh.geometry.attributes.position.count/3+" triangles · "+(ms/1000).toFixed(2)+" s"+(renderer?" · Drag to orbit.":" · Preview unavailable. Download the mesh.");
  }catch(e){if(epoch===revision){invalidate();byId("progress").textContent=e.message||"Could not build the mesh.";}}
};
example();
