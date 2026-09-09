import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The still frame for an animated emoji, written by scripts/update-emojis.ts.
 * Animated WebPs re-rasterize forever, so the grid draws stills and only plays the
 * real file while a sticker is hovered, focused or tapped.
 */
export function stillSrc(emoji: { path: string; animated?: boolean }): string {
  if (!emoji.animated) return emoji.path;
  return emoji.path.replace(/\/emojis\/([^/]+)$/, "/emojis/still/$1");
}

/**
 * Converts a relative path to an absolute URL using the current origin
 */
export function getAbsoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  
  const origin = window.location.origin;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}