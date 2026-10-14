/**
 * The size control's steps: the drawn width of each sticker, which `sizes`
 * states exactly. S and L land on delivered widths (64, 128), so 1x screens
 * get a pixel-exact still and 2x screens the next one up; M and XL take the
 * 128px and 256px stills slightly downscaled. Only XL on a 2x screen asks for
 * more than the largest still (384 vs 256). Tiles add room for the selection
 * tab and breathing space.
 */
export const STICKER_SIZES = [64, 96, 128, 192] as const;
/** Tile widths, in px: the grid track minimum for each step. */
export const GRID_SCALES = [76, 108, 148, 208] as const;
export const DEFAULT_GRID_SCALE = 2;
export const GRID_SCALE_STORAGE_KEY = 'emoji-grid-scale';
/** Light previews start every sticker from this file, at any pixel density. */
export const LIGHT_STICKER_SIZE = 64;
