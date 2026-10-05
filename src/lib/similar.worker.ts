import { createSimilarityIndex, type SimilarRecord } from './similarEmojis';
let rank: ReturnType<typeof createSimilarityIndex> | undefined;
self.onmessage = (event: MessageEvent<{catalog?: SimilarRecord[]; sourceId: string}>) => {
  if (event.data.catalog) rank = createSimilarityIndex(event.data.catalog);
  self.postMessage({ sourceId: event.data.sourceId, ids: rank?.(event.data.sourceId) ?? [] });
};
