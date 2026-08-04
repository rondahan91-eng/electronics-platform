// חיווי קולי מיידי - נוצר בדפדפן עם Web Audio API, בלי קבצי שמע חיצוניים.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', gain = 0.18) {
  const c = ac();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

export function playSuccess() {
  try { tone(523, 0, 0.14, 'triangle'); tone(659, 0.11, 0.14, 'triangle'); tone(880, 0.22, 0.28, 'triangle'); } catch {}
}
export function playError() {
  try { tone(180, 0, 0.18, 'sawtooth', 0.14); tone(140, 0.12, 0.2, 'sawtooth', 0.14); } catch {}
}
export function playBurn() {
  try {
    const c = ac();
    const bufferSize = c.sampleRate * 0.5;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    noise.connect(g).connect(c.destination);
    noise.start();
    tone(90, 0, 0.4, 'square', 0.2);
  } catch {}
}
export function playClick() {
  try { tone(700, 0, 0.06, 'square', 0.08); } catch {}
}
