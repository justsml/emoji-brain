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

const CELL_SIZE = 192; // 64px for emoji + 32px padding + 32px gap (2rem)
const MIN_HEIGHT = 300;
// Breakpoints for responsive design
const CONTAINER_PADDING = 48;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 10;
const MIN_COLUMN_WIDTH = 200; // Minimum width for comfortable emoji display

const EmojiGrid = ({
  emojis,
  onSelectionChange,
}: EmojiGridProps): ReactElement => {
  const dispatch = useDispatch();
  const selectedEmojis = useSelector(selectSelectedEmojis);
  const focusedIndex = useSelector(selectFocusedIndex);
  const gridRef = useRef<Grid>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 320, // Subtract header/footer space
    columnCount: 3,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const gridEl = document.querySelector(".ReactVirtualized__Grid");
      // const boxWidth = gridEl?.
      const boundingRect = gridEl?.getBoundingClientRect();
      // The grid height can be inferred from the top of the grid element
      const topPx = boundingRect?.y || 0;
      const boxHeight = window.innerHeight - topPx
      const boxWidth = boundingRect?.width || window.innerWidth;
      // const boxWidth = window.innerWidth - CONTAINER_PADDING;
      const width = boxWidth; // - CONTAINER_PADDING;
      const height = Math.max(boxHeight, MIN_HEIGHT);

      // Calculate optimal column count based on available width
      const maxPossibleColumns = Math.floor(width / MIN_COLUMN_WIDTH);
      let columnCount = Math.max(
        MIN_COLUMNS,
        Math.min(maxPossibleColumns, MAX_COLUMNS)
      );

      // if (columnCount > 3) columnCount = 

      setDimensions({ width, height, columnCount });
      gridRef.current?.recomputeGridSize();
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions, { passive: true });
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

  const cellRenderer = ({
    columnIndex,
    key,
    rowIndex,
    style,
  }: {
    columnIndex: number;
    key: string;
    rowIndex: number;
    style: React.CSSProperties;
  }) => {
    const index = rowIndex * dimensions.columnCount + columnIndex;
    if (index >= emojis.length) return null;

    const emoji = emojis[index];
    return (
      <div key={key} style={style} className="p-8">
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
            :{emoji.filename?.split(".")[0].replace(/\/.*\//g, "")}:
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
    <div
      role="grid"
      aria-label="Emoji grid"
      className="flex justify-around emoji-box"
    >
      <Grid
        style={{ margin: "0 auto" }}
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
        className="emoji-v-grid outline-none"
      />
    </div>
  );
};

export default EmojiGrid;
