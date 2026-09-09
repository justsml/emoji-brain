import type { ReactElement, KeyboardEvent } from "react";
import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn, stillSrc } from "../lib/utils";
import { GRID_SCALES } from "./GridScaleSlider";
import { useMarqueeSelection, type MarqueeMode } from "../hooks/useMarqueeSelection";
import "../styles/emoji-cards.css";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  gridScale: number;
  onToggleSelection: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onSetFocusedIndex: (index: number) => void;
  onAnnounceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
  /** Drag-select: add these to the selection. Falls back to toggling each. */
  onSelectMany?: (emojis: EmojiMetadata[]) => void;
  /** Alt-drag: remove these from the selection. Falls back to toggling each. */
  onDeselectMany?: (emojis: EmojiMetadata[]) => void;
}

const GRID_GAP = 12;

interface EmojiCellProps {
  emoji: EmojiMetadata;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  /** inside the drag rectangle, and what releasing would do to it */
  preview: MarqueeMode | null;
  columnCount: number;
  imageWidth: number;
  onToggle: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent, index: number, columnCount: number) => void;
  onFocusChange: (index: number) => void;
}

const AnimatedImage = ({
  emoji,
  alt,
  width,
  isPlaying,
}: {
  emoji: EmojiMetadata;
  alt: string;
  width: number;
  isPlaying: boolean;
}) => {
  // Animated WebPs invalidate their compositor tile on every frame. Drawing 90+
  // of them at once means the grid can never hold a cached raster, which is what
  // makes the page blank out while scrolling. Stills stay put; only the sticker
  // under the pointer plays.
  const src = isPlaying ? emoji.path : stillSrc(emoji);
  return (
    <img
      src={src}
      alt={alt}
      className="emoji-card-image"
      width={width}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      draggable={false}
    />
  );
};

const EmojiCell = ({
  emoji,
  index,
  isSelected,
  isFocused,
  preview,
  columnCount,
  imageWidth,
  onToggle,
  onKeyDown,
  onFocusChange,
}: EmojiCellProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // a tap has no hover to enter, so play from the tap itself
    setIsPlaying(true);
    onToggle(emoji, e);
  }, [onToggle, emoji]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    onKeyDown(e, index, columnCount);
  }, [onKeyDown, index, columnCount]);

  const handleFocus = useCallback(() => {
    setIsPlaying(true);
    onFocusChange(index);
  }, [onFocusChange, index]);

  const startPlaying = useCallback(() => setIsPlaying(true), []);
  const stopPlaying = useCallback(() => setIsPlaying(false), []);

  const name = emoji.filename.split("/").pop()?.replace(/\.[^.]+$/, "") || emoji.filename;

  return (
    <div className="min-w-0" role="gridcell" data-id={emoji.id} style={{ contain: "layout style" }}>
      <button
        type="button"
        className={cn(
          "emoji-card",
          isSelected && "emoji-card-selected",
          isFocused && "emoji-card-focused",
          preview === "add" && "emoji-card-marquee-add",
          preview === "remove" && "emoji-card-marquee-remove",
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={stopPlaying}
        onPointerEnter={startPlaying}
        onPointerLeave={stopPlaying}
        tabIndex={isFocused ? 0 : -1}
        aria-label={emoji.filename}
        aria-pressed={isSelected}
        title={`:${name}:`}
      >
        <div className="emoji-card-preview">
          <span className="emoji-card-check" aria-hidden="true">{isSelected ? "✓" : "+"}</span>
          <AnimatedImage emoji={emoji} alt={emoji.filename} width={imageWidth} isPlaying={isPlaying} />
        </div>
        <span className="emoji-card-name">:{name}:</span>
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
  onSelectMany,
  onDeselectMany,
}: EmojiGridProps): ReactElement => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  const isSelectedMap = useMemo(() => {
    const map = new Map();
    for (const emoji of selectedEmojis) {
      map.set(emoji.id, true);
    }
    return map;
  }, [selectedEmojis]);

  const commitMarquee = useCallback((ids: string[], mode: MarqueeMode) => {
    const wanted = new Set(ids);
    const hit = emojis.filter((emoji) => wanted.has(emoji.id));
    if (mode === "add") {
      if (onSelectMany) return onSelectMany(hit);
      for (const emoji of hit) if (!isSelectedMap.has(emoji.id)) onToggleSelection(emoji);
    } else {
      if (onDeselectMany) return onDeselectMany(hit);
      for (const emoji of hit) if (isSelectedMap.has(emoji.id)) onToggleSelection(emoji);
    }
  }, [emojis, isSelectedMap, onSelectMany, onDeselectMany, onToggleSelection]);

  const { marquee, onPointerDown, onClickCapture } = useMarqueeSelection({
    containerRef: parentRef,
    cellSelector: '[role="gridcell"]',
    onCommit: commitMarquee,
  });
  
  const calculateLayout = useCallback((width: number, scale: number) => {
    const baseSize = GRID_SCALES[scale] ?? GRID_SCALES[0];
    const availableWidth = width;
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

  if (emojis.length === 0) {
    return (
      <div className="emoji-empty">
        <img src="/emojis/cat-confuse.webp" alt="" aria-hidden="true" width="72" height="72" />
        <h2>Nothing on the sheet matches that</h2>
        <p>Search by name, or by what an emoji is doing — try “cat”, “fire”, “thumbs”, or “party”.</p>
      </div>
    );
  }

  // Only stickers that releasing would actually change get the preview treatment.
  const previewIds = useMemo(() => {
    if (!marquee) return null;
    const ids = new Set<string>();
    for (const id of marquee.hits) {
      if (isSelectedMap.has(id) === (marquee.mode === "remove")) ids.add(id);
    }
    return ids;
  }, [marquee, isSelectedMap]);
  const hitCount = previewIds?.size ?? 0;
  const marqueeLabel = marquee
    ? `${marquee.mode === "remove" ? "Remove" : "Select"} ${hitCount} ${hitCount === 1 ? "emoji" : "emojis"}`
    : "";

  return (
    <div
      className={cn("emoji-grid-wrap", marquee && "is-marquee")}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div className="emoji-grid-stage">
        <div
          ref={parentRef}
          className="grid w-full max-w-full"
          role="grid"
          aria-label="Emoji results"
          style={{
            gap: GRID_GAP,
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {emojis.map((emoji, index) => (
            <MemoizedEmojiCell
              key={emoji.id}
              emoji={emoji}
              index={index}
              isSelected={isSelectedMap.has(emoji.id)}
              isFocused={focusedIndex === index}
              preview={marquee && previewIds?.has(emoji.id) ? marquee.mode : null}
              columnCount={columnCount}
              imageWidth={GRID_SCALES[gridScale] ?? GRID_SCALES[0]}
              onToggle={onToggleSelection}
              onKeyDown={handleKeyDown}
              onFocusChange={onSetFocusedIndex}
            />
          ))}
        </div>
        {marquee && (
          <div
            className={cn("emoji-marquee", marquee.mode === "remove" && "emoji-marquee-remove")}
            data-testid="emoji-marquee"
            aria-hidden="true"
            style={{
              left: marquee.rect.left,
              top: marquee.rect.top,
              width: marquee.rect.width,
              height: marquee.rect.height,
            }}
          >
            {hitCount > 0 && (
              <span className="emoji-marquee-count">
                {marquee.mode === "remove" ? "−" : "+"}{hitCount}
              </span>
            )}
          </div>
        )}
        <span className="sr-only" aria-live="polite">{marqueeLabel}</span>
      </div>
    </div>
  );
};

export default EmojiGrid;
