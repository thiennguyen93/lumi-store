// Presets: a practice kept to come back to. Pure, so the rules — what
// matches, what an unnamed one is called — are one place.
//
// The model is the one Music's equalizer has: the presets are a list, and
// the one that is "on" is whichever holds exactly what is set now — worked
// out, never stored. Change the tempo and none is on, with nothing to save
// or discard; set it back and it is on again. The first build kept a chosen
// preset and called it Edited, which is a document's model, and left the
// person keeping track of which preset they were "in".

import type { Settings } from "./metronome";
import type { Practice, Preset } from "./store";

export function practiceOf(settings: Settings): Practice {
  const { volume: _volume, ...practice } = settings;
  return practice;
}

export function samePractice(a: Practice, b: Practice): boolean {
  return (
    a.bpm === b.bpm &&
    a.beats === b.beats &&
    a.unit === b.unit &&
    a.sub === b.sub &&
    a.sound === b.sound &&
    a.levels.length === b.levels.length &&
    a.levels.every((level, i) => level === b.levels[i])
  );
}

/** The preset that holds exactly what is set now, if one does. */
export function matching(presets: Preset[], settings: Settings): Preset | null {
  const now = practiceOf(settings);
  return presets.find((p) => samePractice(p.practice, now)) ?? null;
}

const SUB_WORD: Record<Practice["sub"], string> = { 1: "", 2: "eighths", 3: "triplets", 4: "sixteenths" };

/** What a preset holds, in a few words: "132 · 7/8 · triplets". The whole
 *  title of an unnamed one, and the line under a named one. */
export function facts(practice: Practice): string {
  const sub = SUB_WORD[practice.sub] ? ` · ${SUB_WORD[practice.sub]}` : "";
  return `${practice.bpm} · ${practice.beats}/${practice.unit}${sub}`;
}

export function titleOf(preset: Preset): string {
  return preset.name ?? facts(preset.practice);
}

/** A name as typed, made a name or none: blank is "call it by what it is". */
export function cleanName(typed: string): string | null {
  const name = typed.trim().slice(0, 40);
  return name || null;
}

export function newId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
