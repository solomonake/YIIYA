import {readSilhouette} from "./shape.mjs";

export function previewCutout(image, mask, editing = false) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  const pixels = new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  for (let i=0; i<mask.length; i++) {
    if (mask[i]) continue;
    const offset=i*4;
    if (editing) {
      for (let c=0;c<3;c++) pixels.data[offset+c]=32+.25*pixels.data[offset+c];
      pixels.data[offset+3]=255;
    } else pixels.data[offset+3]=0;
  }
  context.putImageData(pixels,0,0);
  return canvas;
}

export function editCutout(view, image, initial, commit) {
  const dialog=document.getElementById("cutout-editor");
  const canvas=document.getElementById("edit-canvas");
  const ctx=canvas.getContext("2d");
  const error=document.getElementById("edit-error");
  document.getElementById("edit-title").textContent="Touch up the "+view+" view";
  error.textContent="";
  canvas.width=image.width; canvas.height=image.height;
  const mask=initial.slice();
  let previous=null;
  const redraw=()=>ctx.drawImage(previewCutout(image,mask,true),0,0);
  redraw();
  function paint(event) {
    const rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)*canvas.width/rect.width;
    const y=(event.clientY-rect.top)*canvas.height/rect.height;
    const radius=Math.max(1, Math.min(canvas.width,canvas.height)*Number(document.getElementById("brush-size").value)/200);
    const value=document.getElementById("brush-mode").value==="keep"?1:0;
    const [px,py]=previous||[x,y];
    const steps=Math.max(1,Math.ceil(Math.hypot(x-px,y-py)/radius*2));
    for(let step=1;step<=steps;step++){
      const cx=px+(x-px)*step/steps,cy=py+(y-py)*step/steps;
      for(let v=Math.max(0,Math.floor(cy-radius));v<=Math.min(canvas.height-1,cy+radius);v++){
        for(let u=Math.max(0,Math.floor(cx-radius));u<=Math.min(canvas.width-1,cx+radius);u++){
          if ((u-cx)**2+(v-cy)**2<=radius**2 && image.data[4*(v*canvas.width+u)+3]>100) mask[v*canvas.width+u]=value;
        }
      }
    }
    previous=[x,y];redraw();
  }
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);previous=null;paint(e);};
  canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))paint(e);};
  canvas.onpointerup=canvas.onpointercancel=()=>{previous=null;};
  document.getElementById("edit-reset").onclick=()=>{mask.set(initial);redraw();};
  document.getElementById("edit-apply").onclick=()=>{
    try{const photo=readSilhouette(image,mask);commit(photo);dialog.close();}
    catch(e){error.textContent=e.message;}
  };
  document.getElementById("edit-cancel").onclick=()=>dialog.close();
  dialog.showModal();
}
