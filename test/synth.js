// Synthetic "dancer" that produces compact landmark frames, so the scoring pipeline
// can be tested without video. Roughly a Dougie: torso leans side to side, the arm on the
// leaning side sweeps up past the head, knees bounce twice per lean cycle.

export function synthFrame(t, {
  freq = 0.5, // lean cycles per second
  lean = 14, // degrees
  arm = 1, // 0 = arms stay down, 1 = full hair-brush sweep
  bounce = 1,
  noise = 0,
  timeShift = 0, // + = dancer is ahead of the music
  rng = Math.random,
} = {}) {
  const tt = t + timeShift;
  const ph = 2 * Math.PI * freq * tt;
  const n = () => (rng() - 0.5) * 2 * noise;
  const lm = new Array(99).fill(0);
  const set = (i, x, y) => { lm[i * 3] = x + n(); lm[i * 3 + 1] = y + n(); lm[i * 3 + 2] = 0.99; };

  const torso = 0.25;
  const hip = { x: 0.5, y: 0.6 - bounce * 0.012 * (1 - Math.cos(2 * ph)) };
  const th = (lean * Math.sin(ph) * Math.PI) / 180;
  const sh = { x: hip.x + torso * Math.sin(th), y: hip.y - torso * Math.cos(th) };
  const perp = { x: Math.cos(th), y: Math.sin(th) };
  const halfSh = 0.09, halfHip = 0.06;
  // facing the camera: person's left is image-right (+x)
  const lSh = { x: sh.x + perp.x * halfSh, y: sh.y + perp.y * halfSh };
  const rSh = { x: sh.x - perp.x * halfSh, y: sh.y - perp.y * halfSh };
  set(11, lSh.x, lSh.y); set(12, rSh.x, rSh.y);
  set(23, hip.x + halfHip, hip.y); set(24, hip.x - halfHip, hip.y);
  // head follows the lean a bit extra
  const ht = th * 1.5;
  set(0, sh.x + 0.11 * Math.sin(ht), sh.y - 0.11 * Math.cos(ht));
  for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) set(i, lm[0], lm[1]);

  // arms: angle from straight-down; left arm sweeps when sin>0, right when sin<0
  const up = (s) => arm * Math.max(0, s) * Math.PI * 0.95;
  const limb = (base, ang, side, len) => ({ x: base.x + side * len * Math.sin(ang), y: base.y + len * Math.cos(ang) });
  const lEl = limb(lSh, 0.25 + up(Math.sin(ph)), 1, 0.13);
  const lWr = limb(lEl, 0.2 + up(Math.sin(ph)) * 1.25, 1, 0.12);
  const rEl = limb(rSh, 0.25 + up(-Math.sin(ph)), -1, 0.13);
  const rWr = limb(rEl, 0.2 + up(-Math.sin(ph)) * 1.25, -1, 0.12);
  set(13, lEl.x, lEl.y); set(15, lWr.x, lWr.y);
  set(14, rEl.x, rEl.y); set(16, rWr.x, rWr.y);
  for (const [i, w] of [[17, lWr], [19, lWr], [21, lWr], [18, rWr], [20, rWr], [22, rWr]]) set(i, w.x, w.y);

  // legs: knees bend with the bounce, feet planted
  const bend = bounce * 0.035 * (1 - Math.cos(2 * ph));
  set(25, hip.x + halfHip + bend, hip.y + 0.13); set(26, hip.x - halfHip - bend, hip.y + 0.13);
  set(27, 0.5 + halfHip, 0.86); set(28, 0.5 - halfHip, 0.86);
  for (const [i, a] of [[29, 27], [31, 27], [30, 28], [32, 28]]) set(i, lm[a * 3], lm[a * 3 + 1] + 0.01);
  return lm;
}

/** Reference dance built from the synthetic dancer. */
export function synthDance({ duration = 8, fps = 15, ...opts } = {}) {
  const referenceFrames = [];
  for (let t = 0; t < duration; t += 1 / fps) referenceFrames.push({ t: +t.toFixed(4), lm: synthFrame(t, opts) });
  return { id: 'dougie', name: 'the dougie', rules: 'dougie', aspect: 1, duration, referenceFrames };
}

/** A user take: frames stamped on the music clock, starting at song position `start`. */
export function synthTake({ seconds = 8, fps = 24, start = 0, duration = 8, ...opts } = {}) {
  const frames = [];
  for (let e = 0; e < seconds; e += 1 / fps) {
    const t = (start + e) % duration;
    frames.push({ e, t, lm: synthFrame(start + e, opts) });
  }
  return frames;
}

/** Deterministic RNG for repeatable tests. */
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
