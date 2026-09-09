import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmojiGrid from './EmojiGrid';
import type { EmojiMetadata } from '../types/emoji';
import { render } from '../test-utils/test-utils';

if (typeof window !== 'undefined' && (!window.PointerEvent || !('pointerId' in window.PointerEvent.prototype))) {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? '';
    }
  }
  (window as any).PointerEvent = PointerEvent;
}

describe('EmojiGrid Component', () => {
  const mockEmojis: EmojiMetadata[] = [
    { id: '1', filename: 'emoji1.png', path: '/emojis/emoji1.png', categories: ['cat'], tags: ['funny'], created: '2023-01-01', size: 1024 },
    { id: '2', filename: 'emoji2.png', path: '/emojis/emoji2.png', categories: ['dog'], tags: ['cute'], created: '2023-01-02', size: 2048 },
    { id: '3', filename: 'emoji3.png', path: '/emojis/emoji3.png', categories: ['meme'], tags: ['funny', 'reaction'], created: '2023-01-03', size: 3072 },
  ];
  
  const mockOnSelectionChange = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  
  it('renders the correct number of emojis', () => {
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    expect(emojiImages).toHaveLength(mockEmojis.length);
  });
  
  it('displays emoji images with correct attributes', () => {
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    expect(emojiImages).toHaveLength(mockEmojis.length);
    
    emojiImages.forEach((img, index) => {
      expect(img).toHaveAttribute('src', mockEmojis[index].path);
      expect(img).toHaveAttribute('alt', mockEmojis[index].filename);
    });
  });
  
  it('calls onToggleSelection when an emoji is clicked', async () => {
    const mockToggle = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={mockToggle}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
    />);
    
    const emojiImages = screen.getAllByRole('img');
    await userEvent.click(emojiImages[0]);
    
    expect(mockToggle).toHaveBeenCalled();
    expect(mockToggle.mock.calls[0][0]).toEqual(mockEmojis[0]);
  });
  
  it('calls onSetFocusedIndex on keyboard navigation', async () => {
    const mockFocusChange = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={() => {}}
      onSetFocusedIndex={mockFocusChange}
      onAnnounceSelection={() => {}}
    />);
    
    const buttons = screen.getAllByRole('button', { name: /emoji/i });
    
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
  });
  
  it('calls onToggleSelection and onAnnounceSelection with Enter key', async () => {
    const mockToggle = vi.fn();
    const mockAnnounce = vi.fn();
    
    render(<EmojiGrid 
      emojis={mockEmojis} 
      selectedEmojis={[]}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={mockToggle}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={mockAnnounce}
    />);
    
    const button = screen.getByRole('button', { name: 'emoji1.png' });
    
    button.focus();
    await userEvent.keyboard('{Enter}');
    
    expect(mockToggle).toHaveBeenCalled();
  });
});

describe('EmojiGrid drag selection', () => {
  const emojis: EmojiMetadata[] = Array.from({ length: 6 }, (_, i) => ({
    id: String(i + 1), filename: `e${i + 1}.png`, path: `/emojis/e${i + 1}.png`,
    categories: [], tags: [], created: '', size: 1,
  }));

  // jsdom has no layout, so lay the six cells out as a 3×2 grid of 100px cells by hand.
  const layout = () => {
    const grid = screen.getByRole('grid');
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0, toJSON() {} });
    screen.getAllByRole('gridcell').forEach((cell, i) => {
      const left = (i % 3) * 100, top = Math.floor(i / 3) * 100;
      cell.getBoundingClientRect = () => ({ left, top, right: left + 100, bottom: top + 100, width: 100, height: 100, x: left, y: top, toJSON() {} });
    });
    return grid.parentElement!.parentElement as HTMLElement;
  };

  const pointer = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...extra } as PointerEventInit);

  const setup = (selected: EmojiMetadata[] = []) => {
    const onToggle = vi.fn(), onSelectMany = vi.fn(), onDeselectMany = vi.fn();
    render(<EmojiGrid
      emojis={emojis}
      selectedEmojis={selected}
      focusedIndex={0}
      gridScale={4}
      onToggleSelection={onToggle}
      onSetFocusedIndex={() => {}}
      onAnnounceSelection={() => {}}
      onSelectMany={onSelectMany}
      onDeselectMany={onDeselectMany}
    />);
    return { stage: layout(), onToggle, onSelectMany, onDeselectMany };
  };

  it('previews the cells under the rectangle and commits them on release', () => {
    const { stage, onSelectMany, onToggle } = setup();
    act(() => { stage.dispatchEvent(pointer('pointerdown', 10, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 150, 150)); });

    expect(screen.getByTestId('emoji-marquee')).toBeTruthy();
    expect(screen.getByTestId('emoji-marquee').textContent).toBe('+4');
    const previewed = screen.getAllByRole('button').filter(b => b.classList.contains('emoji-card-marquee-add'));
    expect(previewed.map(b => b.getAttribute('aria-label'))).toEqual(['e1.png', 'e2.png', 'e4.png', 'e5.png']);

    act(() => { window.dispatchEvent(pointer('pointerup', 150, 150)); });
    expect(onSelectMany).toHaveBeenCalledTimes(1);
    expect(onSelectMany.mock.calls[0][0].map((e: EmojiMetadata) => e.id)).toEqual(['1', '2', '4', '5']);
    expect(screen.queryByTestId('emoji-marquee')).toBeNull();

    // the click that trails the drag must not toggle the cell under the pointer
    act(() => { screen.getByRole('button', { name: 'e5.png' }).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('cancels with Escape without selecting anything', () => {
    const { stage, onSelectMany, onDeselectMany, onToggle } = setup();
    act(() => { stage.dispatchEvent(pointer('pointerdown', 10, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 250, 150)); });
    expect(screen.getByTestId('emoji-marquee').textContent).toBe('+6');

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(screen.queryByTestId('emoji-marquee')).toBeNull();
    expect(screen.getAllByRole('button').some(b => b.classList.contains('emoji-card-marquee-add'))).toBe(false);

    act(() => { window.dispatchEvent(pointer('pointerup', 250, 150)); });
    expect(onSelectMany).not.toHaveBeenCalled();
    expect(onDeselectMany).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('removes instead of adds when Alt is held', () => {
    // only e1 is selected, so a rectangle over e1+e2 can remove just one
    const { stage, onDeselectMany, onSelectMany } = setup([emojis[0]]);
    act(() => { stage.dispatchEvent(pointer('pointerdown', 10, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 150, 50, { altKey: true })); });
    expect(screen.getByTestId('emoji-marquee').textContent).toBe('−1');
    const previewed = screen.getAllByRole('button').filter(b => b.classList.contains('emoji-card-marquee-remove'));
    expect(previewed.map(b => b.getAttribute('aria-label'))).toEqual(['e1.png']);
    act(() => { window.dispatchEvent(pointer('pointerup', 150, 50, { altKey: true })); });
    expect(onDeselectMany.mock.calls[0][0].map((e: EmojiMetadata) => e.id)).toEqual(['1', '2']);
    expect(onSelectMany).not.toHaveBeenCalled();
  });

  it('treats a short press as a click, not a drag', () => {
    const { stage, onSelectMany } = setup();
    act(() => { stage.dispatchEvent(pointer('pointerdown', 10, 10)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 12, 13)); });
    expect(screen.queryByTestId('emoji-marquee')).toBeNull();
    act(() => { window.dispatchEvent(pointer('pointerup', 12, 13)); });
    expect(onSelectMany).not.toHaveBeenCalled();
  });

  it('ignores touch pointers so the page can still scroll', () => {
    const { stage } = setup();
    act(() => { stage.dispatchEvent(pointer('pointerdown', 10, 10, { pointerType: 'touch' })); });
    act(() => { window.dispatchEvent(pointer('pointermove', 150, 150, { pointerType: 'touch' })); });
    expect(screen.queryByTestId('emoji-marquee')).toBeNull();
  });
});
