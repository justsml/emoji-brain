import {memo, useMemo, useState, type CSSProperties} from 'react';
import type {EmojiMetadata} from '../types/emoji';
import {PALETTE, colorShares, topThemes} from '../lib/catalogDiscovery';
import '../styles/catalog-discovery.css';

interface Props {
  catalog: EmojiMetadata[];
  word: string | null;
  color: number | null;
  onWord: (word: string | null) => void;
  onColor: (color: number | null) => void;
}

export default memo(function CatalogDiscovery({catalog,word,color,onWord,onColor}: Props) {
  const [limit,setLimit] = useState(10);
  const themes = useMemo(() => topThemes(catalog),[catalog]);
  const shares = useMemo(() => colorShares(catalog),[catalog]);
  const peak = themes[0]?.count ?? 1;
  return <section className="theme-atlas" aria-label="Explore themes and colors">
    <div className="atlas-body">
      <div className="atlas-heading"><span>FOLLOW A THREAD</span><div role="group" aria-label="Number of themes">{[5,10,20].map(n => <button key={n} type="button" aria-label={`Show ${n} themes`} aria-pressed={limit===n} onClick={() => setLimit(n)}>{n}</button>)}</div></div>
      <div className="theme-cloud" role="group" aria-label="Theme filters">
        {themes.slice(0,limit).map(({word:label,count}) => <button key={label} type="button" aria-label={`Filter ${label}`} aria-pressed={word===label} onClick={() => onWord(word===label ? null : label)} title={`${count} stickers · filter ${label}`} style={{'--word-size':`${.82 + .8*Math.sqrt(count/peak)}rem`} as CSSProperties}>{label.replace(/-/g,' ')}<sup>{count}</sup></button>)}
      </div>
      <div className="atlas-status" aria-live="polite">{word || color!==null ? <><span>{word ? `Theme: ${word}` : 'All themes'}{color!==null ? ` · ${PALETTE[color].name} first` : ''}</span><button type="button" onClick={() => {onWord(null);onColor(null);}}>Reset</button></> : <span>Words filter. Colors bring a hue to the front.</span>}</div>
    </div>
    <div className="color-picker" role="group" aria-label="Sort by color">
      <div className="color-scale" aria-hidden="true">{PALETTE.map((item,i) => <span key={item.name} title={`${item.name}: ${(shares[i]*100).toFixed(1)}%`} onClick={() => onColor(color===i ? null : i)} style={{background:item.hex,flexGrow:shares[i]}} />)}</div>
      <div className="color-stops">{PALETTE.map((item,i) => <button type="button" key={item.name} aria-label={`Sort ${item.name.toLowerCase()} first`} aria-pressed={color===i} onClick={() => onColor(color===i ? null : i)} title={`${item.name}: ${(shares[i]*100).toFixed(1)}% of visible artwork · sort closest first`} style={{'--swatch':item.hex} as CSSProperties}><span />{color===i && <i aria-hidden="true">←</i>}</button>)}</div>
    </div>
  </section>;
});
