import React, { useState } from 'react'; // Added React import
import { useSelector, useDispatch } from 'react-redux';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { EmojiMetadata } from '../types/emoji';
import { selectSelectedEmojis, setSelection } from '../store/selectionSlice'; // Import Redux state and actions
import type { AppDispatch } from '../store/store'; // Import AppDispatch type

// Removed props interface

export function EmojiExport() { // Removed props
  const dispatch = useDispatch<AppDispatch>(); // Use typed dispatch
  const selectedEmojis = useSelector(selectSelectedEmojis); // Get selected emojis from Redux
  const [exportStatus, setExportStatus] = useState<string>('');

  const handleClearSelection = () => {
    dispatch(setSelection([])); // Dispatch action to clear selection
  };

  // --- Export functions remain the same, using selectedEmojis from Redux ---

  const exportAsPlainText = () => {
    if (selectedEmojis.length === 0) return;
    const text = selectedEmojis.map(emoji => emoji.filename).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => setExportStatus('Copied filenames to clipboard!'))
      .catch(err => setExportStatus('Failed to copy filenames!'));
    setTimeout(() => setExportStatus(''), 2000);
  };

  const exportAsHtml = () => {
    if (selectedEmojis.length === 0) return;
    const html = selectedEmojis
      .map(emoji => `<img src="${emoji.path}" alt="${emoji.filename}" style="width: 24px; height: 24px; vertical-align: middle; margin: 0 2px;" />`) // Added basic styling
      .join(''); // Join without newline for inline display
    navigator.clipboard.writeText(html)
      .then(() => setExportStatus('Copied HTML to clipboard!'))
      .catch(err => setExportStatus('Failed to copy HTML!'));
    setTimeout(() => setExportStatus(''), 2000);
  };

  const exportAsCss = () => {
    if (selectedEmojis.length === 0) return;
    const css = selectedEmojis
      .map(emoji => `.emoji-${emoji.id} {
  display: inline-block; /* Better default */
  width: 24px; /* Example size */
  height: 24px; /* Example size */
  background-image: url('${emoji.path}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  vertical-align: middle; /* Align with text */
}`)
      .join('\n\n');
    navigator.clipboard.writeText(css)
      .then(() => setExportStatus('Copied CSS to clipboard!'))
      .catch(err => setExportStatus('Failed to copy CSS!'));
    setTimeout(() => setExportStatus(''), 2000);
  };

  const downloadZip = async () => {
    if (selectedEmojis.length === 0) return;
    try {
      setExportStatus('Preparing ZIP...');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Add each emoji to the zip
      for (const emoji of selectedEmojis) {
        try {
          const response = await fetch(emoji.path);
          if (!response.ok) throw new Error(`Failed to fetch ${emoji.filename}`);
          const blob = await response.blob();
          // Sanitize filename for ZIP (basic example)
          const safeFilename = emoji.filename.replace(/[^a-zA-Z0-9.]/g, '_');
          zip.file(safeFilename, blob);
        } catch (fetchError) {
          console.error(`Skipping ${emoji.filename} due to fetch error:`, fetchError);
          // Optionally notify user about skipped files
        }
      }

      if (Object.keys(zip.files).length === 0) {
         setExportStatus('No files could be added to ZIP.');
         setTimeout(() => setExportStatus(''), 3000);
         return;
      }

      // Generate and download the zip
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'selected-emojis.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus('ZIP downloaded!');
      setTimeout(() => setExportStatus(''), 2000);
    } catch (error) {
      console.error('Error creating ZIP:', error);
      setExportStatus('Error creating ZIP');
      setTimeout(() => setExportStatus(''), 3000); // Longer timeout for errors
    }
  };

  // Only render the component if there are selected emojis
  if (selectedEmojis.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-lg shadow-lg border flex items-center gap-4 z-50 max-w-md w-full justify-between">
      <div className="text-sm font-medium flex-shrink-0">
        {selectedEmojis.length} emoji{selectedEmojis.length !== 1 ? 's' : ''} selected
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end"> {/* Wrap buttons */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">Export As...</Button> {/* Smaller button */}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportAsPlainText} disabled={selectedEmojis.length === 0}>
              Plain Text (Filenames)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsHtml} disabled={selectedEmojis.length === 0}>
              HTML (Inline Images)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsCss} disabled={selectedEmojis.length === 0}>
              CSS (Background Images)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadZip} disabled={selectedEmojis.length === 0}>
              ZIP File (Images)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm" // Smaller button
          onClick={handleClearSelection} // Use Redux action
          className="text-muted-foreground hover:text-foreground"
          disabled={selectedEmojis.length === 0}
        >
          Clear Selection
        </Button>
      </div>

      {exportStatus && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded shadow-md animate-in fade-in slide-in-from-bottom-1">
          {exportStatus}
        </div>
      )}
    </div>
  );
}