import { useState, useEffect, useCallback } from 'react'
import type { EmojiMetadata } from '../types/emoji'
import { Button } from './ui/button'
import { debounce } from '../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ChevronDown, Search } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  onCategorySelect: (category: string) => void
  categories: string[]
  recentEmojis?: EmojiMetadata[]
}

const SearchBar = (props: SearchBarProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [recentEmojis, setRecentEmojis] = useState<EmojiMetadata[]>(props.recentEmojis || [])

  useEffect(() => {
    const handleUpdateRecentEmojis = (e: CustomEvent<EmojiMetadata[]>) => {
      setRecentEmojis(e.detail)
    }

    document.addEventListener('updateRecentEmojis', handleUpdateRecentEmojis as EventListener)
    return () => {
      document.removeEventListener('updateRecentEmojis', handleUpdateRecentEmojis as EventListener)
    }
  }, [])

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      props.onSearch(value)
    }, 150),
    [props]
  )

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    debouncedSearch(value)
  }

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category)
    props.onCategorySelect(category)
  }

  const handleEmojiSelect = (emoji: EmojiMetadata) => {
    document.dispatchEvent(new CustomEvent('emojiSelect', { detail: emoji }))
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search emojis..."
            className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow duration-200 ease-in-out focus-within:shadow-lg"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[130px] justify-between">
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

      {recentEmojis.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Recently Used</h3>
          <div className="flex gap-2">
            {recentEmojis.map((emoji) => (
              <button
                key={emoji.id}
                className="rounded-lg border bg-card p-2 hover:bg-accent transition-colors"
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