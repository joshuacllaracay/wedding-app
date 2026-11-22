// The card's satin bow, drawn on a canvas so it can truly untie.
//
// The bow is the original painted image the whole time. On the tap its parts move: each tail
// is cut into thin slices that carry the painted satin along a bendable strand, and the loops
// and knot are the painted loops and knot. It unties the way a ribbon does when its tails are pulled:
//   1. both loops slip through the knot, their ribbon feeding into the tails (which lengthen),
//   2. the knot opens up and the two strands part, each one ribbon from the card's edge down
//      to its tail, smoothly connected,
//   3. the slack strands slide off both sides and fall away.
// The two sides mirror each other. If the image can't load, a drawn satin bow does the same.

type P = { x: number; y: number };
type Seg = [P, P, P, P]; // cubic bezier

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t: number) => { t = clamp01(t); return t * t; };
const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const phase = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));
const add = (a: P, x: number, y: number): P => ({ x: a.x + x, y: a.y + y });
const rotateAround = (p: P, c: P, a: number): P => {
  const s = Math.sin(a), co = Math.cos(a), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
};

const cubic = ([a, b, c, d]: Seg, t: number): P => {
  const u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y };
};
const sample = (segs: Seg[], perSeg: number): P[] => {
  const pts: P[] = [];
  segs.forEach((s, i) => { for (let k = i ? 1 : 0; k <= perSeg; k++) pts.push(cubic(s, k / perSeg)); });
  return pts;
};

// Satin colours sampled from the painted bow: shadow → champagne → bright sheen.
const STOPS: [number, [number, number, number]][] = [[0.45, [172, 128, 88]], [0.7, [203, 163, 122]], [0.9, [225, 193, 158]], [1.05, [242, 220, 192]], [1.25, [252, 243, 229]]];
const colour = (k: number) => {
  k = Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], k));
  for (let i = 1; i < STOPS.length; i++) {
    const [k1, c1] = STOPS[i];
    if (k <= k1) {
      const [k0, c0] = STOPS[i - 1], t = (k - k0) / (k1 - k0);
      return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`;
    }
  }
  return 'rgb(252,243,229)';
};
// Brightness across the ribbon's width (v = -1..1): rounded edges and a soft satin sheen.
const ACROSS = [-1, -0.8, -0.55, -0.3, -0.1, 0.15, 0.45, 0.75, 1];
const across = (v: number) => 0.84 + 0.16 * (1 - v * v) + 0.14 * Math.exp(-(((v + 0.3) / 0.28) ** 2));

type StripOpts = { width: number; shade?: (u: number, angle: number) => number; vis?: (u: number) => number; notchEnd?: boolean };

// Draws a ribbon along a centre line: one smoothly shaded slice per step.
function strip(ctx: CanvasRenderingContext2D, pts: P[], o: StripOpts) {
  const n = pts.length; if (n < 2) return;
  const nor: P[] = [], ang: number[] = [], hw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    nor.push({ x: -dy / len, y: dx / len }); ang.push(Math.atan2(dy, dx));
    hw.push((o.width / 2) * (o.vis ? o.vis(i / (n - 1)) : 1));
  }
  const at = (i: number, v: number): P => ({ x: pts[i].x + nor[i].x * hw[i] * v, y: pts[i].y + nor[i].y * hw[i] * v });
  ctx.lineJoin = 'round';
  for (let i = 0; i < n - 1; i++) {
    const along = o.shade ? o.shade(i / (n - 1), ang[i]) : 0.95 + 0.12 * Math.cos(ang[i] + 0.9); // light from the upper left
    const l0 = at(i, -1), l1 = at(i + 1, -1), r1 = at(i + 1, 1), r0 = at(i, 1);
    const g = ctx.createLinearGradient(l0.x, l0.y, r0.x, r0.y);
    for (const v of ACROSS) g.addColorStop((v + 1) / 2, colour(along * across(v)));
    ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.lineTo(r1.x, r1.y); ctx.lineTo(r0.x, r0.y); ctx.closePath();
    ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
  }
  if (o.notchEnd) { // swallowtail cut
    const i = n - 1, e = pts[i], t = { x: nor[i].y, y: -nor[i].x }, w = hw[i];
    const l = at(i, 1), r = at(i, -1);
    const tipL = { x: l.x + t.x * w * 1.1, y: l.y + t.y * w * 1.1 }, tipR = { x: r.x + t.x * w * 1.1, y: r.y + t.y * w * 1.1 };
    const mid = { x: e.x + t.x * w * 0.2, y: e.y + t.y * w * 0.2 };
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(tipL.x, tipL.y); ctx.lineTo(mid.x, mid.y); ctx.lineTo(tipR.x, tipR.y); ctx.lineTo(r.x, r.y); ctx.closePath();
    ctx.fillStyle = colour(0.96); ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,74,.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,110,74,.38)'; ctx.lineWidth = 0.8;
  for (const v of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = at(i, v); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.stroke();
  }
}

export type RibbonBow = { untie: () => Promise<void>; destroy: () => void };

export function createRibbonBow(stage: HTMLElement): RibbonBow | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas'); // the moving ribbon, composed as one layer
  const octx = off.getContext('2d');
  const tex = document.createElement('canvas'); // one tail at a time, so its top can be faded cleanly
  const tctx = tex.getContext('2d');
  if (!ctx || !octx || !tctx) return null;
  canvas.className = 'ribbon-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);

  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.offsetWidth; H = stage.offsetHeight;
    for (const c of [canvas, off, tex]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  };
  resize();

  const DURATION = 1800;
  let untieStart = 0, lastT = 0, running = false, raf = 0, done: (() => void) | null = null;

  // Until the painted bow has loaded, the plain <img> bow stays visible and the canvas is empty.
  let mode: 'wait' | 'image' | 'drawn' = 'wait';
  const art = new Image();

  // Timeline of the untie at time t (ms after the tap).
  const timeline = (t: number) => {
    const slip = 1 - ease(phase(t, 180, 880));             // loops slip through the knot
    return {
      slip,
      open: ease(phase(t, 620, 1080)),                     // the knot opens, strands part
      sink: ease(phase(t, 200, 1050)) * H * 0.055,         // the slack lets everything drop a little
      fall: phase(t, 980, DURATION),                       // strands slide off and fall
      ext: 1 - slip,                                       // ribbon fed from the loops into the tails
      // The tails are pulled: a quick grip-and-tug, then a steady pull outwards and down...
      grip: Math.sin(Math.PI * phase(t, 0, 240)),
      pull: ease(phase(t, 100, 780)),
      // ...until the knot slips free and the tension lets go.
      release: smooth(phase(t, 720, 1000)),
    };
  };
  const knotAt = (): P => ({ x: W * 0.502, y: H * 0.527 }); // the knot, as in the painted bow
  const A = 14, B = 22; // samples along the band part and the tail part of a strand
  // One continuous strand per side: from the card's edge along the band, through the knot, down the tail.
  const strandAt = (side: -1 | 1, t: number) => {
    const K = knotAt(), { open, sink, ext, grip, pull, release } = timeline(t);
    const Kc = { x: K.x + side * (W * 0.03 + open * W * 0.15), y: K.y + H * 0.012 + sink - open * H * 0.008 };
    const F = { x: side < 0 ? -W * 0.08 : W * 1.08, y: K.y - H * 0.004 + sink * 0.45 };
    // The tail end is pulled outwards and down (lengthening as the loop feeds it),
    // then swings outwards as the strands part.
    let E = {
      x: K.x + side * (W * 0.3 + ext * W * 0.04 + pull * W * 0.12 + grip * W * 0.025),
      y: H * (0.895 + ext * 0.025 + pull * 0.06 + grip * 0.012) + sink * 0.5,
    };
    E = rotateAround(E, Kc, -side * 0.3 * open);
    // While it is pulled the tail is taut: its curve straightens towards the line from knot to end.
    const taut = Math.max(grip * 0.5, pull * (1 - release));
    // The band's last stretch runs straight into the knot (a sharp bend there would crease the ribbon).
    const band: Seg = [F, { x: lerp(F.x, Kc.x, 0.4), y: lerp(F.y, Kc.y, 0.4) + H * 0.012 + sink * 0.2 }, { x: lerp(F.x, Kc.x, 0.78), y: lerp(F.y, Kc.y, 0.78) }, Kc];
    // Once the knot opens, the ribbon carries on inwards and curves down into the tail (no sharp fold).
    const c1 = add(Kc, side * W * (0.015 - 0.04 * open), H * (0.12 - 0.03 * open)), c2 = add(E, -side * W * 0.06, -H * 0.16);
    const onLine = (k: number): P => ({ x: lerp(Kc.x, E.x, k), y: lerp(Kc.y, E.y, k) });
    const tail: Seg = [Kc, { x: lerp(c1.x, onLine(0.33).x, taut), y: lerp(c1.y, onLine(0.33).y, taut) }, { x: lerp(c2.x, onLine(0.67).x, taut), y: lerp(c2.y, onLine(0.67).y, taut) }, E];
    return { Kc, pts: [...sample([band], A), ...sample([tail], B).slice(1)] };
  };
  // Falling strands slide outwards and drop, turning a little.
  const fallTransform = (g: CanvasRenderingContext2D, side: -1 | 1, fall: number, Kc: P) => {
    if (fall <= 0) return;
    const slide = easeOut(fall) * W * 0.4 * side, drop = fall * fall * H * 0.5, rot = side * 0.25 * fall;
    g.translate(Kc.x + slide, Kc.y + drop); g.rotate(rot); g.translate(-Kc.x, -Kc.y);
  };

  // The drawn ribbon at time t (used only if the painted bow image can't load).
  const ribbon = (g: CanvasRenderingContext2D, t: number) => {
    const K = knotAt();
    const tailW = W * 0.21, bandW = W * 0.11, loopW = Math.min(H * 0.088, W * 0.2);
    const { slip, open, sink, fall } = timeline(t);

    const strand = (side: -1 | 1) => {
      const { Kc, pts } = strandAt(side, t);
      const split = A / (A + B), narrow = bandW / tailW;
      g.save();
      fallTransform(g, side, fall, Kc);
      const twist = (u: number) => Math.abs(Math.cos(((u - split) / (1 - split)) * Math.PI * 1.1 + 0.3));
      strip(g, pts, {
        width: tailW, notchEnd: true,
        // Band width along the card, opening out to the tail's width (with a gentle twist) below the knot.
        vis: u => (u < split ? narrow : lerp(narrow, 1, smooth((u - split) / ((1 - split) * 0.3))) * (0.8 + 0.2 * twist(u))),
        shade: (u, a) => (0.92 + 0.12 * Math.cos(a + 0.9)) * (u < split ? 1 : 0.92 + 0.1 * twist(u)),
      });
      g.restore();
    };

    // A loop leaves the knot, swells out and returns underneath; `s` = how much is left.
    const loop = (side: -1 | 1, s: number) => {
      if (s < 0.025) return;
      const C = { x: K.x, y: K.y + sink };
      const L = W * 0.47 * s, h = H * 0.052 * (0.35 + 0.65 * s), droop = H * 0.008 * s;
      const a = add(C, side * W * 0.03, -H * 0.012), tip = add(C, side * L, -h * 0.1 + droop), b = add(C, side * W * 0.03, H * 0.014);
      const segs: Seg[] = [
        [a, add(C, side * L * 0.25, -h * 1.35), add(C, side * L * 0.9, -h * 1.45 + droop), tip],
        [tip, add(C, side * L * 1.05, h * 0.9 + droop), add(C, side * L * 0.3, h * 1.0), b],
      ];
      const cx = C.x + side * L * 0.58;
      const sh = g.createRadialGradient(cx, C.y, 0, cx, C.y, L * 0.45);
      sh.addColorStop(0, 'rgba(120,84,56,.5)'); sh.addColorStop(1, 'rgba(120,84,56,0)');
      g.fillStyle = sh; g.beginPath(); g.ellipse(cx, C.y, L * 0.45, h * 0.8, 0, 0, Math.PI * 2); g.fill();
      strip(g, sample(segs, 18), {
        width: loopW * (0.55 + 0.45 * s),
        vis: u => (0.4 + 0.6 * Math.pow(Math.sin(u * Math.PI), 0.6)) * (1 - 0.25 * Math.exp(-(((u - 0.5) / 0.09) ** 2))),
        shade: (u, ang) => (0.93 + 0.12 * Math.cos(ang + 0.9)) * (u < 0.5 ? 1.03 : 0.86 + 0.1 * u),
      });
    };

    // The knot: a gathered wrap that loosens and opens into the parting strands.
    const knot = () => {
      if (open >= 1) return;
      const C = { x: K.x, y: K.y + sink };
      const rx = W * 0.062 * (1 + 0.35 * open), ry = H * 0.031 * (1 - 0.55 * open);
      g.save(); g.globalAlpha = 1 - smooth(phase(t, 620, 800)); // gone as soon as it opens
      const gr = g.createLinearGradient(C.x - rx, C.y - ry, C.x + rx, C.y + ry);
      gr.addColorStop(0, colour(1.14)); gr.addColorStop(0.45, colour(1)); gr.addColorStop(1, colour(0.74));
      g.fillStyle = gr; g.beginPath(); g.ellipse(C.x, C.y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(150,110,74,.4)'; g.lineWidth = 0.8; g.stroke();
      g.strokeStyle = 'rgba(160,120,84,.35)';
      for (const o of [-0.5, -0.15, 0.2, 0.55]) {
        g.beginPath(); g.moveTo(C.x + rx * o - rx * 0.08, C.y - ry * 0.85); g.quadraticCurveTo(C.x + rx * o * 1.2, C.y, C.x + rx * o + rx * 0.08, C.y + ry * 0.85); g.stroke();
      }
      g.fillStyle = 'rgba(255,250,240,.35)'; g.beginPath(); g.ellipse(C.x - rx * 0.3, C.y - ry * 0.35, rx * 0.25, ry * 0.4, -0.3, 0, Math.PI * 2); g.fill();
      g.restore();
    };

    strand(-1); strand(1);
    loop(-1, slip); loop(1, slip);
    knot();
  };

  // Painted parts, cut from the bow image once it loads (polygons in % of the image).
  const LOOP = [[0, 41], [45, 41], [45, 53.5], [38, 55], [28, 57.5], [0, 58]];
  const TAIL = [[28, 57.5], [38, 55], [45, 53.5], [45.5, 68], [50.2, 78], [50.2, 100], [0, 100], [0, 58]];
  // The folded underside along the tails' inner edges, just under the knot, belongs with the knot
  // (it would otherwise be left hanging in the middle when the tails are pulled apart).
  const SLIVER = [[45, 53.5], [55.4, 53.5], [54.9, 68], [50.2, 78], [45.5, 68]];
  const KNOT = [[44, 48.5], [56.5, 48.5], [56.5, 55], [44, 55]];
  const mirror = (pts: number[][]) => pts.map(([x, y]) => [100.4 - x, y]);
  const cutOut = (polys: number[][][]) => {
    const c = document.createElement('canvas'), w = art.naturalWidth, h = art.naturalHeight;
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.beginPath();
    for (const poly of polys) poly.forEach(([x, y], i) => (i ? g.lineTo(x / 100 * w, y / 100 * h) : g.moveTo(x / 100 * w, y / 100 * h)));
    g.clip(); g.drawImage(art, 0, 0);
    return c;
  };
  let tailArt: HTMLCanvasElement | null = null, loopArt: HTMLCanvasElement | null = null, knotArt: HTMLCanvasElement | null = null;

  // Draws the triangle `s` of an image (image pixels) onto the triangle `d` (card coordinates).
  const texTri = (g: CanvasRenderingContext2D, img: CanvasImageSource, s: P[], d: P[]) => {
    const [s0, s1, s2] = s, [d0, d1, d2] = d;
    const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(den) < 1e-6) return;
    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
    const dd = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
    const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
    const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
    // Clip to the destination triangle, grown slightly so neighbouring slices meet without seams.
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const grow = (p: P) => { const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + dx / l * 1.2, y: p.y + dy / l * 1.2 }; };
    const q0 = grow(d0), q1 = grow(d1), q2 = grow(d2);
    g.save();
    g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.lineTo(q2.x, q2.y); g.closePath(); g.clip();
    g.transform(a, b, c, dd, e, f);
    const x0 = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x) - 4)), y0 = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y) - 4));
    const iw = (img as HTMLCanvasElement).width, ih = (img as HTMLCanvasElement).height;
    const x1 = Math.min(iw, Math.ceil(Math.max(s0.x, s1.x, s2.x) + 4)), y1 = Math.min(ih, Math.ceil(Math.max(s0.y, s1.y, s2.y) + 4));
    if (x1 > x0 && y1 > y0) g.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    g.restore();
  };
  // Left and right edges of a strand (half-width per point).
  const edges = (pts: P[], half: (i: number) => number, lScale: (i: number) => number = () => 1, rScale: (i: number) => number = () => 1) => {
    const n = pts.length, l: P[] = [], r: P[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = half(i);
      l.push({ x: pts[i].x - nx * w * lScale(i), y: pts[i].y - ny * w * lScale(i) }); r.push({ x: pts[i].x + nx * w * rScale(i), y: pts[i].y + ny * w * rScale(i) });
    }
    return { l, r };
  };

  const painted = (g: CanvasRenderingContext2D, t: number) => {
    if (!tailArt || !loopArt || !knotArt) return;
    const K = knotAt(), { slip, open, sink, fall } = timeline(t);
    const sx = art.naturalWidth / W, sy = art.naturalHeight / H, toImg = (p: P): P => ({ x: p.x * sx, y: p.y * sy });
    // Wide enough to carry the whole painted tail (its transparent margins draw nothing).
    const texW = W * 0.28, narrow = 0.44;
    const corner = smooth(phase(t, 500, 800));
    const half = (i: number) => (i < A ? texW * narrow : lerp(texW * narrow, texW, smooth((i - A) / (B * 0.3)))) / 2;
    for (const side of [-1, 1] as const) {
      // Once the knot opens, the inner edge of each tail is trimmed a little (the picture's folded
      // underside there would otherwise show as thin slivers). At the tap everything is exact.
      const inner = (i: number) => (i >= A ? 1 - 0.28 * corner : 1);
      const lS = side < 0 ? inner : () => 1, rS = side < 0 ? () => 1 : inner;
      const rest = edges(strandAt(side, 0).pts, half, lS, rS);
      const { Kc, pts } = strandAt(side, t), cur = edges(pts, half, lS, rS);
      g.save();
      fallTransform(g, side, fall, Kc);
      // The tail: its own painted satin, carried slice by slice along the strand, on its own layer.
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, tex.width, tex.height);
      tctx.setTransform(g.getTransform());
      for (let i = A; i < pts.length - 1; i++) {
        const s = [rest.l[i], rest.l[i + 1], rest.r[i + 1], rest.r[i]].map(toImg);
        const d = [cur.l[i], cur.l[i + 1], cur.r[i + 1], cur.r[i]];
        texTri(tctx, tailArt, [s[0], s[1], s[2]], [d[0], d[1], d[2]]);
        texTri(tctx, tailArt, [s[0], s[2], s[3]], [d[0], d[2], d[3]]);
      }
      // As the knot opens, the tail's cut top (where it was cut from the picture) fades into the band.
      if (corner > 0) {
        const r = H * 0.075, fade = tctx.createRadialGradient(Kc.x, Kc.y, 0, Kc.x, Kc.y, r);
        fade.addColorStop(0, `rgba(0,0,0,${corner})`); fade.addColorStop(0.55, `rgba(0,0,0,${corner * 0.8})`); fade.addColorStop(1, 'rgba(0,0,0,0)');
        tctx.globalCompositeOperation = 'destination-out';
        tctx.fillStyle = fade; tctx.beginPath(); tctx.arc(Kc.x, Kc.y, r, 0, Math.PI * 2); tctx.fill();
        tctx.globalCompositeOperation = 'source-over';
      }
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tex, 0, 0); g.restore();
      // The band: smooth satin in the painted bow's colours (painted texture would repeat and stripe).
      // Drawn over the tail's top, so the ribbon wraps cleanly over where the tail was cut out.
      strip(g, pts.slice(0, A + 1), { width: W * 0.125, shade: (_u, a) => 0.95 + 0.1 * Math.cos(a + 0.9) });
      g.restore();
    }
    const around = (x: number, y: number, fn: () => void) => { g.translate(x, y); fn(); g.translate(-x, -y); };
    // Loops slip into the knot.
    if (slip > 0.03) for (const side of [-1, 1] as const) {
      g.save(); g.translate(0, sink);
      around(K.x + side * W * 0.045, K.y, () => g.scale(0.06 + 0.94 * slip, 0.45 + 0.55 * slip));
      // Each loop is drawn from the half of the cut-out on its own side.
      g.beginPath(); g.rect(side < 0 ? 0 : K.x, 0, side < 0 ? K.x : W - K.x, H); g.clip();
      g.drawImage(loopArt, 0, 0, W, H);
      g.restore();
    }
    // The knot loosens and opens.
    const kFade = 1 - smooth(phase(t, 620, 800));
    if (kFade > 0) {
      g.save(); g.globalAlpha = kFade; g.translate(0, sink);
      around(K.x, K.y, () => g.scale(1 + 0.35 * open, 1 - 0.55 * open));
      g.drawImage(knotArt, 0, 0, W, H);
      g.restore();
    }
  };

  const render = (t = lastT) => {
    if (mode === 'wait') return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A small tug on tap; the whole bow tightens for a moment.
    const tug = Math.sin(Math.PI * phase(t, 0, 260)) * 0.6, sc = 1 - 0.035 * tug;
    const Kx = W * 0.502 * dpr, Ky = H * 0.527 * dpr;
    ctx.setTransform(sc, 0, 0, sc, Kx - Kx * sc, Ky - Ky * sc);
    if (mode === 'image' && t <= 0) {
      // At rest: the painted bow itself.
      ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    } else {
      // Moving: the painted bow's parts (or the drawn bow if the image couldn't load).
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, W, H);
      if (mode === 'image') painted(octx, t); else ribbon(octx, t);
      ctx.drawImage(off, 0, 0);
    }
    // Fade the whole layer at the end.
    canvas.style.opacity = String(1 - easeIn(phase(t, 1400, DURATION)));
  };

  const ready = (m: 'image' | 'drawn') => { mode = m; stage.classList.add('has-ribbon-canvas'); render(); };
  art.onload = () => {
    tailArt = cutOut([TAIL, mirror(TAIL)]); loopArt = cutOut([LOOP, mirror(LOOP)]); knotArt = cutOut([KNOT, SLIVER]);
    ready('image');
  };
  art.onerror = () => ready('drawn');
  art.src = stage.querySelector<HTMLImageElement>('.bow-art')?.currentSrc || '/ribbon/bow.webp';

  const ro = new ResizeObserver(() => { resize(); if (!running) render(); });
  ro.observe(stage);

  const frame = (now: number) => {
    if (!running) return;
    lastT = now - untieStart;
    render(lastT);
    if (lastT >= DURATION) { running = false; done?.(); return; }
    raf = requestAnimationFrame(frame);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    untie: () => new Promise<void>(resolve => {
      // Reduced motion, or tapped before the painted bow loaded: skip straight to opening the card.
      if (reduced || mode === 'wait') { canvas.style.opacity = '0'; resolve(); return; }
      let finished = false;
      const finish = () => { if (finished) return; finished = true; stop(); canvas.style.opacity = '0'; resolve(); };
      untieStart = performance.now(); done = finish;
      running = true; raf = requestAnimationFrame(frame);
      // Safety net: open the card on time even if the browser pauses animation frames.
      window.setTimeout(finish, DURATION + 400);
    }),
    destroy: () => { stop(); ro.disconnect(); canvas.remove(); },
  };
}
