import { describe, expect, it } from "vitest";
import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";
import { eraserInkButton, eraserPencilButton, ghostIconButton, sheetToolButton } from "./buttonClasses";

describe("precomputed button classes", () => {
  it("match what <Button> would have rendered", () => {
    expect(ghostIconButton).toBe(cn(buttonVariants({ variant: "ghost", size: "icon" })));
    expect(sheetToolButton()).toBe(cn(buttonVariants({ variant: "ghost", size: "sm", className: "sheet-tool h-9 w-9 p-0" })));
    expect(sheetToolButton("sheet-share")).toBe(cn(buttonVariants({ variant: "ghost", size: "sm", className: "sheet-tool sheet-share h-9 w-9 p-0" })));
    expect(eraserPencilButton).toBe(cn(buttonVariants({ className: "sheet-eraser sheet-eraser-pencil h-9 gap-2 rounded-r-none px-4 font-semibold" })));
    expect(eraserInkButton).toBe(cn(buttonVariants({ className: "sheet-eraser sheet-eraser-ink h-9 w-8 rounded-l-none p-0" })));
  });

  it("only reorders the Select All flash, which no utility conflicts with", () => {
    const flashing = cn(buttonVariants({ variant: "ghost", size: "sm", className: "sheet-tool h-9 w-9 p-0 sheet-flash" }));
    expect(sheetToolButton("sheet-flash").split(" ").sort()).toEqual(flashing.split(" ").sort());
  });
});
