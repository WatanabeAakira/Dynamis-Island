const HIDE_DELAY = 1000;
const hideTimers = new WeakMap();

function revealDuringScroll(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  target.setAttribute('data-island-scrolling', 'true');
  clearTimeout(hideTimers.get(target));
  const timer = setTimeout(() => {
    target.removeAttribute('data-island-scrolling');
    hideTimers.delete(target);
  }, HIDE_DELAY);
  hideTimers.set(target, timer);
}

// Scroll events do not bubble, so capture them once for every native scroll container.
document.addEventListener('scroll', revealDuringScroll, { capture: true, passive: true });
