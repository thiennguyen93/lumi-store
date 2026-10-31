// What the Metronome tab keeps between one opening and the next: the
// practice as it was left, and the person's presets.
//
// A page has no storage of its own in Lumi — Settings closes the tab's page
// every time another tab is chosen, and a page's own storage is not the
// extension's. So both go through the bridge's one door to the component,
// `POST /__lumi__/call`, as two calls its `run_ui` answers from
// `lumi::storage`: `{"op":"load"}` (the whole of it, or `null` the first
// time) and `{"op":"save","saved":…}`. The mock's dev server answers the
// same two from a file (vite.config.ts).
//
// Saving is written for a page that can be closed at any moment: every
// change is sent, one call in flight at a time and only the newest waiting
// behind it, and whatever is waiting when the page is put away goes with
// `keepalive`, so a tempo changed just before switching tabs is not lost.
//
// Lumi does not always answer at once. It refuses a page's call (403)
// while Settings is hidden or behind another app, and says 503 while the
// component is busy; both answer in a moment, so both are asked again.
// Nothing is saved until the load has been answered: a page that could not
// read the presets and saved anyway would put none over all of them.

import { clampBpm, DEFAULTS, fitLevels, type Settings } from "./metronome";

export interface Preset {
  id: string;
  /** The person's own name for it, or null: an unnamed preset is called
   *  by what it is ("132 · 7/8", presets.ts), worked out every time, so a
   *  name can never fall out of step with what the preset holds. */
  name: string | null;
  /** What a preset is: the practice, not the room — volume stays the
   *  person's, since it is about the speakers and the room, not the piece. */
  practice: Practice;
}

export type Practice = Omit<Settings, "volume">;

export interface Saved {
  /** 2 since the tempo counts the signature's own beats; 1 counted quarter
   *  notes whatever the signature (`inBeats`). */
  v: 2;
  current: Settings;
  presets: Preset[];
}

export const EMPTY: Saved = { v: 2, current: DEFAULTS, presets: [] };

/** `pnpm dev` only: `?store=` keeps a test's state apart from the
 *  person's. Folded away in a build. */
const store = import.meta.env.DEV ? new URLSearchParams(location.search).get("store") ?? undefined : undefined;

function call(body: unknown, keepalive = false): Promise<Response> {
  return fetch("/__lumi__/call", { method: "POST", body: JSON.stringify(body), keepalive });
}

/** A stored value made safe to use: storage is a file like any other, and
 *  a value from a newer version, or one somebody edited, must not break the
 *  page — whatever does not read as a setting falls back to its default. */
function settingsOf(raw: unknown): Settings {
  const given = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const pick = <K extends keyof Settings>(key: K, ok: (value: unknown) => boolean): Settings[K] =>
    ok(given[key]) ? (given[key] as Settings[K]) : DEFAULTS[key];
  const beats = pick("beats", (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 16);
  const levels = Array.isArray(given.levels) ? given.levels.filter((l) => l === "accent" || l === "beat" || l === "mute") : DEFAULTS.levels;
  return {
    bpm: pick("bpm", (v) => typeof v === "number" && v >= 20 && v <= 300),
    beats,
    unit: pick("unit", (v) => v === 2 || v === 4 || v === 8 || v === 16),
    levels: fitLevels(levels, beats, (levels[0] ?? "accent") === "accent"),
    sub: pick("sub", (v) => v === 1 || v === 2 || v === 3 || v === 4),
    sound: pick("sound", (v) => typeof v === "string"),
    volume: pick("volume", (v) => typeof v === "number" && v >= 0 && v <= 1),
  };
}

function savedOf(raw: unknown): Saved {
  if (!raw || typeof raw !== "object") return EMPTY;
  const given = raw as { v?: unknown; current?: unknown; presets?: unknown };
  const kept = given.v === 2 ? <T>(s: T) => s : inBeats;
  const presets = (Array.isArray(given.presets) ? (given.presets as Partial<Preset>[]) : [])
    .filter((p): p is Preset => !!p && typeof p.id === "string")
    .map((p) => {
      const { volume: _volume, ...practice } = kept(settingsOf(p.practice));
      return { id: p.id, name: nameOf(p.name), practice };
    });
  return { v: 2, current: kept(settingsOf(given.current)), presets };
}

/** A v1 practice in the signature's own beats, at the speed it was heard:
 *  v1's tempo counted quarter notes, so 7/8 at 132 was 264 eighths a
 *  minute, and is kept as 264. Past 300, the fastest there is, it is 300. */
function inBeats<T extends { bpm: number; unit: Settings["unit"] }>(s: T): T {
  return { ...s, bpm: clampBpm((s.bpm * s.unit) / 4) };
}

/** A stored name, or null for none. The first presets were always named,
 *  by a suggestion of the form "120 BPM 4/4" the person mostly kept — and
 *  which went on saying 4/4 after the preset was changed to 7/8. A name of
 *  exactly that form is read as no name, so it is called by what it is. */
function nameOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || /^\d+ BPM \d+\/\d+( \(\d+\))?$/.test(name)) return null;
  return name.slice(0, 40);
}

/** How long to wait before asking again after `tries` refusals. */
function backoff(tries: number): number {
  return Math.min(250 * 2 ** tries, 4000);
}

/** Resolves after `ms`, or sooner when the page comes back in front of
 *  somebody — the moment a call refused for being put away is answered. */
function again(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      removeEventListener("focus", done);
      document.removeEventListener("visibilitychange", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    addEventListener("focus", done);
    document.addEventListener("visibilitychange", done);
  });
}

/** Whether a refusal answers differently in a moment: the page put away
 *  or behind another app (403), or the component busy (503). Anything
 *  else is a failure, asked again only a few times. */
const passing = (status: number) => status === 403 || status === 503;

/** Set once the load is answered; until then nothing is saved. */
let loaded = false;

export async function load(): Promise<Saved> {
  for (let tries = 0; ; tries++) {
    let status = 0;
    try {
      const response = await call({ op: "load", store });
      if (response.ok) {
        const stored = (await response.json()) as unknown;
        loaded = true;
        if (stored) return savedOf(stored);
        return import.meta.env.DEV ? fromTheOldMock() : EMPTY;
      }
      status = response.status;
    } catch {
      // No answer at all; asked again like a failure.
    }
    if (!passing(status) && tries >= 3) break;
    await again(backoff(tries));
  }
  // Never answered: the defaults, with saving left off, so the presets
  // that could not be read are still there the next time the tab opens.
  return EMPTY;
}

/** `pnpm dev` only: the first mock kept the practice in the page's own
 *  `localStorage`; read once so what was set there is not lost to the move. */
function fromTheOldMock(): Saved {
  try {
    const old = store ? null : localStorage.getItem("metronome.mock.settings");
    if (old) return { ...EMPTY, current: inBeats(settingsOf(JSON.parse(old))) };
  } catch {
    // Nothing there.
  }
  return EMPTY;
}

let sending = false;
let waiting: Saved | null = null;

/** Sends what is waiting until it is kept. `sending` covers the wait
 *  between tries too, so changes made meanwhile only replace what is
 *  waiting and go with the next try. */
async function flush() {
  if (sending) return;
  sending = true;
  for (let tries = 0; waiting; ) {
    const next = waiting;
    waiting = null;
    let status = 0;
    try {
      status = (await call({ op: "save", store, saved: next })).status;
    } catch {
      // No answer at all; asked again like a failure.
    }
    if (status >= 200 && status < 300) {
      tries = 0;
      continue;
    }
    // Not kept: a newer change goes in its place, or this one again.
    waiting ??= next;
    // A failure past a few tries waits for the next change.
    if (!passing(status) && tries >= 3) break;
    await again(backoff(tries++));
  }
  sending = false;
}

export function save(saved: Saved) {
  if (!loaded) return;
  waiting = saved;
  void flush();
}

// Put away mid-save — Settings closing the tab's page — what is waiting
// still goes.
addEventListener("pagehide", () => {
  if (waiting) void call({ op: "save", store, saved: waiting }, true);
  waiting = null;
});
