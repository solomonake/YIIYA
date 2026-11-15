export function silhouetteMetrics(reference, candidate) {
  if (reference.length !== candidate.length || !reference.length) throw new Error('Mask dimensions differ or empty');
  let intersection=0, refCount=0, candidateCount=0;
  for (let i=0;i<reference.length;i++) {
    const r=Boolean(reference[i]), c=Boolean(candidate[i]);
    refCount+=Number(r);candidateCount+=Number(c);intersection+=Number(r&&c);
  }
  if (!refCount || !candidateCount) return {eligible:false, iou:null, precision:null, recall:null, reference_pixels:refCount, candidate_pixels:candidateCount};
  return {eligible:true,iou:intersection/(refCount+candidateCount-intersection),precision:intersection/candidateCount,recall:intersection/refCount,reference_pixels:refCount,candidate_pixels:candidateCount};
}
