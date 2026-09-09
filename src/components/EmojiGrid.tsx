import type { ReactElement, KeyboardEvent } from "react";
import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn } from "../lib/utils";
import { GRID_SCALES } from "./GridScaleSlider";
import "../styles/emoji-cards.css";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  gridScale: number;
  onToggleSelection: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onSetFocusedIndex: (index: number) => void;
  onAnnounceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

const GRID_GAP = 16;

interface EmojiCellProps {
  emoji: EmojiMetadata;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  columnCount: number;
  imageWidth: number;
  onToggle: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent, index: number, columnCount: number) => void;
  onFocusChange: (index: number) => void;
}

const AnimatedImage = ({ src, alt, width }: { src: string; alt: string; width: number }) => {
  return (
    <img
      src={src}
      alt={alt}
      className="emoji-card-image"
      width={width}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      style={{
        imageRendering: 'auto',
      }}
    />
  );
};

const EmojiCell = ({
  emoji,
  index,
  isSelected,
  isFocused,
  columnCount,
  imageWidth,
  onToggle,
  onKeyDown,
  onFocusChange,
}: EmojiCellProps) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onToggle(emoji, e);
  }, [onToggle, emoji]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    onKeyDown(e, index, columnCount);
  }, [onKeyDown, index, columnCount]);

  const handleFocus = useCallback(() => {
    onFocusChange(index);
  }, [onFocusChange, index]);

  const name = emoji.filename.split("/").pop()?.replace(/\.[^.]+$/, "") || emoji.filename;

  return (
    <div className="min-w-0" role="gridcell" style={{ contain: "layout style" }}>
      <button
        type="button"
        className={cn("emoji-card", isSelected && "emoji-card-selected", isFocused && "emoji-card-focused")}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        tabIndex={isFocused ? 0 : -1}
        aria-label={emoji.filename}
        aria-pressed={isSelected}
        title={`:${name}:`}
      >
        <div className="emoji-card-preview">
          <span className="emoji-card-check" aria-hidden="true">{isSelected ? "✓" : "+"}</span>
          <AnimatedImage src={emoji.path} alt={emoji.filename} width={imageWidth} />
        </div>
        <div className="emoji-card-caption">
          <span className="emoji-card-name">{name}</span>
          <span className="emoji-card-hint">{isSelected ? "Selected" : "Click to collect"}</span>
        </div>
      </button>
    </div>
  );
};

const MemoizedEmojiCell = memo(EmojiCell);
MemoizedEmojiCell.displayName = "EmojiCell";

const EmojiGrid = ({
  emojis,
  selectedEmojis,
  focusedIndex,
  gridScale,
  onToggleSelection,
  onSetFocusedIndex,
  onAnnounceSelection,
}: EmojiGridProps): ReactElement => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  
  const calculateLayout = useCallback((width: number, scale: number) => {
    const baseSize = GRID_SCALES[scale] ?? GRID_SCALES[0];
    const availableWidth = width - 32;
    const columnCount = Math.max(1, Math.floor(availableWidth / (baseSize + GRID_GAP)));
    return { columnCount };
  }, []);

  const { columnCount } = calculateLayout(width, gridScale);

  useEffect(() => {
    if (!parentRef.current) return;
    
    const updateWidth = () => {
      if (parentRef.current) {
        setWidth(parentRef.current.clientWidth);
      }
    };
    
    updateWidth();
    
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(parentRef.current);
      
      return () => resizeObserver.disconnect();
    }
    
    return () => {};
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent, index: number, colCount: number) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        onSetFocusedIndex(Math.min(emojis.length - 1, index + 1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        onSetFocusedIndex(Math.max(0, index - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        onSetFocusedIndex(Math.max(0, index - colCount));
        break;
      case "ArrowDown":
        e.preventDefault();
        onSetFocusedIndex(Math.min(emojis.length - 1, index + colCount));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (index >= 0 && index < emojis.length) {
          onToggleSelection(emojis[index]);
          onAnnounceSelection(emojis[index], !selectedEmojis.some(e => e.id === emojis[index].id));
        }
        break;
    }
  }, [emojis, onSetFocusedIndex, onToggleSelection, onAnnounceSelection, selectedEmojis]);

  const isSelectedMap = useMemo(() => {
    const map = new Map();
    for (const emoji of selectedEmojis) {
      map.set(emoji.id, true);
    }
    return map;
  }, [selectedEmojis]);

  if (emojis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-xl font-medium text-muted-foreground">No emojis found</p>
        <p className="text-sm text-muted-foreground/60">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="w-full my-8 mb-16 px-4"
    >
      <div
        className="grid gap-4 w-full max-w-full"
        role="grid"
        aria-label="Emoji results"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
        }}
      >
        {emojis.map((emoji, index) => (
          <MemoizedEmojiCell
            key={emoji.id}
            emoji={emoji}
            index={index}
            isSelected={isSelectedMap.has(emoji.id)}
            isFocused={focusedIndex === index}
            columnCount={columnCount}
            imageWidth={GRID_SCALES[gridScale] ?? GRID_SCALES[0]}
            onToggle={onToggleSelection}
            onKeyDown={handleKeyDown}
            onFocusChange={onSetFocusedIndex}
          />
        ))}
      </div>
    </div>
  );
};

export default EmojiGrid;
