import {prepareExport, type ExportRequest} from './exportCore';
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    let lastProgress = 0;
    const result = await prepareExport(event.data, text => {
      const now = performance.now();
      // A few progress updates per second avoid repeatedly rendering the selection tray.
      if (now - lastProgress >= 250) { lastProgress = now; self.postMessage({type: 'progress', text}); }
    });
    if (result.kind === 'zip') self.postMessage({type: 'result', result}, {transfer: [result.buffer]});
    else self.postMessage({type: 'result', result});
  } catch (error) {
    self.postMessage({type: 'error', message: error instanceof Error ? error.message : String(error)});
  }
};
