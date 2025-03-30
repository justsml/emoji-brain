import { useState, useEffect, useRef } from 'react'
import type { EmojiMetadata } from '../types/emoji'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ChevronDown, Search, Loader2 } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  onCategorySelect: (category: string) => void
  categories: string[]
  recentEmojis?: EmojiMetadata[]
}

const SearchBar = (props: SearchBarProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isSearching, setIsSearching] = useState(false)
  const [recentEmojis, setRecentEmojis] = useState<EmojiMetadata[]>(props.recentEmojis || [])
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleUpdateRecentEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setRecentEmojis(e.detail)
    }

    document.addEventListener('updateRecentEmojis', handleUpdateRecentEmojis as EventListener)
    return () => {
      document.removeEventListener('updateRecentEmojis', handleUpdateRecentEmojis as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleKeyboardShortcut = (e: KeyboardEvent) => {
      // Ctrl/Cmd + / to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    
    document.addEventListener('keydown', handleKeyboardShortcut)
    return () => document.removeEventListener('keydown', handleKeyboardShortcut)
  }, [])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setIsSearching(true)
    props.onSearch(value)
    
    // Announce search results to screen readers
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', 'polite')
    announcement.className = 'sr-only'
    announcement.textContent = value 
      ? `Searching for ${value}`
      : 'Search cleared'
    document.body.appendChild(announcement)
    
    // Clear loading state after a short delay
    setTimeout(() => setIsSearching(false), 300)
  }

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category)
    props.onCategorySelect(category)
  }

  const handleEmojiSelect = (emoji: EmojiMetadata) => {
    document.dispatchEvent(new CustomEvent('emojiSelect', { detail: emoji }))
  }

  return (
    <div 
      className="space-y-4"
      role="search"
      aria-label="Emoji search"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search emojis..."
            className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background transition-shadow duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search emojis"
            aria-describedby="search-hint"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[130px] justify-between transition-all duration-200 hover:shadow-md">
              {selectedCategory === 'all' ? 'All Categories' : selectedCategory}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[130px]">
            <DropdownMenuItem onClick={() => handleCategorySelect('all')}>
              All Categories
            </DropdownMenuItem>
            {props.categories.map((category) => (
              <DropdownMenuItem
                key={category}
                onClick={() => handleCategorySelect(category)}
              >
                {category}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="sr-only" id="search-hint">
        Press Control + Forward Slash to focus search. Use arrow keys to navigate categories.
      </div>

      {recentEmojis.length > 0 && (
        <div 
          className="space-y-2"
          role="region"
          aria-label="Recently used emojis"
        >
          <h3 className="text-sm font-medium text-muted-foreground">Recently Used</h3>
          <div className="flex gap-2">
            {recentEmojis.map((emoji) => (
              <button
                key={emoji.id}
                className="rounded-lg border bg-card p-2 hover:bg-accent transition-all duration-200 hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                title={emoji.filename}
                onClick={() => handleEmojiSelect(emoji)}
              >
                <img
                  src={emoji.path}
                  alt={emoji.filename}
                  className="h-6 w-6 object-contain"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchBar;