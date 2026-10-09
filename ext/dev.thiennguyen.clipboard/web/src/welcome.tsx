// Clipboard Manager's Welcome window — the eight-step tour `on_lifecycle`
// opens on an install and on an update. The top half is a small, live
// picture of the panel acting out each step; the bottom half says it. After
// the last step comes the finish: not a ninth step but the whole window,
// so nobody pressing Continue expects another one after it.
//
// Its own choice: Lumi opens nothing on an install, and the one thing an
// install can leave undone is the shortcut. Lumi tries ⌘⇧C once and, when
// something holds it, arms nothing and writes down who (`GET
// /__lumi__/shortcuts`' `ess`); the third step reads that and asks the
// person what to do — take it off the row that holds it, another key, or
// later. Lumi never decides that on its own.

import { type ReactNode, StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { call, canAuthenticate, message } from "./bridge";
import {
  ClipboardGlyph,
  CloudOffGlyph,
  EyeOffGlyph,
  EyeGlyph,
  FileGlyph,
  FingerprintGlyph,
  KeyGlyph,
  KindGlyph,
  LockGlyph,
  PlayGlyph,
  SearchGlyph,
  ShieldGlyph,
} from "./icons";
import { acceleratorGlyphs, glyphs, panelKeys } from "./keys";
import { holdersText } from "./ownKey";
import { useOwnShortcut } from "./ownShortcut";
import { fuzzyScore } from "./search";
import type { FileFamily } from "./fileType";
import type { Kind } from "./types";
import "./welcome.css";

if (import.meta.env.DEV) {
  await import("./dev/mock");
}

/** The command the shortcut step is about. */
const COMMAND = "open";

const TIPS: [string, string][] = [
  ["↩", "Paste"],
  ["⌥↩", "Paste as plain text"],
  ["⇥", "Filter by kind"],
  ["⌘K", "More actions"],
  ["⌘P", "Pin"],
  ["⌘Y", "Expand preview"],
  ["⌘⌥⌫", "Delete"],
];

const STEPS = 8;

/** The privacy step's keys as the panel will answer them — the person's own
 *  if they set some, read the way the panel reads them. */
type CoverKeys = { one: string | null; all: string | null };

/** The settings the privacy and Touch ID steps show and set. */
type TourSettings = { keys: CoverKeys; lockHistory: boolean; privacyConfirm: boolean };
type Locks = Partial<Pick<TourSettings, "lockHistory" | "privacyConfirm">>;

/** Read once; `set` saves only what it is given — Lumi keeps the rest. */
function useTourSettings(): [TourSettings, (patch: Locks) => Promise<void>] {
  const [settings, setSettings] = useState<TourSettings>(() => ({
    keys: fromKeys(panelKeys(undefined, undefined, undefined)),
    lockHistory: false,
    privacyConfirm: false,
  }));
  useEffect(() => {
    fetch("/__lumi__/settings")
      .then((answer) => answer.json())
      .then((raw: Record<string, unknown>) => {
        const text = (v: unknown) => (v == null ? undefined : String(v));
        setSettings({
          keys: fromKeys(panelKeys(text(raw.pinKey), text(raw.revealKey), text(raw.revealAllKey))),
          lockHistory: text(raw.lockHistory) === "true",
          privacyConfirm: text(raw.privacyConfirm) === "true",
        });
      })
      .catch(() => {});
  }, []);
  const set = useCallback(async (patch: Locks) => {
    const written = Object.fromEntries(Object.entries(patch).map(([name, on]) => [name, String(on)]));
    const answer = await fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify(written) });
    if (!answer.ok) throw new Error((await answer.text()) || "Could not save");
    setSettings((was) => ({ ...was, ...patch }));
  }, []);
  return [settings, set];
}

function fromKeys(keys: ReturnType<typeof panelKeys>): CoverKeys {
  return { one: keys.reveal && glyphs(keys.reveal), all: keys.revealAll && glyphs(keys.revealAll) };
}

function Welcome() {
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  // The key the preview wears on the shortcut step: whatever is armed.
  const [armed, setArmed] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // Privacy mode, for the privacy step's button: on already, or turned on here.
  const [privacy, setPrivacy] = useState(false);
  const [tour, setTour] = useTourSettings();
  const coverKeys = tour.keys;
  // Whether "Is it you?" can be asked here: this Mac has a password.
  const [canAsk, setCanAsk] = useState<boolean | null>(null);

  useEffect(() => {
    call({ kind: "welcome" })
      .then((told) => {
        setFrom(told.from);
        setPrivacy(told.privacy === true);
      })
      .catch((err) => setFailed(message(err)));
    void canAuthenticate().then(setCanAsk);
  }, []);

  const act = (work: () => Promise<unknown>) => {
    setFailed("");
    work().catch((err) => setFailed(message(err)));
  };

  const last = step === STEPS - 1;

  if (finished) {
    return (
      <Finish
        armed={armed}
        failed={failed}
        onAgain={() => {
          setFailed("");
          setStep(0);
          setFinished(false);
        }}
        onOpen={() => act(() => call({ kind: "openPanel" }))}
        onDone={() => act(() => call({ kind: "close" }))}
      />
    );
  }

  return (
    <main className="tour">
      <Preview step={step} armed={armed} keys={coverKeys} />
      <div className="body">
        {step === 0 &&
          (from ? (
            <>
              <h1>Clipboard Manager was updated</h1>
              <p className="dim">
                From {from}. Your history and pins are where they were. New: privacy mode keeps
                each preview covered until you show it — and Touch ID can lock the whole history.
              </p>
            </>
          ) : (
            <>
              <h1>Welcome to Clipboard Manager</h1>
              <p className="dim">
                Everything you copy — text, links, colours, files, screenshots — is kept on this
                Mac and pasted back from a panel.
              </p>
            </>
          ))}
        {step === 1 && (
          <>
            <h1>Private by design</h1>
            <p className="dim">
              Your history never leaves this Mac, and it is stored encrypted. Passwords copied
              from a password manager are never saved. In Settings you can skip apps, skip text
              that matches a pattern, or forget copies after a while.
            </p>
          </>
        )}
        {/* Kept mounted so the answer is read once and the key it arms
            stays on the preview whichever step is showing. */}
        <div className="shortcut" hidden={step !== 2}>
          <h1>One key opens this panel</h1>
          <Shortcut onArmed={setArmed} />
        </div>
        {step === 3 && (
          <>
            <h1>Find it with a few letters</h1>
            <div className="tips">
              {TIPS.map(([key, label]) => (
                <span key={key}><Caps glyphs={key} small /> {label}</span>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h1>Look before you paste</h1>
            <p className="dim">
              The item you are on opens beside the list. Videos and songs play, a PDF pages
              through, JSON folds open, code is highlighted — no app to open, and nothing leaves
              this Mac. <Caps glyphs="↑" small /> <Caps glyphs="↓" small /> to move along.
            </p>
          </>
        )}
        {step === 5 && (
          <>
            <h1>Keep it covered</h1>
            <p className="dim">
              Sharing your screen, or someone beside you? Privacy mode covers each preview until
              you show it
              {coverKeys.one && (
                <>
                  {" "}— <Caps glyphs={coverKeys.one} small /> for one
                  {coverKeys.all && (
                    <>
                      , <Caps glyphs={coverKeys.all} small /> for all
                    </>
                  )}
                </>
              )}
              . Turn it on in Settings, from Lumi’s menu bar or with a key. Settings can ask
              for Touch ID first, or lock the whole history.
            </p>
            <div className="row-actions">
              <Once
                glyph={<EyeOffGlyph />}
                label="Turn on privacy mode"
                doneLabel="Privacy mode is on"
                done={privacy}
                onClick={() =>
                  act(async () => {
                    await call({ kind: "privacy", on: true });
                    setPrivacy(true);
                  })
                }
              />
            </div>
          </>
        )}
        {step === 6 && (
          <>
            <h1>Lock it with Touch ID</h1>
            <p className="dim">
              Put your history behind Touch ID, your Apple Watch or your password: the panel opens
              locked — no list, no preview, nothing to paste — until you confirm it’s you. Or keep
              the list, and confirm only before a preview is shown.
            </p>
            {canAsk === false ? (
              <p className="dim small row-actions">Needs a password on this Mac.</p>
            ) : (
              canAsk && (
                <div className="row-actions">
                  <Once
                    glyph={<LockGlyph />}
                    label="Lock my history"
                    doneLabel="History lock is on"
                    done={tour.lockHistory}
                    onClick={() => act(() => setTour({ lockHistory: true }))}
                  />
                  {/* The lock asks before anything is shown, so asking
                      before showing is nothing more beside it: dimmed, as
                      Settings dims it, not taken away. */}
                  <Once
                    glyph={<FingerprintGlyph />}
                    label="Ask before showing"
                    doneLabel="Asks before showing"
                    done={tour.privacyConfirm}
                    off={tour.lockHistory}
                    onClick={() => act(() => setTour({ privacyConfirm: true }))}
                  />
                </div>
              )
            )}
          </>
        )}
        {step === 7 && (
          <>
            <h1>Drag it where it goes</h1>
            <p className="dim">
              Drag any item out of the panel into another app. A file lands as the file itself —
              attached to a mail, dropped in a folder — a screenshot as an image, text as text.
              Settings can close the panel after each drop.
            </p>
          </>
        )}
        {failed && <p className="failed" role="alert">{failed}</p>}
        <div className="actions">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, at) => (
              <span key={at} className={at === step ? "on" : ""} />
            ))}
          </span>
          <button type="button" className="link" onClick={() => act(() => call({ kind: "settings" }))}>
            Settings
          </button>
          <span className="sp" />
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => {
              setFailed("");
              if (last) setFinished(true);
              else setStep(step + 1);
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}

/** Where each piece of confetti flies to from the middle of the mark, in
 *  px, and how far it turns. Fixed, so every finish bursts the same. */
const CONFETTI: [number, number, number][] = [
  [-150, -70, 200], [-120, -110, -140], [-80, -130, 260], [-40, -120, -90],
  [10, -140, 180], [55, -125, -220], [95, -115, 120], [135, -90, -160],
  [165, -50, 240], [-170, -20, -120], [-135, 25, 200], [150, 10, -200],
  [120, 50, 150], [-95, 60, -260], [80, 70, 90], [-30, 80, 210],
];
const CONFETTI_COLOURS = ["#7c6ff0", "#378add", "#d4537e", "#e0a300", "#2f8a3e"];

/**
 * The end of the tour: the whole window, no preview and no dots, so it
 * reads as the end rather than one more step. Says what is now true — it is
 * recording, and which key opens it — and offers the panel and the door.
 */
/**
 * A button that, once done, says so in its own place: the same box — its
 * padding, its border, its height — and as wide as the wider of its two
 * labels from the start, so neither it nor anything beside or under it
 * moves when it turns into "done". Measured before: "Turn on privacy mode"
 * was 176×32 and the note that replaced it 128×18. `off`: it waits on
 * another choice, dimmed and not pressed, whichever label it shows.
 */
function Once({
  glyph,
  label,
  doneLabel,
  done,
  off = false,
  onClick,
}: {
  glyph: ReactNode;
  label: string;
  doneLabel: string;
  done: boolean;
  off?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={["once", done && "done", off && "off"].filter(Boolean).join(" ")}
      disabled={done || off}
      onClick={onClick}
    >
      {glyph}
      <span className="once-labels" aria-live="polite">
        <span className={done ? "gone" : undefined}>{label}</span>
        <span className={done ? undefined : "gone"}>{doneLabel}</span>
      </span>
    </button>
  );
}

function Finish({
  armed,
  failed,
  onAgain,
  onOpen,
  onDone,
}: {
  armed: string | null;
  failed: string;
  onAgain: () => void;
  onOpen: () => void;
  onDone: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);

  return (
    <main className="finish">
      <div className="mark" aria-hidden="true">
        {CONFETTI.map(([x, y, turn], at) => (
          <i
            key={at}
            style={{
              ["--x" as string]: `${x}px`,
              ["--y" as string]: `${y}px`,
              ["--turn" as string]: `${turn}deg`,
              background: CONFETTI_COLOURS[at % CONFETTI_COLOURS.length],
              animationDelay: `${(at % 4) * 0.04}s`,
            }}
          />
        ))}
        <span className="badge">
          <ClipboardGlyph />
          <span className="tick">✓</span>
        </span>
      </div>
      <h1>You’re all set 🎉</h1>
      <p className="dim">
        Clipboard Manager is keeping what you copy from now on.
        <br />
        {armed ? (
          <>
            Press <Caps glyphs={acceleratorGlyphs(armed)} small /> in any app to open it.
          </>
        ) : (
          <>Give it a key in Settings to open it from anywhere.</>
        )}
      </p>
      {failed && <p className="failed" role="alert">{failed}</p>}
      <div className="row">
        <button type="button" onClick={onOpen}>Open the panel</button>
        <button type="button" className="primary" ref={done} onClick={onDone}>
          Done
        </button>
      </div>
      <button type="button" className="link again" onClick={onAgain}>
        Take the tour again
      </button>
    </main>
  );
}

const ROWS: { kind: Kind; text: string; from: string }[] = [
  { kind: "link", text: "https://lumikeys.app", from: "Safari" },
  { kind: "color", text: "#534AB7", from: "Figma" },
  { kind: "text", text: "npm install --save-dev vite", from: "Terminal" },
  { kind: "file", text: "Invoice-September.pdf", from: "Finder" },
];

/** Typed a letter at a time: each one thins the list, the way the panel's
 *  fuzzy search does, until only the invoice is left. */
const QUERY = "invsep";

/** The rows `query` finds, best first, scored by the panel's own fuzzy
 *  search — with where each letter landed, to underline. */
function found(query: string) {
  if (!query) return ROWS.map((row) => ({ row, marks: [] as number[] }));
  return ROWS.map((row, at) => ({ row, at, score: fuzzyScore(row.text.toLowerCase(), query) }))
    .filter((hit): hit is { row: (typeof ROWS)[number]; at: number; score: number } => hit.score !== null)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map(({ row }) => ({ row, marks: marksOf(row.text.toLowerCase(), query) }));
}

/** Where the letters of `needle` fall in `hay`: of every start, the one
 *  that keeps them closest together. */
function marksOf(hay: string, needle: string): number[] {
  let best: number[] = [];
  for (let start = hay.indexOf(needle[0] ?? ""); start >= 0; start = hay.indexOf(needle[0] ?? "", start + 1)) {
    const marks: number[] = [];
    let from = start;
    for (const ch of needle) {
      const at = hay.indexOf(ch, from);
      if (at < 0) break;
      marks.push(at);
      from = at + 1;
    }
    const span = (m: number[]) => (m.at(-1) ?? 0) - (m[0] ?? 0);
    if (marks.length === needle.length && (!best.length || span(marks) < span(best))) best = marks;
  }
  return best;
}

function Marked({ text, marks }: { text: string; marks: number[] }) {
  if (!marks.length) return <>{text}</>;
  const on = new Set(marks);
  return <>{[...text].map((ch, at) => (on.has(at) ? <mark key={at}>{ch}</mark> : ch))}</>;
}

/**
 * A small, pretend panel acting out the step on screen: things arriving as
 * they are copied; the history sealed where it is kept; the panel popping
 * up at the key; a few letters typed narrowing the list down to one row;
 * files opening beside the list; previews covered until shown; the history
 * opened with Touch ID; a row dragged out into a mail.
 */
function Preview({ step, armed, keys }: { step: number; armed: string | null; keys: CoverKeys }) {
  const [typed, setTyped] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  const handoff = useRef<Keyframe | null>(null);

  // Leaving the shortcut step drops its loop, and the panel would snap from
  // wherever the loop had it — gone, half-way — straight to shown. Note
  // where it was while the old class is still on it (the render before the
  // commit), then carry it home from there once the new class is in.
  if (shown.current !== step) {
    if (shown.current === 2 && panel.current) {
      const now = getComputedStyle(panel.current);
      if (Number(now.opacity) < 0.99) handoff.current = { opacity: now.opacity, transform: now.transform };
    }
    shown.current = step;
  }

  useLayoutEffect(() => {
    const from = handoff.current;
    handoff.current = null;
    if (!from || !panel.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    panel.current.animate([from, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    setTyped(0);
    // Type the query, hold it a moment, start again.
    const tick = window.setInterval(() => setTyped((was) => (was >= QUERY.length + 12 ? 0 : was + 1)), 140);
    return () => window.clearInterval(tick);
  }, [step]);

  // The drag step picks up where the search left off: the invoice found.
  const query = step === 3 ? QUERY.slice(0, typed) : step === 7 ? QUERY : "";
  const rows = found(query);
  const done = step === 3 && query === QUERY;

  return (
    <div className={`preview step-${step}`} aria-hidden="true">
      {/* Always mounted, grown in on the shortcut step only: the panel
          glides aside for it and back rather than jumping. */}
      <span className={["press", step === 2 && "shown", !armed && "none"].filter(Boolean).join(" ")}>
        {armed ? <Caps glyphs={acceleratorGlyphs(armed)} small /> : "No key yet"}
      </span>
      <div className="panel" ref={panel}>
        {step === 4 ? (
          <Looking />
        ) : step === 5 ? (
          <Covered keys={keys} />
        ) : step === 6 ? (
          <Locked />
        ) : step === 1 ? (
          <Vault />
        ) : <>
        <div className="search">
          <SearchGlyph />
          {query ? <span>{query}</span> : <span className="placeholder">Search</span>}
          {step === 3 && <span className="caret" />}
        </div>
        {rows.map(({ row, marks }, at) => (
          <div key={row.text} className={at === 0 ? "item first" : "item"} style={{ animationDelay: `${at * 0.35}s` }}>
            {row.kind === "color" ? <span className="swatch" /> : <KindGlyph kind={row.kind} />}
            <span className="text"><Marked text={row.text} marks={marks} /></span>
            <span className="meta">{at === 0 && done ? "↩ paste" : row.from}</span>
            {step === 7 && at === 0 && (
              <span className="ghost">
                <KindGlyph kind={row.kind} />
                <span className="text">{row.text}</span>
                <Pointer />
              </span>
            )}
          </div>
        ))}
        </>}
      </div>
      {/* Always mounted, grown in on the drag step only, like the key: the
          panel glides aside for it and back. */}
      <div className={step === 7 ? "drop shown" : "drop"}>
        <div className="bar">
          <span className="lights"><i /><i /><i /></span>
          New Message
        </div>
        <div className="lines"><i /><i /><i /></div>
        <div className="well">
          <span className="landed">
            <KindGlyph kind="file" />
            <span className="text">Invoice-September.pdf</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const FILES: { family: FileFamily; name: string; size: string }[] = [
  { family: "video", name: "Product-demo.mov", size: "0:42" },
  { family: "audio", name: "Voice memo.m4a", size: "1:15" },
  { family: "pdf", name: "Invoice-September.pdf", size: "2 pages" },
  { family: "code", name: "package.json", size: "1 KB" },
];

/** How long each file stays selected, in ms. */
const DWELL = 2600;

/**
 * The preview step: the panel as it really is, a list with the selected
 * item open beside it. The selection walks down the files, one kind of
 * preview each, and starts again.
 */
function Looking() {
  const [on, setOn] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tick = window.setInterval(() => setOn((was) => (was + 1) % FILES.length), DWELL);
    return () => window.clearInterval(tick);
  }, []);

  const file = FILES[on] ?? FILES[0]!;
  return (
    <div className="split">
      <div className="list">
        {FILES.map((one, at) => (
          <div key={one.name} className={at === on ? "item first" : "item"}>
            <FileGlyph family={one.family} />
            <span className="text">{one.name}</span>
          </div>
        ))}
      </div>
      {/* Keyed, so each file's pane comes in fresh and its loop starts over. */}
      <div key={file.name} className={`pane ${file.family}`}>
        {file.family === "video" && <Film length={file.size} />}
        {file.family === "audio" && <Song length={file.size} />}
        {file.family === "pdf" && <Pages />}
        {file.family === "code" && <Json />}
      </div>
    </div>
  );
}

/** The privacy step's rows: a copy whose preview says more than its row, a
 *  file, and a colour — which privacy mode never covers. */
const COVERED_ROWS: { kind: Kind; family?: FileFamily; name: string }[] = [
  { kind: "text", name: "Q4 budget — draft" },
  { kind: "file", family: "pdf", name: "Contract-Acme.pdf" },
  { kind: "color", name: "#534AB7" },
];

/** The privacy step, beat by beat: which row is on, what is shown, which
 *  key is pressed, and for how long (ms). */
const COVER_BEATS: { on: number; shown: "none" | "one" | "all"; press: "one" | "all" | "eye" | null; ms: number }[] = [
  { on: 0, shown: "none", press: null, ms: 1500 },
  { on: 0, shown: "one", press: "one", ms: 1900 },
  { on: 1, shown: "one", press: null, ms: 1400 },
  { on: 2, shown: "one", press: null, ms: 1600 },
  { on: 1, shown: "all", press: "all", ms: 2000 },
  { on: 1, shown: "none", press: "eye", ms: 1500 },
];

/**
 * The privacy step: the list stays as it is, the preview beside it is
 * covered. The show key opens the budget; the next row is covered again; a
 * colour never is; the show-all key opens everything; then it is all
 * covered again — what the panel closing does.
 */
function Covered({ keys }: { keys: CoverKeys }) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setBeat((was) => (was + 1) % COVER_BEATS.length), COVER_BEATS[beat]!.ms);
    return () => window.clearTimeout(timer);
  }, [beat]);

  const now = COVER_BEATS[beat]!;
  const row = COVERED_ROWS[now.on]!;
  const shown = row.kind === "color" || now.shown === "all" || (now.shown === "one" && now.on === 0);
  const press = now.press === "one" ? keys.one : now.press === "all" ? keys.all : null;
  return (
    <div className="split covered-scene">
      <div className="list">
        <div className="veil-head">
          <EyeOffGlyph />
          <span>Privacy mode</span>
          <span className={now.press === "eye" ? "badge-on blink" : "badge-on"}>On</span>
        </div>
        {COVERED_ROWS.map((one, at) => (
          <div key={one.name} className={at === now.on ? "item first" : "item"}>
            {one.kind === "color" ? (
              <span className="swatch" />
            ) : one.family ? (
              <FileGlyph family={one.family} />
            ) : (
              <KindGlyph kind={one.kind} />
            )}
            <span className="text">{one.name}</span>
          </div>
        ))}
      </div>
      <div className="pane shroud-pane">
        {shown ? (
          <div key={`${row.name}-shown`} className="shown-body">
            {row.kind === "color" && (
              <>
                <span className="big-swatch" />
                <span className="never-note"><EyeGlyph /> Colours are never covered</span>
              </>
            )}
            {row.kind === "text" && (
              <div className="budget">
                <span><b>Revenue</b> $4.2M</span>
                <span><b>Hiring</b> +12</span>
                <span><b>Runway</b> 26 months</span>
                <span className="dimline">Draft — do not share</span>
              </div>
            )}
            {row.kind === "file" && <Pages />}
          </div>
        ) : (
          <div key={`${row.name}-covered`} className="shroud">
            <span className="bars" />
            <span className="shroud-note">
              <EyeOffGlyph />
              <b>Content hidden</b>
            </span>
          </div>
        )}
        {press && (
          <span key={`${beat}-press`} className="chord">
            <Caps glyphs={press} small />
          </span>
        )}
      </div>
    </div>
  );
}

/** The Touch ID step, beat by beat (ms): locked; macOS's "Is it you?"
 *  over the panel, the fingerprint waiting; the fingerprint taken; the
 *  history open. Then locked again — the panel closing, or Lock now. */
const LOCK_BEATS: { phase: "locked" | "asking" | "yes" | "open"; ms: number }[] = [
  { phase: "locked", ms: 1400 },
  { phase: "asking", ms: 2100 },
  { phase: "yes", ms: 700 },
  { phase: "open", ms: 2600 },
];

/**
 * The Touch ID step: the panel opens locked, the dialog macOS shows for
 * Lumi asks for a finger, and the history opens behind it. With reduced
 * motion it holds on the dialog, the beat that says the most.
 */
function Locked() {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [beat, setBeat] = useState(still ? 1 : 0);

  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(() => setBeat((was) => (was + 1) % LOCK_BEATS.length), LOCK_BEATS[beat]!.ms);
    return () => window.clearTimeout(timer);
  }, [beat, still]);

  const phase = LOCK_BEATS[beat]!.phase;
  return (
    <div className={`locked-scene ${phase}`}>
      {phase === "open" ? (
        <>
          <div className="search">
            <SearchGlyph />
            <span className="placeholder">Search</span>
            <span className="sp" />
            <span className="badge-ok">Unlocked</span>
          </div>
          {ROWS.slice(0, 3).map((row, at) => (
            <div key={row.text} className={at === 0 ? "item first" : "item"} style={{ animationDelay: `${at * 0.12}s` }}>
              {row.kind === "color" ? <span className="swatch" /> : <KindGlyph kind={row.kind} />}
              <span className="text">{row.text}</span>
              <span className="meta">{row.from}</span>
            </div>
          ))}
        </>
      ) : (
        <div className="lock-face">
          <LockGlyph />
          <b>Clipboard history is locked</b>
          <span>Confirm it’s you to see and paste</span>
        </div>
      )}
      {(phase === "asking" || phase === "yes") && (
        <div className="is-it-you">
          <span className={phase === "yes" ? "print yes" : "print"}>
            <FingerprintGlyph />
          </span>
          <b>Lumi</b>
          <span>Lumi is trying to open your clipboard history (Clipboard Manager).</span>
          <span className="hint">{phase === "yes" ? "✓" : "Touch ID or enter your password"}</span>
        </div>
      )}
    </div>
  );
}

function Film({ length }: { length: string }) {
  return (
    <div className="film">
      <div className="frame">
        <span className="sun" />
        <span className="hill" />
        <span className="play"><PlayGlyph /></span>
      </div>
      <div className="scrub"><span /></div>
      <span className="clock">0:07 / {length}</span>
    </div>
  );
}

/** Bar heights for the waveform, as fractions of the tallest. */
const WAVE = [0.3, 0.5, 0.8, 0.6, 0.9, 0.45, 0.7, 1, 0.65, 0.4, 0.75, 0.55, 0.85, 0.35, 0.6, 0.9, 0.5, 0.7, 0.3, 0.55, 0.8, 0.45, 0.65, 0.35];

function Song({ length }: { length: string }) {
  return (
    <div className="song">
      <FileGlyph family="audio" />
      <div className="wave">
        {WAVE.map((tall, at) => (
          <i key={at} style={{ height: `${tall * 100}%`, animationDelay: `${0.2 + at * 0.09}s` }} />
        ))}
      </div>
      <span className="clock">0:24 / {length}</span>
    </div>
  );
}

function Pages() {
  return (
    <div className="pages">
      <div className="page">
        <b />
        <i /><i /><i />
        <span className="table"><i /><i /><i /><i /><i /><i /></span>
        <i className="short" />
      </div>
      <span className="clock">1 / 2</span>
    </div>
  );
}

function Json() {
  return (
    <pre className="json">
      <span className="line">{"{"}</span>
      <span className="line">  <span className="k">"name"</span>: <span className="s">"lumi-clipboard"</span>,</span>
      <span className="line">  <span className="k">"version"</span>: <span className="s">"2.1.0"</span>,</span>
      <span className="line">  <span className="k">"private"</span>: <span className="w">true</span>,</span>
      <span className="line open">  <span className="caret">▾</span> <span className="k">"scripts"</span>: {"{"}</span>
      <span className="line inner">    <span className="k">"dev"</span>: <span className="s">"vite"</span>,</span>
      <span className="line inner">    <span className="k">"build"</span>: <span className="s">"vite build"</span></span>
      <span className="line inner">  {"}"},</span>
      <span className="line">  <span className="k">"workers"</span>: <span className="n">4</span></span>
    </pre>
  );
}

/** What a copy looks like as it is kept: the plain text, and what lands on
 *  disk in its place. Made up, the same length, so it swaps letter by
 *  letter. */
const PLAIN = "npm install --save-dev vite";
const SEALED = "x9Qe#vL2·m0Tf+8Kd$pWz3Ra7!c";

/** In ticks of `SEAL_TICK`: held plain, sealing, held sealed, opening. */
const SEAL_HOLD = 14;
const SEAL_TICK = 70;
const SEAL_LOOP = 2 * (SEAL_HOLD + PLAIN.length);

/** How many letters are sealed at tick `at` of the loop. */
function sealedAt(at: number): number {
  const n = PLAIN.length;
  if (at < SEAL_HOLD) return 0;
  if (at < SEAL_HOLD + n) return at - SEAL_HOLD;
  if (at < 2 * SEAL_HOLD + n) return n;
  return n - (at - 2 * SEAL_HOLD - n);
}

/**
 * The privacy step: the panel's history as it is kept. A copy seals into
 * ciphertext letter by letter and opens again; the key is in the Keychain;
 * a password manager's copy comes and is turned away; nothing goes out.
 */
function Vault() {
  const [at, setAt] = useState(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? SEAL_HOLD + PLAIN.length : 0,
  );

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tick = window.setInterval(() => setAt((was) => (was + 1) % SEAL_LOOP), SEAL_TICK);
    return () => window.clearInterval(tick);
  }, []);

  const sealed = sealedAt(at);
  const shut = sealed === PLAIN.length;
  return (
    <div className="vault">
      <div className="search seal-head">
        <ShieldGlyph />
        <span>History on this Mac</span>
        <span className="sp" />
        <span className="badge-ok">Encrypted</span>
      </div>
      <div className={shut ? "item first shut" : "item first"} style={{ animationDelay: "0s" }}>
        <LockGlyph open={!shut} />
        <span className="text mono">
          <span className="cipher">{SEALED.slice(0, sealed)}</span>
          {PLAIN.slice(sealed)}
        </span>
        <span className="meta">{shut ? "on disk" : "Terminal"}</span>
      </div>
      <div className="item" style={{ animationDelay: "0.35s" }}>
        <KeyGlyph />
        <span className="text">Key kept in your Keychain</span>
        <span className="meta">Lumi</span>
      </div>
      <div className="item refused" style={{ animationDelay: "0.7s" }}>
        <EyeOffGlyph />
        <span className="text mono"><span className="secret">••••••••••••</span></span>
        <span className="meta">Secret · not kept</span>
      </div>
      <div className="item" style={{ animationDelay: "1.05s" }}>
        <CloudOffGlyph />
        <span className="text">No network access</span>
        <span className="meta">This Mac only</span>
      </div>
    </div>
  );
}

/** The mouse pointer carrying a dragged row. */
function Pointer() {
  return (
    <svg className="pointer" viewBox="0 0 16 20">
      <path d="M1.5 1.5v14.2l3.6-3.4 2.4 5.6 2.6-1.1-2.4-5.5h5z" />
    </svg>
  );
}

/** A combination as key-caps: one cap per modifier, one for the key. */
function Caps({ glyphs, small }: { glyphs: string; small?: boolean }) {
  const caps: string[] = [];
  let rest = glyphs;
  for (let head = rest[0]; head && "⌃⌥⇧⌘".includes(head); head = rest[0]) {
    caps.push(head);
    rest = rest.slice(1);
  }
  if (rest) caps.push(rest);
  return (
    <span className={small ? "caps small" : "caps"}>
      {caps.map((cap, at) => (
        <kbd key={at}>{cap}</kbd>
      ))}
    </span>
  );
}

/**
 * The shortcut step: what the install came to, read off `ess`.
 *
 * `registered` shows the key with a Change link; `taken` says who holds the
 * declared key and offers to take it off them, another key, or later;
 * `invalid` and `cleared` offer the recorder and the declared key again.
 * Every write is `PUT /__lumi__/shortcuts`, and a 409 — the key just pressed
 * is somebody's — comes back as the same offer.
 */
function Shortcut({ onArmed }: { onArmed: (key: string | null) => void }) {
  const { own, recording, said, held, busy, write, keepTheirs, record: toggle } = useOwnShortcut(COMMAND);
  const [later, setLater] = useState(false);

  useEffect(() => onArmed(own?.key ?? null), [own, onArmed]);

  const record = () => {
    setLater(false);
    if (!recording) toggle();
  };

  if (own === undefined) return <p className="dim">Looking up your shortcut…</p>;
  if (own === null) {
    // A Lumi older than `[[shortcut]]`, or no answer: the key is set the
    // old way, in Shortcuts, and that is where to send people.
    return (
      <p className="dim">
        Give <b>Show clipboard history</b> a key under Lumi's Settings → Shortcuts, and press it
        anywhere to open the panel.
      </p>
    );
  }

  const declared = acceleratorGlyphs(own.declared);
  // The declared key can be taken off its holder only when that holder is a
  // shortcut row or Lumi's own; another extension's key stays theirs.
  const takeable = own.state === "taken" && own.holder?.kind !== "extension";

  let body;
  if (recording) {
    body = (
      <div className="recording">
        <span className="keycap live">Press keys…</span>
        <span className="dim small">Esc to cancel · ⌘, ⌥ or ⌃ with a letter, a digit, Space or F1–F12</span>
      </div>
    );
  } else if (own.key) {
    body = (
      <>
        <div className="keyline">
          <Caps glyphs={acceleratorGlyphs(own.key)} />
          <span className="ok">Ready in every profile</span>
        </div>
        <p className="dim small">
          {own.key === own.declared ? "Press it in any app." : `Instead of ${declared}, which you changed.`}{" "}
          <button type="button" className="link" disabled={busy} onClick={record}>Change</button>
        </p>
      </>
    );
  } else if (later) {
    body = (
      <p className="dim">
        No key for now. Clipboard Manager's Settings tab, under Extensions in Lumi, has the same control.{" "}
        <button type="button" className="link" onClick={record}>Record one now</button>
      </p>
    );
  } else {
    body = (
      <>
        {/* A refused press brings its own sentence; one note at a time. */}
        {own.state === "taken" && own.reason && !held && <p className="note">{own.reason}</p>}
        {own.state === "invalid" && own.reason && <p className="note bad">{own.reason}</p>}
        {own.state === "cleared" && <p className="dim">No key yet. Record one, or leave it for later.</p>}
        <div className="row">
          {takeable ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void write(own.declared, true)}>
              Use {declared} here
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={record}>
              Record shortcut
            </button>
          )}
          {takeable ? (
            <button type="button" disabled={busy} onClick={record}>Pick another key</button>
          ) : (
            own.state !== "invalid" && (
              <button type="button" disabled={busy} onClick={() => void write(own.declared, false)}>
                Try {declared}
              </button>
            )
          )}
          <button type="button" className="link" disabled={busy} onClick={() => setLater(true)}>
            Later
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {body}
      {said && <p className="failed">{said}</p>}
      {held && (
        <div className="note">
          {held.said} Take {acceleratorGlyphs(held.key)} anyway? It comes off {holdersText(held.holders)}.
          <div className="row">
            <span className="sp" />
            <button type="button" disabled={busy} onClick={keepTheirs}>
              Keep theirs
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => void write(held.key, true)}>
              Use it here
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Welcome />
    </StrictMode>,
  );
}
