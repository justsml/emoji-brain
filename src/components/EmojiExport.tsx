import { useState } from "react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAppDispatch, type RootState } from "../store/store";
import { useSelector } from "react-redux";
import { resetSelection } from "../store/selectionSlice";
import { getAbsoluteUrl } from "../lib/utils";

export function EmojiExport() {
  const { selectedEmojis } = useSelector((state: RootState) => state.selection);
  const dispatch = useAppDispatch();
  const onClearSelection = () => {
    dispatch(resetSelection());
  };

  const [exportStatus, setExportStatus] = useState<string>("");

  const exportAsPlainText = () => {
    const text = selectedEmojis.map((emoji) => emoji.filename).join("\n");
    navigator.clipboard.writeText(text);
    setExportStatus("Copied filenames to clipboard!");
    setTimeout(() => setExportStatus(""), 2000);
  };

  const exportAsHtml = () => {
    const html = selectedEmojis
      .map((emoji) => `<img src="${getAbsoluteUrl(emoji.path)}" alt="${emoji.filename}" />`)
      .join("\n");
    navigator.clipboard.writeText(html);
    setExportStatus("Copied HTML to clipboard!");
    setTimeout(() => setExportStatus(""), 2000);
  };

  const exportAsCss = () => {
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
    setExportStatus("Copied CSS to clipboard!");
    setTimeout(() => setExportStatus(""), 2000);
  };

  const exportAsMarkdownTable = () => {
    const header = "| Emoji | Filename |\n|---|---|";
    const rows = selectedEmojis
      .map(
        (emoji) => `| ![${emoji.filename}](${getAbsoluteUrl(emoji.path)}) | ${emoji.filename} |`
      )
      .join("\n");
    const markdown = `${header}\n${rows}`;
    navigator.clipboard.writeText(markdown);
    setExportStatus("Copied Markdown Table to clipboard!");
    setTimeout(() => setExportStatus(""), 2000);
  };

  const downloadZip = async () => {
    try {
      setExportStatus("Preparing ZIP...");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Add each emoji to the zip
      for (const emoji of selectedEmojis) {
        const response = await fetch(getAbsoluteUrl(emoji.path));
        const blob = await response.blob();
        zip.file(emoji.filename, blob);
      }

      // Generate and download the zip
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selected-emojis.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus("ZIP downloaded!");
      setTimeout(() => setExportStatus(""), 2000);
    } catch (error) {
      console.error("Error creating ZIP:", error);
      setExportStatus("Error creating ZIP");
      setTimeout(() => setExportStatus(""), 2000);
    }
  };

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-lg shadow-lg border flex w-full justify-between items-center gap-x-4 z-50">
      <div className="text-sm font-medium">
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
