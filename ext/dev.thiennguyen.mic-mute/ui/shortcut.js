// The key's row, as Mic Mute's Settings tab and its Welcome window both draw
// it: the key as caps on a button that records another, and one status
// line under its name. One copy for both pages (settings.html and
// welcome.html load it first), so a change to how a key is recorded or
// refused is made once.
//
// The key is the `toggle` command's `[[shortcut]]`, kept by Lumi in every
// profile: read from `GET /__lumi__/shortcuts` (`ess`), written with
// `PUT /__lumi__/shortcuts`. While the recorder listens, Lumi lets go of
// every global shortcut (`POST /__lumi__/shortcut-recording`), so pressing
// ⌥⌘M itself — or any combination something holds — reaches this page
// instead of running; Lumi ends that by itself when the page loses the
// keyboard or after 30 seconds, and says so with
// `lumi:shortcut-recording-ended`. A key somebody holds comes back as a 409
// naming them, and is offered to take with "Use Anyway" (`replace`) — only
// off a person's row or Lumi's own, never another extension's, which Lumi
// would refuse.
//
// Everything the recorder has to say goes on the row's one status line, so
// the row is the same height whatever it says (the owner, 2026-11-11).

// --- Keys as macOS draws them ---------------------------------------------

const MODIFIERS = { FN: "fn", CTRL: "⌃", CONTROL: "⌃", ALT: "⌥", OPTION: "⌥", SHIFT: "⇧", SUPER: "⌘", CMD: "⌘", COMMAND: "⌘", CMDORCTRL: "⌘", COMMANDORCONTROL: "⌘" };
const ORDER = ["fn", "⌃", "⌥", "⇧", "⌘"];

/** An accelerator as key caps: `Alt+Super+KeyM` (or the manifest's
 *  `alt+cmd+m`) → `["⌥", "⌘", "M"]`; a tap of modifiers, `Tap+Fn+Shift`,
 *  as its modifiers alone. */
function capsOf(accelerator) {
  const tokens = accelerator.split("+").map((token) => token.trim()).filter(Boolean);
  const tap = tokens[0]?.toUpperCase() === "TAP";
  if (tap) tokens.shift();
  const last = tap ? "" : (tokens.pop() ?? "");
  const mods = new Set(tokens.map((token) => MODIFIERS[token.toUpperCase()] ?? token));
  const caps = ORDER.filter((mod) => mods.has(mod));
  if (!last) return caps;
  const name =
    /^Key([A-Z])$/i.exec(last)?.[1]?.toUpperCase() ??
    /^Digit([0-9])$/.exec(last)?.[1] ??
    (last.toUpperCase() === "SPACE" ? "Space" : last.length === 1 ? last.toUpperCase() : last);
  return [...caps, name];
}

function glyphs(accelerator) {
  return capsOf(accelerator).join("");
}

/** The next press as a Lumi accelerator — `Alt+Super+KeyM`, the spelling
 *  Lumi's own recorder writes: modifiers in Ctrl, Alt, Shift, Super order,
 *  then the key's `code`. A letter, a digit, Space or F1–F12, what a
 *  `[[shortcut]]` may be; null for a modifier on its own or any other key. */
function acceleratorOf(event) {
  if (!/^(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(event.code)) return null;
  const mods = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter(Boolean);
  return [...mods, event.code].join("+");
}

/** Why an accelerator cannot be a global key — Lumi's own rule, asked here
 *  so it is said at the press — or null. */
function refusalOf(accelerator) {
  const parts = accelerator.split("+");
  return parts.some((part) => part === "Ctrl" || part === "Alt" || part === "Super") ? null : "Add ⌘, ⌥ or ⌃";
}

/** Whether a key its holders hold may be taken off them with `replace`: a
 *  person's row or Lumi's own, never another extension's. */
function takeable(holders) {
  return holders.length > 0 && holders.every((holder) => holder.kind !== "extension");
}

/** A holder's field, in either spelling. Lumi up to 1.78 sends a holder's
 *  fields as `profile_name`, `extension_name` and `command_label` — its
 *  `Holder` enum's `rename_all` renamed the variants and not the fields
 *  inside them — where `profileName` was meant; read as camelCase alone,
 *  an unnamed row said "a shortcut in the undefined profile" (2026-11-11). */
function fieldOf(holder, camel, snake) {
  const value = holder[camel] ?? holder[snake];
  return typeof value === "string" ? value : "";
}

/** Who holds a key, in words: "“Toggle Visual Studio Code”", "a shortcut
 *  in the Work profile", "Lumi's own Show Lumi", "Sticky Notes' New Note". */
function holdersText(holders) {
  const names = holders.map((holder) => {
    if (holder.kind === "shortcut") {
      if (holder.name) return `“${holder.name}”`;
      const profile = fieldOf(holder, "profileName", "profile_name");
      return profile ? `a shortcut in the ${profile} profile` : "one of your shortcuts";
    }
    if (holder.kind === "app") return `Lumi's own ${holder.label}`;
    const extension = fieldOf(holder, "extensionName", "extension_name") || "another extension";
    const command = fieldOf(holder, "commandLabel", "command_label");
    return command ? `${extension}${extension.endsWith("s") ? "'" : "'s"} ${command}` : extension;
  });
  return names.length <= 1 ? (names[0] ?? "something else") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The row, drawn into `keys` (the button) and `status` (the line under the
 * row's name). `idle` is what the line says while the key stands and
 * nothing is wrong; `onChange` hears the key as Lumi holds it after every
 * redraw — `undefined` while it is read, `null` when Lumi has none for the
 * command. Answers `read`, to read the key again.
 */
function shortcutRow({ keys, status, idle, onChange = () => {} }) {
  const COMMAND = "toggle";
  const keysButton = keys;
  const statusLine = status;
  const WHAT_IT_DOES = idle;
  const LISTENING = "Press keys · Esc to cancel";
  const SIGN = '<svg class="sign" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

  // The key as Lumi holds it: `undefined` while it is read, `null` when Lumi
  // has none for the command.
  let own;
  // Lumi's Shortcuts switch, which every global key waits on.
  let shortcutsOn = true;
  let recording = false;
  // The ask that paused Lumi's shortcuts, so ending the recording waits for it
  // rather than racing it.
  let pausing = null;
  // A key pressed that somebody holds: `{key, holders}`, offered with Use Anyway.
  let held = null;
  // Why the last press or write did not land, or "".
  let said = "";

  // --- Drawing --------------------------------------------------------------

  function drawCaps(accelerator) {
    for (const cap of capsOf(accelerator)) {
      const one = document.createElement("span");
      one.className = "cap";
      one.textContent = cap;
      keysButton.append(one);
    }
  }

  function drawAsk(words) {
    const ask = document.createElement("span");
    ask.className = "ask";
    ask.textContent = words;
    keysButton.append(ask);
  }

  function drawKeys() {
    keysButton.replaceChildren();
    keysButton.classList.toggle("recording", recording);
    keysButton.classList.toggle("held", !recording && held !== null);
    let named = "none";
    if (recording) {
      drawAsk("Type shortcut…");
      named = "recording";
    } else if (held) {
      drawCaps(held.key);
      named = glyphs(held.key);
    } else if (own?.key) {
      drawCaps(own.key);
      named = glyphs(own.key);
    } else if (own !== undefined) {
      drawAsk("Record Shortcut");
    }
    keysButton.setAttribute("aria-label", `Shortcut for mute or unmute: ${named}`);
  }

  /** The status line: words, dim or a warning, and at most one action after
   *  them. Text goes in as text — a holder's name is the person's own. */
  function drawStatus(words, { bad = false, action = null } = {}) {
    statusLine.replaceChildren();
    statusLine.classList.toggle("bad", bad);
    if (bad) statusLine.insertAdjacentHTML("beforeend", SIGN);
    const text = document.createElement("span");
    text.className = "said";
    text.textContent = words;
    text.title = words;
    statusLine.append(text);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "act";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      statusLine.append(button);
    }
  }

  function drawLine() {
    if (recording) {
      if (said) drawStatus(said, { bad: true });
      else drawStatus(LISTENING);
    } else if (held) {
      const key = held.key;
      drawStatus(`Already used by ${holdersText(held.holders)}`, { bad: true, action: { label: "Use Anyway", run: () => write(key, true) } });
    } else if (said) {
      drawStatus(said, { bad: true });
    } else if (own === undefined) {
      drawStatus(WHAT_IT_DOES);
    } else if (own?.key) {
      // The key stands but does nothing while Lumi's Shortcuts are off: said
      // here, on the key, rather than left looking armed.
      if (!shortcutsOn) drawStatus("Shortcuts are switched off in Lumi", { bad: true });
      else drawStatus(WHAT_IT_DOES);
    } else {
      const declared = own?.declared;
      const offer = declared ? { label: `Use ${glyphs(declared)}`, run: () => write(declared) } : null;
      if ((own?.state === "taken" || own?.state === "invalid") && own.reason) drawStatus(own.reason, { bad: true, action: offer });
      else drawStatus(declared ? "No shortcut ·" : "No shortcut", { action: offer });
    }
  }

  function drawShortcut() {
    drawKeys();
    drawLine();
    onChange(own);
  }

  // --- The key --------------------------------------------------------------

  async function readShortcut() {
    try {
      const answer = await fetch("/__lumi__/shortcuts");
      if (!answer.ok) throw new Error(await answer.text());
      const all = await answer.json();
      shortcutsOn = all.on !== false;
      own = (all.ess || []).find((one) => one.command === COMMAND) ?? null;
    } catch {
      own = null;
    }
    drawShortcut();
  }

  /** Arm `key`, or take it off whoever holds it with `replace`. */
  async function write(key, replace = false) {
    said = "";
    try {
      const answer = await fetch("/__lumi__/shortcuts", {
        method: "PUT",
        body: JSON.stringify({ command: COMMAND, key, replace }),
      });
      const body = await answer.text();
      if (answer.status === 409) {
        const refusal = JSON.parse(body);
        const holders = Array.isArray(refusal.holders) ? refusal.holders : [];
        if (takeable(holders)) {
          held = { key, holders };
        } else {
          held = null;
          said = refusal.said || `${glyphs(key)} is used by ${holdersText(holders)}`;
        }
      } else if (!answer.ok) {
        held = null;
        said = body || `Lumi answered ${answer.status}`;
      } else {
        own = JSON.parse(body);
        held = null;
      }
    } catch (err) {
      said = err instanceof Error ? err.message : String(err);
    }
    drawShortcut();
  }

  function startRecording() {
    if (recording) return;
    recording = true;
    held = null;
    said = "";
    drawShortcut();
    pausing = fetch("/__lumi__/shortcut-recording", { method: "POST" })
      .then(async (answer) => {
        // 404: a Lumi with no such ask; the page records as before.
        if (answer.ok || answer.status === 404 || !recording) return;
        recording = false;
        said = (await answer.text()) || `Lumi answered ${answer.status}`;
        drawShortcut();
      })
      .catch(() => {});
  }

  /** Done recording, however it ended: Lumi binds its shortcuts again —
   *  after the ask that paused them, never before it. */
  function stopRecording() {
    if (!recording) return;
    recording = false;
    const paused = pausing ?? Promise.resolve();
    pausing = null;
    void paused.then(() => fetch("/__lumi__/shortcut-recording", { method: "DELETE" })).catch(() => {});
    drawShortcut();
  }

  keysButton.addEventListener("click", () => {
    if (recording) stopRecording();
    else startRecording();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        said = "";
        stopRecording();
        return;
      }
      const got = acceleratorOf(event);
      if (!got) return; // a modifier on its own, still being held
      const why = refusalOf(got);
      if (why) {
        said = `${glyphs(got)}: ${why}`;
        drawShortcut();
        return;
      }
      said = "";
      stopRecording();
      if (got !== own?.key) void write(got);
    },
    true,
  );

  // A press anywhere else on the page ends the recording, as Lumi's own
  // recorder's does.
  document.addEventListener("pointerdown", (event) => {
    if (recording && !keysButton.contains(event.target)) stopRecording();
  });

  // Lumi ended it — the page lost the keyboard, 30 seconds passed, or Lumi's
  // own recorder started — and its shortcuts are back.
  window.addEventListener("lumi:shortcut-recording-ended", () => {
    recording = false;
    pausing = null;
    drawShortcut();
  });

  // Nothing tells a page that its key changed elsewhere, so it is read again
  // whenever the page comes back.
  window.addEventListener("focus", () => {
    if (!recording) void readShortcut();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRecording();
    else void readShortcut();
  });

  drawShortcut();
  return { read: readShortcut };
}
