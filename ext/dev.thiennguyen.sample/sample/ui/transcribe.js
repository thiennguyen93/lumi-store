// The Transcribe window. A recording is started here and stopped here; what
// it hears arrives on its own, as `lumi:transcribe` events: `started` once a
// model is listening, `segment` for each partial and final — a segment said
// again under its id as it grows — then `done` or `failed`. Built with
// textContent throughout, like the sample's other pages.
//
// With speakers told apart, each line says who: "Speaker 2", or the name of
// a voice the sample asked Lumi to remember. Name… beside an unnamed speaker
// asks Lumi to remember that voice — Lumi asks the person, with the voice to
// play — and the list under the window shows the voices remembered, to rename
// or forget. The page only ever holds ids and names.
//
// How loud it is arrives the same way: a `level` event per stream about
// every 128 ms — its loudness, 0 to 100, and 16 bands, each 0 to 15 — and,
// for a file, one `overview` of the whole of it. The meter draws the same
// readings three ways: the loudness over time (each stream's recent
// readings), over pitch (the latest bands) and as an orb (the loudness
// alone). Lumi never sends the sound; the page eases between readings to
// draw at the screen's own rate.

const source = document.getElementById("source");
const whose = document.getElementById("whose");
const whoseRow = document.getElementById("whose-row");
const record = document.getElementById("record");
const file = document.getElementById("file");
const statusLine = document.getElementById("status");
const said = document.getElementById("said");
const problem = document.getElementById("problem");
const again = document.getElementById("again");
const prepare = document.getElementById("prepare");
const speakers = document.getElementById("speakers");
const nameRow = document.getElementById("name-row");
const nameWho = document.getElementById("name-who");
const nameInput = document.getElementById("name");
const nameGo = document.getElementById("name-go");
const voicesSection = document.getElementById("voices-section");
const voicesList = document.getElementById("voices");

const HEARD = { microphone: "Microphone", "system-audio": "What this Mac plays", recording: "The file" };

const meter = document.getElementById("meter");
const overviewCanvas = document.getElementById("overview");
const kinds = [...document.querySelectorAll(".meter-kinds button")];
/** How the meter draws: "wave", "spectrum" or "orb". */
let kind = "wave";
/** Each stream's readings: the recent loudness, the latest bands, and the
 *  eased values drawn — by `heard`. */
const streams = new Map();
const HISTORY = 96;

function streamOf(heard) {
  let stream = streams.get(heard);
  if (!stream) {
    stream = { levels: [], bands: [], level: 0, shown: [], shownLevel: 0 };
    streams.set(heard, stream);
  }
  return stream;
}

function heardLevel(e) {
  const stream = streamOf(e.heard);
  stream.levels.push(e.level / 100);
  if (stream.levels.length > HISTORY) stream.levels.shift();
  stream.level = e.level / 100;
  stream.bands = e.bands.map((step) => step / 15);
}

function token(name, fallback) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

/** A canvas sized to its box at the screen's scale, and its context. */
function fitted(canvas) {
  const box = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * scale)) {
    canvas.width = Math.round(box.width * scale);
    canvas.height = Math.round(box.height * scale);
  }
  const g = canvas.getContext("2d");
  g.setTransform(scale, 0, 0, scale, 0, 0);
  return { g, w: box.width, h: box.height };
}

function drawMeter() {
  const { g, w, h } = fitted(meter);
  g.clearRect(0, 0, w, h);
  const colors = [token("--accent", "#0a84ff"), "#d4537e"];
  const all = [...streams.values()];
  all.forEach((stream, i) => {
    stream.shownLevel += (stream.level - stream.shownLevel) * 0.25;
    stream.shown = stream.bands.map((value, b) => (stream.shown[b] ?? 0) + (value - (stream.shown[b] ?? 0)) * 0.3);
    const color = colors[i % colors.length];
    // A call's two streams share the canvas: each its own half.
    const rows = Math.max(1, all.length);
    const top = (h / rows) * i;
    const height = h / rows;
    g.fillStyle = color;
    g.strokeStyle = color;
    if (kind === "wave") {
      const step = w / HISTORY;
      stream.levels.forEach((level, at) => {
        const x = w - (stream.levels.length - at) * step;
        const half = Math.max(1, level * (height / 2 - 4));
        g.fillRect(x + step * 0.2, top + height / 2 - half, step * 0.6, half * 2);
      });
    } else if (kind === "spectrum") {
      const step = w / Math.max(1, stream.shown.length);
      stream.shown.forEach((value, b) => {
        const bar = Math.max(1, value * (height - 6));
        g.fillRect(b * step + step * 0.15, top + height - bar, step * 0.7, bar);
      });
    } else {
      const cx = all.length > 1 ? (w / (all.length + 1)) * (i + 1) : w / 2;
      // Sized so the outer ring, at its widest wobble, stays inside.
      const r = ((Math.min(h, w / all.length) / 2 - 2) / 1.75) * (0.5 + 0.5 * stream.shownLevel);
      for (let ring = 0; ring < 3; ring++) {
        g.globalAlpha = 0.9 - ring * 0.28;
        g.lineWidth = 2;
        g.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 48) {
          const wobble = 1 + stream.shownLevel * 0.2 * Math.sin(5 * a + performance.now() / 300 + ring);
          const radius = r * (1 + ring * 0.22) * wobble;
          const x = cx + Math.cos(a) * radius;
          const y = h / 2 + Math.sin(a) * radius;
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  });
  requestAnimationFrame(drawMeter);
}

/** A file's loudness, the whole of it. */
function drawOverview(levels) {
  overviewCanvas.hidden = levels.length === 0;
  if (!levels.length) return;
  const { g, w, h } = fitted(overviewCanvas);
  g.clearRect(0, 0, w, h);
  g.fillStyle = token("--accent", "#0a84ff");
  const step = w / levels.length;
  levels.forEach((level, at) => {
    const half = Math.max(0.5, (level / 100) * (h / 2));
    g.fillRect(at * step, h / 2 - half, Math.max(1, step - 0.5), half * 2);
  });
}

for (const button of kinds) {
  button.addEventListener("click", () => {
    kind = button.dataset.kind;
    for (const other of kinds) other.setAttribute("aria-checked", String(other === button));
  });
}
requestAnimationFrame(drawMeter);

/** The recording going, if one is. */
let going = null;
/** The last file picked, to hear again whole. */
let lastBlob = null;
/** Each segment's line, by its id within the recording going. */
const lines = new Map();
/** The recording the lines are from — going, or just done — which a
 *  speaker is remembered from. */
let shown = null;
/** What the name field is for: a speaker to remember, or a voice to rename. */
let naming = null;

async function call(request) {
  const answer = await fetch("/__lumi__/call", { method: "POST", body: JSON.stringify(request) });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body);
  return JSON.parse(body);
}

function say(text) {
  problem.textContent = text || "";
}

function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function setGoing(id) {
  going = id;
  record.textContent = id === null ? "Record" : "Stop";
  file.disabled = id !== null;
  source.disabled = whose.disabled = id !== null;
}

/** What a refusal means for the page: a model to download, or a sentence. */
function refused(answer) {
  if (answer.failure === "stopped" || answer.failure === "declined") return;
  prepare.hidden = answer.failure !== "unprepared";
  say(answer.message);
}

function begin(answer) {
  if (answer.cancelled) return;
  if (answer.failure) return refused(answer);
  lines.clear();
  streams.clear();
  drawOverview([]);
  setGoing(answer.id);
  shown = answer.id;
  statusLine.textContent = "Getting ready…";
}

/** Who said a segment, as its line says it. */
function who(speaker) {
  if (!speaker) return "";
  return speaker.name || `Speaker ${speaker.label + 1}`;
}

/** Ask for a name: for `label` of the recording shown, or for voice `voice`. */
function askName(what) {
  naming = what;
  nameWho.textContent = what.voice ? `Rename ${what.was} to` : `Name Speaker ${what.label + 1}`;
  nameGo.textContent = what.voice ? "Rename" : "Remember";
  nameInput.value = what.was || "";
  nameRow.hidden = false;
  nameInput.focus();
}

function show(segment) {
  let line = lines.get(segment.id);
  if (!line) {
    if (!segment.text) return;
    line = document.createElement("p");
    lines.set(segment.id, line);
    said.append(line);
  }
  line.className = segment.partial ? "partial" : "";
  line.textContent = "";
  const from = document.createElement("span");
  from.className = "from";
  const speaker = who(segment.speaker);
  from.textContent = `${HEARD[segment.heard] || segment.heard} · ${clock(segment.startMs)}${speaker ? ` · ${speaker}` : ""}`;
  // A voice not yet named, in a recording that told voices apart: Name…
  // asks Lumi to remember it.
  if (segment.speaker && !segment.speaker.voice && !segment.partial && speakers.value !== "off") {
    const name = document.createElement("button");
    name.type = "button";
    name.className = "link";
    name.textContent = "Name…";
    const label = segment.speaker.label;
    name.addEventListener("click", () => askName({ label }));
    from.append(" ", name);
  }
  line.append(from, document.createTextNode(segment.text));
  said.scrollTop = said.scrollHeight;
}

/** The voices remembered, each with Rename and Forget. */
function drawVoices(voices) {
  voicesList.textContent = "";
  voicesSection.hidden = voices.length === 0;
  for (const voice of voices) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "grow";
    name.textContent = voice.name;
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "link";
    rename.textContent = "Rename";
    rename.addEventListener("click", () => askName({ voice: voice.id, was: voice.name }));
    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "link";
    forget.textContent = "Forget";
    forget.addEventListener("click", () => {
      call({ kind: "forget", voice: voice.id }).catch((err) => say(String(err.message || err)));
    });
    item.append(name, rename, forget);
    voicesList.append(item);
  }
}

function refreshVoices() {
  call({ kind: "voices" })
    .then((answer) => drawVoices(answer.voices))
    .catch(() => drawVoices([]));
}

// Remembered, renamed or forgotten here or on the sample's page in Settings ›
// AI › Extensions & Privacy.
window.addEventListener("lumi:voices", refreshVoices);

nameRow.addEventListener("submit", (event) => {
  event.preventDefault();
  const what = naming;
  const name = nameInput.value.trim();
  if (!what || !name) return;
  nameRow.hidden = true;
  say("");
  const request = what.voice ? { kind: "rename", voice: what.voice, name } : { kind: "remember", id: shown, label: what.label, name };
  call(request)
    .then((answer) => {
      if (answer.remembered) statusLine.textContent = `Remembered ${answer.remembered.name}. Recordings that name voices will name them.`;
      else if (answer.already) statusLine.textContent = `That voice is already remembered, as ${answer.already.name}.`;
    })
    .catch((err) => say(String(err.message || err)));
});

document.getElementById("name-cancel").addEventListener("click", () => {
  nameRow.hidden = true;
  naming = null;
});

window.addEventListener("lumi:transcribe", (event) => {
  const e = event.detail ?? {};
  if (e.id !== going) return;
  if (e.kind === "started") statusLine.textContent = e.fellBack || `Listening with ${e.modelName}…`;
  else if (e.kind === "segment") show(e.segment);
  else if (e.kind === "level") heardLevel(e);
  else if (e.kind === "overview") drawOverview(e.levels);
  else if (e.kind === "done") {
    setGoing(null);
    const notes = e.transcript.notes.join(" ");
    statusLine.textContent = `${clock(e.transcript.durationMs)} · ${e.transcript.modelName}${notes ? ` · ${notes}` : ""}`;
  } else if (e.kind === "failed") {
    setGoing(null);
    statusLine.textContent = "";
    refused(e);
  }
});

source.addEventListener("change", () => {
  whoseRow.hidden = source.value === "microphone";
});

record.addEventListener("click", () => {
  say("");
  if (going !== null) {
    call({ kind: "stop", id: going }).catch((err) => say(String(err.message || err)));
    return;
  }
  call({ kind: "start", source: source.value, oneApp: whose.value === "one", speakers: speakers.value })
    .then(begin)
    .catch((err) => say(String(err.message || err)));
});

file.addEventListener("click", () => {
  say("");
  call({ kind: "file", speakers: speakers.value })
    .then((answer) => {
      if (answer.blob) {
        lastBlob = answer.blob;
        again.hidden = false;
      }
      begin(answer);
    })
    .catch((err) => say(String(err.message || err)));
});

again.addEventListener("click", () => {
  if (!lastBlob) return;
  say("");
  statusLine.textContent = "Hearing it whole…";
  call({ kind: "again", blob: lastBlob, speakers: speakers.value })
    .then((answer) => {
      if (answer.failure) {
        statusLine.textContent = "";
        return refused(answer);
      }
      said.textContent = "";
      lines.clear();
      shown = answer.transcript.id;
      for (const segment of answer.transcript.segments) show(segment);
      drawOverview(answer.transcript.overview);
      statusLine.textContent = `${clock(answer.transcript.durationMs)} · ${answer.transcript.modelName}, heard whole`;
    })
    .catch((err) => say(String(err.message || err)));
});

prepare.addEventListener("click", () => {
  say("");
  call({ kind: "prepare", speakers: speakers.value })
    .then((answer) => {
      prepare.hidden = answer.readiness !== "downloadable";
      statusLine.textContent = answer.readiness === "installed" ? "A speech model is ready. Press Record." : "";
    })
    .catch((err) => say(String(err.message || err)));
});

document.getElementById("clear").addEventListener("click", () => {
  said.textContent = "";
  lines.clear();
  statusLine.textContent = "";
  say("");
});

speakers.addEventListener("change", () => {
  // Told apart, a second model is needed: what is ready is asked again.
  call({ kind: "status", speakers: speakers.value })
    .then((answer) => {
      prepare.hidden = answer.readiness !== "downloadable";
    })
    .catch((err) => say(String(err.message || err)));
});

refreshVoices();

// What is ready, said before anything is pressed.
call({ kind: "status" })
  .then((answer) => {
    prepare.hidden = answer.readiness !== "downloadable";
    if (answer.readiness === "unsupported") say("No speech model Lumi offers runs on this Mac.");
    const model = answer.models.find((m) => m.default) || answer.models[0];
    statusLine.textContent = model ? `Hears with ${model.name}.` : answer.readiness === "downloadable" ? "No speech model is downloaded yet." : "";
  })
  .catch((err) => say(String(err.message || err)));
