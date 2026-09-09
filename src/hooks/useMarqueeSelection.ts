import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type MarqueeMode = "add" | "remove";

export interface MarqueeState {
  rect: MarqueeRect;
  mode: MarqueeMode;
  /** ids of the cells currently inside the rectangle */
  hits: Set<string>;
}

interface CellBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Gesture {
  pointerId: number;
  startClient: { x: number; y: number };
  lastClient: { x: number; y: number };
  /** press point relative to the container's top-left */
  origin: { x: number; y: number };
  cells: CellBox[];
  /** true once the pointer has travelled past the threshold */
  active: boolean;
  mode: MarqueeMode;
  raf: number;
}

interface Options {
  /** the element the rectangle is drawn relative to; cells are its descendants */
  containerRef: RefObject<HTMLElement | null>;
  /** CSS selector for the cells; each must carry `data-id` */
  cellSelector: string;
  onCommit: (ids: string[], mode: MarqueeMode) => void;
  /** pixels the pointer must travel before a press becomes a drag */
  threshold?: number;
  disabled?: boolean;
}

const EDGE = 48;
const MAX_SCROLL_STEP = 24;

function intersecting(cells: CellBox[], a: { x: number; y: number }, b: { x: number; y: number }) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  const ids: string[] = [];
  for (const c of cells) {
    if (c.left < right && c.right > left && c.top < bottom && c.bottom > top) ids.push(c.id);
  }
  return { rect: { left, top, width: right - left, height: bottom - top }, ids };
}

/**
 * Rubber-band selection. Press on the mat and drag: a rectangle follows the
 * pointer, everything it touches is previewed, and releasing commits the lot.
 * Escape (or the pointer being cancelled) drops the rectangle without changing
 * anything. Holding Alt/Option while dragging removes instead of adds.
 *
 * Only mouse and pen pointers start a drag — a finger dragging on the grid
 * has to keep scrolling the page.
 */
export function useMarqueeSelection({
  containerRef,
  cellSelector,
  onCommit,
  threshold = 6,
  disabled = false,
}: Options) {
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  // Latest options, readable from listeners that were bound at press time.
  const opts = useRef({ containerRef, cellSelector, onCommit, threshold });
  opts.current = { containerRef, cellSelector, onCommit, threshold };

  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  // One stable set of window listeners so add/remove always see the same functions.
  const ctl = useRef<{
    start: (e: ReactPointerEvent<HTMLElement>) => void;
    stop: () => void;
  } | null>(null);

  if (!ctl.current) {
    const swallowNextClick = () => {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    };

    const measureCells = (): CellBox[] => {
      const { containerRef, cellSelector } = opts.current;
      const container = containerRef.current;
      if (!container) return [];
      const base = container.getBoundingClientRect();
      return Array.from(container.querySelectorAll<HTMLElement>(cellSelector)).flatMap((el) => {
        const id = el.dataset.id;
        if (!id) return [];
        const r = el.getBoundingClientRect();
        return [{
          id,
          left: r.left - base.left,
          top: r.top - base.top,
          right: r.right - base.left,
          bottom: r.bottom - base.top,
        }];
      });
    };

    const pointerInContainer = (g: Gesture) => {
      const container = opts.current.containerRef.current;
      if (!container) return g.origin;
      const base = container.getBoundingClientRect();
      return { x: g.lastClient.x - base.left, y: g.lastClient.y - base.top };
    };

    const update = (mode?: MarqueeMode) => {
      const g = gesture.current;
      if (!g || !g.active) return;
      if (mode) g.mode = mode;
      const { rect, ids } = intersecting(g.cells, g.origin, pointerInContainer(g));
      setMarquee({ rect, mode: g.mode, hits: new Set(ids) });
    };

    const autoScroll = () => {
      const g = gesture.current;
      if (!g || !g.active) return;
      const y = g.lastClient.y;
      const h = window.innerHeight;
      let dy = 0;
      if (y < EDGE) dy = -Math.min(MAX_SCROLL_STEP, (EDGE - y) / 2);
      else if (y > h - EDGE) dy = Math.min(MAX_SCROLL_STEP, (y - (h - EDGE)) / 2);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        update();
      }
      g.raf = requestAnimationFrame(autoScroll);
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      g.lastClient = { x: e.clientX, y: e.clientY };
      if (!g.active) {
        const travelled = Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y);
        if (travelled < opts.current.threshold) return;
        g.active = true;
        g.cells = measureCells();
        g.raf = requestAnimationFrame(autoScroll);
      }
      e.preventDefault();
      update(e.altKey ? "remove" : "add");
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (g.active) {
        g.lastClient = { x: e.clientX, y: e.clientY };
        const { ids } = intersecting(g.cells, g.origin, pointerInContainer(g));
        const mode: MarqueeMode = e.altKey ? "remove" : g.mode;
        if (ids.length > 0) opts.current.onCommit(ids, mode);
        // The browser follows this press with a click; it must not toggle a cell.
        swallowNextClick();
      }
      stop();
    };

    const onCancel = () => stop();

    const onKeyDown = (e: KeyboardEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (g.active) swallowNextClick();
        stop();
      } else if (e.key === "Alt") {
        update("remove");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") update("add");
    };

    // Keep the rectangle pinned under the pointer while the page scrolls under it.
    const onScroll = () => update();

    function stop() {
      const g = gesture.current;
      if (g) cancelAnimationFrame(g.raf);
      gesture.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("scroll", onScroll);
      setMarquee(null);
    }

    const start = (e: ReactPointerEvent<HTMLElement>) => {
      if (gesture.current) return;
      if (e.button !== 0) return;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (e.ctrlKey || e.metaKey) return;
      const container = opts.current.containerRef.current;
      if (!container) return;
      const base = container.getBoundingClientRect();
      gesture.current = {
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        lastClient: { x: e.clientX, y: e.clientY },
        origin: { x: e.clientX - base.left, y: e.clientY - base.top },
        cells: [],
        active: false,
        mode: e.altKey ? "remove" : "add",
        raf: 0,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onCancel);
      window.addEventListener("scroll", onScroll, { passive: true });
    };

    ctl.current = { start, stop };
  }

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    ctl.current?.start(e);
  }, [disabled]);

  /** Capture-phase click guard: swallows the click that trails a drag. */
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => () => ctl.current?.stop(), []);

  return { marquee, onPointerDown, onClickCapture };
}
