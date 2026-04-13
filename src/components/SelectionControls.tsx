import React from 'react';
import { useEmojiContext } from '../context/EmojiContext';
import { Button } from '@/components/ui/button';
import { CheckSquare, XSquare } from 'lucide-react';

const SelectionControls: React.FC = () => {
  const { selectedEmojis, filteredEmojis, toggleEmojiSelection, resetSelection } = useEmojiContext();

  const handleSelectAllVisible = () => {
    const allFiltered = filteredEmojis;
    allFiltered.forEach((emoji) => {
      if (!selectedEmojis.some((e) => e.id === emoji.id)) {
        toggleEmojiSelection(emoji);
      }
    });
  };

  const handleDeselectAll = () => {
    if (window.confirm('Are you sure you want to deselect all emojis?')) {
      resetSelection();
    }
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
        onClick={handleDeselectAll}
        className="text-sm"
        size="sm"
        title="Deselect All"
      >
        <XSquare className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Deselect All</span>
      </Button>
    </div>
  );
};

export default SelectionControls;
