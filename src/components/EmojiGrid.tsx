import { useState, useEffect, useRef, useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import type { EmojiMetadata } from '../types/emoji'
import { cn } from '../lib/utils'

interface EmojiGridProps {
  emojis: EmojiMetadata[]
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void
}

const STORAGE_KEY = 'selectedEmojis'
const ITEMS_PER_PAGE = 36 // 4 rows of 9 items in desktop view

const EmojiGrid = ({ emojis: initialEmojis, onSelectionChange }: EmojiGridProps) => {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [emojis, setEmojis] = useState(initialEmojis)
  const [selectedEmojis, setSelectedEmojis] = useState<EmojiMetadata[]>(() => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  })
  const gridRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  
  const toggleSelection = (emoji: EmojiMetadata) => {
    const newSelection = selectedEmojis.some(e => e.id === emoji.id)
      ? selectedEmojis.filter(e => e.id !== emoji.id)
      : [...selectedEmojis, emoji]
    
    setSelectedEmojis(newSelection)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection))
    announceSelection(emoji, newSelection.some(e => e.id === emoji.id))
    onSelectionChange?.(newSelection)
  }
  
  const announceSelection = (emoji: EmojiMetadata, isSelected: boolean) => {
    const message = `${emoji.filename} ${isSelected ? 'selected' : 'unselected'}`
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', 'polite')
    announcement.className = 'sr-only'
    announcement.textContent = message
    document.body.appendChild(announcement)
    setTimeout(() => document.body.removeChild(announcement), 1000)
  }

  // Calculate grid dimensions
  const cols = useMemo(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024
    return width >= 1024 ? 9 : width >= 768 ? 6 : 3
  }, [])

  const totalPages = Math.ceil(emojis.length / ITEMS_PER_PAGE)
  const paginatedEmojis = emojis.slice(0, currentPage * ITEMS_PER_PAGE)
  
  useEffect(() => {
    const handleUpdateEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setEmojis(e.detail)
      setFocusedIndex(-1) // Reset focus when emojis update
    }

    document.addEventListener('updateEmojis', handleUpdateEmojis as EventListener)
    return () => {
      document.removeEventListener('updateEmojis', handleUpdateEmojis as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedEmojis([])
      localStorage.setItem(STORAGE_KEY, '[]')
      onSelectionChange?.([])
    }

    document.addEventListener('clearEmojiSelection', handleClearSelection)
    return () => document.removeEventListener('clearEmojiSelection', handleClearSelection)
  }, [])

  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.dispatchEvent(new Event('clearEmojiSelection'))
      }
    }
    document.addEventListener('keydown', handleKeyboardShortcut as any)
    return () => document.removeEventListener('keydown', handleKeyboardShortcut as any)
  }, [])

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    e.preventDefault()
    
    switch (e.key) {
      case 'ArrowRight':
        setFocusedIndex(Math.min(emojis.length - 1, index + 1))
        break
      case 'ArrowLeft':
        setFocusedIndex(Math.max(0, index - 1))
        break
      case 'ArrowUp':
        setFocusedIndex(Math.max(0, index - cols))
        break
      case 'ArrowDown':
        setFocusedIndex(Math.min(emojis.length - 1, index + cols))
        break
      case 'Enter':
      case ' ':
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

  useEffect(() => {
    // Simulate loading state
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [emojis])

  const handleScroll = () => {
    if (!gridRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = gridRef.current
    // Load more when user scrolls to bottom
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
    }
  }

  useEffect(() => {
    const grid = gridRef.current
    if (grid) {
      grid.addEventListener('scroll', handleScroll)
      return () => grid.removeEventListener('scroll', handleScroll)
    }
  }, [currentPage, totalPages])

  return (
    <>
      <div
        ref={gridRef}
        className="h-[80vh] overflow-auto relative"
        role="grid"
        aria-label="Emoji grid"
        aria-busy={isLoading}
        aria-describedby="grid-instructions"
      >
        <div 
          className="sr-only" 
          id="grid-instructions"
        >
          Use arrow keys to navigate, space or enter to select, and Control+K to clear selection
        </div>
        
        <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4 p-4">
          {paginatedEmojis.map((emoji, index) => (
            <button
              key={emoji.id}
              className={cn(
                "aspect-square rounded-lg border bg-card text-card-foreground relative group",
                "shadow-sm flex items-center justify-center",
                "transition-all duration-200 ease-in-out",
                "hover:scale-105 hover:shadow-md focus:scale-105 focus:shadow-md",
                "focus:outline-none focus:ring-2 focus:ring-primary",
                "active:scale-95",
                selectedEmojis.some(e => e.id === emoji.id) && 
                  "ring-2 ring-primary ring-offset-2 bg-primary/10"
              )}
              onClick={() => toggleSelection(emoji)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              tabIndex={focusedIndex === index ? 0 : -1}
              role="gridcell"
              aria-label={emoji.filename}
              aria-selected={selectedEmojis.some(e => e.id === emoji.id)}
            >
              {isLoading ? (
                <div className="w-12 h-12 animate-pulse bg-muted rounded" />
              ) : (
                <>
                  <img 
                    src={emoji.path}
                    alt={emoji.filename}
                    className="w-12 h-12 object-contain"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-sm p-2 text-center">
                    {emoji.filename}
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
      {currentPage < totalPages && (
        <div className="flex justify-center p-4">
          <div className="w-8 h-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
    </>
  )
}

export default EmojiGrid