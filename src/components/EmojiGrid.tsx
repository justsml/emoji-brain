import { useState, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { EmojiMetadata } from '../types/emoji'
import { cn } from '../lib/utils'

interface EmojiGridProps {
  emojis: EmojiMetadata[]
  onEmojiSelect?: (emoji: EmojiMetadata) => void
}

export function EmojiGrid({ emojis: initialEmojis, onEmojiSelect }: EmojiGridProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [emojis, setEmojis] = useState(initialEmojis)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleUpdateEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setEmojis(e.detail);
      setFocusedIndex(-1); // Reset focus when emojis update
    };

    document.addEventListener('updateEmojis', handleUpdateEmojis as EventListener);
    return () => {
      document.removeEventListener('updateEmojis', handleUpdateEmojis as EventListener);
    };
  }, []);

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
        onEmojiSelect?.(emojis[index])
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
      className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4"
      role="grid"
      aria-label="Emoji grid"
    >
      {emojis.map((emoji, index) => (
        <button
          key={emoji.id}
          className={cn(
            "aspect-square rounded-lg border bg-card text-card-foreground",
            "shadow-sm flex items-center justify-center",
            "transition-all duration-200 ease-in-out",
            "hover:scale-105 hover:shadow-md focus:scale-105 focus:shadow-md",
            "focus:outline-none focus:ring-2 focus:ring-primary",
            "relative group"
          )}
          onClick={() => onEmojiSelect?.(emoji)}
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