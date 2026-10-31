// The live loop shared by both modes: read the webcam, find the pose, stamp it with the
// music clock, draw the user + ghost skeletons.
import { drawSkeleton, ghostPose, clear } from '../overlay.js';
import { nearestIndex } from '../features.js';

export class LiveSession {
  /**
   * @param {{tracker, cam:HTMLVideoElement, canvas:HTMLCanvasElement, player, getDance:()=>object, showGhost:()=>boolean}} o
   */
  constructor({ tracker, cam, canvas, player, getDance, showGhost }) {
    Object.assign(this, { tracker, cam, canvas, player, getDance, showGhost });
    this.ctx = canvas.getContext('2d');
    this.frames = [];
    this.recording = false;
    this.onFrame = null;
    this.running = false;
    this.lastLm = null;
  }

  get aspect() { return this.cam.videoWidth / this.cam.videoHeight || 16 / 9; }

  start() {
    if (this.running) return;
    this.running = true;
    const useRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    const loop = (now, meta) => {
      if (!this.running) return;
      this._process(meta);
      if (useRvfc) this.cam.requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };
    if (useRvfc) this.cam.requestVideoFrameCallback(loop);
    else requestAnimationFrame(loop);
  }

  stop() { this.running = false; clear(this.ctx); }

  take() { const f = this.frames; this.frames = []; return f; }

  /** Keep only the most recent `seconds` of music time. */
  trim(seconds) {
    const cutoff = this.player.elapsed - seconds;
    let i = 0;
    while (i < this.frames.length && this.frames[i].e < cutoff) i++;
    if (i) this.frames.splice(0, i);
  }

  _process(meta) {
    const { cam, canvas, ctx, player } = this;
    if (!cam.videoWidth) return;
    if (canvas.width !== cam.videoWidth) { canvas.width = cam.videoWidth; canvas.height = cam.videoHeight; }

    const lm = this.tracker.detect(cam);
    this.lastLm = lm;

    // Stamp with the song position at the moment the camera captured the frame.
    let lag = 0;
    if (meta?.captureTime) lag = Math.min(0.3, Math.max(0, (performance.now() - meta.captureTime) / 1000));
    lag *= player.rate || 1;

    if (lm && this.recording && player.playing) {
      this.frames.push({ e: player.elapsed - lag, t: player.time - lag, lm });
    }

    clear(ctx);
    const dance = this.getDance();
    if (this.showGhost() && dance?.referenceFrames?.length && player.loaded) {
      const ref = dance.referenceFrames[nearestIndex(dance.referenceFrames, player.time)];
      drawSkeleton(ctx, ghostPose(ref.lm, dance.aspect, lm, this.aspect), {
        color: '#bfe6ff', glow: '#3b8fd1', alpha: 0.55, width: 5,
      });
    }
    if (lm) drawSkeleton(ctx, lm, { color: '#ffffff', glow: '#8fd0ff', width: 4 });
    this.onFrame?.(lm);
  }
}
