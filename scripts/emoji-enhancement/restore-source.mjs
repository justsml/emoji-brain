import sharp from 'sharp';import fs from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';
const exec=promisify(execFile);
export async function restoreSource(source,output){
 const white=output+'.source-white.png',upscaled=output+'.source-sr.png';
 await sharp(source).flatten({background:'white'}).png().toFile(white);
 await exec(process.env.EMOJI_MATTE_PYTHON??'/tmp/emoji-enhancement-venv/bin/python',['scripts/emoji-enhancement/local-upscale.py',white,upscaled,'/tmp/emoji-models/realesr-animevideov3.pth']);
 const {data:base,info}=await sharp(source).resize({width:512,height:512,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=await sharp(upscaled).resize(info.width,info.height).ensureAlpha().raw().toBuffer();
 for(let i=0;i<base.length;i+=4){const a=base[i+3]/255;for(let c=0;c<3;c++)base[i+c]=a?Math.round(Math.max(0,Math.min(255,(rgb[i+c]-(1-a)*255)/a))):0;}
 await sharp(base,{raw:info}).png().toFile(output);
}
