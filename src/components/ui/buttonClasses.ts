/**
 * The tray's button classes, resolved ahead of time.
 *
 * `<Button>` (./button.tsx) merges its variant classes with the caller's via
 * tailwind-merge, a 27 KB runtime that the always-rendered tray pulled onto the
 * critical path just to resolve these few fixed combinations. They are spelled
 * out here instead; buttonClasses.test.ts checks each one against
 * `cn(buttonVariants(...))`, so the markup stays identical.
 */
const BASE = "inline-flex items-center justify-center whitespace-nowrap";
const FOCUS = "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const GHOST = "hover:bg-accent hover:text-accent-foreground";
const PRIMARY = "bg-primary text-primary-foreground shadow hover:bg-primary/90";

/** variant="ghost" size="icon" */
export const ghostIconButton = `${BASE} rounded-md text-sm font-medium ${FOCUS} ${GHOST} h-9 w-9`;
/** variant="ghost" size="sm" className="sheet-tool h-9 w-9 p-0" */
export const sheetToolButton = (extra = "") =>
  `${BASE} font-medium ${FOCUS} ${GHOST} rounded-md text-xs sheet-tool${extra ? ` ${extra}` : ""} h-9 w-9 p-0`;
/** className="sheet-eraser sheet-eraser-pencil h-9 gap-2 rounded-r-none px-4 font-semibold" */
export const eraserPencilButton = `${BASE} rounded-md text-sm ${FOCUS} ${PRIMARY} py-2 sheet-eraser sheet-eraser-pencil h-9 gap-2 rounded-r-none px-4 font-semibold`;
/** className="sheet-eraser sheet-eraser-ink h-9 w-8 rounded-l-none p-0" */
export const eraserInkButton = `${BASE} rounded-md text-sm font-medium ${FOCUS} ${PRIMARY} sheet-eraser sheet-eraser-ink h-9 w-8 rounded-l-none p-0`;
