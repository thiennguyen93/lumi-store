// The Classic theme (`look = "classic"`), the default. The wind-up metronome
// on a piano: a rod swinging side to side, reaching each end on the beat,
// and a weight on it that is the tempo — dragged up it slows, down it speeds
// up, as the real one does. Everything else stands in a column beside it.

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { MetronomeApi } from "../engine/useMetronome";
import { useLastNote, useNotes } from "../engine/useMetronome";
import { useReducedMotion } from "../controls/motion";
import { marking } from "../engine/tempo";
import { MAX_BPM, MIN_BPM } from "../engine/metronome";
import { BpmStepper, PlayButton, Row, SignaturePicker, SoundSelect, SubdivisionPicker, Switch, TapButton, TempoSlider, VolumeSlider } from "../controls/controls";
import "./pendulum.css";

const PIVOT = { x: 110, y: 292 };
const SWING = 20;
/** How far up the rod the weight sits at the fastest and slowest tempos. */
const NEAR = 78;
const FAR = 232;
const SCALE = [30, 40, 50, 60, 80, 100, 120, 144, 176, 208, 260];

/** On a log scale, as a real one's is closer to: linear, 40 to 168 were
 *  crowded into the top third and the fast half had the rest of the rod. */
const SPAN = Math.log(MAX_BPM / MIN_BPM);
function reachOf(bpm: number): number {
  return NEAR + (Math.log(MAX_BPM / bpm) / SPAN) * (FAR - NEAR);
}
function bpmAt(reach: number): number {
  return MAX_BPM / Math.exp(((reach - NEAR) / (FAR - NEAR)) * SPAN);
}

export function Pendulum({ m }: { m: MetronomeApi }) {
  const rod = useRef<SVGGElement>(null);
  const weight = useRef<SVGRectElement>(null);
  const shown = useRef(0);
  const note = useLastNote(m.engine);
  const still = useReducedMotion();
  const stillRef = useRef(still);
  stillRef.current = still;

  useNotes(
    m.engine,
    (heard) => {
      if (heard.sub !== 0 || heard.level === "mute" || !weight.current) return;
      const el = weight.current;
      el.classList.remove("hit", "hit-accent");
      // Restart the flash: a class put back in the same frame is no change.
      void el.getBoundingClientRect();
      el.classList.add(heard.level === "accent" ? "hit-accent" : "hit");
    },
    () => {
      // Reduce Motion: the rod stands still and the weight's flash is the
      // beat (motion.ts).
      const at = stillRef.current ? null : m.engine.position();
      // Each end on the beat: cos is 1 at the beat and 0 halfway, and the
      // side alternates with every beat counted.
      const target = at ? SWING * Math.cos(Math.PI * at.frac) * (at.count % 2 === 0 ? 1 : -1) : 0;
      const gap = target - shown.current;
      // Steady swinging never moves more than ~7° a frame, so it is drawn
      // exactly; a jump (starting, stopping) is eased instead of snapped.
      shown.current = Math.abs(gap) > 8 ? shown.current + gap * 0.3 : target;
      rod.current?.setAttribute("transform", `rotate(${shown.current.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`);
    },
  );

  const dragging = useRef(false);
  const fromPointer = (event: ReactPointerEvent<SVGElement>) => {
    const svg = event.currentTarget.ownerSVGElement ?? (event.currentTarget as unknown as SVGSVGElement);
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const y = (event.clientY - matrix.f) / matrix.d;
    const reach = Math.min(FAR, Math.max(NEAR, PIVOT.y - y));
    m.setBpm(bpmAt(reach));
  };

  const reach = reachOf(m.s.bpm);
  const beatShown = note ? note.beat : -1;

  return (
    <div className="pd">
      <div className="pd-main">
        <div className="pd-stage">
          <svg viewBox="0 0 220 330" className="pd-svg" role="img" aria-label={`Pendulum at ${m.s.bpm} beats a minute`}>
            <defs>
              <linearGradient id="pd-body" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--pd-body-top)" />
                <stop offset="1" stopColor="var(--pd-body-bottom)" />
              </linearGradient>
            </defs>
            <path d="M 78 14 Q 110 4 142 14 L 210 312 Q 212 322 200 322 L 20 322 Q 8 322 10 312 Z" fill="url(#pd-body)" className="pd-body" />
            <rect x="96" y="40" width="28" height="236" rx="6" className="pd-slot" />
            {SCALE.map((bpm) => {
              const y = PIVOT.y - reachOf(bpm);
              return (
                <g key={bpm} className="pd-scale">
                  <line x1="126" x2="134" y1={y} y2={y} />
                  <text x="138" y={y + 3}>
                    {bpm}
                  </text>
                </g>
              );
            })}
            <g ref={rod}>
              <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={PIVOT.y - 262} className="pd-rod" />
              <rect
                ref={weight}
                x={PIVOT.x - 15}
                y={PIVOT.y - reach - 11}
                width="30"
                height="22"
                rx="4"
                className="pd-weight"
                onPointerDown={(event) => {
                  dragging.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => dragging.current && fromPointer(event)}
                onPointerUp={() => (dragging.current = false)}
              />
              <line x1={PIVOT.x - 8} x2={PIVOT.x + 8} y1={PIVOT.y - reach} y2={PIVOT.y - reach} className="pd-weight-mark" />
            </g>
            <circle cx={PIVOT.x} cy={PIVOT.y} r="7" className="pd-pivot" />
          </svg>
          <PlayButton m={m} size="large" />
        </div>

        <div className="pd-side">
          <div className="pd-tempo">
            <span className="pd-marking">{marking(m.s.bpm, m.s.unit)}</span>
            <div className="pd-tempo-row">
              <BpmStepper m={m} big />
              <span className="pd-bpm-unit">BPM</span>
            </div>
            <div className="pd-tempo-row">
              <TempoSlider m={m} />
              <TapButton m={m} />
            </div>
            <div className="pd-dots" aria-hidden="true">
              {m.s.levels.map((level, i) => (
                <span key={i} className={`pd-dot ${level}${m.running && beatShown === i ? " on" : ""}`} />
              ))}
            </div>
          </div>

          <div className="pd-rows">
            <div className="pd-block">
              <span className="pd-label">Time signature</span>
              <SignaturePicker m={m} />
            </div>
            <Row label="Subdivision" hint="Extra clicks inside each beat">
              <SubdivisionPicker m={m} />
            </Row>
            <Row label="Sound">
              <SoundSelect m={m} />
            </Row>
            <Row label="Volume">
              <div style={{ width: 170 }}>
                <VolumeSlider m={m} />
              </div>
            </Row>
            <Row label="Accent the first beat" hint="Louder and higher on the one">
              <Switch on={m.s.levels[0] === "accent"} onChange={m.setAccent} label="Accent the first beat" />
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
