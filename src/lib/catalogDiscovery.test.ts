import {expect, it} from 'vitest';
import {colorBin, pixelProfile, colorShares, discover, topThemes} from './catalogDiscovery';
import type {EmojiMetadata} from '../types/emoji';

const emoji = (id: string, themes: string[], colors: number[]): EmojiMetadata => ({id,filename:`${id}.webp`,path:'',size:0,categories:[],tags:[],themes,colors});
it('ignores transparent pixels and weights partial alpha when measuring representation', () => {
  const profile = pixelProfile(new Uint8Array([255,0,0,255,0,0,255,0,0,255,0,128]));
  expect(profile[0]).toBe(666);
  expect(profile[3]).toBe(334);
  expect(profile[5]).toBe(0);
  expect(pixelProfile(new Uint8Array([255,255,255,0]))).toEqual(Array(12).fill(0));
  expect(colorBin(30,30,30)).toBe(9);
  expect(colorBin(245,245,245)).toBe(11);
  expect(colorBin(110,60,25)).toBe(8);
});
it('counts each theme once per sticker and filters exact labels', () => {
  const catalog = [emoji('a',['cat','cat','happy'],[1000]),emoji('b',['catfish'],[0]),emoji('c',['cat'],[0])];
  expect(topThemes(catalog)[0]).toEqual({word:'cat',count:2});
  expect(discover(catalog,'cat',null).map(e => e.id)).toEqual(['a','c']);
  expect(discover(catalog,'missing',null)).toEqual([]);
});
it('color sorting retains the whole result set, respects filters and keeps ties stable', () => {
  const catalog = [emoji('green',['cat'],[0,0,0,1000]),emoji('red',['cat'],[1000]),emoji('red2',['happy'],[1000])];
  expect(discover(catalog,null,0).map(e => e.id)).toEqual(['red','red2','green']);
  expect(discover(catalog,'cat',0).map(e => e.id)).toEqual(['red','green']);
  expect(catalog[0].id).toBe('green');
  expect(colorShares(catalog)[0]).toBeCloseTo(2/3);
});
