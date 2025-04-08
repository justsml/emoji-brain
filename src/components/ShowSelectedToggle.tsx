import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setShowSelectedOnly, selectShowSelectedOnly } from '../store/filteredEmojisSlice';

const ShowSelectedToggle: React.FC = () => {
  const dispatch = useDispatch();
  const showSelectedOnly = useSelector(selectShowSelectedOnly);

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="show-selected-only"
        checked={showSelectedOnly}
        onChange={(e) => dispatch(setShowSelectedOnly(e.target.checked))}
        className="h-4 w-4 rounded border-gray-300"
      />
      <label htmlFor="show-selected-only" className="text-sm text-muted-foreground">
        Show selected only
      </label>
    </div>
  );
};

export default ShowSelectedToggle;