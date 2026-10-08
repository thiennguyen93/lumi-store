/* Rhythm Keys — the person's library: the songs they added, their
   collections, and each song's reading (analyze.js). Nothing ships with the
   extension; every song is one the person chose.

   A song is two blobs in the extension's storage — its sound, as it
   arrived, and its reading, as JSON — and a line in the list, which is kept
   under the `library` key (RKBridge). Downloads and files from the Mac
   arrive as blobs already; a reading is written by the page. */
(function () {
  'use strict';

  const B = window.RKBridge;
  // What Lumi gives one extension's storage.
  const LIMIT = 512 * 1024 * 1024;

  // ---------- the list ----------
  let meta = { songs: [], collections: [] };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f());
  const ready = B.load().then(kept => {
    try { if (kept && kept.library) meta = Object.assign(meta, JSON.parse(kept.library)); } catch { /* a fresh library */ }
    // A line whose sound was never kept as a blob cannot be played: let it go.
    meta.songs = meta.songs.filter(s => s.audio && s.reading);
    emit();
  }, () => emit());
  function save() {
    B.save('library', JSON.stringify(meta));
    emit();
  }
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

  // In flight: downloads and readings, by id. Not kept.
  const jobs = new Map();
  const job = (id, patch) => { jobs.set(id, Object.assign(jobs.get(id) || {}, patch)); emit(); };

  // Decoded songs are big; keep the last two.
  const buffers = new Map(), readings = new Map();
  function remember(id, buffer) {
    buffers.delete(id);
    buffers.set(id, buffer);
    while (buffers.size > 2) buffers.delete(buffers.keys().next().value);
  }

  // ---------- reading a file's own title and artist (ID3v2) ----------
  function text(d, enc) {
    try {
      let label = ['latin1', 'utf-16le', 'utf-16be', 'utf-8'][enc] || 'utf-8';
      if (enc === 1 && d.length >= 2) {
        if (d[0] === 0xfe && d[1] === 0xff) { label = 'utf-16be'; d = d.subarray(2); }
        else if (d[0] === 0xff && d[1] === 0xfe) { label = 'utf-16le'; d = d.subarray(2); }
      }
      return new TextDecoder(label).decode(d).replace(/\0+$/, '').trim() || undefined;
    } catch { return undefined; }
  }
  function tags(bytes) {
    const b = new Uint8Array(bytes);
    if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33 || b[5] & 0x40) return {};
    const v = b[3], end = Math.min(b.length, 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]));
    const out = {};
    let p = 10;
    while (p + 10 <= end) {
      const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
      const len = v === 4
        ? (b[p + 4] << 21) | (b[p + 5] << 14) | (b[p + 6] << 7) | b[p + 7]
        : ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]) >>> 0;
      if (!/^[A-Z0-9]{4}$/.test(id) || len <= 0 || p + 10 + len > end) break;
      if (id === 'TIT2' || id === 'TPE1') out[id] = text(b.subarray(p + 11, p + 10 + len), b[p + 10]);
      p += 10 + len;
    }
    return { title: out.TIT2, artist: out.TPE1 };
  }

  const keepReading = reading => B.putBlob(new TextEncoder().encode(JSON.stringify(reading)));

  // ---------- adding ----------
  // A song whose sound is already a blob: read it, keep the reading, list it.
  // A song that cannot be read is let go of, so nothing is kept for nothing.
  async function ingest(id, audio, bytes, info) {
    job(id, { stage: 'reading', progress: 0, title: info.title, error: null });
    try {
      const buffer = await RKAudio.decode(bytes);
      const reading = await RKAnalyze.analyze(buffer, p => job(id, { progress: p }));
      const kept = await keepReading(reading);
      remember(id, buffer);
      readings.set(id, reading);
      meta.songs.unshift(Object.assign({
        id, artist: 'Unknown artist', source: 'mac', license: null, licenseUrl: null, landing: null,
        duration: buffer.duration, bpm: Math.round(reading.bpm), size: bytes.byteLength,
        addedAt: Date.now(), fav: false, offset: 0, audio, reading: kept,
      }, info));
      jobs.delete(id);
      save();
    } catch {
      B.forget([audio]);
      job(id, { stage: 'error', error: 'This file could not be read as audio.' });
    }
  }

  // Songs from the Mac: Lumi's Open panel, each file a blob already.
  async function addFromMac() {
    let opened;
    try { opened = await B.openFiles(); } catch { return; }
    for (const file of opened) {
      const id = uid();
      const title = file.name.replace(/\.[^.]+$/, '');
      job(id, { stage: 'reading', progress: 0, title, error: null });
      let bytes;
      try { bytes = await B.getBlob(file.blob); } catch { job(id, { stage: 'error', error: 'That file could not be opened.' }); continue; }
      const t = tags(bytes);
      await ingest(id, file.blob, bytes, { title: t.title || title, artist: t.artist || 'Unknown artist', source: 'mac' });
    }
  }

  // Files dropped on the window, where the webview hands them over.
  async function addDropped(files) {
    for (const file of files) {
      const id = uid();
      const title = file.name.replace(/\.[^.]+$/, '');
      job(id, { stage: 'reading', progress: 0, title, error: null });
      let bytes, blob;
      try { bytes = await file.arrayBuffer(); blob = await B.putBlob(bytes); } catch { job(id, { stage: 'error', error: 'That file could not be kept.' }); continue; }
      const t = tags(bytes);
      await ingest(id, blob, bytes, { title: t.title || title, artist: t.artist || 'Unknown artist', source: 'mac' });
    }
  }

  async function downloaded(id, url, fail) {
    job(id, { stage: 'downloading', progress: null, error: null });
    try {
      const got = await B.download(url);
      return { blob: got.blob, bytes: await B.getBlob(got.blob) };
    } catch {
      job(id, { stage: 'error', error: fail });
      return null;
    }
  }

  async function addFromCatalog(item) {
    if (has(item.id) || (jobs.has(item.id) && jobs.get(item.id).stage !== 'error')) return;
    job(item.id, { title: item.title });
    const got = await downloaded(item.id, item.url, 'The download did not finish.');
    if (!got) return;
    await ingest(item.id, got.blob, got.bytes, {
      title: item.title, artist: item.artist, source: item.source,
      license: item.license, licenseUrl: item.licenseUrl, landing: item.landing,
    });
  }

  async function addFromLink(url) {
    const id = uid();
    let name = 'Song';
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Song').replace(/\.[^.]+$/, ''); } catch { /* keep "Song" */ }
    job(id, { title: name });
    const got = await downloaded(id, url, 'That link did not give a file this Mac could download.');
    if (!got) return;
    const t = tags(got.bytes);
    await ingest(id, got.blob, got.bytes, { title: t.title || name, artist: t.artist || 'Unknown artist', source: 'link', landing: url });
  }

  // ---------- reading back ----------
  const has = id => meta.songs.some(s => s.id === id);
  const song = id => meta.songs.find(s => s.id === id);

  async function buffer(id) {
    if (buffers.has(id)) { const b = buffers.get(id); remember(id, b); return b; }
    const s = song(id);
    if (!s) throw new Error('no such song');
    const b = await RKAudio.decode(await B.getBlob(s.audio));
    remember(id, b);
    return b;
  }
  // A reading from an older Rhythm Keys is read again, and replaces it.
  async function reading(id) {
    if (readings.has(id)) return readings.get(id);
    const s = song(id);
    if (!s) throw new Error('no such song');
    let r = null;
    try { r = JSON.parse(new TextDecoder().decode(await B.getBlob(s.reading))); } catch { r = null; }
    if (!r || r.v !== RKAnalyze.VERSION) {
      r = await RKAnalyze.analyze(await buffer(id), () => {});
      const old = s.reading;
      s.reading = await keepReading(r);
      B.forget([old]);
      save();
    }
    readings.set(id, r);
    return r;
  }

  async function remove(id) {
    const s = song(id);
    if (!s) return;
    buffers.delete(id);
    readings.delete(id);
    meta.songs = meta.songs.filter(x => x.id !== id);
    for (const c of meta.collections) c.songs = c.songs.filter(x => x !== id);
    save();
    await B.forget([s.audio, s.reading]);
  }
  function update(id, patch) { const s = song(id); if (s) { Object.assign(s, patch); save(); } }

  // ---------- collections ----------
  function createCollection(name) { const c = { id: uid(), name, songs: [] }; meta.collections.push(c); save(); return c; }
  function renameCollection(id, name) { const c = meta.collections.find(x => x.id === id); if (c) { c.name = name; save(); } }
  function removeCollection(id) { meta.collections = meta.collections.filter(x => x.id !== id); save(); }
  function toggleIn(cid, sid) {
    const c = meta.collections.find(x => x.id === cid);
    if (!c) return;
    c.songs = c.songs.includes(sid) ? c.songs.filter(x => x !== sid) : c.songs.concat(sid);
    save();
  }

  window.RKLibrary = {
    LIMIT, ready,
    get songs() { return meta.songs; },
    get collections() { return meta.collections; },
    jobs,
    song, has, buffer, reading, remove, update,
    addFromMac, addDropped, addFromCatalog, addFromLink,
    dismiss(id) { jobs.delete(id); emit(); },
    createCollection, renameCollection, removeCollection, toggleIn,
    used: () => meta.songs.reduce((n, s) => n + (s.size || 0), 0),
    on(f) { listeners.add(f); },
  };
})();
