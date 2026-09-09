import { updateEmojis, checkEmojis, type UpdateMode } from './emoji-pipeline';

try {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) {
    console.log('Usage: pnpm update-emojis [--update[=none|all|changes]]\nDefault: changes. Converts images, ingests public/emojis/ingest, updates metadata, generates stills, validates, and rebuilds search. Live modes send selected images to Google and require GOOGLE_API_KEY.');
  } else {
    if (args.length > 1 || args.some(a => !/^--update(?:=(none|all|changes))?$/.test(a))) throw new Error('Unknown option; use --help');
    const mode = (args[0]?.split('=')[1] ?? 'changes') as UpdateMode;
    if (mode !== 'none' && (process.env.CI || process.env.GITHUB_ACTIONS)) throw new Error('Live labelling is disabled in CI. Run it locally as a maintainer, or use --update=none.');
    if (mode !== 'none' && !process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is required for live labelling; use --update=none for offline updates');
    const label = mode === 'none' ? undefined : (await import('./emoji-labeler')).emojiLabeler;
    console.table(await updateEmojis(process.cwd(), mode, label));
    const report = await checkEmojis(process.cwd());
    if (report.invalid || report.errors.length) throw new Error('Validation failed; run pnpm check-emojis for details');
    await import('./create-pagefind-index');
    console.log('Emoji update and search index complete.');
  }
} catch (error) { console.error(error); process.exitCode = 1; }
