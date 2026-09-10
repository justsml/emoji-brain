import { afterEach, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emojiLabeler, labellingModel } from './emoji-labeler';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function clearKeys() {
  for (const key of ['OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'CI', 'GITHUB_ACTIONS']) vi.stubEnv(key, '');
}

test('OpenRouter key activates the adapter and sends Gemini image requests', async () => {
  clearKeys();
  vi.stubEnv('OPENROUTER_API_KEY', 'router-test-key');
  vi.stubEnv('GOOGLE_API_KEY', 'google-test-key');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    id: 'test', model: 'google/gemini-3.8-flash', created: 1,
    choices: [{ index: 0, message: { role: 'assistant', content: '{"tags":["cat"],"categories":["animal"]}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emoji-labeler-'));
  try {
    const file = path.join(root, 'cat.webp');
    await fs.writeFile(file, Buffer.from('RIFFtestWEBP'));
    expect(JSON.parse(await emojiLabeler(file)).tags).toEqual(['cat']);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer router-test-key');
    const body = JSON.parse(request.body as string);
    expect(body.model).toBe('google/gemini-3.8-flash');
    expect(body.seed).toBe(42);
    expect(body.reasoning).toEqual({ effort: 'minimal' });
    expect(body.temperature).toBeUndefined();
    expect(body.messages[1].content[0].image_url.url).toMatch(/^data:image\/webp;base64,/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('direct Google sends a fixed seed and minimal thinking', async () => {
  clearKeys();
  vi.stubEnv('GOOGLE_API_KEY', 'google-test-key');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text: '{"tags":["cat"],"categories":["animal"]}' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emoji-labeler-'));
  try {
    const file = path.join(root, 'cat.webp');
    await fs.writeFile(file, Buffer.from('RIFFtestWEBP'));
    expect(JSON.parse(await emojiLabeler(file)).tags).toEqual(['cat']);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    const body = JSON.parse(request.body as string);
    expect(body.generationConfig.seed).toBe(42);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(body.generationConfig.temperature).toBeUndefined();
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Google aliases work without OpenRouter and missing keys fail', () => {
  clearKeys();
  expect(() => labellingModel()).toThrow('Set OPENROUTER_API_KEY');
  for (const alias of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
    clearKeys();
    vi.stubEnv(alias, 'google-test-key');
    vi.stubEnv('OPENROUTER_API_KEY', '  ');
    expect(labellingModel().provider).toContain('google');
    expect(labellingModel().modelId).toBe('gemini-3.8-flash');
  }
});

test('CI rejects live labelling even with an OpenRouter key', async () => {
  clearKeys();
  vi.stubEnv('CI', 'true');
  vi.stubEnv('OPENROUTER_API_KEY', 'router-test-key');
  await expect(emojiLabeler('cat.webp')).rejects.toThrow('disabled in CI');
});
