import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compareDescriptors, extractDescriptor, paletteDistance, sampleFrames, hammingDistance } from './similarity-descriptors';
import type {PaletteColor} from '../src/types/similarity';
const png=(paint:(x:number,y:number)=>number[])=>sharp(Buffer.from(Array.from({length:1024},(_,i)=>paint(i%32,Math.floor(i/32))).flat()),{raw:{width:32,height:32,channels:4}}).png().toBuffer();
const solid=(r:number,g:number,b:number)=>png(()=>[r,g,b,255]);
describe('appearance descriptors',()=>{
 it('ignores transparent padding and transparent pixel RGB',async()=>{
  const original=await solid(220,30,30);
  const padded=await sharp(original).extend({top:10,bottom:10,left:10,right:10,background:{r:0,g:255,b:0,alpha:0}}).png().toBuffer();
  const a=await extractDescriptor(original),b=await extractDescriptor(padded);
  expect(compareDescriptors(a,b).color).toBeLessThan(1e-9);
  expect(compareDescriptors(a,b).layout).toBeLessThan(1e-9);
  expect(a.frames[0].silhouetteInformative).toBe(false);
  expect(b.frames[0].silhouetteInformative).toBe(false);
  expect(compareDescriptors(a,b).silhouette).toBeNull();
 });
 it('ranks shades before different hues and keeps proportions',async()=>{
  const [red,shade,blue,mixed]=await Promise.all([solid(255,0,0),solid(230,10,10),solid(0,0,255),png(x=>x<16?[255,0,0,255]:[0,0,255,255])].map(async b=>extractDescriptor(await b)));
  expect(compareDescriptors(red,shade).color).toBeLessThan(compareDescriptors(red,blue).color);
  expect(compareDescriptors(red,mixed).color).toBeGreaterThan(compareDescriptors(red,shade).color);
  expect(mixed.palette.reduce((n,p)=>n+p.weight,0)).toBeCloseTo(1);
 });
 it('distinguishes color placement while preserving palette equality',async()=>{
  const a=await extractDescriptor(await png((_,y)=>y<16?[255,0,0,255]:[255,255,255,255]));
  const b=await extractDescriptor(await png((_,y)=>y>=16?[255,0,0,255]:[255,255,255,255]));
  expect(compareDescriptors(a,b).color).toBeLessThan(1e-8);
  expect(compareDescriptors(a,b).layout).toBeGreaterThan(.1);
  expect(compareDescriptors(a,b).silhouette).toBeNull();
 });
 it('handles empty artwork and meaningful direction without NaN',async()=>{
  const empty=await extractDescriptor(await png(()=>[0,200,0,0]));
  expect(empty.empty).toBe(true);expect(empty.palette).toEqual([]);
  expect(compareDescriptors(empty,empty).visual).toBe(0);
  const a=await extractDescriptor(await png((x,y)=>x<8||y>24?[255,0,0,255]:[0,0,0,0]));
  const b=await extractDescriptor(await png((x,y)=>x>23||y>24?[255,0,0,255]:[0,0,0,0]));
  expect(compareDescriptors(a,b).silhouette).toBeGreaterThan(.3);
 });
 it('distinguishes internal detail on the same opaque silhouette',async()=>{
  const a=await extractDescriptor(await png((x,y)=>x>12&&x<20&&y>4&&y<28?[0,0,0,255]:[255,255,255,255]));
  const b=await extractDescriptor(await png((x,y)=>y>12&&y<20&&x>4&&x<28?[0,0,0,255]:[255,255,255,255]));
  expect(compareDescriptors(a,b).edges).toBeGreaterThan(0);
  expect(hammingDistance(a.phash!,b.phash!)).toBeGreaterThan(0);
 });
 it('decodes timed animation and excludes animated perceptual fingerprints',async()=>{
  const data=Buffer.from(Array.from({length:32*64},(_,i)=>i<1024?[0,0,0,0]:[255,0,0,255]).flat());
  const gif=await sharp(data,{raw:{width:32,height:64,channels:4,pageHeight:32}}).gif({delay:[10,990],loop:0}).toBuffer();
  const animated=await extractDescriptor(gif);
  expect(animated.animated).toBe(true);expect(animated.empty).toBe(false);
  expect(animated.phash).toBeNull();expect(animated.sampledFrames).toBe(1);
  expect(animated.palette[0].hex).toBe('#ff0000');
 });
 it('retains the fingerprint of a nearest-neighbor resized copy',async()=>{
  const image=await png((x,y)=>x<y?[255,0,0,255]:[0,0,0,255]);
  const bigger=await sharp(image).resize(64,64,{kernel:'nearest'}).png().toBuffer();
  const a=await extractDescriptor(image),b=await extractDescriptor(bigger);
  expect(hammingDistance(a.phash!,b.phash!)).toBeLessThan(8);
 });
 it('uses duration midpoints and fallback delays',()=>{
  expect(sampleFrames([1,999],2)).toEqual([{index:1,weight:1}]);
  expect(sampleFrames([0,0],2)).toEqual([{index:0,weight:.5},{index:1,weight:.5}]);
  expect(sampleFrames(Array(100).fill(100),100)).toHaveLength(6);
 });
 it('penalizes nonmatching animation frames symmetrically',async()=>{
  const a=await extractDescriptor(await solid(255,0,0)),b=await extractDescriptor(await solid(0,0,255));
  const animation={...a,frames:[{...a.frames[0],weight:.5},{...b.frames[0],weight:.5}],animated:true};
  expect(compareDescriptors(animation,a).layout).toBeGreaterThan(0);
  expect(compareDescriptors(animation,a)).toEqual(compareDescriptors(a,animation));
 });
 it('solves optimal transport independently of palette order',()=>{
  const p=(l:number,w:number):PaletteColor=>({lab:[l,0,0],weight:w,hex:'#000000'});
  const a=[p(0,.5),p(.4,.5)],b=[p(.3,.5),p(1,.5)];
  expect(paletteDistance(a,b)).toBeCloseTo(.45/Math.sqrt(3),10);
  expect(paletteDistance(a,b)).toBeCloseTo(paletteDistance([...a].reverse(),[...b].reverse()),12);
  expect(paletteDistance(a,b)).toBeCloseTo(paletteDistance(b,a),12);
 });
});
