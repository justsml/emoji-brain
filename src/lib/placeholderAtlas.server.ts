import {createHash} from 'node:crypto';
import sharp from 'sharp';

/**
 * Every sticker shrunk onto one contact sheet, so a slow connection paints the
 * whole grid's silhouettes from a single ~20 KB request — before any of the
 * island's JavaScript arrives. A 1px gutter keeps bilinear upscaling from
 * bleeding a neighbour into the tile.
 */
export const PLACEHOLDER_TILE = 10;
const GUTTER = 1;
const COLUMNS = 20;

export interface PlaceholderAtlas {
  bytes: Uint8Array;
  url: string;
  columns: number;
  rows: number;
  /** [column, row] for each filename, in input order. */
  cells: [number, number][];
}

/**
 * The order the page lists the catalog in. The atlas is laid out in the same
 * order, so each sticker's cell follows from its position and the island's
 * packed catalog doesn't have to spell it out (src/lib/catalogCodec.ts).
 */
export function catalogFilenames(emojis: {filename: string}[]): string[] {
  return emojis.map(emoji => emoji.filename).sort((a, b) => a.localeCompare(b));
}

let built: Promise<PlaceholderAtlas> | undefined;
let builtFor = '';

/** Memoized per catalog: the page and the image endpoint share one encode per build. */
export function placeholderAtlas(filenames: string[]): Promise<PlaceholderAtlas> {
  const key = filenames.join('\n');
  if (!built || builtFor !== key) { builtFor = key; built = build(filenames); }
  return built;
}

async function build(filenames: string[]): Promise<PlaceholderAtlas> {
  const rows = Math.ceil(filenames.length / COLUMNS), inner = PLACEHOLDER_TILE - 2 * GUTTER;
  const cells = filenames.map((_, index): [number, number] => [index % COLUMNS, Math.floor(index / COLUMNS)]);
  const tiles = [];
  for (let start = 0; start < filenames.length; start += 24) {
    tiles.push(...await Promise.all(filenames.slice(start, start + 24).map(async (filename, offset) => {
      const [column, row] = cells[start + offset];
      const input = await sharp(`public/emoji-delivery/previews/64/${filename}`)
        .resize(inner, inner, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
      return {input, left: column * PLACEHOLDER_TILE + GUTTER, top: row * PLACEHOLDER_TILE + GUTTER};
    })));
  }
  const bytes = new Uint8Array(await sharp({create: {width: COLUMNS * PLACEHOLDER_TILE, height: rows * PLACEHOLDER_TILE, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite(tiles).webp({quality: 40, alphaQuality: 50, effort: 6, smartSubsample: true}).toBuffer());
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  return {bytes, url: `/placeholders.webp?v=${version}`, columns: COLUMNS, rows, cells};
}
