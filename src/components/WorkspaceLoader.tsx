import { useEffect, useState, type ComponentType } from 'react';
import type { EmojiWorkspaceProps } from './EmojiWorkspace';

/** Keep a failed lazy chunk from taking down the picker and export bar. */
export default function WorkspaceLoader(props: EmojiWorkspaceProps) {
  const [Component, setComponent] = useState<ComponentType<EmojiWorkspaceProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    const timeout = setTimeout(() => { if (current) setFailed(true); }, 8000);
    import('./EmojiWorkspace').then(module => {
      if (current) { clearTimeout(timeout); setComponent(() => module.default); }
    }).catch(() => { if (current) { clearTimeout(timeout); setFailed(true); } });
    return () => { current = false; clearTimeout(timeout); };
  }, []);
  if (Component) return <Component {...props} />;
  return <aside className="workspace-load-note" role={failed ? 'alert' : 'status'}>
    <p>{failed ? 'The workspace couldn’t load. Your selection is safe.' : 'Opening workspace…'}</p>
    {failed && <button type="button" onClick={() => window.location.reload()}>Reload to retry</button>}
    <button type="button" onClick={props.onClose}>Close workspace</button>
  </aside>;
}
