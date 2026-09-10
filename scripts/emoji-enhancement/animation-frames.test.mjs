import {test,expect} from 'vitest';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {decodeAnimation,encodeAnimation,resizeFrames} from './animation-frames.mjs';
test('round-trips moving RGBA frames, nonuniform delays, and finite loop count',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-timing-'));
 try{
  const frames=[0,1,2].map(frame=>{const b=Buffer.alloc(16*16*4);for(let y=4;y<12;y++)for(let x=3+frame;x<9+frame;x++){const i=(y*16+x)*4;b[i]=255;b[i+3]=128+frame*50}return b});
  const original={frames,width:16,height:16,delays:[40,180,70],loop:3},file=path.join(dir,'out.webp');
  await encodeAnimation(original,file);const decoded=await decodeAnimation(file);
  expect(decoded.delays).toEqual(original.delays);expect(decoded.loop).toBe(3);
  expect(decoded.frames).toEqual(original.frames);
  const resized=await resizeFrames(decoded,64);expect(resized.width).toBe(64);expect(resized.delays).toEqual(original.delays);expect(resized.frames[0].some((v,i)=>i%4===3&&v===0)).toBe(true);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
