// The metronome's voices, synthesised with Web Audio rather than shipped as
// samples: a click is a few milliseconds of an envelope over an oscillator
// or noise, so a voice costs a function and not a file, and the accent can
// be the same instrument struck harder and higher rather than a second
// recording that never quite matches the first.
//
// Every voice is scheduled at an exact `AudioContext` time. Nothing here
// waits or reads the clock, so the scheduler can put a whole bar ahead.

/** How hard a note is struck. `sub` is a subdivision between beats. */
export type Strike = "accent" | "beat" | "sub";

export interface Voice {
  id: string;
  name: string;
  /** A few words about what it sounds like, for the picker — short
   *  enough for a card a quarter of the tab wide, where longer ones were
   *  cut off with an ellipsis. */
  hint: string;
  play(ctx: BaseAudioContext, out: AudioNode, at: number, strike: Strike): void;
}

const LOUDNESS: Record<Strike, number> = { accent: 1, beat: 0.62, sub: 0.3 };

/** One second of white noise per context, made once. */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return buffer;
}

/** A gain that jumps to `peak` and falls away exponentially over `decay`
 *  seconds — the shape of everything struck. */
function strike(ctx: BaseAudioContext, out: AudioNode, at: number, peak: number, decay: number, attack = 0.0015): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(out);
  return gain;
}

function tone(ctx: BaseAudioContext, into: AudioNode, at: number, length: number, type: OscillatorType, freq: number, glideFrom?: number) {
  const osc = ctx.createOscillator();
  osc.type = type;
  if (glideFrom) {
    osc.frequency.setValueAtTime(glideFrom, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.012);
  } else {
    osc.frequency.setValueAtTime(freq, at);
  }
  osc.connect(into);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function burst(ctx: BaseAudioContext, into: AudioNode, at: number, length: number, filters: BiquadFilterNode[]) {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  let node: AudioNode = source;
  for (const filter of filters) {
    node.connect(filter);
    node = filter;
  }
  node.connect(into);
  source.start(at, Math.random() * 0.5);
  source.stop(at + length + 0.02);
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

const by = <T,>(s: Strike, accent: T, beat: T, sub: T): T => (s === "accent" ? accent : s === "beat" ? beat : sub);

export const VOICES: Voice[] = [
  {
    id: "click",
    name: "Click",
    hint: "Short digital tick",
    play(ctx, out, at, s) {
      const g = strike(ctx, out, at, LOUDNESS[s] * 0.9, 0.028);
      tone(ctx, g, at, 0.03, "sine", by(s, 1760, 1320, 990));
      const n = strike(ctx, out, at, LOUDNESS[s] * 0.35, 0.006);
      burst(ctx, n, at, 0.01, [filter(ctx, "highpass", 5000)]);
    },
  },
  {
    id: "woodblock",
    name: "Woodblock",
    hint: "Warm, hollow knock",
    play(ctx, out, at, s) {
      const f = by(s, 1180, 880, 740);
      const g = strike(ctx, out, at, LOUDNESS[s], 0.07);
      tone(ctx, g, at, 0.08, "sine", f, f * 1.5);
      const n = strike(ctx, out, at, LOUDNESS[s] * 0.5, 0.018);
      burst(ctx, n, at, 0.025, [filter(ctx, "bandpass", f * 2.2, 6)]);
    },
  },
  {
    id: "beep",
    name: "Beep",
    hint: "Soft, round tone",
    play(ctx, out, at, s) {
      const g = ctx.createGain();
      const peak = LOUDNESS[s] * 0.7;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
      g.gain.setValueAtTime(peak, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      g.connect(out);
      tone(ctx, g, at, 0.09, "sine", by(s, 1320, 880, 660));
    },
  },
  {
    id: "mechanical",
    name: "Wind-up",
    hint: "Ticks, a bell on 1",
    play(ctx, out, at, s) {
      const n = strike(ctx, out, at, LOUDNESS[s] * 1.1, 0.014, 0.0008);
      burst(ctx, n, at, 0.02, [filter(ctx, "bandpass", 3200, 2.5)]);
      const thunk = strike(ctx, out, at, LOUDNESS[s] * 0.45, 0.03);
      tone(ctx, thunk, at, 0.04, "sine", 320);
      if (s === "accent") {
        // The bell a wind-up metronome rings on the first beat: a struck
        // partial and its inharmonic overtone, ringing long.
        const bell = strike(ctx, out, at, 0.42, 0.9, 0.002);
        tone(ctx, bell, at, 0.95, "sine", 1568);
        const over = strike(ctx, out, at, 0.12, 0.5, 0.002);
        tone(ctx, over, at, 0.55, "sine", 1568 * 2.76);
      }
    },
  },
  {
    id: "cowbell",
    name: "Cowbell",
    hint: "Drum-machine bell",
    play(ctx, out, at, s) {
      const shift = by(s, 1.19, 1, 1);
      const g = strike(ctx, out, at, LOUDNESS[s] * 0.55, by(s, 0.32, 0.22, 0.12));
      const band = filter(ctx, "bandpass", 900 * shift, 1.4);
      band.connect(g);
      tone(ctx, band, at, 0.35, "square", 540 * shift);
      tone(ctx, band, at, 0.35, "square", 800 * shift);
    },
  },
  {
    id: "hihat",
    name: "Hi-hat",
    hint: "Crisp closed hat",
    play(ctx, out, at, s) {
      const g = strike(ctx, out, at, LOUDNESS[s] * 0.8, by(s, 0.24, 0.045, 0.03));
      burst(ctx, g, at, 0.3, [filter(ctx, "highpass", 7000), filter(ctx, "peaking", 10000, 1)]);
    },
  },
  {
    id: "stick",
    name: "Sticks",
    hint: "Two sticks struck",
    play(ctx, out, at, s) {
      const f = by(s, 2300, 1800, 1500);
      const g = strike(ctx, out, at, LOUDNESS[s] * 0.7, 0.022);
      tone(ctx, g, at, 0.03, "triangle", f, f * 1.3);
      const n = strike(ctx, out, at, LOUDNESS[s] * 0.6, 0.012);
      burst(ctx, n, at, 0.02, [filter(ctx, "highpass", 3000)]);
    },
  },
  {
    id: "clave",
    name: "Clave",
    hint: "Bright, cutting",
    play(ctx, out, at, s) {
      const g = strike(ctx, out, at, LOUDNESS[s] * 0.8, 0.05);
      tone(ctx, g, at, 0.06, "sine", by(s, 3000, 2500, 2200));
    },
  },
];

export function voice(id: string): Voice {
  return VOICES.find((one) => one.id === id) ?? VOICES[0]!;
}
