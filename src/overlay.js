// Draws the user's skeleton and the reference "ghost" dancer on the webcam canvas.
import { keypoints } from './features.js';

const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function clear(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Draw compact landmarks given in the canvas' own normalized coordinates. */
export function drawSkeleton(ctx, lm, { color = '#ffffff', glow = '#8fd0ff', width = 4, alpha = 1, minVis = 0.4 } = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const P = (i) => ({ x: lm[i * 3] * W, y: lm[i * 3 + 1] * H, v: lm[i * 3 + 2] });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  for (const [a, b] of BONES) {
    const A = P(a), B = P(b);
    if (A.v < minVis || B.v < minVis) continue;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  for (const i of JOINTS) {
    const p = P(i);
    if (p.v < minVis) continue;
    ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? width * 2.2 : width * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * Re-target a reference pose onto the user: same hip position and torso size as the user,
 * so the ghost dances "inside" them. Falls back to a centered pose if the user isn't found.
 */
export function ghostPose(refLm, refAspect, userLm, userAspect) {
  const r = keypoints(refLm, refAspect);
  const rTorso = Math.hypot(r.shMid.x - r.hipMid.x, r.shMid.y - r.hipMid.y) || 1e-6;
  let cx = 0.5 * userAspect, cy = 0.62, torso = 0.24;
  if (userLm) {
    const u = keypoints(userLm, userAspect);
    if (u.hipMid.v > 0.4 && u.shMid.v > 0.4) {
      cx = u.hipMid.x; cy = u.hipMid.y;
      torso = Math.hypot(u.shMid.x - u.hipMid.x, u.shMid.y - u.hipMid.y);
    }
  }
  const s = torso / rTorso;
  const out = new Array(refLm.length);
  for (let i = 0; i < refLm.length / 3; i++) {
    const x = refLm[i * 3] * refAspect, y = refLm[i * 3 + 1];
    out[i * 3] = (cx + (x - r.hipMid.x) * s) / userAspect;
    out[i * 3 + 1] = cy + (y - r.hipMid.y) * s;
    out[i * 3 + 2] = refLm[i * 3 + 2];
  }
  return out;
}
