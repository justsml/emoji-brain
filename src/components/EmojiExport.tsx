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

interface EmojiExportProps {
  selectedEmojis: EmojiMetadata[];
  onClearSelection: () => void;
}

export function EmojiExport({ selectedEmojis, onClearSelection }: EmojiExportProps) {
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
    <div className="fixed bottom-4 left-0 right-0 mx-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-lg shadow-lg border flex w-full justify-between items-center gap-x-4 z-50">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-sm font-medium shrink-0">
          {selectedEmojis.length} selected
          {selectedEmojis.length > 0 && (
            <span className="ml-2 text-muted-foreground">
              (
              {parseFloat(
                (
                  selectedEmojis.reduce((total, emoji) => total + emoji.size, 0) /
                  1024
                ).toFixed(1)
              ).toLocaleString()}{" "}
              KB)
            </span>
          )}
        </div>
        {selectedEmojis.length > 0 && (
          <div className="flex gap-1 overflow-x-auto max-w-md scrollbar-hide" style={{ scrollSnapType: 'x mandatory' }}>
            {selectedEmojis.map((emoji) => (
              <div
                key={emoji.id}
                className="shrink-0 w-8 h-8 flex items-center justify-center"
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
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Export...</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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

      {exportStatus && (
        <div className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1">
          {exportStatus}
        </div>
      )}
    </div>
  );
}
