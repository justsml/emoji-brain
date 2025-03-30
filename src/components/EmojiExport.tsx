import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Download, Loader2, Copy, FileText, Code, X } from 'lucide-react'
import type { EmojiMetadata } from '../types/emoji'

interface EmojiExportProps {
  selectedEmojis: EmojiMetadata[]
  onClearSelection: () => void
}

export function EmojiExport({ selectedEmojis, onClearSelection }: EmojiExportProps) {
  const [exportStatus, setExportStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' }>({ message: '', type: 'success' })
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const [currentEmojis, setCurrentEmojis] = useState<EmojiMetadata[]>(selectedEmojis)

  useEffect(() => {
    const handleUpdateExportEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setCurrentEmojis(e.detail)
    }
    document.addEventListener('updateExportEmojis', handleUpdateExportEmojis as EventListener)
    return () => {
      document.removeEventListener('updateExportEmojis', handleUpdateExportEmojis as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      // Ctrl/Cmd + E to focus export button
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        exportButtonRef.current?.focus()
      }
      // Ctrl/Cmd + Shift + C to clear selection
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        onClearSelection()
      }
    }
    
    document.addEventListener('keydown', handleKeyboardShortcut)
    return () => document.removeEventListener('keydown', handleKeyboardShortcut)
  }, [onClearSelection])

  const announceStatus = (message: string) => {
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', 'polite')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => document.body.removeChild(announcement), 1000)
  }

  const exportAsPlainText = () => {
    const text = currentEmojis.map(emoji => emoji.filename).join('\n')
    navigator.clipboard.writeText(text)
    setExportStatus({ message: 'Copied filenames to clipboard!', type: 'success' })
    setTimeout(() => setExportStatus({ message: '', type: 'success' }), 2000)
  }

  const exportAsHtml = () => {
    const html = currentEmojis
      .map(emoji => `<img src="${emoji.path}" alt="${emoji.filename}" />`)
      .join('\n')
    navigator.clipboard.writeText(html)
    setExportStatus({ message: 'Copied HTML to clipboard!', type: 'success' })
    setTimeout(() => setExportStatus({ message: '', type: 'success' }), 2000)
  }

  const exportAsCss = () => {
    const css = currentEmojis
      .map(emoji => `.emoji-${emoji.id} {
  background-image: url('${emoji.path}');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}`)
      .join('\n\n')
    navigator.clipboard.writeText(css)
    setExportStatus({ message: 'Copied CSS to clipboard!', type: 'success' })
    setTimeout(() => setExportStatus({ message: '', type: 'success' }), 2000)
  }

  const downloadZip = async () => {
    try {
      setExportStatus({ message: 'Preparing ZIP...', type: 'loading' })
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // Add each emoji to the zip
      for (const emoji of currentEmojis) {
        const response = await fetch(emoji.path)
        const blob = await response.blob()
        zip.file(emoji.filename, blob)
      }
      
      // Generate and download the zip
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = 'selected-emojis.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setExportStatus({ message: 'ZIP downloaded!', type: 'success' })
      setTimeout(() => setExportStatus({ message: '', type: 'success' }), 2000)
    } catch (error) {
      console.error('Error creating ZIP:', error)
      setExportStatus({ message: 'Error creating ZIP', type: 'error' })
      setTimeout(() => setExportStatus({ message: '', type: 'success' }), 2000)
    }
  }

  return (
    currentEmojis.length > 0 ? (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-lg shadow-lg border flex items-center gap-4 z-50 animate-in slide-in-from-bottom-4"
      role="region"
      aria-label="Export selected emojis"
    >
      <div className="text-sm font-medium" aria-live="polite">
        {currentEmojis.length} emoji{currentEmojis.length !== 1 ? 's' : ''} selected
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            ref={exportButtonRef}
            variant="outline"
            className="gap-2 transition-all duration-200 hover:shadow-md"
            aria-label="Export options"
          >
            {exportStatus.type === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export As...
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            onClick={exportAsPlainText}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Plain Text
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={exportAsHtml}
            className="gap-2"
          >
            <Code className="h-4 w-4" />
            HTML
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={exportAsCss}
            className="gap-2"
          >
            <Code className="h-4 w-4" />
            CSS
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={downloadZip}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            ZIP File
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button 
        variant="ghost"
        onClick={onClearSelection}
        className="text-muted-foreground hover:text-foreground gap-2 transition-all duration-200"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
        Clear Selection
      </Button>

      {exportStatus.message && (
        <div className={`text-sm animate-in fade-in slide-in-from-top-1 ${exportStatus.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {exportStatus.message}
        </div>
      )}
    </div>) : null
  )
}