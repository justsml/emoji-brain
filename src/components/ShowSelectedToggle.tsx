import React from 'react';
import { useEmojiContext } from '../context/EmojiContext';

const ShowSelectedToggle: React.FC = () => {
  const { showSelectedOnly, setShowSelectedOnly } = useEmojiContext();

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="show-selected-only"
        checked={showSelectedOnly}
        onChange={(e) => setShowSelectedOnly(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <label htmlFor="show-selected-only" className="text-sm text-muted-foreground">
        Show selected only
      </label>
    </div>
  );
};

export default ShowSelectedToggle;
