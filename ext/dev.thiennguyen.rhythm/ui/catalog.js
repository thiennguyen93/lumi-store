/* Rhythm Keys — finding free music. Openverse indexes openly licensed
   audio (Jamendo, ccMixter, Freesound, Wikimedia) behind one API with no
   key. A page has no network of its own: in Lumi the component asks it
   (`net.fetch`, behind `network`), in the preview the page does
   (`RKBridge.search`). Picking what to show is done here, either way. */
(function () {
  'use strict';

  const SOURCES = { jamendo: 'Jamendo', ccmixter: 'ccMixter', freesound: 'Freesound', wikimedia_audio: 'Wikimedia' };
  const GENRES = ['Electronic', 'Lo-fi', 'Pop', 'Rock', 'Jazz', 'Chiptune', 'Piano', 'Hip hop', 'Funk', 'Ambient'];

  // Openverse sends names HTML-escaped ("Jazyus &amp; EdSeGaMe"): read
  // them as text. DOMParser builds an inert document; nothing in it runs.
  const plain = s => (new DOMParser().parseFromString(String(s || ''), 'text/html').documentElement.textContent || '').trim();
  const licenseName = (l, v) => (l === 'cc0' ? 'CC0' : l === 'pdm' ? 'Public domain' : 'CC ' + String(l).toUpperCase() + (v ? ' ' + v : ''));

  async function search(q) {
    const d = await RKBridge.search(q);
    // Songs, not stings or hour-long mixes: one to eight minutes.
    return (d.results || [])
      .filter(x => x.url && x.duration >= 60000 && x.duration <= 480000)
      .map(x => ({
        id: (x.source || 'ov') + '-' + x.id,
        title: plain(x.title) || 'Untitled',
        artist: plain(x.creator) || 'Unknown artist',
        duration: x.duration / 1000,
        license: licenseName(x.license, x.license_version),
        licenseUrl: x.license_url || null,
        landing: x.foreign_landing_url || null,
        url: x.url,
        source: SOURCES[x.source] || x.source || 'Openverse',
      }));
  }

  window.RKCatalog = { GENRES, search };
})();
