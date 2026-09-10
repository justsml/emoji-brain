import type {ExportRequest, ExportResult} from './exportCore';
export function runExportWorker(request: ExportRequest, signal: AbortSignal, progress: (text: string) => void): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Export canceled', 'AbortError')); return; }
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), {type: 'module'});
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Export canceled', 'AbortError')); };
    signal.addEventListener('abort', abort, {once: true});
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Export worker failed')); };
    worker.onmessageerror = () => { cleanup(); reject(new Error('Could not read export result')); };
    worker.onmessage = event => {
      if (event.data.type === 'progress') progress(event.data.text);
      else { cleanup(); if (event.data.type === 'error') reject(new Error(event.data.message)); else resolve(event.data.result); }
    };
    worker.postMessage(request);
  });
}
