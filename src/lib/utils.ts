import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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