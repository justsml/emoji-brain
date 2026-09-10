/** Read-only replacement decisions. Deletion is deliberately not implemented
 * until the workspace customization endpoint is verified from a sanitized HAR. */
export interface ReplacementImage {
  name: string;
  width?: number;
  height?: number;
  animated?: boolean;
  aliasFor?: string;
}
export interface ReplacementDecision {
  name: string;
  action: 'upload-new' | 'replace-smaller' | 'keep-existing' | 'manual-review';
  reason: string;
  current?: ReplacementImage;
  incoming: ReplacementImage;
}
const validDimensions = (image: ReplacementImage) =>
  Number.isInteger(image.width) && Number.isInteger(image.height) && image.width! > 0 && image.height! > 0;

/** Pixel dimensions, never compressed bytes, determine whether an image is smaller.
 * Names must already be normalized by the uploader; no fuzzy/family matching. */
export function planSlackEmojiReplacements(incoming: ReplacementImage[], existing: ReplacementImage[]): ReplacementDecision[] {
  const index = new Map<string, ReplacementImage[]>();
  for (const image of existing) index.set(image.name, [...(index.get(image.name) ?? []), image]);
  const aliasTargets = new Set(existing.flatMap(image=>image.aliasFor?[image.aliasFor]:[]));
  const counts = new Map<string, number>();
  for (const image of incoming) counts.set(image.name, (counts.get(image.name) ?? 0) + 1);
  return incoming.map(image => {
    const matches = index.get(image.name) ?? [], current = matches[0];
    const decision = (action: ReplacementDecision['action'], reason: string): ReplacementDecision => ({name:image.name, action, reason, current, incoming:image});
    if (!/^[a-z0-9_-]+$/.test(image.name) || counts.get(image.name)! > 1 || matches.length > 1)
      return decision('manual-review', 'Invalid or duplicate exact name');
    if (image.aliasFor || current?.aliasFor) return decision('keep-existing', 'Aliases are excluded from replacement');
    if (aliasTargets.has(image.name)) return decision('manual-review', 'Existing aliases depend on this emoji');
    if (!validDimensions(image)) return decision('manual-review', 'Incoming dimensions are unknown');
    if (!current) return decision('upload-new', 'No exact-name match');
    if (!validDimensions(current)) return decision('manual-review', 'Existing dimensions are unknown');
    if (current.animated === undefined || image.animated === undefined)
      return decision('manual-review', 'Animation state is unknown');
    if (current.animated && !image.animated) return decision('keep-existing', 'Do not replace animation with a still');
    if (current.width! <= image.width! && current.height! <= image.height! &&
        Math.max(current.width!,current.height!) < Math.max(image.width!,image.height!))
      return decision('replace-smaller', 'Exact-name match with smaller pixel dimensions');
    return decision('keep-existing', 'Existing image is equal-size, larger, or has mixed dimensions');
  });
}
