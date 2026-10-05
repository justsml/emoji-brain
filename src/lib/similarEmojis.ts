import type { EmojiMetadata } from '../types/emoji';

export type SimilarRecord = Pick<EmojiMetadata, 'id' | 'filename' | 'tags' | 'categories'>;

/** Rare shared labels carry more meaning than catalog-wide style labels. */
export function createSimilarityIndex(catalog: SimilarRecord[]) {
  const labels = (emoji: SimilarRecord) => new Set([
    ...emoji.tags, ...emoji.categories,
    ...emoji.filename.replace(/\.[^.]+$/, '').split(/[-_\s]+/),
  ].map(label => label.toLowerCase()).filter(Boolean));
  const records = catalog.map(emoji => ({ id: emoji.id, labels: labels(emoji), weight: 0 }));
  const counts = new Map<string, number>();
  for (const record of records) for (const label of record.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const weights = new Map([...counts].map(([label, count]) => [label, Math.log(1 + catalog.length / count)]));
  for (const record of records) for (const label of record.labels) record.weight += weights.get(label)!;
  const byId = new Map(records.map(record => [record.id, record]));
  return (sourceId: string, limit = 12): string[] => {
    const source = byId.get(sourceId);
    if (!source) return [];
    return records.filter(record => record !== source).map(record => {
      let shared = 0;
      for (const label of source.labels) if (record.labels.has(label)) shared += weights.get(label)!;
      const union = source.weight + record.weight - shared;
      return { id: record.id, score: union ? shared / union : 0 };
    }).filter(record => record.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit).map(record => record.id);
  };
}

export function rankSimilar(catalog: SimilarRecord[], sourceId: string, limit = 12): string[] {
  return createSimilarityIndex(catalog)(sourceId, limit);
}
