import type {EmojiMetadata} from '../types/emoji';

export const PALETTE = [
  {name: 'Red', hex: '#e64c55', hue: 0},
  {name: 'Orange', hex: '#f28c38', hue: 30},
  {name: 'Yellow', hex: '#efc72d', hue: 60},
  {name: 'Green', hex: '#56ad65', hue: 120},
  {name: 'Cyan', hex: '#43bfc2', hue: 180},
  {name: 'Blue', hex: '#518be3', hue: 225},
  {name: 'Violet', hex: '#9363cc', hue: 270},
  {name: 'Pink', hex: '#e37dae', hue: 320},
  {name: 'Brown', hex: '#9b6b48', hue: 30},
  {name: 'Black', hex: '#34363a', hue: -1},
  {name: 'Gray', hex: '#9ca2a6', hue: -1},
  {name: 'White', hex: '#eeeae2', hue: -1},
] as const;

export function colorBin(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!max || delta / max < .18) return max < 70 ? 9 : max > 210 ? 11 : 10;
  const hue = (((max === r ? (g-b)/delta : max === g ? (b-r)/delta+2 : (r-g)/delta+4)*60)+360)%360;
  if (hue >= 15 && hue < 55 && max < 170) return 8;
  let closest = 0, distance = Infinity;
  for (let i = 0; i < 8; i++) {
    const gap = Math.abs(hue - PALETTE[i].hue), circular = Math.min(gap, 360-gap);
    if (circular < distance) { distance = circular; closest = i; }
  }
  return closest;
}

export function pixelProfile(pixels: Uint8Array): number[] {
  const bins = PALETTE.map(() => 0);
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const weight = pixels[i+3] / 255;
    bins[colorBin(pixels[i], pixels[i+1], pixels[i+2])] += weight;
    total += weight;
  }
  return bins.map(weight => total ? Math.round(weight / total * 1000) : 0);
}

export function topThemes(catalog: EmojiMetadata[]) {
  const counts = new Map<string, number>();
  for (const emoji of catalog) for (const word of new Set(emoji.themes ?? emoji.categories)) {
    const label = word.toLowerCase().trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([word, count]) => ({word, count}))
    .sort((a,b) => b.count-a.count || a.word.localeCompare(b.word)).slice(0,20);
}

/** One distinct sticker per theme, so the picker can show the word as well as name it. */
export function themeMascots(catalog: EmojiMetadata[], words: string[]): Map<string, EmojiMetadata> {
  const used = new Set<string>(), mascots = new Map<string, EmojiMetadata>();
  for (const word of words) {
    let best: EmojiMetadata | undefined, bestScore = -1;
    for (const emoji of catalog) {
      if (used.has(emoji.id) || !(emoji.themes ?? emoji.categories).some(label => label.toLowerCase() === word)) continue;
      // Stills sit quietly in the header, a name containing the word reads as the obvious pick,
      // and number badges (100, 10000...) say nothing about a theme.
      const name = emoji.filename.toLowerCase();
      const score = (/\d/.test(name) ? 0 : 4) + (emoji.animated ? 0 : 2) + (name.includes(word) ? 1 : 0);
      if (score > bestScore) { best = emoji; bestScore = score; }
    }
    if (best) { used.add(best.id); mascots.set(word, best); }
  }
  return mascots;
}

export function colorShares(catalog: EmojiMetadata[]) {
  const sums = PALETTE.map((_, i) => catalog.reduce((sum, emoji) => sum + (emoji.colors?.[i] ?? 0), 0));
  const total = sums.reduce((a,b) => a+b, 0);
  return sums.map(sum => total ? sum/total : 0);
}

export function colorAffinity(emoji: EmojiMetadata, color: number): number {
  const target = PALETTE[color];
  if (!target) return 0;
  return (emoji.colors ?? []).reduce((score, mass, i) => {
    const other = PALETTE[i];
    if (!other) return score;
    if (i === color) return score + mass;
    // Nearby hues contribute modestly; neutrals and brown retain their identity.
    if (color >= 8 || i >= 8) return score;
    const gap = Math.abs(target.hue-other.hue), distance = Math.min(gap,360-gap);
    return score + mass * .3 * Math.max(0, 1-distance/90);
  }, 0);
}

export function discover(catalog: EmojiMetadata[], word: string | null, color: number | null): EmojiMetadata[] {
  const filtered = word ? catalog.filter(emoji => (emoji.themes ?? emoji.categories).some(label => label.toLowerCase() === word)) : catalog;
  if (color === null) return filtered;
  // Cache scores once for this sort; stable ties retain search relevance.
  return filtered.map((emoji,index) => ({emoji,index,score:colorAffinity(emoji,color)}))
    .sort((a,b) => b.score-a.score || a.index-b.index).map(row => row.emoji);
}
