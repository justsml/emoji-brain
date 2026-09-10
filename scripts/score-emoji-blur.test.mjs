import { test, expect } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reblurScore, scoreEmoji } from './score-emoji-blur.mjs';

test('increasing Gaussian blur increases the score for the same edge structure', async () => {
  const pixels = Buffer.alloc(128*128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++)pixels[y*128+x]=(Math.floor(x/24)+Math.floor(y/24))%2?255:0;
  const values=[];
  for(const sigma of [0,1,3,6]) {
    let pipeline=sharp(pixels,{raw:{width:128,height:128,channels:1}});
    if(sigma)pipeline=pipeline.blur(sigma);
    const data=await pipeline.greyscale().raw().toBuffer();
    values.push(reblurScore(data,128,128));
  }
  expect(values.every(v=>v>=0&&v<=100)).toBe(true);
  expect(values[0]).toBeLessThan(values[1]);
  expect(values[1]).toBeLessThan(values[2]);
  expect(values[2]).toBeLessThan(values[3]);
});

test('constant images have indeterminate blur',()=>{
  expect(reblurScore(new Float64Array(128*128).fill(200),128,128)).toBeNull();
});

test('animation score equals its extracted first frame',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-blur-test-'));
  try {
    const source='public/emojis/meow_bongotap.webp';
    const still=path.join(directory,'first.png');
    await sharp(source,{page:0,pages:1}).png().toFile(still);
    const animation=await scoreEmoji(source), frame=await scoreEmoji(still);
    expect(animation.frames).toBeGreaterThan(1);
    expect(animation.score).toEqual(frame.score);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('hidden RGB in fully transparent pixels does not affect the score',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emoji-alpha-test-'));
  try {
    const scores=[];
    for(const hidden of [0,255]) {
      const data=Buffer.alloc(128*128*4);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
        const i=(y*128+x)*4, visible=x>32&&x<96&&y>32&&y<96;
        data[i]=data[i+1]=data[i+2]=visible?120:hidden;
        data[i+3]=visible?255:0;
      }
      const file=path.join(directory,`${hidden}.png`);
      await sharp(data,{raw:{width:128,height:128,channels:4}}).png().toFile(file);
      scores.push((await scoreEmoji(file)).score);
    }
    expect(scores[0]).toEqual(scores[1]);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
