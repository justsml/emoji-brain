import type { ReactElement, KeyboardEvent } from "react";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn } from "../lib/utils";
import { GRID_SCALES } from "./GridScaleSlider";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  gridScale: number;
  onToggleSelection: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onSetFocusedIndex: (index: number) => void;
  onAnnounceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

const GRID_GAP = 24;

interface EmojiCellProps {
  emoji: EmojiMetadata;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  columnCount: number;
  onToggle: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent, index: number, columnCount: number) => void;
  onFocusChange: (index: number) => void;
}

const EmojiCell = ({
  emoji,
  index,
  isSelected,
  isFocused,
  columnCount,
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

  return (
    <div
      className="p-3"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 80px',
        contain: 'layout style',
      }}
    >
      <button
        type="button"
        className={cn(
          "w-full aspect-square relative group overflow-hidden",
          "rounded-xl border bg-card/40 backdrop-blur-md",
          "flex flex-col items-center justify-center",
          "shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
          "transition-all duration-200 ease-out",
          "hover:shadow-xl hover:border-primary/40 hover:scale-[1.02]",
          "active:scale-[0.98]",
          isSelected 
            ? "border-primary bg-primary/20 ring-2 ring-primary/30" 
            : "border-border/40",
          isFocused && "ring-2 ring-primary/50 bg-primary/10"
        )}
        style={{
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange(index)}
        tabIndex={isFocused ? 0 : -1}
        aria-label={emoji.filename}
      >
        {isSelected && (
          <div
            className="absolute top-2 right-2 z-10 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-white shadow-lg
            animate-in fade-in zoom-in duration-200"
          >
            ✓
          </div>
        )}

        <div className="flex items-center justify-center flex-1 w-full h-full relative z-0 p-2">
          <img
            src={emoji.path}
            alt={emoji.filename}
            className="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            style={{
              imageRendering: 'auto',
            }}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out bg-gradient-to-t from-black/80 to-transparent p-2 text-center pointer-events-none">
          <span className="text-[10px] text-white/90 font-mono truncate block">
            {emoji.filename?.split(".")[0].replace(/\/.*\//g, "")}
          </span>
        </div>
      </button>
    </div>
  );
};

const MemoizedEmojiCell = Object.assign(EmojiCell, { displayName: 'MemoizedEmojiCell' });

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
    const baseSize = GRID_SCALES[scale];
    const availableWidth = width - 32;
    const columnCount = Math.max(1, Math.floor(availableWidth / (baseSize + GRID_GAP)));
    const columnWidth = Math.floor(availableWidth / columnCount);
    return { columnCount, columnWidth };
  }, []);

  const { columnCount, columnWidth } = calculateLayout(width, gridScale);

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
    return new Map(selectedEmojis.map(e => [e.id, true]));
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
      className="w-full h-[calc(100vh-300px)] min-h-[500px] mt-8 px-4 overflow-auto"
      style={{
        contentVisibility: 'auto',
      }}
    >
      <div
        className="grid gap-6"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, ${columnWidth}px)`,
          justifyContent: 'center',
        }}
      >
        {emojis.map((emoji, index) => {
          const isSelected = isSelectedMap.has(emoji.id);
          const isFocused = focusedIndex === index;

          return (
            <MemoizedEmojiCell
              key={emoji.id}
              emoji={emoji}
              index={index}
              isSelected={isSelected}
              isFocused={isFocused}
              columnCount={columnCount}
              onToggle={onToggleSelection}
              onKeyDown={handleKeyDown}
              onFocusChange={onSetFocusedIndex}
            />
          );
        })}
      </div>
    </div>
  );
};

export default EmojiGrid;
