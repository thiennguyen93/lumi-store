/* Rhythm Keys — everything the page asks of Lumi, in one place.

   In Lumi (a `lumi-ext:` page) the extension's component answers `call`s —
   keeping the library and progress, searching for free music, the Open
   panel, letting go of blobs — and the bridge itself downloads and keeps
   bytes. In a browser, under scripts/preview_ui.py, the bridge's own routes
   are stood in for and `call` is not: what the component would do is done
   here instead, so the game still runs from start to finish there. */
(function () {
  'use strict';

  const IN_LUMI = location.protocol === 'lumi-ext:';
  // In Lumi the page is the window: it fills it (game.css), and its top is
  // the title bar — as tall as Lumi says, with the traffic lights' room at
  // its left end, given back in full screen where there are none.
  if (IN_LUMI) {
    const root = document.documentElement, q = new URLSearchParams(location.search);
    root.classList.add('in-lumi');
    if (q.get('titlebar') === 'unified') {
      const bar = Number(q.get('bar')) || 44, lights = Number(q.get('lights')) || 0;
      root.style.setProperty('--bar', bar + 'px');
      const room = full => root.style.setProperty('--lights', (full ? 0 : lights) + 'px');
      room(false);
      window.addEventListener('lumi:full-screen', e => room(!!(e.detail && e.detail.full)));
      fetch('/__lumi__/full-screen').then(r => (r.ok ? r.json() : null)).then(a => a && room(!!a.full), () => {});
      // The band moves the window, as a title bar does.
      document.addEventListener('DOMContentLoaded', () => {
        const band = document.querySelector('.top');
        if (!band) return;
        band.addEventListener('pointerdown', e => {
          if (e.button !== 0 || e.target.closest('button, input')) return;
          e.preventDefault();
          fetch('/__lumi__/drag', { method: 'POST' });
        });
        band.addEventListener('dblclick', e => {
          if (e.target.closest('button, input')) return;
          fetch('/__lumi__/titlebar-double-click', { method: 'POST' });
        });
      });
    }
  }
  const SEARCH = 'https://api.openverse.org/v1/audio/';

  async function call(kind, extra) {
    const r = await fetch('/__lumi__/call', { method: 'POST', body: JSON.stringify(Object.assign({ kind }, extra || {})) });
    const text = await r.text();
    if (!r.ok) throw new Error(text || 'Rhythm Keys did not answer.');
    return text ? JSON.parse(text) : {};
  }

  async function ok(r, what) {
    if (r.ok) return r;
    const said = await r.text().catch(() => '');
    throw new Error(said || what + ' answered ' + r.status);
  }

  // ---------- kept values: the library, the player's progress ----------
  let loaded = null;
  function load() {
    if (!loaded) {
      loaded = IN_LUMI
        ? call('load')
        : Promise.resolve({ library: localStorage.getItem('rhythm-keys:library'), progress: localStorage.getItem('rhythm-keys:progress') });
    }
    return loaded;
  }
  // The latest of each, written once the writes stop for a moment.
  const pending = new Map();
  let timer = null;
  function save(key, value) {
    pending.set(key, value);
    clearTimeout(timer);
    timer = setTimeout(() => flush(), 400);
  }
  function flush(tries) {
    clearTimeout(timer);
    const writes = [...pending];
    pending.clear();
    for (const [key, value] of writes) {
      if (!IN_LUMI) { try { localStorage.setItem('rhythm-keys:' + key, value); } catch { /* not kept */ } continue; }
      call('save', { key, value }).catch(() => {
        // Busy with four other things, or a hiccup: try again, unless a
        // newer value has been asked to be kept since.
        if ((tries || 0) < 5 && !pending.has(key)) {
          pending.set(key, value);
          timer = setTimeout(() => flush((tries || 0) + 1), 600);
        }
      });
    }
  }
  // A closed window is gone, page and all (⌘W, the red button): the last
  // writes go as it leaves, or as soon as it loses the keyboard.
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('blur', () => flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // ---------- bytes: blobs in the extension's storage ----------
  async function putBlob(bytes) {
    const r = await ok(await fetch('/__lumi__/blob', { method: 'PUT', body: bytes }), 'keeping');
    return (await r.json()).blob;
  }
  async function getBlob(id) {
    const r = await ok(await fetch('/__lumi__/blob/' + encodeURIComponent(id)), 'reading');
    return r.arrayBuffer();
  }
  // A whole file into storage. Lumi says nothing until it is done.
  async function download(url) {
    const r = await ok(await fetch('/__lumi__/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    }), 'downloading');
    return r.json();
  }
  // A file's first `most` bytes, straight back, nothing kept.
  async function head(url, most) {
    const r = await ok(await fetch('/__lumi__/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, most, keep: false }),
    }), 'listening');
    return r.arrayBuffer();
  }
  function forget(blobs) {
    const ids = blobs.filter(Boolean);
    if (IN_LUMI && ids.length) return call('forget', { blobs: ids }).catch(() => {});
    return Promise.resolve();
  }

  // ---------- the rest ----------
  async function search(q) {
    if (IN_LUMI) return call('search', { q });
    const r = await fetch(SEARCH + '?' + new URLSearchParams({ q, category: 'music', page_size: '20' }));
    if (r.status === 429) throw new Error('Too many searches for now. Try again in a minute.');
    if (!r.ok) throw new Error('Free music search is not answering right now.');
    return r.json();
  }

  // Songs from the Mac, as blobs: Lumi's Open panel in Lumi; a file input,
  // each file kept through the bridge, in the preview. Called on a press.
  function openFiles() {
    if (IN_LUMI) return call('open-files');
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.aiff,.aif,.flac';
      input.onchange = async () => {
        const out = [];
        for (const file of input.files) out.push({ name: file.name, blob: await putBlob(await file.arrayBuffer()) });
        resolve(out);
      };
      input.click();
    });
  }

  async function usage() {
    if (IN_LUMI) return call('usage');
    return null;
  }
  function openUrl(url) {
    if (IN_LUMI) call('open', { url }).catch(() => {});
    else window.open(url, '_blank', 'noopener');
  }

  window.RKBridge = { IN_LUMI, load, save, flush, putBlob, getBlob, download, head, forget, search, openFiles, usage, openUrl };
})();
