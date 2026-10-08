import styles from '../styles/emoji-name-scroll.css?inline';

let stylesheet: HTMLStyleElement | undefined;

/** A quiet round trip, with time to read at either end and no animation loop in JS. */
export function scrollEmojiName(label: HTMLElement): () => void {
  const text = label.firstElementChild as HTMLElement | null;
  if (!text?.animate) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animation: Animation | undefined;
  let visible = false;
  const sync = () => {
    if (visible && !document.hidden && !motion.matches) animation?.play();
    else animation?.pause();
  };
  const measure = () => {
    animation?.cancel();
    animation = undefined;
    label.classList.remove('is-scrolling');
    if (motion.matches) return;
    const distance = label.scrollWidth - label.clientWidth;
    if (distance <= 1) return;
    if (!stylesheet) {
      stylesheet = document.createElement('style');
      stylesheet.dataset.emojiNameScroll = '';
      stylesheet.textContent = styles;
      document.head.append(stylesheet);
    }
    // About 24px per second, with eased acceleration and a generous reading pause.
    const travel = Math.max(1800, distance / 24 * 1000);
    const hold = 1800;
    const duration = travel * 2 + hold * 2;
    const easing = 'cubic-bezier(0.45, 0, 0.2, 1)';
    label.classList.add('is-scrolling');
    animation = text.animate([
      { transform: 'translateX(0)', offset: 0, easing },
      { transform: `translateX(-${distance}px)`, offset: travel / duration },
      { transform: `translateX(-${distance}px)`, offset: (travel + hold) / duration, easing },
      { transform: 'translateX(0)', offset: (travel * 2 + hold) / duration },
      { transform: 'translateX(0)', offset: 1 },
    ], { duration, iterations: Infinity });
    sync();
  };
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false;
    sync();
  });
  const resize = new ResizeObserver(measure);
  intersection.observe(label);
  resize.observe(label);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', measure);
  measure();
  return () => {
    intersection.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', sync);
    motion.removeEventListener('change', measure);
    animation?.cancel();
    label.classList.remove('is-scrolling');
  };
}
