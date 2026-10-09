import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {decodeAnimation} from './animation-frames.mjs';
import {muxAnimation} from './mux-animation.mjs';
import {upscaleLocal, closeUpscaleWorker} from './upscale-worker.mjs';

const root = 'staging/emoji-enhancements/michael-scott';
const workRoot = 'experiments/image-enhancement/michael-scott';
const modelRoot = process.env.EMOJI_MODEL_DIR ?? '/tmp/emoji-models';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = async file => hash(await fs.readFile(file));
const save = async (file, value) => {
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await fs.rename(file + '.tmp', file);
};
const settings = {version: 1, kind: 'photo', denoiseStrong: 0.5, restoredBlend: 0.75, maxEdge: 512, nativeScale: 4, alpha: 'resampled-source', backgrounds: 'preserved'};
const inputs = JSON.parse(await fs.readFile('staging/michael-scott-ingest.json', 'utf8')).items;

async function decode(file) {
  const metadata = await sharp(file, {animated: true}).metadata();
  if (metadata.pages > 1) return decodeAnimation(file);
  const {data, info} = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {width: info.width, height: info.height, frames: [data], delays: [], loop: 0};
}

async function resized(frame, input, width, height) {
  return sharp(frame, {raw: {width: input.width, height: input.height, channels: 4}}).resize(width, height).ensureAlpha().raw().toBuffer();
}
const alphaBytes = frame => Buffer.from(frame.filter((_, i) => i % 4 === 3));

async function atlas(frames, width, height, file) {
  const size = 256, columns = Math.min(8, frames.length);
  const layers = [];
  for (let i = 0; i < frames.length; i++) layers.push({
    input: await sharp(frames[i], {raw: {width, height, channels: 4}}).resize(size, size, {fit: 'contain', background: '#00000000'}).png().toBuffer(),
    left: i % columns * size, top: Math.floor(i / columns) * size,
  });
  await sharp({create: {width: columns * size, height: Math.ceil(frames.length / columns) * size, channels: 4, background: '#00000000'}}).composite(layers).png().toFile(file);
  return {file: path.basename(file), columns, cell: size};
}

async function validate(manifest) {
  if (manifest.items.length !== inputs.length || !['pending-human-review', 'approved-promoted'].includes(manifest.status)) throw Error('Incomplete review batch');
  for (const item of manifest.items) {
    const input = inputs.find(row => row.output === item.productionPath);
    if (!input || item.sourceSha256 !== input.sourceSha256 || await fileHash(item.source) !== item.sourceSha256) throw Error('Changed source: ' + item.name);
    if (await fileHash(item.productionPath) !== (manifest.status === 'approved-promoted' ? item.candidateSha256 : item.productionSha256)) throw Error('Production changed: ' + item.name);
    if (manifest.status === 'approved-promoted' && await fileHash(path.join(root, 'originals', item.name + '.webp')) !== item.productionSha256) throw Error('Archive changed: ' + item.name);
    if (await fileHash(path.join(root, item.candidate)) !== item.candidateSha256) throw Error('Candidate hash mismatch: ' + item.name);
    if (await fileHash(path.join(root, item.original)) !== item.sourceSha256) throw Error('Review original hash mismatch: ' + item.name);
    const original = await decode(item.source), candidate = await decode(path.join(root, item.candidate));
    if (candidate.frames.length !== original.frames.length || JSON.stringify(candidate.delays) !== JSON.stringify(original.delays) || candidate.loop !== original.loop) throw Error('Changed animation timeline: ' + item.name);
    if (candidate.width !== item.width || candidate.height !== item.height) throw Error('Changed dimensions');
    let delta = 0;
    for (let i = 0; i < candidate.frames.length; i++) {
      const base = await resized(original.frames[i], original, item.width, item.height);
      if (!alphaBytes(base).equals(alphaBytes(candidate.frames[i]))) throw Error('Changed source alpha: ' + item.name + ' frame ' + i);
      for (let p = 0; p < base.length; p++) if (p % 4 !== 3) delta += Math.abs(base[p] - candidate.frames[i][p]);
    }
    if (!delta) throw Error('Candidate is only a resize: ' + item.name);
    for (const preview of [item.originalAtlas, item.candidateAtlas]) {
      if (await fileHash(path.join(root, preview.file)) !== preview.sha256) throw Error('Changed preview atlas');
    }
    console.log('VALID', item.name, candidate.frames.length + ' frames; timeline, alpha, source and candidate hashes verified');
  }
}

if (process.argv.includes('--promote')) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  await validate(manifest);
  if (manifest.status === 'approved-promoted') throw Error('This batch is already promoted');
  const approval = JSON.parse(await fs.readFile(path.join(root, 'review-decisions.json'), 'utf8'));
  if (approval.status !== 'approved' || approval.items.length !== manifest.items.length || !approval.userApproval || !approval.approvedAt) throw Error('Missing complete human approval');
  for (const item of manifest.items) {
    const decisions = approval.items.filter(row => row.name === item.name);
    if (decisions.length !== 1 || decisions[0].candidateSha256 !== item.candidateSha256 || decisions[0].productionSha256 !== item.productionSha256) throw Error('Approval hash mismatch: ' + item.name);
  }
  const archive = path.join(root, 'originals'), metadataFile = 'src/data/emoji-metadata.json';
  const metadataBytes = await fs.readFile(metadataFile), catalog = JSON.parse(metadataBytes);
  await fs.mkdir(archive, {recursive: true});
  await fs.writeFile(path.join(archive, 'emoji-metadata.json'), metadataBytes, {flag: 'wx'});
  // Preserve all originals before replacing the first production file.
  for (const item of manifest.items) await fs.copyFile(item.productionPath, path.join(archive, item.name + '.webp'), fs.constants.COPYFILE_EXCL);
  for (const item of manifest.items) {
    const bytes = await fs.readFile(path.join(root, item.candidate));
    await fs.writeFile(item.productionPath + '.tmp', bytes); await fs.rename(item.productionPath + '.tmp', item.productionPath);
    const entry = catalog.emojis.find(row => row.filename === item.name + '.webp');
    if (!entry) throw Error('Missing catalog entry');
    const metadata = await sharp(bytes, {animated: true}).metadata();
    entry.labelProvenance = {method: 'carried-forward-after-approved-upscale', fromHash: entry.labelHash ?? entry.hash, approvalReceipt: path.join(root, 'review-decisions.json')};
    Object.assign(entry, {hash: item.candidateSha256, labelHash: item.candidateSha256, size: bytes.length, width: metadata.width, height: metadata.pageHeight ?? metadata.height, animated: item.frames > 1, modified: (await fs.stat(item.productionPath)).mtime.toISOString()});
    if (entry.animated) await sharp(bytes).resize({width: 256, height: 256, fit: 'inside', withoutEnlargement: true}).webp({quality: 82}).toFile('public/emojis/still/' + entry.filename);
    item.approval = 'approved';
  }
  catalog.lastUpdated = new Date().toISOString();
  await save(metadataFile, catalog);
  manifest.status = 'approved-promoted'; manifest.approval = approval; manifest.promotedAt = new Date().toISOString();
  await save(path.join(root, 'manifest.json'), manifest);
  const template = await fs.readFile('scripts/emoji-enhancement/michael-scott-review.html', 'utf8');
  await fs.writeFile(path.join(root, 'index.html'), template.replace('__MANIFEST__', JSON.stringify(manifest).replace(/</g, '\\u003c')));
  await validate(manifest);
  console.log('PROMOTED', manifest.items.length, 'approved candidates; originals and labels archived');
} else if (process.argv.includes('--validate')) {
  await validate(JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')));
} else {
  try {
    const previous = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
    if (previous.status === 'approved-promoted') throw Error('This batch is promoted; use a new batch directory for revised candidates');
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
  await fs.mkdir(root, {recursive: true});
  const weights = await Promise.all(['realesr-general-x4v3.pth', 'realesr-general-wdn-x4v3.pth'].map(async filename => ({filename, sha256: await fileHash(path.join(modelRoot, filename)), url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/' + filename})));
  const workerSha256 = await fileHash('scripts/emoji-enhancement/upscale-worker.py');
  const manifest = {status: 'pending-human-review', createdAt: new Date().toISOString(), settings, weights, workerSha256, architecture: 'https://github.com/xinntao/Real-ESRGAN/blob/master/realesrgan/archs/srvgg_arch.py', inference: 'local', apiSpendUsd: 0, items: []};
  try {
    for (const row of inputs) {
      if (await fileHash(row.source) !== row.sourceSha256) throw Error('Source does not match ingest receipt');
      const name = path.basename(row.output, '.webp'), original = await decode(row.source);
      const scale = Math.min(settings.nativeScale, settings.maxEdge / Math.max(original.width, original.height));
      const width = Math.round(original.width * scale), height = Math.round(original.height * scale);
      const signature = hash(JSON.stringify({source: row.sourceSha256, settings, weights, workerSha256}));
      const work = path.join(workRoot, name, signature.slice(0, 16));
      await fs.mkdir(work, {recursive: true});
      const frameFiles = [], deviceSet = new Set();
      for (let i = 0; i < original.frames.length; i++) {
        const frame = original.frames[i], stem = path.join(work, hash(frame)), output = stem + '-final.png';
        const receiptFile = stem + '-receipt.json';
        let receipt;
        try {
          receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
          if (await fileHash(output) !== receipt.sha256) throw Error('Stale cached frame');
        } catch {
          const transparent = alphaBytes(frame).some(value => value < 255);
          const inference = [];
          for (const background of transparent ? ['white', 'black'] : ['white']) {
            const input = stem + '-' + background + '.png', result = stem + '-' + background + '-sr.png';
            await sharp(frame, {raw: {width: original.width, height: original.height, channels: 4}}).flatten({background}).png().toFile(input);
            const job = await upscaleLocal(input, result, settings.kind);
            inference.push({data: await sharp(result).resize(width, height).ensureAlpha().raw().toBuffer(), device: job.device});
          }
          const base = await resized(frame, original, width, height), restored = Buffer.from(base);
          const white = inference[0].data, black = inference[1]?.data;
          for (let p = 0; p < base.length; p += 4) {
            const alpha = base[p + 3] / 255;
            for (let c = 0; c < 3; c++) {
              const value = black && alpha > 0 ? (black[p + c] + white[p + c] - (1 - alpha) * 255) / (2 * alpha) : white[p + c];
              restored[p + c] = alpha > 0 ? Math.round(settings.restoredBlend * Math.max(0, Math.min(255, value)) + (1 - settings.restoredBlend) * base[p + c]) : base[p + c];
            }
          }
          await sharp(restored, {raw: {width, height, channels: 4}}).png().toFile(output);
          receipt = {sha256: await fileHash(output), device: inference[0].device};
          await save(receiptFile, receipt);
        }
        deviceSet.add(receipt.device); frameFiles.push(output);
        if (i === 0 || (i + 1) % 10 === 0 || i === original.frames.length - 1) console.log('RESTORED', name, (i + 1) + '/' + original.frames.length, receipt.device);
      }
      const candidate = name + '.webp';
      if (frameFiles.length > 1) await muxAnimation({frameFiles, width, height, delays: original.delays, loop: original.loop}, path.join(root, candidate));
      else await sharp(frameFiles[0]).webp({lossless: true, effort: 6}).toFile(path.join(root, candidate));
      const originalFile = name + '-original' + path.extname(row.source);
      await fs.copyFile(row.source, path.join(root, originalFile));
      const candidateFrames = (await decode(path.join(root, candidate))).frames;
      const originalAtlas = await atlas(original.frames, original.width, original.height, path.join(root, name + '-original-atlas.png'));
      const candidateAtlas = await atlas(candidateFrames, width, height, path.join(root, name + '-candidate-atlas.png'));
      for (const preview of [originalAtlas, candidateAtlas]) preview.sha256 = await fileHash(path.join(root, preview.file));
      manifest.items.push({name, source: row.source, sourceSha256: row.sourceSha256, productionPath: row.output, productionSha256: await fileHash(row.output), original: originalFile, candidate, candidateSha256: await fileHash(path.join(root, candidate)), sourceWidth: original.width, sourceHeight: original.height, width, height, frames: original.frames.length, uniqueFrames: new Set(original.frames.map(hash)).size, delays: original.delays, loop: original.loop, devices: [...deviceSet], signature, originalAtlas, candidateAtlas, approval: 'pending'});
    }
  } finally {closeUpscaleWorker();}
  await validate(manifest);
  await save(path.join(root, 'manifest.json'), manifest);
  const template = await fs.readFile('scripts/emoji-enhancement/michael-scott-review.html', 'utf8');
  await fs.writeFile(path.join(root, 'index.html'), template.replace('__MANIFEST__', JSON.stringify(manifest).replace(/</g, '\\u003c')));
  console.log('REVIEW READY', root + '/index.html');
}
