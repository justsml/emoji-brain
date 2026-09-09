import React from "react";
import { useEmojiContext } from "../context/EmojiContext";

/** Tile widths, in px, for each step of the size control. */
export const GRID_SCALES = [76, 108, 148, 208];

const SIZE_LABELS = ["S", "M", "L", "XL"];
const SIZE_NAMES = ["Small", "Medium", "Large", "Extra large"];

const GridScaleSlider: React.FC = () => {
  const { gridScale, setGridScale } = useEmojiContext();

  return (
    <fieldset className="segmented segmented-size">
      <legend className="sr-only">Sticker size</legend>
      {SIZE_LABELS.map((label, index) => (
        <label key={label} title={SIZE_NAMES[index]}>
          <input
            type="radio"
            name="grid-scale"
            value={index}
            checked={gridScale === index}
            onChange={() => setGridScale(index)}
          />
          <span aria-hidden="true">{label}</span>
          <span className="sr-only">{SIZE_NAMES[index]}</span>
        </label>
      ))}
    </fieldset>
  );
};

export default GridScaleSlider;
