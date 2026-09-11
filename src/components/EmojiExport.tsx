import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import type { EmojiMetadata } from "../types/emoji";
import { getAbsoluteUrl } from "../lib/utils";
import type { SlackResolution } from '../lib/slackExportPlan';
import { runExportWorker } from "../lib/exportWorker";
import { emojiAsset, markdownTable } from "../lib/emojiAssets";
import { CheckSquare, XSquare, ChevronDown, Copy, LoaderCircle, X, Check, Trash2, Link } from "lucide-react";
import "../styles/sheet-tray.css";

interface EmojiExportProps {
  selectedEmojis: EmojiMetadata[];
  onClearSelection: () => void;
  onDeselectVisible: () => void;
  onSelectAll: () => void;
  filteredEmojis: EmojiMetadata[];
  gridScale: number;
  onRemoveEmoji: (emoji: EmojiMetadata) => void;
  /** Returns a URL that reopens this sheet; omit to hide the share button. */
  shareUrl?: () => string;
}

export function EmojiExport({ selectedEmojis, onClearSelection, onDeselectVisible, onSelectAll, filteredEmojis, gridScale, onRemoveEmoji, shareUrl }: EmojiExportProps) {
  const [exportStatus, setExportStatus] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [copiedScript, setCopiedScript] = useState<{ megabytes: string; count: number; replaceSmaller: boolean; resolutions: SlackResolution[] } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scriptButtonRef = useRef<HTMLButtonElement>(null);
  const closeInstructionsRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const visibleIds = new Set(filteredEmojis.map(emoji => emoji.id));
  const hasVisibleSelection = selectedEmojis.some(emoji => visibleIds.has(emoji.id));

  const setStatusWithTimeout = useCallback((status: string) => {
    setExportStatus(status);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setExportStatus(""), 5000);
  }, []);

  const exportAsPlainText = useCallback(async () => {
    const text = selectedEmojis.map((emoji) => emoji.filename).join("\n");
    await navigator.clipboard.writeText(text);
    setStatusWithTimeout("Copied filenames to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsHtml = useCallback(async () => {
    const html = selectedEmojis
      .map((emoji) => `<img src="${getAbsoluteUrl(emoji.path)}" alt="${emoji.filename}" />`)
      .join("\n");
    await navigator.clipboard.writeText(html);
    setStatusWithTimeout("Copied HTML to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsCss = useCallback(async () => {
    const css = selectedEmojis
      .map(
        (emoji) => `.emoji-${emoji.id} {
  background-image: url('${getAbsoluteUrl(emoji.path)}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}`
      )
      .join("\n\n");
    await navigator.clipboard.writeText(css);
    setStatusWithTimeout("Copied CSS to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsMarkdownTable = useCallback(async () => {
    const markdown = markdownTable(selectedEmojis.map(emoji => emoji.filename), window.location.origin);
    await navigator.clipboard.writeText(markdown);
    setStatusWithTimeout("Copied Markdown Table to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl());
      setStatusWithTimeout(`Link copied · ${selectedEmojis.length} ${selectedEmojis.length === 1 ? "emoji" : "emojis"}`);
    } catch (error) {
      console.error("Could not copy share link:", error);
      setStatusWithTimeout("Could not copy the link. Please try again.");
    }
  }, [shareUrl, selectedEmojis.length, setStatusWithTimeout]);

  const exportFiles = useCallback(async (kind: 'slack' | 'zip', replaceSmaller = false) => {
    if (isExporting || selectedEmojis.length === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsExporting(true);
    setCopiedScript(null);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setExportStatus(`Preparing 0 of ${selectedEmojis.length} emojis…`);
    try {
      const result = await runExportWorker({kind, filenames: selectedEmojis.map(e => e.filename), origin: window.location.origin, replaceSmaller}, controller.signal, setExportStatus);
      if (result.kind === 'slack') {
        setExportStatus('Copying script to clipboard… Please wait; large exports may briefly pause your browser.');
        // Let React commit and the browser paint the message before clipboard work.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (controller.signal.aborted) return;
        const megabytes = (result.scriptBytes / 1_000_000).toFixed(3);
        await navigator.clipboard.writeText(result.script);
        setCopiedScript({megabytes, count: result.count, replaceSmaller, resolutions: result.resolutions});
        setStatusWithTimeout(`Copied Slack script · ${megabytes} MB`);
      } else {
        const url = URL.createObjectURL(new Blob([result.buffer], {type: 'application/zip'}));
        const a = document.createElement('a');
        a.href = url; a.download = 'selected-emojis.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatusWithTimeout('ZIP downloaded!');
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatusWithTimeout(`Could not export: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsExporting(false);
      }
    }
  }, [selectedEmojis, isExporting, setStatusWithTimeout]);

  const cancelExport = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsExporting(false);
    setStatusWithTimeout('Export canceled');
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (copiedScript) closeInstructionsRef.current?.focus();
  }, [copiedScript]);

  const closeInstructions = () => {
    setCopiedScript(null);
    scriptButtonRef.current?.focus();
  };

  const runExport = (action: () => void | Promise<void>) => {
    exportMenuRef.current?.hidePopover?.();
    Promise.resolve().then(action).catch(error => setStatusWithTimeout(`Could not export: ${error instanceof Error ? error.message : String(error)}`));
  };

  return (
    <>
    {copiedScript && (
      <section
        aria-labelledby="slack-instructions-title"
        onKeyDown={(event) => { if (event.key === "Escape") closeInstructions(); }}
        className="slack-guide animate-in slide-in-from-bottom-4 fade-in duration-200 motion-reduce:animate-none"
      >
        <div className="slack-guide-head">
          <div>
            <div className="slack-guide-receipt"><Check className="h-3.5 w-3.5" /> {copiedScript.count} emojis · {copiedScript.megabytes} MB on your clipboard</div>
            <h2 id="slack-instructions-title">Three steps to get them into Slack</h2>
          </div>
          <Button ref={closeInstructionsRef} variant="ghost" size="icon" aria-label="Close Slack instructions" onClick={closeInstructions}><X className="h-4 w-4" /></Button>
        </div>
        <p className="slack-guide-note" aria-label="Exported image resolutions">
          {copiedScript.resolutions.map(r => `${r.count} ${r.animated ? 'animated' : 'still'} at ${r.size}×${r.size}`).join(' · ')}
          {' — sized automatically to keep the script under 8 MB.'}
        </p>
        <p className="slack-guide-note">Select fewer emojis to make room for larger images, up to 256px stills and 128px animations. ZIP exports include full-size originals and a local Slack script generator.</p>
        {copiedScript.replaceSmaller && <p>The script opens a replacement preview in Slack. Save the originals backup and confirm the selected changes before anything is deleted.</p>}
        <ol>
          <li>Sign in to your workspace and open <code>https://YOUR-WORKSPACE.slack.com/customize/emoji</code>.</li>
          <li>Open your browser’s developer tools and select the <strong>Console</strong> tab.</li>
          <li>Paste the script and press <strong>Enter</strong>. Leave the page open while it uploads — the console reports each emoji and a final count.</li>
        </ol>
        {Number(copiedScript.megabytes) >= 1 && <p className="slack-guide-note">Pasting a large script can briefly pause DevTools. Give it time to finish, then press Enter once. Image preparation reports progress in the console.</p>}
        <p className="slack-guide-note">Your workspace must allow you to add custom emoji. The console lists any names or images Slack rejects.</p>
      </section>
    )}
    <div className="sheet-tray">
      <div className="sheet-summary">
        <div className="sheet-tally" aria-label={`${selectedEmojis.length} selected`}>
          {selectedEmojis.length === 0 ? (
            <span className="sheet-empty">
              <b>No emojis selected</b>
              <span>Tap any sticker above to start your sheet.</span>
            </span>
          ) : (
            <>
              <strong>{selectedEmojis.length}</strong> on your sheet
              <span className="sheet-weight">
                {parseFloat(
                  (
                    selectedEmojis.reduce((total, emoji) => total + emoji.size, 0) /
                    1024
                  ).toFixed(1)
                ).toLocaleString()} KB
              </span>
            </>
          )}
        </div>
        {selectedEmojis.length > 0 && (
          <div className="sheet-strip scrollbar-hide mask-fade-right">
            {selectedEmojis.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                className="sheet-chip"
                onClick={() => onRemoveEmoji(emoji)}
                title={`Remove ${emoji.filename}`}
              >
                {/* stills only: the tray sits on a blurred backdrop, so an
                    animating chip would force it to re-blur every frame */}
                <img
                  src={emojiAsset(emoji.filename, 64, true)}
                  width={32}
                  height={32}
                  alt={emoji.filename}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sheet-actions">
        <Button
          variant="ghost"
          onClick={onSelectAll}
          className="h-9 w-9 p-0 hover:bg-primary/10 hover:text-primary"
          size="sm"
          title="Select All Visible"
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={onDeselectVisible}
          className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive disabled:opacity-35"
          size="sm"
          title="Deselect visible"
          aria-label="Deselect visible"
          disabled={!hasVisibleSelection}
        >
          <XSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={onClearSelection}
          className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive disabled:opacity-35"
          size="sm"
          title="Clear all selected emojis"
          aria-label="Clear all selected emojis"
          disabled={selectedEmojis.length === 0}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="sheet-divider" />
        {shareUrl && selectedEmojis.length > 0 && (
          <Button
            variant="ghost"
            onClick={copyShareLink}
            className="sheet-share h-9 w-9 p-0 hover:bg-primary/10 hover:text-primary"
            size="sm"
            title="Copy a link to this sheet"
            aria-label="Copy a link to this sheet"
          >
            <Link className="h-4 w-4" />
          </Button>
        )}
        <div className="flex items-center">
          <Button
            ref={scriptButtonRef}
            onClick={() => void exportFiles('slack')}
            disabled={selectedEmojis.length === 0 || isExporting}
            className="h-9 gap-2 rounded-r-none px-4 font-semibold"
          >
            {isExporting ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Copy className="h-4 w-4" />}
            {isExporting ? "Preparing…" : "Copy Slack script"}
          </Button>
          <Button
            aria-label="Other export options"
            aria-haspopup="menu"
            popoverTarget="export-menu"
            disabled={selectedEmojis.length === 0 || isExporting}
            className="h-9 w-8 rounded-l-none border-l border-primary-foreground/25 p-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <div ref={exportMenuRef} id="export-menu" popover="auto" role="menu" className="export-menu">
            <button type="button" role="menuitem" onClick={() => runExport(() => exportFiles('slack', true))}>Slack script: replace smaller…</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsPlainText)}>Plain Text</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsHtml)}>HTML</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsCss)}>CSS</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsMarkdownTable)}>Markdown Table</button>
            <button type="button" role="menuitem" onClick={() => runExport(() => exportFiles('zip'))}>ZIP File</button>
          </div>
        </div>
      </div>

      {isExporting && <button type="button" onClick={cancelExport}>Cancel export</button>}
      {exportStatus && (
        <div role="status" className="sheet-status animate-in fade-in">
          {exportStatus}
        </div>
      )}
    </div>
    </>
  );
}
