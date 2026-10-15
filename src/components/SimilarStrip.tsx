import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmojiMetadata } from '../types/emoji';
import { recoverEmojiPreview, restoreEmojiPreview, stillImageProps } from '../lib/emojiAssets';
import '../styles/similar-strip.css';

export interface SimilarStripProps {
  catalog: EmojiMetadata[];
  selected: EmojiMetadata[];
  source: EmojiMetadata;
  onToggle: (emoji: EmojiMetadata) => void;
  onSimilar: (emoji: EmojiMetadata) => void;
  onClose: () => void;
}

const nameOf = (emoji: EmojiMetadata) => emoji.filename.replace(/\.[^.]+$/, '');

/**
 * A strip of stickers peeled out for a moment: related to one sticker, gone on
 * Esc, ✕, or a tap anywhere outside it. Not a dialog — nothing behind it is
 * inert, so the grid and the tray stay usable.
 */
export default function SimilarStrip({ catalog, selected, source, onToggle, onSimilar, onClose }: SimilarStripProps) {
  const root = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const worker = useRef<Worker | null>(null);
  // Chaining swaps the list under the user's finger; focus follows to the new first item.
  const refocus = useRef(false);
  const [result, setResult] = useState<{ sourceId: string; ids: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const byId = useMemo(() => new Map(catalog.map(emoji => [emoji.id, emoji])), [catalog]);
  const selectedIds = useMemo(() => new Set(selected.map(emoji => emoji.id)), [selected]);

  // Focus in on open, back out on close; dismissal on Esc and outside taps.
  useEffect(() => {
    const element = root.current!;
    const previous = document.activeElement as HTMLElement | null;
    // The card's actions vanish when it loses focus, so fall back to the card itself.
    const card = previous?.closest('[role="gridcell"]')?.querySelector<HTMLButtonElement>('.emoji-card');
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onOutside = (event: PointerEvent) => {
      // The tray and a card's Similar button belong to the same gesture: keep the strip.
      if (!(event.target instanceof Element) || element.contains(event.target)) return;
      if (event.target.closest('.sheet-tray, .emoji-card-actions')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
      const target = previous?.isConnected && previous !== document.body ? previous : card;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [onClose]);

  // Sit just above the tray, whatever height it wraps to.
  useEffect(() => {
    const element = root.current!;
    const tray = document.querySelector('.sheet-tray');
    if (!tray || typeof ResizeObserver === 'undefined') return;
    const place = () => element.style.setProperty('--tray-clearance', `${Math.max(0, innerHeight - tray.getBoundingClientRect().top)}px`);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(tray);
    addEventListener('resize', place);
    return () => { observer.disconnect(); removeEventListener('resize', place); };
  }, []);

  useEffect(() => {
    setFailed(false);
    let current = true;
    const fail = () => {
      if (!current) return;
      clearTimeout(timeout);
      worker.current?.terminate();
      worker.current = null;
      setFailed(true);
    };
    const timeout = setTimeout(fail, 5000);
    try {
      const fresh = !worker.current;
      if (fresh) worker.current = new Worker(new URL('../lib/similar.worker.ts', import.meta.url), { type: 'module' });
      const activeWorker = worker.current!;
      activeWorker.onmessage = event => {
        if (!current) return;
        if (!event.data || typeof event.data !== 'object') { fail(); return; }
        if (event.data.sourceId !== source.id) return;
        if (!Array.isArray(event.data.ids) || !event.data.ids.every((id: unknown) => typeof id === 'string')) { fail(); return; }
        clearTimeout(timeout);
        setResult(event.data);
      };
      activeWorker.onerror = event => { event.preventDefault(); fail(); };
      activeWorker.onmessageerror = fail;
      activeWorker.postMessage({
        sourceId: source.id,
        ...(fresh ? {catalog: catalog.map(({id, filename, tags, categories}) => ({id, filename, tags, categories}))} : {}),
      });
    } catch { fail(); }
    return () => { current = false; clearTimeout(timeout); };
  }, [source, catalog, attempt]);
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);

  const ready = result?.sourceId === source.id;
  const emojis = ready ? result.ids.flatMap(id => byId.get(id) ?? []) : [];

  useEffect(() => {
    if (!ready || !refocus.current) return;
    refocus.current = false;
    list.current?.scrollTo?.({ left: 0 });
    list.current?.querySelector<HTMLButtonElement>('.similar-pick')?.focus({ preventScroll: true });
  }, [ready, source]);

  const status = failed ? 'Suggestions couldn’t load.'
    : !ready ? 'Finding related stickers…'
    : !emojis.length ? 'No related stickers for this one yet.' : '';
  return (
    <section ref={root} className="similar-strip" aria-label={`Stickers similar to ${nameOf(source)}`}>
      <header className="similar-head">
        <img onError={recoverEmojiPreview} onLoad={restoreEmojiPreview} {...stillImageProps(source.filename, 28)} width="28" height="28" alt="" />
        <p>Similar to{" "}<b>{nameOf(source)}</b></p>
        <button ref={closeButton} type="button" className="similar-close" onClick={onClose} aria-label="Close similar stickers"><span aria-hidden="true">✕</span></button>
      </header>
      {status
        ? <p className="similar-note" role={failed ? 'alert' : 'status'}>
            {status}
            {failed && <button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry</button>}
          </p>
        : <ul ref={list} className="similar-list">
            {emojis.map(emoji => {
              const picked = selectedIds.has(emoji.id);
              return <li key={emoji.id} className="similar-item">
                <button type="button" className="similar-pick" aria-pressed={picked} aria-label={emoji.filename} onClick={() => onToggle(emoji)}>
                  <img onError={recoverEmojiPreview} onLoad={restoreEmojiPreview} {...stillImageProps(emoji.filename, 56)} width="56" height="56" loading="lazy" decoding="async" alt="" />
                  <span>{nameOf(emoji)}</span>
                  <i aria-hidden="true">✓</i>
                </button>
                <button type="button" className="similar-chain" onClick={() => { refocus.current = true; onSimilar(emoji); }} aria-label={`Similar to ${emoji.filename}`} title="More like this"><span aria-hidden="true">✦</span></button>
              </li>;
            })}
          </ul>}
    </section>
  );
}
