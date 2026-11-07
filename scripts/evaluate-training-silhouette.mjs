/** Trusted local PNG diagnostic only. Does not modify images or fit camera/model parameters. */
import sharp from 'sharp';
import {inverseRadialMap} from '../services/object_capture_worker/radial-distortion.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {silhouetteMetrics} from '../services/object_capture_worker/silhouette-metrics.mjs';
const [photos,renderDir,output,poseFile]=process.argv.slice(2);
if (!photos||!renderDir||!output) throw new Error('Usage: PHOTOS RENDERS NEW_REPORT');
const report=JSON.parse(await readFile(join(renderDir,'report.json'),'utf8'));
if (!Array.isArray(report.views)||!report.views.length||report.views.length>48||new Set(report.views.map(v=>v.source_file)).size!==report.views.length) throw new Error('Need 1–48 unique views');
const poses=poseFile?JSON.parse(await readFile(poseFile,'utf8')).poses:null;
const records=[];
for (const view of report.views) {
 const name=view.source_file;
 if (!/^dinoR\d{4}\.png$/.test(name)) throw new Error('Unexpected source name');
 const refBytes=await readFile(join(photos,name)), renderBytes=await readFile(join(renderDir,name));
 const hash=createHash('sha256').update(refBytes).digest('hex');
 if(hash!==view.source_sha256) throw new Error('Reference hash changed');
 const reference=await sharp(refBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rendered=await sharp(renderBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height,channels}=reference.info;
 if(width!==640||height!==480||channels!==4||rendered.info.width!==width||rendered.info.height!==height||rendered.info.channels!==4) throw new Error('Unexpected image dimensions');
 let candidate=Uint8Array.from({length:width*height},(_,i)=>Number(rendered.data[4*i+3]>=128));
 if(poses) {
  const matches=poses.filter(p=>p.source_file===name);
  if(matches.length!==1||!matches[0].lens_distortion) throw new Error('Missing unique distortion calibration');
  const d=matches[0].lens_distortion, inverse=inverseRadialMap(d.center,d.radial_lookup_table,width,height);
  const source=candidate;
  candidate=Uint8Array.from({length:width*height},(_,i)=>{
    const [x,y]=inverse(i%width,Math.floor(i/width)),xx=Math.round(x),yy=Math.round(y);
    return xx>=0&&xx<width&&yy>=0&&yy<height?source[yy*width+xx]:0;
  });
 }
 const thresholds=[16,32,48].map(threshold=>{
  const mask=Uint8Array.from({length:width*height},(_,i)=>Number(Math.max(...reference.data.subarray(4*i,4*i+3))>threshold));
  return {threshold,...silhouetteMetrics(mask,candidate)};
 });
 records.push({source_file:name,reference_sha256:hash,render_sha256:createHash('sha256').update(renderBytes).digest('hex'),thresholds});
}
const scores=records.flatMap(r=>r.thresholds.map(t=>t.iou));
const result={evaluator:poses?'training-silhouette-radial-v1':'training-silhouette-threshold-v1',model_sha256:report.model_sha256,views:records,diagnostic_iou_range:scores.every(x=>x!==null)?[Math.min(...scores),Math.max(...scores)]:null,photo_fidelity_reward:null,automatic_promotion:false,limitations:['All48 photos used in reconstruction; not held-out accuracy','Threshold masks assume a dark background and can miss dark object areas',poses?'Estimated radial distortion applied to alpha mask; nearest-neighbor sampling':'Native camera distortion not modeled','No texture, unseen-surface, topology or physical-scale assessment','No learned reward model; no candidate ranking from this diagnostic alone']};
await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
