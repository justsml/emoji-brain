import { describe, expect, it } from 'vitest';
import { parseExportProgress, waitingHint } from './exportProgress';

describe('parseExportProgress', () => {
  it('turns counted image gathering into a fraction', () => {
    expect(parseExportProgress('Prepared 40 of 366 emojis…')).toEqual({ label: 'Gathering images', detail: '40 of 366', fraction: 40 / 366 });
    expect(parseExportProgress('Preparing 0 of 366 emojis…').fraction).toBe(0);
    expect(parseExportProgress('Prepared 366 of 366 emojis…').fraction).toBe(1);
  });
  it('reads ZIP packing percentages', () => {
    expect(parseExportProgress('Packing ZIP · 37%')).toEqual({ label: 'Packing the ZIP', detail: '37%', fraction: 0.37 });
  });
  it('gives fitting and clipboard stages no fraction', () => {
    expect(parseExportProgress('Checking 128px stills / 64px animations…')).toMatchObject({ fraction: null, label: expect.stringContaining('size limit') });
    expect(parseExportProgress('Checking compressed script size…').fraction).toBeNull();
    expect(parseExportProgress('Copying script to clipboard… Please wait; large exports may briefly pause your browser.').label).toBe('Copying to your clipboard');
  });
  it('passes anything unfamiliar through rather than hiding it', () => {
    expect(parseExportProgress('Warming up…')).toEqual({ label: 'Warming up', fraction: null });
  });
  it('never divides by zero', () => {
    expect(parseExportProgress('Prepared 0 of 0 emojis…').fraction).toBeNull();
  });
});

describe('waitingHint', () => {
  it('says nothing for the first seconds, then escalates', () => {
    expect(waitingHint(3000)).toBeNull();
    expect(waitingHint(7000)).toContain('cancel at any time');
    expect(waitingHint(25_000)).toContain('smaller size');
  });
});
