export {};
// Draw the venue sketch when it scrolls into view, and let guests replay it.
// Without JavaScript (or with reduced motion) the finished drawing is simply shown.
const art = document.querySelector<HTMLElement>('#venue-art');
const replay = document.querySelector<HTMLButtonElement>('#venue-replay');
const DRAW_MS = 3600; // last strokes start ~2.7s and take 0.9s

if (art && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let timer = 0;
  const draw = () => {
    art.classList.remove('sketch-drawing');
    void art.getBoundingClientRect(); // restart the CSS animations
    art.classList.add('sketch-drawing');
    if (replay) { replay.disabled = true; window.clearTimeout(timer); timer = window.setTimeout(() => { replay.hidden = false; replay.disabled = false; }, DRAW_MS); }
  };
  art.classList.add('sketch-pending');
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { draw(); observer.disconnect(); }
  }, { threshold: 0.35 });
  observer.observe(art);
  replay?.addEventListener('click', draw);
}
