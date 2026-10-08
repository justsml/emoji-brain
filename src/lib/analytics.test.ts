import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), captureException: vi.fn() }));
vi.mock('posthog-js', () => ({ default: sdk }));

let idle: () => void;
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('PROD', true);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => { idle = callback; return 1; }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('analytics delivery', () => {
  it('defers initialization, preserves early events and errors, and initializes once', async () => {
    const analytics = await import('./analytics');
    const error = new Error('export failed');
    analytics.initAnalytics();
    analytics.track('export_started', { format: 'zip', selected_count: 2 });
    analytics.trackError(error, { source: 'file_export' });
    expect(sdk.init).not.toHaveBeenCalled();
    idle();
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(error, { source: 'file_export' }));
    analytics.initAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({api_host: 'https://fun.adorbs.fun', defaults: '2026-05-30', disable_session_recording: true}));
    expect(sdk.capture).toHaveBeenCalledWith('export_started', { format: 'zip', selected_count: 2 });
    analytics.track('export_completed');
    expect(sdk.capture).toHaveBeenLastCalledWith('export_completed', {});
    const config = sdk.init.mock.calls[0][1];
    const event = { properties: { $current_url: 'https://adorbs.fun/?q=private#sheet', format: 'zip' } };
    expect(config.before_send(event).properties).toEqual({ $current_url: 'https://adorbs.fun/', format: 'zip' });
  });

  it('bounds the queue and tolerates an unavailable SDK', async () => {
    sdk.init.mockImplementation(() => { throw new Error('blocked'); });
    const analytics = await import('./analytics');
    for (let i = 0; i < 100; i++) analytics.track('selection');
    idle();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(() => analytics.track('export_completed')).not.toThrow();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it('retains at most 50 events while waiting for page load', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const analytics = await import('./analytics');
    for (let i = 0; i < 100; i++) analytics.track('selection', { index: i });
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    idle();
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(50));
    expect(sdk.capture).toHaveBeenLastCalledWith('selection', { index: 49 });
  });

  it('never lets a capture failure escape into application code', async () => {
    const analytics = await import('./analytics');
    analytics.initAnalytics();
    idle();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    sdk.capture.mockImplementation(() => { throw new Error('offline'); });
    expect(() => analytics.track('export_completed')).not.toThrow();
  });

  it('keeps development and test traffic out of PostHog', async () => {
    vi.stubEnv('PROD', false);
    const analytics = await import('./analytics');
    analytics.initAnalytics();
    analytics.track('selection');
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
  });
});
