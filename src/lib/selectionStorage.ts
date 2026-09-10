import type { EmojiMetadata } from "../types/emoji";

/**
 * The selection used to be persisted as whole emoji records, so a browser could
 * hold on to stickers that a later dedupe pass removed or folded into another
 * file — the tray then rendered chips pointing at 404s. We now store ids only
 * and rebuild the selection from the current catalog on load, dropping whatever
 * no longer exists.
 */

export const SELECTION_STORAGE_KEY = "selectedEmojis";

function key(text: string): string {
  return text.toLowerCase().replace(/\.webp$/, "");
}

/** id / filename / alias -> current record, so renamed-away stickers still resolve. */
function buildLookup(catalog: EmojiMetadata[]): Map<string, EmojiMetadata> {
  const lookup = new Map<string, EmojiMetadata>();
  const add = (text: string | undefined, emoji: EmojiMetadata) => {
    if (!text) return;
    const k = key(text);
    if (!lookup.has(k)) lookup.set(k, emoji);
  };
  // ids first: they never collide with a filename and always win.
  for (const emoji of catalog) add(emoji.id, emoji);
  for (const emoji of catalog) {
    add(emoji.filename, emoji);
    for (const alias of emoji.aliases ?? []) add(alias, emoji);
  }
  return lookup;
}

/** Every handle a stored entry might be findable by, most specific first. */
function handles(entry: unknown): string[] {
  if (typeof entry === "string") return [entry];
  if (!entry || typeof entry !== "object") return [];
  const record = entry as Partial<EmojiMetadata>;
  return [record.id, record.filename, ...(record.aliases ?? [])].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

/**
 * Rebuild a selection from whatever localStorage held — ids, or the legacy
 * array of full records — against the emoji catalog that actually ships today.
 * Unknown entries are dropped; order and de-duplication are preserved.
 */
export function reconcileSelection(stored: unknown, catalog: EmojiMetadata[]): EmojiMetadata[] {
  if (!Array.isArray(stored) || stored.length === 0) return [];
  const lookup = buildLookup(catalog);
  const selected: EmojiMetadata[] = [];
  const seen = new Set<string>();
  for (const entry of stored) {
    const match = handles(entry)
      .map((handle) => lookup.get(key(handle)))
      .find(Boolean);
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    selected.push(match);
  }
  return selected;
}
