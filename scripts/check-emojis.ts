import { promises as fs } from 'node:fs';
import { checkEmojis, reportTable } from './emoji-pipeline';

try {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) {
    console.log('Usage: pnpm check-emojis [--json] [--report=path]\nRead-only validation. Exits 1 for invalid or stale metadata/images; completeness and mtime differences are informational.');
  } else {
    if (args.some(a => a !== '--json' && !a.startsWith('--report='))) throw new Error('Unknown option; use --help');
    const report = await checkEmojis(process.cwd());
    const output = args.includes('--json') ? JSON.stringify(report, null, 2) : reportTable(report);
    console.log(output);
    const destination = args.find(a => a.startsWith('--report='))?.slice(9);
    if (destination) await fs.writeFile(destination, `${output}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${reportTable(report)}\n`);
    if (report.invalid || report.errors.length) process.exitCode = 1;
  }
} catch (error) { console.error(error); process.exitCode = 1; }
