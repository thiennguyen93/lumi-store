// The Simple theme (`look = "simple"`). The quietest of the four: a
// transport card on top (the beat lights, the tempo, Tap and Start), then
// Lumi's own settings layout — headed sections of labelled rows — for
// everything else, so the tab reads as one more page of Lumi's Settings. Its
// one flourish is optional: the card can flash with the beat, for playing
// without looking at it closely.

import { useRef, useState } from "react";
import type { MetronomeApi } from "../engine/useMetronome";
import { useNotes } from "../engine/useMetronome";
import { marking, SIGNATURES } from "../engine/tempo";
import type { Note } from "../engine/metronome";
import { BeatsStepper, BpmStepper, Fraction, PlayButton, Row, Segmented, SoundSelect, SubdivisionPicker, Switch, TapButton, TempoSlider, UnitPicker, unitName, VolumeSlider } from "../controls/controls";
import "./list.css";

const COMMON = SIGNATURES.filter((one) => ["2/4", "3/4", "4/4", "6/8"].includes(`${one.beats}/${one.unit}`));

export function List({ m }: { m: MetronomeApi }) {
  const [note, setNote] = useState<Note | null>(null);
  const [flash, setFlash] = useState(true);
  const card = useRef<HTMLDivElement>(null);
  useNotes(m.engine, (heard) => {
    setNote(heard);
    if (!flash || heard.sub !== 0 || heard.level === "mute" || !card.current) return;
    const el = card.current;
    el.classList.remove("flash", "flash-accent");
    void el.offsetWidth;
    el.classList.add(heard.level === "accent" ? "flash-accent" : "flash");
  });
  const shown = m.running ? note : null;
  const signature = `${m.s.beats}/${m.s.unit}`;
  const common = COMMON.some((one) => `${one.beats}/${one.unit}` === signature);

  return (
    <div className="ls">
      <div className="ls-card" ref={card}>
        <div className="ls-card-main">
          <div className="ls-leds" aria-hidden="true">
            {m.s.levels.map((level, i) => (
              <span key={i} className={`ls-led ${level}${shown?.beat === i ? " on" : ""}`}>
                {i + 1}
              </span>
            ))}
          </div>
          <div className="ls-tempo">
            <BpmStepper m={m} big />
            <div className="ls-tempo-words">
              <span>BPM</span>
              <span className="muted">{marking(m.s.bpm, m.s.unit)}</span>
            </div>
          </div>
          {/* The tempo's slider in the card with its number, not a section
              of its own under it: that heading and row were the 56 points
              the page went over by once Other's row opened. */}
          <TempoSlider m={m} />
        </div>
        <div className="ls-card-actions">
          <PlayButton m={m} size="large" />
          <TapButton m={m} />
        </div>
      </div>

      <section className="ls-section">
        <h3>Rhythm</h3>
        {/* A signature of one's own is built on the signature's own row,
            under its choices, rather than in a row of its own: it is the
            same setting, answered in more detail. */}
        <Row label="Time signature" hint={common ? undefined : `${m.s.beats} ${unitName(m.s.unit)} a bar`}>
          <div className="ls-signature">
            <Segmented
              label="Time signature"
              value={common ? signature : "more"}
              onChange={(value) => {
                const one = COMMON.find((s) => `${s.beats}/${s.unit}` === value);
                if (one) m.setSignature(one.beats, one.unit);
                else m.setSignature(5, 4);
              }}
              options={[
                ...COMMON.map((one) => ({ value: `${one.beats}/${one.unit}`, label: <Fraction beats={one.beats} unit={one.unit} /> })),
                { value: "more", label: <span className="small">More</span> },
              ]}
            />
            {!common && (
              <div className="ls-custom">
                <BeatsStepper m={m} />
                <UnitPicker m={m} />
              </div>
            )}
          </div>
        </Row>
        <Row label="Accent the first beat" hint="Louder and higher on the one">
          <Switch on={m.s.levels[0] === "accent"} onChange={m.setAccent} label="Accent the first beat" />
        </Row>
        <Row label="Subdivision" hint="Extra clicks inside each beat">
          <SubdivisionPicker m={m} />
        </Row>
      </section>

      <section className="ls-section">
        <h3>Sound</h3>
        <Row label="Sound">
          <SoundSelect m={m} />
          <div className="ls-volume">
            <VolumeSlider m={m} />
          </div>
        </Row>
        <Row label="Flash on the beat" hint="The card above lights with each beat">
          <Switch on={flash} onChange={setFlash} label="Flash on the beat" />
        </Row>
      </section>
    </div>
  );
}
