import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { parseExportProgress, waitingHint } from "../lib/exportProgress";
import "../styles/export-overlay.css";

interface Props {
  kind: "slack" | "zip";
  /** The worker's latest sentence. */
  status: string;
  /** False once the work can no longer be undone (the clipboard write). */
  cancelable: boolean;
  onCancel: () => void;
}

/**
 * Takes over the screen while an export runs. It is mounted the moment the
 * export starts but stays invisible for its first 150ms (see the stylesheet),
 * so an export that finishes at once never flashes a panel. Focus moves to
 * Cancel and Escape means the same, so the way out is always one key away.
 */
export function ExportProgressOverlay({ kind, status, cancelable, onCancel }: Props) {
  const { label, detail, fraction } = parseExportProgress(status);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - started), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { cancelRef.current?.focus(); }, [cancelable]);

  const percent = fraction === null ? undefined : Math.round(fraction * 100);
  const hint = waitingHint(elapsed);

  return (
    <div
      className="export-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-overlay-title"
      aria-busy="true"
      onKeyDown={(event) => {
        if (event.key === "Escape" && cancelable) { event.stopPropagation(); onCancel(); }
        // One control: keep Tab from walking out into the page behind.
        if (event.key === "Tab") { event.preventDefault(); cancelRef.current?.focus(); }
      }}
    >
      <div className="export-overlay-card">
        <LoaderCircle className="export-overlay-spinner" aria-hidden="true" />
        <h2 id="export-overlay-title">{kind === "zip" ? "Building your ZIP" : "Building your Slack script"}</h2>
        <div
          className="export-overlay-bar"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-indeterminate={percent === undefined || undefined}
        >
          <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
        </div>
        <p className="export-overlay-stage" aria-hidden="true">
          {label}{detail && <span className="export-overlay-detail"> · {detail}</span>}
        </p>
        {/* Announced only when the stage changes, not on every counted image. */}
        <p className="sr-only" role="status">{label}</p>
        {hint && <p className="export-overlay-hint">{hint}</p>}
        {cancelable
          ? <button ref={cancelRef} type="button" className="export-overlay-cancel" onClick={onCancel}><X aria-hidden="true" />Cancel export</button>
          : <p className="export-overlay-hint">Almost done…</p>}
      </div>
    </div>
  );
}
