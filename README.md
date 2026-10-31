# dougie coach 💅

A webcam dance coach that rates your Dougie and hypes you up in Gen Z slang. It runs
entirely in your browser: pose tracking happens on your laptop, so your video never goes anywhere.

## Run it

```bash
npm install
npm run dev      # open the printed http://localhost:5173
npm test         # scoring + voice unit tests
npm run build    # static site in dist/ (deployable to GitHub Pages, Netlify, ...)
```

The camera needs `localhost` or `https`.

## How to use

1. **Drop the reference.** Upload a video of a good Dougie, with the song. The app learns the
   moves from it and uses **its audio as your music**, so you don't need to re-record anything.
   The reference is saved on your device (IndexedDB), so it's there next time.
2. **Practice.** The song loops, a ghost skeleton dances inside your outline, and about every
   10 seconds of music you get one tip (spoken out loud if you like). Slow it down to 0.75× or
   0.5× without the pitch changing.
3. **Showtime ✨.** After a 3-2-1 countdown you dance 1 or 2 reps at full speed, then you get a
   score, a few tips, a rushing/dragging meter, and a per-second timeline.

## How it works

```
reference video ──► MediaPipe Pose (per frame) ──► Dance JSON  ─┐
                                                                ├─► scoring ──► issues ──► voice (slang)
webcam ─────────► MediaPipe Pose, stamped with the music clock ─┘
```

- **One clock.** Reference poses and your frames are both stamped with the song position, so
  "where should I be right now" is a direct lookup, and slow-mo and looping need no special handling.
- **Generic scoring** (`src/scoring.js`) compares the direction of 10 body segments (torso, head,
  upper and lower arms and legs) after **DTW** alignment. Nothing in it is Dougie-specific.
- **Timing** (`src/timing.js`): the DTW warping path shows whether you're ahead of the
  reference (rushing) or behind it (dragging), overall and per second.
- **Move rules** (`src/rules/dougie.js`) add dance-language checks: lean, hair-brush arm
  sweep, knee bounce, head. They also cost points so the score and the tips agree.
- **Either side counts.** If you Dougie mirror-image, it's matched against a flipped reference automatically.
- **Voice** (`src/voice.js`) is the only place wording lives. Scoring emits plain
  `{ id, kind, severity }` issues, and the voice turns them into "OKAY ICON 💅" or "diva you're a little
  too slow". It stays encouraging in every score band, and a unit test checks for mean words.

## Adding more dances later (TikTok choreo, etc.)

A dance is just data (`dances/*.json`):

```json
{ "id": "dougie", "name": "the dougie", "rules": "dougie", "aspect": 1.78, "duration": 6.0,
  "referenceFrames": [{ "t": 0.0, "lm": [x, y, visibility, ... 33 points] }], "segments": [] }
```

Any uploaded choreo works with the generic scorer and timing timeline as-is. A `rules` entry is
optional, for extra move-specific tips. Next steps: a dance picker, trimming and A-B section loops
in the UI (`Player.setSection` already supports them), and per-segment ("counts of 8") reviews.

## Files

| file | what |
| --- | --- |
| `src/pose.js` | MediaPipe setup, video → pose extraction |
| `src/features.js` | landmarks → segment directions + Dougie extras (lean, arm height, knee bend) |
| `src/dtw.js`, `src/timing.js`, `src/scoring.js` | alignment, rushing/dragging, scores + issues |
| `src/rules/` | move-specific rule sets |
| `src/voice.js` | the hype voice + text-to-speech |
| `src/player.js` | reference audio/video: looping, slow-mo, music clock |
| `src/modes/` | live webcam session, practice mode, showtime mode |
| `src/overlay.js` | your skeleton + the ghost dancer |
| `src/dances.js` | built-in dances + saving yours to IndexedDB |
