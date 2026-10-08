/* Rhythm Keys — the game: the library, the keys, judging and the highway.
   Songs come from library.js, their notes from analyze.js, the sound from
   audio.js. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const Lib = window.RKLibrary, A = window.RKAudio, Read = window.RKAnalyze;
  const DIFFS = [['easy', 'Easy', '#5fd38d'], ['normal', 'Normal', '#6fa8ff'], ['hard', 'Hard', '#f5b83d'], ['expert', 'Expert', '#ff6b8b']];
  const KEYS = {
    4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
    7: ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'],
  };
  const LANE_COLORS = {
    4: ['#6fa8ff', '#f5b83d', '#f5b83d', '#6fa8ff'],
    6: ['#6fa8ff', '#f5b83d', '#6fa8ff', '#6fa8ff', '#f5b83d', '#6fa8ff'],
    7: ['#6fa8ff', '#f5b83d', '#6fa8ff', '#c48bff', '#6fa8ff', '#f5b83d', '#6fa8ff'],
  };
  // Windows are either side of the note, in seconds.
  const JUDGE = {
    perfect: { label: 'Perfect', color: '#f5c451', w: 1, win: 0.045 },
    great: { label: 'Great', color: '#5fd38d', w: 0.75, win: 0.09 },
    good: { label: 'Good', color: '#6fa8ff', w: 0.4, win: 0.135 },
    miss: { label: 'Miss', color: '#ff6b6b', w: 0, win: 0.18 },
  };
  const GRADE_COLORS = { 'S+': '#f5b83d', S: '#f5b83d', A: '#5fd38d', B: '#6fa8ff', C: '#c48bff', D: '#ff6b6b' };
  const COVERS = ['#E8A33D', '#E5685F', '#A66BFF', '#2FB5A3', '#4C8DF6', '#E86A92', '#5FB85A', '#D9774B'];
  const LEAD_IN = 2.4;
  // ?autoplay: the game plays itself, on the beat — a demo to watch.
  const AUTOPLAY = new URLSearchParams(location.search).has('autoplay');

  // ---------- what is kept ----------
  // Settings, best scores and the daily streak: the `progress` key in the
  // extension's storage (RKBridge), read once as the window opens.
  const DEFAULTS = { sel: null, view: 'all', diff: 'normal', lanes: 4, speed: 2.2, offset: 0, music: 0.8, sfx: 0.5, hitsound: true, listen: true, earlyLate: true, flash: true, calm: false };
  let saved = { settings: {}, best: {}, daily: { last: '', streak: 0 } };
  const S = Object.assign({}, DEFAULTS);
  S.keys = Object.assign({}, KEYS);
  function restore(raw) {
    try { if (raw) saved = Object.assign(saved, JSON.parse(raw)); } catch { /* nothing kept yet */ }
    Object.assign(S, saved.settings);
    S.keys = Object.assign({}, KEYS, (saved.settings && saved.settings.keys) || {});
  }
  function persist() {
    saved.settings = S;
    RKBridge.save('progress', JSON.stringify(saved));
  }

  // ---------- small things ----------
  const keyLabel = code => {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return { Space: 'Space', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[', BracketRight: ']',
      ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: '⇧', ShiftRight: '⇧' }[code] || code;
  };
  const fmt = sec => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  const mb = bytes => (bytes / 1048576 < 10 ? (bytes / 1048576).toFixed(1) : Math.round(bytes / 1048576)) + ' MB';
  const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = dayKey(new Date());
  const sourceLabel = s => (s.source === 'mac' ? 'Your Mac' : s.source === 'link' ? 'A link' : s.source);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const PLAY = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>';
  const STOP = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2" fill="currentColor"/></svg>';
  function cover(song, big) {
    const c = el('span', 'cover' + (big ? ' big' : ''));
    c.style.setProperty('--c', COVERS[hash(song.id) % COVERS.length]);
    c.appendChild(el('span', 'initial', (song.title.trim()[0] || '♪').toUpperCase()));
    const eq = el('span', 'eq');
    for (let i = 0; i < 3; i++) eq.appendChild(el('i'));
    c.appendChild(eq);
    return c;
  }

  // Choosing a song is hearing it, unless that is turned off.
  function choose(sel) {
    S.sel = sel;
    persist();
    renderHome();
    if (S.listen) listenToChosen();
  }
  function listenToChosen() {
    const pick = current();
    if (pick) RKPreview.song(pick.song.id);
  }
  function toggleListen() {
    const pick = current();
    if (pick && (RKPreview.playing() === pick.song.id || RKPreview.state(pick.song.id) === 'loading')) RKPreview.stop();
    else listenToChosen();
  }

  // Today's song: the date picks one of the library's, and on odd picks
  // the chart is mirrored, so a song played often still reads new.
  function daily() {
    const songs = Lib.songs.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!songs.length) return null;
    const h = hash('daily:' + today);
    return { song: songs[h % songs.length], mirror: ((h >> 7) & 1) === 1, day: today };
  }
  function current() {
    if (S.sel === 'daily') { const d = daily(); return d && Object.assign({ daily: true }, d); }
    const song = Lib.song(S.sel) || visible()[0];
    return song ? { song, mirror: false, daily: false } : null;
  }
  const bestKey = pick => (pick.daily ? 'daily-' + pick.day : pick.song.id) + ':' + S.diff + ':' + S.lanes;

  // Readings and charts, loaded once, made on the spot.
  const readings = new Map(), charts = new Map();
  function readingNow(id) {
    const r = readings.get(id);
    if (r && r !== 'loading') return r;
    if (!r) {
      readings.set(id, 'loading');
      Lib.reading(id).then(x => { readings.set(id, x); if (screen === 'home') renderHome(); }, () => readings.delete(id));
    }
    return null;
  }
  function chartNow(id, diff, k, mirror) {
    const key = id + ':' + diff + ':' + k + ':' + (mirror ? 1 : 0);
    if (charts.has(key)) return charts.get(key);
    const r = readingNow(id);
    if (!r) return null;
    const c = Read.chart(r, diff, k, mirror);
    charts.set(key, c);
    return c;
  }

  // ---------- screens ----------
  let screen = 'home';
  function show(name) {
    if (name !== 'home') RKPreview.stop();
    screen = name;
    for (const id of ['home', 'play-screen', 'results', 'settings', 'calibrate']) $('#' + id).hidden = id !== (name === 'play' ? 'play-screen' : name);
    $('#app').classList.toggle('playing', name === 'play');
    // The band names the song while it plays, the game otherwise.
    if (name !== 'play') $('#band-title').textContent = 'Rhythm Keys';
    if (name === 'home') renderHome();
    if (name === 'settings') renderSettings();
  }

  function segmented(box, items, currentValue, onPick) {
    box.textContent = '';
    for (const it of items) {
      const b = el('button', null, it.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(it.value === currentValue));
      if (it.badge != null) {
        const s = el('b', null, it.badge);
        if (it.color) s.style.setProperty('--d', it.color);
        b.appendChild(s);
      }
      b.onclick = () => onPick(it.value);
      box.appendChild(b);
    }
  }

  // ---------- the library ----------
  let query = '', naming = false, renaming = null, sureCollection = null;

  function visible() {
    let list = Lib.songs;
    if (S.view === 'fav') list = list.filter(s => s.fav);
    else if (S.view !== 'all') {
      const c = Lib.collections.find(x => x.id === S.view);
      list = c ? c.songs.map(id => Lib.song(id)).filter(Boolean) : list;
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(s => (s.title + ' ' + s.artist).toLowerCase().includes(q));
    return list;
  }

  function streakNow() {
    const d = saved.daily;
    if (!d.last) return 0;
    const gap = Math.round((Date.parse(today) - Date.parse(d.last)) / 864e5);
    return gap <= 1 ? d.streak : 0;
  }

  function gradeBadge(key) {
    const best = saved.best[key], g = el('span', 'grade-badge', best ? best.grade : '–');
    if (best) g.style.setProperty('--g', GRADE_COLORS[best.grade]);
    return g;
  }

  function renderChips() {
    const box = $('#chips');
    box.textContent = '';
    const chip = (id, label, n) => {
      const b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(S.view === id));
      if (renaming === id) {
        const input = el('input');
        input.value = label;
        b.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); });
        let over = false;
        const done = keep => { if (over) return; over = true; const name = input.value.trim(); renaming = null; if (keep && name) Lib.renameCollection(id, name); else renderHome(); };
        input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
        input.onblur = () => done(true);
      } else {
        b.append(label, el('span', 'n', n));
        b.onclick = () => { S.view = id; sureCollection = null; persist(); renderHome(); };
        if (id !== 'all' && id !== 'fav') {
          b.ondblclick = () => { renaming = id; renderHome(); };
          if (S.view === id) {
            const x = el('span', 'x', sureCollection === id ? 'Delete?' : '×');
            x.title = 'Delete this collection (the songs stay)';
            x.onclick = e => {
              e.stopPropagation();
              if (sureCollection === id) { sureCollection = null; S.view = 'all'; persist(); Lib.removeCollection(id); }
              else { sureCollection = id; renderHome(); }
            };
            b.appendChild(x);
          }
        }
      }
      box.appendChild(b);
    };
    chip('all', 'All', Lib.songs.length);
    chip('fav', '★ Favourites', Lib.songs.filter(s => s.fav).length);
    for (const c of Lib.collections) chip(c.id, c.name, c.songs.length);
    const add = el('button', 'chip');
    add.type = 'button';
    if (naming) {
      const input = el('input');
      input.placeholder = 'Collection name';
      add.appendChild(input);
      setTimeout(() => input.focus());
      let over = false;
      const done = keep => {
        if (over) return;
        over = true;
        const name = input.value.trim();
        naming = false;
        if (keep && name) { const c = Lib.createCollection(name); S.view = c.id; persist(); }
        renderHome();
      };
      input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      input.onblur = () => done(true);
    } else {
      add.textContent = '+ New';
      add.title = 'New collection';
      add.onclick = () => { naming = true; renderHome(); };
    }
    box.appendChild(add);
  }

  function jobRow(id, j, inSheet) {
    const li = el('li', inSheet ? '' : 'song job');
    const pct = Math.round((j.progress || 0) * 100);
    const what = j.stage === 'error' ? j.error : j.stage === 'downloading' ? 'Downloading…' : 'Reading the song… ' + pct + '%';
    // A download says nothing until it is done: a bar that moves, not a number.
    const bar = () => { const b = el('div', 'bar-in' + (j.stage === 'downloading' ? ' busy' : '')), i = el('i'); i.style.width = pct + '%'; b.appendChild(i); return b; };
    if (inSheet) {
      const top = el('div', 'row-top');
      top.append(el('span', 't-name', j.title), el('span', j.stage === 'error' ? 'err' : 'meta', what));
      li.appendChild(top);
      if (j.stage === 'error') { const x = el('button', 'link', 'Dismiss'); x.type = 'button'; x.onclick = () => Lib.dismiss(id); li.appendChild(x); }
      else li.appendChild(bar());
      return li;
    }
    li.appendChild(cover({ id, title: j.title || '?' }));
    const text = el('span');
    text.append(el('div', 't-name', j.title), el('div', 'meta', what));
    if (j.stage !== 'error') text.appendChild(bar());
    li.append(text, el('span'), el('span'));
    return li;
  }

  function renderHome() {
    if (naming || renaming) { renderChips(); return; } // typing a name: leave the field be
    const songs = Lib.songs, jobs = [...Lib.jobs.entries()];
    const emptyLib = !songs.length && !jobs.length;
    $('#empty').hidden = !emptyLib;
    for (const id of ['#songs', '#q', '#chips', '#diffs', '#lanes', '#play']) $(id).hidden = emptyLib;

    const d = daily();
    const card = $('#daily');
    card.hidden = !d;
    if (d) {
      const color = COVERS[hash(d.song.id) % COVERS.length];
      card.classList.toggle('on', S.sel === 'daily');
      card.style.setProperty('--c', color);
      const c = card.querySelector('.cover');
      c.style.setProperty('--c', color);
      c.textContent = '';
      c.appendChild(el('span', 'initial', (d.song.title.trim()[0] || '♪').toUpperCase()));
      const eq = el('span', 'eq');
      for (let i = 0; i < 3; i++) eq.appendChild(el('i'));
      c.appendChild(eq);
      $('#daily-date').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (d.mirror ? ' · mirrored' : '');
      $('#daily-name').textContent = d.song.title;
      $('#daily-meta').textContent = d.song.artist + ' · ' + fmt(d.song.duration);
      $('#streak').textContent = streakNow();
      card.onclick = () => (S.sel === 'daily' ? toggleListen() : choose('daily'));
      card.classList.toggle('playing', RKPreview.playing() === d.song.id && S.sel === 'daily');
      card.ondblclick = () => start();
    }

    renderChips();
    const ul = $('#songs');
    ul.textContent = '';
    if (S.view === 'all' && !query) for (const [id, j] of jobs) ul.appendChild(jobRow(id, j, false));
    const list = visible();
    const pick = current();
    for (const s of list) {
      const li = el('li', 'song');
      li.setAttribute('role', 'option');
      const on = pick && !pick.daily && pick.song.id === s.id;
      li.setAttribute('aria-selected', String(!!on));
      if (on) li.classList.add('on');
      if (RKPreview.playing() === s.id && on) li.classList.add('playing');
      if (on && RKPreview.state(s.id) === 'loading') li.classList.add('loading');
      const text = el('span');
      const name = el('div', 't-name', s.title);
      if (s.fav) name.appendChild(el('span', 'star', '★'));
      text.append(name, el('div', 'meta', s.artist + ' · ' + fmt(s.duration) + ' · ' + s.bpm + ' BPM'));
      const more = el('button', 'more', '⋯');
      more.type = 'button';
      more.title = 'Song info';
      more.onclick = e => { e.stopPropagation(); openInfo(s.id); };
      li.append(cover(s), text, gradeBadge(s.id + ':' + S.diff + ':' + S.lanes), more);
      li.onclick = () => (on ? toggleListen() : choose(s.id));
      li.ondblclick = () => { S.sel = s.id; start(); };
      ul.appendChild(li);
    }
    if (songs.length && !list.length) {
      ul.appendChild(el('li', 'note', query ? 'No song matches “' + query + '”.' : S.view === 'fav' ? 'Star a song in its info (⋯) to see it here.' : 'This collection is empty. Add songs to it from a song’s info (⋯).'));
    }
    const sel = ul.querySelector('li.on');
    if (sel) sel.scrollIntoView({ block: 'nearest' });

    const c = pick && chartNow(pick.song.id, S.diff, S.lanes, pick.mirror);
    segmented($('#diffs'), DIFFS.map(([v, label, color]) => {
      const ch = pick && chartNow(pick.song.id, v, S.lanes, pick.mirror);
      return { value: v, label, badge: ch ? ch.level : '·', color };
    }), S.diff, v => { S.diff = v; persist(); renderHome(); });
    segmented($('#lanes'), [4, 6, 7].map(k => ({ value: k, label: k + ' keys' })), S.lanes, v => { S.lanes = v; persist(); renderHome(); });
    $('#play').disabled = !pick || !c;
    $('#play-meta').textContent = !pick ? '' : c ? S.keys[S.lanes].map(keyLabel).join(' ') + ' · ' + c.count + ' notes' + (c.holds ? ' · ' + c.holds + ' holds' : '') : 'Reading…';
    $('#usage').textContent = songs.length ? songs.length + (songs.length === 1 ? ' song · ' : ' songs · ') + mb(Lib.used()) + ' of 512 MB · space to listen' : '';
  }

  // ---------- song info ----------
  let infoId = null, sureDelete = false;
  function openInfo(id) { infoId = id; sureDelete = false; renderInfo(); $('#info').hidden = false; }
  function closeInfo() { $('#info').hidden = true; infoId = null; renderHome(); }
  function renderInfo() {
    const s = Lib.song(infoId);
    if (!s) { closeInfo(); return; }
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#i-collections .field')) return;
    $('#i-title').textContent = s.title;
    $('#i-artist').textContent = s.artist;
    const facts = $('#i-facts');
    facts.textContent = '';
    for (const [k, v] of [['Length', fmt(s.duration)], ['Tempo', s.bpm + ' BPM'], ['Size', mb(s.size)], ['From', sourceLabel(s)]]) {
      const d = el('div');
      d.append(el('span', null, k), el('b', null, v));
      facts.appendChild(d);
    }
    const lic = $('#i-license');
    lic.textContent = '';
    if (s.license) {
      const a = el('button', 'link', s.license + ' ↗');
      a.type = 'button';
      a.title = 'Open the song’s page';
      a.onclick = () => RKBridge.openUrl(s.landing || s.licenseUrl);
      lic.appendChild(a);
    } else lic.textContent = s.source === 'mac' ? 'Your own file' : 'Not stated';
    $('#i-offset').textContent = (s.offset > 0 ? '+' : '') + (s.offset || 0) + ' ms';
    $('#i-fav').checked = !!s.fav;
    const box = $('#i-collections');
    box.textContent = '';
    for (const c of Lib.collections) {
      const row = el('label', 'check-row');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = c.songs.includes(s.id);
      cb.onchange = () => Lib.toggleIn(c.id, s.id);
      row.append(cb, el('span', null, c.name));
      box.appendChild(row);
    }
    const row = el('div', 'check-row');
    const input = el('input', 'field');
    input.placeholder = 'New collection with this song';
    input.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter' && input.value.trim()) { const name = input.value.trim(); input.blur(); const c = Lib.createCollection(name); Lib.toggleIn(c.id, s.id); }
      if (e.key === 'Escape') input.blur();
    };
    row.appendChild(input);
    box.appendChild(row);
    const del = $('#i-delete');
    del.textContent = sureDelete ? 'Click again to delete' : 'Delete song';
    del.classList.toggle('sure', sureDelete);
  }
  $('#info-done').onclick = closeInfo;
  $('#i-fav').onchange = e => Lib.update(infoId, { fav: e.target.checked });
  $('#i-minus').onclick = () => { const s = Lib.song(infoId); Lib.update(infoId, { offset: Math.max(-150, (s.offset || 0) - 5) }); };
  $('#i-plus').onclick = () => { const s = Lib.song(infoId); Lib.update(infoId, { offset: Math.min(150, (s.offset || 0) + 5) }); };
  $('#i-delete').onclick = async () => {
    if (!sureDelete) { sureDelete = true; renderInfo(); return; }
    const id = infoId;
    if (RKPreview.playing() === id || RKPreview.state(id)) RKPreview.stop();
    readings.delete(id);
    for (const key of [...charts.keys()]) if (key.startsWith(id + ':')) charts.delete(key);
    if (S.sel === id) { S.sel = null; persist(); }
    $('#info').hidden = true;
    infoId = null;
    await Lib.remove(id);
  };

  // ---------- add music ----------
  let addTab = 'free', results = [], searching = false, searchError = '', searched = false;
  function openAdd(tab) {
    RKPreview.stop();
    addTab = tab || addTab;
    $('#add').hidden = false;
    renderAdd();
    if (addTab === 'free' && !searched) search(RKCatalog.GENRES[0]);
  }
  function closeAdd() { RKPreview.stop(); $('#add').hidden = true; renderHome(); }
  function renderAdd() {
    segmented($('#add-tabs'), [['free', 'Free music'], ['mac', 'From your Mac'], ['link', 'From a link']].map(([value, label]) => ({ value, label })), addTab,
      v => { addTab = v; renderAdd(); if (v === 'free' && !searched) search(RKCatalog.GENRES[0]); });
    $('#pane-free').hidden = addTab !== 'free';
    $('#pane-mac').hidden = addTab !== 'mac';
    $('#pane-link').hidden = addTab !== 'link';

    const g = $('#genres');
    if (!g.childElementCount) {
      for (const name of RKCatalog.GENRES) {
        const b = el('button', 'chip', name);
        b.type = 'button';
        b.onclick = () => search(name);
        g.appendChild(b);
      }
    }
    for (const b of g.children) b.setAttribute('aria-selected', String(b.textContent === $('#free-q').value));

    const ul = $('#free-results');
    ul.textContent = '';
    if (searching) ul.appendChild(el('li', 'note', 'Searching…'));
    else if (searchError) ul.appendChild(el('li', 'note', searchError));
    else if (searched && !results.length) ul.appendChild(el('li', 'note', 'Nothing between one and eight minutes long. Try another word.'));
    for (const r of results) {
      const li = el('li', 'result');
      const pv = el('button', 'pv');
      pv.type = 'button';
      pv.dataset.pv = r.id;
      const st = RKPreview.state(r.id);
      pv.classList.toggle('playing', st === 'playing');
      pv.classList.toggle('loading', st === 'loading');
      pv.classList.toggle('error', st === 'error');
      pv.innerHTML = st === 'playing' || st === 'loading' ? STOP : PLAY;
      pv.title = st === 'error' ? 'This song could not be heard' : st ? 'Stop' : 'Listen';
      pv.setAttribute('aria-label', pv.title);
      pv.onclick = () => RKPreview.result(r);
      const text = el('span');
      const m = el('div', 'meta', r.artist + ' · ' + fmt(r.duration) + ' · ' + r.source);
      m.appendChild(el('span', 'lic', r.license));
      text.append(el('div', 't-name', r.title), m);
      const b = el('button', 'add');
      b.type = 'button';
      const j = Lib.jobs.get(r.id);
      if (Lib.has(r.id)) { b.textContent = 'Added'; b.classList.add('done'); b.disabled = true; }
      else if (j && j.stage !== 'error') { b.textContent = j.stage === 'downloading' ? 'Getting…' : 'Reading…'; b.disabled = true; }
      else { b.textContent = j ? 'Retry' : 'Add'; b.onclick = () => { Lib.dismiss(r.id); Lib.addFromCatalog(r); }; }
      li.append(pv, text, b);
      ul.appendChild(li);
    }

    const jobs = $('#jobs');
    jobs.textContent = '';
    for (const [id, j] of Lib.jobs) jobs.appendChild(jobRow(id, j, true));
  }
  async function search(q) {
    if (!q.trim()) return;
    $('#free-q').value = q;
    searching = true; searchError = ''; renderAdd();
    try { results = await RKCatalog.search(q.trim()); searchError = ''; } catch (e) { results = []; searchError = e instanceof Error ? e.message : 'Search failed.'; }
    searching = false; searched = true;
    renderAdd();
  }
  $('#free-form').onsubmit = e => { e.preventDefault(); search($('#free-q').value); };
  $('#link-form').onsubmit = e => {
    e.preventDefault();
    const url = $('#link-url').value.trim();
    if (!/^https?:\/\//i.test(url)) return;
    $('#link-url').value = '';
    Lib.addFromLink(url);
  };
  $('#choose').onclick = () => Lib.addFromMac();
  const drop = $('#drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|aiff?|flac)$/i.test(f.name));
    if (files.length) Lib.addDropped(files);
  });
  $('#add-done').onclick = closeAdd;
  $('#open-add').onclick = () => openAdd();
  for (const b of document.querySelectorAll('[data-add]')) b.onclick = () => openAdd(b.dataset.add);

  // A listen redraws what shows it, and keeps its ring turning while it plays.
  function ring() {
    const key = RKPreview.playing();
    for (const b of document.querySelectorAll('.pv')) b.style.setProperty('--p', b.dataset.pv === key ? RKPreview.progress().toFixed(3) : 0);
    if (key) requestAnimationFrame(ring);
  }
  RKPreview.on(() => {
    if (!$('#add').hidden) renderAdd();
    else if (screen === 'home') renderHome();
    if (RKPreview.playing()) requestAnimationFrame(ring);
  });

  Lib.on(() => {
    if (!$('#add').hidden) renderAdd();
    if (!$('#info').hidden) renderInfo();
    if (screen === 'home') renderHome();
    if (screen === 'settings') renderSettings();
  });

  // ---------- the game ----------
  let G = null, runs = 0;
  const cv = $('#stage'), cx = cv.getContext('2d');

  function stopRun() { if (G) { G.done = true; if (G.src) G.src.stop(); } }

  async function start() {
    const pick = current();
    if (!pick) return;
    RKPreview.stop();
    A.ensure();
    A.volumes(S.music, S.sfx);
    stopRun();
    const id = ++runs;
    $('#now-title').textContent = pick.song.title + ' · ' + DIFFS.find(d => d[0] === S.diff)[1];
    $('#band-title').textContent = pick.song.title + ' — ' + pick.song.artist;
    $('#pause').hidden = true;
    $('#loading').hidden = false;
    show('play');
    fit();
    let buffer, reading;
    try {
      [buffer, reading] = await Promise.all([Lib.buffer(pick.song.id), Lib.reading(pick.song.id)]);
    } catch {
      $('#loading').hidden = true;
      show('home');
      return;
    }
    if (id !== runs || screen !== 'play') return;
    readings.set(pick.song.id, reading);
    $('#loading').hidden = true;
    const chart = chartNow(pick.song.id, S.diff, S.lanes, pick.mirror);
    const k = S.lanes;
    const notes = chart.notes.map(n => ({ t: n.t, lane: n.lane, end: n.end, judged: false, j: null, tail: n.end ? null : 'none', holding: false }));
    const lanes = Array.from({ length: k }, () => []);
    notes.forEach(n => lanes[n.lane].push(n));
    const lastAt = notes.reduce((m, n) => Math.max(m, n.end || n.t), 0);
    G = {
      id, pick, chart, reading, notes, lanes, k, keys: S.keys[k], duration: buffer.duration,
      next: new Array(k).fill(0), down: new Array(k).fill(false), up: new Array(k).fill(0), flash: new Array(k).fill(0), holds: new Array(k).fill(null),
      counts: { perfect: 0, great: 0, good: 0, miss: 0 }, combo: 0, maxCombo: 0, weight: 0, judged: 0, offsets: [],
      fx: [], last: null, paused: false, done: false, time: -LEAD_IN, beatAt: 0,
      offset: (S.offset + (pick.song.offset || 0)) / 1000,
      endAt: Math.min(buffer.duration + 0.2, lastAt + 3),
    };
    G.t0 = A.time + LEAD_IN;
    G.src = A.play(buffer, G.t0);
    requestAnimationFrame(() => frame(id));
  }

  function songTime(stamp) { return (stamp == null ? A.now() : A.at(stamp)) - G.t0 - G.offset; }

  function togglePause() {
    if (!G || G.done) return;
    G.paused = !G.paused;
    $('#pause').hidden = !G.paused;
    if (G.paused) A.suspend(); else A.resume();
  }
  function quit() { stopRun(); A.resume(); show('home'); }

  function press(lane, t) {
    G.down[lane] = true;
    G.flash[lane] = 1;
    if (S.hitsound) A.tick();
    const list = G.lanes[lane];
    for (let i = G.next[lane]; i < list.length; i++) {
      const n = list[i];
      if (n.judged) continue;
      const dt = t - n.t;
      if (dt < -JUDGE.miss.win) return;
      if (dt > JUDGE.good.win) continue;
      const a = Math.abs(dt);
      const j = a <= JUDGE.perfect.win ? 'perfect' : a <= JUDGE.great.win ? 'great' : a <= JUDGE.good.win ? 'good' : 'miss';
      head(n, j, dt, lane);
      if (n.end && j !== 'miss') { n.holding = true; G.holds[lane] = n; } else if (n.end) tail(n, 'miss', lane);
      return;
    }
  }
  function release(lane, t) {
    G.down[lane] = false;
    const h = G.holds[lane];
    if (!h) return;
    G.holds[lane] = null;
    h.holding = false;
    tail(h, t >= h.end - JUDGE.good.win ? 'perfect' : 'miss', lane);
  }
  function head(n, j, dt, lane) { n.judged = true; n.j = j; count(j, dt, lane, false); }
  function tail(n, j, lane) { n.tail = j; count(j, null, lane, true); }
  function count(j, dt, lane, isTail) {
    G.counts[j]++;
    G.judged++;
    G.weight += JUDGE[j].w;
    if (j === 'miss') G.combo = 0; else { G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); }
    if (dt != null && j !== 'miss') G.offsets.push(dt);
    if (!isTail || j === 'miss') G.last = { j, dt, at: performance.now() };
    if (j !== 'miss') G.fx.push({ lane, j, at: performance.now() });
  }

  function update(t) {
    for (let l = 0; l < G.k; l++) {
      const list = G.lanes[l];
      for (let i = G.next[l]; i < list.length; i++) {
        const n = list[i];
        if (n.t - t > JUDGE.miss.win) break;
        if (!n.judged && t - n.t > JUDGE.good.win) { head(n, 'miss', null, l); if (n.end) tail(n, 'miss', l); }
      }
      const h = G.holds[l];
      if (h && t >= h.end) { G.holds[l] = null; h.holding = false; tail(h, 'perfect', l); }
      while (G.next[l] < list.length && list[G.next[l]].judged && list[G.next[l]].tail !== null && !list[G.next[l]].holding) G.next[l]++;
    }
  }
  // Every note that is due, however far the last frame was: a slow frame
  // must not cost the demo a note.
  function autoplay(t) {
    for (let l = 0; l < G.k; l++) {
      const list = G.lanes[l];
      for (;;) {
        const h = G.holds[l];
        if (h) {
          if (t < h.end) break;
          G.holds[l] = null;
          h.holding = false;
          tail(h, 'perfect', l);
        }
        if (G.down[l] && t >= G.up[l]) G.down[l] = false;
        let i = G.next[l];
        while (i < list.length && list[i].judged) i++;
        const n = list[i];
        if (!n || t < n.t) break;
        press(l, n.t);
        G.up[l] = n.end || n.t + 0.08;
      }
    }
  }

  const scoreOf = () => Math.round((1e6 * (0.9 * G.weight + 0.1 * G.maxCombo)) / Math.max(1, G.chart.units));
  function grade(acc, misses) {
    if (acc >= 0.99 && misses === 0) return 'S+';
    if (acc >= 0.95) return 'S';
    if (acc >= 0.9) return 'A';
    if (acc >= 0.8) return 'B';
    if (acc >= 0.7) return 'C';
    return 'D';
  }

  // One loop per run: a restart's loop takes over, the old one stops.
  function frame(id) {
    if (!G || G.id !== id || screen !== 'play') return;
    if (!G.paused && !G.done) {
      G.time = songTime();
      if (AUTOPLAY) autoplay(G.time);
      update(G.time);
    }
    draw(G.time);
    hud();
    if (!G.done && !G.paused && G.time > G.endAt) finish();
    if (!G.done) requestAnimationFrame(() => frame(id));
  }

  function hud() {
    const score = scoreOf();
    if (score !== G.shownScore) { G.shownScore = score; $('#score').textContent = score.toLocaleString('en-US'); }
    const acc = ((G.judged ? G.weight / G.judged : 1) * 100).toFixed(2) + '%';
    if (acc !== G.shownAcc) { G.shownAcc = acc; $('#acc').textContent = acc; }
    $('#progress').style.width = Math.max(0, Math.min(1, G.time / G.duration)) * 100 + '%';
  }

  // ---------- the highway ----------
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', () => { if (screen === 'play') fit(); });

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  function rr(x, y, w, h, r) {
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
    else cx.rect(x, y, w, h);
    cx.fill();
  }

  let lastDraw = performance.now();
  function draw(t) {
    const now = performance.now(), dt = Math.min(0.05, (now - lastDraw) / 1000);
    lastDraw = now;
    const r = cv.getBoundingClientRect(), W = r.width, H = r.height;
    const k = G.k, colors = LANE_COLORS[k];
    const laneW = k === 4 ? 66 : k === 6 ? 52 : 46;
    const hw = laneW * k, x0 = Math.round((W - hw) / 2);
    const recY = H - 92, pxs = 200 * S.speed;
    const beats = G.reading.beats;

    cx.fillStyle = '#0e1016';
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#141824';
    cx.fillRect(x0, 0, hw, H);
    for (let l = 0; l < k; l++) {
      if (l % 2) { cx.fillStyle = 'rgba(255,255,255,0.018)'; cx.fillRect(x0 + l * laneW, 0, laneW, H); }
      cx.fillStyle = 'rgba(255,255,255,0.05)';
      cx.fillRect(x0 + l * laneW, 0, 1, H);
    }
    cx.fillRect(x0 + hw, 0, 1, H);

    // The song's own beats, brighter on the bar, falling with the notes.
    while (G.beatAt < beats.length && beats[G.beatAt] < t - 0.4) G.beatAt++;
    let lastBeat = null, nextBeat = null;
    for (let i = Math.max(0, G.beatAt - 1); i < beats.length; i++) {
      if (beats[i] <= t) lastBeat = beats[i]; else if (nextBeat === null) nextBeat = beats[i];
      const y = recY - (beats[i] - t) * pxs;
      if (y < 0) break;
      if (y > H) continue;
      cx.fillStyle = (((i - G.reading.down) % 4) + 4) % 4 === 0 ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.035)';
      cx.fillRect(x0, y, hw, 1);
    }

    // A pressed lane lights up from the line.
    for (let l = 0; l < k; l++) {
      G.flash[l] = G.down[l] ? 1 : Math.max(0, G.flash[l] - dt * 5);
      if (!S.flash || G.flash[l] <= 0) continue;
      const g = cx.createLinearGradient(0, recY, 0, recY - 220);
      g.addColorStop(0, rgba(colors[l], 0.3 * G.flash[l]));
      g.addColorStop(1, rgba(colors[l], 0));
      cx.fillStyle = g;
      cx.fillRect(x0 + l * laneW + 1, recY - 220, laneW - 1, 220);
    }

    // The line, breathing on the beat.
    let pulse = 0;
    if (!S.calm && t >= 0 && lastBeat !== null) {
      const len = nextBeat !== null ? Math.max(0.2, nextBeat - lastBeat) : 0.5;
      pulse = Math.pow(Math.max(0, 1 - (t - lastBeat) / len), 3);
    }
    cx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * pulse).toFixed(3) + ')';
    cx.fillRect(x0, recY - 1, hw, 2);

    // Notes.
    const ahead = recY / pxs + 0.1;
    for (let l = 0; l < k; l++) {
      const list = G.lanes[l], c = colors[l];
      const x = x0 + l * laneW + 5, w = laneW - 10;
      for (let i = G.next[l]; i < list.length; i++) {
        const n = list[i];
        if (n.t - t > ahead) break;
        if (n.end && (!n.judged || n.holding)) {
          const yHead = n.holding ? recY : recY - (n.t - t) * pxs;
          const yTail = recY - (n.end - t) * pxs;
          if (yHead > yTail) {
            cx.fillStyle = rgba(c, n.holding ? 0.6 : 0.32);
            rr(x + w * 0.22, yTail, w * 0.56, yHead - yTail, 6);
            cx.fillStyle = rgba(c, 0.9);
            rr(x + w * 0.22, yTail - 3, w * 0.56, 6, 3);
          }
        }
        if (!n.judged) {
          const y = recY - (n.t - t) * pxs;
          cx.fillStyle = c;
          rr(x, y - 8, w, 16, 6);
          cx.fillStyle = 'rgba(255,255,255,0.4)';
          rr(x + 3, y - 6, w - 6, 3, 2);
        } else if (n.holding) {
          cx.fillStyle = c;
          rr(x - 2, recY - 9, w + 4, 18, 7);
        }
      }
    }

    // Keys.
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    for (let l = 0; l < k; l++) {
      const x = x0 + l * laneW + 4, w = laneW - 8, y = recY + 16, down = G.down[l];
      cx.fillStyle = down ? colors[l] : '#1c2130';
      rr(x, y + (down ? 3 : 0), w, 44, 9);
      if (!down) { cx.fillStyle = 'rgba(0,0,0,0.35)'; rr(x, y + 40, w, 6, 4); cx.fillStyle = '#232938'; rr(x, y, w, 42, 9); }
      cx.fillStyle = down ? '#0e1016' : 'rgba(255,255,255,0.8)';
      const label = keyLabel(G.keys[l]);
      cx.font = '700 ' + (label.length > 2 ? 11 : 15) + 'px -apple-system, system-ui, sans-serif';
      cx.fillText(label, x + w / 2, y + 21 + (down ? 3 : 0));
    }

    // A hit rings out from the line.
    G.fx = G.fx.filter(f => now - f.at < 300);
    for (const f of G.fx) {
      const age = (now - f.at) / 300;
      cx.strokeStyle = rgba(JUDGE[f.j].color, (1 - age).toFixed(3));
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(x0 + f.lane * laneW + laneW / 2, recY, 10 + age * (S.calm ? 14 : 34), 0, Math.PI * 2);
      cx.stroke();
    }

    if (G.combo >= 4) {
      cx.fillStyle = 'rgba(255,255,255,0.88)';
      cx.font = '800 46px -apple-system, system-ui, sans-serif';
      cx.fillText(String(G.combo), W / 2, H * 0.3);
      cx.fillStyle = 'rgba(255,255,255,0.45)';
      cx.font = '700 11px -apple-system, system-ui, sans-serif';
      cx.fillText('COMBO', W / 2, H * 0.3 + 32);
    }

    if (G.last) {
      const age = (now - G.last.at) / 1000;
      if (age < 0.6) {
        const pop = S.calm ? 1 : 1 + 0.25 * Math.max(0, 1 - age * 8);
        cx.globalAlpha = age < 0.4 ? 1 : 1 - (age - 0.4) / 0.2;
        cx.fillStyle = JUDGE[G.last.j].color;
        cx.font = '800 ' + Math.round(26 * pop) + 'px -apple-system, system-ui, sans-serif';
        cx.fillText(JUDGE[G.last.j].label, W / 2, recY - 150);
        if (S.earlyLate && G.last.dt != null && G.last.j !== 'perfect') {
          cx.fillStyle = 'rgba(255,255,255,0.6)';
          cx.font = '600 12px -apple-system, system-ui, sans-serif';
          cx.fillText((G.last.dt < 0 ? 'Early ' : 'Late ') + Math.round(Math.abs(G.last.dt) * 1000) + ' ms', W / 2, recY - 126);
        }
        cx.globalAlpha = 1;
      }
    }

    if (t < 0) {
      cx.fillStyle = 'rgba(255,255,255,0.9)';
      cx.font = '800 56px -apple-system, system-ui, sans-serif';
      cx.fillText(String(Math.ceil(-t)), W / 2, H * 0.42);
      cx.fillStyle = 'rgba(255,255,255,0.5)';
      cx.font = '600 12px -apple-system, system-ui, sans-serif';
      cx.fillText(G.keys.map(keyLabel).join('  '), W / 2, H * 0.42 + 44);
    }
  }

  // ---------- results ----------
  let lastResult = null;
  function finish() {
    G.done = true;
    if (G.src) G.src.stop();
    const units = Math.max(1, G.chart.units), acc = G.weight / units, score = scoreOf(), g = grade(acc, G.counts.miss);
    const key = bestKey(G.pick), prev = saved.best[key];
    const isBest = !prev || score > prev.score;
    if (isBest) saved.best[key] = { score, acc, grade: g, combo: G.maxCombo };
    if (G.pick.daily && acc >= 0.7 && saved.daily.last !== today) {
      saved.daily.streak = streakNow() + 1;
      saved.daily.last = today;
    }
    persist();
    lastResult = { score, acc, g, isBest };
    renderResults();
    show('results');
  }

  function renderResults() {
    const { score, acc, g, isBest } = lastResult;
    const s = G.pick.song;
    const box = $('#grade');
    box.textContent = g;
    box.style.setProperty('--g', GRADE_COLORS[g]);
    $('#r-title').textContent = s.title;
    $('#r-sub').textContent = (G.pick.daily ? 'Daily · ' : '') + DIFFS.find(d => d[0] === S.diff)[1] + ' · ' + G.k + ' keys · level ' + G.chart.level + (G.pick.mirror ? ' · mirrored' : '');
    $('#r-best').hidden = !isBest;
    $('#r-fc').hidden = G.counts.miss > 0;
    $('#r-score').textContent = score.toLocaleString('en-US');
    $('#r-acc').textContent = (acc * 100).toFixed(2) + '%';
    $('#r-combo').textContent = G.maxCombo + ' / ' + G.chart.units;
    const counts = $('#r-counts');
    counts.textContent = '';
    for (const j of ['perfect', 'great', 'good', 'miss']) {
      const d = el('div');
      d.style.setProperty('--j', JUDGE[j].color);
      d.append(el('b', null, G.counts[j]), el('span', null, JUDGE[j].label));
      counts.appendChild(d);
    }
    // Where the presses landed, early to late, 15 ms to a bar.
    const bins = new Array(18).fill(0);
    for (const o of G.offsets) bins[Math.max(0, Math.min(17, Math.floor((o + 0.135) / 0.015)))]++;
    const top = Math.max(1, ...bins), h = $('#r-histo');
    h.textContent = '';
    bins.forEach((n, i) => {
      const bar = el('i', i === 8 || i === 9 ? 'mid' : '');
      bar.style.height = Math.max(3, (n / top) * 100) + '%';
      h.appendChild(bar);
    });
    const avg = G.offsets.length ? G.offsets.reduce((a, b) => a + b, 0) / G.offsets.length : 0;
    const ms = Math.round(avg * 1000);
    $('#r-avg').textContent = G.offsets.length ? 'On average ' + Math.abs(ms) + ' ms ' + (ms < 0 ? 'early' : 'late') : 'No hits to measure';
    const apply = $('#r-apply');
    apply.hidden = Math.abs(ms) < 12;
    apply.textContent = 'Use ' + (S.offset + ms > 0 ? '+' : '') + (S.offset + ms) + ' ms as offset';
    apply.onclick = () => { S.offset = Math.max(-150, Math.min(150, S.offset + ms)); persist(); apply.hidden = true; };
    $('#r-credit').textContent = '♪ ' + s.title + ' — ' + s.artist + (s.license ? ' · ' + s.license + ' · ' + s.source : '');
  }

  function copyResult() {
    const { score, acc, g } = lastResult, s = G.pick.song;
    const text = 'Rhythm Keys · ' + s.title + ' — ' + s.artist + ' (' + DIFFS.find(d => d[0] === S.diff)[1] + ', ' + G.k + ' keys)\n' +
      g + ' · ' + (acc * 100).toFixed(2) + '% · ' + score.toLocaleString('en-US') + ' · combo ' + G.maxCombo + '\n' +
      'Perfect ' + G.counts.perfect + ' · Great ' + G.counts.great + ' · Good ' + G.counts.good + ' · Miss ' + G.counts.miss;
    const said = word => { $('#r-copy').textContent = word; setTimeout(() => ($('#r-copy').textContent = 'Copy result'), 1400); };
    // The page's own copy, as a text field's ⌘C is: no clipboard reach
    // asked of Lumi for a line the person pressed a button to copy.
    const field = el('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    field.remove();
    if (copied) said('Copied');
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => said('Copied'), () => said('Could not copy'));
    else said('Could not copy');
  }

  // ---------- settings ----------
  let bindK = 4, capture = -1;
  function renderSettings() {
    segmented($('#bind-k'), [4, 6, 7].map(k => ({ value: k, label: k + ' keys' })), bindK, v => { bindK = v; capture = -1; renderSettings(); });
    const caps = $('#caps');
    caps.textContent = '';
    S.keys[bindK].forEach((code, i) => {
      const b = el('button', capture === i ? 'wait' : '', capture === i ? '…' : keyLabel(code));
      b.type = 'button';
      b.style.setProperty('--l', LANE_COLORS[bindK][i]);
      b.onclick = () => { capture = capture === i ? -1 : i; renderSettings(); };
      caps.appendChild(b);
    });
    $('#bind-hint').textContent = capture >= 0 ? 'Press a key for lane ' + (capture + 1) + ' — esc to cancel.' : 'Click a key, then press the one you want.';
    for (const id of ['speed', 'music', 'sfx', 'offset']) $('#' + id).value = S[id];
    for (const id of ['earlyLate', 'flash', 'calm', 'hitsound', 'listen']) $('#' + id).checked = S[id];
    outputs();
    const used = Lib.used();
    const room = (bytes, limit) => {
      $('#room-text').textContent = Lib.songs.length + (Lib.songs.length === 1 ? ' song · ' : ' songs · ') + mb(bytes) + ' of ' + mb(limit);
      $('#room-bar').style.width = Math.min(100, (bytes / limit) * 100) + '%';
    };
    room(used, Lib.LIMIT);
    // What the storage itself says, encryption and readings included.
    RKBridge.usage().then(u => { if (u && u.limit && screen === 'settings') room(u.bytes, u.limit); }, () => {});
  }
  function outputs() {
    $('#speed-out').textContent = Number(S.speed).toFixed(1) + '×';
    $('#music-out').textContent = Math.round(S.music * 100) + '%';
    $('#sfx-out').textContent = Math.round(S.sfx * 100) + '%';
    $('#offset-out').textContent = (S.offset > 0 ? '+' : '') + S.offset + ' ms';
  }
  for (const id of ['speed', 'music', 'sfx', 'offset']) {
    $('#' + id).addEventListener('input', e => {
      S[id] = Number(e.target.value);
      if (id === 'music' || id === 'sfx') A.volumes(S.music, S.sfx);
      outputs();
      persist();
    });
  }
  for (const id of ['earlyLate', 'flash', 'calm', 'hitsound', 'listen']) $('#' + id).addEventListener('change', e => { S[id] = e.target.checked; persist(); });
  $('#reset-keys').onclick = () => { S.keys[bindK] = KEYS[bindK].slice(); capture = -1; persist(); renderSettings(); };
  function bind(code) {
    const keys = S.keys[bindK].slice();
    const other = keys.indexOf(code);
    if (other >= 0) keys[other] = keys[capture]; // taken by another lane: the two swap
    keys[capture] = code;
    S.keys[bindK] = keys;
    capture = -1;
    persist();
    renderSettings();
  }

  // ---------- calibrate ----------
  const CAL_BEATS = 16, CAL_GAP = 0.6;
  let cal = null;
  function startCalibrate() {
    A.ensure();
    A.volumes(S.music, S.sfx);
    show('calibrate');
    const t0 = A.time + 0.8;
    for (let i = 0; i < CAL_BEATS; i++) A.click(t0 + i * CAL_GAP, i % 4 === 0);
    if (cal) clearInterval(cal.timer);
    cal = { t0, taps: [], timer: null };
    $('#cal-result').textContent = '';
    $('#cal-apply').disabled = true;
    $('#cal-count').textContent = '0 taps';
    $('#cal-text').innerHTML = 'Press <kbd>Space</kbd> on every click.';
    const dot = $('#cal-dot');
    cal.timer = setInterval(() => {
      const t = A.now() - t0, ph = ((t % CAL_GAP) + CAL_GAP) % CAL_GAP;
      dot.classList.toggle('beat', t > -0.05 && t < CAL_BEATS * CAL_GAP && ph < 0.1);
      if (t > CAL_BEATS * CAL_GAP + 0.3) { clearInterval(cal.timer); calResult(); }
    }, 16);
  }
  function calTap(stamp) {
    if (!cal) return;
    const t = A.at(stamp) - cal.t0, i = Math.round(t / CAL_GAP);
    if (i < 1 || i >= CAL_BEATS) return; // the first click is for finding the beat
    cal.taps.push(t - i * CAL_GAP);
    $('#cal-count').textContent = cal.taps.length + (cal.taps.length === 1 ? ' tap' : ' taps');
  }
  function calResult() {
    if (cal.taps.length < 6) { $('#cal-result').textContent = 'Not enough taps'; return; }
    const sorted = cal.taps.slice().sort((a, b) => a - b);
    cal.ms = Math.max(-150, Math.min(150, Math.round(sorted[Math.floor(sorted.length / 2)] * 1000)));
    $('#cal-result').textContent = (cal.ms > 0 ? '+' : '') + cal.ms + ' ms';
    $('#cal-text').textContent = cal.ms === 0 ? 'Right on the beat.' : 'You press ' + Math.abs(cal.ms) + ' ms ' + (cal.ms > 0 ? 'after' : 'before') + ' the click.';
    $('#cal-apply').disabled = false;
  }
  function leaveCalibrate() { if (cal) clearInterval(cal.timer); cal = null; show('settings'); }
  $('#cal-again').onclick = startCalibrate;
  $('#cal-back').onclick = leaveCalibrate;
  $('#cal-apply').onclick = () => { S.offset = cal.ms; persist(); leaveCalibrate(); };

  // ---------- buttons ----------
  $('#play').onclick = () => start();
  $('#open-settings').onclick = () => { bindK = S.lanes; show('settings'); };
  $('#settings-done').onclick = () => show('home');
  $('#open-calibrate').onclick = startCalibrate;
  $('#r-retry').onclick = () => start();
  $('#r-back').onclick = () => show('home');
  $('#r-copy').onclick = copyResult;
  $('#q').addEventListener('input', e => { query = e.target.value; renderHome(); });
  $('#pause').addEventListener('click', e => {
    const b = e.target.closest('button'), act = b && b.dataset.act;
    if (act === 'resume') togglePause();
    if (act === 'restart') start();
    if (act === 'quit') quit();
  });

  // ---------- keys ----------
  document.addEventListener('keydown', e => {
    const typing = e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'range';
    if (screen === 'settings' && capture >= 0) {
      e.preventDefault();
      if (e.code === 'Escape') { capture = -1; renderSettings(); } else bind(e.code);
      return;
    }
    if (!$('#info').hidden) { if (e.code === 'Escape' && !typing) closeInfo(); return; }
    if (!$('#add').hidden) { if (e.code === 'Escape') { if (typing) e.target.blur(); else closeAdd(); } return; }
    if (screen === 'play') {
      if (!G) return;
      if (e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
      if (G.paused) {
        if (e.code === 'Enter') togglePause();
        else if (e.code === 'KeyR') start();
        else if (e.code === 'KeyQ') quit();
        return;
      }
      const lane = G.keys.indexOf(e.code);
      if (lane >= 0) { e.preventDefault(); if (!e.repeat && !G.done) press(lane, songTime(e.timeStamp)); }
      return;
    }
    if (e.metaKey && e.key === ',') { e.preventDefault(); bindK = S.lanes; show('settings'); return; }
    if (screen === 'home') {
      if (e.metaKey && e.code === 'KeyN') { e.preventDefault(); openAdd(); return; }
      if ((e.metaKey && e.code === 'KeyF') || (e.key === '/' && !typing)) { e.preventDefault(); $('#q').focus(); return; }
      if (typing) {
        if (e.code === 'Escape') e.target.blur();
        else if (e.code === 'ArrowDown' || e.code === 'Enter') { e.preventDefault(); e.target.blur(); }
        return;
      }
      const ids = (daily() ? ['daily'] : []).concat(visible().map(s => s.id));
      const pick = current();
      const at = pick ? ids.indexOf(pick.daily ? 'daily' : pick.song.id) : -1;
      if ((e.code === 'ArrowDown' || e.code === 'ArrowUp') && ids.length) {
        e.preventDefault();
        choose(ids[(at + (e.code === 'ArrowDown' ? 1 : ids.length - 1) + ids.length) % ids.length]);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const i = DIFFS.findIndex(d => d[0] === S.diff);
        S.diff = DIFFS[Math.max(0, Math.min(DIFFS.length - 1, i + (e.code === 'ArrowRight' ? 1 : -1)))][0];
        persist(); renderHome();
      } else if (['Digit4', 'Digit6', 'Digit7'].includes(e.code)) { S.lanes = Number(e.code.slice(5)); persist(); renderHome(); }
      else if (e.code === 'Enter' && !$('#play').disabled) { e.preventDefault(); start(); }
      else if (e.code === 'Space') { e.preventDefault(); toggleListen(); }
    } else if (screen === 'results') {
      if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); start(); }
      else if (e.code === 'Escape') show('home');
      else if (e.metaKey && e.code === 'KeyC') copyResult();
    } else if (screen === 'settings') {
      if (e.code === 'Escape') show('home');
    } else if (screen === 'calibrate') {
      if (e.code === 'Escape') leaveCalibrate();
      else if (!e.repeat && cal) { e.preventDefault(); calTap(e.timeStamp); }
    }
  });
  document.addEventListener('keyup', e => {
    if (screen !== 'play' || !G || G.paused || G.done) return;
    const lane = G.keys.indexOf(e.code);
    if (lane >= 0) release(lane, songTime(e.timeStamp));
  });
  // Hidden — in Lumi, esc on the panel or a click elsewhere — is paused.
  window.addEventListener('blur', () => {
    RKPreview.stop();
    if (screen === 'play' && G && !G.paused && !G.done && !AUTOPLAY) togglePause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play' && G && !G.paused && !G.done) togglePause(); });

  // Opened: what was kept, then the library.
  Promise.all([RKBridge.load().catch(() => ({})), Lib.ready]).then(([kept]) => {
    restore(kept && kept.progress);
    show('home');
  });
})();
