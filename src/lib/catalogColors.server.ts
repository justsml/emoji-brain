import sharp from 'sharp';
import {pixelProfile} from './catalogDiscovery';

/** Read tiny, first-frame stills during the static build, never in the browser. */
export async function catalogColors(filenames: string[]): Promise<number[][]> {
  const profiles: number[][] = [];
  for (let start = 0; start < filenames.length; start += 12) {
    profiles.push(...await Promise.all(filenames.slice(start,start+12).map(async filename => {
      const pixels = await sharp(`public/emoji-delivery/previews/64/${filename}`)
        .resize(24,24,{fit:'inside'}).ensureAlpha().raw().toBuffer();
      return pixelProfile(pixels);
    })));
  }
  return profiles;
}
