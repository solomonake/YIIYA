import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { measureOutlineFit } from "../../features/photo-studio/refine.mjs";

function photo() {
  const w=64,h=64,mask=new Uint8Array(w*h);
  for(let y=16;y<48;y++)for(let x=16;x<48;x++)mask[y*w+x]=1;
  return {w,h,mask,data:new Uint8ClampedArray(w*h*4),left:16,right:47,top:16,bottom:47,aspect:1};
}
function box(depth=1.72) {
  return new Mesh(new BoxGeometry(1.72,1.72,depth).toNonIndexed(),new MeshBasicMaterial());
}
describe("measured construction-view outline evidence",()=>{
  it("shows the weak view instead of hiding it in the average",()=>{
    const mesh=box(.43);
    try {
      const result=measureOutlineFit(mesh,photo(),photo());
      expect(result.views.front).toBeGreaterThan(.9);
      expect(result.views.right).toBeLessThan(.3);
      expect(result.minimum).toBe(result.views.right);
      expect(result.mean).toBeGreaterThan(result.minimum);
      expect(result).toMatchObject({evidence:"construction_inputs",fidelity:"not_assessed",gridSize:64});
    } finally {mesh.geometry.dispose();mesh.material.dispose();}
  });
  it("reports the optional angle only when supplied",()=>{
    const mesh=box();
    try {
      expect(Object.keys(measureOutlineFit(mesh,photo(),photo()).views)).toEqual(["front","right"]);
      expect(Object.keys(measureOutlineFit(mesh,photo(),photo(),photo()).views)).toEqual(["front","right","angle"]);
    } finally {mesh.geometry.dispose();mesh.material.dispose();}
  });
  it("rejects non-finite source geometry rather than displaying a score",()=>{
    const mesh=box();mesh.geometry.attributes.position.array[0]=NaN;
    try {expect(()=>measureOutlineFit(mesh,photo(),photo())).toThrow("could not be verified");}
    finally {mesh.geometry.dispose();mesh.material.dispose();}
  });
});
