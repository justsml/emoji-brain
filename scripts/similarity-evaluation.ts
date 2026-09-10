import type { PipelineResult, Pair } from './similarity-pipeline';

export interface ReviewQuery { id: string; filename: string; category: string; split: 'tuning' | 'held-out' }
export interface Judgments {
  catalogHash: string; version: string; reviewer: string;
  ratings: { query: string; candidate: string; mode: 'color' | 'visual'; grade: number }[];
}
export const methods = ['histogram', 'color', 'layout', 'visual'] as const;
export type Method = typeof methods[number];
export function ranking(result: PipelineResult, query: string, method: Method) {
  if (method === 'color' || method === 'visual') return result.index.entries[query]?.[method] ?? [];
  return result.pairs.filter(p => (p.a === query || p.b === query) && !result.descriptors[p.a].empty && !result.descriptors[p.b].empty)
    .map(p => ({ id: p.a === query ? p.b : p.a, distance: p.components[method], components: p.components }))
    .sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1)).slice(0, 12);
}
export function evaluate(result: PipelineResult, queries: ReviewQuery[], judgments?: Judgments) {
  const ratings = new Map<string, number>();
  if (judgments) {
    if (judgments.catalogHash !== result.index.catalogHash || judgments.version !== result.index.version) throw new Error('Judgments do not match this catalog and algorithm snapshot');
    if (typeof judgments.reviewer !== 'string' || !judgments.reviewer.trim() || !Array.isArray(judgments.ratings)) throw new Error('Judgments require a named human reviewer and ratings');
    for (const r of judgments.ratings) {
      if (!queries.some(q => q.id === r.query) || !result.index.entries[r.candidate] || r.query === r.candidate || !['color', 'visual'].includes(r.mode) || ![0, 1, 2].includes(r.grade)) throw new Error('Invalid relevance judgment');
      const key = `${r.query}/${r.candidate}/${r.mode}`;
      if (ratings.has(key)) throw new Error(`Duplicate relevance judgment: ${key}`);
      ratings.set(key, r.grade);
    }
  }
  const scores = [];
  for (const split of ['tuning', 'held-out'] as const) for (const method of methods) {
    const selected = queries.filter(q => q.split === split && result.index.entries[q.id]);
    let completeQueries = 0, judged = 0, shown = 0, populated = 0, precision = 0, ndcg = 0;
    for (const q of selected) {
      const list = ranking(result, q.id, method);
      shown += list.length; if (list.length) populated++;
      const mode = method === 'histogram' || method === 'color' ? 'color' : 'visual';
      const grades = list.map(n => ratings.get(`${q.id}/${n.id}/${mode}`));
      judged += grades.filter(g => g !== undefined).length;
      if (!grades.length || grades.some(g => g === undefined)) continue;
      completeQueries++;
      const values = grades as number[];
      precision += values.filter(g => g === 2).length / values.length;
      const dcg = (arr: number[]) => arr.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
      // Normalize only within the returned, judged set. This is not corpus-wide nDCG.
      const ideal = dcg([...values].sort((a, b) => b - a));
      ndcg += ideal ? dcg(values) / ideal : 0;
    }
    scores.push({ split, method, queries: selected.length, completeQueries, displayedResults: shown, judgedResults: judged,
      coverage: selected.length ? populated / selected.length : 0,
      precisionAtDisplayedCutoff: completeQueries ? precision / completeQueries : null,
      withinReturnedSetNdcg: completeQueries ? ndcg / completeQueries : null });
  }
  return { catalogHash: result.index.catalogHash, version: result.index.version, reviewer: judgments?.reviewer ?? null,
    calibration: judgments ? 'Judgments provided; defaults remain provisional until reviewed on tuning queries and confirmed on held-out queries.' : 'Pending human judgments; no measured relevance gain claimed.',
    limitations: '40 category-selected queries are a small, nonrandom sample. Precision uses grade 2, only fully judged nonempty lists. nDCG measures ordering within returned results, not corpus recall. Histogram/layout baselines have no distance cutoff; production modes may return fewer than 12.',
    scores, runtime: result.stats };
}

export function duplicateCandidates(pairs: Pair[], cutoff: number) {
  return pairs.filter(p => p.exact || (p.hamming !== null && p.hamming <= cutoff))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || (a.hamming ?? 65) - (b.hamming ?? 65) || a.a.localeCompare(b.a));
}
