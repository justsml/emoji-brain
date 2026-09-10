import { updateEmojis, checkEmojis, type UpdateMode } from './emoji-pipeline';
import { checkFailed, hasLabellingKey, recoveryGuidance } from './emoji-check-guidance';

try {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) {
    console.log('Usage: pnpm update-emojis [--update[=none|all|changes]]\nDefault: changes. Converts images, ingests public/emojis/ingest, updates metadata, generates stills, validates, and rebuilds search. Live modes send selected images to Google directly or through OpenRouter. Set OPENROUTER_API_KEY or a Google Gemini key.');
  } else {
    if (args.length > 1 || args.some(a => !/^--update(?:=(none|all|changes))?$/.test(a))) throw new Error('Unknown option; use --help');
    const mode = (args[0]?.split('=')[1] ?? 'changes') as UpdateMode;
    if (mode !== 'none' && (process.env.CI || process.env.GITHUB_ACTIONS || !hasLabellingKey())) {
      const report = await checkEmojis(process.cwd());
      if (mode === 'all') report.pendingLabels = [...new Set([...report.pendingLabels, ...report.rows.filter(row => row.exists).map(row => `public/emojis/${row.filename}`)])];
      throw new Error(`${process.env.CI || process.env.GITHUB_ACTIONS ? 'Live labelling is disabled in CI.' : 'A labelling API key is required. Set OPENROUTER_API_KEY, or set GOOGLE_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in your local environment or .env.'}\n${recoveryGuidance(report)}`);
    }
    const label = mode === 'none' ? undefined : (await import('./emoji-labeler')).emojiLabeler;
    console.table(await updateEmojis(process.cwd(), mode, label));
    const report = await checkEmojis(process.cwd());
    if (checkFailed(report)) throw new Error(`Validation failed; run pnpm check-emojis for details.\n${recoveryGuidance(report)}`);
    await import('./create-pagefind-index');
    console.log('Emoji update and search index complete.');
  }
} catch (error) { console.error(error); process.exitCode = 1; }
