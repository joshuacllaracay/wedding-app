export {};
// RSVP photo circles: every few seconds the next photo slides in from the left (moving right)
// with a small bounce. The two circles take turns and start on different photos.
// Pauses off screen; with reduced motion the first photo simply stays.
const rings = [...document.querySelectorAll<HTMLElement>('.photo-ring')];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEP_MS = 3400;

type Ring = { track: HTMLElement; pos: number; count: number };
const setup = (ring: HTMLElement): Ring | null => {
  let photos: string[] = [];
  try { photos = JSON.parse(ring.dataset.photos ?? '[]'); } catch { return null; }
  const track = ring.querySelector<HTMLElement>('.photo-track');
  const n = photos.length;
  if (!track || n < 2) return null;
  const start = Number(ring.dataset.start) || 0;
  const order = photos.map((_, i) => photos[(start + i) % n]); // order[0] shows first, then order[1]...
  // Left to right: [order[0] (copy for a smooth loop), order[n-1], ..., order[1], order[0]].
  const strip = [order[0], ...order.slice(1).reverse(), order[0]];
  track.replaceChildren(...strip.map(src => {
    const img = document.createElement('img');
    img.src = src; img.width = 400; img.height = 400; img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    return img;
  }));
  const r: Ring = { track, pos: n, count: n };
  track.style.transition = 'none';
  track.style.transform = `translateX(-${r.pos * 100}%)`;
  // After sliding onto the copy at the far left, jump back to the real first photo unseen.
  track.addEventListener('transitionend', () => {
    if (r.pos !== 0) return;
    r.pos = r.count; track.style.transition = 'none'; track.style.transform = `translateX(-${r.pos * 100}%)`;
  });
  return r;
};
const step = (r: Ring) => {
  r.pos -= 1;
  r.track.style.transition = '';
  r.track.style.transform = `translateX(-${r.pos * 100}%)`;
};

if (rings.length && !reduced) {
  const states = rings.map(setup).filter((r): r is Ring => r !== null);
  let timers: number[] = [];
  const play = () => {
    if (timers.length) return;
    // The second circle moves half a beat after the first.
    states.forEach((r, i) => {
      const t = window.setTimeout(() => { step(r); timers[i] = window.setInterval(() => step(r), STEP_MS); }, STEP_MS / 2 + i * (STEP_MS / 2));
      timers[i] = t;
    });
  };
  const stop = () => { timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); }); timers = []; };
  let onScreen = false;
  const sync = () => (onScreen && !document.hidden ? play() : stop());
  new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); sync(); }).observe(rings[0].closest('.rsvp-photos') ?? rings[0]);
  document.addEventListener('visibilitychange', sync);
}
