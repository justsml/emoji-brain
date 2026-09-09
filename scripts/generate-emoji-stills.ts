#!/usr/bin/env node

/**
 * Animated WebPs never stop re-rasterizing, so a grid full of them starves the
 * compositor and the page blanks while scrolling. This writes a first-frame
 * still for every animated emoji into public/emojis/still/ and marks the source
 * entry `animated: true`, so the grid can render stills and only play the real
 * thing on hover.
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');
const STILLS_DIR = path.join(EMOJIS_DIR, 'still');
const METADATA_PATH = path.join(process.cwd(), 'src', 'data', 'emoji-metadata.json');

/** Stills are only ever drawn at grid size, so cap them. */
const MAX_STILL_EDGE = 256;

async function isAnimated(file: string): Promise<boolean> {
  try {
    const { pages } = await sharp(file).metadata();
    return (pages ?? 1) > 1;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await fs.mkdir(STILLS_DIR, { recursive: true });

  const files = (await fs.readdir(EMOJIS_DIR)).filter((f) => f.endsWith('.webp'));
  const animated: string[] = [];
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const filename of files) {
    const source = path.join(EMOJIS_DIR, filename);
    if (!(await isAnimated(source))) continue;

    animated.push(filename);
    const target = path.join(STILLS_DIR, filename);

    // sharp reads only the first frame unless `animated: true` is passed
    const buffer = await sharp(source)
      .resize({
        width: MAX_STILL_EDGE,
        height: MAX_STILL_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    await fs.writeFile(target, buffer);
    bytesBefore += (await fs.stat(source)).size;
    bytesAfter += buffer.length;
  }

  const metadata = JSON.parse(await fs.readFile(METADATA_PATH, 'utf8'));
  const animatedSet = new Set(animated);
  let marked = 0;

  for (const emoji of metadata.emojis ?? []) {
    if (animatedSet.has(emoji.filename)) {
      emoji.animated = true;
      marked += 1;
    } else if ('animated' in emoji) {
      delete emoji.animated;
    }
  }

  await fs.writeFile(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`Scanned ${files.length} emojis`);
  console.log(`Wrote ${animated.length} stills to public/emojis/still/`);
  console.log(`Marked ${marked} metadata entries as animated`);
  console.log(
    `Grid payload for those: ${(bytesBefore / 1e6).toFixed(2)} MB -> ${(bytesAfter / 1e6).toFixed(2)} MB`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
