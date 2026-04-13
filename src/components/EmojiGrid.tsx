import type { ReactElement, KeyboardEvent } from "react";
import { useEffect, useRef, useMemo, useCallback } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn } from "../lib/utils";
import { GRID_SCALES } from "./GridScaleSlider";
import { Grid, AutoSizer } from "react-virtualized";
import { motion, AnimatePresence } from "framer-motion";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  gridScale: number;
  onToggleSelection: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onSetFocusedIndex: (index: number) => void;
  onAnnounceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

interface EmojiCellProps {
  emoji: EmojiMetadata;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  gridScale: number;
  columnCount: number;
  style: React.CSSProperties;
  onToggle: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent, index: number, columnCount: number) => void;
  onAnnounce: (emoji: EmojiMetadata, isSelected: boolean) => void;
}

const MIN_HEIGHT = 400;
const GRID_GAP = 24;

const EmojiCell = ({
  emoji,
  index,
  isSelected,
  isFocused,
  gridScale,
  columnCount,
  style,
  onToggle,
  onFocusChange,
  onKeyDown,
  onAnnounce,
}: EmojiCellProps): ReactElement => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onToggle(emoji, e);
    onAnnounce(emoji, !isSelected);
  }, [onToggle, emoji, isSelected, onAnnounce]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    onKeyDown(e, index, columnCount);
  }, [onKeyDown, index, columnCount]);

  const handleFocus = useCallback(() => {
    onFocusChange(index);
  }, [onFocusChange, index]);

  return (
    <div
      style={{
        ...style,
        padding: GRID_GAP / 2,
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto',
      }}
      role="gridcell"
      tabIndex={-1}
    >
      <motion.button
        layout
        layoutDependency={gridScale}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.15 }}
        type="button"
        role="gridcell"
        className={cn(
          "w-full h-full p-2 relative group overflow-hidden",
          "rounded-xl border bg-card/40 backdrop-blur-md transition-colors duration-500",
          "flex flex-col items-center justify-center",
          "shadow-sm hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary/40",
          isSelected ? "border-primary bg-primary/20 ring-2 ring-primary/30 shadow-primary/20" : "border-border/40 hover:border-primary/40",
          isFocused && "ring-2 ring-primary/50 bg-primary/10"
        )}
        style={{ willChange: 'transform' }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        tabIndex={isFocused ? 0 : -1}
        aria-label={emoji.filename}
        aria-selected={isSelected}
      >
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute top-2 right-2 z-10 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-white shadow-lg"
            >
              ✓
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center flex-1 w-full h-full relative z-0">
          <img
            src={emoji.path}
            alt={emoji.filename}
            className="w-full h-full object-contain drop-shadow-sm transition-all duration-200"
            loading="lazy"
            decoding="async"
            style={{ 
              willChange: 'filter',
              filter: isSelected ? "drop-shadow(0 0 8px rgba(var(--primary), 0.4))" : "none"
            }}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/80 to-transparent p-2 text-center pointer-events-none">
          <span className="text-[10px] text-white/90 font-mono truncate block">
            {emoji.filename?.split(".")[0].replace(/\/.*\//g, "")}
          </span>
        </div>
      </motion.button>
    </div>
  );
};

const MemoizedEmojiCell = Object.assign(
  (props: EmojiCellProps) => <EmojiCell {...props} />,
  { displayName: 'MemoizedEmojiCell' }
);

const EmojiGrid = ({
  emojis,
  selectedEmojis,
  focusedIndex,
  gridScale,
  onToggleSelection,
  onSetFocusedIndex,
  onAnnounceSelection,
}: EmojiGridProps): ReactElement => {
  const gridRef = useRef<Grid>(null);
  
  const baseCellSize = GRID_SCALES[gridScale];
  
  const calculateLayout = useCallback((width: number, scale: number) => {
    const baseSize = GRID_SCALES[scale];
    const availableWidth = width - 32;
    const columnCount = Math.max(1, Math.floor(availableWidth / (baseSize + GRID_GAP)));
    const columnWidth = Math.floor(availableWidth / columnCount);
    const rowHeight = columnWidth;
    return { columnCount, columnWidth, rowHeight };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent, index: number, columnCount: number) => {
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
        onSetFocusedIndex(Math.max(0, index - columnCount));
        break;
      case "ArrowDown":
        e.preventDefault();
        onSetFocusedIndex(Math.min(emojis.length - 1, index + columnCount));
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

  useEffect(() => {
    const timer = setTimeout(() => {
      gridRef.current?.recomputeGridSize();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const cellRenderer = useMemo(() => {
    const isSelectedMap = new Map(selectedEmojis.map(e => [e.id, true]));
    
    return ({
      columnIndex,
      key,
      rowIndex,
      style,
      columnCount,
    }: {
      columnIndex: number;
      key: string;
      rowIndex: number;
      style: React.CSSProperties;
      columnCount: number;
    }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= emojis.length) return null;

      const emoji = emojis[index];
      const isSelected = isSelectedMap.has(emoji.id);
      const isFocused = focusedIndex === index;

      return (
        <MemoizedEmojiCell
          key={key}
          emoji={emoji}
          index={index}
          isSelected={isSelected}
          isFocused={isFocused}
          gridScale={gridScale}
          columnCount={columnCount}
          style={style}
          onToggle={onToggleSelection}
          onFocusChange={onSetFocusedIndex}
          onKeyDown={handleKeyDown}
          onAnnounce={onAnnounceSelection}
        />
      );
    };
  }, [emojis, selectedEmojis, focusedIndex, gridScale, onToggleSelection, onSetFocusedIndex, handleKeyDown, onAnnounceSelection]);

  if (emojis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-xl font-medium text-muted-foreground">No emojis found</p>
        <p className="text-sm text-muted-foreground/60">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px] mt-8 px-4">
      <AutoSizer disableHeight>
        {({ width }) => {
          const { columnCount, columnWidth, rowHeight } = calculateLayout(width, gridScale);
          const rowCount = Math.ceil(emojis.length / columnCount);
          const gridHeight = Math.max(window.innerHeight - 300, MIN_HEIGHT);

          return (
            <Grid
              ref={gridRef}
              cellRenderer={(props) => cellRenderer({ ...props, columnCount })}
              columnWidth={columnWidth}
              rowHeight={rowHeight}
              columnCount={columnCount}
              rowCount={rowCount}
              width={width}
              height={gridHeight}
              overscanRowCount={5}
              className="outline-none scrollbar-hide"
              role="grid"
              aria-label="Emoji grid"
              aria-readonly="false"
              style={{
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default EmojiGrid;
