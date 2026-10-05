import { describe, expect, it } from 'vitest';
import { rankSimilar, type SimilarRecord } from './similarEmojis';

describe('similar emoji ranking', () => {
  const catalog: SimilarRecord[] = [
    {id: 'source', filename: 'cat-party.webp', tags: ['cat', 'party', 'vector'], categories: ['reaction']},
    {id: 'match', filename: 'cat-celebrate.webp', tags: ['cat', 'party', 'vector'], categories: ['reaction']},
    {id: 'style', filename: 'dog.webp', tags: ['vector'], categories: ['reaction']},
    {id: 'unrelated', filename: 'number.webp', tags: ['number'], categories: []},
  ];
  it('ranks shared subject and mood ahead of generic style, excludes source and unrelated entries', () => {
    expect(rankSimilar(catalog, 'source')).toEqual(['match', 'style']);
    expect(rankSimilar(catalog, 'source', 1)).toEqual(['match']);
  });
  it('returns no suggestions for a missing source without changing the catalog', () => {
    const before = JSON.stringify(catalog);
    expect(rankSimilar(catalog, 'missing')).toEqual([]);
    rankSimilar(catalog, 'source');
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
