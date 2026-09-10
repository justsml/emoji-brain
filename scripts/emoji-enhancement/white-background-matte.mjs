import sharp from 'sharp';
// For outlined flat artwork on a uniform white canvas only. Flood from the
// canvas border so enclosed white eye/letter regions remain opaque.
export async function whiteBackgroundMatte(input,output){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,n=w*h,exterior=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 function add(p){if(exterior[p])return;const o=p*4;if(Math.min(data[o],data[o+1],data[o+2])<245)return;exterior[p]=1;queue[tail++]=p;}
 for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}
 while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);if(x)add(p-1);if(x<w-1)add(p+1);if(y)add(p-w);if(y<h-1)add(p+w);}
 for(let p=0;p<n;p++)if(exterior[p])data[p*4+3]=0;
 // Decontaminate only the one-pixel edge adjoining removed white. Black
 // outlines make this applicable to this hand-reviewed subset of artwork.
 for(let p=0;p<n;p++){if(exterior[p])continue;const x=p%w,y=Math.floor(p/w);if(!((x&&exterior[p-1])||(x<w-1&&exterior[p+1])||(y&&exterior[p-w])||(y<h-1&&exterior[p+w])))continue;const o=p*4,min=Math.min(data[o],data[o+1],data[o+2]),max=Math.max(data[o],data[o+1],data[o+2]);if(max-min<12&&min>0){data[o+3]=255-min;for(let c=0;c<3;c++)data[o+c]=Math.round((data[o+c]-min)*255/(255-min));}}
 await sharp(data,{raw:info}).png().toFile(output);return {method:'border-connected white removal',removedPixels:tail};
}
