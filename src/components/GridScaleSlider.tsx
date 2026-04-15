import React from "react";
import * as Slider from "@radix-ui/react-slider";
import { useEmojiContext } from "../context/EmojiContext";
import { cn } from "../lib/utils";
import { LayoutGrid } from "lucide-react";

export const GRID_SCALES = [48, 64, 80, 96, 128, 160, 192];

const GridScaleSlider: React.FC = () => {
  const { gridScale, setGridScale } = useEmojiContext();

  return (
    <div className="flex flex-col gap-2 w-full max-w-[240px]">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 px-1">
        <div className="flex items-center gap-1.5">
          <LayoutGrid size={12} className="opacity-70" />
          <span className="font-medium tracking-tight uppercase">Scale</span>
        </div>
        <span
          key={gridScale}
          className="font-mono bg-secondary px-1.5 py-0.5 rounded tabular-nums animate-in fade-in slide-in-from-bottom-1 duration-150"
        >
          {GRID_SCALES[gridScale]}px
        </span>
      </div>
      
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5 group"
        value={[gridScale]}
        max={GRID_SCALES.length - 1}
        step={1}
        onValueChange={([val]) => setGridScale(val)}
      >
        <Slider.Track className="bg-secondary relative grow rounded-full h-[3px] transition-colors duration-150 ease-out group-hover:bg-secondary/80">
          <Slider.Range className="absolute bg-primary rounded-full h-full transition-all duration-150 ease-out" />
          <div className="absolute inset-0 flex justify-between px-[1px]">
            {GRID_SCALES.map((scale, i) => (
              <div 
                key={scale} 
                className={cn(
                  "w-[1px] h-1 mt-[1px] transition-all duration-100 ease-out",
                  i <= gridScale ? "bg-primary/40" : "bg-muted-foreground/20"
                )} 
              />
            ))}
          </div>
        </Slider.Track>
        <Slider.Thumb
          className={cn(
            "block w-4 h-4 bg-background border-2 border-primary rounded-full shadow-lg",
            "transition-all duration-100 ease-out hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary/20",
            "cursor-grab active:cursor-grabbing hover:border-primary active:scale-110"
          )}
          aria-label="Grid scale"
        />
      </Slider.Root>
    </div>
  );
};

export default GridScaleSlider;
