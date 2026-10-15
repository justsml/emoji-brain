import { describe, expect, it } from 'vitest';
import { animatedSrcSet, fittingSize, stillImageProps } from './emojiAssets';
import { GRID_SCALES, STICKER_SIZES } from './gridScales';

describe('responsive emoji images', () => {
  it('states the drawn width and falls back to the variant that covers it at 1x', () => {
    expect(stillImageProps('cat wave.webp', 128)).toEqual({
      src: '/emoji-delivery/previews/128/cat%20wave.webp',
      srcSet: '/emoji-delivery/previews/64/cat%20wave.webp 64w, /emoji-delivery/previews/128/cat%20wave.webp 128w, /emoji-delivery/previews/256/cat%20wave.webp 256w',
      sizes: '128px',
    });
    expect(fittingSize(28)).toBe(64);
    expect(fittingSize(96)).toBe(128);
    expect(fittingSize(400)).toBe(256);
  });
  it('offers animations at the same widths as stills', () => {
    expect(animatedSrcSet('party.webp')).toBe('/emoji-delivery/64/party.webp 64w, /emoji-delivery/128/party.webp 128w, /emoji-delivery/256/party.webp 256w');
  });
  it('draws every grid step inside its tile, never upscaled on a 1x screen', () => {
    STICKER_SIZES.forEach((size, step) => {
      expect(fittingSize(size)).toBeGreaterThanOrEqual(size);
      // the preview area is the tile less 0.5rem
      expect(size).toBeLessThanOrEqual(GRID_SCALES[step] - 8);
    });
  });
});
