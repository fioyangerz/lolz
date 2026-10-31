import { test } from 'node:test';
import assert from 'node:assert/strict';
import { band, headline, issueLine, report, practiceTip, errorLine, _internal } from '../src/voice.js';
import { compare } from '../src/scoring.js';
import { synthDance, synthTake, mulberry32 } from './synth.js';

const ISSUE_IDS = [
  'rushing', 'dragging', 'on_beat', 'low_energy', 'not_visible', 'legs_hidden', 'part_off',
  'lean_more', 'lean_good', 'arm_higher', 'arms_good', 'bounce_more', 'bounce_good', 'head_into_it',
];
const MEAN = /\b(bad|terrible|awful|ugly|fail(ed|ure)?|wrong|cringe|embarrassing|stop dancing|give up)\b/i;

test('bands', () => {
  assert.equal(band(100), 'icon');
  assert.equal(band(90), 'icon');
  assert.equal(band(80), 'ate');
  assert.equal(band(60), 'bestie');
  assert.equal(band(0), 'warmup');
});

test('every score has a headline and none are mean', () => {
  for (let s = 0; s <= 100; s += 5) {
    const h = headline(s, mulberry32(s));
    assert.ok(h && h.length > 5);
  }
  for (const lines of Object.values(_internal.HEADLINES)) for (const l of lines) assert.doesNotMatch(l, MEAN);
});

test('every issue id has lines, all encouraging', () => {
  for (const id of ISSUE_IDS) {
    const line = issueLine({ id, part: 'left arm' });
    assert.ok(line, `missing line for ${id}`);
    assert.ok(!line.includes('{part}'));
  }
  for (const lines of Object.values(_internal.LINES)) for (const l of lines) assert.doesNotMatch(l, MEAN);
  assert.match(issueLine({ id: 'part_off', part: 'left arm' }), /left arm/);
});

test('report and practice tip from a real comparison', () => {
  const dance = synthDance();
  const r = compare(synthTake({ lean: 0, arm: 0, bounce: 0 }), dance);
  const rep = report(r, { rng: mulberry32(3) });
  assert.ok(rep.headline);
  assert.ok(rep.lines.length >= 1 && rep.lines.length <= 3);
  assert.equal(rep.lines[0].kind, 'fix');
  assert.ok(practiceTip(r, mulberry32(4)));

  const good = compare(synthTake(), dance);
  const tip = practiceTip(good, mulberry32(5));
  assert.ok(tip && !/^(quick tip|psst|ok so|heads up)/.test(tip), tip);
});

test('errors have friendly lines', () => {
  for (const e of ['no_reference', 'too_short', 'not_visible', 'whatever']) assert.ok(errorLine(e));
  assert.ok(report({ error: 'too_short' }).headline);
});
