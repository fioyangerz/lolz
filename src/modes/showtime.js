// Showtime: 3-2-1, dance 1-2 reps of the clip at full speed, then get graded.
import { compare } from '../scoring.js';
import { report, speak } from '../voice.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startShowtime({ session, player, dance, settings, ui }) {
  let cancelled = false;
  let finishTake = () => {};

  const stop = () => {
    cancelled = true;
    finishTake();
    session.recording = false;
    player.onLoop = null;
    player.pause();
    player.setRate(settings.speed());
    ui.countdown(null);
  };

  (async () => {
    player.setRate(1); // showtime is always full speed
    session.take();
    for (const n of ['3', '2', '1']) {
      if (cancelled) return;
      ui.countdown(n);
      await sleep(800);
    }
    if (cancelled) return;
    ui.countdown('go!');
    setTimeout(() => !cancelled && ui.countdown(null), 600);

    const reps = settings.reps();
    ui.status(`showtime! rep 1 of ${reps} 💃`);
    session.recording = true;
    await new Promise((resolve) => {
      finishTake = resolve;
      player.onLoop = (n) => {
        if (n >= reps) { player.looping = false; resolve(); }
        else ui.status(`showtime! rep ${n + 1} of ${reps} 💃`);
      };
      player.play({ loop: true }).catch((e) => { console.warn(e); resolve(); });
    });
    if (cancelled) return;

    session.recording = false;
    player.onLoop = null;
    player.pause();
    player.setRate(settings.speed());

    const result = compare(session.take(), dance, { aspect: session.aspect });
    const rep = report(result);
    ui.showResults(result, rep);
    if (settings.voice()) speak(`${result.error ? '' : `${result.score}. `}${rep.headline}`);
    ui.done();
  })();

  return stop;
}
