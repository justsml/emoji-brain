import {test,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {whiteBackgroundMatte} from './white-background-matte.mjs';
test('removes external white while retaining enclosed white eyes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-white-matte-'));
 try{const data=Buffer.alloc(9*9*4,255);for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)if(x===2||x===6||y===2||y===6){const p=(y*9+x)*4;data[p]=data[p+1]=data[p+2]=0;}
 const input=path.join(dir,'source.png'),output=path.join(dir,'alpha.png');await sharp(data,{raw:{width:9,height:9,channels:4}}).png().toFile(input);await whiteBackgroundMatte(input,output);const result=await sharp(output).raw().toBuffer();expect(result[3]).toBe(0);expect([...result.subarray((4*9+4)*4,(4*9+4)*4+4)]).toEqual([255,255,255,255]);expect(result[(2*9+2)*4+3]).toBe(255);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
