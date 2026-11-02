// Tiny synth sounds. No audio files to download.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, delay = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ac(); },
  setMuted(m: boolean) { muted = m; },
  get muted() { return muted; },
  fire() { tone(1100, 0.09, 'square', 0.04, 320); },
  select() { tone(760, 0.04, 'square', 0.03); },
  correct() { tone(523, 0.12, 'triangle', 0.14); tone(659, 0.12, 'triangle', 0.14, 0, 0.09); tone(988, 0.25, 'triangle', 0.14, 0, 0.18); },
  wrong() { tone(180, 0.32, 'sawtooth', 0.07, 80); },
  lost() { tone(500, 0.5, 'sine', 0.1, 120); },
  spawn() { tone(1400, 0.06, 'sine', 0.05, 900); },
  wave() { tone(330, 0.15, 'triangle', 0.1); tone(440, 0.25, 'triangle', 0.1, 0, 0.14); },
};
