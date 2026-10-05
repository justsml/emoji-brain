import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmojiMetadata } from '../types/emoji';
import { recoverEmojiPreview, restoreEmojiPreview, emojiAsset } from '../lib/emojiAssets';
import '../styles/emoji-workspace.css';

export interface EmojiWorkspaceProps {
  onInvertVisible: () => void;
  visibleCount: number;
  catalog: EmojiMetadata[];
  selected: EmojiMetadata[];
  source: EmojiMetadata | null;
  onToggle: (emoji: EmojiMetadata) => void;
  onSimilar: (emoji: EmojiMetadata) => void;
  onClose: () => void;
}

export default function EmojiWorkspace({ catalog, selected, source, onToggle, onSimilar, onClose, onInvertVisible, visibleCount }: EmojiWorkspaceProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const worker = useRef<Worker | null>(null);
  const [tab, setTab] = useState(source ? 'similar' : 'sheet');
  const [result, setResult] = useState<{ sourceId: string; ids: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(48);
  const byId = useMemo(() => new Map(catalog.map(emoji => [emoji.id, emoji])), [catalog]);
  const selectedIds = useMemo(() => new Set(selected.map(emoji => emoji.id)), [selected]);

  useEffect(() => {
    const element = panel.current!;
    const previous = document.activeElement as HTMLElement | null;
    const card = previous?.closest('[role="gridcell"]')?.querySelector<HTMLButtonElement>(".emoji-card");
    const closed = (event: Event) => { if ((event as ToggleEvent).newState === 'closed' && !element.matches(':popover-open')) onClose(); };
    element.addEventListener('toggle', closed);
    element.showPopover();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.removeEventListener('toggle', closed);
      element.hidePopover();
      const target = previous?.isConnected ? previous : card;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    if (!source) return;
    setTab('similar');
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

  const ready = source && result?.sourceId === source.id;
  const emojis = tab === 'sheet' ? selected.slice(0, limit) : ready ? result.ids.flatMap(id => byId.get(id) ?? []) : [];
  return (
    <div ref={panel} popover="auto" className="emoji-workspace" role="dialog" aria-modal="false" aria-label="Emoji workspace">
      <header className="workspace-head">
        <div><span className="workspace-eyebrow">YOUR EMOJI WORKSPACE</span><h2>{tab === 'sheet' ? 'The whole sheet.' : 'Find your next favorite.'}</h2></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close emoji workspace">✕</button>
      </header>
      <div className="workspace-tabs" role="group" aria-label="Workspace view">
        <button type="button" aria-pressed={tab === 'sheet'} onClick={() => setTab('sheet')}>Sheet <span>{selected.length}</span></button>
        <button type="button" aria-pressed={tab === 'similar'} onClick={() => setTab('similar')}>Similar</button>
      </div>
      <div className="workspace-scroll">
        {tab === 'similar' && (source ? <div className="workspace-source"><img onError={recoverEmojiPreview} onLoad={restoreEmojiPreview} src={emojiAsset(source.filename, 128, true)} width="64" height="64" alt="" /><div><b>{source.filename.replace(/\.[^.]+$/, '')}</b><p>Related by name, subject, and mood.</p></div></div> : <p>Choose Similar on any sticker to explore related emojis.</p>)}
        {tab === 'similar' && source && !ready && <p role="status">{failed ? 'Suggestions couldn’t load. Your sheet is still available.' : 'Finding related stickers…'}</p>}
        {tab === 'sheet' && !selected.length && <p>Your sheet is empty. Tap stickers to collect them.</p>}
        {tab === 'similar' && ready && !emojis.length && <p>No related labels yet. Try another sticker.</p>}
        {tab === 'similar' && source && failed && <button type="button" className="workspace-more" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry suggestions</button>}
        {tab === 'sheet' && <button type="button" className="workspace-invert" onClick={onInvertVisible} disabled={!visibleCount}>Invert visible selection · {visibleCount} results</button>}
        <div className="workspace-grid">
          {emojis.map(emoji => <div key={emoji.id} className="workspace-sticker">
            <button type="button" className="workspace-pick" aria-label={`${selectedIds.has(emoji.id) ? 'Remove' : 'Select'} ${emoji.filename}`} aria-pressed={selectedIds.has(emoji.id)} onClick={() => onToggle(emoji)}>
              <img onError={recoverEmojiPreview} onLoad={restoreEmojiPreview} src={emojiAsset(emoji.filename, 128, true)} width="96" height="96" loading="lazy" decoding="async" alt="" />
              <span>{emoji.filename.replace(/\.[^.]+$/, '')}</span><i aria-hidden="true">{selectedIds.has(emoji.id) ? '✓' : '+'}</i>
            </button>
            <button type="button" className="workspace-related" onClick={() => onSimilar(emoji)} aria-label={`Similar to ${emoji.filename}`}>Similar ↗</button>
          </div>)}
        </div>
        {tab === 'sheet' && limit < selected.length && <button type="button" className="workspace-more" onClick={() => setLimit(value => value + 48)}>Show 48 more · {selected.length - limit} remaining</button>}
      </div>
      <footer className="workspace-foot">{tab === 'sheet' ? 'Tap a selected sticker to remove it.' : 'Tap a suggestion to add it to your sheet.'} Close this panel to export your sheet.</footer>
    </div>
  );
}
