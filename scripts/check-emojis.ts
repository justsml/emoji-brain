import { promises as fs } from 'node:fs';
import { checkEmojis, reportMarkdown, reportTable } from './emoji-pipeline';
import { checkFailed, recoveryGuidance } from './emoji-check-guidance';

try {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.includes('--help')) {
    console.log('Usage: pnpm check-emojis [--json] [--report=path]\nRead-only validation. Exits 1 for invalid, stale, changed, or unlabelled images and pending ingests.');
  } else {
    if (args.some(a => a !== '--json' && !a.startsWith('--report='))) throw new Error('Unknown option; use --help');
    const report = await checkEmojis(process.cwd());
    const output = args.includes('--json') ? JSON.stringify(report, null, 2) : reportTable(report);
    const guidance = checkFailed(report) ? recoveryGuidance(report) : '';
    const markdown = `${reportMarkdown(report)}\n${guidance ? `\n${guidance}\n` : ''}`;
    console.log(output);
    const destination = args.find(a => a.startsWith('--report='))?.slice(9);
    if (destination) await fs.writeFile(destination, args.includes('--json') ? `${output}\n` : markdown);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
    if (checkFailed(report)) {
      console.error(guidance);
      process.exitCode = 1;
    }
  }
} catch (error) { console.error(error); process.exitCode = 1; }
