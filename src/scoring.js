// Compare a user's take against a Dance. Works for ANY dance (generic joint-direction comparison);
// a dance can optionally name a move-specific rule set (e.g. "dougie") for extra, plain-language tips.
//
// userFrames: [{ e, t, lm }]
//   e  = elapsed music time (monotonic across loops), seconds
//   t  = position in the song when the frame was captured, seconds
//   lm = compact landmarks (see features.js)
// dance: { referenceFrames: [{ t, lm }], aspect, duration, rules? }

import { frameFeatures, smooth, flipCompact, nearestIndex, vecDistance, SEGMENTS } from './features.js';
import { dtw } from './dtw.js';
import { offsetsPerFrame, summarizeTiming } from './timing.js';
import { RULES } from './rules/index.js';

export const FPS = 15;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const EMPTY = {
  vec: new Array(SEGMENTS.length * 2).fill(NaN),
  x: {},
  present: false,
};

const refCache = new WeakMap();
function refFeatures(dance) {
  let c = refCache.get(dance);
  if (!c) {
    const frames = dance.referenceFrames;
    c = {
      normal: smooth(frames.map((f) => frameFeatures(f.lm, dance.aspect || 1))),
      flipped: smooth(frames.map((f) => frameFeatures(flipCompact(f.lm), dance.aspect || 1))),
    };
    refCache.set(dance, c);
  }
  return c;
}

/** Resample user frames onto a fixed grid of elapsed music time. Gaps become null. */
export function resampleUser(userFrames, fps = FPS) {
  const out = [];
  if (!userFrames.length) return out;
  const e0 = userFrames[0].e, e1 = userFrames[userFrames.length - 1].e;
  for (let g = e0; g <= e1 + 1e-9; g += 1 / fps) {
    const f = userFrames[nearestIndex(userFrames, g, 'e')];
    if (Math.abs(f.e - g) > 0.25) { out.push(null); continue; }
    out.push({ e: g, pos: f.t + (g - f.e), lm: f.lm });
  }
  return out;
}

/** Mean per-dimension standard deviation over dims valid in both sequences. */
function energyRatio(U, R) {
  const dims = U[0].vec.length;
  let eu = 0, er = 0, c = 0;
  for (let d = 0; d < dims; d++) {
    const su = std(U.map((f) => f.vec[d])), sr = std(R.map((f) => f.vec[d]));
    if (Number.isNaN(su) || Number.isNaN(sr)) continue;
    eu += su; er += sr; c++;
  }
  if (!c || er < 1e-3) return 1;
  return eu / er;
}
function std(arr) {
  const v = arr.filter((x) => !Number.isNaN(x));
  if (v.length < arr.length * 0.5 || v.length < 3) return NaN;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

/**
 * @param {Array} userFrames
 * @param {object} dance
 * @param {{aspect?:number, fps?:number, mirror?:'auto'|'on'|'off'}} opts
 */
export function compare(userFrames, dance, { aspect = 1, fps = FPS, mirror = 'auto' } = {}) {
  const ref = dance.referenceFrames;
  if (!ref?.length) return { error: 'no_reference' };
  const samples = resampleUser(userFrames, fps);
  if (samples.length < fps * 1.5) return { error: 'too_short' };

  const userF = smooth(samples.map((s) => (s ? frameFeatures(s.lm, aspect) : EMPTY)));
  const D = dance.duration || ref[ref.length - 1].t + 1 / fps;

  // Pair each user sample with the reference frame at the same point in the song.
  const kept = [];
  samples.forEach((s, i) => {
    if (!s || !userF[i].present) return;
    const p = ((s.pos % D) + D) % D;
    const k = nearestIndex(ref, p);
    if (Math.abs(ref[k].t - p) > 0.3) return;
    kept.push({ i, k, e: s.e });
  });
  const visibleRatio = kept.length / samples.length;
  if (kept.length < fps) return { error: 'not_visible', visibleRatio };

  const rf = refFeatures(dance);
  const U = kept.map((q) => userF[q.i]);
  const times = kept.map((q) => q.e);
  const band = Math.ceil(0.75 * fps);
  const run = (refSet, mirrored) => {
    const R = kept.map((q) => refSet[q.k]);
    const res = dtw(U.length, R.length, (i, j) => vecDistance(U[i].vec, R[j].vec), band);
    return { ...res, R, mirrored };
  };
  const candidates = [];
  if (mirror !== 'on') candidates.push(run(rf.normal, false));
  if (mirror !== 'off') candidates.push(run(rf.flipped, true));
  const best = candidates.reduce((a, b) => (b.avg < a.avg ? b : a));
  const { R, path } = best;

  // Where on the body is it off?
  const perSeg = SEGMENTS.map(() => ({ sum: 0, n: 0 }));
  const stepDist = path.map(([i, j]) => vecDistance(U[i].vec, R[j].vec, perSeg));
  const partAcc = {};
  SEGMENTS.forEach(([, , , part], s) => {
    const p = (partAcc[part] ??= { sum: 0, n: 0 });
    p.sum += perSeg[s].sum; p.n += perSeg[s].n;
  });
  const partDist = Object.fromEntries(
    Object.entries(partAcc).filter(([, v]) => v.n).map(([k, v]) => [k, v.sum / v.n]),
  );

  // Timing
  const timing = summarizeTiming(offsetsPerFrame(path, times), times, 1);
  const distByUser = new Float64Array(U.length), cntByUser = new Float64Array(U.length);
  path.forEach(([i], s) => { distByUser[i] += stepDist[s]; cntByUser[i]++; });
  const timeline = timing.windows.map(({ idx, ...w }) => ({
    ...w,
    dist: idx.reduce((a, i) => a + (cntByUser[i] ? distByUser[i] / cntByUser[i] : 0), 0) / idx.length,
  }));

  const energy = energyRatio(U, R);

  // Scores (0-100)
  const poseScore = 100 * clamp01((0.6 - best.avg) / (0.6 - 0.08));
  const timingScore = 100 * clamp01(1 - (Math.abs(timing.offset) - 0.08) / 0.5);
  const energyFactor = Math.min(1, energy / 0.7);

  const userX = U.map((f) => f.x);
  const refX = R.map((f) => f.x);
  const ctx = { user: userX, ref: refX, energy, partDist, timing, visibleRatio };
  const issues = genericIssues(ctx);
  const rules = dance.rules && RULES[dance.rules];
  const ruleIssues = rules ? rules(ctx) : [];
  issues.push(...ruleIssues);
  // Move-specific misses ("lean more") cost points too, so the score and the tips agree.
  const rulePenalty = Math.min(25, ruleIssues.filter((i) => i.kind === 'fix').reduce((a, i) => a + 10 * i.severity, 0));
  const score = Math.max(0, Math.round((0.8 * poseScore + 0.2 * timingScore) * energyFactor - rulePenalty));
  issues.sort((a, b) => (a.kind === b.kind ? b.severity - a.severity : a.kind === 'fix' ? -1 : 1));

  return {
    score,
    poseScore: Math.round(poseScore),
    timingScore: Math.round(timingScore),
    poseDist: best.avg,
    energy,
    offset: timing.offset,
    timingLabel: timing.label,
    timeline,
    partDist,
    mirrored: best.mirrored,
    visibleRatio,
    issues,
  };
}

function frac(arr, key) {
  if (!arr.length) return 0;
  return arr.filter((x) => x[key]).length / arr.length;
}

function genericIssues({ user, ref, energy, partDist, timing, visibleRatio }) {
  const out = [];
  if (visibleRatio < 0.7) out.push({ id: 'not_visible', kind: 'fix', severity: 0.9 });
  if (energy < 0.6) out.push({ id: 'low_energy', kind: 'fix', severity: clamp01(1 - energy) });
  if (timing.label !== 'on_beat') {
    out.push({ id: timing.label, kind: 'fix', severity: clamp01(Math.abs(timing.offset) / 0.5) });
  } else {
    out.push({ id: 'on_beat', kind: 'praise', severity: 0.5 });
  }
  if (frac(user, 'legsVisible') < 0.5 && frac(ref, 'legsVisible') > 0.5) {
    out.push({ id: 'legs_hidden', kind: 'fix', severity: 0.5 });
  }
  const worst = Object.entries(partDist).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] > 0.35) {
    out.push({ id: 'part_off', part: worst[0], kind: 'fix', severity: clamp01((worst[1] - 0.2) / 0.5) });
  }
  return out;
}
