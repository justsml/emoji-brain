import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as breathe } from 'node:timers/promises';
import { DESCRIPTOR_VERSION, extractDescriptor, compareDescriptors, hammingDistance } from './similarity-descriptors';
import type { Distances, SimilarityIndex, VisualDescriptor } from '../src/types/similarity';

export const POLICY = { version: 'neighbors-1', limit: 12, colorCutoff: 0.22, visualCutoff: 0.3, duplicateCutoff: 6 };
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export interface CatalogImage { id: string; filename: string; path: string; hash?: string; animated?: boolean }
export interface Pair { a: string; b: string; components: Distances; hamming: number | null; exact: boolean }
export interface ProcessingStats {
  status: 'complete' | 'failed'; total: number; processed: number; cacheHits: number; failed: number;
  comparisons: number; comparisonCacheHits: number; sampledFrames: number;
  discoverySeconds: number; extractionSeconds: number; comparisonSeconds: number; publicationSeconds: number;
  elapsedSeconds: number; imagesPerSecond: number; imagesPerMinute: number; comparisonsPerSecond: number;
  peakRssBytes: number; indexBytes: number;
}
export interface PipelineResult {
  index: SimilarityIndex; images: CatalogImage[]; descriptors: Record<string, VisualDescriptor>;
  pairs: Pair[]; stats: ProcessingStats;
}
interface Options {
  cacheDir?: string; output?: string; version?: string; signal?: AbortSignal;
  progress?: (message: string) => void;
  extract?: typeof extractDescriptor; compare?: typeof compareDescriptors;
}
export async function atomicWrite(file: string, value: unknown, signal?: AbortSignal) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temp, `${JSON.stringify(value)}\n`); signal?.throwIfAborted(); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
async function cached<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error: any) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined; throw error; }
}
function validateDistances(d: Distances) {
  return d && ['histogram', 'color', 'layout', 'visual'].every(k => Number.isFinite(d[k as keyof Distances]) && d[k as keyof Distances]! >= 0 && d[k as keyof Distances]! <= 1 + 1e-8)
    && ['silhouette', 'edges'].every(k => d[k as keyof Distances] === null || (Number.isFinite(d[k as keyof Distances]) && d[k as keyof Distances]! >= 0 && d[k as keyof Distances]! <= 1 + 1e-8));
}
function validDescriptor(d: VisualDescriptor) {
  const vector = (a: unknown, length: number, min = -Infinity, max = Infinity): a is number[] =>
    Array.isArray(a) && a.length === length && a.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
  return d && typeof d.empty === 'boolean' && typeof d.animated === 'boolean'
    && Number.isInteger(d.sampledFrames) && d.sampledFrames > 0 && d.sampledFrames <= 6
    && (d.phash === null || (typeof d.phash === 'string' && /^[01]{63}$/.test(d.phash)))
    && (!d.animated || d.phash === null)
    && vector(d.histogram, 64, 0, 1)
    && Array.isArray(d.palette) && d.palette.length <= 8
    && d.palette.every(p => p && vector(p.lab, 3, -1, 1 + 1e-8) && p.lab[0] >= 0 && /^#[0-9a-f]{6}$/i.test(p.hex) && Number.isFinite(p.weight) && p.weight > 0 && p.weight <= 1)
    && Math.abs(d.palette.reduce((s, p) => s + p.weight, 0) - (d.empty ? 0 : 1)) < 1e-8
    && Math.abs(d.histogram.reduce((s, v) => s + v, 0) - (d.empty ? 0 : 1)) < 1e-8
    && Array.isArray(d.frames) && d.frames.length === d.sampledFrames
    && d.frames.every(f => f && Number.isFinite(f.weight) && f.weight > 0 && f.weight <= 1
      && typeof f.silhouetteInformative === 'boolean' && vector(f.mask, 1024, 0, 1) && vector(f.edges, 1024, 0, 1)
      && Array.isArray(f.layout) && f.layout.length === 16 && f.layout.every(c => vector(c, 4) && c[3] >= 0 && c[3] <= 1))
    && Math.abs(d.frames.reduce((s, f) => s + f.weight, 0) - 1) < 1e-8;
}

export async function processSimilarity(root: string, options: Options = {}): Promise<PipelineResult> {
  const started = performance.now();
  const version = `${options.version ?? DESCRIPTOR_VERSION}/${POLICY.version}/${digest(JSON.stringify(POLICY)).slice(0, 12)}`;
  const cacheDir = options.cacheDir ?? path.join(root, '.cache/similarity');
  const output = options.output ?? path.join(root, 'public/similarity/index.json');
  const report = options.progress ?? (message => console.error(message));
  const stats: ProcessingStats = { status: 'failed', total: 0, processed: 0, cacheHits: 0, failed: 0, comparisons: 0,
    comparisonCacheHits: 0, sampledFrames: 0, discoverySeconds: 0, extractionSeconds: 0, comparisonSeconds: 0,
    publicationSeconds: 0, elapsedSeconds: 0, imagesPerSecond: 0, imagesPerMinute: 0, comparisonsPerSecond: 0,
    peakRssBytes: 0, indexBytes: 0 };
  let phase = 'discovery', current = '', done = 0, total = 0;
  let phaseStarted = started;
  const tick = () => {
    stats.peakRssBytes = Math.max(stats.peakRssBytes, process.memoryUsage().rss);
    report(`[${phase}] ${done}/${total} ${current} | new ${stats.processed}, cached ${stats.cacheHits}, failed ${stats.failed} | ${((performance.now() - started) / 1000).toFixed(1)}s elapsed`);
  };
  const check = () => { options.signal?.throwIfAborted(); };
  await fs.mkdir(cacheDir, { recursive: true });
  // Exclusive lock prevents concurrent runs from racing publication/checkpoints. OS kill leaves
  // a PID lock; the next process removes it only when that PID no longer exists.
  const lock = path.join(cacheDir, 'run.lock');
  // Serialize both ordinary acquisition and stale-PID recovery. A killed process
  // in this tiny recovery section fails closed rather than risking two owners.
  const guard = path.join(cacheDir, 'recovery.lock');
  try { await fs.writeFile(guard, String(process.pid), { flag: 'wx' }); }
  catch (e: any) {
    if (e.code === 'EEXIST') throw new Error(`Similarity lock acquisition is in progress. If its process was killed, verify the PID in ${guard} is no longer running before removing that guard.`);
    throw e;
  }
  try {
    const prior = await fs.readFile(lock, 'utf8').catch((e: any) => { if (e.code !== 'ENOENT') throw e; return ''; });
    if (prior) {
      const pid = Number(prior);
      if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid similarity lock: ${lock}`);
      let alive = true;
      try { process.kill(pid, 0); } catch (e: any) { if (e.code === 'ESRCH') alive = false; else throw e; }
      if (alive) throw new Error(`Similarity processing already running (PID ${pid})`);
      await fs.unlink(lock);
    }
    await fs.writeFile(lock, String(process.pid), { flag: 'wx' });
  } finally { await fs.rm(guard, { force: true }); }
  const heartbeat = setInterval(tick, 2000);
  try {
    tick(); check();
    const catalogFile = path.join(root, 'src/data/emoji-metadata.json');
    const catalogSource = await fs.readFile(catalogFile, 'utf8');
    const images: CatalogImage[] = JSON.parse(catalogSource).emojis;
    if (!Array.isArray(images) || images.some(e => !e || typeof e.id !== 'string' || !e.id || typeof e.filename !== 'string' || path.basename(e.filename) !== e.filename || typeof e.path !== 'string')) throw new Error('Invalid similarity catalog');
    images.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (new Set(images.map(e => e.id)).size !== images.length) throw new Error('Duplicate emoji IDs');
    total = stats.total = images.length;
    const hashes: Record<string, string> = {};
    const buffers = new Map<string, Buffer>();
    for (const e of images) {
      check(); current = e.filename;
      const bytes = await fs.readFile(path.join(root, 'public/emojis', e.filename));
      hashes[e.id] = digest(bytes); buffers.set(e.id, bytes); done++;
      if (e.hash && e.hash !== hashes[e.id]) throw new Error(`Image hash changed: ${e.filename}; run the offline emoji update first`);
    }
    stats.discoverySeconds = (performance.now() - started) / 1000;
    const catalogHash = digest(JSON.stringify(images.map(e => [e.id, e.filename, hashes[e.id]])));
    phase = 'extraction'; phaseStarted = performance.now(); done = 0; tick();
    const descriptors: Record<string, VisualDescriptor> = {};
    const keys: Record<string, string> = {};
    const extractionStart = performance.now();
    for (const e of images) {
      check(); current = e.filename;
      const key = keys[e.id] = digest(`${version}:${hashes[e.id]}`);
      const file = path.join(cacheDir, 'descriptors', `${key}.json`);
      const saved = await cached<{ key: string; descriptor: VisualDescriptor }>(file);
      let descriptor = saved?.key === key ? saved.descriptor : undefined;
      if (descriptor && !validDescriptor(descriptor)) descriptor = undefined;
      if (descriptor) stats.cacheHits++;
      else {
        tick();
        descriptor = await (options.extract ?? extractDescriptor)(buffers.get(e.id)!);
        if (!validDescriptor(descriptor)) throw new Error(`Invalid descriptor: ${e.filename}`);
        check(); await atomicWrite(file, { key, descriptor }); stats.processed++;
        stats.sampledFrames += descriptor.sampledFrames;
      }
      descriptors[e.id] = descriptor; buffers.delete(e.id); done++;
      await breathe();
    }
    stats.extractionSeconds = (performance.now() - extractionStart) / 1000;
    stats.imagesPerSecond = stats.processed / Math.max(stats.extractionSeconds, 0.001);
    stats.imagesPerMinute = stats.imagesPerSecond * 60;
    tick();
    phase = 'comparison'; phaseStarted = performance.now(); done = 0; total = images.length * (images.length - 1) / 2; current = '';
    const comparisonStart = performance.now();
    const pairs: Pair[] = [];
    for (let i = 0; i < images.length; i++) {
      const a = images[i]; current = a.filename; check();
      // One checkpoint per query; every saved edge carries both descriptor keys, so
      // additions/deletions cannot reuse stale positions or rankings.
      const file = path.join(cacheDir, 'pairs', `${digest(a.id)}.json`);
      const saved = await cached<Record<string, { key: string; pair: Pair }>>(file) ?? {};
      const next: typeof saved = {};
      for (let j = i + 1; j < images.length; j++) {
        const b = images[j]; check();
        const key = `${keys[a.id]}:${keys[b.id]}`;
        let pair = saved[b.id]?.key === key ? saved[b.id].pair : undefined;
        if (pair && (pair.a !== a.id || pair.b !== b.id || !validateDistances(pair.components))) pair = undefined;
        if (pair) {
          stats.comparisonCacheHits++;
          const da = descriptors[a.id], db = descriptors[b.id];
          pair = { ...pair, exact: hashes[a.id] === hashes[b.id],
            hamming: da.phash && db.phash && !da.animated && !db.animated ? hammingDistance(da.phash, db.phash) : null };
        }
        else {
          const da = descriptors[a.id], db = descriptors[b.id];
          const components = (options.compare ?? compareDescriptors)(da, db);
          if (!validateDistances(components)) throw new Error(`Invalid similarity distances: ${a.filename}, ${b.filename}`);
          pair = { a: a.id, b: b.id, components,
            hamming: da.phash && db.phash && !da.animated && !db.animated ? hammingDistance(da.phash, db.phash) : null,
            exact: hashes[a.id] === hashes[b.id] };
          stats.comparisons++;
        }
        pairs.push(pair); next[b.id] = { key, pair }; done++;
        if (j % 64 === 0) { await atomicWrite(file, { ...saved, ...next }); await breathe(); }
      }
      await atomicWrite(file, next); await breathe();
    }
    stats.comparisonSeconds = (performance.now() - comparisonStart) / 1000;
    stats.comparisonsPerSecond = stats.comparisons / Math.max(stats.comparisonSeconds, 0.001);
    tick(); phase = 'publication'; phaseStarted = performance.now(); current = ''; done = 0; total = 1; tick();
    const publicationStart = performance.now();
    const index: SimilarityIndex = { version, catalogHash, entries: {} };
    for (const e of images) index.entries[e.id] = { palette: descriptors[e.id].palette, color: [], visual: [] };
    for (const p of pairs) {
      if (descriptors[p.a].empty || descriptors[p.b].empty) continue;
      for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) {
        for (const mode of ['color', 'visual'] as const) {
          const distance = p.components[mode];
          if (distance <= POLICY[`${mode}Cutoff`]) index.entries[a][mode].push({ id: b, distance, components: p.components });
        }
      }
    }
    for (const entry of Object.values(index.entries)) for (const mode of ['color', 'visual'] as const) {
      entry[mode].sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      entry[mode] = entry[mode].slice(0, POLICY.limit);
    }
    check();
    if (await fs.readFile(catalogFile, 'utf8') !== catalogSource) throw new Error('Catalog changed during processing; restart');
    for (const e of images) {
      check();
      if (digest(await fs.readFile(path.join(root, 'public/emojis', e.filename))) !== hashes[e.id]) throw new Error(`Image changed during processing: ${e.filename}; restart`);
    }
    stats.indexBytes = Buffer.byteLength(`${JSON.stringify(index)}\n`);
    check();
    await atomicWrite(output, index, options.signal);
    stats.publicationSeconds = (performance.now() - publicationStart) / 1000;
    stats.status = 'complete'; done = 1; tick();
    return { index, images, descriptors, pairs, stats };
  } catch (e) { stats.failed++; throw e; }
  finally {
    clearInterval(heartbeat);
    stats.elapsedSeconds = (performance.now() - started) / 1000;
    if (stats.status === 'failed') {
      const elapsed = (performance.now() - phaseStarted) / 1000;
      if (phase === 'discovery') stats.discoverySeconds = elapsed;
      if (phase === 'extraction') stats.extractionSeconds = elapsed;
      if (phase === 'comparison') stats.comparisonSeconds = elapsed;
      if (phase === 'publication') stats.publicationSeconds = elapsed;
    }
    stats.imagesPerSecond = stats.processed / Math.max(stats.extractionSeconds, 0.001);
    stats.imagesPerMinute = stats.imagesPerSecond * 60;
    stats.comparisonsPerSecond = stats.comparisons / Math.max(stats.comparisonSeconds, 0.001);
    stats.peakRssBytes = Math.max(stats.peakRssBytes, process.memoryUsage().rss);
    try { await atomicWrite(path.join(cacheDir, 'last-run.json'), stats); }
    finally { await fs.rm(lock, { force: true }); }
    report(`Similarity ${stats.status}: ${stats.processed} new, ${stats.cacheHits} cached, ${stats.failed} failed; ${stats.imagesPerSecond.toFixed(2)} images/sec (${stats.imagesPerMinute.toFixed(1)} images/min); ${stats.comparisonsPerSecond.toFixed(1)} comparisons/sec; ${stats.elapsedSeconds.toFixed(2)}s total`);
  }
}
