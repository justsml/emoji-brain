import type { EmojiMetadata } from "../types/emoji";

/**
 * The island's catalog, packed for the wire.
 *
 * Astro serializes island props as `[type, value]` tuples inside an
 * HTML-escaped attribute, so every key and quote of 366 records is spelled out
 * as `&quot;` — about 400 KB of attribute, the largest thing on the page. This
 * packs the same records into one quote-free string instead: column-major, so
 * like values sit together for gzip and brotli, with labels interned in a
 * dictionary; themes and categories, almost always a few of the emoji's own
 * tags, are written as positions in that list. Values that the page can derive (the legacy `path`, an atlas
 * cell that follows catalog order) are left out.
 *
 * Layout: sections joined by `~`, each column a `;`-joined list, one entry per
 * emoji, lists inside an entry joined by `,`.
 *   1 ~ labels ~ gzip sizes ~ atlas columns ~ id ~ filename ~ path ~ animated
 *     ~ tags ~ categories ~ aliases ~ themes ~ colors ~ gzip ~ originalBytes
 *     ~ maxSlackSize ~ placeholder
 *
 * `size` (source bytes) stays on the server: nothing in the browser reads it.
 */
const VERSION = "1";
const RESERVED = /[~;,]/;

const legacyPath = (filename: string) => `/emojis/${filename}`;
const atlasCell = (index: number, columns: number): [number, number] =>
  [index % columns, Math.floor(index / columns)];

function plain(value: string, what: string): string {
  if (RESERVED.test(value)) throw new Error(`catalogCodec: ${what} ${JSON.stringify(value)} contains one of ~ ; ,`);
  return value;
}

const num = (value: number | undefined) => value === undefined ? "" : String(value);
const int = (value: string) => value === "" ? undefined : Number(value);

/** Pack at build time. `atlasColumns` lets atlas cells that follow catalog order go unsaid. */
export function encodeCatalog(emojis: EmojiMetadata[], atlasColumns = 0): string {
  const counts = new Map<string, number>();
  for (const emoji of emojis) {
    for (const label of [...emoji.tags, ...emoji.categories, ...(emoji.themes ?? [])]) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  // Most frequent first: the common labels get the one-character indexes.
  const labels = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([label]) => label);
  const index = new Map(labels.map((label, i) => [label, i.toString(36)]));
  const refs = (list: string[]) => list.map(label => index.get(label)!).join(",");
  // A subset of the emoji's tags as one base-36 digit per member; `=` and full
  // label references when a label isn't among the first 36 tags.
  const subset = (list: string[], tags: string[]) => {
    const positions = list.map(label => tags.indexOf(label));
    return positions.every(position => position >= 0 && position < 36)
      ? positions.map(position => position.toString(36)).join("")
      : `=${refs(list)}`;
  };
  const gzipKeys = [...new Set(emojis.flatMap(emoji => Object.keys(emoji.gzip ?? {})))]
    .sort((a, b) => Number(a) - Number(b));

  const columns: string[][] = Array.from({ length: 13 }, () => []);
  emojis.forEach((emoji, i) => {
    const derived = atlasColumns > 0 ? atlasCell(i, atlasColumns) : undefined;
    const cell = emoji.placeholder;
    [
      plain(emoji.id, "id"),
      plain(emoji.filename, "filename"),
      emoji.path === legacyPath(emoji.filename) ? "" : `!${plain(emoji.path, "path")}`,
      emoji.animated === undefined ? "" : emoji.animated ? "1" : "0",
      refs(emoji.tags),
      subset(emoji.categories, emoji.tags),
      (emoji.aliases ?? []).map(alias => plain(alias, "alias")).join(","),
      subset(emoji.themes ?? [], emoji.tags),
      // Most of a histogram is zeros; they go unwritten.
      (emoji.colors ?? []).map(mass => mass || "").join(","),
      emoji.gzip ? gzipKeys.map(key => num(emoji.gzip![key])).join(",") : "",
      num(emoji.originalBytes),
      num(emoji.maxSlackSize),
      !cell ? "-" : derived && cell[0] === derived[0] && cell[1] === derived[1] ? "" : cell.join(","),
    ].forEach((value, column) => columns[column].push(value));
  });
  for (const label of labels) plain(label, "label");
  return [VERSION, labels.join(","), gzipKeys.join(","), String(atlasColumns), ...columns.map(column => column.join(";"))].join("~");
}

const list = (value: string) => value === "" ? [] : value.split(",");

/** Unpack on both sides of hydration; the server and the browser see identical records. */
export function decodeCatalog(packed: string): EmojiMetadata[] {
  const [version, labelSection, gzipSection, columnsSection, ...sections] = packed.split("~");
  if (version !== VERSION) throw new Error(`catalogCodec: unknown version ${version}`);
  const labels = list(labelSection);
  const gzipKeys = list(gzipSection);
  const atlasColumns = Number(columnsSection);
  const [ids, filenames, paths, animated, tags, categories, aliases, themes, colors, gzip, originals, maxSlack, cells] =
    sections.map(section => section.split(";"));
  const lookup = (value: string) => list(value).map(ref => labels[parseInt(ref, 36)]);
  const pick = (value: string, tags: string[]) => value.startsWith("=")
    ? lookup(value.slice(1))
    : [...value].map(digit => tags[parseInt(digit, 36)]);
  if (ids.length === 1 && ids[0] === "") return [];
  return ids.map((id, i): EmojiMetadata => {
    const filename = filenames[i];
    const tagList = lookup(tags[i]);
    const emoji: EmojiMetadata = {
      id,
      filename,
      path: paths[i] ? paths[i].slice(1) : legacyPath(filename),
      tags: tagList,
      categories: pick(categories[i], tagList),
      aliases: list(aliases[i]),
      themes: pick(themes[i], tagList),
    };
    if (animated[i]) emoji.animated = animated[i] === "1";
    if (colors[i]) emoji.colors = colors[i].split(",").map(Number);
    if (gzip[i]) {
      const sizes: Record<string, number> = {};
      list(gzip[i]).forEach((bytes, k) => { if (bytes !== "") sizes[gzipKeys[k]] = Number(bytes); });
      emoji.gzip = sizes;
    }
    const originalBytes = int(originals[i]);
    if (originalBytes !== undefined) emoji.originalBytes = originalBytes;
    const maxSlackSize = int(maxSlack[i]);
    if (maxSlackSize !== undefined) emoji.maxSlackSize = maxSlackSize;
    const cell = cells[i];
    if (cell === "" && atlasColumns > 0) emoji.placeholder = atlasCell(i, atlasColumns);
    else if (cell && cell !== "-") emoji.placeholder = list(cell).map(Number) as [number, number];
    return emoji;
  });
}
