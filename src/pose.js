// MediaPipe Pose Landmarker, running fully in the browser (nothing is uploaded anywhere).
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

let filesetPromise;
const fileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL));

/** MediaPipe result -> compact [x, y, visibility] * 33 */
export function toCompact(points) {
  const out = new Array(points.length * 3);
  points.forEach((p, i) => {
    out[i * 3] = Math.round(p.x * 1e4) / 1e4;
    out[i * 3 + 1] = Math.round(p.y * 1e4) / 1e4;
    out[i * 3 + 2] = Math.round((p.visibility ?? 1) * 100) / 100;
  });
  return out;
}

/**
 * A pose tracker. Each tracker owns its own landmarker because MediaPipe VIDEO mode
 * needs strictly increasing timestamps per instance.
 */
export async function createTracker() {
  const vision = await fileset();
  const make = (delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  let landmarker;
  try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
  let last = 0;
  return {
    detect(source) {
      const ts = Math.max(last + 1, performance.now());
      last = ts;
      const res = landmarker.detectForVideo(source, ts);
      const p = res.landmarks?.[0];
      return p ? toCompact(p) : null;
    },
    close() { landmarker.close(); },
  };
}

export function once(el, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { el.removeEventListener(event, on); reject(new Error(`timeout waiting for ${event}`)); }, timeoutMs);
    function on(e) { clearTimeout(t); el.removeEventListener(event, on); resolve(e); }
    el.addEventListener(event, on);
  });
}

/**
 * Walk through a video file and extract a pose for every 1/fps seconds.
 * @returns {Promise<{frames:Array<{t:number, lm:number[]}>, duration:number, aspect:number, detectedRatio:number}>}
 */
export async function extractFromVideo(file, { fps = 15, onProgress } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await once(v, 'loadeddata', 20000);
    let duration = v.duration;
    if (!Number.isFinite(duration)) {
      // Some recorded webm files report Infinity until you seek to the end.
      v.currentTime = 1e7;
      await once(v, 'seeked');
      duration = v.duration;
    }
    const tracker = await createTracker();
    const frames = [];
    let attempts = 0;
    for (let t = 0; t < duration; t += 1 / fps) {
      attempts++;
      v.currentTime = t;
      await once(v, 'seeked');
      const lm = tracker.detect(v);
      if (lm) frames.push({ t: Math.round(t * 1000) / 1000, lm });
      onProgress?.(Math.min(1, t / duration));
    }
    tracker.close();
    return {
      frames,
      duration,
      aspect: v.videoWidth / v.videoHeight,
      detectedRatio: attempts ? frames.length / attempts : 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
