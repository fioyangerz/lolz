// The hype voice. Scoring produces plain issues ({ id, kind, severity, part? });
// this file is the ONLY place that decides how they sound. Always encouraging, never mean.

export const BANDS = [
  { id: 'icon', min: 90 },
  { id: 'ate', min: 75 },
  { id: 'bestie', min: 55 },
  { id: 'warmup', min: 0 },
];

export function band(score) {
  return BANDS.find((b) => score >= b.min).id;
}

const HEADLINES = {
  icon: [
    'OKAY ICON 💅 that was literally serving',
    'no notes. mother is mothering 👑',
    'the dougie has a new owner and it\'s YOU ✨',
    'stop it right now, that was immaculate 🔥',
  ],
  ate: [
    'ate fr, just a lil polish bestie 💙',
    'so close to slay territory, I can taste it',
    'okayyy we see you! that had flavor 😮‍💨',
    'main character energy, just tighten it up a smidge',
  ],
  bestie: [
    'hey bestie, the vibe is there, we\'re getting there 🫶',
    'okay I see the vision! couple tweaks and you\'re eating',
    'ooh diva, we\'re cooking, let\'s level it up 📈',
    'the foundation is SO there, let\'s build on it',
  ],
  warmup: [
    'it\'s giving warm-up era and that\'s valid 🫶',
    'every icon starts somewhere bestie, let\'s lock in 💪',
    'okay we\'re stretching the legs! next rep is yours',
    'no stress diva, this is the glow-up arc ✨',
  ],
};

const LINES = {
  // timing
  rushing: [
    'diva you\'re rushing 😭 let the beat breathe',
    'whoa speed racer, you\'re ahead of the music, chill into it',
    'you\'re a lil early bestie, wait for the beat to come to you',
  ],
  dragging: [
    'diva you\'re a little too slow, catch the beat! 🏃‍♀️',
    'a little behind the beat bestie, pick it up',
    'the music\'s waiting on you queen, push it a touch faster',
  ],
  on_beat: [
    'your timing? on beat. chef\'s kiss 🤌',
    'you\'re locked into the music, love that for you',
  ],
  // generic body
  low_energy: [
    'bestie give me MORE, go bigger with it! 💥',
    'we\'re being a lil shy rn, let it out!',
    'more energy diva, the dougie wants drama',
  ],
  not_visible: [
    'I lost you for a sec 👀 step back so I can see your whole body',
    'bestie I can\'t see you fully, scoot back a lil',
  ],
  legs_hidden: [
    'step back so I can see your knees 👀 the bounce matters',
    'your legs are off-camera bestie, back it up a bit',
  ],
  part_off: [
    'check your {part}, it\'s doing its own thing 😅',
    'hey bestie, try matching the {part} a bit closer',
    'your {part} is almost there, watch the reference on that one',
  ],
  // dougie
  lean_more: [
    'hey bestie, try leaning into it more! side to side 💃',
    'lean INTO it diva, let those shoulders rock',
    'more lean! like you\'re too cool to stand up straight 😎',
  ],
  lean_good: [
    'that lean? effortless. icon behavior',
    'the shoulder rock is rocking 🔥',
  ],
  arm_higher: [
    'bring that hand up past your head, brush the hair bestie 💇',
    'the arm sweep needs to go higher diva, really comb it back',
    'higher on the hair brush! make it dramatic ✨',
  ],
  arms_good: [
    'the hair brush is giving salon-fresh 💇',
    'arms are serving, no notes',
  ],
  bounce_more: [
    'add some bounce in those knees bestie!',
    'bend the knees a lil, give it that bounce 🏀',
    'you\'re a bit stiff diva, loosen up the knees',
  ],
  bounce_good: [
    'the bounce is bouncing, love it',
  ],
  head_into_it: [
    'let your head go with it, vibe with the lean 😌',
    'head bob along bestie, feel it',
  ],
};

const PRACTICE_PREFIX = ['quick tip:', 'psst:', 'ok so:', 'heads up:'];

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function headline(score, rng) {
  return pick(HEADLINES[band(score)], rng);
}

export function issueLine(issue, rng) {
  const lines = LINES[issue.id];
  if (!lines) return null;
  return pick(lines, rng).replace('{part}', issue.part ?? 'form');
}

/** Showtime: headline + up to `max` lines (fixes first, then one praise). */
export function report(result, { max = 3, rng } = {}) {
  if (result.error) return { headline: errorLine(result.error), lines: [] };
  const fixes = result.issues.filter((i) => i.kind === 'fix');
  const praise = result.issues.filter((i) => i.kind === 'praise');
  const chosen = [...fixes.slice(0, max - 1), ...(praise.length ? [praise[0]] : [])];
  if (chosen.length < max) chosen.push(...fixes.slice(max - 1, max - 1 + (max - chosen.length)));
  return {
    headline: headline(result.score, rng),
    lines: chosen.map((i) => ({ kind: i.kind, text: issueLine(i, rng) })).filter((l) => l.text),
  };
}

/** Practice: one short tip from the most important issue (or a hype line if all good). */
export function practiceTip(result, rng) {
  if (result.error) return errorLine(result.error);
  const fix = result.issues.find((i) => i.kind === 'fix' && i.severity >= 0.25);
  if (fix) return `${pick(PRACTICE_PREFIX, rng)} ${issueLine(fix, rng)}`;
  const praise = result.issues.find((i) => i.kind === 'praise');
  return praise ? issueLine(praise, rng) : headline(result.score, rng);
}

export function errorLine(err) {
  switch (err) {
    case 'no_reference': return 'drop a reference video first bestie, I need to know what we\'re serving 📼';
    case 'too_short': return 'that was over before it started! give me a few more seconds 💃';
    case 'not_visible': return pick(LINES.not_visible);
    default: return 'something glitched, run it back bestie 🔁';
  }
}

/** Speak a line out loud (emoji stripped) — you can't read the screen mid-Dougie. */
export function speak(text) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  const clean = text.replace(/\p{Extended_Pictographic}|‍|️/gu, '').trim();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.05;
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}

export const _internal = { HEADLINES, LINES };
