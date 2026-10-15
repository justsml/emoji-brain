import { describe, expect, it } from "vitest";
import emojiMetadata from "../data/emoji-metadata.json";
import type { EmojiMetadata } from "../types/emoji";
import { decodeCatalog, encodeCatalog } from "./catalogCodec";

const COLUMNS = 20;
// Shaped like the page's records (src/pages/index.astro), minus the build-only `size`.
const catalog: EmojiMetadata[] = [...emojiMetadata.emojis]
  .sort((a, b) => a.filename.localeCompare(b.filename))
  .map(({ id, filename, path, animated, tags, categories, aliases, facets }, index) => ({
    id, filename, path, animated, tags, categories, aliases,
    colors: Array.from({ length: 12 }, (_, i) => (index * 7 + i * 13) % 1000),
    themes: [...new Set([...facets.subject, ...facets.expression, ...facets.intent])],
    gzip: { "64": 1000 + index, "128": 2000 + index, "256": 3000 + index },
    originalBytes: 90_000 + index,
    maxSlackSize: [64, 128, 256][index % 3],
    placeholder: [index % COLUMNS, Math.floor(index / COLUMNS)] as [number, number],
  }));

describe("catalogCodec", () => {
  it("round-trips the catalog the page ships", () => {
    expect(decodeCatalog(encodeCatalog(catalog, COLUMNS))).toEqual(catalog);
  });

  it("is free of characters the island attribute would escape", () => {
    expect(encodeCatalog(catalog, COLUMNS)).not.toMatch(/["&<>\\]/);
  });

  it("keeps atlas cells and paths that don't follow the defaults", () => {
    const odd: EmojiMetadata[] = [
      { ...catalog[0], placeholder: [7, 3], path: "/elsewhere/a.webp" },
      { ...catalog[1], placeholder: undefined, animated: undefined, gzip: undefined, colors: undefined, originalBytes: undefined, maxSlackSize: undefined },
    ];
    const decoded = decodeCatalog(encodeCatalog(odd, COLUMNS));
    expect(decoded[0].placeholder).toEqual([7, 3]);
    expect(decoded[0].path).toBe("/elsewhere/a.webp");
    expect(decoded[1]).toEqual(Object.fromEntries(Object.entries(odd[1]).filter(([, value]) => value !== undefined)));
  });

  it("spells out themes and categories that aren't among the tags", () => {
    const loose: EmojiMetadata = { ...catalog[0], categories: ["not-a-tag"], themes: [catalog[0].tags[0], "elsewhere"] };
    const [decoded] = decodeCatalog(encodeCatalog([loose, catalog[1]]));
    expect(decoded.categories).toEqual(["not-a-tag"]);
    expect(decoded.themes).toEqual(loose.themes);
  });

  it("keeps zero color masses", () => {
    const colors = [0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 995];
    expect(decodeCatalog(encodeCatalog([{ ...catalog[0], colors }]))[0].colors).toEqual(colors);
  });

  it("drops the build-only source size", () => {
    const [decoded] = decodeCatalog(encodeCatalog([{ ...catalog[0], size: 1234 }]));
    expect(decoded.size).toBeUndefined();
  });

  it("refuses values that would collide with its separators", () => {
    expect(() => encodeCatalog([{ ...catalog[0], aliases: ["a,b"] }])).toThrow(/contains/);
  });

  it("handles an empty catalog", () => {
    expect(decodeCatalog(encodeCatalog([]))).toEqual([]);
  });
});
