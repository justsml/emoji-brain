import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Review candidates, not an automatic rejection or replacement decision.
export async function assessImageQuality(file, target = 128) {
  const metadata = await sharp(file, { animated: true }).metadata();
  const width = metadata.width, height = metadata.pageHeight ?? metadata.height;
  // Use native pixels: resizing would change the measured sharpness.
  // Ignore transparent pixels and their neighbors so alpha edges do not inflate it.
  const { data, info } = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum=0, sumSq=0, count=0;
  for(let y=1;y<info.height-1;y++) for(let x=1;x<info.width-1;x++) {
    const indices=[y*info.width+x,(y-1)*info.width+x,(y+1)*info.width+x,y*info.width+x-1,y*info.width+x+1];
    if(indices.some(i=>data[i*info.channels+info.channels-1]<250))continue;
    const [c,t,b,l,r]=indices.map(i=>0.2126*data[i*info.channels]+0.7152*data[i*info.channels+1]+0.0722*data[i*info.channels+2]);
    const value=4*c-t-b-l-r;sum+=value;sumSq+=value*value;count++;
  }
  const laplacianVariance=count?Math.max(0,sumSq/count-(sum/count)**2):null;
  const reasons=[];
  if(Math.max(width,height)<target) reasons.push('low-resolution');
  // Provisional heuristic: flat cartoons and intentional pixel art need human review.
  if(count>=100 && laplacianVariance<80) reasons.push('possible-blur-or-flat-art');
  return {file,width,height,animated:(metadata.pages??1)>1,hasAlpha:metadata.hasAlpha,
    target,upscaleNeeded:Math.max(1,target/Math.max(width,height)),laplacianVariance,
    sampledPixels:count,reasons,needsReview:reasons.length>0};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const folder=process.argv[2]??'public/emojis';
 const files=(await fs.readdir(folder,{withFileTypes:true})).filter(f=>f.isFile()&&/\.(webp|png|jpe?g|gif)$/i.test(f.name));
 const rows=[];
 for(const file of files){try{rows.push(await assessImageQuality(path.join(folder,file.name)));}catch(error){rows.push({file:file.name,error:String(error),needsReview:true});}}
 console.log(JSON.stringify({target:128,warning:'Heuristics require review; blur threshold is uncalibrated. Animated images measured on first frame only.',total:rows.length,candidates:rows.filter(r=>r.needsReview).length,rows},null,2));
}
