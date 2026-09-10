import { promises as fs } from 'node:fs';
import path from 'node:path';
import { processSimilarity } from './similarity-pipeline';
import { writeSimilarityReport } from './similarity-report';
import review from './similarity/review-queries.json';
import type { ReviewQuery } from './similarity-evaluation';

const controller = new AbortController();
const stop = () => controller.abort(new Error('Similarity processing interrupted; restart the same command to resume'));
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) {
    console.log('Usage: pnpm process-similarity [--json] [--report[=path]] [--judgments=path]\nOffline, resumable color/shape/animation indexing. Progress goes to stderr; --json prints runtime statistics to stdout. --report writes a local HTML comparison and duplicate-review report. Human judgments are optional; defaults remain provisional.');
  } else {
    if (args.some(a => a !== '--json' && a !== '--report' && !a.startsWith('--report=') && !a.startsWith('--judgments='))) throw new Error('Unknown option; use --help');
    const result = await processSimilarity(process.cwd(), { signal: controller.signal });
    const reportArg = args.find(a => a === '--report' || a.startsWith('--report='));
    const judgmentArg = args.find(a => a.startsWith('--judgments='));
    if (reportArg || judgmentArg) {
      const destination = path.resolve(reportArg?.split('=').slice(1).join('=') || '.cache/similarity/review.html');
      const judgments = judgmentArg ? JSON.parse(await fs.readFile(judgmentArg.slice('--judgments='.length), 'utf8')) : undefined;
      console.error('[report] Generating thumbnails, masks, comparisons, and duplicate candidates…');
      await writeSimilarityReport(process.cwd(), destination, result, review.queries as ReviewQuery[], judgments);
      console.error(`[report] ${destination}`);
    }
    if (args.includes('--json')) console.log(JSON.stringify(result.stats));
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
