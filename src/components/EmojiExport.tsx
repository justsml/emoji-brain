import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { EmojiMetadata } from "../types/emoji";
import { getAbsoluteUrl } from "../lib/utils";
import { generateSlackBrowserScript } from "../lib/slackBrowserScript";
import { CheckSquare, XSquare, ChevronDown, Copy, LoaderCircle, X, Check } from "lucide-react";

interface EmojiExportProps {
  selectedEmojis: EmojiMetadata[];
  onClearSelection: () => void;
  onSelectAll: () => void;
  filteredEmojis: EmojiMetadata[];
  gridScale: number;
  onRemoveEmoji: (emoji: EmojiMetadata) => void;
}

export function EmojiExport({ selectedEmojis, onClearSelection, onSelectAll, filteredEmojis, gridScale, onRemoveEmoji }: EmojiExportProps) {
  const [exportStatus, setExportStatus] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [copiedScript, setCopiedScript] = useState<{ megabytes: string; count: number } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scriptButtonRef = useRef<HTMLButtonElement>(null);
  const closeInstructionsRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  return (
    <>
    {copiedScript && (
      <section
        aria-labelledby="slack-instructions-title"
        onKeyDown={(event) => { if (event.key === "Escape") closeInstructions(); }}
        className="fixed bottom-36 sm:bottom-28 left-3 right-3 mx-auto z-50 max-w-lg max-h-[calc(100dvh-11rem)] overflow-y-auto rounded-3xl border border-primary/20 bg-background/95 p-6 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-8 fade-in duration-300 motion-reduce:animate-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Check className="h-4 w-4" /> {copiedScript.megabytes} MB copied · {copiedScript.count} emojis</div>
            <h2 id="slack-instructions-title" className="text-xl font-semibold">Your emojis are ready for Slack</h2>
          </div>
          <Button ref={closeInstructionsRef} variant="ghost" size="icon" aria-label="Close Slack instructions" onClick={closeInstructions}><X className="h-4 w-4" /></Button>
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Sign in to your workspace and open <code className="break-all text-foreground">https://YOUR-WORKSPACE.slack.com/customize/emoji</code>.</li>
          <li>Open your browser’s Developer Tools, then select the <strong className="text-foreground">Console</strong> tab.</li>
          <li>Paste the copied script and press <strong className="text-foreground">Enter</strong>. Keep the page open while it uploads. The console shows each result and a final summary.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">Your workspace must allow you to add custom emoji. Existing names or unsupported images may be rejected; check the console results.</p>
      </section>
    )}
    <div className="fixed bottom-3 left-0 right-0 mx-auto bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 p-3 rounded-2xl shadow-2xl border border-border/50 flex flex-wrap w-[calc(100%-1.5rem)] max-w-3xl justify-between items-center gap-2 z-50">
      <div className="flex items-center gap-3 min-w-0 px-2 py-1">
        <div
          className="text-lg font-medium shrink-0 text-foreground/90"
          aria-label={`${selectedEmojis.length} selected`}
        >
          {selectedEmojis.length === 0 ? (
            <span className="text-muted-foreground">No emojis selected</span>
          ) : (
            <>
              <span className="font-semibold">{selectedEmojis.length}</span> selected
              {selectedEmojis.length > 0 && (
                <span className="ml-2 text-muted-foreground/70 text-xs">
                  ({parseFloat(
                    (
                      selectedEmojis.reduce((total, emoji) => total + emoji.size, 0) /
                      1024
                    ).toFixed(1)
                  ).toLocaleString()} KB)
                </span>
              )}
            </>
          )}
        </div>
        {selectedEmojis.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto max-w-28 sm:max-w-52 scrollbar-hide mask-fade-right" style={{ scrollSnapType: 'x mandatory' }}>
            {selectedEmojis.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                className="shrink-0 w-7 h-7 flex items-center justify-center bg-secondary/50 rounded-md overflow-hidden ring-1 ring-border/50 hover:ring-destructive/50 hover:bg-destructive/10 transition-colors cursor-pointer"
                style={{ scrollSnapAlign: 'start' }}
                onClick={() => onRemoveEmoji(emoji)}
                title={`Remove ${emoji.filename}`}
              >
                <img
                  src={emoji.path}
                  alt={emoji.filename}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center shrink-0 gap-1 sm:gap-3">
        <Button
          variant="ghost"
          onClick={onSelectAll}
          className="h-9 w-9 p-0 rounded-xl transition-all duration-200 hover:bg-primary/10 hover:text-primary hover:scale-105 active:scale-95"
          size="sm"
          title="Select All Visible"
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={onClearSelection}
          className="h-9 w-9 p-0 rounded-xl transition-all duration-200 hover:bg-destructive/10 hover:text-destructive hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          size="sm"
          title="Deselect All"
          disabled={selectedEmojis.length === 0}
        >
          <XSquare className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center">
          <Button
            ref={scriptButtonRef}
            onClick={exportSlackUploadScript}
            disabled={selectedEmojis.length === 0 || isExporting}
            className="h-10 gap-2 rounded-l-xl rounded-r-none bg-primary px-4 font-semibold shadow-sm"
          >
            {isExporting ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Copy className="h-4 w-4" />}
            {isExporting ? "Preparing…" : "Copy Slack Script"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Other export options" disabled={selectedEmojis.length === 0 || isExporting} className="h-10 w-9 rounded-l-none rounded-r-xl border-l border-primary-foreground/20 p-0"><ChevronDown className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="rounded-xl shadow-xl border-border/50">
              <DropdownMenuItem onClick={exportAsPlainText}>Plain Text</DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsHtml}>HTML</DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsCss}>CSS</DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsMarkdownTable}>Markdown Table</DropdownMenuItem>
              <DropdownMenuItem onClick={downloadZip}>ZIP File</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {exportStatus && (
        <div role="status" className="w-full px-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1">
          {exportStatus}
        </div>
      )}
    </div>
    </>
  );
}
