// Plays the reference video's own audio as the music, and exposes the music clock.
// Everything (reference poses, the user's frames, timing feedback) is measured on this clock,
// so slow-mo and looping "just work".
import { once } from './pose.js';

export class Player {
  constructor(video) {
    this.v = video;
    this.v.loop = false;
    this.loopCount = 0;
    this.a = 0; // loop start (s)
    this.b = null; // loop end (s), null = end of video
    this.looping = false;
    this.onLoop = null;
    this._raf = null;
    this.v.addEventListener('ended', () => this._wrap());
  }

  async load(url) {
    this.v.src = url;
    await once(this.v, 'loadedmetadata', 20000);
  }

  get loaded() { return !!this.v.src && Number.isFinite(this.v.duration); }
  get time() { return this.v.currentTime; }
  get duration() { return this.v.duration; }
  get end() { return this.b ?? this.duration; }
  get span() { return this.end - this.a; }
  get playing() { return !this.v.paused && !this.v.ended; }
  get rate() { return this.v.playbackRate; }
  /** Monotonic music time since play() was called, across loops. */
  get elapsed() { return this.loopCount * this.span + (this.time - this.a); }

  /** Slow-mo without the chipmunk/demon voice. */
  setRate(r) {
    this.v.playbackRate = r;
    this.v.preservesPitch = true;
    this.v.mozPreservesPitch = true;
    this.v.webkitPreservesPitch = true;
  }

  /** Loop a section (A-B). Pass nothing to loop the whole clip. */
  setSection(a = 0, b = null) { this.a = a; this.b = b; }

  async play({ loop = true } = {}) {
    this.looping = loop;
    this.loopCount = 0;
    this.v.currentTime = this.a;
    await this._safePlay();
    this._tick();
  }

  // Hitting stop mid-loop aborts a pending play(); that's expected, not an error.
  async _safePlay() {
    try {
      await this.v.play();
    } catch (e) {
      if (e?.name !== 'AbortError') throw e;
    }
  }

  pause() {
    this.v.pause();
    cancelAnimationFrame(this._raf);
  }

  _tick() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      if (this.b != null && this.time >= this.b) this._wrap();
      if (!this.v.paused) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _wrap() {
    this.loopCount++;
    const keepGoing = this.looping;
    this.onLoop?.(this.loopCount);
    if (keepGoing && this.looping) {
      this.v.currentTime = this.a;
      this._safePlay().catch((e) => console.warn(e));
      this._tick();
    } else {
      this.pause();
    }
  }
}
