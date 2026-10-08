/* Rhythm Keys — sound out: the song, the hit tick and the calibration
   click, all on one AudioContext, whose clock is the one the game judges on. */
(function () {
  'use strict';

  let ctx = null, music = null, sfx = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      music = ctx.createGain();
      sfx = ctx.createGain();
      music.connect(ctx.destination);
      sfx.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // What is being heard now, on the audio clock — so a press is measured
  // against the sound, not against the frame that drew it.
  function heard(perfNow) {
    ensure();
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (perfNow - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  function tone(t, from, to, peak, decay) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + decay * 0.6);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  window.RKAudio = {
    ensure,
    now: () => heard(performance.now()),
    at: stamp => heard(stamp),
    // decodeAudioData takes the buffer it is given; the caller keeps its own.
    decode: bytes => ensure().decodeAudioData(bytes.slice(0)),
    volumes(m, s) { ensure(); music.gain.value = m; sfx.gain.value = s; },
    play(buffer, at) {
      ensure();
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer;
      src.connect(g);
      g.connect(music);
      src.start(at);
      return {
        stop() {
          const t = ctx.currentTime;
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + 0.06);
          try { src.stop(t + 0.08); } catch { /* already stopped */ }
        },
      };
    },
    // A listen: `length` seconds from `from`, faded in and out, a little
    // under the game's own loudness.
    preview(buffer, from, length) {
      ensure();
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer;
      src.connect(g);
      g.connect(music);
      const t = ctx.currentTime + 0.02, fade = 0.5;
      const end = t + Math.min(length, Math.max(0.5, buffer.duration - from));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.7, t + fade);
      g.gain.setValueAtTime(0.7, Math.max(t + fade, end - fade * 2));
      g.gain.linearRampToValueAtTime(0, end);
      src.start(t, from, end - t);
      let ended = null;
      src.onended = () => { if (ended) ended(); };
      return {
        stop() {
          const n = ctx.currentTime;
          g.gain.cancelScheduledValues(n);
          g.gain.setValueAtTime(g.gain.value, n);
          g.gain.linearRampToValueAtTime(0, n + 0.15);
          try { src.stop(n + 0.16); } catch { /* already stopped */ }
        },
        ended(f) { ended = f; },
      };
    },
    tick() { ensure(); tone(ctx.currentTime, 1800, 900, 0.12, 0.05); },
    click(t, accent) { ensure(); tone(t, accent ? 1500 : 1000, accent ? 1500 : 1000, 0.3, 0.06); },
    suspend() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
    get time() { return ensure().currentTime; },
  };
})();
