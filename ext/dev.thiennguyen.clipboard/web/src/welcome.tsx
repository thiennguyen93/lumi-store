// Clipboard History's Welcome window — the three-step tour `on_lifecycle`
// opens on an install and on an update. Its own choice: Lumi opens nothing
// on an install, and the one thing an install can leave undone is the
// shortcut. Lumi tries ⌘⇧C once and, when something holds it, arms nothing
// and writes down who (`GET /__lumi__/shortcuts`' `ess`); the second step
// reads that and asks the person what to do — another key, take it off the
// row that holds it, or later. Lumi never decides that on its own.

import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { call, Held, message, setShortcut, shortcuts } from "./bridge";
import { CopyGlyph } from "./icons";
import { acceleratorGlyphs, acceleratorOf, acceleratorRefusal } from "./keys";
import type { ExtensionShortcut, ShortcutHolder } from "./types";
import "./welcome.css";

if (import.meta.env.DEV) {
  await import("./dev/mock");
}

/** The command the tour's shortcut step is about. */
const COMMAND = "open";

function Welcome() {
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    call({ kind: "welcome" })
      .then((told) => setFrom(told.from))
      .catch((err) => setFailed(message(err)));
  }, []);

  const act = (work: () => Promise<unknown>) => {
    setFailed("");
    work().catch((err) => setFailed(message(err)));
  };

  const steps = [
    from ? (
      <div className="step" key="new">
        <span className="mark"><CopyGlyph /></span>
        <h1>Clipboard History was updated</h1>
        <p>
          From {from}. Your history and pins are where they were; the shortcut on the next
          step is unchanged.
        </p>
      </div>
    ) : (
      <div className="step" key="hello">
        <span className="mark"><CopyGlyph /></span>
        <h1>Welcome to Clipboard History</h1>
        <p className="plain">
          Everything you copy — text, links, colours, files, screenshots — is kept on this Mac
          and pasted back from a panel.
        </p>
        <p>
          Stored encrypted with a key Lumi keeps in your Keychain. Anything a password manager
          marks as secret is never recorded. Nothing leaves your Mac.
        </p>
      </div>
    ),
    <Shortcut key="key" />,
    <div className="step" key="tips">
      <h1>Inside the panel</h1>
      <div className="tips">
        <span><kbd>↩</kbd> paste</span>
        <span><kbd>⌥↩</kbd> paste as plain text</span>
        <span><kbd>⇥</kbd> filter by kind</span>
        <span><kbd>⌘K</kbd> more actions</span>
        <span><kbd>⌥P</kbd> pin the row</span>
        <span><kbd>⌘⌥⌫</kbd> delete the row</span>
      </div>
      <p>
        Type to search — without accents, if you like: <i>tieng viet</i> finds <i>Tiếng Việt</i>.
        Drag a row out to drop it into another app.
      </p>
    </div>,
  ];

  const last = step === steps.length - 1;

  return (
    <main className="tour">
      <div className="dots" aria-hidden="true">
        {steps.map((_, at) => (
          <span key={at} className={at === step ? "on" : ""} />
        ))}
      </div>
      {steps[step]}
      {failed && <p className="failed" role="alert">{failed}</p>}
      <div className="actions">
        <button type="button" className="link" onClick={() => act(() => call({ kind: "settings" }))}>
          Settings…
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
    </main>
  );
}

/**
 * The shortcut step: what the install came to, and the recorder for
 * anything but a key that is armed and wanted.
 *
 * Four states, read off `ess`: `registered` shows the key large; `taken`
 * says who holds the declared key and offers to take it off them or to
 * record another; `invalid` says why and offers the recorder; `cleared`
 * offers the recorder. Every write is `PUT /__lumi__/shortcuts`, and a 409
 * — the key just pressed is somebody's — comes back as the same offer.
 */
function Shortcut() {
  const [own, setOwn] = useState<ExtensionShortcut | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    shortcuts()
      .then((all) => setOwn(all.ess?.find((one) => one.command === COMMAND) ?? null))
      .catch(() => setOwn(null));
  }, []);

  const landed = useCallback((next: ExtensionShortcut) => {
    setOwn(next);
    setChanging(false);
  }, []);

  if (own === undefined) {
    return <div className="step"><h1>Your shortcut</h1></div>;
  }
  if (own === null) {
    // A Lumi older than `[[shortcut]]`, or no answer: the key is set the
    // old way, in Shortcuts, and that is where to send people.
    return (
      <div className="step">
        <h1>Your shortcut</h1>
        <p>
          Give <b>Show clipboard history</b> a key under Lumi's Settings → Shortcuts, and press it
          anywhere to open the panel.
        </p>
      </div>
    );
  }

  if (own.key && !changing) {
    return (
      <div className="step">
        <h1>Your shortcut</h1>
        <p className="plain">Press it anywhere, in any profile, to open your history.</p>
        <div className="keyline">
          <span className="big">{acceleratorGlyphs(own.key)}</span>
          <button type="button" className="link" onClick={() => setChanging(true)}>
            Change…
          </button>
        </div>
        {own.reason ? (
          <p className="note">{own.reason}</p>
        ) : (
          <p>
            {own.key === own.declared
              ? "Registered, since nothing else was using it."
              : `Instead of ${acceleratorGlyphs(own.declared)}, which you changed.`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="step">
      <h1>{changing ? "Change the shortcut" : "Choose a shortcut"}</h1>
      {!changing && own.state === "taken" && own.reason && <p className="note">{own.reason}</p>}
      {!changing && own.state === "invalid" && own.reason && <p className="note bad">{own.reason}</p>}
      {!changing && own.state === "cleared" && (
        <p>
          No key yet for <b>Show clipboard history</b>. Record one, or leave it for later — the
          Shortcuts tab of the extension in Lumi has the same control.
        </p>
      )}
      <Recorder
        own={own}
        onLanded={landed}
        onCancel={changing ? () => setChanging(false) : undefined}
      />
    </div>
  );
}

/** A key-cap that records the next press and sends it to Lumi. A refusal
 *  naming who holds the key becomes an offer to take it off them. */
function Recorder({
  own,
  onLanded,
  onCancel,
}: {
  own: ExtensionShortcut;
  onLanded: (next: ExtensionShortcut) => void;
  onCancel?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [said, setSaid] = useState("");
  const [held, setHeld] = useState<{ key: string; holders: ShortcutHolder[]; said: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const write = useCallback(
    async (key: string, replace: boolean) => {
      setBusy(true);
      setSaid("");
      try {
        onLanded(await setShortcut(own.command, key, replace));
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
    },
    [onLanded, own.command],
  );

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

  // The declared key is offered back whenever it is not the one armed:
  // after a refused install whose holder may since have let go, and on a
  // change the person thinks better of.
  const declared = own.declared && own.key !== own.declared ? own.declared : null;

  return (
    <>
      <div className="recorder">
        <button
          type="button"
          className={recording ? "keycap recording" : "keycap"}
          disabled={busy}
          aria-label={recording ? "Press the new shortcut, or Esc" : "Record a shortcut"}
          onClick={() => {
            setSaid("");
            setHeld(null);
            setRecording((was) => !was);
          }}
        >
          {recording ? "Press keys…" : "Record"}
        </button>
        <span className="hint">{recording ? "Esc to stop" : "⌘, ⌥ or ⌃ with a letter, a digit, Space or F1–F12"}</span>
      </div>
      {said && <p className="failed">{said}</p>}
      {held && (
        <div className="note">
          {/* The install's own sentence is already on screen for the
              declared key; said once. */}
          {held.said === own.reason ? "" : `${held.said} `}
          Take {acceleratorGlyphs(held.key)} anyway? It comes off {holdersText(held.holders)}.
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
      <div className="row">
        <span className="sp" />
        {onCancel && (
          <button type="button" className="link" disabled={busy} onClick={onCancel}>
            Keep {own.key ? acceleratorGlyphs(own.key) : "it unset"}
          </button>
        )}
        {declared && !held && (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => void write(declared, false)}
          >
            Try {acceleratorGlyphs(declared)}
          </button>
        )}
      </div>
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
