// Inputs are small RGB previews, so trying four masks has a bounded pixel cost.
export const thresholds=[18,32,50,72];
export function preview(image) {
  const scale=Math.min(1,64/Math.max(image.width,image.height));
  if(scale===1)return image;
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const j=4*(Math.min(image.width-1,Math.floor((x+.5)/scale))+image.width*Math.min(image.height-1,Math.floor((y+.5)/scale)));
    data.set(image.data.subarray(j,j+4),4*(y*width+x));
  }
  return {width,height,data};
}
export function describe(image,mask,threshold){
  const {width:w,height:h,data}=image;
  let area=0,edge=0,contrast=0,insideGradient=0,outsideGradient=0,ni=0,no=0,border=0;
  let x0=w,x1=0,y0=h,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=x+w*y;
    if(mask[i]){area++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);if(x===0||y===0||x===w-1||y===h-1)border++;}
    for(const j of [x+1<w?i+1:-1,y+1<h?i+w:-1]){
      if(j<0)continue;
      const g=(Math.abs(data[4*i]-data[4*j])+Math.abs(data[4*i+1]-data[4*j+1])+Math.abs(data[4*i+2]-data[4*j+2]))/765;
      if(mask[i]!==mask[j]){contrast+=g;edge++;}else if(mask[i]){insideGradient+=g;ni++;}else{outsideGradient+=g;no++;}
    }
  }
  return [threshold/100,area/(w*h),area/Math.max(1,(x1-x0+1)*(y1-y0+1)),edge/Math.max(1,Math.sqrt(area)),
    contrast/Math.max(1,edge),insideGradient/Math.max(1,ni),outsideGradient/Math.max(1,no),border/(2*w+2*h),
    Math.abs((x1+x0)/2/w-.5)+Math.abs((y1+y0)/2/h-.5)];
}
export function score(features,model) {
  let value=model.base;
  for(const tree of model.trees){
    let node=tree;
    while(Array.isArray(node))node=features[node[0]]<=node[1]?node[2]:node[3];
    value+=node;
  }
  return value;
}

export function chooseMask(image, isolate, model) {
  const small=preview(image);
  const baseline=isolate(small,32);
  const options=[{threshold:32,mask:baseline}];
  // If an alpha channel already defines the cutout, extra scoring cannot improve it.
  const corners=[0,small.width-1,baseline.length-small.width,baseline.length-1];
  if(corners.filter(i=>small.data[4*i+3]<32).length>=3){
    return {mask:small===image?baseline:isolate(image,32),threshold:32,candidates:1};
  }
  for(const threshold of thresholds.filter(t=>t!==32))options.push({threshold,mask:isolate(small,threshold)});
  let best=options[0],baseScore=score(describe(small,baseline,32),model),bestScore=baseScore;
  for(const option of options.slice(1)) {
    const predicted=score(describe(small,option.mask,option.threshold),model);
    if(predicted>bestScore && predicted>=baseScore+model.margin){bestScore=predicted;best=option;}
  }
  // Validation only supported automatically restoring foreground (18). Keep
  // the known cutout when the model proposes an unvalidated aggressive cut.
  if (best.threshold!==18) best=options[0];
  return {mask:small===image?best.mask:isolate(image,best.threshold),threshold:best.threshold,candidates:4};
}
