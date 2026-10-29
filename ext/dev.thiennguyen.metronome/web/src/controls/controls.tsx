// The controls every variant shares, in Lumi's look (lumi.css's tokens):
// the variants differ in how the beat is drawn and how the controls are
// laid out, not in what a switch or a stepper is.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronsUpDown, Minus, Play, Plus, Square, Volume1, Volume2, VolumeX } from "lucide-react";
import type { MetronomeApi } from "../engine/useMetronome";
import { VOICES } from "../engine/sounds";
import { SIGNATURES, SUBDIVISIONS } from "../engine/tempo";
import { clampBpm, type Settings } from "../engine/metronome";
import { bpmStep, useShiftHeld } from "./shift";
import "./tip";
import "./controls.css";

export function Switch({ on, onChange, label }: { on: boolean; onChange(on: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`m-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** A segmented control as AppKit's: segments of one width, the chosen one
 *  raised. A radio group to the keyboard — one Tab stop, on the chosen
 *  segment, and the arrows (Home, End) move the choice — and each
 *  segment's `title` is its help tag as well as its accessible name, for
 *  segments that are only a picture. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange(value: T): void;
  label: string;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = Math.max(0, options.findIndex((one) => one.value === value));
  const move = (event: ReactKeyboardEvent, index: number) => {
    const last = options.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    event.preventDefault();
    onChange(options[to]!.value);
    buttons.current[to]?.focus();
  };
  return (
    <div className={`m-segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((one, index) => (
        <button
          key={String(one.value)}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={one.value === value}
          aria-label={one.title}
          data-tip={one.title}
          tabIndex={index === chosen ? 0 : -1}
          className={one.value === value ? "on" : ""}
          onClick={() => onChange(one.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {one.label}
        </button>
      ))}
    </div>
  );
}

/** A button that repeats while held, as a stepper's should: once at the
 *  press, then after 400 ms every 60 ms. */
function Repeating({ onStep, label, tip, children, className = "" }: { onStep(): void; label: string; tip?: string; children: ReactNode; className?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const step = useRef(onStep);
  step.current = onStep;
  const end = () => clearTimeout(timer.current);
  useEffect(() => end, []);
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={tip}
      className={`m-icon-button ${className}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        step.current();
        const again = () => {
          step.current();
          timer.current = setTimeout(again, 60);
        };
        timer.current = setTimeout(again, 400);
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onKeyDown={(event) => {
        if (event.key === "Enter") step.current();
      }}
    >
      {children}
    </button>
  );
}

/** One of the tempo's −/+ buttons: a beat a minute a press, ten with
 *  Shift held, repeating while held down. While Shift is held it says so —
 *  −10, +10 — so the larger step is found by looking, not only by being
 *  told. Every theme's −/+ is this one button. */
export function BpmStep({ m, by, size = 14, className = "" }: { m: MetronomeApi; by: -1 | 1; size?: number; className?: string }) {
  const shift = useShiftHeld();
  const word = by < 0 ? "Slower" : "Faster";
  return (
    <Repeating label={shift ? `${word} by 10` : word} tip={`${word} — hold ⇧ for 10`} className={className} onStep={() => m.setBpm(m.engine.settings.bpm + by * bpmStep())}>
      {shift ? (
        <span className="m-step-ten" style={{ fontSize: Math.max(10, size - 4) }}>
          {by < 0 ? "−10" : "+10"}
        </span>
      ) : by < 0 ? (
        <Minus size={size} strokeWidth={2.2} />
      ) : (
        <Plus size={size} strokeWidth={2.2} />
      )}
    </Repeating>
  );
}

/** The tempo typed in where it is shown, opened by a double-click on the
 *  number. Return or leaving the field sets it, 20 to 300 as every other
 *  way of setting it; Escape leaves it as it was. Digits only, and the
 *  arrows step what is typed (⇧ for ten), as they step the tempo outside
 *  it. `onDone` is told whether the keyboard closed it, so focus goes back
 *  only then and never away from what a click went to. */
export function BpmField({ m, onDone, className = "", style }: { m: MetronomeApi; onDone(byKey: boolean): void; className?: string; style?: CSSProperties }) {
  const [typed, setTyped] = useState(String(m.engine.settings.bpm));
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (keep: boolean, byKey: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep && typed !== "") m.setBpm(Number(typed));
    onDone(byKey);
  };
  return (
    <input
      ref={field}
      className={`m-bpm-field ${className}`}
      style={style}
      value={typed}
      inputMode="numeric"
      maxLength={3}
      aria-label="Tempo in beats a minute"
      onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true, true);
        else if (event.key === "Escape") finish(false, true);
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const by = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
          setTyped(String(clampBpm((Number(typed) || m.engine.settings.bpm) + by)));
        }
      }}
      onBlur={() => finish(true, false)}
    />
  );
}

export function BpmStepper({ m, big = false }: { m: MetronomeApi; big?: boolean }) {
  // The number's box, measured as the field opens, is the field's: nothing
  // round it moves.
  const [typing, setTyping] = useState<{ width: number; height: number } | null>(null);
  return (
    <div className={`m-stepper${big ? " big" : ""}`}>
      <BpmStep m={m} by={-1} size={big ? 18 : 14} />
      {typing ? (
        <BpmField m={m} className="m-bpm" style={typing} onDone={() => setTyping(null)} />
      ) : (
        <output
          className="m-bpm"
          aria-live="polite"
          data-tip="Double-click to type a tempo"
          onDoubleClick={(event) => {
            const { width, height } = event.currentTarget.getBoundingClientRect();
            setTyping({ width, height });
          }}
        >
          {m.s.bpm}
        </output>
      )}
      <BpmStep m={m} by={1} size={big ? 18 : 14} />
    </div>
  );
}

export function TempoSlider({ m }: { m: MetronomeApi }) {
  return (
    <input
      className="m-range"
      type="range"
      min={20}
      max={300}
      value={m.s.bpm}
      aria-label="Tempo"
      onChange={(event) => m.setBpm(Number(event.target.value))}
      style={{ "--fill": `${((m.s.bpm - 20) / 280) * 100}%` } as CSSProperties}
    />
  );
}

/** Tap tempo: the button itself pulses on each tap, so a press is seen to
 *  land even before a second one makes a tempo. */
export function TapButton({ m, className = "" }: { m: MetronomeApi; className?: string }) {
  const [pulse, setPulse] = useState(0);
  return (
    <button
      type="button"
      className={`m-tap ${className}`}
      data-tip="Tap along with the beat, or press T"
      onPointerDown={() => {
        m.tap();
        setPulse((n) => n + 1);
      }}
      onKeyDown={(event) => {
        // Pressed from the keyboard, a tap is the key going down, as the
        // pointer's is — never the click that follows the key coming up.
        if (event.key !== "Enter" || event.repeat) return;
        m.tap();
        setPulse((n) => n + 1);
      }}
    >
      <span key={pulse} className="m-tap-ring" aria-hidden="true" />
      Tap
    </button>
  );
}

export function PlayButton({ m, size = "normal" }: { m: MetronomeApi; size?: "normal" | "large" | "round" }) {
  return (
    <button
      type="button"
      className={`m-play ${size}${m.running ? " on" : ""}`}
      onClick={m.toggle}
      aria-label={m.running ? "Stop" : "Start"}
      data-tip={size === "round" ? `${m.running ? "Stop" : "Start"} — Space` : undefined}
    >
      {m.running ? <Square size={size === "normal" ? 13 : 18} fill="currentColor" strokeWidth={0} /> : <Play size={size === "normal" ? 14 : 22} fill="currentColor" strokeWidth={0} />}
      {size !== "round" && <span>{m.running ? "Stop" : "Start"}</span>}
    </button>
  );
}

export function VolumeSlider({ m }: { m: MetronomeApi }) {
  const Icon = m.s.volume === 0 ? VolumeX : m.s.volume < 0.5 ? Volume1 : Volume2;
  const before = useRef(0.8);
  return (
    <div className="m-volume">
      <button
        type="button"
        className="m-icon-button bare"
        aria-label={m.s.volume === 0 ? "Unmute" : "Mute"}
        data-tip={m.s.volume === 0 ? "Unmute" : "Mute"}
        onClick={() => {
          if (m.s.volume > 0) {
            before.current = m.s.volume;
            m.set({ volume: 0 });
          } else m.set({ volume: before.current || 0.8 });
        }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </button>
      <input
        className="m-range"
        type="range"
        min={0}
        max={100}
        value={Math.round(m.s.volume * 100)}
        aria-label="Volume"
        onChange={(event) => m.set({ volume: Number(event.target.value) / 100 })}
        style={{ "--fill": `${m.s.volume * 100}%` } as CSSProperties}
      />
      <span className="m-volume-value">{Math.round(m.s.volume * 100)}</span>
    </div>
  );
}

/** A pop-up button: a `<select>`, so it opens the system's own menu, with
 *  its chevrons drawn by the page — macOS's pair, the same inset as the
 *  text — rather than by the browser, which drew one arrow hard against
 *  the right edge in one engine and its own shape in another. */
export function Popup({ children, ...select }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="m-popup">
      <select {...select}>{children}</select>
      <ChevronsUpDown className="m-popup-mark" size={12} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/** A sound picked is heard: struck on its own while the metronome is
 *  stopped, and simply from the next click on while it plays — a preview
 *  over a running beat is two rhythms at once, and the beat already is the
 *  sound to judge. */
function picked(m: MetronomeApi, sound: string) {
  m.set({ sound });
  if (!m.engine.isRunning) void m.engine.preview(sound);
}

/** The sound as a native menu: WebKit draws it as macOS's own pop-up in
 *  Lumi, and picking one plays it (`picked`). */
export function SoundSelect({ m }: { m: MetronomeApi }) {
  return (
    <div className="m-sound-select">
      <Popup
        value={m.s.sound}
        aria-label="Sound"
        onChange={(event) => picked(m, event.target.value)}
      >
        {VOICES.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </Popup>
      {/* A play mark, outlined, not a speaker: beside the volume's speaker
          (the Simple theme's Sound row) two speakers read as one control
          twice. Dimmed while the beat plays, for `picked`'s reason — by
          `aria-disabled` rather than `disabled`, so the pointer still
          reaches it and its help tag can say why. */}
      <button
        type="button"
        className="m-icon-button"
        aria-label="Play this sound"
        aria-disabled={m.running || undefined}
        data-tip={m.running ? "The beat is playing this sound" : "Play this sound"}
        onClick={() => {
          if (!m.engine.isRunning) void m.engine.preview(m.s.sound);
        }}
      >
        <Play size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

/** The sounds as a list of cards, each heard as it is picked (`picked`):
 *  a name a card, one line, so the eight take two short rows — what each
 *  sounds like is its help tag, and the press says it better anyway. */
export function SoundCards({ m, columns = 4 }: { m: MetronomeApi; columns?: number }) {
  return (
    <div className="m-sound-cards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Sound">
      {VOICES.map((one) => (
        <button
          key={one.id}
          type="button"
          role="radio"
          aria-checked={m.s.sound === one.id}
          aria-description={one.hint}
          data-tip={one.hint}
          className={m.s.sound === one.id ? "on" : ""}
          onClick={() => picked(m, one.id)}
        >
          {one.name}
        </button>
      ))}
    </div>
  );
}

/** Common time signatures as chips, and Other for one built from a beat
 *  count and a note value. Seven chips and Other make eight, so the set
 *  lies flat as one row of eight or two rows of four with nothing left
 *  over — `columns` picks which, for a wide column or a narrow one. */
export function SignaturePicker({ m, columns = 8 }: { m: MetronomeApi; columns?: 4 | 8 }) {
  const preset = SIGNATURES.some((one) => one.beats === m.s.beats && one.unit === m.s.unit);
  const [custom, setCustom] = useState(!preset);
  return (
    <div className={`m-signatures${columns === 4 ? " narrow" : ""}`}>
      <div className="m-sig-chips" role="radiogroup" aria-label="Time signature" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {SIGNATURES.map((one) => {
          const on = !custom && one.beats === m.s.beats && one.unit === m.s.unit;
          return (
            <button
              key={`${one.beats}/${one.unit}`}
              type="button"
              role="radio"
              aria-checked={on}
              className={`m-sig${on ? " on" : ""}`}
              onClick={() => {
                setCustom(false);
                m.setSignature(one.beats, one.unit);
              }}
            >
              <Fraction beats={one.beats} unit={one.unit} />
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={custom} className={`m-sig other${custom ? " on" : ""}`} onClick={() => setCustom(true)}>
          {custom ? <Fraction beats={m.s.beats} unit={m.s.unit} /> : "Other"}
        </button>
      </div>
      {custom && (
        <div className="m-sig-custom">
          <BeatsStepper m={m} />
          <span className="muted">beats of</span>
          <UnitPicker m={m} />
        </div>
      )}
    </div>
  );
}

export function BeatsStepper({ m }: { m: MetronomeApi }) {
  return (
    <div className="m-stepper small">
      <Repeating label="Fewer beats" onStep={() => m.setSignature(Math.max(1, m.engine.settings.beats - 1), m.engine.settings.unit)}>
        <Minus size={12} strokeWidth={2.2} />
      </Repeating>
      <output>{m.s.beats}</output>
      <Repeating label="More beats" onStep={() => m.setSignature(Math.min(16, m.engine.settings.beats + 1), m.engine.settings.unit)}>
        <Plus size={12} strokeWidth={2.2} />
      </Repeating>
    </div>
  );
}

export function Fraction({ beats, unit }: { beats: number; unit: number }) {
  return (
    <span className="m-fraction" aria-label={`${beats} ${unit}`}>
      <span>{beats}</span>
      <span>{unit}</span>
    </span>
  );
}

export function SubdivisionPicker({ m }: { m: MetronomeApi }) {
  return (
    <Segmented
      label="Subdivision"
      className="m-subs"
      value={m.s.sub}
      onChange={(sub) => m.set({ sub })}
      options={SUBDIVISIONS.map((one) => ({ value: one.sub, label: <SubGlyph sub={one.sub} />, title: one.name }))}
    />
  );
}

/** A subdivision drawn as its notes: one, two beamed, three under a
 *  bracket, four double-beamed — clearer than music fonts, which macOS
 *  draws in a fallback face at this size. */
export function SubGlyph({ sub }: { sub: 1 | 2 | 3 | 4 }) {
  const heads = sub === 1 ? [10] : sub === 2 ? [5, 15] : sub === 3 ? [3, 10, 17] : [2, 7.3, 12.6, 18];
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" className="m-subglyph">
      {heads.map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={13} rx={2.1} ry={1.6} transform={`rotate(-20 ${x} 13)`} fill="currentColor" />
          <line x1={x + 1.9} y1={12.6} x2={x + 1.9} y2={3} stroke="currentColor" strokeWidth={1.1} />
        </g>
      ))}
      {sub > 1 && <line x1={heads[0]! + 1.9} y1={3.4} x2={heads[heads.length - 1]! + 1.9} y2={3.4} stroke="currentColor" strokeWidth={1.8} />}
      {sub === 4 && <line x1={heads[0]! + 1.9} y1={6.2} x2={heads[3]! + 1.9} y2={6.2} stroke="currentColor" strokeWidth={1.8} />}
      {sub === 3 && (
        <text x={11.9} y={2.2} fontSize={5} textAnchor="middle" fill="currentColor" fontWeight={700}>
          3
        </text>
      )}
    </svg>
  );
}

/** The note that gets the beat, by name, for the picker's accessible
 *  labels and the words beside it. */
export const UNITS: { unit: Settings["unit"]; name: string }[] = [
  { unit: 2, name: "half notes" },
  { unit: 4, name: "quarter notes" },
  { unit: 8, name: "eighth notes" },
  { unit: 16, name: "sixteenth notes" },
];

export function unitName(unit: Settings["unit"]): string {
  return UNITS.find((one) => one.unit === unit)?.name ?? "quarter notes";
}

/** One note, drawn as `SubGlyph` draws its notes — the same head, stem
 *  and weight, so the two pickers read as one set: a hollow head for a
 *  half note, a filled one for a quarter, and a flag more for each halving
 *  after that. */
export function NoteGlyph({ unit }: { unit: Settings["unit"] }) {
  const flags = unit === 8 ? [3] : unit === 16 ? [3, 6.2] : [];
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" className="m-noteglyph">
      <ellipse
        cx={5}
        cy={13}
        rx={2.3}
        ry={1.7}
        transform="rotate(-20 5 13)"
        fill={unit === 2 ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={unit === 2 ? 1.1 : 0}
      />
      <line x1={7.1} y1={12.5} x2={7.1} y2={2.4} stroke="currentColor" strokeWidth={1.1} />
      {flags.map((y) => (
        <path key={y} d={`M7.1 ${y - 0.6} c0.3 2 3.4 2.6 3.1 5.6`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Which note gets the beat, as notes rather than their names: the
 *  Subdivision picker's look, for the same reason. */
export function UnitPicker({ m }: { m: MetronomeApi }) {
  return (
    <Segmented
      label="Note value"
      className="m-units"
      value={m.s.unit}
      onChange={(unit) => m.setSignature(m.s.beats, unit)}
      options={UNITS.map((one) => ({ value: one.unit, label: <NoteGlyph unit={one.unit} />, title: one.name }))}
    />
  );
}

/** One labelled row, the way Lumi's own settings are laid out: the label
 *  (and its line of help) leading, the control trailing. `stacked` puts
 *  the control under the label instead, for a column too narrow for both
 *  on one line — where the help was wrapping to a word a line beside it. */
export function Row({ label, hint, stacked = false, children }: { label: ReactNode; hint?: ReactNode; stacked?: boolean; children: ReactNode }) {
  return (
    <div className={`m-row${stacked ? " stacked" : ""}`}>
      <div className="m-row-label">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <div className="m-row-control">{children}</div>
    </div>
  );
}
