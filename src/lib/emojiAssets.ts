export const PREVIEW_SIZES = [64, 128, 256] as const;
export function emojiName(filename: string): string { return filename.replace(/\.[^.]+$/, ''); }
export function emojiAsset(filename: string, size: number | 'original', still = false): string {
  return `/emoji-delivery/${still ? 'previews/' : ''}${size}/${encodeURIComponent(emojiName(filename))}.webp`;
}
export function previewSrcSet(filename: string): string {
  return PREVIEW_SIZES.map(size => `${emojiAsset(filename, size, true)} ${size}w`).join(', ');
}

/** A bounded static fallback; never loop or download full-size originals. */
export function recoverEmojiPreview(event: {currentTarget: HTMLImageElement}): void {
  const image = event.currentTarget;
  const url = new URL(image.currentSrc || image.src, document.baseURI);
  const fallback = url.pathname.replace(/\/emoji-delivery\/(?:previews\/)?(?:32|64|128|256)\//, '/emoji-delivery/previews/64/');
  if (!image.dataset.previewFallback && fallback !== url.pathname) {
    image.dataset.previewFallback = 'true';
    image.removeAttribute('srcset');
    image.src = fallback;
    return;
  }
  image.dataset.previewUnavailable = 'true';
  image.style.visibility = 'hidden';
  image.parentElement?.setAttribute('data-preview-unavailable', 'true');
}

export function restoreEmojiPreview(event: {currentTarget: HTMLImageElement}): void {
  const image = event.currentTarget;
  if (!image.dataset.previewFallback && !image.dataset.previewUnavailable) return;
  delete image.dataset.previewFallback;
  delete image.dataset.previewUnavailable;
  image.style.visibility = '';
  image.parentElement?.removeAttribute('data-preview-unavailable');
}
export function markdownTable(filenames: string[], origin: string): string {
  const escape = (text: string) => text.replace(/[\\|\[\]]/g, '\\$&');
  return ['| Name | 64px | 128px | 256px |', '|---|---|---|---|', ...filenames.map(filename => {
    const name = escape(emojiName(filename));
    const link = (size: number | 'original') => new URL(emojiAsset(filename, size), origin).href;
    return `| [${name}](${link('original')}) | ${PREVIEW_SIZES.map(size => `![${name} ${size}px](${link(size)})`).join(' | ')} |`;
  })].join('\n');
}
