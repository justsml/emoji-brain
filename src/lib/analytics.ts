import type { PostHog } from 'posthog-js';

type Properties = Record<string, string | number | boolean | null>;
type Pending = { event: string; properties: Properties } | { error: unknown; properties: Properties };
let client: PostHog | undefined;
let scheduled = false;
let unavailable = false;
const pending: Pending[] = [];

const enabled = () => typeof window !== 'undefined' && import.meta.env.PROD && !window.navigator.webdriver;

function deliver(item: Pending) {
  try {
    if ('event' in item) client?.capture(item.event, item.properties);
    else client?.captureException(item.error, item.properties);
  } catch { /* Analytics must never interrupt an interaction or export. */ }
}

function enqueue(item: Pending) {
  if (!enabled() || unavailable) return;
  if (client) deliver(item);
  else {
    if (pending.length < 50) pending.push(item);
    initAnalytics();
  }
}

export function track(event: string, properties: Properties = {}) {
  enqueue({ event, properties });
}

export function trackError(error: unknown, properties: Properties = {}) {
  enqueue({ error, properties });
}

/** Keep the SDK out of the initial application bundle and rendering path. */
export function initAnalytics() {
  if (!enabled() || scheduled) return;
  scheduled = true;
  const onError = (event: ErrorEvent) => trackError(event.error ?? new Error(event.message), { source: 'window' });
  const onRejection = (event: PromiseRejectionEvent) => trackError(event.reason, { source: 'unhandled_rejection' });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const load = async () => {
    try {
      const { default: posthog } = await import('posthog-js');
      posthog.init('phc_wJukki7gzV8d4tekUCSyK9ArpteNBNo2tPUHXHhwfSAF', {
        api_host: 'https://fun.adorbs.fun',
        defaults: '2026-05-30',
        // This site uses full-page navigation; share-link cleanup is not a pageview.
        capture_pageview: true,
        autocapture: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        disable_capture_url_hashes: true,
        before_send: event => {
          if (!event) return event;
          for (const key of ['$current_url', '$initial_current_url', '$referrer', '$initial_referrer', '$session_entry_url']) {
            const value = event.properties[key];
            if (typeof value !== 'string' || !value) continue;
            try {
              const url = new URL(value);
              url.search = '';
              url.hash = '';
              event.properties[key] = url.href;
            } catch { delete event.properties[key]; }
          }
          return event;
        },
        capture_exceptions: true,
        disable_session_recording: true,
      });
      client = posthog;
      for (const item of pending.splice(0)) deliver(item);
    } catch {
      unavailable = true;
      pending.length = 0;
    } finally {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    }
  };
  const defer = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 2000 });
    else setTimeout(() => void load(), 0);
  };
  if (document.readyState === 'complete') defer();
  else window.addEventListener('load', defer, { once: true });
}
