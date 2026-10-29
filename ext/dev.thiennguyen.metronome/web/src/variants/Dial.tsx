// The Orbit theme (`look = "orbit"`). The bar is a circle: one arc per beat
// around it, a dot sweeping round once a bar, and each arc lighting as its
// beat sounds. The circle is also the tempo knob — turned with the pointer,
// or scrolled — with the tempo in its middle and Start under it, like a
// practice app's. A double-click in the middle, or Return on the knob,
// types the tempo in.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MetronomeApi } from "../engine/useMetronome";
import { useNotes } from "../engine/useMetronome";
import { useReducedMotion } from "../controls/motion";
import { marking } from "../engine/tempo";
import { BpmField, BpmStep, PlayButton, Row, SignaturePicker, SoundSelect, SubdivisionPicker, Switch, TapButton, VolumeSlider } from "../controls/controls";
import "./dial.css";

const SIZE = 300;
const C = SIZE / 2;
const R = 132;
/** The gap between two beats' arcs: a straight cut across the ring, the
 *  same 3 points at any count. A gap in degrees with round ends made the
 *  ends overlap past twelve beats — links of a sausage, not a dial. */
const GAP = (3 / R) * (180 / Math.PI);

function polar(deg: number, r = R): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function arc(from: number, to: number, r = R): string {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function Dial({ m }: { m: MetronomeApi }) {
  const dot = useRef<SVGCircleElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const knob = useRef<SVGSVGElement>(null);
  const [typing, setTyping] = useState(false);
  const [lit, setLit] = useState<{ beat: number; seq: number } | null>(null);

  const beats = m.s.beats;
  const span = 360 / beats;
  const still = useReducedMotion();
  const stillRef = useRef(still);
  stillRef.current = still;

  useNotes(
    m.engine,
    (note) => {
      if (note.sub === 0) setLit((last) => ({ beat: note.beat, seq: (last?.seq ?? 0) + 1 }));
    },
    () => {
      const at = m.engine.position();
      if (!dot.current || !trail.current) return;
      // Reduce Motion: no hand going round — the arcs lighting in turn
      // still say where the bar is.
      if (!at || stillRef.current) {
        dot.current.style.opacity = "0";
        trail.current.style.opacity = "0";
        return;
      }
      const deg = ((at.beat + at.frac) / m.engine.settings.beats) * 360;
      const [x, y] = polar(deg);
      dot.current.setAttribute("cx", x.toFixed(2));
      dot.current.setAttribute("cy", y.toFixed(2));
      dot.current.style.opacity = "1";
      // The trail fills the beat's own arc up to the hand and no further:
      // from where the arc starts (past the gap), to the hand or the arc's
      // end, whichever is nearer. From the beats' boundary, with round
      // ends, it ran out into the gap at both ends.
      const per = 360 / m.engine.settings.beats;
      const from = at.beat * per + GAP / 2;
      const end = Math.min(deg, (at.beat + 1) * per - GAP / 2);
      if (end - from < 0.05) {
        trail.current.style.opacity = "0";
      } else {
        trail.current.setAttribute("d", arc(from, end));
        trail.current.style.opacity = "1";
      }
    },
  );

  // Turning the dial: the angle the pointer moves round the centre, three
  // degrees a beat per minute; a scroll is a step per notch.
  const turning = useRef<{ angle: number; bpm: number } | null>(null);
  const angleOf = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return (Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
  };

  const shownLit = m.running ? lit : null;

  return (
    <div className="dial">
      <div className="dial-main">
        <div className="dial-stage">
          {/* A slider to VoiceOver and the keyboard as well as a knob to the
              pointer: Tab reaches it, the arrows (⇧ for ten) move it — the
              page's own keys — and it says the tempo in words. */}
          <svg
            ref={knob}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="dial-svg"
            role="slider"
            tabIndex={0}
            aria-label="Tempo"
            aria-valuemin={20}
            aria-valuemax={300}
            aria-valuenow={m.s.bpm}
            aria-valuetext={`${m.s.bpm} beats a minute, ${marking(m.s.bpm)}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              turning.current = { angle: angleOf(event), bpm: m.engine.settings.bpm };
            }}
            onPointerMove={(event) => {
              const turn = turning.current;
              if (!turn) return;
              let delta = angleOf(event) - turn.angle;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              turn.angle += delta;
              turn.bpm += delta / 3;
              m.setBpm(turn.bpm);
            }}
            onPointerUp={() => (turning.current = null)}
            onDoubleClick={(event) => {
              // Inside the face, where the number is; the ring stays a knob.
              const box = event.currentTarget.getBoundingClientRect();
              const r = (Math.hypot(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2)) * SIZE) / box.width;
              if (r < R - 34) setTyping(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target === event.currentTarget) setTyping(true);
            }}
            onWheel={(event) => {
            // macOS turns a scroll with Shift held into a sideways one, so
            // read whichever axis moved; Shift is ten a notch, as on −/+.
            const moved = event.deltaY || event.deltaX;
            if (moved === 0) return;
            m.setBpm(m.engine.settings.bpm + (moved < 0 ? 1 : -1) * (event.shiftKey ? 10 : 1));
          }}
          >
            <circle cx={C} cy={C} r={R} className="dial-track" />
            {m.s.levels.map((level, i) => {
              const from = i * span + GAP / 2;
              const to = (i + 1) * span - GAP / 2;
              const on = shownLit?.beat === i;
              return (
                <path
                  key={on ? `${i}-${shownLit?.seq}` : i}
                  d={arc(from, to)}
                  className={`dial-seg ${level}${on ? " on" : ""}`}
                />
              );
            })}
            <path ref={trail} className="dial-trail" d="" />
            <circle ref={dot} r="7" className="dial-dot" cx={C} cy={C - R} />
            <circle cx={C} cy={C} r={R - 34} className="dial-face" />
            {/* Each beat's number inside its arc: where the bar is, read
                without colour — an accented beat's in bold as well as in
                the accent's orange, a silent one's struck through. These
                replaced sixty minute ticks that said nothing. */}
            {m.s.levels.map((level, i) => {
              const [x, y] = polar((i + 0.5) * span, R - 22);
              const on = shownLit?.beat === i;
              return (
                <text key={i} x={x} y={y} className={`dial-num ${level}${on ? " on" : ""}`} aria-hidden="true">
                  {i + 1}
                </text>
              );
            })}
            <g className="dial-center" pointerEvents="none">
              <text x={C} y={C - 32} className="dial-marking">
                {marking(m.s.bpm).toUpperCase()}
              </text>
              {!typing && (
                <text x={C} y={C + 18} className="dial-bpm">
                  {m.s.bpm}
                </text>
              )}
              <text x={C} y={C + 42} className="dial-unit">
                BPM
              </text>
            </g>
            {typing && (
              <foreignObject x={C - 62} y={C - 26} width={124} height={54}>
                <BpmField
                  m={m}
                  className="dial-bpm-field"
                  onDone={(byKey) => {
                    setTyping(false);
                    if (byKey) knob.current?.focus();
                  }}
                />
              </foreignObject>
            )}
          </svg>
          <div className="dial-transport">
            <BpmStep m={m} by={-1} size={16} className="round" />
            <PlayButton m={m} size="round" />
            <BpmStep m={m} by={1} size={16} className="round" />
          </div>
          <p className="dial-hint muted small">Turn the dial or scroll to change the tempo.</p>
        </div>

        <div className="dial-side">
          <span className="dial-label">Time signature</span>
          <SignaturePicker m={m} columns={4} />
          <div className="dial-rows">
            <Row label="Accent the first beat">
              <Switch on={m.s.levels[0] === "accent"} onChange={m.setAccent} label="Accent the first beat" />
            </Row>
            <Row label="Subdivision" hint="Extra clicks inside each beat" stacked>
              <SubdivisionPicker m={m} />
            </Row>
            <Row label="Sound">
              <SoundSelect m={m} />
            </Row>
            <Row label="Tap tempo" hint="Tap four times or more">
              <TapButton m={m} />
            </Row>
            <Row label="Volume">
              <div className="dial-volume">
                <VolumeSlider m={m} />
              </div>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
