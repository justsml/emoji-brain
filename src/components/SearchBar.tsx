import { track, trackError } from '../lib/analytics';
import React, { useEffect, useRef, useState } from 'react';
import '../styles/search.css';
import { Check, Link, Search, X } from 'lucide-react';
import {warmPagefind} from '../lib/pagefindClient';
import {emojiAsset} from '../lib/emojiAssets';
import type { EmojiMetadata } from '../types/emoji';

/** An active theme or color filter, shown as a pill inside the field. */
export interface SearchFilterPill {
  kind: 'theme' | 'color';
  /** What the pill says, e.g. "cat" or "Red first". */
  label: string;
  /** A CSS color for the color pill's swatch. */
  swatch?: string;
  onClear: () => void;
}

interface SearchBarProps {
  // Callback to notify parent of search term changes
  onSearchChange: (term: string) => void;
  // Callback to notify parent of emoji selection
  onEmojiSelect?: (emoji: EmojiMetadata) => void;
  // Theme and color filters currently narrowing or ordering the results
  filters?: SearchFilterPill[];
  // Number of search results
  count: number;
  isSearching?: boolean;
  status?: string;
  progress?: number;
  // Initial search term, e.g. from a shared link
  defaultValue?: string;
  // Returns the URL to copy for the current search; omit to hide the button
  shareUrl?: () => string;
  // Optional props
  categories?: string[];
  recentEmojis?: EmojiMetadata[];
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearchChange,
  onEmojiSelect,
  filters = [],
  count,
  isSearching = false,
  status = "",
  progress,
  defaultValue = '',
  shareUrl,
  recentEmojis = []
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); }, []);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl());
      track('share_link_copied', { kind: 'search' });
      setLinkCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      trackError(error, { source: 'share_search' });
      track('share_link_failed', { kind: 'search' });
      console.error('Could not copy search link:', error);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value;
    setInputValue(term);
    onSearchChange(term); // Notify parent component
  };

  // Like any token field: Backspace in an empty box takes back the last pill.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && inputValue === '' && filters.length > 0) {
      event.preventDefault();
      filters[filters.length - 1].onClear();
    }
  };

  const handleEmojiSelect = (emoji: EmojiMetadata) => {
    if (onEmojiSelect) {
      onEmojiSelect(emoji);
    }
  };

  return (
    <div className="emoji-search">
      <div className={`emoji-search-shell ${isSearching ? 'is-searching' : ''}`}>
        <Search className="emoji-search-icon" aria-hidden="true" />
        {filters.length > 0 && (
          <div className="emoji-search-pills" role="group" aria-label="Active filters">
            {filters.map(filter => (
              <button
                key={filter.kind}
                type="button"
                className="emoji-search-pill"
                data-kind={filter.kind}
                onClick={filter.onClear}
                aria-label={`Clear ${filter.kind} filter: ${filter.label}`}
                title={`Clear ${filter.kind} filter`}
              >
                {filter.swatch && <i className="emoji-search-pill-swatch" style={{ background: filter.swatch }} aria-hidden="true" />}
                <span className="emoji-search-pill-label">{filter.label}</span>
                <X className="emoji-search-pill-x" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          aria-label="Search emojis"
          aria-describedby="emoji-search-status"
          placeholder="Search emojis..."
          className="emoji-search-input"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={warmPagefind}
        />
        <span className="emoji-search-count">
          {count.toLocaleString()}<span className="sr-only"> results</span>
        </span>
        {shareUrl && inputValue.trim() !== '' && (
          <button
            type="button"
            className={`emoji-search-share ${linkCopied ? 'is-copied' : ''}`}
            onClick={handleCopyLink}
            title="Copy link to this search"
            aria-label={linkCopied ? 'Search link copied' : 'Copy link to this search'}
          >
            {linkCopied ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}
          </button>
        )}

        {isSearching && progress !== undefined && (
          <div className="emoji-search-progress" role="progressbar" aria-label="Preparing search matches"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div id="emoji-search-status" role="status" className="emoji-search-status">
        {status}
      </div>
      {recentEmojis.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-medium">Recently Used</h3>
          <div className="flex gap-2 mt-1">
            {recentEmojis.map(emoji => (
              <button
                key={emoji.id}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                title={emoji.filename}
                className="p-1 hover:bg-accent rounded"
              >
                <img
                  src={emojiAsset(emoji.filename, 64, true)}
                  alt={emoji.filename}
                  className="w-6 h-6"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
