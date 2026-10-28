// The engine as React sees it: settings as state, the notes heard as a
// stream each variant draws in its own way, and the keys every variant
// answers alike (space, the arrows, T).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clampBpm, fitLevels, Metronome, type Note, type Settings } from "./metronome";
import { matching, newId, practiceOf } from "./presets";
import { save as keep, type Preset, type Saved } from "./store";
import { Tapper } from "./tempo";

export interface PresetsApi {
  all: Preset[];
  /** The preset holding exactly what is set now, if one does. */
  matching: Preset | null;
  load(id: string): void;
  /** What is set now, kept as a new, unnamed preset; its id. */
  save(): string;
  rename(id: string, name: string | null): void;
  /** The preset made what is set now. */
  replace(id: string): void;
  /** Gone, with what puts it back where it was. */
  remove(id: string): () => void;
}

export interface MetronomeApi {
  engine: Metronome;
  s: Settings;
  running: boolean;
  set(patch: Partial<Settings>): void;
  setBpm(bpm: number): void;
  setSignature(beats: number, unit: Settings["unit"]): void;
  setAccent(on: boolean): void;
  toggle(): void;
  tap(): void;
  /** Taps so far in the current count, for a button that shows them. */
  taps: number;
  presets: PresetsApi;
}

/** `initial` is what the page loaded before it drew (store.ts): the
 *  practice as it was left, and the presets. Every change after is kept. */
export function useMetronome(initial: Saved): MetronomeApi {
  const engine = useMemo(() => new Metronome(initial.current), []);
  // `pnpm dev` only: the engine within reach of a test's script. Folded
  // away in a build.
  if (import.meta.env.DEV) (window as unknown as { metronome?: Metronome }).metronome = engine;
  const [saved, setSaved] = useState(initial);
  const savedRef = useRef(saved);
  const running = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.isRunning,
  );
  const tapper = useRef(new Tapper());
  const [taps, setTaps] = useState(0);

  const commit = useCallback((next: Saved) => {
    savedRef.current = next;
    setSaved(next);
    keep(next);
  }, []);

  const set = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...engine.settings, ...patch };
      engine.update(next);
      commit({ ...savedRef.current, current: next });
    },
    [engine, commit],
  );

  const presets: PresetsApi = {
    all: saved.presets,
    matching: matching(saved.presets, saved.current),
    load: (id) => {
      const preset = savedRef.current.presets.find((p) => p.id === id);
      if (!preset) return;
      // The volume stays where the person has it (store.ts says why).
      const next = { ...preset.practice, volume: engine.settings.volume };
      engine.update(next);
      commit({ ...savedRef.current, current: next });
    },
    save: () => {
      const preset: Preset = { id: newId(), name: null, practice: practiceOf(engine.settings) };
      commit({ ...savedRef.current, presets: [...savedRef.current.presets, preset] });
      return preset.id;
    },
    rename: (id, name) => {
      commit({ ...savedRef.current, presets: savedRef.current.presets.map((p) => (p.id === id ? { ...p, name } : p)) });
    },
    replace: (id) => {
      commit({ ...savedRef.current, presets: savedRef.current.presets.map((p) => (p.id === id ? { ...p, practice: practiceOf(engine.settings) } : p)) });
    },
    remove: (id) => {
      const all = savedRef.current.presets;
      const at = all.findIndex((p) => p.id === id);
      const gone = all[at];
      commit({ ...savedRef.current, presets: all.filter((p) => p.id !== id) });
      return () => {
        if (!gone || savedRef.current.presets.some((p) => p.id === gone.id)) return;
        const back = [...savedRef.current.presets];
        back.splice(Math.min(at, back.length), 0, gone);
        commit({ ...savedRef.current, presets: back });
      };
    },
  };

  const s = saved.current;
  const api: MetronomeApi = {
    engine,
    s,
    running,
    set,
    setBpm: (bpm) => set({ bpm: clampBpm(bpm) }),
    setSignature: (beats, unit) =>
      set({ beats, unit, levels: fitLevels(engine.settings.levels, beats, engine.settings.levels[0] === "accent") }),
    setAccent: (on) => set({ levels: fitLevels(engine.settings.levels, engine.settings.beats, on) }),
    toggle: () => engine.toggle(),
    tap: () => {
      const bpm = tapper.current.tap();
      setTaps(tapper.current.count);
      if (bpm) set({ bpm: clampBpm(bpm) });
    },
    taps,
    presets,
  };

  const latest = useRef(api);
  latest.current = api;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A control that answered the key itself — a segmented control's
      // arrows move its choice — keeps it.
      if (event.defaultPrevented) return;
      const { engine: e, setBpm, tap } = latest.current;
      const step = event.shiftKey ? 10 : 1;
      if (event.code === "Space") {
        // Space presses the control the keyboard is on, as everywhere in
        // macOS; only with no control focused from the keyboard is it
        // Start and Stop. (WebKit gives a clicked button no focus, so a
        // mouse user's Space is always Start and Stop.)
        if (target?.closest("button, [role=switch], [role=radio]") && target.matches(":focus-visible")) return;
        event.preventDefault();
        // Held down, Space would start and stop the beat at key-repeat rate.
        if (event.repeat) return;
        event.preventDefault();
        e.toggle();
      } else if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        setBpm(e.settings.bpm + step);
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        setBpm(e.settings.bpm - step);
      } else if ((event.key === "t" || event.key === "T") && !event.repeat) {
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => () => engine.stop(), [engine]);
  return api;
}

interface Watcher {
  onNote(note: Note): void;
  onFrame?(): void;
}

/** One animation-frame loop per engine, fanning each note out to every
 *  watcher: `drain` hands a note out once, so two components draining it
 *  each would each see half. */
const watchers = new WeakMap<Metronome, { all: Set<Watcher>; frame: number }>();

function watch(engine: Metronome, watcher: Watcher): () => void {
  let entry = watchers.get(engine);
  if (!entry) {
    const created = { all: new Set<Watcher>(), frame: 0 };
    const loop = () => {
      const heard = engine.drain();
      for (const one of created.all) {
        for (const note of heard) one.onNote(note);
        one.onFrame?.();
      }
      created.frame = requestAnimationFrame(loop);
    };
    created.frame = requestAnimationFrame(loop);
    watchers.set(engine, created);
    entry = created;
  }
  entry.all.add(watcher);
  const kept = entry;
  return () => {
    kept.all.delete(watcher);
    if (kept.all.size === 0) {
      cancelAnimationFrame(kept.frame);
      watchers.delete(engine);
    }
  };
}

/** Calls `onNote` with every note as it is heard, from an animation frame.
 *  Also hands each frame to `onFrame`, for whatever swings between notes. */
export function useNotes(engine: Metronome, onNote: (note: Note) => void, onFrame?: () => void) {
  const handlers = useRef({ onNote, onFrame });
  handlers.current = { onNote, onFrame };
  useEffect(
    () =>
      watch(engine, {
        onNote: (note) => handlers.current.onNote(note),
        onFrame: () => handlers.current.onFrame?.(),
      }),
    [engine],
  );
}

/** The last note heard, as state: enough for anything that only lights. */
export function useLastNote(engine: Metronome): Note | null {
  const [note, setNote] = useState<Note | null>(null);
  const running = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.isRunning,
  );
  useNotes(engine, setNote);
  useEffect(() => {
    if (!running) setNote(null);
  }, [running]);
  return note;
}
