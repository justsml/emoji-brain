import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const port = Number(process.env.PERF_PORT ?? 4322);
export default defineConfig(base, {
  testMatch: '**/*.performance.spec.ts',
  testIgnore: [],
  projects: [{name:'chromium',use:{browserName:'chromium',channel:process.env.PERF_FULL_CHROMIUM ? 'chromium' : undefined,viewport:{width:1440,height:1000}}}],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list'], ['html', {outputFolder: 'playwright-report/performance', open: 'never'}]],
  use: {...base.use, baseURL: `http://localhost:${port}`, viewport: {width: 1440, height: 1000}, trace: 'off', video: 'off'},
  webServer: {command: `pnpm build && PORT=${port} ASTRO_PREVIEW_BACKGROUND=0 pnpm preview --ignore-lock`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 120_000},
});
