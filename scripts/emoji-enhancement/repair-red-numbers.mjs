import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
// These two reviewed monochrome drawings have disconnected decorative rings.
// Keep the numeral/underline fills, remove rings and canvas, and rebuild alpha.
for(const [name,count] of [['100000',8],['99',4]]){
 const dir='experiments/image-enhancement/remaining-stills';
 const {data,info}=await sharp(`${dir}/${name}.generated.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,n=w*h,seen=new Uint8Array(n),parts=[];
 const chroma=p=>data[p*4]-Math.max(data[p*4+1],data[p*4+2]);
 for(let p=0;p<n;p++)if(!seen[p]&&chroma(p)>40){
  const q=[p];seen[p]=1;
  for(let i=0;i<q.length;i++){const v=q[i],x=v%w,y=Math.floor(v/w);for(const t of [x?v-1:-1,x<w-1?v+1:-1,y?v-w:-1,y<h-1?v+w:-1])if(t>=0&&!seen[t]&&chroma(t)>40){seen[t]=1;q.push(t)}}parts.push(q);
 }
 parts.sort((a,b)=>b.length-a.length);
 const selected=parts.filter(part=>(name==='100000'?[126326,83041,45922,45803,45751,45707,45521,27731]:[74372,66191,35426,26211]).includes(part.length));
 if(selected.length!==count)throw Error('Reviewed component geometry changed '+name);
 const keep=new Uint8Array(n);for(const part of selected)for(const p of part)keep[p]=1;
 const channels=[[],[],[]];for(let p=0;p<n;p++)if(keep[p]&&chroma(p)>100)for(let c=0;c<3;c++)channels[c].push(data[p*4+c]);
 const fill=channels.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]),fullChroma=fill[0]-Math.max(fill[1],fill[2]);
 const output=Buffer.alloc(data.length);
 for(let p=0;p<n;p++){
  const x=p%w,y=Math.floor(p/w),neighbors=[x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1];
  if(!keep[p]&&!neighbors.some(t=>t>=0&&keep[t]))continue;
  const edge=neighbors.some(t=>t<0||!keep[t]);
  const alpha=edge?Math.max(0,Math.min(255,Math.round(chroma(p)/fullChroma*255))):255;
  for(let c=0;c<3;c++)output[p*4+c]=fill[c];output[p*4+3]=alpha;
 }
 const target=`${dir}/${name}.border-alpha.png`;await sharp(output,{raw:info}).png().toFile(target);
 const planFile=`${dir}/${name}.prompt-plan.json`,plan=JSON.parse(await fs.readFile(planFile));
 plan.alphaStrategy='reviewed-red-fills';plan.alphaCorrection={method:'Retain the disconnected numeral and underline fills; remove decorative outlines, canvas and spurious marks; rebuild antialiased alpha',components:count,fill,inputSha256:createHash('sha256').update(await fs.readFile(`${dir}/${name}.generated.png`)).digest('hex')};
 await fs.writeFile(planFile,JSON.stringify(plan,null,2));
 await sharp(target).resize(500,500,{fit:'inside'}).png().toFile(`/tmp/${name}-fixed.png`);
 console.log(name,{fill,kept:selected.map(p=>p.length)});
}
