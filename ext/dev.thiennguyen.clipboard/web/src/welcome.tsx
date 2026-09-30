// Clipboard Manager's Welcome window — the six-step tour `on_lifecycle`
// opens on an install and on an update. The top half is a small, live
// picture of the panel acting out each step; the bottom half says it. After
// the last step comes the finish: not a seventh step but the whole window,
// so nobody pressing Continue expects another one after it.
//
// Its own choice: Lumi opens nothing on an install, and the one thing an
// install can leave undone is the shortcut. Lumi tries ⌘⇧C once and, when
// something holds it, arms nothing and writes down who (`GET
// /__lumi__/shortcuts`' `ess`); the second step reads that and asks the
// person what to do — take it off the row that holds it, another key, or
// later. Lumi never decides that on its own.

import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { call, Held, message, setShortcut, shortcuts } from "./bridge";
import {
  ClipboardGlyph,
  CloudOffGlyph,
  EyeOffGlyph,
  FileGlyph,
  KeyGlyph,
  KindGlyph,
  LockGlyph,
  PlayGlyph,
  SearchGlyph,
  ShieldGlyph,
} from "./icons";
import { acceleratorGlyphs, acceleratorOf, acceleratorRefusal } from "./keys";
import { fuzzyScore } from "./search";
import type { FileFamily } from "./fileType";
import type { ExtensionShortcut, Kind, ShortcutHolder } from "./types";
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
  ["⌥P", "Pin"],
  ["⌘⌥⌫", "Delete"],
];

const STEPS = 6;

function Welcome() {
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  // The key the preview wears on the shortcut step: whatever is armed.
  const [armed, setArmed] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    call({ kind: "welcome" })
      .then((told) => setFrom(told.from))
      .catch((err) => setFailed(message(err)));
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
      <Preview step={step} armed={armed} />
      <div className="body">
        {step === 0 &&
          (from ? (
            <>
              <h1>Clipboard Manager was updated</h1>
              <p className="dim">
                From {from}. Your history and pins are where they were. New: drag any item out
                of the panel into another app — a file lands as the file itself.
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
        {/* Kept mounted so the answer is read once and the key it arms
            stays on the preview whichever step is showing. */}
        <div className="shortcut" hidden={step !== 1}>
          <h1>One key opens this panel</h1>
          <Shortcut onArmed={setArmed} />
        </div>
        {step === 2 && (
          <>
            <h1>Find it with a few letters</h1>
            <div className="tips">
              {TIPS.map(([key, label]) => (
                <span key={key}><Caps glyphs={key} small /> {label}</span>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h1>Look before you paste</h1>
            <p className="dim">
              The item you are on opens beside the list. Videos and songs play, a PDF pages
              through, JSON folds open, code is highlighted — no app to open, and nothing leaves
              this Mac. <Caps glyphs="↑" small /> <Caps glyphs="↓" small /> to move along.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <h1>Drag it where it goes</h1>
            <p className="dim">
              Drag any item out of the panel into another app. A file lands as the file itself —
              attached to a mail, dropped in a folder — a screenshot as an image, text as text.
              Settings can close the panel after each drop.
            </p>
          </>
        )}
        {step === 5 && (
          <>
            <h1>Private by design</h1>
            <p className="dim">
              Your history stays on this Mac — the extension has no network access. What it keeps
              is encrypted with XChaCha20-Poly1305, under a key Lumi holds in your Keychain. Anything
              a password manager marks as secret is dropped before it arrives, and Settings can
              skip whole apps, text that matches a pattern, and forget copies after a time you pick.
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
 * they are copied; the panel popping up at the key; a few letters typed
 * narrowing the list down to one row; files opening beside the list; a
 * row dragged out into a mail; the history sealed where it is kept.
 */
function Preview({ step, armed }: { step: number; armed: string | null }) {
  const [typed, setTyped] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  const handoff = useRef<Keyframe | null>(null);

  // Leaving the shortcut step drops its loop, and the panel would snap from
  // wherever the loop had it — gone, half-way — straight to shown. Note
  // where it was while the old class is still on it (the render before the
  // commit), then carry it home from there once the new class is in.
  if (shown.current !== step) {
    if (shown.current === 1 && panel.current) {
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
    if (step !== 2) return;
    setTyped(0);
    // Type the query, hold it a moment, start again.
    const tick = window.setInterval(() => setTyped((was) => (was >= QUERY.length + 12 ? 0 : was + 1)), 140);
    return () => window.clearInterval(tick);
  }, [step]);

  // The drag step picks up where the search left off: the invoice found.
  const query = step === 2 ? QUERY.slice(0, typed) : step === 4 ? QUERY : "";
  const rows = found(query);
  const done = step === 2 && query === QUERY;

  return (
    <div className={`preview step-${step}`} aria-hidden="true">
      {/* Always mounted, grown in on the shortcut step only: the panel
          glides aside for it and back rather than jumping. */}
      <span className={["press", step === 1 && "shown", !armed && "none"].filter(Boolean).join(" ")}>
        {armed ? <Caps glyphs={acceleratorGlyphs(armed)} small /> : "No key yet"}
      </span>
      <div className="panel" ref={panel}>
        {step === 3 ? <Looking /> : step === 5 ? <Vault /> : <>
        <div className="search">
          <SearchGlyph />
          {query ? <span>{query}</span> : <span className="placeholder">Search</span>}
          {step === 2 && <span className="caret" />}
        </div>
        {rows.map(({ row, marks }, at) => (
          <div key={row.text} className={at === 0 ? "item first" : "item"} style={{ animationDelay: `${at * 0.35}s` }}>
            {row.kind === "color" ? <span className="swatch" /> : <KindGlyph kind={row.kind} />}
            <span className="text"><Marked text={row.text} marks={marks} /></span>
            <span className="meta">{at === 0 && done ? "↩ paste" : row.from}</span>
            {step === 4 && at === 0 && (
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
      <div className={step === 4 ? "drop shown" : "drop"}>
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
  const [own, setOwn] = useState<ExtensionShortcut | null | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [said, setSaid] = useState("");
  const [held, setHeld] = useState<{ key: string; holders: ShortcutHolder[]; said: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(false);

  useEffect(() => {
    shortcuts()
      .then((all) => setOwn(all.ess?.find((one) => one.command === COMMAND) ?? null))
      .catch(() => setOwn(null));
  }, []);

  useEffect(() => onArmed(own?.key ?? null), [own, onArmed]);

  const write = useCallback(async (key: string, replace: boolean) => {
    setBusy(true);
    setSaid("");
    try {
      setOwn(await setShortcut(COMMAND, key, replace));
      setHeld(null);
    } catch (err) {
      // Another extension's key comes back as a holder too, and is not
      // offered: Lumi would refuse the replace, and its own tab is where
      // that key changes.
      if (err instanceof Held && err.holders.length && err.holders.every((h) => h.kind !== "extension")) {
        setHeld({ key, holders: err.holders, said: err.message });
      } else {
        setHeld(null);
        setSaid(message(err));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!recording) return;
    const take = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const got = acceleratorOf(event);
      if (!got) return; // a modifier on its own, still being held
      const why = acceleratorRefusal(got);
      if (why) {
        setSaid(`${acceleratorGlyphs(got)}: ${why}`);
        return;
      }
      setRecording(false);
      void write(got, false);
    };
    window.addEventListener("keydown", take, true);
    return () => window.removeEventListener("keydown", take, true);
  }, [recording, write]);

  const record = () => {
    setSaid("");
    setHeld(null);
    setLater(false);
    setRecording(true);
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
        No key for now. Lumi's Extensions → Clipboard Manager → Shortcuts has the same control.{" "}
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
            <button type="button" disabled={busy} onClick={() => setHeld(null)}>
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

function holdersText(holders: ShortcutHolder[]): string {
  const names = holders.map((holder) =>
    holder.kind === "shortcut"
      ? holder.name
        ? `“${holder.name}” in the ${holder.profileName} profile`
        : `a shortcut in the ${holder.profileName} profile`
      : holder.kind === "app"
        ? `Lumi's own ${holder.label}`
        : `${holder.extensionName}'s ${holder.commandLabel}`,
  );
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Welcome />
    </StrictMode>,
  );
}
