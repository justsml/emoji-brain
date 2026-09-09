import React from 'react';
import { useEmojiContext } from '../context/EmojiContext';
import { Button } from '@/components/ui/button';
import { CheckSquare, Trash2, XSquare } from 'lucide-react';

const SelectionControls: React.FC = () => {
  const { selectedEmojis, filteredEmojis, selectAllVisible, deselectVisible, resetSelection } = useEmojiContext();

  const handleSelectAllVisible = () => {
    selectAllVisible(filteredEmojis);
  };

  const handleDeselectVisible = () => {
    deselectVisible(filteredEmojis);
  };

  return (
    <div className="flex gap-2 justify-center">
      <Button
        variant="outline"
        onClick={handleSelectAllVisible}
        className="text-sm"
        size="sm"
        title="Select All"
      >
        <CheckSquare className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Select All</span>
      </Button>
      <Button
        variant="outline"
        onClick={handleDeselectVisible}
        className="text-sm"
        size="sm"
        title="Deselect visible"
        aria-label="Deselect visible"
      >
        <XSquare className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Deselect visible</span>
      </Button>
      <Button
        variant="outline"
        onClick={resetSelection}
        className="text-sm"
        size="sm"
        title="Clear all selected emojis"
        aria-label="Clear all selected emojis"
        disabled={selectedEmojis.length === 0}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default SelectionControls;
