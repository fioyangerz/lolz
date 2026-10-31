import './style.css';
import { createTracker, extractFromVideo } from './pose.js';
import { Player } from './player.js';
import { loadDance, saveDance, BUILTIN } from './dances.js';
import { LiveSession } from './modes/session.js';
import { startPractice } from './modes/practice.js';
import { startShowtime } from './modes/showtime.js';
import { errorLine } from './voice.js';
import { FPS } from './scoring.js';

const $ = (id) => document.getElementById(id);

const player = new Player($('refVideo'));
let dance = null;
let session = null;
let trackerPromise = null;
let stopMode = null;
let busy = false;

const settings = {
  voice: () => $('voice').checked,
  reps: () => Number($('reps').value),
  speed: () => Number($('speed').value),
  ghost: () => $('ghost').checked,
};

let toastTimer;
const ui = {
  status(text) { $('modeStatus').textContent = text; },
  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth; // restart the drop-in animation
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 5000);
  },
  countdown(text) {
    const c = $('countdown');
    if (!text) { c.hidden = true; return; }
    c.hidden = false;
    c.textContent = text;
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
  },
  showResults(result, rep) { renderResults(result, rep); },
  done() {
    stopMode = null;
    setRunning(null);
    ui.status('wanna run it back? 🔁');
  },
};

function refStatus(text) { $('refStatus').textContent = text; }

function setRunning(mode) {
  $('practiceBtn').classList.toggle('active', mode === 'practice');
  $('showtimeBtn').classList.toggle('active', mode === 'showtime');
  $('stopBtn').disabled = !mode;
  $('refInput').disabled = !!mode;
}

function updateReady() {
  const ready = !!dance?.referenceFrames?.length && player.loaded;
  $('refEmpty').hidden = ready;
  $('practiceBtn').disabled = !ready || busy;
  $('showtimeBtn').disabled = !ready || busy;
  if (ready) {
    refStatus(`reference locked in ✨ ${dance.duration.toFixed(1)}s, ${dance.referenceFrames.length} poses`);
  }
}

async function boot() {
  const { dance: d, video } = await loadDance('dougie');
  dance = d;
  if (video && d.referenceFrames.length) {
    await player.load(URL.createObjectURL(video));
  } else {
    refStatus('no reference yet, drop a Dougie video to start ✨');
  }
  player.setRate(settings.speed());
  updateReady();
}

async function handleReference(file) {
  if (!file) return;
  stopCurrent();
  busy = true;
  updateReady();
  $('progress').hidden = false;
  $('progressBar').style.width = '0%';
  refStatus('loading the pose model…');
  try {
    const res = await extractFromVideo(file, {
      fps: FPS,
      onProgress: (p) => {
        $('progressBar').style.width = `${Math.round(p * 100)}%`;
        refStatus(`learning the moves… ${Math.round(p * 100)}%`);
      },
    });
    if (res.frames.length < FPS * 2) {
      refStatus("couldn't find a dancer in that one 😵 try a clip where the whole body is in frame");
      return;
    }
    dance = {
      ...structuredClone(BUILTIN.dougie),
      referenceFrames: res.frames,
      aspect: res.aspect,
      duration: res.duration,
      source: file.name,
    };
    await saveDance(dance, file);
    await player.load(URL.createObjectURL(file));
    player.setRate(settings.speed());
    if (res.detectedRatio < 0.6) {
      ui.toast('heads up: I lost the dancer in parts of that video, feedback might be a lil off');
    }
  } catch (e) {
    console.error(e);
    refStatus("hmm, that video didn't load 😵 try an mp4?");
  } finally {
    busy = false;
    $('progress').hidden = true;
    updateReady();
  }
}

async function ensureCamera() {
  if (session) return session;
  const cam = $('cam');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  cam.srcObject = stream;
  await cam.play();
  $('camEmpty').hidden = true;
  ui.status('warming up the pose model…');
  const tracker = await (trackerPromise ??= createTracker());
  session = new LiveSession({
    tracker,
    cam,
    canvas: $('overlay'),
    player,
    getDance: () => dance,
    showGhost: settings.ghost,
  });
  session.start();
  return session;
}

function stopCurrent() {
  if (stopMode) { stopMode(); stopMode = null; }
  setRunning(null);
}

async function run(mode) {
  if (!dance?.referenceFrames?.length) { ui.toast(errorLine('no_reference')); return; }
  stopCurrent();
  try {
    await ensureCamera();
  } catch (e) {
    console.error(e);
    ui.status('I need your camera to see you dance bestie 📷 allow access (and open this on localhost or https)');
    return;
  }
  $('results').hidden = mode === 'showtime' ? true : $('results').hidden;
  player.setRate(mode === 'practice' ? settings.speed() : 1);
  setRunning(mode);
  const start = mode === 'practice' ? startPractice : startShowtime;
  stopMode = await start({ session, player, dance, settings, ui });
}

function renderResults(result, rep) {
  $('results').hidden = false;
  $('score').textContent = result.error ? '—' : String(result.score);
  $('headline').textContent = rep.headline;
  $('stats').textContent = result.error
    ? ''
    : `moves ${result.poseScore} · timing ${result.timingScore} · energy ${result.energy.toFixed(1)}×${result.mirrored ? ' · mirrored ✓' : ''}`;

  const tips = $('tips');
  tips.replaceChildren(
    ...rep.lines.map((l) => {
      const li = document.createElement('li');
      li.className = l.kind;
      li.textContent = l.text;
      return li;
    }),
  );

  $('meter').hidden = !!result.error;
  if (!result.error) {
    const pos = 50 + Math.max(-1, Math.min(1, result.offset / 0.5)) * 46;
    $('needle').style.left = `${pos}%`;
  }

  const tl = $('timeline');
  tl.replaceChildren(
    ...(result.timeline ?? []).map((w) => {
      const seg = document.createElement('div');
      const cls = w.dist > 0.35 ? 'off' : w.label === 'on_beat' ? 'good' : w.label;
      seg.className = `seg ${cls}`;
      const what = cls === 'good' ? 'on it' : cls === 'off' ? 'form off' : w.label;
      seg.title = `${w.start.toFixed(0)}s–${w.end.toFixed(0)}s: ${what}`;
      return seg;
    }),
  );
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- wire up ----
$('refInput').addEventListener('change', (e) => handleReference(e.target.files?.[0]));
$('practiceBtn').addEventListener('click', () => run('practice'));
$('showtimeBtn').addEventListener('click', () => run('showtime'));
$('stopBtn').addEventListener('click', () => {
  stopCurrent();
  ui.status('paused. hydrate 💧');
});
$('speed').addEventListener('change', () => {
  if (!$('showtimeBtn').classList.contains('active')) player.setRate(settings.speed());
});
$('mirrorView').addEventListener('change', (e) => $('stage').classList.toggle('mirrored', e.target.checked));

boot().catch((e) => {
  console.error(e);
  refStatus('drop a Dougie video to start ✨');
  updateReady();
});
