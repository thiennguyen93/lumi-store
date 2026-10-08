/* Rhythm Keys — listening before playing. One listen at a time: a song in
   the free music search, heard from the first few hundred kilobytes before
   anything is downloaded, or a song in the library, heard at its liveliest. */
(function () {
  'use strict';

  const A = window.RKAudio;
  // About thirty seconds of a typical MP3: fifteen of them heard from a
  // third of the way in, fetched in a second or two from a slow server.
  const HEAD = 480 * 1024;
  const LENGTH = 15;

  let now = null; // { key, state: 'loading' | 'playing' | 'error', handle, at, length }
  const heads = new Map(); // decoded heads of search results, the last few
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f());

  // The first bytes of a song, not kept: in Lumi a page has no network of
  // its own, so this is the bridge's download asked for only its start and
  // for the bytes back rather than a blob (`most`, `keep: false`; Lumi 1.44.0).
  async function head(url) {
    const r = await fetch('/__lumi__/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, most: HEAD, keep: false }),
    });
    if (!r.ok) throw new Error('listen answered ' + r.status);
    return r.arrayBuffer();
  }

  function stop() {
    if (!now) return;
    if (now.handle) now.handle.stop();
    now = null;
    emit();
  }

  function play(key, buffer, from) {
    if (!now || now.key !== key) return; // stopped, or another listen began, while this one loaded
    const handle = A.preview(buffer, from, LENGTH);
    now = { key, state: 'playing', handle, at: A.time, length: Math.min(LENGTH, buffer.duration - from) };
    handle.ended(() => { if (now && now.handle === handle) { now = null; emit(); } });
    emit();
  }

  function failed(key) {
    if (!now || now.key !== key) return;
    now = { key, state: 'error' };
    emit();
    setTimeout(() => { if (now && now.key === key && now.state === 'error') { now = null; emit(); } }, 2500);
  }

  // A search result: toggles. Heard a third of the way into what arrived.
  async function result(item) {
    if (now && now.key === item.id) { stop(); return; }
    stop();
    now = { key: item.id, state: 'loading' };
    emit();
    try {
      let buffer = heads.get(item.id);
      if (!buffer) {
        buffer = await A.decode(await head(item.url));
        heads.set(item.id, buffer);
        while (heads.size > 4) heads.delete(heads.keys().next().value);
      }
      play(item.id, buffer, Math.max(0, Math.min(buffer.duration * 0.3, buffer.duration - LENGTH)));
    } catch {
      failed(item.id);
    }
  }

  // The fifteen loudest seconds between the song's first sixth and its last
  // quarter — most often the chorus — started on the bar line before them.
  function liveliest(reading) {
    const L = reading.loud, rate = 20, n = LENGTH * rate;
    if (L.length <= n) return 0;
    const pre = [0];
    for (let i = 0; i < L.length; i++) pre.push(pre[i] + L[i]);
    let best = -1, at = 0;
    for (let i = Math.floor(L.length / 6); i <= Math.min(L.length - n, Math.floor(L.length * 0.75)); i++) {
      const v = pre[i + n] - pre[i];
      if (v > best) { best = v; at = i; }
    }
    const t = at / rate;
    let bar = null;
    reading.beats.forEach((b, k) => { if (b <= t && (((k - reading.down) % 4) + 4) % 4 === 0) bar = b; });
    return bar !== null && t - bar < 4 ? bar : t;
  }

  // A song in the library: starts unless it is the one already heard.
  async function song(id) {
    if (now && now.key === id && now.state !== 'error') return;
    stop();
    now = { key: id, state: 'loading' };
    emit();
    try {
      const [buffer, reading] = await Promise.all([RKLibrary.buffer(id), RKLibrary.reading(id)]);
      play(id, buffer, liveliest(reading));
    } catch {
      failed(id);
    }
  }

  window.RKPreview = {
    result, song, stop,
    state: key => (now && now.key === key ? now.state : null),
    playing: () => (now && now.state === 'playing' ? now.key : null),
    progress: () => (now && now.state === 'playing' ? Math.min(1, (A.time - now.at) / now.length) : 0),
    on(f) { listeners.add(f); },
  };
})();
