export const PREVIEW_SIZES = [64, 128, 256] as const;
export function emojiName(filename: string): string { return filename.replace(/\.[^.]+$/, ''); }
export function emojiAsset(filename: string, size: number | 'original', still = false): string {
  return `/emoji-delivery/${still ? 'previews/' : ''}${size}/${encodeURIComponent(emojiName(filename))}.webp`;
}
export function previewSrcSet(filename: string): string {
  return PREVIEW_SIZES.map(size => `${emojiAsset(filename, size, true)} ${size}w`).join(', ');
}
export function markdownTable(filenames: string[], origin: string): string {
  const escape = (text: string) => text.replace(/[\\|\[\]]/g, '\\$&');
  return ['| Name | 64px | 128px | 256px |', '|---|---|---|---|', ...filenames.map(filename => {
    const name = escape(emojiName(filename));
    const link = (size: number | 'original') => new URL(emojiAsset(filename, size), origin).href;
    return `| [${name}](${link('original')}) | ${PREVIEW_SIZES.map(size => `![${name} ${size}px](${link(size)})`).join(' | ')} |`;
  })].join('\n');
}
