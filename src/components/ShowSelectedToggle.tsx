import React from 'react';
import { useEmojiContext } from '../context/EmojiContext';

/**
 * Two-state filter over the sheet. Showing the collected count here means the
 * toolbar answers "how many have I picked?" without looking at the tray.
 */
const ShowSelectedToggle: React.FC = () => {
  const { showSelectedOnly, setShowSelectedOnly, selectedEmojis } = useEmojiContext();

  return (
    <fieldset className="segmented">
      <legend className="sr-only">Which emojis to show</legend>
      <label>
        <input
          type="radio"
          name="sheet-filter"
          checked={!showSelectedOnly}
          onChange={() => setShowSelectedOnly(false)}
        />
        Everything
      </label>
      <label>
        <input
          type="radio"
          id="show-selected-only"
          name="sheet-filter"
          checked={showSelectedOnly}
          onChange={() => setShowSelectedOnly(true)}
        />
        Collected
        <span className="segmented-count">{selectedEmojis.length}</span>
      </label>
    </fieldset>
  );
};

export default ShowSelectedToggle;
