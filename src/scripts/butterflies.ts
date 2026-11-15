export {};
// Ivory butterflies around the arch in the hero. After the ribbon opens, five (phones) or seven keep
// visiting: each flight has a 1-in-3 chance of landing on the "&", otherwise they land on the
// arch's flowers and vines (spots listed in the arch's data-land attribute).
// Lightweight: a few small SVGs moved with transforms, paused when off-screen or the tab is hidden.

const hero = document.querySelector<HTMLElement>('.hero');
const amp = document.querySelector<HTMLElement>('#hero-ampersand');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Point = { x: number; y: number };
type Phase = 'wait' | 'fly' | 'rest';
type Butterfly = {
  el: HTMLElement; phase: Phase; until: number;
  from: Point; c1: Point; c2: Point; to: Point; start: number; duration: number;
  pos: Point; target: 'amp' | 'vine' | 'away'; size: number; seed: number;
};

const WING = `<svg viewBox="0 0 64 48" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="bf-wing" cx="35%" cy="40%" r="75%"><stop offset="0" stop-color="#fffdf8"/><stop offset=".7" stop-color="#f6ecdc"/><stop offset="1" stop-color="#e6d3b8"/></radialGradient>
  </defs>
  <g class="bf-wing bf-left">
    <path d="M31 22 C 22 6, 6 2, 3 10 C 0 18, 12 24, 30 25 Z" fill="url(#bf-wing)" stroke="#b9967a" stroke-width=".8"/>
    <path d="M30 26 C 18 27, 8 34, 11 41 C 14 47, 25 40, 31 29 Z" fill="url(#bf-wing)" stroke="#b9967a" stroke-width=".8"/>
    <path d="M29 23 C 20 16, 12 12, 7 11 M29 27 C 22 31, 17 35, 14 39" stroke="#c9ab8e" stroke-width=".5" fill="none"/>
  </g>
  <g class="bf-wing bf-right">
    <path d="M33 22 C 42 6, 58 2, 61 10 C 64 18, 52 24, 34 25 Z" fill="url(#bf-wing)" stroke="#b9967a" stroke-width=".8"/>
    <path d="M34 26 C 46 27, 56 34, 53 41 C 50 47, 39 40, 33 29 Z" fill="url(#bf-wing)" stroke="#b9967a" stroke-width=".8"/>
    <path d="M35 23 C 44 16, 52 12, 57 11 M35 27 C 42 31, 47 35, 50 39" stroke="#c9ab8e" stroke-width=".5" fill="none"/>
  </g>
  <path d="M32 17 C 33.6 21, 33.6 31, 32 36 C 30.4 31, 30.4 21, 32 17 Z" fill="#6b4c39"/>
  <path d="M31.5 17 C 29 12, 27 10, 25 9 M32.5 17 C 35 12, 37 10, 39 9" stroke="#6b4c39" stroke-width=".6" fill="none" stroke-linecap="round"/>
</svg>`;

if (hero && amp && !reduced) {
  const layer = document.createElement('div');
  layer.className = 'butterfly-layer';
  layer.setAttribute('aria-hidden', 'true');
  hero.append(layer);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const heroRect = () => hero.getBoundingClientRect();
  const local = (x: number, y: number): Point => { const r = heroRect(); return { x: x - r.left, y: y - r.top }; };

  // Landing spot on top of the "&".
  const ampPoint = (): Point => { const r = amp.getBoundingClientRect(); return local(r.left + r.width * 0.55, r.top + r.height * 0.18); };
  // A flower or vine on any visible arch (each arch lists its spots as % of its image).
  const arches = [...hero.querySelectorAll<HTMLElement>('.arch[data-land]')].map(el => {
    let spots: [number, number][] = [];
    try { spots = JSON.parse(el.dataset.land ?? '[]'); } catch { spots = []; }
    return { el, spots };
  });
  const archPoint = (): Point | null => {
    const visibleArches = arches.filter(a => a.spots.length && a.el.offsetParent !== null);
    if (!visibleArches.length) return null;
    const busy = flock.filter(b => b.phase !== 'wait' && b.target === 'vine').map(b => b.to);
    for (let tries = 0; tries < 10; tries++) {
      const arch = visibleArches[Math.floor(Math.random() * visibleArches.length)];
      const r = arch.el.getBoundingClientRect();
      const [px, py] = arch.spots[Math.floor(Math.random() * arch.spots.length)];
      const p = local(r.left + (r.width * px) / 100, r.top + (r.height * py) / 100);
      if (!busy.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 30)) return p;
    }
    return null;
  };
  // A random point along a vine stem that is actually on screen.
  const vinePoint = (): Point | null => {
    const stems = [...hero.querySelectorAll<SVGPathElement>('.hero-flower path:first-child')];
    const width = heroRect().width;
    for (let tries = 0; tries < 12 && stems.length; tries++) {
      const path = stems[Math.floor(Math.random() * stems.length)];
      const ctm = path.getScreenCTM(); if (!ctm) continue;
      const p = path.getPointAtLength(rand(0.15, 0.95) * path.getTotalLength());
      const sp = new DOMPoint(p.x, p.y).matrixTransform(ctm);
      const lp = local(sp.x, sp.y);
      if (lp.x > 24 && lp.x < width - 24 && lp.y > 30) return lp;
    }
    return null;
  };
  // Somewhere just outside the hero, to enter from or leave to.
  const offscreen = (): Point => {
    const { width, height } = heroRect(); const side = Math.floor(Math.random() * 3);
    if (side === 0) return { x: -60, y: rand(height * 0.05, height * 0.6) };
    if (side === 1) return { x: width + 60, y: rand(height * 0.05, height * 0.6) };
    return { x: rand(width * 0.1, width * 0.9), y: -60 };
  };

  const ampBusy = () => flock.some(b => b.target === 'amp' && b.phase !== 'wait');
  const count = window.innerWidth < 600 ? 5 : 7;
  const flock: Butterfly[] = [];

  const plan = (b: Butterfly, to: Point, target: Butterfly['target'], now: number) => {
    const from = { ...b.pos };
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    const bend = Math.min(160, dist * 0.45);
    b.from = from; b.to = to; b.target = target;
    b.c1 = { x: from.x + dx * 0.3 + rand(-bend, bend), y: from.y + dy * 0.3 + rand(-bend, bend) };
    b.c2 = { x: from.x + dx * 0.7 + rand(-bend, bend), y: from.y + dy * 0.7 - rand(20, 80) };
    b.start = now; b.duration = Math.max(1600, (dist / rand(90, 140)) * 1000);
    b.phase = 'fly'; b.el.classList.remove('is-resting');
  };
  const pickDestination = (b: Butterfly, now: number) => {
    // The "&" holds one butterfly at a time, so pick it a bit more often when it's free;
    // overall about 1 in 3 landings end up on the "&".
    if (!ampBusy() && Math.random() < 0.5) { plan(b, ampPoint(), 'amp', now); return; }
    const vine = archPoint() ?? vinePoint();
    if (vine) plan(b, vine, 'vine', now); else plan(b, ampBusy() ? offscreen() : ampPoint(), ampBusy() ? 'away' : 'amp', now);
  };

  const spawn = (index: number, now: number) => {
    const el = document.createElement('div');
    el.className = 'butterfly';
    el.innerHTML = WING;
    const size = window.innerWidth < 600 ? rand(20, 26) : rand(26, 34);
    el.style.setProperty('--size', `${size}px`);
    el.style.setProperty('--flap', `${rand(0.16, 0.22)}s`);
    layer.append(el);
    const b: Butterfly = { el, phase: 'wait', until: now + index * rand(900, 1600), from: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: now, duration: 1, pos: offscreen(), target: 'away', size, seed: Math.random() * 10 };
    b.el.style.opacity = '0';
    flock.push(b);
  };

  const bezier = (t: number, a: number, b: number, c: number, d: number) => { const u = 1 - t; return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d; };
  const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  let running = false, visible = true, last = 0;
  const step = (now: number) => {
    if (!running) return;
    for (const b of flock) {
      if (b.phase === 'wait') {
        if (now < b.until) continue;
        b.pos = offscreen(); b.el.style.opacity = '1';
        pickDestination(b, now);
      }
      if (b.phase === 'fly') {
        const t = Math.min(1, (now - b.start) / b.duration), e = ease(t);
        const x = bezier(e, b.from.x, b.c1.x, b.c2.x, b.to.x);
        const y = bezier(e, b.from.y, b.c1.y, b.c2.y, b.to.y) + Math.sin(now / 160 + b.seed) * 6 * (1 - t);
        const heading = Math.atan2(y - b.pos.y, x - b.pos.x);
        b.pos = { x, y };
        const tilt = Math.max(-28, Math.min(28, (Math.cos(heading) >= 0 ? 1 : -1) * Math.sin(heading) * 30));
        b.el.style.transform = `translate(${x - b.size / 2}px, ${y - b.size * 0.75}px) rotate(${tilt}deg)`;
        if (t >= 1) {
          if (b.target === 'away') { b.phase = 'wait'; b.until = now + rand(1500, 4500); b.el.style.opacity = '0'; continue; }
          b.phase = 'rest'; b.until = now + (b.target === 'amp' ? rand(2600, 4200) : rand(2200, 5200));
          b.el.classList.add('is-resting');
          b.el.style.transform = `translate(${b.to.x - b.size / 2}px, ${b.to.y - b.size * 0.75}px) rotate(${rand(-10, 10)}deg)`;
        }
      } else if (b.phase === 'rest' && now >= b.until) {
        // Fly to a vine or away; sometimes leave the hero entirely before coming back.
        if (Math.random() < 0.45) plan(b, offscreen(), 'away', now); else pickDestination(b, now);
      }
    }
    last = now;
    requestAnimationFrame(step);
  };
  const resume = () => { if (running || !visible || document.hidden) return; running = true; requestAnimationFrame(now => {
    // After a pause, shift timers so nobody jumps.
    const gap = last ? now - last : 0; for (const b of flock) { b.start += gap; b.until += gap; }
    step(now);
  }); };
  const pause = () => { running = false; };

  const begin = () => {
    if (flock.length) return;
    const now = performance.now() + 900; // after the names have faded in
    for (let i = 0; i < count; i++) spawn(i, now);
    new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); if (visible) resume(); else pause(); }).observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    resume();
  };
  if (document.body.classList.contains('invitation-open') || !document.querySelector('#envelope-screen')) begin();
  else window.addEventListener('invitation-open', begin, { once: true });
}
