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
import { CheckSquare, XSquare } from "lucide-react";

interface EmojiExportProps {
  selectedEmojis: EmojiMetadata[];
  onClearSelection: () => void;
  onSelectAll: () => void;
  filteredEmojis: EmojiMetadata[];
  gridScale: number;
}

export function EmojiExport({ selectedEmojis, onClearSelection, onSelectAll, filteredEmojis, gridScale }: EmojiExportProps) {
  const iconGap = 0.75 + (gridScale * 0.25);
  const [exportStatus, setExportStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const setStatusWithTimeout = useCallback((status: string) => {
    setExportStatus(status);
    const timer = setTimeout(() => setExportStatus(""), 2000);
    return () => clearTimeout(timer);
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
    };
  }, []);

  return (
    <div className="fixed bottom-6 left-0 right-0 mx-auto bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 p-3 pr-5 rounded-2xl shadow-2xl border border-border/50 flex w-full max-w-[50vw] min-w-96 justify-between items-center gap-x-4 z-50">
      <div className="flex items-center gap-4 min-w-0 p-5">
        <div className="text-lg font-medium shrink-0 text-foreground/90">
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
          <div className="flex gap-1.5 overflow-x-auto max-w-md scrollbar-hide mask-fade-right" style={{ scrollSnapType: 'x mandatory' }}>
            {selectedEmojis.slice(0, 8).map((emoji, index) => (
              <div
                key={emoji.id}
                className="shrink-0 w-7 h-7 flex items-center justify-center bg-secondary/50 rounded-md overflow-hidden ring-1 ring-border/50"
                style={{ scrollSnapAlign: 'start' }}
              >
                <img
                  src={emoji.path}
                  alt={emoji.filename}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
            {selectedEmojis.length > 8 && (
              <div className="shrink-0 w-7 h-7 flex items-center justify-center bg-secondary/30 rounded-md text-xs text-muted-foreground font-medium">
                +{selectedEmojis.length - 8}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: `${iconGap}rem` }}>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 px-4 rounded-xl font-medium transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]">
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-border/50">
            <DropdownMenuItem onClick={exportAsPlainText}>
              Plain Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsHtml}>HTML</DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsCss}>CSS</DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsMarkdownTable}>
              Markdown Table
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadZip}>ZIP File</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {exportStatus && (
        <div className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1">
          {exportStatus}
        </div>
      )}
    </div>
  );
}
