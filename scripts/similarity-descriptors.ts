import sharp from 'sharp';
import type { Lab, PaletteColor, FrameDescriptor, VisualDescriptor, Distances } from '../src/types/similarity';

// Changing any normalization, sampling, metric, or weight requires a version bump.
export const DESCRIPTOR_VERSION = 'oklab8-64rgb-centres-grid4-mask32-duration6-dct-v2';
const SIZE = 32;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const norm = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
export function oklab(r: number, g: number, b: number): Lab {
  const linear = (v: number) => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  [r,g,b] = [r,g,b].map(linear);
  const l = Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m = Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s = Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const BUCKETS = Array.from({length:64}, (_,i) => oklab((i>>4)*85, ((i>>2)&3)*85, (i&3)*85));
/** Equal-duration midpoint quadrature; repeated selected frames accumulate represented time.
 * Invalid/nonpositive delays fall back to 100ms. At most six frames are decoded. */
export function sampleFrames(delays: number[], count: number): {index:number; weight:number}[] {
  const durations = Array.from({length:count}, (_,i) => delays[i] > 0 ? delays[i] : 100);
  const total = durations.reduce((a,b)=>a+b,0), n = Math.min(6,count);
  const selected = new Map<number,number>();
  for (let k=0;k<n;k++) {
    const t = total*(k+.5)/n; let end=0, index=count-1;
    for(let i=0;i<count;i++) {end+=durations[i]; if(t<end){index=i;break;}}
    selected.set(index,(selected.get(index)??0)+1/n);
  }
  return [...selected].map(([index,weight])=>({index,weight}));
}
function palette(points: {lab:Lab; rgb:number[]; weight:number}[]): PaletteColor[] {
  if(!points.length)return [];
  const centers: Lab[] = [[...points.reduce((a,b)=>a.weight>=b.weight?a:b).lab]];
  while(centers.length<8) {
    let best = points[0], score=-1;
    for(const p of points){const s=Math.min(...centers.map(c=>norm(p.lab,c)))**2*p.weight;if(s>score){score=s;best=p;}}
    if(score<1e-14)break; centers.push([...best.lab]);
  }
  let groups: {lab:number[];rgb:number[];weight:number}[]=[];
  for(let pass=0;pass<12;pass++) {
    groups=centers.map(()=>({lab:[0,0,0],rgb:[0,0,0],weight:0}));
    for(const p of points){let index=0,d=Infinity;centers.forEach((c,i)=>{const nd=norm(p.lab,c);if(nd<d){d=nd;index=i;}});const g=groups[index];g.weight+=p.weight;for(let k=0;k<3;k++){g.lab[k]+=p.lab[k]*p.weight;g.rgb[k]+=p.rgb[k]*p.weight;}}
    groups.forEach((g,i)=>{if(g.weight)centers[i]=g.lab.map(v=>v/g.weight) as Lab;});
  }
  const total=groups.reduce((a,b)=>a+b.weight,0);
  return groups.filter(g=>g.weight>0).map(g=>({lab:g.lab.map(v=>v/g.weight) as Lab,hex:'#'+g.rgb.map(v=>Math.round(v/g.weight).toString(16).padStart(2,'0')).join(''),weight:g.weight/total})).sort((a,b)=>b.weight-a.weight||a.hex.localeCompare(b.hex));
}
/** Exact minimum-cost flow (successive shortest residual paths), mass tolerance 1e-10.
 * Euclidean Oklab distance divided by sqrt(3), a conservative unit-cube bound. */
export function paletteDistance(a: PaletteColor[], b: PaletteColor[]): number {
  if(!a.length||!b.length)return a.length===b.length?0:1;
  type Edge={to:number;cap:number;cost:number;rev:number};
  const source=a.length+b.length,sink=source+1,n=sink+1,graph:Edge[][]=Array.from({length:n},()=>[]);
  const add=(u:number,v:number,cap:number,cost:number)=>{graph[u].push({to:v,cap,cost,rev:graph[v].length});graph[v].push({to:u,cap:0,cost:-cost,rev:graph[u].length-1});};
  a.forEach((p,i)=>add(source,i,p.weight,0));b.forEach((p,j)=>add(a.length+j,sink,p.weight,0));
  a.forEach((p,i)=>b.forEach((q,j)=>add(i,a.length+j,1,norm(p.lab,q.lab)/Math.sqrt(3))));
  let result=0;
  for(let iteration=0;iteration<256;iteration++) {
    const d=Array(n).fill(Infinity), prev=Array(n).fill(null) as ([number,number]|null)[];d[source]=0;
    for(let k=0;k<n-1;k++){let changed=false;for(let u=0;u<n;u++)graph[u].forEach((e,i)=>{if(e.cap>1e-10&&d[e.to]>d[u]+e.cost+1e-14){d[e.to]=d[u]+e.cost;prev[e.to]=[u,i];changed=true;}});if(!changed)break;}
    if(!prev[sink])return clamp(result);
    let amount=1;for(let v=sink;v!==source;){const [u,i]=prev[v]!;amount=Math.min(amount,graph[u][i].cap);v=u;}
    for(let v=sink;v!==source;){const [u,i]=prev[v]!,e=graph[u][i];e.cap-=amount;graph[v][e.rev].cap+=amount;v=u;}
    result+=amount*d[sink];
  }
  throw new Error('Palette transport solver did not converge');
}
function phash(data: Uint8Array): string {
  const gray=Array.from({length:1024},(_,i)=>{const a=data[i*4+3]/255;return (.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])*a+255*(1-a);});
  const coefficients:number[]=[];
  for(let v=0;v<8;v++)for(let u=0;u<8;u++){let sum=0;for(let y=0;y<32;y++)for(let x=0;x<32;x++)sum+=gray[y*32+x]*Math.cos(Math.PI*(2*x+1)*u/64)*Math.cos(Math.PI*(2*y+1)*v/64);coefficients.push(Math.abs(sum)<1e-8?0:sum);}
  const sorted=coefficients.slice(1).sort((a,b)=>a-b),median=sorted[31];
  // DC is excluded so brightness alone cannot dominate duplicate retrieval.
  const tolerance = Math.abs(coefficients[0]) * .001;
  return coefficients.slice(1).map(v=>v>median+tolerance?'1':'0').join('');
}
export function hammingDistance(a:string,b:string):number {if(a.length!==b.length)throw new Error('Fingerprint length mismatch');return [...a].reduce((n,c,i)=>n+Number(c!==b[i]),0);}
export async function extractDescriptor(buffer: Buffer): Promise<VisualDescriptor> {
  const meta=await sharp(buffer).metadata(), count=meta.pages??1, samples=sampleFrames(meta.delay??[],count);
  const points:{lab:Lab;rgb:number[];weight:number}[]=[],histogram=Array(64).fill(0),frames:FrameDescriptor[]=[];
  let fingerprint:string|null=null;
  for(const sample of samples){
    const {data:raw,info}=await sharp(buffer,{page:sample.index,pages:1}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,top=info.height,right=-1,bottom=-1;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(raw[(y*info.width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const data=right<0?Buffer.alloc(4096):await sharp(raw,{raw:{width:info.width,height:info.height,channels:4}}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(32,32,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).raw().toBuffer();
    const layout=Array.from({length:16},()=>[0,0,0,0]),mask:number[]=[],edges=Array(1024).fill(0),light:number[]=[];
    for(let i=0;i<1024;i++){
      const rgb=[data[i*4],data[i*4+1],data[i*4+2]],alpha=data[i*4+3]/255,lab=oklab(rgb[0],rgb[1],rgb[2]);mask.push(alpha);light.push(lab[0]);
      const cell=layout[Math.floor(Math.floor(i/32)/8)*4+Math.floor((i%32)/8)];cell[3]+=alpha/64;for(let k=0;k<3;k++)cell[k]+=lab[k]*alpha/64;
      if(alpha){points.push({lab,rgb,weight:alpha*sample.weight});let nearest=0,d=Infinity;BUCKETS.forEach((b,j)=>{const nd=norm(lab,b);if(nd<d){nearest=j;d=nd;}});histogram[nearest]+=alpha*sample.weight;}
    }
    layout.forEach(c=>{if(c[3])for(let k=0;k<3;k++)c[k]/=c[3];});
    for(let y=1;y<31;y++)for(let x=1;x<31;x++){const i=y*32+x;if(mask[i]>.5&&[i-1,i+1,i-32,i+32].every(j=>mask[j]>.5))edges[i]=Math.hypot(light[i+1]-light[i-1],light[i+32]-light[i-32])>.12?1:0;}
    // A fully opaque trimmed rectangle has no silhouette evidence. Transparent
    // padding must not change this decision relative to the unpadded source.
    let opaque=right>=0;
    for(let y=top;y<=bottom&&opaque;y++)for(let x=left;x<=right;x++)if(raw[(y*info.width+x)*4+3]!==255){opaque=false;break;}
    frames.push({weight:sample.weight,layout,mask,edges,silhouetteInformative:right>=0&&!opaque});
    if(count===1)fingerprint=phash(data);
  }
  const total=histogram.reduce((a,b)=>a+b,0);
  return {palette:palette(points),histogram:histogram.map(v=>total?v/total:0),frames,animated:count>1,sampledFrames:samples.length,empty:total===0,phash:fingerprint};
}
const edgeCache=new WeakMap<FrameDescriptor,number[]>();
function edgeField(frame:FrameDescriptor):number[]{let cached=edgeCache.get(frame);if(cached)return cached;const active=frame.edges.flatMap((v,i)=>v?[i]:[]);cached=frame.edges.map((_,i)=>active.length?Math.min(...active.map(j=>Math.hypot(i%32-j%32,Math.floor(i/32)-Math.floor(j/32))))/Math.hypot(31,31):1);edgeCache.set(frame,cached);return cached;}
function frameDistances(a:FrameDescriptor,b:FrameDescriptor){
  const layout=a.layout.reduce((s,c,i)=>{const d=b.layout[i];return s+(Math.min(c[3],d[3])*norm(c.slice(0,3),d.slice(0,3))/Math.sqrt(3)+Math.abs(c[3]-d[3]));},0)/16;
  let intersection=0,union=0;for(let i=0;i<1024;i++){intersection+=Math.min(a.mask[i],b.mask[i]);union+=Math.max(a.mask[i],b.mask[i]);}
  const silhouette=a.silhouetteInformative&&b.silhouetteInformative&&union?1-intersection/union:null;
  const na=a.edges.reduce((s,v)=>s+v,0),nb=b.edges.reduce((s,v)=>s+v,0);
  const edges=na&&nb?(a.edges.reduce((s,v,i)=>s+v*edgeField(b)[i],0)/na+b.edges.reduce((s,v,i)=>s+v*edgeField(a)[i],0)/nb)/2:na||nb?1:null;
  return {layout,silhouette,edges};
}
export function compareDescriptors(a:VisualDescriptor,b:VisualDescriptor):Distances {
  const histogram=a.histogram.reduce((s,v,i)=>s+Math.abs(v-b.histogram[i]),0)/2,color=paletteDistance(a.palette,b.palette);
  // Expected pair distance is symmetric, duration weighted, and penalizes nonmatching
  // portions rather than allowing one coincidental frame to determine the result.
  let layout=0,silhouette=0,edges=0,sw=0,ew=0;
  for(const x of a.frames)for(const y of b.frames){const d=frameDistances(x,y),w=x.weight*y.weight;layout+=w*d.layout;if(d.silhouette!==null){silhouette+=w*d.silhouette;sw+=w;}if(d.edges!==null){edges+=w*d.edges;ew+=w;}}
  const sd=sw?silhouette/sw:null,ed=ew?edges/ew:null;
  const visual=(.45*color+.3*layout+(sd===null?0:.15*sd)+(ed===null?0:.1*ed))/(.75+(sd===null?0:.15)+(ed===null?0:.1));
  return {histogram,color,layout,silhouette:sd,edges:ed,visual:clamp(visual)};
}
