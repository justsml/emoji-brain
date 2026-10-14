import { useEffect, useState, type ComponentType } from 'react';
import type { EmojiWorkspaceProps } from './EmojiWorkspace';

/** After this the note admits the connection is slow. */
const SLOW_MS = 2500;
/** After this a reload is offered, though the download keeps going. */
const STUCK_MS = 15000;

/**
 * Keep a failed lazy chunk from taking down the picker and export bar. A slow
 * chunk isn't a failed one: on a weak connection it can take far longer than
 * any fixed timeout, so waiting only escalates what the note says. Only a
 * rejected import counts as failure.
 */
export default function WorkspaceLoader(props: EmojiWorkspaceProps) {
  const [Component, setComponent] = useState<ComponentType<EmojiWorkspaceProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [wait, setWait] = useState<'brief' | 'slow' | 'stuck'>('brief');
  useEffect(() => {
    let current = true;
    setFailed(false);
    const slow = setTimeout(() => { if (current) setWait('slow'); }, SLOW_MS);
    const stuck = setTimeout(() => { if (current) setWait('stuck'); }, STUCK_MS);
    import('./EmojiWorkspace').then(module => {
      if (current) setComponent(() => module.default);
    }).catch(() => { if (current) setFailed(true); }).finally(() => { clearTimeout(slow); clearTimeout(stuck); });
    return () => { current = false; clearTimeout(slow); clearTimeout(stuck); };
  }, []);
  if (Component) return <Component {...props} />;
  const message = failed ? 'The workspace couldn’t load. Your selection is safe.'
    : wait === 'brief' ? 'Opening workspace…'
    : wait === 'slow' ? 'Still opening — this connection is slow. Your selection is safe.'
    : 'Still downloading the workspace. You can keep waiting or reload to try again.';
  return <aside className="workspace-load-note" role={failed ? 'alert' : 'status'} aria-busy={!failed}>
    <p>{message}</p>
    {(failed || wait === 'stuck') && <button type="button" onClick={() => window.location.reload()}>Reload to retry</button>}
    <button type="button" onClick={props.onClose}>Close workspace</button>
  </aside>;
}
