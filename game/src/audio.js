// Tiny WebAudio synth: every sound is built from oscillators and filtered
// noise, so the game ships no audio files. The context is created lazily on
// the first user gesture; every call is guarded, so screenshot mode (which
// never gestures) simply stays silent.
let ctx = null;
let muted = false;
let wavesGain = null;
let wavesSource = null;

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  if (wavesGain && ctx) {
    try {
      wavesGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.2);
    } catch {
      // The context can be gone in a torn-down page; silence is the safe fallback.
    }
  }
}

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a user gesture so the browser lets sound start. */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

/** One oscillator note, optionally sliding in pitch. `when` is seconds from now. */
function tone({ freq, freqEnd, type = 'sine', dur = 0.3, vol = 0.2, when = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  try {
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

/** A burst of filtered noise. `type` is the filter shape. */
function noise({ dur = 0.5, vol = 0.2, filterFreq = 800, type = 'lowpass', when = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  try {
    const t = c.currentTime + when;
    const length = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start(t);
    source.stop(t + dur);
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

/** A UI click. */
export function click() {
  tone({ freq: 660, type: 'triangle', dur: 0.06, vol: 0.1 });
}

/** The foghorn: two detuned low saws through a lowpass, swelling and dying. */
export function horn() {
  const c = ensure();
  if (!c || muted) return;
  try {
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.25);
    gain.gain.setValueAtTime(0.22, t + 0.9);
    gain.gain.linearRampToValueAtTime(0, t + 1.4);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(gain);
    gain.connect(c.destination);
    for (const f of [98, 98.6, 196]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 1.45);
    }
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

/** A saved ship: a bell arpeggio that climbs with the combo. */
export function chime(combo) {
  const base = 523 * Math.pow(1.059, Math.min(combo, 8));
  tone({ freq: base, dur: 0.5, vol: 0.16 });
  tone({ freq: base * 1.5, dur: 0.5, vol: 0.12, when: 0.07 });
  tone({ freq: base * 2, dur: 0.6, vol: 0.08, when: 0.14 });
}

/** A wreck: a thud under a burst of noise. */
export function crash() {
  noise({ dur: 0.5, vol: 0.28, filterFreq: 900 });
  tone({ freq: 72, freqEnd: 38, dur: 0.4, vol: 0.28 });
}

/** The dawn bell at the end of a night. */
export function bell() {
  tone({ freq: 880, dur: 0.9, vol: 0.14 });
  tone({ freq: 1318, dur: 0.7, vol: 0.07, when: 0.06 });
}

/** Distant thunder under a lightning flash. */
export function thunder() {
  noise({ dur: 2.2, vol: 0.2, filterFreq: 240 });
}

/** A flare going up: a bright hiss and a rising tone. */
export function flareSound() {
  noise({ dur: 0.8, vol: 0.13, filterFreq: 3000, type: 'highpass' });
  tone({ freq: 1200, freqEnd: 1800, dur: 0.4, vol: 0.06 });
}

/** The sea itself: looped brown-ish noise through a lowpass, breathing slowly. */
export function startWaves() {
  const c = ensure();
  if (!c || wavesSource) return;
  try {
    const length = c.sampleRate * 3;
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = c.createGain();
    gain.gain.value = muted ? 0 : 0.045;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start();
    lfo.start();
    wavesSource = source;
    wavesGain = gain;
  } catch {
    wavesSource = null;
    wavesGain = null;
  }
}

export function stopWaves() {
  try {
    if (wavesSource) wavesSource.stop();
  } catch {
    // Already stopped.
  }
  wavesSource = null;
  wavesGain = null;
}
