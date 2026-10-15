import { useEffect, useState, type ComponentType } from 'react';
import type { SimilarStripProps } from './SimilarStrip';

/** After this the note admits the connection is slow. */
const SLOW_MS = 2500;

/**
 * Keep the strip out of the main bundle, and a failed chunk from taking down
 * the picker. A slow chunk isn't a failed one, so waiting only changes the
 * note; only a rejected import counts as failure.
 */
export default function SimilarStripLoader(props: SimilarStripProps) {
  const [Component, setComponent] = useState<ComponentType<SimilarStripProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const { onClose } = props;
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { if (current) setSlow(true); }, SLOW_MS);
    import('./SimilarStrip').then(module => {
      if (current) setComponent(() => module.default);
    }).catch(() => { if (current) setFailed(true); }).finally(() => clearTimeout(timer));
    return () => { current = false; clearTimeout(timer); };
  }, []);
  // Esc works before the chunk arrives too.
  useEffect(() => {
    if (Component) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [Component, onClose]);
  if (Component) return <Component {...props} />;
  const message = failed ? 'Similar stickers couldn’t load. Your sheet is safe.'
    : slow ? 'Still loading — this connection is slow.' : 'Finding similar stickers…';
  return <aside className="similar-load-note" role={failed ? 'alert' : 'status'} aria-busy={!failed}>
    <p>{message}</p>
    {failed && <button type="button" onClick={() => window.location.reload()}>Reload</button>}
    <button type="button" onClick={onClose} aria-label="Close similar stickers"><span aria-hidden="true">✕</span></button>
  </aside>;
}
