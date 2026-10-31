// Pose features. Landmarks are stored "compact": a flat array of 33 * [x, y, visibility],
// with x/y normalized to the video frame (0..1) exactly as MediaPipe returns them.
// `aspect` (width / height) is used to undo the non-square normalization before measuring angles.

export const LM = {
  nose: 0,
  lSh: 11, rSh: 12,
  lEl: 13, rEl: 14,
  lWr: 15, rWr: 16,
  lHip: 23, rHip: 24,
  lKnee: 25, rKnee: 26,
  lAnk: 27, rAnk: 28,
};

// Body segments whose direction we compare. [name, from, to, bodyPart]
export const SEGMENTS = [
  ['torso', 'hipMid', 'shMid', 'torso'],
  ['head', 'shMid', 'nose', 'head'],
  ['left upper arm', 'lSh', 'lEl', 'left arm'],
  ['left forearm', 'lEl', 'lWr', 'left arm'],
  ['right upper arm', 'rSh', 'rEl', 'right arm'],
  ['right forearm', 'rEl', 'rWr', 'right arm'],
  ['left thigh', 'lHip', 'lKnee', 'left leg'],
  ['left shin', 'lKnee', 'lAnk', 'left leg'],
  ['right thigh', 'rHip', 'rKnee', 'right leg'],
  ['right shin', 'rKnee', 'rAnk', 'right leg'],
];

export const VIS = 0.5;

// Left/right landmark pairs in MediaPipe's 33-point model, used for mirroring.
const LR_PAIRS = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18],
  [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];
const MIRROR_INDEX = (() => {
  const m = Array.from({ length: 33 }, (_, i) => i);
  for (const [a, b] of LR_PAIRS) { m[a] = b; m[b] = a; }
  return m;
})();

/** Mirror a compact landmark frame horizontally (and swap left/right joints). */
export function flipCompact(lm) {
  const out = new Array(lm.length);
  for (let i = 0; i < 33; i++) {
    const src = MIRROR_INDEX[i];
    out[i * 3] = 1 - lm[src * 3];
    out[i * 3 + 1] = lm[src * 3 + 1];
    out[i * 3 + 2] = lm[src * 3 + 2];
  }
  return out;
}

function pt(lm, i, aspect) {
  return { x: lm[i * 3] * aspect, y: lm[i * 3 + 1], v: lm[i * 3 + 2] ?? 1 };
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) };
}

export function keypoints(lm, aspect = 1) {
  const k = {};
  for (const [name, i] of Object.entries(LM)) k[name] = pt(lm, i, aspect);
  k.shMid = mid(k.lSh, k.rSh);
  k.hipMid = mid(k.lHip, k.rHip);
  k.ankMid = mid(k.lAnk, k.rAnk);
  return k;
}

const deg = (r) => (r * 180) / Math.PI;
function jointAngle(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1e-9;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))));
}
const visible = (...ps) => ps.every((p) => p.v >= VIS);

/**
 * Features for one frame.
 * - vec: unit direction (dx, dy) of each SEGMENT (NaN when not visible) — generic, works for any dance.
 * - x: interpretable extras used by move-specific rules (lean, arm height, knee bend...).
 * - present: whether the core body (shoulders + hips) was found.
 */
export function frameFeatures(lm, aspect = 1) {
  const k = keypoints(lm, aspect);
  const vec = new Array(SEGMENTS.length * 2);
  SEGMENTS.forEach(([, a, b], s) => {
    const A = k[a], B = k[b];
    if (!visible(A, B)) { vec[2 * s] = NaN; vec[2 * s + 1] = NaN; return; }
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    vec[2 * s] = dx / len;
    vec[2 * s + 1] = dy / len;
  });

  const present = visible(k.lSh, k.rSh, k.lHip, k.rHip);
  const torso = Math.hypot(k.shMid.x - k.hipMid.x, k.shMid.y - k.hipMid.y) || 1e-9;
  const legsVisible = visible(k.lKnee, k.rKnee, k.lAnk, k.rAnk);

  const wrist = (w, el) => (visible(w, el) ? (k.shMid.y - w.y) / torso : NaN);
  const wristL = wrist(k.lWr, k.lEl);
  const wristR = wrist(k.rWr, k.rEl);

  const x = {
    // + = shoulders shifted toward image-right of hips
    lean: present ? deg(Math.atan2(k.shMid.x - k.hipMid.x, k.hipMid.y - k.shMid.y)) : NaN,
    shoulderTilt: visible(k.lSh, k.rSh) ? deg(Math.atan2(k.lSh.y - k.rSh.y, k.lSh.x - k.rSh.x)) : NaN,
    headTilt: visible(k.nose, k.lSh, k.rSh) ? deg(Math.atan2(k.nose.x - k.shMid.x, k.shMid.y - k.nose.y)) : NaN,
    wristL,
    wristR,
    // height of the higher hand above the shoulder line, in torso lengths
    handUp: Number.isNaN(wristL) ? wristR : Number.isNaN(wristR) ? wristL : Math.max(wristL, wristR),
    kneeBend: legsVisible
      ? 180 - (jointAngle(k.lHip, k.lKnee, k.lAnk) + jointAngle(k.rHip, k.rKnee, k.rAnk)) / 2
      : NaN,
    hipShift: present && legsVisible ? (k.hipMid.x - k.ankMid.x) / torso : NaN,
    legsVisible: legsVisible ? 1 : 0,
  };
  return { vec, x, present };
}

/** Moving-average smoothing over +-radius frames, ignoring NaN. */
export function smooth(feats, radius = 1) {
  const n = feats.length;
  return feats.map((f, i) => {
    const lo = Math.max(0, i - radius), hi = Math.min(n - 1, i + radius);
    const vec = f.vec.map((_, d) => avg(feats, lo, hi, (g) => g.vec[d]));
    const x = {};
    for (const key of Object.keys(f.x)) x[key] = avg(feats, lo, hi, (g) => g.x[key]);
    // re-normalize segment directions
    for (let s = 0; s < vec.length; s += 2) {
      const len = Math.hypot(vec[s], vec[s + 1]);
      if (len > 0) { vec[s] /= len; vec[s + 1] /= len; }
    }
    return { vec, x, present: f.present };
  });
}
function avg(arr, lo, hi, get) {
  let s = 0, c = 0;
  for (let j = lo; j <= hi; j++) { const v = get(arr[j]); if (!Number.isNaN(v)) { s += v; c++; } }
  return c ? s / c : NaN;
}

/** Index of the frame nearest to time t (frames sorted by .t). */
export function nearestIndex(frames, t, key = 't') {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (frames[m][key] < t) lo = m + 1; else hi = m;
  }
  if (lo > 0 && Math.abs(frames[lo - 1][key] - t) <= Math.abs(frames[lo][key] - t)) return lo - 1;
  return lo;
}

/** Distance between two segment-direction vectors: mean chord length over segments visible in both. */
export function vecDistance(a, b, perSegment) {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i += 2) {
    if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);
    if (perSegment) { perSegment[i >> 1].sum += d; perSegment[i >> 1].n++; }
    s += d; c++;
  }
  return c ? s / c : 1;
}
