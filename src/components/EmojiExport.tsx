import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import type { EmojiMetadata } from "../types/emoji";
import { getAbsoluteUrl, stillSrc } from "../lib/utils";
import { generateSlackBrowserScript } from "../lib/slackBrowserScript";
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
  const [copiedScript, setCopiedScript] = useState<{ megabytes: string; count: number } | null>(null);
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

  const exportAsPlainText = useCallback(() => {
    const text = selectedEmojis.map((emoji) => emoji.filename).join("\n");
    navigator.clipboard.writeText(text);
    setStatusWithTimeout("Copied filenames to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsHtml = useCallback(() => {
    const html = selectedEmojis
      .map((emoji) => `<img src="${getAbsoluteUrl(emoji.path)}" alt="${emoji.filename}" />`)
      .join("\n");
    navigator.clipboard.writeText(html);
    setStatusWithTimeout("Copied HTML to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsCss = useCallback(() => {
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
    navigator.clipboard.writeText(css);
    setStatusWithTimeout("Copied CSS to clipboard!");
  }, [selectedEmojis, setStatusWithTimeout]);

  const exportAsMarkdownTable = useCallback(() => {
    const header = "| Emoji | Filename |\n|---|---|";
    const rows = selectedEmojis
      .map(
        (emoji) => `| ![${emoji.filename}](${getAbsoluteUrl(emoji.path)}) | ${emoji.filename} |`
      )
      .join("\n");
    const markdown = `${header}\n${rows}`;
    navigator.clipboard.writeText(markdown);
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

  const exportSlackUploadScript = useCallback(async () => {
    if (isExporting || selectedEmojis.length === 0) return;
    setIsExporting(true);
    setCopiedScript(null);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    let completed = 0;
    try {
      setExportStatus(`Preparing 0 of ${selectedEmojis.length} emojis…`);
      const images = await Promise.all(
        selectedEmojis.map(async (emoji) => {
          const response = await fetch(getAbsoluteUrl(emoji.path));
          if (!response.ok) throw new Error(`Could not load ${emoji.filename}`);
          const blob = await response.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          }
          completed += 1;
          setExportStatus(`Prepared ${completed} of ${selectedEmojis.length} emojis…`);
          return {
            filename: emoji.filename,
            mimeType: blob.type || `image/${emoji.filename.split(".").pop() || "png"}`,
            base64: btoa(binary),
          };
        })
      );
      const script = generateSlackBrowserScript(images);
      const megabytes = (new Blob([script]).size / 1_000_000).toFixed(3);
      setExportStatus("Copying script to clipboard…");
      await navigator.clipboard.writeText(script);
      setCopiedScript({ megabytes, count: images.length });
      setStatusWithTimeout(`Copied Slack script · ${megabytes} MB`);
    } catch (error) {
      console.error("Error creating Slack upload script:", error);
      setStatusWithTimeout("Could not copy the Slack script. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [selectedEmojis, setStatusWithTimeout, isExporting]);

  const downloadZip = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setExportStatus("Preparing ZIP...");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const emoji of selectedEmojis) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const response = await fetch(getAbsoluteUrl(emoji.path), {
          signal: abortControllerRef.current.signal
        });
        const blob = await response.blob();
        zip.file(emoji.filename, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selected-emojis.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusWithTimeout("ZIP downloaded!");
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error("Error creating ZIP:", error);
      setStatusWithTimeout("Error creating ZIP");
    }
  }, [selectedEmojis, setStatusWithTimeout]);

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
    void action();
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
        <ol>
          <li>Sign in to your workspace and open <code>https://YOUR-WORKSPACE.slack.com/customize/emoji</code>.</li>
          <li>Open your browser’s developer tools and select the <strong>Console</strong> tab.</li>
          <li>Paste the script and press <strong>Enter</strong>. Leave the page open while it uploads — the console reports each emoji and a final count.</li>
        </ol>
        <p className="slack-guide-note">Your workspace must allow you to add custom emoji. Slack rejects names it already has and images it cannot read; the console lists any it skipped.</p>
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
                  src={stillSrc(emoji)}
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
            onClick={exportSlackUploadScript}
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
            <button type="button" role="menuitem" onClick={() => runExport(exportAsPlainText)}>Plain Text</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsHtml)}>HTML</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsCss)}>CSS</button>
            <button type="button" role="menuitem" onClick={() => runExport(exportAsMarkdownTable)}>Markdown Table</button>
            <button type="button" role="menuitem" onClick={() => runExport(downloadZip)}>ZIP File</button>
          </div>
        </div>
      </div>

      {exportStatus && (
        <div role="status" className="sheet-status animate-in fade-in">
          {exportStatus}
        </div>
      )}
    </div>
    </>
  );
}
