// The Beat Pads theme (`look = "pads"`). The bar laid out as one pad per
// beat, each lit as it sounds, the way a drum machine shows a pattern. A pad
// is also the control for its beat: a click moves it Accent → Normal →
// Silent, so "accent on the first beat" is the first pad, and any other beat
// can be accented or left out too. Subdivisions light as dots inside the pad
// they fall in.

import { useState } from "react";
import { VolumeX } from "lucide-react";
import type { MetronomeApi } from "../engine/useMetronome";
import { useNotes } from "../engine/useMetronome";
import { marking } from "../engine/tempo";
import type { Level, Note } from "../engine/metronome";
import { BpmStepper, PlayButton, SignaturePicker, SoundCards, SubdivisionPicker, TapButton, TempoSlider, VolumeSlider } from "../controls/controls";
import "./pads.css";

const NEXT: Record<Level, Level> = { accent: "beat", beat: "mute", mute: "accent" };
const WORD: Record<Level, string> = { accent: "Accent", beat: "", mute: "Silent" };

export function Pads({ m }: { m: MetronomeApi }) {
  const [hit, setHit] = useState<{ note: Note; seq: number } | null>(null);
  useNotes(m.engine, (note) => setHit((last) => ({ note, seq: (last?.seq ?? 0) + 1 })));
  const live = m.running ? hit : null;

  const beats = m.s.beats;
  // Never more than two rows: a third pushed the page past its height at
  // sixteen beats.
  const columns = beats <= 6 ? beats : beats <= 8 ? 4 : beats <= 12 ? 6 : 8;

  return (
    <div className="pads">
      <div className="pads-head">
        <div className="pads-tempo">
          <BpmStepper m={m} />
          <span className="pads-marking">
            BPM · <span>{marking(m.s.bpm)}</span>
          </span>
        </div>
        <TempoSlider m={m} />
        <TapButton m={m} />
        <PlayButton m={m} />
      </div>

      <div className="pads-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {m.s.levels.map((level, i) => {
          const current = live && live.note.beat === i ? live : null;
          return (
            <button
              key={i}
              type="button"
              className={`pad ${level}${current ? " on" : ""}`}
              aria-label={`Beat ${i + 1}: ${level === "beat" ? "normal" : WORD[level].toLowerCase()}`}
              onClick={() => {
                // From the engine's levels, not this render's: two clicks
                // inside one frame would otherwise both start from the same.
                const next = [...m.engine.settings.levels];
                next[i] = NEXT[next[i] ?? "beat"];
                m.set({ levels: next });
              }}
            >
              {current && current.note.sub === 0 && level !== "mute" && <span key={current.seq} className="pad-flash" />}
              <span className="pad-number">{i + 1}</span>
              <span className="pad-word">{level === "mute" ? <VolumeX size={13} strokeWidth={2} /> : WORD[level]}</span>
              {m.s.sub > 1 && (
                <span className="pad-subs">
                  {Array.from({ length: m.s.sub }, (_, k) => (
                    <span key={k} className={current && current.note.sub === k ? "lit" : ""} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="pads-hint muted small">Click a beat to make it an accent, a normal beat or a silent one.</p>

      <div className="pads-settings">
        <section>
          <h3>Time signature</h3>
          <SignaturePicker m={m} />
        </section>
        <section>
          <h3>Subdivision</h3>
          <SubdivisionPicker m={m} />
        </section>
      </div>

      {/* The volume is the sound's, so it trails Sound's heading. In a row
          of its own under Subdivision it stood alone beside an empty half
          of the signatures' column. */}
      <section>
        <div className="pads-sound-head">
          <h3>Sound</h3>
          <VolumeSlider m={m} />
        </div>
        <SoundCards m={m} columns={4} />
      </section>
    </div>
  );
}
