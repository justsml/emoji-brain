import {test,expect} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {repairInteriorAlpha} from './repair-interior-alpha.mjs';

test('restores an erased white eye while preserving a real source cutout and exterior alpha',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-alpha-'));
 try{
  const w=48,h=48,source=Buffer.alloc(w*h*4),generated=Buffer.alloc(w*h*4,255),matte=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,body=x>=6&&x<42&&y>=6&&y<42,eye=x>=12&&x<18&&y>=12&&y<18,cutout=x>=30&&x<36&&y>=30&&y<36;
   source[i]=source[i+1]=source[i+2]=255;source[i+3]=body&&!cutout?255:0;
   matte[i]=matte[i+1]=matte[i+2]=255;matte[i+3]=body&&!cutout&&!eye?255:0;
  }
  const files={source:path.join(dir,'source.png'),generated:path.join(dir,'generated.png'),matte:path.join(dir,'matte.png'),output:path.join(dir,'output.png')};
  for(const [key,data]of Object.entries({source,generated,matte}))await sharp(data,{raw:{width:w,height:h,channels:4}}).png().toFile(files[key]);
  const report=await repairInteriorAlpha(files),result=await sharp(files.output).ensureAlpha().raw().toBuffer();
  expect(report.changedPixels).toBe(36);
  expect(result[(14*w+14)*4+3]).toBe(255);
  expect(result[(32*w+32)*4+3]).toBe(0);
  expect(result[3]).toBe(0);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
