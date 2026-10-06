import {memo, useMemo, useState, type CSSProperties} from 'react';
import type {EmojiMetadata} from '../types/emoji';
import {PALETTE, colorShares, themeMascots, topThemes} from '../lib/catalogDiscovery';
import {emojiAsset} from '../lib/emojiAssets';
import '../styles/catalog-discovery.css';

interface Props {
  catalog: EmojiMetadata[];
  word: string | null;
  color: number | null;
  onWord: (word: string | null) => void;
  onColor: (color: number | null) => void;
}

function summary(word: string | null, color: number | null): string {
  const hue = color === null ? '' : PALETTE[color].name.toLowerCase();
  const label = word?.replace(/-/g, ' ');
  if (label && hue) return `${label} stickers, ${hue} ones first`;
  if (label) return `Only ${label} stickers`;
  if (hue) return `Everything, ${hue} first`;
  return 'Pick a theme to narrow the sheet, or a color to bring it forward.';
}

export default memo(function CatalogDiscovery({catalog,word,color,onWord,onColor}: Props) {
  const [limit,setLimit] = useState(10);
  const themes = useMemo(() => topThemes(catalog),[catalog]);
  const mascots = useMemo(() => themeMascots(catalog,themes.map(theme => theme.word)),[catalog,themes]);
  const shares = useMemo(() => colorShares(catalog),[catalog]);
  const peak = themes[0]?.count ?? 1;
  const active = word !== null || color !== null;
  return <section className="theme-atlas" aria-label="Explore themes and colors">
    <div className="atlas-heading">
      <h2>Browse by theme</h2>
      <div role="group" aria-label="Number of themes"><span aria-hidden="true">Show</span>{[5,10,20].map(n => <button key={n} type="button" aria-label={`Show ${n} themes`} aria-pressed={limit===n} onClick={() => setLimit(n)}>{n}</button>)}</div>
    </div>
    <div className="theme-cloud" role="group" aria-label="Theme filters" data-crowded={limit > 10 || undefined}>
      {themes.slice(0,limit).map(({word:label,count}) => {
        const mascot = mascots.get(label);
        return <button key={label} type="button" aria-label={`Filter ${label}`} aria-pressed={word===label} onClick={() => onWord(word===label ? null : label)} title={`${count} stickers`} style={{'--word-size':`${.8 + .35*Math.sqrt(count/peak)}rem`} as CSSProperties}>
          {mascot && <img src={emojiAsset(mascot.filename,64,true)} alt="" width={64} height={64} decoding="async" draggable={false} />}
          <span className="theme-word">{label.replace(/-/g,' ')}</span>
          <span className="theme-count">{count}</span>
        </button>;
      })}
    </div>
    <div className="color-strip" role="group" aria-label="Sort by color">
      {PALETTE.map((item,i) => <button type="button" key={item.name} aria-label={`Sort ${item.name.toLowerCase()} first`} aria-pressed={color===i} onClick={() => onColor(color===i ? null : i)} title={`${item.name}: ${(shares[i]*100).toFixed(1)}% of the artwork`} style={{'--swatch':item.hex,flexGrow:shares[i]} as CSSProperties} />)}
    </div>
    <div className="atlas-status" aria-live="polite" data-active={active || undefined}>
      <span>{summary(word,color)}</span>
      {active && <button type="button" onClick={() => {onWord(null);onColor(null);}}>Reset</button>}
    </div>
  </section>;
});
