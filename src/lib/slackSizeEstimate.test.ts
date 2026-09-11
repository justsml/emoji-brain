import {it, expect} from 'vitest';
import {EXPORT_TIERS, estimateTierBytes, estimateTiers, bestTier, formatBytes, slackSizeFor, type SizedEmoji} from './slackSizeEstimate';

const still = (gzip: number): SizedEmoji => ({animated: false, gzip: {64: gzip, 128: gzip * 2, 256: gzip * 4}});
const animated = (gzip: number): SizedEmoji => ({animated: true, gzip: {64: gzip, 128: gzip * 2, 256: gzip * 4}});

it('charges base64 expansion and script overhead on top of the payload', () => {
  // two stills at 256px: 4 * ceil((400 + 400) / 3) rounds up to 1068
  expect(estimateTierBytes([still(100), still(100)], {still: 256, animated: 128}, 5_000)).toEqual({bytes: 1068 + 5_000, measured: true});
});

it('sizes stills and animations from their own rung of the tier', () => {
  const {bytes} = estimateTierBytes([still(300), animated(300)], {still: 256, animated: 64}, 0);
  expect(bytes).toBe(4 * Math.ceil((1200 + 300) / 3));
});

it('reports an unmeasured estimate when the catalog lacks a figure', () => {
  expect(estimateTierBytes([{animated: false, gzip: {}}], EXPORT_TIERS[0], 10).measured).toBe(false);
});

it('collapses tiers that would produce an identical export', () => {
  // with no animations selected, 256/128 and 256/64 are the same three images
  expect(estimateTiers([still(10)], 0).map(row => row.still)).toEqual([256, 128, 64]);
  // with no stills, the two 64px animated rungs collapse instead
  expect(estimateTiers([animated(10)], 0).map(row => row.animated)).toEqual([128, 64]);
  // a mixed sheet keeps every rung distinct
  expect(estimateTiers([still(10), animated(10)], 0)).toHaveLength(EXPORT_TIERS.length);
});

it('counts each media type for the caller', () => {
  const [row] = estimateTiers([still(10), still(10), animated(10)], 0);
  expect([row.stillCount, row.animatedCount]).toEqual([2, 1]);
});

it('marks tiers over the limit as not fitting', () => {
  const rows = estimateTiers([still(3_000_000)], 0, 8_000_000);
  expect(rows.map(row => row.fits)).toEqual([false, false, true]);
});

it('picks the largest tier expected to fit', () => {
  const rows = estimateTiers([still(3_000_000)], 0, 8_000_000);
  expect(bestTier(rows)!.still).toBe(64);
  expect(bestTier(estimateTiers([still(10)], 0))!.still).toBe(256);
});

it('falls back to the smallest tier when nothing fits, rather than nothing at all', () => {
  const rows = estimateTiers([still(9_000_000)], 0, 8_000_000);
  expect(rows.every(row => !row.fits)).toBe(true);
  expect(bestTier(rows)!.still).toBe(64);
});

it('holds an image to its Slack ceiling without raising the others', () => {
  expect(slackSizeFor({maxSlackSize: 32}, 256)).toBe(32);
  expect(slackSizeFor({maxSlackSize: 256}, 128)).toBe(128);
  // a catalog entry with no recorded ceiling follows the tier
  expect(slackSizeFor({}, 256)).toBe(256);
});

it('prices a capped image at the size it will actually ship', () => {
  const capped: SizedEmoji = {animated: true, maxSlackSize: 64, gzip: {64: 100, 128: 9_000, 256: 90_000}};
  // the 256/128 tier cannot charge this one 128px, because it ships at 64
  expect(estimateTierBytes([capped], {still: 256, animated: 128}, 0).bytes).toBe(4 * Math.ceil(100 / 3));
});

it('formats bytes at a precision people can act on', () => {
  expect(formatBytes(1_240_000)).toBe('1.2 MB');
  expect(formatBytes(786_400)).toBe('786 KB');
  expect(formatBytes(12_000_000)).toBe('12 MB');
  // the limit itself is quoted constantly; it should read as "8 MB", not "8.0 MB"
  expect(formatBytes(8_000_000)).toBe('8 MB');
  // never round a real payload away to "0 KB"
  expect(formatBytes(120)).toBe('1 KB');
});
