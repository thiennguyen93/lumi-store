// Rhythm Keys' store pictures: one scene for all four, the promo page's
// `?shot=` saying which. Run by scripts/screenshot.mjs in a fresh Chrome
// profile, so it starts from an empty library every time and builds what
// the picture needs from scratch:
//
// - the songs, added the way a person adds them (`RKLibrary.addFromCatalog`:
//   downloaded through the preview's bridge, then read and charted in the
//   page) from the Openverse entries below, all CC BY or CC BY-SA;
// - collections and favourites, through the library's own calls;
// - the progress a player who has been at it a week would have (settings,
//   some best scores, a daily streak), written where the page keeps it and
//   read back by reloading the page;
// - for the game and its results, a player: real key events, D F J K, sent
//   at each note of the chart the game itself plays, a little late on
//   average and never exactly on time, the way a person plays. The game
//   judges them as it judges anybody's; the scene never touches its score.
//
// Answers "ok", or the step it could not get to.
(async () => {
  const n = Number(new URLSearchParams(location.search).get("shot"));
  const frame = document.querySelector("iframe");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (test, ms = 60000, step = 100) => {
    const end = Date.now() + ms;
    for (;;) {
      const value = test();
      if (value) return value;
      if (Date.now() > end) return null;
      await sleep(step);
    }
  };
  const win = () => frame.contentWindow;
  const $ = (sel) => frame.contentDocument.querySelector(sel);

  // Lumi's unified title bar, as Lumi gives it to the page: the band's
  // height, and the room the traffic lights take at its left. The promo
  // frame draws the lights unscaled over a page drawn at `zoom`, so the
  // room is given in page pixels: 78 on screen.
  const ZOOM = 0.9;
  const band = () => {
    const root = frame.contentDocument.documentElement;
    root.classList.add("in-lumi");
    root.style.setProperty("--bar", "44px");
    root.style.setProperty("--lights", Math.ceil(78 / ZOOM) + "px");
  };
  const reload = async () => {
    const loaded = new Promise((r) => frame.addEventListener("load", r, { once: true }));
    win().location.reload();
    await loaded;
    band();
    await win().RKLibrary.ready;
    await sleep(300);
  };

  // Openverse's own entries for them (RKCatalog.search), as the page keeps
  // them. The first is the short one the results picture plays through.
  const SONGS = [
    ["jamendo-00612d39-02fe-4435-b0ed-45387599c7ef", "8-bit Party", "Ozzed", 106, "CC BY-SA 3.0", "by-sa/3.0/", 361548],
    ["jamendo-712d4fc9-7797-4e77-8b12-2f2387e54cc3", "Big Disco Ball", "Josh Woodward", 235, "CC BY 3.0", "by/3.0/", 582248],
    ["jamendo-e4787e26-212a-4375-b737-9f9b9e4abed2", "House in My Head", "Josh Woodward", 225, "CC BY 3.0", "by/3.0/", 215753],
    ["jamendo-17c2769b-5d9e-4087-ac67-55a5e23a36cf", "Dance Till Day", "Jemex", 221, "CC BY-SA 3.0", "by-sa/3.0/", 510027],
    ["jamendo-855cb4ec-3ea3-4928-923f-6d4104800784", "Jazz Cantina", "Mazelo Nostra", 255, "CC BY-SA 3.0", "by-sa/3.0/", 1227396],
    ["jamendo-9d03ebea-73c7-4601-a1c2-77be2785f3af", "India Funk", "RudySeb", 201, "CC BY-SA 2.0", "by-sa/2.0/be/", 178481],
    ["jamendo-d5c4d710-7f9e-4cf7-b3f0-be26be516da3", "Here Comes the 8-bit Empire", "Ozzed", 116, "CC BY-SA 3.0", "by-sa/3.0/", 361551],
    ["jamendo-6c208e59-fcf2-4ff4-973a-ebc6a3792958", "8 Bit Adventurer", "Rune Factory", 68, "CC BY 3.0", "by/3.0/", 645280],
  ].map(([id, title, artist, duration, license, path, track]) => ({
    id, title, artist, duration, license,
    licenseUrl: "https://creativecommons.org/licenses/" + path,
    landing: "https://www.jamendo.com/track/" + track,
    url: "https://prod-1.storage.jamendo.com/?trackid=" + track + "&format=mp32",
    source: "Jamendo",
  }));
  const [PARTY, DISCO, HOUSE, DANCE, JAZZ, FUNK, EMPIRE, ADVENTURER] = SONGS.map((s) => s.id);

  // A week's play: the settings the picture is about, best scores on some
  // songs at Normal and Hard with four keys, and a streak that went on
  // yesterday.
  const day = (back) => {
    const d = new Date(Date.now() - back * 864e5);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const best = (grade, acc, score, combo) => ({ grade, acc, score, combo });
  const progress = (settings) => ({
    settings: Object.assign({ view: "all", diff: "normal", lanes: 4, speed: 2.4, offset: 0, listen: false }, settings),
    best: {
      [DISCO + ":normal:4"]: best("S", 0.962, 951204, 412),
      [DISCO + ":hard:4"]: best("A", 0.918, 902117, 288),
      [HOUSE + ":normal:4"]: best("S+", 0.993, 994310, 530),
      [DANCE + ":normal:4"]: best("A", 0.927, 913550, 301),
      [FUNK + ":normal:4"]: best("B", 0.861, 840122, 176),
      [EMPIRE + ":normal:4"]: best("S", 0.971, 963880, 344),
      [JAZZ + ":easy:4"]: best("S", 0.958, 949901, 205),
    },
    daily: { last: day(1), streak: 6 },
  });

  try {
    band();
    await win().RKLibrary.ready;

    // ---------- the library ----------
    const L = win().RKLibrary;
    // One at a time, in this order: the newest is listed first, so the
    // library reads top to bottom as the reverse of it, the same each run.
    const wanted = n === 1 ? [DISCO] : n === 4 ? [PARTY] : [ADVENTURER, PARTY, FUNK, JAZZ, EMPIRE, DANCE, HOUSE, DISCO];
    for (const id of wanted) await L.addFromCatalog(SONGS.find((s) => s.id === id));
    if (!(await until(() => wanted.every((id) => L.has(id)), 300000, 500))) return "songs did not all arrive: " + wanted.filter((id) => !L.has(id)).length + " missing";
    if (wanted.length > 2) {
      const party = L.createCollection("Party");
      for (const id of [DISCO, DANCE, HOUSE]) L.toggleIn(party.id, id);
      const chip = L.createCollection("Chiptune");
      for (const id of [PARTY, EMPIRE, ADVENTURER]) L.toggleIn(chip.id, id);
      for (const id of [HOUSE, JAZZ]) L.update(id, { fav: true });
    }

    // ---------- what this picture shows ----------
    const settings = { 1: { sel: DISCO, diff: "hard" }, 2: { sel: DISCO }, 3: { sel: HOUSE }, 4: { sel: PARTY } }[n];
    win().RKBridge.flush();
    await sleep(200);
    win().localStorage.setItem("rhythm-keys:progress", JSON.stringify(progress(settings)));
    await reload();

    if (n === 2) {
      // The library, one song chosen: its four charts' levels showing.
      if (!(await until(() => $("#songs li.on")))) return "no song chosen";
      win().scrollTo(0, 0);
      return "ok";
    }

    if (n === 3) {
      // Add music, a genre searched, one song being listened to.
      $("#open-add").click();
      const funk = await until(() => [...frame.contentDocument.querySelectorAll("#genres .chip")].find((b) => b.textContent === "Funk"));
      if (!funk) return "no genres";
      funk.click();
      const rows = () => [...frame.contentDocument.querySelectorAll("#free-results li.result .t-name")].map((e) => e.textContent);
      if (!(await until(() => rows().length >= 5 && rows().some((t) => /funk/i.test(t)), 30000))) return "no funk in the results: " + rows().slice(0, 3).join(", ");
      const listen = frame.contentDocument.querySelectorAll("#free-results .pv")[1];
      listen.click();
      if (!(await until(() => listen.classList.contains("playing") || frame.contentDocument.querySelector("#free-results .pv.playing"), 30000))) return "the listen did not start";
      await sleep(2500);
      return "ok";
    }

    // ---------- a player, for the game and its results ----------
    const W = win(), A = W.RKAudio;
    const id = settings.sel, diff = settings.diff || "normal", k = 4;
    const codes = ["KeyD", "KeyF", "KeyJ", "KeyK"];
    let t0 = null;
    const play = A.play;
    A.play = function (buffer, at) {
      t0 = at;
      return play.call(this, buffer, at);
    };
    // The page's library since the reload: the one from before it belongs
    // to a page that is gone, and what it asks for never comes back.
    const chart = W.RKAnalyze.chart(await W.RKLibrary.reading(id), diff, k, false);
    // The same random player every run: a little late on average, spread
    // like a hand, and a note dropped now and then.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const all = chart.notes.map((note) => ({ t: note.t, lane: note.lane, at: note.t + Math.max(-0.07, Math.min(0.09, 0.017 + 0.019 * gauss())), end: note.end, drop: rnd() < 0.012 }));
    const plan = all.filter((p) => !p.drop).sort((a, b) => a.at - b.at);
    // The game picture is taken where the combo stands highest: the moment,
    // between 35 and 100 seconds in, with the most notes since a dropped one
    // and none dropped for a second and a half after it — screenshot.mjs
    // takes the picture half a second after the scene answers.
    const drops = all.filter((p) => p.drop).map((p) => p.t);
    let peak = 40, most = 0;
    for (let at = 35; at <= 100; at += 0.25) {
      if (drops.some((d) => d > at && d <= at + 1.5)) continue;
      const since = Math.max(-1, ...drops.filter((d) => d <= at));
      const streak = all.filter((p) => !p.drop && p.t > since && p.t <= at).length;
      if (streak > most) { most = streak; peak = at; }
    }
    plan.forEach((p, i) => {
      const next = plan.slice(i + 1).find((q) => q.lane === p.lane);
      p.up = p.end ? p.end + 0.02 : Math.min(p.at + 0.08, next ? next.at - 0.01 : Infinity);
    });
    const key = (type, lane) =>
      frame.contentDocument.dispatchEvent(new W.KeyboardEvent(type, { code: codes[lane], key: codes[lane].slice(3).toLowerCase(), bubbles: true }));
    const player = (async () => {
      await until(() => t0 !== null, 60000, 20);
      let next = 0;
      const held = [];
      while ($("#results").hidden) {
        const t = A.now() - t0;
        while (next < plan.length && plan[next].at <= t) {
          key("keydown", plan[next].lane);
          held.push(plan[next]);
          next++;
        }
        for (let i = held.length - 1; i >= 0; i--) {
          if (held[i].up <= t) {
            key("keyup", held[i].lane);
            held.splice(i, 1);
          }
        }
        await sleep(2);
      }
    })();

    $("#play").click();
    if (!(await until(() => t0 !== null, 60000))) return "the song did not start";
    if (n === 1) {
      // Well into the song, a combo going.
      await until(() => A.now() - t0 > peak - 0.5, 150000, 20);
      return "ok";
    }
    await player;
    if (!(await until(() => !$("#results").hidden, 200000))) return "no results";
    await sleep(600);
    return "ok";
  } catch (err) {
    return "failed: " + (err && err.message ? err.message : String(err));
  }
})();
