import React from 'react';
import { track } from '../lib/analytics';
import { setPreviewPreference, usePreviewQuality, type SlowSignal } from '../lib/previewQuality';

const REASONS: Record<Exclude<SlowSignal, null>, string> = {
  'save-data': 'Data saver is on',
  network: 'Slow connection',
  'slow-load': 'Slow connection',
  stalled: 'Slow connection',
  recent: 'Slow connection earlier',
};

/**
 * Says so when the grid has switched to light previews, and hands the choice
 * back. Silent on an ordinary connection with no stored preference.
 */
const PreviewQualityNotice: React.FC = () => {
  const { preference, slow, light } = usePreviewQuality();
  if (preference === 'auto' && !slow) return null;
  const choose = (next: 'light' | 'sharp') => {
    track('preview_quality_changed', { preference: next, signal: slow ?? 'none' });
    setPreviewPreference(next);
  };
  const reason = slow ? REASONS[slow] : null;
  return (
    <p className="preview-quality" role="status" data-light={light || undefined}>
      <span>
        {light
          ? <>{reason ?? 'Light previews'}<span className="preview-quality-detail"> · smaller stills, tap to animate</span></>
          : <>Sharp previews<span className="preview-quality-detail">{reason ? ` · ${reason.toLowerCase()}` : ''}</span></>}
      </span>
      <button type="button" onClick={() => choose(light ? 'sharp' : 'light')}>
        {light ? 'Load sharp' : 'Go light'}
      </button>
    </p>
  );
};

export default PreviewQualityNotice;
