/**
 * Share links carry a search (`q`) and/or a selection (`s`) in the query string.
 *
 * Emoji ids are 8 hex chars (32 bits), so a selection packs to 4 bytes per emoji
 * and base64url-encodes to ~5.3 chars each: the whole 353-sticker set fits in
 * ~1.9 KB, well under any URL limit. Ids that aren't 8-hex (tests, future data)
 * fall back to a `~`-prefixed comma list so nothing is silently dropped.
 */

const HEX_ID = /^[0-9a-f]{8}$/i;
const LIST_PREFIX = "~";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function packIds(ids: string[]): string {
  if (ids.length === 0) return "";
  if (!ids.every((id) => HEX_ID.test(id))) return LIST_PREFIX + ids.map(encodeURIComponent).join(",");
  const bytes = new Uint8Array(ids.length * 4);
  ids.forEach((id, index) => {
    const value = parseInt(id, 16);
    bytes[index * 4] = (value >>> 24) & 0xff;
    bytes[index * 4 + 1] = (value >>> 16) & 0xff;
    bytes[index * 4 + 2] = (value >>> 8) & 0xff;
    bytes[index * 4 + 3] = value & 0xff;
  });
  return toBase64Url(bytes);
}

export function unpackIds(packed: string): string[] {
  if (!packed) return [];
  if (packed.startsWith(LIST_PREFIX)) {
    return packed.slice(1).split(",").filter(Boolean).map(decodeURIComponent);
  }
  const bytes = fromBase64Url(packed);
  if (!bytes || bytes.length % 4 !== 0) return [];
  const ids: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const value =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    ids.push(value.toString(16).padStart(8, "0"));
  }
  return ids;
}

export interface ShareParams {
  /** search term */
  q?: string;
  /** selected emoji ids, in selection order */
  ids?: string[];
}

export function buildShareUrl({ q, ids }: ShareParams, base?: string): string {
  const origin = base ?? (typeof window === "undefined" ? "" : window.location.origin + window.location.pathname);
  const params = new URLSearchParams();
  const term = q?.trim();
  if (term) params.set("q", term);
  if (ids && ids.length > 0) params.set("s", packIds(ids));
  const query = params.toString();
  return query ? `${origin}?${query}` : origin;
}

export function readShareParams(search: string): ShareParams {
  const params = new URLSearchParams(search);
  const q = params.get("q")?.trim() || undefined;
  const packed = params.get("s");
  const ids = packed ? unpackIds(packed) : undefined;
  return { q, ids: ids && ids.length > 0 ? ids : undefined };
}

/** Drop the share params so a reload doesn't re-apply a link over later edits. */
export function clearShareParams(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("q") && !url.searchParams.has("s")) return;
  url.searchParams.delete("q");
  url.searchParams.delete("s");
  window.history.replaceState(window.history.state, "", url.toString());
}
