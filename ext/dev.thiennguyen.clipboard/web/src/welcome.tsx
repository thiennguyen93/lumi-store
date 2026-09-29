// Clipboard Manager's Welcome window — the three-step tour `on_lifecycle`
// opens on an install and on an update. The top half is a small, live
// picture of the panel acting out each step; the bottom half says it.
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
import { KindGlyph, SearchGlyph } from "./icons";
import { acceleratorGlyphs, acceleratorOf, acceleratorRefusal } from "./keys";
import { fuzzyScore } from "./search";
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

const STEPS = 3;

function Welcome() {
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  // The key the preview wears on the shortcut step: whatever is armed.
  const [armed, setArmed] = useState<string | null>(null);

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

  return (
    <main className="tour">
      <Preview step={step} armed={armed} />
      <div className="body">
        {step === 0 &&
          (from ? (
            <>
              <h1>Clipboard Manager was updated</h1>
              <p className="dim">
                From {from}. Your history and pins are where they were. New: one shortcut that
                opens the panel in every profile.
              </p>
            </>
          ) : (
            <>
              <h1>Welcome to Clipboard Manager</h1>
              <p className="dim">
                Everything you copy — text, links, colours, files, screenshots — is kept on this
                Mac and pasted back from a panel. Stored encrypted; anything a password manager
                marks as secret is never recorded.
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
          {last ? (
            <>
              <button type="button" onClick={() => act(() => call({ kind: "openPanel" }))}>
                Try it
              </button>
              <button type="button" className="primary" onClick={() => act(() => call({ kind: "close" }))}>
                Done
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

const ROWS: { kind: Kind; text: string; from: string }[] = [
  { kind: "link", text: "github.com/thiennguyen/lumi", from: "Safari" },
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
 * narrowing the list down to one row.
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

  const query = step === 2 ? QUERY.slice(0, typed) : "";
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
          </div>
        ))}
      </div>
    </div>
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
