import type { checkEmojis } from './emoji-pipeline';

export const googleApiKey = () => process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
export const openRouterApiKey = () => process.env.OPENROUTER_API_KEY?.trim();
export const hasLabellingKey = () => !!(openRouterApiKey() || googleApiKey());

export function checkFailed(report: Awaited<ReturnType<typeof checkEmojis>>) {
  return !!(report.invalid || report.errors.length || report.pendingLabels.length);
}

export function recoveryGuidance(report: Awaited<ReturnType<typeof checkEmojis>>) {
  const lines = ['Run `pnpm update-emojis --update=changes` locally to ingest/import images, label pending images, and refresh metadata. Then run `pnpm check-emojis` and commit the resulting changes.'];
  if (report.pendingLabels.length) {
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      lines.push('Live labelling is disabled in CI. Configure OPENROUTER_API_KEY or a Google Gemini API key locally; do not add it to the PR or workflow.');
    } else if (hasLabellingKey()) {
      lines.push(`An ${openRouterApiKey() ? 'OpenRouter' : 'AI Studio / Google Gemini'} API key is configured locally (presence checked; validity is verified when labelling runs).`);
    } else {
      lines.push('No labelling API key is configured. Set OPENROUTER_API_KEY, or set GOOGLE_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in your local environment or .env (Bun loads it), then rerun `pnpm update-emojis --update=changes`. Obtain a key from OpenRouter or Google AI Studio. Do not commit the key.');
    }
    lines.push('', `Images pending labelling (${report.pendingLabels.length}):`, ...report.pendingLabels.map(filename => `- ${filename}`));
  }
  return lines.join('\n');
}
