import type { ReactElement, KeyboardEvent, CSSProperties } from "react";
import { memo, useCallback, useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import type { EmojiMetadata } from "../types/emoji";
import { cn } from "../lib/utils";
import { recoverEmojiPreview, restoreEmojiPreview, emojiAsset, previewSrcSet, animatedSrcSet, fittingSize, stillImageProps } from "../lib/emojiAssets";
import { GRID_SCALES, LIGHT_STICKER_SIZE, STICKER_SIZES } from "../lib/gridScales";
import { useMarqueeSelection, type MarqueeMode } from "../hooks/useMarqueeSelection";
import { looksStalled, reportStall, usePreviewQuality, STALL_AFTER_MS } from "../lib/previewQuality";
import "../styles/emoji-cards.css";

interface EmojiGridProps {
  emojis: EmojiMetadata[];
  selectedEmojis: EmojiMetadata[];
  focusedIndex: number;
  gridScale: number;
  onSimilar?: (emoji: EmojiMetadata) => void;
  onToggleSelection: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onSetFocusedIndex: (index: number) => void;
  onAnnounceSelection: (emoji: EmojiMetadata, isSelected: boolean) => void;
  /** Drag-select: add these to the selection. Falls back to toggling each. */
  onSelectMany?: (emojis: EmojiMetadata[]) => void;
  /** Alt-drag: remove these from the selection. Falls back to toggling each. */
  onDeselectMany?: (emojis: EmojiMetadata[]) => void;
}

// Fixed spacing per size keeps larger stickers separated without measurements.
const GRID_GAPS = [14, 20, 26, 34];
/** Roughly the first screen at the default size: fetched first, never deferred. */
const PRIORITY_CELLS = 12;

interface EmojiCellProps {
  emoji: EmojiMetadata;
  isSelected: boolean;
  isFocused: boolean;
  /** inside the drag rectangle, and what releasing would do to it */
  preview: MarqueeMode | null;
  baseSize: number;
  /** The drawn width of the artwork inside the tile. */
  stickerSize: number;
  priority: boolean;
  light: boolean;
  onSimilar?: (emoji: EmojiMetadata) => void;
  onToggle: (emoji: EmojiMetadata, event?: React.MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent, id: string, isSelected: boolean) => void;
  onFocusChange: (id: string) => void;
}

const AnimatedImage = ({
  emoji,
  alt,
  stickerSize,
  isPlaying,
  priority,
  light,
  onPlaying,
}: {
  emoji: EmojiMetadata;
  alt: string;
  stickerSize: number;
  isPlaying: boolean;
  priority: boolean;
  light: boolean;
  /** The animation has arrived (or given up). */
  onPlaying: () => void;
}) => {
  // Animated WebPs invalidate their compositor tile on every frame. Drawing 90+
  // of them at once means the grid can never hold a cached raster, which is what
  // makes the page blank out while scrolling. Stills stay put; only the sticker
  // under the pointer plays.
  const playing = emoji.animated && isPlaying;
  // `sizes` is the exact drawn width, so the browser's own density math picks
  // the variant: 128px at L on a 1x screen, 256px on 2x. Light previews claim
  // a 64px slot instead. Animations get the same treatment — at several times
  // the bytes of a still, over-fetching one matters more.
  const slot = light ? LIGHT_STICKER_SIZE : stickerSize;
  return (
    <img
      onError={event => { recoverEmojiPreview(event); if (playing) onPlaying(); }}
      onLoad={event => { restoreEmojiPreview(event); if (playing) onPlaying(); }}
      src={emojiAsset(emoji.filename, fittingSize(slot), !playing)}
      srcSet={playing ? animatedSrcSet(emoji.filename) : previewSrcSet(emoji.filename)}
      sizes={`${slot}px`}
      alt={alt}
      className="emoji-card-image"
      width={stickerSize}
      height={stickerSize}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      draggable={false}
    />
  );
};

const MemoizedAnimatedImage = memo(AnimatedImage);

const EmojiCell = ({
  emoji,
  isSelected,
  isFocused,
  preview,
  baseSize,
  stickerSize,
  priority,
  light,
  onToggle,
  onSimilar,
  onKeyDown,
  onFocusChange,
}: EmojiCellProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  // An animation is a separate, larger download; on a slow link say so.
  const [fetching, setFetching] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = isPlaying;
  const play = useCallback(() => {
    if (!emoji.animated || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!playingRef.current) setFetching(true);
    setIsPlaying(true);
  }, [emoji.animated]);
  const handlePlaying = useCallback(() => setFetching(false), []);
  const [actions, setActions] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nameRef = useRef<HTMLSpanElement>(null);
  const nameActive = isSelected || actions;
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Keep the grid's initial bundle and layout work small. Only an intentional
  // interaction with a clipped name loads the scrolling behavior and its CSS.
  useEffect(() => {
    if (!nameActive || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      const label = nameRef.current;
      if (!label || label.scrollWidth <= label.clientWidth + 1) return;
      void import('../lib/emojiNameScroll').then(({ scrollEmojiName }) => {
        if (!disposed) stop = scrollEmojiName(label);
      }).catch(() => { /* The full name remains available in the button title. */ });
    }, 800);
    return () => { disposed = true; clearTimeout(timer); stop?.(); };
  }, [nameActive, baseSize, emoji.filename]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // a tap has no hover to enter, so play from the tap itself
    setActions(true);
    play();
    onToggle(emoji, e);
  }, [onToggle, emoji, play]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    onKeyDown(e, emoji.id, isSelected);
  }, [onKeyDown, emoji.id, isSelected]);

  const handleFocus = useCallback(() => {
    setActions(true);
    play();
    onFocusChange(emoji.id);
  }, [onFocusChange, emoji.id, play]);

  const startPlaying = useCallback(() => {
    if (window.matchMedia?.("(hover: none)").matches) return;
    // Cards passing under the pointer during a scroll should not start network
    // requests, animation decoding, and raster invalidation. Taps/focus still
    // play immediately; a stationary pointer expresses hover intent.
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setActions(true);
      // Sweeping a pointer across a slow sheet shouldn't queue a dozen
      // animations ahead of the stills; light previews play on tap or focus.
      if (!light) play();
    }, 120);
  }, [light, play]);
  // A finger "leaves" the moment it lifts, and engines disagree on whether that
  // lands before or after the click; touch never stops playback by leaving, so
  // a tap always plays regardless of event order.
  const stopPlaying = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setIsPlaying(false);
    setFetching(false);
  }, []);

  const name = emoji.filename.split("/").pop()?.replace(/\.[^.]+$/, "") || emoji.filename;

  return (
    <div className="emoji-cell min-w-0" onPointerEnter={startPlaying} onPointerLeave={event => { if (event.pointerType === 'touch') return; stopPlaying(); if (!event.currentTarget.contains(document.activeElement)) setActions(false); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { stopPlaying(); setActions(false); } }} role="gridcell" data-id={emoji.id} style={{ "--emoji-size": `${baseSize}px`, "--sticker-size": `${stickerSize}px`, ...(emoji.placeholder && { "--ph-x": emoji.placeholder[0], "--ph-y": emoji.placeholder[1] }) } as CSSProperties}>
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
        tabIndex={isFocused ? 0 : -1}
        aria-label={`${emoji.filename}${emoji.animated ? ", animated" : ""}`}
        aria-pressed={isSelected}
        title={`:${name}:`}
      >
        <div className={cn("emoji-card-preview", emoji.animated && "emoji-card-preview-animated", emoji.placeholder && "emoji-card-preview-placeholder", fetching && "is-fetching")}>
          <span className="emoji-card-check" aria-hidden="true">{isSelected ? "✓" : "+"}</span>
          <MemoizedAnimatedImage emoji={emoji} alt={emoji.filename} stickerSize={stickerSize} isPlaying={isPlaying} priority={priority} light={light} onPlaying={handlePlaying} />
        </div>
        <span ref={nameRef} className="emoji-card-name"><span>:{name}:</span></span>
      </button>
      {actions && onSimilar && <div className="emoji-card-actions" role="group" aria-label={`Actions for ${name}`} onPointerDown={event => event.stopPropagation()}>
        <button type="button" onClick={() => onSimilar(emoji)}><span aria-hidden="true">✦ </span>Similar</button>
      </div>}
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
  onSimilar,
  onSetFocusedIndex,
  onAnnounceSelection,
  onSelectMany,
  onDeselectMany,
}: EmojiGridProps): ReactElement => {
  const parentRef = useRef<HTMLDivElement>(null);
  const order = useRef({emojis, byId: new Map(emojis.map((emoji,index) => [emoji.id,index]))});
  useLayoutEffect(() => { order.current = {emojis, byId: new Map(emojis.map((emoji,index) => [emoji.id,index]))}; }, [emojis]);
  const handleFocusChange = useCallback((id: string) => {
    const index = order.current.byId.get(id);
    if (index !== undefined) onSetFocusedIndex(index);
  }, [onSetFocusedIndex]);
  const baseSize = GRID_SCALES[gridScale] ?? GRID_SCALES[0];
  const stickerSize = STICKER_SIZES[gridScale] ?? STICKER_SIZES[0];
  const { light } = usePreviewQuality();

  // Browsers without the Network Information API (Safari, Firefox) still get
  // light previews: if most of the first screen is still loading well after
  // the page started, the connection is the bottleneck, not the layout.
  useEffect(() => {
    const timer = setTimeout(() => {
      const images = parentRef.current?.querySelectorAll<HTMLImageElement>(".emoji-card-image") ?? [];
      const boxes = Array.from(images, image => {
        const { top, bottom } = image.getBoundingClientRect();
        return { top, bottom, ready: image.hasAttribute("data-ready") || (image.complete && image.naturalWidth > 0) };
      });
      if (looksStalled(boxes, window.innerHeight)) reportStall();
    }, Math.max(0, STALL_AFTER_MS - performance.now()));
    return () => clearTimeout(timer);
  }, []);

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
  
  // Columns come from the CSS grid's own auto-fill track sizing, not a JS
  // measurement of container width: that way server-rendered markup and the
  // hydrated client agree on layout from the first frame, with nothing to
  // reconcile once JS takes over (a mismatch here was reflowing every one of
  // 350+ cells and destabilizing scroll height mid-scroll).
  const getColumnCount = useCallback(() => {
    const cells = parentRef.current?.querySelectorAll('[role="gridcell"]');
    if (!cells || cells.length < 2) return 1;
    const firstTop = (cells[0] as HTMLElement).offsetTop;
    let count = 1;
    for (let i = 1; i < cells.length; i++) {
      if ((cells[i] as HTMLElement).offsetTop !== firstTop) break;
      count++;
    }
    return count;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent, id: string, isSelected: boolean) => {
    const {emojis, byId} = order.current;
    const index = byId.get(id);
    if (index === undefined) return;
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
        onSetFocusedIndex(Math.max(0, index - getColumnCount()));
        break;
      case "ArrowDown":
        e.preventDefault();
        onSetFocusedIndex(Math.min(emojis.length - 1, index + getColumnCount()));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (index >= 0 && index < emojis.length) {
          onToggleSelection(emojis[index]);
          onAnnounceSelection(emojis[index], !isSelected);
        }
        break;
    }
  }, [getColumnCount, onSetFocusedIndex, onToggleSelection, onAnnounceSelection]);

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

  if (emojis.length === 0) {
    return (
      <div className="emoji-empty">
        <img onError={recoverEmojiPreview} onLoad={restoreEmojiPreview} {...stillImageProps("cat-confuse.webp", 64)} alt="" aria-hidden="true" width="64" height="64" />
        <h2>Nothing on the sheet matches that</h2>
        <p>Search by name, or by what an emoji is doing — try “cat”, “fire”, “thumbs”, or “party”.</p>
      </div>
    );
  }

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
            gap: GRID_GAPS[gridScale] ?? GRID_GAPS[0],
            gridTemplateColumns: `repeat(auto-fill, minmax(${baseSize}px, 1fr))`,
          }}
        >
          {emojis.map((emoji, index) => (
            <MemoizedEmojiCell
              key={emoji.id}
              emoji={emoji}
              isSelected={isSelectedMap.has(emoji.id)}
              isFocused={focusedIndex === index}
              preview={marquee && previewIds?.has(emoji.id) ? marquee.mode : null}
              baseSize={baseSize}
              stickerSize={stickerSize}
              priority={index < PRIORITY_CELLS}
              light={light}
              onSimilar={onSimilar}
              onToggle={onToggleSelection}
              onKeyDown={handleKeyDown}
              onFocusChange={handleFocusChange}
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
