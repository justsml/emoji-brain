import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn } from "../lib/utils";
import { useDispatch, useSelector } from "react-redux";
import {
  toggleEmojiSelection,
  setFocusedIndex,
  selectSelectedEmojis,
  selectFocusedIndex,
} from "../store/selectionSlice";
import { Grid } from "react-virtualized";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  onSelectionChange?: (selectedEmojis: EmojiMetadata[]) => void;
}

const CELL_SIZE = 96; // 64px for emoji + 32px for padding/gap
const MIN_HEIGHT = 400;

const EmojiGrid = ({
  emojis,
  onSelectionChange,
}: EmojiGridProps): ReactElement => {
  const dispatch = useDispatch();
  const selectedEmojis = useSelector(selectSelectedEmojis);
  const focusedIndex = useSelector(selectFocusedIndex);
  const gridRef = useRef<Grid>(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: window.innerHeight - 200, // Subtract header/footer space
    columnCount: 3,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const width = window.innerWidth - 48; // Account for container padding
      const columnCount =
        window.innerWidth >= 1024 ? 9 : window.innerWidth >= 768 ? 6 : 3;
      const height = Math.max(MIN_HEIGHT, window.innerHeight - 200);

      setDimensions({ width, height, columnCount });
      gridRef.current?.recomputeGridSize();
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const toggleSelection = (emoji: EmojiMetadata) => {
    dispatch(toggleEmojiSelection(emoji));
    onSelectionChange?.(selectedEmojis);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        dispatch(setFocusedIndex(Math.min(emojis.length - 1, index + 1)));
        break;
      case "ArrowLeft":
        e.preventDefault();
        dispatch(setFocusedIndex(Math.max(0, index - 1)));
        break;
      case "ArrowUp":
        e.preventDefault();
        dispatch(setFocusedIndex(Math.max(0, index - dimensions.columnCount)));
        break;
      case "ArrowDown":
        e.preventDefault();
        dispatch(
          setFocusedIndex(
            Math.min(emojis.length - 1, index + dimensions.columnCount)
          )
        );
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (index >= 0 && index < emojis.length) {
          toggleSelection(emojis[index]);
        }
        break;
    }
  };

  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      if (
        "forceUpdateGrid" in gridRef.current &&
        typeof gridRef.current.forceUpdateGrid === "function" &&
        gridRef.current.forceUpdateGrid
      ) {
        gridRef.current.forceUpdateGrid();
      } else {
        console.error("forceUpdateGrid is not a function");
      }
    }
  }, [focusedIndex]);

  const cellRenderer = ({ columnIndex, key, rowIndex, style }) => {
    const index = rowIndex * dimensions.columnCount + columnIndex;
    if (index >= emojis.length) return null;

    const emoji = emojis[index];
    return (
      <div key={key} style={style}>
        <button
          className={cn(
            "w-full h-full p-2",
            "aspect-square rounded-lg border bg-card text-card-foreground relative group",
            "shadow-sm flex items-center justify-center",
            "transition-all duration-200 ease-in-out",
            "hover:scale-110 hover:shadow-md focus:scale-105 focus:shadow-md hover:bg-primary/10",
            "focus:outline-none focus:ring-1 focus:ring-primary focus:bg-primary/10",
            selectedEmojis.some((e) => e.id === emoji.id) &&
              "ring-primary bg-primary/10"
          )}
          onClick={() => toggleSelection(emoji)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          tabIndex={focusedIndex === index ? 0 : -1}
          role="gridcell"
          aria-label={emoji.filename}
          aria-selected={selectedEmojis.some((e) => e.id === emoji.id)}
        >
          <img
            src={emoji.path}
            alt={emoji.filename}
            className="w-12 h-12 object-contain"
          />
          <div className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center text-xs p-2 text-center font-mono">
            :{emoji.filename?.split(".")[0]}:
          </div>
        </button>
      </div>
    );
  };

  if (emojis.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">No emojis found.</p>
    );
  }

  const rowCount = Math.ceil(emojis.length / dimensions.columnCount);

  return (
    <div role="grid" aria-label="Emoji grid">
      <Grid
        ref={gridRef}
        cellRenderer={cellRenderer}
        columnWidth={CELL_SIZE}
        rowHeight={CELL_SIZE}
        columnCount={dimensions.columnCount}
        rowCount={rowCount}
        width={dimensions.width}
        height={dimensions.height}
        overscanRowCount={2}
        overscanColumnCount={2}
        className="outline-none"
      />
    </div>
  );
};

export default EmojiGrid;
