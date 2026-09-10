import fs from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
// Only repair enclosed matte holes supported by opaque pixels in the original.
// A hole must NOT connect to the image border at alpha < 128. Preserve real
// cutouts when the source has transparency in the corresponding area.
export async function repairInteriorAlpha({source,generated,matte,output}) {
 const {data,info}=await sharp(matte).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=await sharp(generated).resize(info.width,info.height).ensureAlpha().raw().toBuffer();
 const src=await sharp(source,{page:0,pages:1}).resize(info.width,info.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const w=info.width,h=info.height,n=w*h,seen=new Uint8Array(n),repair=new Uint8Array(n),outside=new Uint8Array(n),holes=[];
 for(let seed=0;seed<n;seed++){
  if(seen[seed]||data[seed*4+3]>=128)continue;
  const q=[seed];seen[seed]=1;let exterior=false,opaque=0;
  for(let p=0;p<q.length;p++){const i=q[p],x=i%w,y=Math.floor(i/w);if(x===0||y===0||x===w-1||y===h-1)exterior=true;if(src[i*4+3]>247)opaque++;
   for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!seen[j]&&data[j*4+3]<128){seen[j]=1;q.push(j)}
  }
  if(exterior){for(const i of q)outside[i]=1;continue;}if(q.length<4)continue;
  const supported=opaque/q.length>=.95;
  holes.push({pixels:q.length,sourceOpaqueFraction:opaque/q.length,repaired:supported});
  if(supported)for(const i of q)repair[i]=1;
 }
 // Cover the antialiased margin of a repaired hole without flood-filling
 // near-opaque bridges that can reach the outer silhouette.
 const dilated=repair.slice(),distance=new Uint8Array(n),frontier=[];
 for(let i=0;i<n;i++)if(repair[i])frontier.push(i);
 for(let k=0;k<frontier.length;k++){const i=frontier[k];if(distance[i]>=16)continue;const x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!dilated[j]&&!outside[j]&&data[j*4+3]<255&&src[j*4+3]>247){dilated[j]=1;distance[j]=distance[i]+1;frontier.push(j)}}
 let changed=0;for(let i=0;i<n;i++)if(dilated[i]&&data[i*4+3]<255){for(let c=0;c<3;c++)data[i*4+c]=rgb[i*4+c];data[i*4+3]=255;changed++}
 await fs.mkdir(path.dirname(output),{recursive:true});
 await sharp(data,{raw:info}).png().toFile(output);
 return {holes,changedPixels:changed,needsHumanAlphaReview:true};
}
