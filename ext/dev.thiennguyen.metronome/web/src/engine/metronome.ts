// The metronome itself: settings in, notes on the AudioContext's clock out.
//
// The shape is the "two clocks" scheduler: a coarse timer (a worker's, every
// 25 ms) asks what falls inside the next LOOKAHEAD seconds and places each
// note at its exact time on the audio clock, which never drifts. Drawing is
// a third, separate thing: the page asks `position()` on every animation
// frame and `drain()` for the notes that have sounded since, so a slow frame
// moves the picture late and never the sound.

import { voice, type Strike } from "./sounds";

/** A beat's place in the bar: struck hard, struck, or left silent. */
export type Level = "accent" | "beat" | "mute";

export interface Settings {
  bpm: number;
  /** Beats in a bar — the time signature's top number. */
  beats: number;
  /** The note that gets the beat — its bottom number. BPM counts these. */
  unit: 2 | 4 | 8 | 16;
  /** Each beat's level; `levels[0] === "accent"` is "accent on the first beat". */
  levels: Level[];
  /** Clicks per beat: 1, 2 (eighths), 3 (triplets) or 4 (sixteenths). */
  sub: 1 | 2 | 3 | 4;
  sound: string;
  /** 0–1. */
  volume: number;
}

export interface Note {
  /** When it sounds, on the audio clock — output latency already added, so
   *  comparing with `now()` is comparing with what is being heard. */
  heard: number;
  /** The beat it belongs to, 0-based, and the click within that beat. */
  beat: number;
  sub: number;
  bar: number;
  /** Beats since Start, counting this one. */
  count: number;
  level: Level;
  /** How long its beat lasts, in seconds. */
  length: number;
}

export const MIN_BPM = 20;
export const MAX_BPM = 300;
const LOOKAHEAD = 0.12;

export const DEFAULTS: Settings = {
  bpm: 100,
  beats: 4,
  unit: 4,
  levels: ["accent", "beat", "beat", "beat"],
  sub: 1,
  sound: "woodblock",
  volume: 0.8,
};

export function clampBpm(bpm: number): number {
  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
}

/** `levels` stretched or cut to `beats`, keeping what was set. */
export function fitLevels(levels: Level[], beats: number, accentFirst: boolean): Level[] {
  const next = Array.from({ length: beats }, (_, i) => levels[i] ?? "beat");
  if (beats > 0) next[0] = accentFirst ? "accent" : next[0] === "accent" ? "beat" : next[0]!;
  return next;
}

export class Metronome {
  settings: Settings;
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  /** Where every master gain goes: the limiter in front of the speakers. */
  private bus: AudioNode | undefined;
  private worker: Worker | undefined;
  private fallback: ReturnType<typeof setInterval> | undefined;
  /** The worker would not load once; it is not tried again. */
  private workerFailed = false;
  private running = false;
  /** The next click to place: when, and where in the bar. */
  private at = 0;
  private beat = 0;
  private subIndex = 0;
  private bar = 0;
  /** Beats placed since Start, whatever the bar — what alternates a swing. */
  private count = 0;
  /** The last click placed, and where it fell — what a change of tempo or
   *  of clicks in a beat carries on from (`replan`). */
  private placed: { at: number; beat: number; bar: number; count: number; sub: number; subs: number } | undefined;
  /** Placed, not yet drawn. */
  private pending: Note[] = [];
  /** The last beat (sub 0) heard, for `position()`. */
  private lastBeat: Note | undefined;
  /** Upcoming beats placed but not yet heard. */
  private upcoming: Note[] = [];
  private listeners = new Set<() => void>();

  constructor(settings: Settings) {
    this.settings = settings;
  }

  get isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private told() {
    for (const listener of this.listeners) listener();
  }

  private audio(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx || !this.master) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      // A gentle ceiling, so the accent of the loudest voice at full volume
      // never clips on top of whatever else the Mac is playing.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 8;
      limiter.connect(this.ctx.destination);
      this.bus = limiter;
      this.master.connect(limiter);
      this.master.gain.value = curve(this.settings.volume);
    }
    return { ctx: this.ctx, master: this.master };
  }

  /** What is being heard now, on the audio clock. */
  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private latency(): number {
    const ctx = this.ctx;
    return ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0;
  }

  update(settings: Settings) {
    const before = this.settings;
    this.settings = settings;
    if (this.master && this.ctx && before.volume !== settings.volume) {
      this.master.gain.setTargetAtTime(curve(settings.volume), this.ctx.currentTime, 0.02);
    }
    if (this.running && this.placed && (settings.bpm !== before.bpm || settings.sub !== before.sub)) this.replan();
    // A bar cut short under the beat about to start: that beat is the next
    // bar's first. Mid-beat, the beat plays out and `schedule` wraps after.
    if (settings.beats !== before.beats && this.beat >= settings.beats && this.subIndex === 0) {
      this.beat = 0;
      this.bar++;
    }
  }

  /** The next click after the tempo or the clicks in a beat change, on from
   *  the last one placed: the rest of its beat at the new length, on the
   *  new subdivision's grid. So a new tempo is heard from the next click,
   *  not after one already planned at the old spacing — six seconds away
   *  at 20 in 2/2 — and a new subdivision keeps the beat where it was
   *  instead of striking it again mid-beat. */
  private replan() {
    const last = this.placed!;
    const s = this.settings;
    const frac = last.sub / last.subs;
    const next = Math.floor(frac * s.sub + 1e-9) + 1;
    const at = last.at + (next / s.sub - frac) * beatLength(s);
    this.bar = last.bar;
    if (next < s.sub) {
      this.beat = last.beat;
      this.count = last.count;
      this.subIndex = next;
    } else {
      this.beat = last.beat + 1;
      this.count = last.count + 1;
      this.subIndex = 0;
      if (this.beat >= s.beats) {
        this.beat = 0;
        this.bar++;
      }
    }
    // Much faster all at once, the next click may already be due.
    this.at = Math.max(at, this.now() + 0.02);
  }

  async start() {
    if (this.running) return;
    const { ctx } = this.audio();
    if (ctx.state !== "running") await ctx.resume();
    this.running = true;
    this.at = ctx.currentTime + 0.08;
    this.beat = 0;
    this.subIndex = 0;
    this.bar = 0;
    this.count = 0;
    this.placed = undefined;
    this.pending = [];
    this.upcoming = [];
    this.lastBeat = undefined;
    this.schedule();
    this.beginTimer();
    this.told();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.worker?.postMessage("stop");
    if (this.fallback !== undefined) clearInterval(this.fallback);
    this.fallback = undefined;
    // Notes already placed would still sound; a short fade under them
    // rather than a cut, which clicks.
    if (this.ctx && this.master) {
      const ctx = this.ctx;
      const master = this.master;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      const old = master;
      this.master = ctx.createGain();
      this.master.gain.value = curve(this.settings.volume);
      this.master.connect(this.bus ?? ctx.destination);
      setTimeout(() => old.disconnect(), 200);
    }
    this.pending = [];
    this.upcoming = [];
    this.lastBeat = undefined;
    this.told();
  }

  toggle() {
    if (this.running) this.stop();
    else void this.start();
  }

  /** A voice struck once, accent then beat, so a picker can be heard. */
  async preview(soundId: string) {
    const { ctx, master } = this.audio();
    if (ctx.state !== "running") await ctx.resume();
    const t = ctx.currentTime + 0.03;
    const sound = voice(soundId);
    sound.play(ctx, master, t, "accent");
    sound.play(ctx, master, t + 0.32, "beat");
    sound.play(ctx, master, t + 0.64, "beat");
  }

  private beginTimer() {
    if (!this.worker && this.fallback === undefined && !this.workerFailed) {
      try {
        this.worker = new Worker(new URL("./tick.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = () => this.schedule();
        // A worker that is made but cannot load — its script refused by the
        // scheme it is served from — says so only later, here; the page's
        // own timer takes over rather than the beat going quiet a
        // lookahead in.
        this.worker.onerror = () => this.useOwnTimer();
      } catch {
        this.worker = undefined;
        this.workerFailed = true;
      }
    }
    if (this.worker) this.worker.postMessage("start");
    else this.useOwnTimer();
  }

  private useOwnTimer() {
    if (this.worker) this.workerFailed = true;
    this.worker?.terminate();
    this.worker = undefined;
    if (this.running && this.fallback === undefined) this.fallback = setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    if (!this.running) return;
    const { ctx, master } = this.audio();
    const s = this.settings;
    const length = beatLength(s);
    const latency = this.latency();
    // A tab left in the background can wake late; a click placed in the
    // past would all sound at once, so skip ahead instead.
    if (this.at < ctx.currentTime - 0.05) this.at = ctx.currentTime + 0.02;
    while (this.at < ctx.currentTime + LOOKAHEAD) {
      const level = s.levels[this.beat] ?? "beat";
      const strikeAs: Strike | null = level === "mute" ? null : this.subIndex > 0 ? "sub" : level;
      if (strikeAs) voice(s.sound).play(ctx, master, this.at, strikeAs);
      const note: Note = {
        heard: this.at + latency,
        beat: this.beat,
        sub: this.subIndex,
        bar: this.bar,
        count: this.count,
        level,
        length,
      };
      this.pending.push(note);
      if (this.subIndex === 0) this.upcoming.push(note);
      this.placed = { at: this.at, beat: this.beat, bar: this.bar, count: this.count, sub: this.subIndex, subs: s.sub };
      this.at += length / s.sub;
      this.subIndex++;
      if (this.subIndex >= s.sub) {
        this.subIndex = 0;
        this.beat++;
        this.count++;
        if (this.beat >= s.beats) {
          this.beat = 0;
          this.bar++;
        }
      }
    }
  }

  /** The notes heard since the last call, oldest first. */
  drain(): Note[] {
    const now = this.now();
    let i = 0;
    while (i < this.pending.length && this.pending[i]!.heard <= now) i++;
    const heard = this.pending.splice(0, i);
    while (this.upcoming.length && this.upcoming[0]!.heard <= now) this.lastBeat = this.upcoming.shift();
    return heard;
  }

  /** Where the music is right now: the beat being heard, and how far into
   *  it (0–1). Continuous, for anything that swings or sweeps. */
  position(): { beat: number; bar: number; frac: number; count: number } | null {
    const last = this.lastBeat;
    if (!this.running || !last) return null;
    const frac = Math.min(1, Math.max(0, (this.now() - last.heard) / last.length));
    return { beat: last.beat, bar: last.bar, frac, count: last.count };
  }
}

/** How long one beat lasts, in seconds. The tempo counts the beats heard,
 *  the signature's bottom note: 7/8 at 132 is 132 eighths a minute, and
 *  tapping along with the clicks gives back the tempo they are at. */
function beatLength(s: Settings): number {
  return 60 / s.bpm;
}

/** Volume as the ear hears it: a slider's middle should sound like half. */
function curve(volume: number): number {
  return Math.pow(Math.min(1, Math.max(0, volume)), 2);
}
