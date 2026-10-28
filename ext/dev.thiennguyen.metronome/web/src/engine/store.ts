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

import { DEFAULTS, fitLevels, type Settings } from "./metronome";

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
  v: 1;
  current: Settings;
  presets: Preset[];
}

export const EMPTY: Saved = { v: 1, current: DEFAULTS, presets: [] };

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
  const given = raw as Partial<Saved>;
  const presets = (Array.isArray(given.presets) ? given.presets : [])
    .filter((p): p is Preset => !!p && typeof p.id === "string")
    .map((p) => {
      const { volume: _volume, ...practice } = settingsOf(p.practice);
      return { id: p.id, name: nameOf(p.name), practice };
    });
  return { v: 1, current: settingsOf(given.current), presets };
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

export async function load(): Promise<Saved> {
  try {
    const response = await call({ op: "load", store });
    if (response.ok) {
      const stored = (await response.json()) as unknown;
      if (stored) return savedOf(stored);
    }
  } catch {
    // Nothing kept, or nobody to ask: start from the defaults.
  }
  return import.meta.env.DEV ? fromTheOldMock() : EMPTY;
}

/** `pnpm dev` only: the first mock kept the practice in the page's own
 *  `localStorage`; read once so what was set there is not lost to the move. */
function fromTheOldMock(): Saved {
  try {
    const old = store ? null : localStorage.getItem("metronome.mock.settings");
    if (old) return { ...EMPTY, current: settingsOf(JSON.parse(old)) };
  } catch {
    // Nothing there.
  }
  return EMPTY;
}

let sending = false;
let waiting: Saved | null = null;

async function flush() {
  if (sending || !waiting) return;
  sending = true;
  const next = waiting;
  waiting = null;
  try {
    await call({ op: "save", store, saved: next });
  } catch {
    // Kept on the page; the next change tries again.
  } finally {
    sending = false;
    if (waiting) void flush();
  }
}

export function save(saved: Saved) {
  waiting = saved;
  void flush();
}

// Put away mid-save — Settings closing the tab's page — what is waiting
// still goes.
addEventListener("pagehide", () => {
  if (waiting) void call({ op: "save", store, saved: waiting }, true);
  waiting = null;
});
