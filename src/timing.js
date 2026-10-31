// Turn a DTW path into "are you rushing or dragging?".
// The user sequence and the reference sequence are sampled on the same music clock (sample k of
// both sequences belongs to the same moment of the song, at times[k]). A perfectly-timed dancer
// gives a diagonal path (i === j). If user sample i best matches a LATER reference sample j > i,
// the user is ahead of the music => rushing (positive offset, in seconds).

export const ON_BEAT_SEC = 0.12;

/** For each user sample i: mean of (times[j] - times[i]) over path steps that touch i. */
export function offsetsPerFrame(path, times) {
  const n = times.length;
  const sum = new Float64Array(n), cnt = new Float64Array(n);
  for (const [i, j] of path) { sum[i] += times[j] - times[i]; cnt[i]++; }
  return Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : 0));
}

export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {number[]} perFrame output of offsetsPerFrame
 * @param {number[]} times sample times (seconds, ascending)
 * @param {number} windowSec size of timeline windows
 */
export function summarizeTiming(perFrame, times, windowSec = 1) {
  const n = perFrame.length;
  if (!n) return { offset: 0, label: 'on_beat', windows: [] };
  // DTW paths are pinned to the corners, so ignore the edges when estimating the overall offset.
  const t0 = times[0], t1 = times[n - 1];
  const edge = Math.min(0.75, (t1 - t0) * 0.15);
  const core = perFrame.filter((_, i) => times[i] - t0 >= edge && t1 - times[i] >= edge);
  const offset = median(core.length ? core : perFrame);

  const windows = [];
  for (let start = t0; start <= t1; start += windowSec) {
    const idx = [];
    for (let i = 0; i < n; i++) if (times[i] >= start && times[i] < start + windowSec) idx.push(i);
    if (!idx.length) continue;
    const o = median(idx.map((i) => perFrame[i]));
    windows.push({ start: start - t0, end: start - t0 + windowSec, offset: o, label: timingLabel(o), idx });
  }
  return { offset, label: timingLabel(offset), windows };
}

export function timingLabel(offset) {
  if (offset > ON_BEAT_SEC) return 'rushing';
  if (offset < -ON_BEAT_SEC) return 'dragging';
  return 'on_beat';
}
