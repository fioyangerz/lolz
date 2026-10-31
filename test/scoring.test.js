import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/scoring.js';
import { dtw } from '../src/dtw.js';
import { flipCompact, frameFeatures } from '../src/features.js';
import { synthDance, synthTake, synthFrame, mulberry32 } from './synth.js';

const dance = synthDance();
const ids = (r) => r.issues.map((i) => i.id);

test('dtw finds the diagonal for identical sequences and a shift for shifted ones', () => {
  const a = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0];
  const same = dtw(a.length, a.length, (i, j) => Math.abs(a[i] - a[j]));
  assert.equal(same.avg, 0);
  assert.ok(same.path.every(([i, j]) => i === j));
  const b = [0, 0, 0, 1, 2, 3, 4, 5, 4, 3, 2];
  const shifted = dtw(a.length, b.length, (i, j) => Math.abs(a[i] - b[j]), 4);
  assert.ok(shifted.path.some(([i, j]) => j - i === 2));
});

test('flipCompact mirrors and swaps left/right', () => {
  const lm = synthFrame(0.5);
  const f = flipCompact(lm);
  assert.ok(Math.abs(f[11 * 3] - (1 - lm[12 * 3])) < 1e-9);
  assert.deepEqual(flipCompact(f).map((v) => +v.toFixed(9)), lm.map((v) => +v.toFixed(9)));
});

test('features are aspect-ratio aware', () => {
  const lm = synthFrame(0.5);
  const sq = frameFeatures(lm, 1).x.lean;
  const wide = frameFeatures(lm, 16 / 9).x.lean;
  assert.ok(Math.abs(wide) > Math.abs(sq));
});

test('perfect take scores ~100 with praise', () => {
  const r = compare(synthTake({ start: 1 }), dance);
  assert.ok(r.score >= 98, `score ${r.score}`);
  assert.equal(r.timingLabel, 'on_beat');
  assert.ok(ids(r).includes('lean_good'));
});

test('noisy but correct take still scores high', () => {
  const r = compare(synthTake({ start: 2, noise: 0.008, rng: mulberry32(7) }), dance);
  assert.ok(r.score >= 90, `score ${r.score}`);
});

test('standing still scores low and gets lean / arm / energy tips', () => {
  const r = compare(synthTake({ lean: 0, arm: 0, bounce: 0 }), dance);
  assert.ok(r.score < 30, `score ${r.score}`);
  for (const id of ['lean_more', 'arm_higher', 'low_energy']) assert.ok(ids(r).includes(id), id);
});

test('detects rushing and dragging', () => {
  const ahead = compare(synthTake({ timeShift: 0.3 }), dance);
  assert.equal(ahead.timingLabel, 'rushing');
  assert.ok(ahead.offset > 0.2 && ahead.offset < 0.4, `offset ${ahead.offset}`);
  const behind = compare(synthTake({ timeShift: -0.3 }), dance);
  assert.equal(behind.timingLabel, 'dragging');
  assert.ok(ids(behind).includes('dragging'));
  assert.ok(ahead.score < 95 && ahead.score > 70);
});

test('a small lean gets flagged and costs points', () => {
  const r = compare(synthTake({ lean: 6 }), dance);
  assert.ok(ids(r).includes('lean_more'));
  assert.ok(r.score < 95);
});

test('mirror-image Dougie counts in auto mode, not when mirror is off', () => {
  const take = synthTake({ timeShift: 1 }); // half a lean cycle = the other side
  const auto = compare(take, dance);
  assert.ok(auto.mirrored);
  assert.ok(auto.score >= 95);
  const strict = compare(take, dance, { mirror: 'off' });
  assert.ok(strict.score < auto.score);
});

test('takes that loop past the end of the reference still line up', () => {
  const r = compare(synthTake({ start: 6, seconds: 6 }), dance); // wraps 8s -> 0s
  assert.ok(r.score >= 98, `score ${r.score}`);
});

test('timeline covers the take', () => {
  const r = compare(synthTake({ seconds: 6 }), dance);
  assert.ok(r.timeline.length >= 5);
  for (const w of r.timeline) assert.ok(['on_beat', 'rushing', 'dragging'].includes(w.label));
});

test('error cases', () => {
  assert.equal(compare(synthTake(), { ...dance, referenceFrames: [] }).error, 'no_reference');
  assert.equal(compare(synthTake({ seconds: 0.5 }), dance).error, 'too_short');
  const hidden = synthTake().map((f) => ({ ...f, lm: f.lm.map((v, i) => (i % 3 === 2 ? 0.1 : v)) }));
  assert.equal(compare(hidden, dance).error, 'not_visible');
});

test('legs out of frame -> legs_hidden tip, still scored', () => {
  const take = synthTake().map((f) => ({
    ...f,
    lm: f.lm.map((v, i) => (i % 3 === 2 && Math.floor(i / 3) >= 25 ? 0.1 : v)),
  }));
  const r = compare(take, dance);
  assert.ok(!r.error);
  assert.ok(ids(r).includes('legs_hidden'));
});

test('dances without a rule set still get generic feedback', () => {
  const generic = { ...synthDance(), rules: undefined };
  const r = compare(synthTake({ lean: 0, arm: 0, bounce: 0 }), generic);
  assert.ok(!ids(r).includes('lean_more'));
  assert.ok(ids(r).includes('low_energy'));
});
