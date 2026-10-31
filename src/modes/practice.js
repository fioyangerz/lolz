// Practice: the song loops, the ghost dances with you, and every so often you get ONE tip.
// No full grade — just reps.
import { compare } from '../scoring.js';
import { practiceTip, speak } from '../voice.js';

const TIP_EVERY_SEC = 10; // music seconds between tips (scales with slow-mo)
const JUDGE_WINDOW_SEC = 8;

export async function startPractice({ session, player, dance, settings, ui }) {
  session.take();
  session.recording = true;
  let lastTipAt = 0;

  session.onFrame = () => {
    session.trim(JUDGE_WINDOW_SEC);
    const e = player.elapsed;
    if (e - lastTipAt < TIP_EVERY_SEC) return;
    lastTipAt = e;
    const result = compare(session.frames, dance, { aspect: session.aspect });
    const tip = practiceTip(result);
    ui.toast(tip);
    if (settings.voice()) speak(tip);
  };

  player.onLoop = null;
  await player.play({ loop: true });
  ui.status('practice mode: loop it, feel it, no pressure 🔁');

  return function stop() {
    session.onFrame = null;
    session.recording = false;
    session.take();
    player.pause();
  };
}
