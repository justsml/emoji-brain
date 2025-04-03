import { useState, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { EmojiMetadata } from '../types/emoji'
import { cn } from '../lib/utils'

interface EmojiGridProps {
  emojis: EmojiMetadata[]
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void
}

const STORAGE_KEY = 'selectedEmojis'

const EmojiGrid = ({ emojis: initialEmojis, onSelectionChange }: EmojiGridProps) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [emojis, setEmojis] = useState(initialEmojis)
  const [selectedEmojis, setSelectedEmojis] = useState<EmojiMetadata[]>(() => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  })
  const gridRef = useRef<HTMLDivElement>(null)
  
  const toggleSelection = (emoji: EmojiMetadata) => {
    const newSelection = selectedEmojis.some(e => e.id === emoji.id)
      ? selectedEmojis.filter(e => e.id !== emoji.id)
      : [...selectedEmojis, emoji]
    
    setSelectedEmojis(newSelection)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection))
    onSelectionChange?.(newSelection)
  }
  

  useEffect(() => {
    const handleUpdateEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setEmojis(e.detail);
      setFocusedIndex(-1); // Reset focus when emojis update
    };

    const handleClearSelection = () => {
      setSelectedEmojis([]);
      localStorage.removeItem(STORAGE_KEY);
      onSelectionChange?.([]);
    };

    document.addEventListener('updateEmojis', handleUpdateEmojis as EventListener);
    document.addEventListener('clearEmojiSelection', handleClearSelection);

    return () => {
      document.removeEventListener('updateEmojis', handleUpdateEmojis as EventListener);
      document.removeEventListener('clearEmojiSelection', handleClearSelection);
    };
  }, [onSelectionChange]);

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const cols = window.innerWidth >= 1024 ? 9 : window.innerWidth >= 768 ? 6 : 3
    
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        setFocusedIndex(Math.min(emojis.length - 1, index + 1))
        break
      case 'ArrowLeft':
        e.preventDefault()
        setFocusedIndex(Math.max(0, index - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(Math.max(0, index - cols))
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(Math.min(emojis.length - 1, index + cols))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        toggleSelection(emojis[index])
        break
    }
  }

  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      const buttons = gridRef.current.getElementsByTagName('button')
      buttons[focusedIndex]?.focus()
    }
  }, [focusedIndex])

  return (
    <div 
      ref={gridRef}
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4 [perspective:1000px]"
      role="grid"
      aria-label="Emoji grid"
    >
      {emojis.map((emoji, index) => (
        <button
          key={emoji.id}
          className={cn(
            "aspect-square rounded-lg border bg-card text-card-foreground relative group",
            "shadow-sm flex items-center justify-center",
            "transition-all duration-300 ease-out",
            "hover:scale-105 hover:shadow-md focus:scale-105 focus:shadow-md",
            "focus:outline-none focus:ring-2 focus:ring-primary",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "motion-safe:hover:rotate-1",
            selectedEmojis.some(e => e.id === emoji.id) &&
              "ring-2 ring-primary ring-offset-2 bg-primary/10"
          )}
          onClick={() => toggleSelection(emoji)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          tabIndex={focusedIndex === index ? 0 : -1}
          role="gridcell"
          aria-label={emoji.filename}
        >
          <img 
            src={emoji.path}
            alt={emoji.filename}
            className="w-12 h-12 object-contain"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-sm p-2 text-center">
            {emoji.filename}
          </div>
        </button>
      ))}
    </div>
  )
}

export default EmojiGrid;