/* Rhythm Keys — the person's library: the songs they added, their
   collections, and each song's reading (analyze.js). Nothing ships with the
   extension; every song is one the person chose.

   Kept here in the browser (IndexedDB for the sound and its reading,
   localStorage for the list) so the preview works on its own. In Lumi the
   same calls land in the extension's storage: a download is
   `POST /__lumi__/download`, a file from the Mac is `files.open`, the
   bytes come back from `/__lumi__/blob/<id>`, the list is a storage key. */
(function () {
  'use strict';

  // What Lumi gives one extension's storage.
  const LIMIT = 512 * 1024 * 1024;
  const META = 'rhythm-keys:library';

  // ---------- IndexedDB, for the bytes ----------
  let db = null;
  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('rhythm-keys', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('audio'); r.result.createObjectStore('analysis'); };
      r.onsuccess = () => resolve((db = r.result));
      r.onerror = () => reject(r.error);
    });
  }
  async function idb(store, mode, run) {
    await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), req = run(t.objectStore(store));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  }
  const get = (s, k) => idb(s, 'readonly', st => st.get(k));
  const put = (s, k, v) => idb(s, 'readwrite', st => st.put(v, k));
  const del = (s, k) => idb(s, 'readwrite', st => st.delete(k));

  // ---------- the list ----------
  let meta = { songs: [], collections: [] };
  try { const raw = localStorage.getItem(META); if (raw) meta = Object.assign(meta, JSON.parse(raw)); } catch { /* a fresh library */ }
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f());
  function save() {
    try { localStorage.setItem(META, JSON.stringify(meta)); } catch { /* not kept; this session still has it */ }
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

  // ---------- adding ----------
  async function ingest(id, bytes, info) {
    job(id, { stage: 'reading', progress: 0, title: info.title, error: null });
    try {
      const buffer = await RKAudio.decode(bytes);
      const reading = await RKAnalyze.analyze(buffer, p => job(id, { progress: p }));
      await put('audio', id, bytes);
      await put('analysis', id, reading);
      remember(id, buffer);
      readings.set(id, reading);
      meta.songs.unshift(Object.assign({
        id, artist: 'Unknown artist', source: 'mac', license: null, licenseUrl: null, landing: null,
        duration: buffer.duration, bpm: Math.round(reading.bpm), size: bytes.byteLength,
        addedAt: Date.now(), fav: false, offset: 0,
      }, info));
      jobs.delete(id);
      save();
    } catch {
      job(id, { stage: 'error', error: 'This file could not be read as audio.' });
    }
  }

  async function addFiles(files) {
    for (const file of files) {
      const id = uid();
      job(id, { stage: 'reading', progress: 0, title: file.name });
      const bytes = await file.arrayBuffer();
      const t = tags(bytes);
      await ingest(id, bytes, { title: t.title || file.name.replace(/\.[^.]+$/, ''), artist: t.artist || 'Unknown artist', source: 'mac' });
    }
  }

  // A download, the way Lumi does it for a page: `POST /__lumi__/download`
  // fetches the file into the extension's storage — the page has no network
  // of its own, and the other site's CORS does not apply — then the bytes
  // come back from `/__lumi__/blob/<id>`. Lumi says nothing until it is done,
  // so there is no percentage to show.
  async function fetchBytes(url) {
    const r = await fetch('/__lumi__/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!r.ok) throw new Error('download answered ' + r.status);
    const { blob } = await r.json();
    const b = await fetch('/__lumi__/blob/' + encodeURIComponent(blob));
    if (!b.ok) throw new Error('blob answered ' + b.status);
    return b.arrayBuffer();
  }

  async function addFromCatalog(item) {
    if (has(item.id) || jobs.has(item.id)) return;
    job(item.id, { stage: 'downloading', progress: null, title: item.title, error: null });
    let bytes;
    try {
      bytes = await fetchBytes(item.url);
    } catch {
      job(item.id, { stage: 'error', error: 'The download did not finish.' });
      return;
    }
    await ingest(item.id, bytes, {
      title: item.title, artist: item.artist, source: item.source,
      license: item.license, licenseUrl: item.licenseUrl, landing: item.landing,
    });
  }

  async function addFromLink(url) {
    const id = uid();
    let name = 'Song';
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Song').replace(/\.[^.]+$/, ''); } catch { /* keep "Song" */ }
    job(id, { stage: 'downloading', progress: null, title: name, error: null });
    let bytes;
    try {
      bytes = await fetchBytes(url);
    } catch {
      job(id, { stage: 'error', error: 'That link did not give a file this Mac could download.' });
      return;
    }
    const t = tags(bytes);
    await ingest(id, bytes, { title: t.title || name, artist: t.artist || 'Unknown artist', source: 'link', landing: url });
  }

  // ---------- reading back ----------
  const has = id => meta.songs.some(s => s.id === id);
  const song = id => meta.songs.find(s => s.id === id);

  async function buffer(id) {
    if (buffers.has(id)) { const b = buffers.get(id); remember(id, b); return b; }
    const bytes = await get('audio', id);
    const b = await RKAudio.decode(bytes);
    remember(id, b);
    return b;
  }
  async function reading(id) {
    if (readings.has(id)) return readings.get(id);
    let r = await get('analysis', id);
    if (!r || r.v !== RKAnalyze.VERSION) { r = await RKAnalyze.analyze(await buffer(id), () => {}); await put('analysis', id, r); }
    readings.set(id, r);
    return r;
  }

  async function remove(id) {
    await del('audio', id);
    await del('analysis', id);
    buffers.delete(id);
    readings.delete(id);
    meta.songs = meta.songs.filter(s => s.id !== id);
    for (const c of meta.collections) c.songs = c.songs.filter(x => x !== id);
    save();
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
    LIMIT,
    get songs() { return meta.songs; },
    get collections() { return meta.collections; },
    jobs,
    song, has, buffer, reading, remove, update,
    addFiles, addFromCatalog, addFromLink,
    dismiss(id) { jobs.delete(id); emit(); },
    createCollection, renameCollection, removeCollection, toggleIn,
    used: () => meta.songs.reduce((n, s) => n + (s.size || 0), 0),
    on(f) { listeners.add(f); },
  };
})();
