/* Rhythm Keys — reading a song. A song from anywhere arrives as sound, not
   notes: this finds where things happen in it (onsets), how fast it goes
   (tempo) and where its beats fall, once, when the song is added — and
   makes a chart from that for any difficulty and number of keys, on the
   spot. All on this Mac, in the page; nothing is sent anywhere. */
(function () {
  'use strict';

  const VERSION = 1;
  const SR = 22050, N = 1024, HOP = 256, FPS = SR / HOP;
  // A frame's flux peaks when the new sound is mid-window, so a frame's time
  // is its middle — and a little more: measured on click tracks at 92 to
  // 174 BPM, beats found that way came 12.5 ms early, every tempo alike.
  const at = f => (f * HOP + N / 2) / SR + 0.0125;
  // A breath for the page between chunks of work. A message, not a timer:
  // a hidden panel's timers are slowed to a crawl, its messages are not.
  const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

  // ---------- an FFT, radix 2 ----------
  const BITS = Math.log2(N);
  const REV = new Uint16Array(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b); REV[i] = r; }
  const COS = new Float32Array(N / 2), SIN = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos((-2 * Math.PI * i) / N); SIN[i] = Math.sin((-2 * Math.PI * i) / N); }
  const HANN = new Float32Array(N);
  for (let i = 0; i < N; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  function fft(re, im) {
    for (let i = 0; i < N; i++) {
      const j = REV[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * COS[k] - im[b] * SIN[k], ti = re[b] * SIN[k] + im[b] * COS[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // The song as one channel at 22.05 kHz: Web Audio mixes and resamples it.
  async function mono(buffer) {
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.duration * SR)), SR);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  // Per frame: how much new sound arrived in the lows, mids and highs
  // (spectral flux), where the sound sits (centroid) and how loud it is.
  async function features(x, progress) {
    const F = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
    const low = new Float32Array(F), mid = new Float32Array(F), high = new Float32Array(F);
    const cen = new Float32Array(F), rms = new Float32Array(F);
    const re = new Float32Array(N), im = new Float32Array(N), prev = new Float32Array(N / 2);
    const B1 = 10, B2 = 93; // ~215 Hz and ~2 kHz
    for (let f = 0; f < F; f++) {
      const o = f * HOP;
      let e = 0;
      for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * HANN[i]; im[i] = 0; }
      rms[f] = Math.sqrt(e / N);
      fft(re, im);
      let fl = 0, fm = 0, fh = 0, num = 0, den = 0;
      for (let k = 1; k < N / 2; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        const l = Math.log1p(100 * m);
        const d = l - prev[k];
        prev[k] = l;
        if (d > 0) { if (k < B1) fl += d; else if (k < B2) fm += d; else fh += d; }
        num += k * m;
        den += m;
      }
      if (f > 0) { low[f] = fl; mid[f] = fm; high[f] = fh; }
      cen[f] = den > 0 ? num / den : 0;
      if (f % 1500 === 1499) { progress(0.15 + 0.6 * (f / F)); await yieldNow(); }
    }
    return { F, low, mid, high, cen, rms };
  }

  const meanOf = (a, n) => { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s / Math.max(1, n) || 1; };

  // One onset curve: the three bands weighed alike, less its local mean so
  // a loud passage does not read as one long onset.
  function envelope(ft) {
    const { F, low, mid, high } = ft;
    const ml = meanOf(low, F), mm = meanOf(mid, F), mh = meanOf(high, F);
    const raw = new Float32Array(F);
    for (let i = 0; i < F; i++) raw[i] = low[i] / ml + mid[i] / mm + high[i] / mh;
    const pre = new Float64Array(F + 1);
    for (let i = 0; i < F; i++) pre[i + 1] = pre[i] + raw[i];
    const env = new Float32Array(F), W = 8;
    for (let i = 0; i < F; i++) {
      const a = Math.max(0, i - W), b = Math.min(F, i + W + 1);
      env[i] = Math.max(0, raw[i] - (pre[b] - pre[a]) / (b - a));
    }
    return { env, ml, mm, mh };
  }

  // Tempo: the lag the onset curve best repeats at, leaning towards 120 BPM
  // the way listeners do, then folded into a playable range.
  function tempo(env) {
    const F = env.length;
    const minL = Math.floor((60 * FPS) / 200), maxL = Math.ceil((60 * FPS) / 60);
    const ac = new Float32Array(maxL + 2);
    for (let L = minL - 1; L <= maxL + 1; L++) {
      let s = 0;
      for (let i = 0; i + L < F; i++) s += env[i] * env[i + L];
      ac[L] = s / Math.max(1, F - L);
    }
    let best = -1, bestL = minL;
    for (let L = minL; L <= maxL; L++) {
      const bpm = (60 * FPS) / L;
      const v = ac[L] * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
      if (v > best) { best = v; bestL = L; }
    }
    const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1], d = a - 2 * b + c;
    const shift = d ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
    let bpm = (60 * FPS) / (bestL + shift);
    while (bpm < 70) bpm *= 2;
    while (bpm > 190) bpm /= 2;
    return bpm;
  }

  // Beats by dynamic programming (Ellis 2007): each beat as strong as can
  // be, each gap as close to the tempo's as can be — so a song that drifts
  // a little is followed rather than lost.
  function track(env, bpm) {
    const F = env.length, p = (60 * FPS) / bpm;
    let s2 = 0;
    for (let i = 0; i < F; i++) s2 += env[i] * env[i];
    const sd = Math.sqrt(s2 / Math.max(1, F)) || 1;
    const lo = Math.max(1, Math.round(p / 2)), hi = Math.round(p * 2);
    const pen = new Float32Array(hi + 1);
    for (let g = lo; g <= hi; g++) { const r = Math.log(g / p); pen[g] = 100 * r * r; }
    const score = new Float32Array(F), back = new Int32Array(F).fill(-1);
    for (let i = 0; i < F; i++) {
      let bestV = -Infinity, bestJ = -1;
      for (let g = lo; g <= hi && i - g >= 0; g++) {
        const v = score[i - g] - pen[g];
        if (v > bestV) { bestV = v; bestJ = i - g; }
      }
      score[i] = env[i] / sd + (bestV > 0 ? bestV : 0);
      back[i] = bestV > 0 ? bestJ : -1;
    }
    let end = F - 1, top = -Infinity;
    for (let i = Math.max(0, F - Math.round(p)); i < F; i++) if (score[i] > top) { top = score[i]; end = i; }
    const beats = [];
    for (let i = end; i >= 0; i = back[i]) { beats.push(at(i)); if (back[i] < 0) break; }
    beats.reverse();
    // Carry the grid to both ends of the song at the tempo found.
    const gap = 60 / bpm;
    while (beats.length && beats[0] - gap > 0) beats.unshift(beats[0] - gap);
    const lastT = at(F - 1);
    while (beats.length && beats[beats.length - 1] + gap < lastT) beats.push(beats[beats.length - 1] + gap);
    return beats;
  }

  // Onsets: peaks of the curve that stand above what is around them.
  function peaks(env) {
    const F = env.length, pre = new Float64Array(F + 1), out = [];
    for (let i = 0; i < F; i++) pre[i + 1] = pre[i] + env[i];
    const W = 43;
    for (let i = 1; i < F - 1; i++) {
      const v = env[i];
      if (v <= 0) continue;
      let top = true;
      for (let j = Math.max(0, i - 3); j <= Math.min(F - 1, i + 3); j++) if (env[j] > v || (env[j] === v && j < i)) { top = false; break; }
      if (!top) continue;
      const a = Math.max(0, i - W), b = Math.min(F, i + W + 1);
      if (v > 1.3 * ((pre[b] - pre[a]) / (b - a)) + 0.05) out.push(i);
    }
    return out;
  }

  const rank = values => {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    const r = new Array(values.length);
    order.forEach((idx, k) => { r[idx] = values.length > 1 ? k / (values.length - 1) : 1; });
    return r;
  };

  async function analyze(buffer, progress) {
    progress = progress || (() => {});
    progress(0.02);
    const x = await mono(buffer);
    progress(0.15);
    const ft = await features(x, progress);
    const { env, ml, mm, mh } = envelope(ft);
    progress(0.8);
    await yieldNow();
    const bpm = tempo(env);
    const beats = track(env, bpm);
    progress(0.92);
    await yieldNow();

    // Each onset placed on the beat grid, to the nearest sixteenth.
    const found = [];
    let k = 0;
    for (const f of peaks(env)) {
      const t = at(f);
      while (k + 1 < beats.length && beats[k + 1] <= t) k++;
      const b0 = beats[k], b1 = beats[k + 1] !== undefined ? beats[k + 1] : b0 + 60 / bpm;
      if (t < b0 - 0.5 * (b1 - b0)) continue;
      const pos = ((t - b0) / (b1 - b0)) * 4;
      const q = Math.round(pos);
      if (Math.abs(pos - q) > 0.32) continue; // between the grid's lines: not a note
      const bi = k + Math.floor(q / 4), sixteenth = ((q % 4) + 4) % 4;
      const qt = b0 + (q / 4) * (b1 - b0);
      const bands = [ft.low[f] / ml, ft.mid[f] / mm, ft.high[f] / mh];
      found.push({
        t: qt, bi, sub: sixteenth === 0 ? 1 : sixteenth === 2 ? 2 : 4,
        s: env[f], band: bands.indexOf(Math.max(...bands)), c: ft.cen[Math.min(ft.F - 1, f + 2)],
      });
    }
    // One note per grid line: the strongest.
    const byT = new Map();
    for (const n of found) { const key = n.t.toFixed(3); const o = byT.get(key); if (!o || n.s > o.s) byT.set(key, n); }
    const notes = [...byT.values()].sort((a, b) => a.t - b.t);
    const sR = rank(notes.map(n => n.s)), cR = rank(notes.map(n => n.c));
    notes.forEach((n, i) => { n.s = +sR[i].toFixed(3); n.c = +cR[i].toFixed(3); n.t = +n.t.toFixed(4); });

    // Which beat of four is the bar's first: the one the lows hit hardest.
    const down = [0, 0, 0, 0];
    for (const n of notes) if (n.sub === 1 && n.band === 0) down[((n.bi % 4) + 4) % 4] += n.s;
    // Loudness, twenty times a second, 0–1, for telling a held note from a struck one.
    const step = Math.round(FPS / 20), loud = [];
    let peak = 1e-6;
    for (let i = 0; i < ft.F; i += step) { let m = 0; for (let j = i; j < Math.min(ft.F, i + step); j++) m = Math.max(m, ft.rms[j]); loud.push(m); peak = Math.max(peak, m); }
    progress(1);
    return {
      v: VERSION, duration: buffer.duration, bpm: +bpm.toFixed(2),
      beats: beats.map(b => +b.toFixed(4)), down: down.indexOf(Math.max(...down)),
      notes, loud: loud.map(v => +(v / peak).toFixed(3)),
    };
  }

  // ---------- charts ----------

  const LEVELS = {
    easy: { sub: 1, keep: 0.5, nps: 2.2, hold: 2, jack: 0.45, chord: 0 },
    normal: { sub: 2, keep: 0.62, nps: 3.8, hold: 1.5, jack: 0.28, chord: 0 },
    hard: { sub: 4, keep: 0.75, nps: 6.5, hold: 1, jack: 0.17, chord: 4 },
    expert: { sub: 4, keep: 0.92, nps: 9.5, hold: 1, jack: 0.12, chord: 2 },
  };

  function chart(a, level, k, mirror) {
    const L = LEVELS[level];
    // Stronger, and on the beat, is kept first.
    let pool = a.notes.filter(n => n.sub <= L.sub).map(n => Object.assign({}, n, { w: n.s + (n.sub === 1 ? 0.25 : n.sub === 2 ? 0.1 : 0) }));
    const ws = pool.map(n => n.w).sort((x, y) => x - y);
    const thr = ws.length ? ws[Math.floor((1 - L.keep) * (ws.length - 1))] : 0;
    pool = pool.filter(n => n.w >= thr);
    // No second holds more notes than the difficulty allows: the weakest go.
    const kept = [];
    for (const n of pool) {
      kept.push(n);
      let lo = kept.length - 1;
      while (lo > 0 && n.t - kept[lo - 1].t < 1) lo--;
      if (kept.length - lo > L.nps) {
        let wi = lo;
        for (let i = lo; i < kept.length; i++) if (kept[i].w < kept[wi].w) wi = i;
        kept.splice(wi, 1);
      }
    }

    const beatLen = t => {
      const b = a.beats;
      let i = 0;
      while (i + 1 < b.length && b[i + 1] <= t) i++;
      return b[i + 1] !== undefined ? b[i + 1] - b[i] : 60 / a.bpm;
    };
    const loudAt = t => a.loud[Math.min(a.loud.length - 1, Math.max(0, Math.round(t * 20)))] || 0;
    // Held: the sound goes on until the next note, and it is not a drum.
    const sustained = (t, until) => {
      if (until - t < 0.35) return false;
      const start = loudAt(t + 0.05);
      let sum = 0, n = 0;
      for (let x = t + 0.15; x < until - 0.1; x += 0.05) { sum += loudAt(x); n++; }
      return n > 0 && sum / n >= 0.6 * start && start > 0.15;
    };

    // Brightness ranked among the notes kept, not all the song's onsets: the
    // strong ones lean low (the kick), and ranked against everything they
    // would crowd the left lanes.
    const bright = rank(kept.map(n => n.c));
    kept.forEach((n, i) => { n.c = bright[i]; });

    const free = new Array(k).fill(-1), notes = [];
    const nearestFree = (want, t) => {
      for (let d = 0; d < k; d++) for (const l of [want - d, want + d]) if (l >= 0 && l < k && free[l] <= t) return l;
      return -1;
    };
    let prev = null;
    for (let i = 0; i < kept.length; i++) {
      const n = kept[i], next = kept[i + 1];
      // Where the sound sits picks the lane: low to the left, bright to the right.
      let lane = Math.min(k - 1, Math.floor(n.c * k));
      if (prev && lane === prev.lane && n.t - prev.t < L.jack) {
        lane += n.c >= prev.c ? 1 : -1;
        if (lane < 0 || lane >= k) lane = prev.lane === 0 ? 1 : prev.lane - 1;
      }
      lane = nearestFree(lane, n.t);
      if (lane < 0) continue;
      const bl = beatLen(n.t);
      let end = 0;
      if (next && n.band !== 0 && (next.t - n.t) / bl >= L.hold && sustained(n.t, next.t)) end = n.t + Math.min(next.t - n.t - bl / 2, bl * 4);
      if (end && end - n.t < 0.3) end = 0;
      notes.push({ t: n.t, lane, end });
      free[lane] = (end || n.t) + 0.06;
      prev = { lane, t: n.t, c: n.c };
      if (L.chord && n.sub === 1 && n.s >= 0.7 && (((n.bi - a.down) % L.chord) + L.chord) % L.chord === 0) {
        const other = nearestFree(k - 1 - lane, n.t);
        if (other >= 0 && other !== lane) { notes.push({ t: n.t, lane: other, end: 0 }); free[other] = n.t + 0.06; }
      }
    }
    if (mirror) for (const n of notes) n.lane = k - 1 - n.lane;
    notes.sort((x, y) => x.t - y.t || x.lane - y.lane);
    const holds = notes.filter(n => n.end).length;
    const span = notes.length > 1 ? notes[notes.length - 1].t - notes[0].t : 1;
    const nps = notes.length / Math.max(10, span);
    return { notes, count: notes.length, holds, units: notes.length + holds, level: Math.max(1, Math.min(15, Math.round(nps * 1.7 + (k - 4) * 0.5))) };
  }

  window.RKAnalyze = { VERSION, analyze, chart };
})();
