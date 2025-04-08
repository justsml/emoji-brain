import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectAllVisible, resetSelection } from '../store/selectionSlice';
import { selectFilteredEmojis } from '../store/filteredEmojisSlice';
import { Button } from './ui/button';

const SelectionControls: React.FC = () => {
  const dispatch = useDispatch();
  const filteredEmojis = useSelector(selectFilteredEmojis);

  const handleSelectAllVisible = () => {
    dispatch(selectAllVisible(filteredEmojis));
  };

  const handleDeselectAll = () => {
    if (window.confirm('Are you sure you want to deselect all emojis?')) {
      dispatch(resetSelection());
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      <Button 
        variant="outline"
        onClick={handleSelectAllVisible}
        className="text-sm"
      >
        Select All Visible
      </Button>
      <Button 
        variant="outline"
        onClick={handleDeselectAll}
        className="text-sm"
      >
        Deselect All
      </Button>
    </div>
  );
};

export default SelectionControls;