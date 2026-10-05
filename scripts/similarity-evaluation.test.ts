import { describe, expect, it } from 'vitest';
import { duplicateCandidates, evaluate, ranking, type Judgments, type ReviewQuery } from './similarity-evaluation';
import type { PipelineResult, Pair } from './similarity-pipeline';
import type { Distances, VisualDescriptor } from '../src/types/similarity';

const components: Distances = { histogram: .1, color: .1, layout: .2, visual: .2, silhouette: null, edges: null };
const descriptor: VisualDescriptor = { palette: [], histogram: [], frames: [], animated: false, sampledFrames: 1, empty: false, phash: null };
const pair = (a: string, b: string, distance = .1): Pair => ({ a, b, components: { ...components, histogram: distance, layout: distance }, exact: false, hamming: null });
const neighbor = (id: string) => ({ id, distance: .1, components });
const queries: ReviewQuery[] = [
  { id: 'tune', filename: 'tune.png', category: 'cutout', split: 'tuning' },
  { id: 'hold', filename: 'hold.png', category: 'opaque', split: 'held-out' },
];
function fixture(): PipelineResult {
  return {
    index: { version: 'v1', catalogHash: 'snapshot', entries: Object.fromEntries(['tune', 'hold', 'a', 'b'].map(id => [id, {
      palette: [], color: ['tune', 'hold'].includes(id) ? [neighbor('a'), neighbor('b')] : [], visual: ['tune', 'hold'].includes(id) ? [neighbor('b'), neighbor('a')] : [],
    }])) },
    images: [], descriptors: Object.fromEntries(['tune', 'hold', 'a', 'b'].map(id => [id, descriptor])),
    pairs: [pair('tune', 'b'), pair('tune', 'a'), pair('hold', 'a'), pair('hold', 'b')],
    stats: { status: 'complete', total: 4, processed: 4, cacheHits: 0, failed: 0, comparisons: 4, comparisonCacheHits: 0, sampledFrames: 4,
      discoverySeconds: 0, extractionSeconds: 1, comparisonSeconds: 1, publicationSeconds: 0, elapsedSeconds: 2, imagesPerSecond: 4, imagesPerMinute: 240, comparisonsPerSecond: 4, peakRssBytes: 1, indexBytes: 1 },
  };
}
function judgments(ratings: Judgments['ratings'] = []): Judgments { return { version: 'v1', catalogHash: 'snapshot', reviewer: 'Fixture reviewer (synthetic test only)', ratings }; }
const rating = (query: string, candidate: string, grade: number, mode: 'color' | 'visual' = 'color') => ({ query, candidate, grade, mode });

describe('judged similarity evaluation', () => {
  it('leaves unjudged quality metrics null while measuring coverage and runtime', () => {
    const result = fixture(); const evaluation = evaluate(result, queries);
    expect(evaluation.reviewer).toBeNull(); expect(evaluation.calibration).toContain('Pending human judgments');
    expect(evaluation.runtime).toBe(result.stats);
    expect(evaluation.scores).toHaveLength(8);
    for (const score of evaluation.scores) {
      expect(score.precisionAtDisplayedCutoff).toBeNull(); expect(score.withinReturnedSetNdcg).toBeNull();
      expect(score.completeQueries).toBe(0); expect(score.judgedResults).toBe(0); expect(score.coverage).toBe(1);
    }
  });
  it('counts partial judgments without treating missing judgments as irrelevant', () => {
    const evaluation = evaluate(fixture(), queries, judgments([rating('tune', 'a', 2)]));
    const score = evaluation.scores.find(s => s.split === 'tuning' && s.method === 'color')!;
    expect(score.judgedResults).toBe(1); expect(score.displayedResults).toBe(2);
    expect(score.completeQueries).toBe(0); expect(score.precisionAtDisplayedCutoff).toBeNull(); expect(score.withinReturnedSetNdcg).toBeNull();
  });
  it('keeps tuning, held-out, and color/visual judgments isolated', () => {
    const evaluation = evaluate(fixture(), queries, judgments([rating('tune', 'a', 2), rating('tune', 'b', 0), rating('hold', 'a', 0), rating('hold', 'b', 0), rating('tune', 'a', 2, 'visual'), rating('tune', 'b', 1, 'visual')]));
    const score = (split: string, method: string) => evaluation.scores.find(s => s.split === split && s.method === method)!;
    expect(score('tuning', 'color').precisionAtDisplayedCutoff).toBe(.5);
    expect(score('held-out', 'color').precisionAtDisplayedCutoff).toBe(0);
    expect(score('held-out', 'visual').precisionAtDisplayedCutoff).toBeNull();
    expect(score('tuning', 'color').withinReturnedSetNdcg).toBe(1);
    expect(score('tuning', 'visual').withinReturnedSetNdcg).toBeCloseTo((1 + 3 / Math.log2(3)) / (3 + 1 / Math.log2(3)));
  });
  it('excludes empty lists from quality metrics and includes them in coverage', () => {
    const result = fixture(); result.index.entries.tune.color = [];
    const score = evaluate(result, queries, judgments()).scores.find(s => s.split === 'tuning' && s.method === 'color')!;
    expect(score.coverage).toBe(0); expect(score.completeQueries).toBe(0); expect(score.precisionAtDisplayedCutoff).toBeNull();
  });
  it.each([{ catalogHash: 'different' }, { version: 'v2' }])('rejects mismatched snapshots %j', (changes) => {
    expect(() => evaluate(fixture(), queries, { ...judgments(), ...changes })).toThrow(/snapshot/);
  });
  it('rejects duplicate grades rather than silently overwriting them', () => {
    expect(() => evaluate(fixture(), queries, judgments([rating('tune', 'a', 2), rating('tune', 'a', 0)]))).toThrow(/Duplicate/);
  });
  it.each([rating('tune', 'a', -1), rating('tune', 'a', 3), rating('tune', 'a', NaN), rating('tune', 'a', .5), rating('tune', 'tune', 2), rating('missing', 'a', 2), rating('tune', 'missing', 2)])('rejects invalid relevance judgments %j', (r) => {
    expect(() => evaluate(fixture(), queries, judgments([r]))).toThrow(/Invalid relevance/);
  });
  it('requires reviewer attribution', () => {
    expect(() => evaluate(fixture(), queries, { ...judgments(), reviewer: ' ' })).toThrow(/human reviewer/);
  });
});

describe('review candidate retrieval', () => {
  it('orders tied baseline candidates by stable ID and excludes empty artwork', () => {
    const result = fixture(); expect(ranking(result, 'tune', 'histogram').map(n => n.id)).toEqual(['a', 'b']);
    result.descriptors.a = { ...descriptor, empty: true };
    expect(ranking(result, 'tune', 'layout').map(n => n.id)).toEqual(['b']);
  });
  it('keeps exact evidence and bounded perceptual candidates separate from unsupported pairs', () => {
    const pairs = [{ ...pair('a', 'b'), hamming: 7 }, { ...pair('a', 'c'), hamming: 6 }, { ...pair('b', 'c'), exact: true }, pair('c', 'd')];
    expect(duplicateCandidates(pairs, 6)).toEqual([pairs[2], pairs[1]]);
  });
});
