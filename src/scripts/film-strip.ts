export {};
// Cinematic film strip: the strip rolls sideways on its own (CSS), pauses while touched or hovered,
// can be dragged/swiped, and a tap on a frame opens that photo full screen (with next/previous).
const strip = document.querySelector<HTMLElement>('#film-strip');
const viewer = document.querySelector<HTMLDialogElement>('#film-viewer');

if (strip && viewer) {
  const track = strip.querySelector<HTMLElement>('.film-track')!;
  const img = viewer.querySelector<HTMLImageElement>('.film-viewer-img')!;
  const count = viewer.querySelector<HTMLElement>('.film-viewer-count')!;
  const photos = JSON.parse(strip.dataset.photos ?? '[]') as string[];
  let index = 0;

  // ---- Drag / swipe: shift the strip by hand on top of the rolling animation.
  let offset = 0, startX = 0, startOffset = 0, dragging = false, moved = false;
  const apply = () => { track.style.translate = `${offset}px 0`; };
  strip.addEventListener('pointerdown', e => {
    dragging = true; moved = false; startX = e.clientX; startOffset = offset;
    strip.classList.add('is-held');
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) moved = true;
    // Keep the shift within one loop of the strip so it never runs out of frames.
    const loop = track.scrollWidth / 2;
    offset = ((startOffset + dx) % loop + loop) % loop - loop / 2;
    apply();
  });
  const release = () => { if (!dragging) return; dragging = false; strip.classList.remove('is-held'); };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- Full-screen viewer.
  const show = (i: number) => {
    index = (i + photos.length) % photos.length;
    img.src = photos[index];
    count.textContent = `${index + 1} / ${photos.length}`;
  };
  track.addEventListener('click', e => {
    if (moved) return; // a drag, not a tap
    const frame = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!frame) return;
    show(Number(frame.dataset.index));
    if (typeof viewer.showModal === 'function') viewer.showModal(); else viewer.setAttribute('open', '');
  });
  viewer.querySelector('.film-prev')?.addEventListener('click', () => show(index - 1));
  viewer.querySelector('.film-next')?.addEventListener('click', () => show(index + 1));
  viewer.querySelector('.film-close')?.addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });
  viewer.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });
  // Swipe between photos in the viewer.
  let vx = 0;
  viewer.addEventListener('pointerdown', e => { vx = e.clientX; });
  viewer.addEventListener('pointerup', e => {
    const dx = e.clientX - vx;
    if (Math.abs(dx) > 50 && (e.target as HTMLElement).closest('.film-viewer-frame')) show(index + (dx < 0 ? 1 : -1));
  });
}
