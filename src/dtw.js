// Dynamic Time Warping with a Sakoe-Chiba band.
// Returns the average per-step distance along the best path AND the path itself,
// because the path is what tells us whether someone is rushing or dragging.

/**
 * @param {number} n length of sequence A (the user)
 * @param {number} m length of sequence B (the reference)
 * @param {(i:number, j:number) => number} dist distance between A[i] and B[j]
 * @param {number} band max |i - j| allowed (widened to |n - m| if needed)
 * @returns {{avg:number, path:Array<[number, number]>}}
 */
export function dtw(n, m, dist, band = Infinity) {
  if (n === 0 || m === 0) return { avg: Infinity, path: [] };
  const w = Math.max(band, Math.abs(n - m));
  const W = m + 1;
  const D = new Float64Array((n + 1) * W).fill(Infinity);
  const C = new Float64Array((n + 1) * W); // cached local cost
  D[0] = 0;
  for (let i = 1; i <= n; i++) {
    const jLo = Math.max(1, i - w), jHi = Math.min(m, i + w);
    for (let j = jLo; j <= jHi; j++) {
      const c = dist(i - 1, j - 1);
      C[i * W + j] = c;
      const best = Math.min(D[(i - 1) * W + j - 1], D[(i - 1) * W + j], D[i * W + j - 1]);
      D[i * W + j] = c + best;
    }
  }

  // backtrack
  const path = [];
  let i = n, j = m, total = 0;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    total += C[i * W + j];
    if (i === 1 && j === 1) break;
    const diag = D[(i - 1) * W + j - 1], up = D[(i - 1) * W + j], left = D[i * W + j - 1];
    if (diag <= up && diag <= left) { i--; j--; }
    else if (up <= left) i--;
    else j--;
  }
  path.reverse();
  return { avg: total / path.length, path };
}
