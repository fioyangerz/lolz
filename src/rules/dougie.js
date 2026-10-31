// Dougie-specific checks, in dance language. Input is the time-aligned extras from scoring.js:
//   ctx.user[k], ctx.ref[k] -> { lean, headTilt, handUp, kneeBend, ... } at the same song moment.
// Output: issues [{ id, kind: 'fix'|'praise', severity 0..1 }]. Wording lives in voice.js.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function values(arr, key) {
  return arr.map((x) => x[key]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
/** 10th-90th percentile spread: how much something moves. */
function spread(arr, key) {
  const v = values(arr, key);
  return v.length < 5 ? NaN : pct(v, 0.9) - pct(v, 0.1);
}

export function dougieRules({ user, ref }) {
  const out = [];

  // 1. The lean: shoulders rocking side to side.
  const leanU = spread(user, 'lean'), leanR = spread(ref, 'lean');
  if (leanR > 4 && Number.isFinite(leanU)) {
    const r = leanU / leanR;
    if (r < 0.6) out.push({ id: 'lean_more', kind: 'fix', severity: clamp01(1 - r) });
    else if (r >= 0.85) out.push({ id: 'lean_good', kind: 'praise', severity: 0.6 });
  }

  // 2. The arm sweep / "brush your hair": hand comes up past the head.
  const handU = pct(values(user, 'handUp'), 0.9), handR = pct(values(ref, 'handUp'), 0.9);
  if (Number.isFinite(handU) && Number.isFinite(handR)) {
    const gap = handR - handU;
    if (gap > 0.25) out.push({ id: 'arm_higher', kind: 'fix', severity: clamp01(gap / 0.8) });
    else if (gap < 0.15) out.push({ id: 'arms_good', kind: 'praise', severity: 0.6 });
  }

  // 3. The bounce in the knees.
  const kneeU = spread(user, 'kneeBend'), kneeR = spread(ref, 'kneeBend');
  if (kneeR > 6 && Number.isFinite(kneeU)) {
    const r = kneeU / kneeR;
    if (r < 0.5) out.push({ id: 'bounce_more', kind: 'fix', severity: clamp01(1 - r) * 0.8 });
    else if (r >= 0.8) out.push({ id: 'bounce_good', kind: 'praise', severity: 0.5 });
  }

  // 4. Head goes with it.
  const headU = spread(user, 'headTilt'), headR = spread(ref, 'headTilt');
  if (headR > 6 && Number.isFinite(headU) && headU / headR < 0.5) {
    out.push({ id: 'head_into_it', kind: 'fix', severity: 0.3 });
  }

  return out;
}
