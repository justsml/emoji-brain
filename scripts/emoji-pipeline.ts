import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export type UpdateMode = 'none' | 'all' | 'changes';
export type Entry = Record<string, any>;
const formats: Record<string, string> = { '.webp': 'webp', '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.tif': 'tiff', '.tiff': 'tiff', '.avif': 'heif' };
const required = ['id', 'filename', 'path', 'created', 'modified', 'hash', 'size', 'width', 'height', 'tags', 'aliases', 'categories'];
export const paths = (root: string) => ({ images: path.join(root, 'public/emojis'), metadata: path.join(root, 'src/data/emoji-metadata.json') });
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim().length > 0);
const populated = (value: any) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== '';
export async function readCatalog(root: string): Promise<Entry> {
  try {
    const data = JSON.parse(await fs.readFile(paths(root).metadata, 'utf8'));
    if (!Array.isArray(data.emojis) || data.emojis.some((e: any) => !e || typeof e !== 'object' || typeof e.filename !== 'string')) throw new Error('Invalid catalog: expected emojis with filenames');
    return data;
  } catch (error: any) {
    if (error.code === 'ENOENT') return { emojis: [], total: 0 };
    throw error;
  }
}
export async function inspect(file: string) {
  const buffer = await fs.readFile(file);
  const info = await sharp(buffer, { animated: true }).metadata();
  if (!formats[path.extname(file).toLowerCase()] || info.format !== formats[path.extname(file).toLowerCase()]) throw new Error('Unsupported image type or extension/content mismatch');
  // Decode every frame, not just the header.
  await sharp(buffer, { animated: true }).stats();
  return { hash: createHash('sha256').update(buffer).digest('hex'), modified: (await fs.stat(file)).mtime.toISOString(), size: buffer.length, width: info.width!, height: info.pageHeight ?? info.height!, animated: (info.pages ?? 1) > 1 };
}
async function filesIn(dir: string): Promise<string[]> {
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b)); }
  catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function checkEmojis(root: string) {
  const catalog = await readCatalog(root);
  const filenames = await filesIn(paths(root).images);
  const rows: Entry[] = [];
  const errors: string[] = [];
  if (catalog.total !== catalog.emojis.length) errors.push('Catalog total does not match entries');
  for (const field of ['filename', 'id']) {
    const values = catalog.emojis.map((e: Entry) => e[field]);
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${field} in catalog`);
  }
  const hashes = new Map<string, string>();
  for (const filename of [...new Set([...filenames, ...catalog.emojis.map((e: Entry) => e.filename)])].sort()) {
    const entry = catalog.emojis.find((e: Entry) => e.filename === filename);
    const issues: string[] = [];
    const row: Entry = { filename, exists: filenames.includes(filename), prior: !!entry, hash: 'unknown', modified: 'unknown', type: 'unknown', fields: 0, tags: 0, aliases: 0, categories: 0, score: 0, issues };
    if (!row.exists) issues.push('Missing image');
    if (!entry) issues.push('Missing metadata');
    if (entry) {
      row.fields = required.filter(f => populated(entry[f])).length;
      for (const f of ['tags', 'aliases', 'categories']) {
        if (!strings(entry[f])) issues.push(`Invalid ${f}`);
        row[f] = strings(entry[f]) ? new Set(entry[f]).size : 0;
      }
      row.score = Math.round(100 * (row.fields / required.length + Math.min(row.tags / 3, 1) + Math.min(row.aliases, 1) + Math.min(row.categories / 2, 1)) / 4);
      for (const f of ['id', 'created', 'modified', 'hash']) if (typeof entry[f] !== 'string' || !entry[f]) issues.push(`Missing/invalid ${f}`);
      for (const f of ['created', 'modified']) if (!Number.isFinite(Date.parse(entry[f]))) issues.push(`Invalid ${f} date`);
      if (!/^[a-f0-9]{64}$/.test(entry.hash ?? '')) issues.push('Invalid SHA-256 hash');
      if (entry.path !== `/emojis/${filename}`) issues.push('Invalid public path');
      for (const f of ['size', 'width', 'height']) if (!Number.isInteger(entry[f]) || entry[f] <= 0) issues.push(`Invalid ${f}`);
    }
    if (row.exists) {
      try {
        const info = await inspect(path.join(paths(root).images, filename));
        row.type = path.extname(filename).slice(1);
        row.hash = entry?.hash ? (entry.hash === info.hash ? 'same' : 'changed') : 'untracked';
        row.modified = entry?.modified ? (entry.modified === info.modified ? 'same' : 'changed') : 'untracked';
        if (row.hash === 'changed') issues.push('Image hash changed');
        if (hashes.has(info.hash)) row.duplicateOf = hashes.get(info.hash);
        else hashes.set(info.hash, filename);
        if (row.type !== 'webp') issues.push('Needs WebP conversion');
        if (entry) {
          for (const f of ['size', 'width', 'height'] as const) if (entry[f] !== info[f]) issues.push(`Stale ${f}`);
          if (!!entry.animated !== info.animated) issues.push('Stale animated flag');
        }
        if (info.animated) {
          try { const still = await inspect(path.join(paths(root).images, 'still', filename)); if (still.animated) issues.push('Still is animated'); }
          catch { issues.push('Missing or invalid still'); }
        }
      } catch (error) { issues.push(String(error)); row.type = 'invalid'; }
    }
    rows.push(row);
  }
  return { total: rows.length, errors, invalid: rows.filter(r => r.issues.length).length, averageScore: rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0, rows };
}
export function reportTable(report: Awaited<ReturnType<typeof checkEmojis>>) {
  const escape = (v: any) => String(v).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  return [`${report.total} emojis; ${report.invalid} invalid; average completeness ${report.averageScore}%.`, ...report.errors, '', '| File | Exists / prior | Hash | Modified | Type | Fields / 12 | Tags | Aliases | Categories | Score | Issues / duplicate |', '|---|---|---|---|---|---|---|---|---|---|---|', ...report.rows.map(r => `| ${[r.filename, `${r.exists} / ${r.prior}`, r.hash, r.modified, r.type, r.fields, r.tags, r.aliases, r.categories, `${r.score}%`, [...r.issues, ...(r.duplicateOf ? [`Same content: ${r.duplicateOf}`] : [])].join('; ')].map(escape).join(' | ')} |`)].join('\n');
}
export async function updateEmojis(root: string, mode: UpdateMode, label?: (file: string) => Promise<string>) {
  const p = paths(root);
  const catalog = await readCatalog(root);
  const before = new Map<string, Entry>(catalog.emojis.map((e: Entry) => [e.filename, e]));
  if (before.size !== catalog.emojis.length) throw new Error('Duplicate filenames in metadata');
  await fs.mkdir(p.images, { recursive: true });
  const sources = [...(await filesIn(p.images)).map(f => path.join(p.images, f)), ...(await filesIn(path.join(p.images, 'ingest'))).map(f => path.join(p.images, 'ingest', f))];
  const destinations = new Set<string>();
  // Preflight everything before moving or converting any input.
  for (const source of sources) {
    await inspect(source);
    const destination = `${path.parse(source).name}.webp`.toLowerCase();
    if (destinations.has(destination)) throw new Error(`Conflicting inputs for ${destination}; resolve before updating`);
    destinations.add(destination);
  }
  let converted = 0;
  let ingested = 0;
  for (const source of sources) {
    const target = path.join(p.images, `${path.parse(source).name}.webp`);
    if (source === target) continue;
    const temp = `${target}.tmp`;
    try {
      if (path.extname(source) === '.webp') await fs.copyFile(source, temp);
      else { await sharp(source, { animated: true }).webp({ quality: 90, effort: 6 }).toFile(temp); converted++; }
      await sharp(temp, { animated: true }).stats();
      await fs.rename(temp, target);
      await fs.unlink(source);
      if (path.dirname(source) !== p.images) ingested++;
    } finally { await fs.rm(temp, { force: true }); }
  }
  const emojis: Entry[] = [];
  let added = 0, changed = 0, tracked = 0, labelled = 0, stills = 0;
  await fs.mkdir(path.join(p.images, 'still'), { recursive: true });
  for (const filename of await filesIn(p.images)) {
    const source = path.join(p.images, filename);
    const info = await inspect(source);
    const old = before.get(filename) ?? catalog.emojis.find((e: Entry) => path.parse(e.filename).name === path.parse(filename).name);
    if (!old) added++;
    if (old && !old.hash) tracked++;
    const needsLabel = !old || old.hash !== info.hash || old.labelHash !== info.hash || !strings(old.tags) || !old.tags.length || !strings(old.categories) || !old.categories.length;
    if (old?.hash && old.hash !== info.hash) changed++;
    const entry: Entry = { ...old, id: old?.id ?? createHash('md5').update(filename).digest('hex').slice(0, 8), filename, path: `/emojis/${filename}`, created: old?.created ?? (await fs.stat(source)).birthtime.toISOString(), tags: old?.tags ?? [], categories: old?.categories ?? [], aliases: old?.aliases ?? [], ...info };
    if (mode === 'all' || (mode === 'changes' && needsLabel)) {
      if (!label) throw new Error('Live labeller required');
      console.log(`Labelling ${filename}`);
      const labels = JSON.parse((await label(source)).replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      if (!strings(labels.tags) || !labels.tags.length || !strings(labels.categories) || !labels.categories.length) throw new Error(`Invalid labels for ${filename}`);
      entry.tags = labels.tags;
      entry.categories = labels.categories;
      entry.labelHash = info.hash;
      labelled++;
    }
    const still = path.join(p.images, 'still', filename);
    if (info.animated) {
      await sharp(source).resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${still}.tmp`);
      await fs.rename(`${still}.tmp`, still);
      stills++;
    } else await fs.rm(still, { force: true });
    emojis.push(entry);
  }
  for (const filename of await filesIn(path.join(p.images, 'still'))) if (!emojis.some(e => e.filename === filename && e.animated)) await fs.unlink(path.join(p.images, 'still', filename));
  await fs.mkdir(path.dirname(p.metadata), { recursive: true });
  const next = { ...catalog, total: emojis.length, emojis };
  if (JSON.stringify(next) !== JSON.stringify(catalog)) {
    await fs.writeFile(`${p.metadata}.tmp`, `${JSON.stringify({ ...next, lastUpdated: new Date().toISOString() }, null, 2)}\n`);
    await fs.rename(`${p.metadata}.tmp`, p.metadata);
  }
  return { total: emojis.length, added, changed, tracked, removed: catalog.emojis.filter((e: Entry) => !emojis.some(n => n.id === e.id)).length, converted, ingested, labelled, stills };
}
