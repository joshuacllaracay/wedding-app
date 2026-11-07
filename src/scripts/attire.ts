export {};
// Attire guide carousel that loops forever: the active guide sits in the middle and the
// neighbours peek at both sides, even before the first and after the last guide.
// How it loops: the guides are copied once before and once after the real ones. When the
// guest lands on a copy, we jump (invisibly) to the matching real guide in the middle set.
const root = document.querySelector<HTMLElement>('#attire-carousel');
const track = document.querySelector<HTMLElement>('#attire-track');

if (root && track) {
  const originals = [...track.querySelectorAll<HTMLElement>('.attire-slide')];
  const count = originals.length;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.attire-tab')];
  const dots = [...root.querySelectorAll<HTMLElement>('.attire-dots span')];
  const prev = root.querySelector<HTMLButtonElement>('.attire-arrow.prev')!;
  const next = root.querySelector<HTMLButtonElement>('.attire-arrow.next')!;

  // Build copies for the looping effect. Copies are hidden from screen readers and keyboard.
  const makeCopy = (slide: HTMLElement) => {
    const copy = slide.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id'); copy.removeAttribute('role'); copy.removeAttribute('aria-roledescription'); copy.removeAttribute('aria-label');
    copy.setAttribute('aria-hidden', 'true'); copy.dataset.copy = 'true';
    copy.querySelectorAll('button').forEach(button => { button.tabIndex = -1; });
    copy.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; });
    return copy;
  };
  if (count > 1) {
    track.prepend(...originals.map(makeCopy));
    track.append(...originals.map(makeCopy));
  }
  const slides = [...track.querySelectorAll<HTMLElement>('.attire-slide')];
  const offset = count > 1 ? count : 0; // position of the first real guide
  let position = offset; // physical slide currently in the middle
  let settleTimer = 0;

  const logical = (pos: number) => ((pos - offset) % count + count) % count;
  const centerOf = (slide: HTMLElement) => slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
  const nearest = () => {
    const middle = track.scrollLeft + track.clientWidth / 2;
    let best = 0, distance = Infinity;
    slides.forEach((slide, i) => { const d = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - middle); if (d < distance) { distance = d; best = i; } });
    return best;
  };
  const show = (pos: number) => {
    position = pos;
    const index = logical(pos);
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === pos));
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  };
  // Move without animation (used for the invisible loop jump and on resize).
  const jump = (pos: number) => {
    track.classList.add('is-jumping');
    track.scrollTo({ left: centerOf(slides[pos]), behavior: 'auto' });
    show(pos);
    requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove('is-jumping')));
  };
  // Once scrolling has settled on a copy, swap to the same guide in the real set.
  const settle = () => {
    const pos = nearest();
    if (count > 1 && (pos < offset || pos >= offset + count)) jump(offset + logical(pos));
    else show(pos);
  };
  const go = (pos: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, pos));
    track.scrollTo({ left: centerOf(slides[target]), behavior: 'smooth' });
    show(target);
    // Backup in case the browser sends no scroll events (scroll events push this back).
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, 700);
  };
  track.addEventListener('scrollend', () => { window.clearTimeout(settleTimer); if (!track.classList.contains('is-jumping')) settle(); });

  track.addEventListener('scroll', () => {
    if (track.classList.contains('is-jumping')) return;
    const pos = nearest();
    if (pos !== position) show(pos);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, 140);
  }, { passive: true });
  prev.addEventListener('click', () => go(position - 1));
  next.addEventListener('click', () => go(position + 1));
  // Tabs pick the closest copy of that guide, so the slide always moves the short way.
  tabs.forEach((tab, i) => tab.addEventListener('click', () => {
    const candidates = [i, i + count, i + 2 * count].filter(p => p < slides.length);
    go(candidates.reduce((a, b) => Math.abs(b - position) < Math.abs(a - position) ? b : a));
  }));
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(position + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(position - 1); }
  });
  window.addEventListener('resize', () => jump(offset + logical(position)));
  jump(offset);

  // Tapping the middle guide opens a larger view; tapping a side guide brings it to the middle.
  const lightbox = document.querySelector<HTMLDialogElement>('#attire-lightbox');
  const image = document.querySelector<HTMLImageElement>('#attire-lightbox-image');
  const title = document.querySelector<HTMLElement>('#attire-lightbox-title');
  slides.forEach((slide, pos) => slide.querySelector<HTMLButtonElement>('.attire-zoom')?.addEventListener('click', () => {
    if (pos !== position) { go(pos); return; }
    if (!lightbox || !image || !title) return;
    const source = slide.querySelector('img')!;
    image.src = source.currentSrc || source.src; image.alt = source.alt;
    title.textContent = tabs[logical(pos)]?.textContent ?? '';
    lightbox.showModal();
  }));
  document.querySelector('#attire-lightbox-close')?.addEventListener('click', () => lightbox?.close());
  lightbox?.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
}
