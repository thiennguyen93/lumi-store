// Clipboard Manager's Settings tab — the manifest's `settings-page`, drawn
// in place of the form Lumi would make from [[settings]]. It saves through
// Lumi's own `PUT /__lumi__/settings`, so the manifest still decides what
// can be stored; the extension is asked only things that read: how full the
// history is, which apps it has seen, and what a pattern list would keep out.

import { StrictMode, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { acceleratorGlyphs, comboOf, comboText, DEFAULT_PIN_KEY, glyphs, parseCombo, refusal } from "./keys";
import { shortcuts } from "./bridge";
import { KEEP_LABELS, type OwnShortcuts, type Stats } from "./types";
import { type Book, LookIn, type Scope, SCOPES } from "./LookIn";
import "./settings.css";

if (import.meta.env.DEV) {
  await import("./dev/mock");
}

type Glass = "popover" | "hud" | "sidebar";
type Theme = "dark" | "light" | "system";
type Search = "exact" | "fuzzy" | "regexp" | "mixed";
type Keep = "5m" | "1h" | "1d" | "1w" | "1mo" | "3mo";
type Order = "last" | "first" | "used";

interface Values {
  keep: Keep;
  theme: Theme;
  search: Search;
  pinKey: string;
  pasteOnSelect: boolean;
  closeAfterDrag: boolean;
  ocr: boolean;
  sort: Order;
  appearance: Glass;
  ignoreApps: string[];
  ignorePatterns: string;
  matchSnippets: boolean;
  snippetsIn: Scope;
  snippetProfiles: string[];
}

interface App {
  id: string;
  name: string;
}

interface Tried {
  errors: { line: number; error: string }[];
  matched: number | null;
}

const KEEPS = (["5m", "1h", "1d", "1w", "1mo", "3mo"] as Keep[]).map((value) => ({
  value,
  label: KEEP_LABELS[value] ?? value,
}));

const SEARCHES: { value: Search; label: string; hint: string }[] = [
  { value: "exact", label: "Exact", hint: "Every word appears as typed; accents and case aside" },
  { value: "fuzzy", label: "Fuzzy", hint: "Letters in order, gaps allowed: “clpbrd” finds clipboard" },
  { value: "regexp", label: "Regex", hint: "The search is a regular expression, case-insensitive" },
  { value: "mixed", label: "Mixed", hint: "Exact, then regex, then fuzzy" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const ORDERS: { value: Order; label: string }[] = [
  { value: "last", label: "Last copied" },
  { value: "first", label: "First copied" },
  { value: "used", label: "Most used" },
];

/** What "Look in" comes to, said under it: the live profile by name when
 *  Lumi has told it, how many in all, or the ones ticked. */
function lookHint(scope: Scope, picked: string[], book: Book | null): ReactNode {
  const name = (id: string) => book?.profiles.find((p) => p.id === id)?.name;
  switch (scope) {
    case "current": {
      const live = book && name(book.active);
      // Tagged as the menu tags it, so the name reads as the live one.
      return live ? (
        <>
          {live}
          <span className="pop-tag">In use</span>
        </>
      ) : (
        "The profile in use"
      );
    }
    case "all":
      return book ? `Every profile, all ${book.profiles.length}` : "Every profile";
    case "selected": {
      if (!picked.length) return "Nothing is ticked, so nothing is matched";
      const names = picked.map((id) => name(id) ?? "a deleted profile");
      return names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
    }
  }
}

const GLASSES: { value: Glass; label: string; hint: string }[] = [
  { value: "popover", label: "Glass", hint: "Follows light and dark" },
  { value: "hud", label: "Dark glass", hint: "Dark, whatever the system" },
  { value: "sidebar", label: "Frosted", hint: "More blur, less colour" },
];

/** Settings arrive as text or as their own type, depending on who saved them. */
function read(raw: Record<string, unknown>): Values {
  const text = (v: unknown, fallback: string) => (v == null ? fallback : String(v));
  const keep = text(raw.keep, "3mo");
  const theme = text(raw.theme, "system");
  const search = text(raw.search, "mixed");
  const pin = parseCombo(text(raw.pinKey, DEFAULT_PIN_KEY));
  return {
    keep: (KEEPS.some((k) => k.value === keep) ? keep : "3mo") as Keep,
    theme: (THEMES.some((t) => t.value === theme) ? theme : "system") as Theme,
    search: (SEARCHES.some((m) => m.value === search) ? search : "mixed") as Search,
    pinKey: pin && !refusal(pin) ? comboText(pin) : DEFAULT_PIN_KEY,
    pasteOnSelect: text(raw.pasteOnSelect, "true") !== "false",
    closeAfterDrag: text(raw.closeAfterDrag, "false") === "true",
    ocr: text(raw.ocr, "true") !== "false",
    sort: (["last", "first", "used"].includes(text(raw.sort, "")) ? raw.sort : "last") as Order,
    appearance: (["popover", "hud", "sidebar"].includes(text(raw.appearance, "")) ? raw.appearance : "popover") as Glass,
    ignoreApps: text(raw.ignoreApps, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    ignorePatterns: text(raw.ignorePatterns, ""),
    // An earlier build kept the choice in this one field, "off" among them.
    matchSnippets: !["false", "off"].includes(text(raw.matchSnippets, "true")),
    snippetsIn: (SCOPES.find((s) => s.value === raw.snippetsIn) ??
      SCOPES.find((s) => s.value === raw.matchSnippets) ??
      SCOPES[0]!).value,
    snippetProfiles: text(raw.snippetProfiles, "")
      .split(",")
      .map((id) => id.trim())
      .filter((id, at, all) => id && all.indexOf(id) === at),
  };
}

/** Every field, as the text the manifest's [[settings]] store. */
function written(v: Values): Record<string, string> {
  return {
    keep: v.keep,
    theme: v.theme,
    search: v.search,
    pinKey: v.pinKey,
    pasteOnSelect: String(v.pasteOnSelect),
    closeAfterDrag: String(v.closeAfterDrag),
    ocr: String(v.ocr),
    sort: v.sort,
    appearance: v.appearance,
    ignoreApps: v.ignoreApps.join("\n"),
    ignorePatterns: v.ignorePatterns,
    matchSnippets: String(v.matchSnippets),
    snippetsIn: v.snippetsIn,
    snippetProfiles: v.snippetProfiles.join(","),
  };
}

async function ask<T>(request: Record<string, unknown>): Promise<T> {
  const answer = await fetch("/__lumi__/call", { method: "POST", body: JSON.stringify(request) });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
  return JSON.parse(body) as T;
}

function Settings() {
  const [values, setValues] = useState<Values | null>(null);
  const [failed, setFailed] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const latest = useRef<Values | null>(null);
  const saving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback(() => {
    clearTimeout(saving.current);
    saving.current = undefined;
    if (!latest.current) return;
    fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify(written(latest.current)), keepalive: true })
      .then(async (r) => {
        setFailed(r.ok ? "" : (await r.text()) || "Could not save");
        // The panel, if it is up, takes a new glass or theme at once.
        if (r.ok) ask({ kind: "dress" }).catch(() => {});
      })
      .catch(() => setFailed("Could not save"));
  }, []);

  useEffect(() => {
    fetch("/__lumi__/settings")
      .then((r) => r.json())
      .catch(() => ({}))
      .then((raw) => {
        latest.current = read(raw ?? {});
        setValues(latest.current);
      });
    // The history's size, for the line under the slider; nothing if Lumi
    // says the tab is not in front.
    ask<Stats>({ kind: "stats" }).then(setStats, () => {});
    // The profiles, for the live one's name and the ones to tick — and
    // again as Lumi tells of a switch, a rename, one made or removed, which
    // can happen while this tab stays up (Lumi 1.31).
    ask<Book>({ kind: "profiles" }).then(setBook, () => {});
    const switched = (event: Event) => {
      const book = (event as CustomEvent<Book>).detail;
      if (book && typeof book.active === "string" && Array.isArray(book.profiles)) setBook(book);
    };
    window.addEventListener("lumi:profiles", switched);
    // Asked again each time the tab comes back into view: Lumi answers a
    // page only while Settings is in front, so a tab opened behind another
    // app reads nothing the first time — measured: the hint said "the
    // profile in use" until something else told it.
    const shown = () => {
      if (document.visibilityState !== "visible") return;
      ask<Book>({ kind: "profiles" }).then(setBook, () => {});
      ask<Stats>({ kind: "stats" }).then(setStats, () => {});
    };
    document.addEventListener("visibilitychange", shown);
    // Lumi drops the page when its tab is left: what is still waiting to
    // be saved goes now.
    const flush = () => saving.current !== undefined && save();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("lumi:profiles", switched);
      document.removeEventListener("visibilitychange", shown);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [save]);

  /** Change, and save a moment later: a slider dragged or a pattern typed
   *  is one write, not one per step. */
  const change = (patch: Partial<Values>, now = false) => {
    if (!latest.current) return;
    latest.current = { ...latest.current, ...patch };
    setValues(latest.current);
    clearTimeout(saving.current);
    if (now) save();
    else saving.current = setTimeout(save, 350);
  };

  if (!values) return null;

  return (
    <main>
      {failed && <p className="failed" role="alert">{failed}</p>}

      <section>
        <h3>History</h3>
        <div className="group">
          <Row
            label="Keep history for"
            hint={`${stats ? `${stats.kept} kept now · ` : ""}pinned items are kept until you unpin them`}
          >
            <select
              value={values.keep}
              aria-label="Keep history for"
              onChange={(e) => change({ keep: e.target.value as Keep }, true)}
            >
              {KEEPS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Search" hint={SEARCHES.find((m) => m.value === values.search)?.hint}>
            <Segmented value={values.search} options={SEARCHES} onChange={(search) => change({ search }, true)} label="Search" />
          </Row>
          <Row label="Order">
            <Segmented value={values.sort} options={ORDERS} onChange={(sort) => change({ sort }, true)} label="Order" />
          </Row>
          <Row label="Search text in images" hint="Lumi reads text in copied images, on this Mac">
            <Toggle on={values.ocr} label="Search text in images" onChange={(ocr) => change({ ocr }, true)} />
          </Row>
        </div>
      </section>

      <section>
        <h3>Snippets</h3>
        <div className="group">
          <Row label="Match snippets" hint="A copy that is a snippet trigger shows what it expands to">
            <Toggle
              on={values.matchSnippets}
              label="Match snippets"
              onChange={(matchSnippets) => change({ matchSnippets }, true)}
            />
          </Row>
          {values.matchSnippets && (
            <Row
              label="Look in"
              hint={lookHint(values.snippetsIn, values.snippetProfiles, book)}
              bad={values.snippetsIn === "selected" && !values.snippetProfiles.length}
            >
              <LookIn
                scope={values.snippetsIn}
                picked={values.snippetProfiles}
                book={book}
                onChange={(patch) => change(patch, true)}
              />
            </Row>
          )}
        </div>
      </section>

      <section>
        <h3>Pasting &amp; dragging</h3>
        <div className="group">
          <Row label="Paste the item you pick" hint="Off: picking only puts it on the clipboard">
            <Toggle
              on={values.pasteOnSelect}
              label="Paste the item you pick"
              onChange={(pasteOnSelect) => change({ pasteOnSelect }, true)}
            />
          </Row>
          <Row
            label="Close the panel after dragging an item out"
            hint="Off: the panel stays up, to drag several items one after another"
          >
            <Toggle
              on={values.closeAfterDrag}
              label="Close the panel after dragging an item out"
              onChange={(closeAfterDrag) => change({ closeAfterDrag }, true)}
            />
          </Row>
        </div>
      </section>

      <section>
        <h3>Shortcuts</h3>
        <div className="group">
          <GlobalShortcut command="open" />
          <Row label="Pin" hint="While the panel is up; pins or unpins the selected item">
            <Recorder value={values.pinKey} fallback={DEFAULT_PIN_KEY} onChange={(pinKey) => change({ pinKey }, true)} />
          </Row>
        </div>
      </section>

      <section>
        <h3>Appearance</h3>
        <div className="group">
          <Row label="Theme" hint={values.appearance === "hud" ? "Dark glass is always dark" : undefined}>
            <Segmented
              value={values.appearance === "hud" ? "dark" : values.theme}
              options={THEMES}
              onChange={(theme) => change({ theme }, true)}
              label="Theme"
              disabled={values.appearance === "hud"}
            />
          </Row>
          <div className="row col">
            <div className="lbl">Panel glass</div>
            <div className={`glasses look-${values.theme}`} role="radiogroup" aria-label="Panel glass">
              {GLASSES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={values.appearance === g.value}
                  className={`glass ${g.value}`}
                  onClick={() => change({ appearance: g.value }, true)}
                >
                  <span className="swatch">
                    <span className="pane">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                  <b>{g.label}</b>
                  <small>{g.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3>Privacy</h3>
        <div className="group">
          <div className="row col">
            <div className="lbl">
              Never keep copies from
              <small>Copies made while one of these is in front are not kept</small>
            </div>
            <Apps
              ids={values.ignoreApps}
              onChange={(ignoreApps) => change({ ignoreApps }, true)}
            />
          </div>
          <div className="row col">
            <div className="lbl">
              Never keep text matching
              <small>One regular expression per line</small>
            </div>
            <Patterns value={values.ignorePatterns} onChange={(ignorePatterns) => change({ ignorePatterns })} />
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ label, hint, bad = false, children }: { label: string; hint?: ReactNode; bad?: boolean; children: ReactNode }) {
  return (
    <div className="row">
      <div className="lbl">
        {label}
        {hint && <small className={bad ? "bad" : undefined}>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)} />
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} aria-disabled={disabled}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One of the extension's commands and the keys that run it. Two kinds,
 *  drawn apart because they are owned apart: the extension's own
 *  `[[shortcut]]` (`ess`), armed by Lumi at install in every profile and
 *  changed on the Shortcuts tab of this extension's page; and the person's
 *  rows from Lumi's Shortcuts pane, with a button that goes there. Neither
 *  is recorded here — one place sets each, so two cannot disagree. */
function GlobalShortcut({ command }: { command: string }) {
  const [own, setOwn] = useState<OwnShortcuts | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    shortcuts()
      .then(setOwn)
      .catch(() => setOwn(null));
  }, []);

  const mine = own?.commands.find((c) => c.name === command);
  const ess = own?.ess?.find((one) => one.command === command);
  const keys = (mine?.rows ?? []).filter((row) => row.trigger);
  const live = keys.filter((row) => row.enabled && own?.on);
  const hint = !own
    ? "Global — set in Lumi's Shortcuts"
    : ess?.key
      ? keys.length
        ? "Its own key, in every profile · and your rows"
        : "Its own key, in every profile — change it on the Shortcuts tab"
      : ess && (ess.state === "taken" || ess.state === "invalid") && ess.reason
        ? ess.reason
        : !own.on
          ? "Shortcuts are switched off in Lumi"
          : keys.length === 0
            ? "No key yet — the Shortcuts tab of this extension, or Lumi's Shortcuts"
            : live.length < keys.length
              ? "Global · a switched-off row is dimmed"
              : "Global — works from any app";

  return (
    <Row label={mine?.label ?? ess?.label ?? "Show clipboard history"} hint={failed || hint}>
      <div className="recorder">
        {ess?.key && <span className="keycap">{acceleratorGlyphs(ess.key)}</span>}
        {!ess?.key && keys.length === 0 ? (
          <span className="keycap unset">Not set</span>
        ) : (
          keys.map((row, at) => (
            <span key={at} className={row.enabled && own?.on ? "keycap" : "keycap off"}>
              {acceleratorGlyphs(row.trigger)}
            </span>
          ))
        )}
        <button
          type="button"
          className="add"
          onClick={() =>
            fetch("/__lumi__/show-shortcuts", { method: "POST", body: JSON.stringify({ command }) })
              .then(async (r) => setFailed(r.ok ? "" : (await r.text()) || "Could not open Shortcuts"))
              .catch(() => setFailed("Could not open Shortcuts"))
          }
        >
          Edit in Shortcuts…
        </button>
      </div>
    </Row>
  );
}

/** A key-cap that records the next combo pressed: click, press, done.
 *  Esc puts it back; a combo the panel cannot use says why and is not
 *  kept. Recorded by position, so ⌥P is P and not the π it types. */
function Recorder({ value, fallback, onChange }: { value: string; fallback: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [said, setSaid] = useState("");
  const combo = parseCombo(value) ?? parseCombo(fallback)!;

  useEffect(() => {
    if (!recording) return;
    const take = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        setSaid("");
        return;
      }
      const got = comboOf(event);
      if (!got) return; // a modifier on its own, still being held
      const why = refusal(got);
      if (why) {
        setSaid(`${glyphs(got)}: ${why}`);
        return;
      }
      setSaid("");
      setRecording(false);
      onChange(comboText(got));
    };
    window.addEventListener("keydown", take, true);
    return () => window.removeEventListener("keydown", take, true);
  }, [recording, onChange]);

  return (
    <div className="recorder">
      {said && <span className="bad small">{said}</span>}
      <button
        type="button"
        className={recording ? "keycap recording" : "keycap"}
        aria-label={recording ? "Press the new shortcut, or Esc" : `Shortcut ${glyphs(combo)}, click to change`}
        onClick={() => {
          setSaid("");
          setRecording((was) => !was);
        }}
      >
        {recording ? "Press keys…" : glyphs(combo)}
      </button>
      {value !== fallback && !recording && (
        <button type="button" className="add" onClick={() => onChange(fallback)}>
          Reset
        </button>
      )}
    </div>
  );
}

/** The ignored apps as chips, named from the history where it knows them;
 *  added from a dropdown of the apps the history has seen, or by bundle id. */
function Apps({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [seen, setSeen] = useState<App[]>([]);
  const [adding, setAdding] = useState(false);
  const add = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ask<{ apps: App[] }>({ kind: "apps" }).then((a) => setSeen(a.apps), () => {});
  }, []);

  const name = (id: string) => seen.find((a) => a.id === id)?.name ?? id;
  const close = useCallback((refocus: boolean) => {
    setAdding(false);
    // Back to the button that opened it, as a menu's close does.
    if (refocus) setTimeout(() => add.current?.focus());
  }, []);

  return (
    <div className="chips">
      {ids.map((id) => (
        <span key={id} className="chip" title={id}>
          <span className="initial" style={{ background: tint(id) }}>
            {name(id).slice(0, 1).toUpperCase()}
          </span>
          {name(id)}
          <button type="button" className="x" aria-label={`Keep copies from ${name(id)} again`} onClick={() => onChange(ids.filter((i) => i !== id))}>
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <AppPicker
          offered={seen.filter((a) => !ids.includes(a.id))}
          taken={ids}
          onPick={(id) => {
            onChange([...ids, id]);
            close(true);
          }}
          onClose={close}
        />
      ) : (
        <button ref={add} type="button" className="add" onClick={() => setAdding(true)}>
          + Add app…
        </button>
      )}
    </div>
  );
}

/** A bundle id as typed: dot-separated, letters, digits and dashes. */
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** How many apps the dropdown lists at most; typing narrows it. */
const LISTED = 50;

type Choice = { id: string; name: string; typed?: boolean };

/**
 * A combobox, the macOS way: a field in the row of chips, and under it a
 * list that floats over what follows instead of pushing it down — the apps
 * the history has seen, narrowed as you type, and a typed bundle id of its
 * own when it is one. ↑ ↓ move, ↩ picks, esc closes; so does clicking
 * anywhere else. Opens upward when there is no room below.
 */
function AppPicker({
  offered,
  taken,
  onPick,
  onClose,
}: {
  offered: App[];
  taken: string[];
  onPick: (id: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const needle = typed.trim().toLowerCase();
  const matching = offered.filter((a) => !needle || `${a.name} ${a.id}`.toLowerCase().includes(needle));
  const clean = typed.trim();
  const own = BUNDLE_ID.test(clean) && !taken.includes(clean) && !offered.some((a) => a.id === clean);
  const choices: Choice[] = [...(own ? [{ id: clean, name: clean, typed: true }] : []), ...matching.slice(0, LISTED)];
  const at = Math.min(active, Math.max(choices.length - 1, 0));

  // A new narrowing starts at the top.
  useEffect(() => setActive(0), [needle]);

  // A press anywhere outside closes it, as a menu does — whether or not the
  // field had focus to lose.
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [onClose]);

  // Downward unless the window has more room above the field than below.
  useLayoutEffect(() => {
    const field = box.current;
    const menu = list.current;
    if (!field || !menu) return;
    const rect = field.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setUp(below < menu.offsetHeight + 8 && rect.top > below);
  }, [choices.length]);

  // The active choice stays in sight as ↑ ↓ move past the list's edge.
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const pick = (choice: Choice | undefined) => {
    if (choice) onPick(choice.id);
  };

  return (
    <div
      ref={box}
      className="combo"
      // Focus leaving the field and its list — a click elsewhere, ⇥ — closes.
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) onClose(false);
      }}
    >
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="app-choices"
        aria-activedescendant={choices.length ? `app-choice-${at}` : undefined}
        aria-autocomplete="list"
        value={typed}
        placeholder="App name or bundle id"
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!choices.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((at + step + choices.length) % choices.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(choices[at]);
          } else if (e.key === "Escape") {
            // The page's own Escape (closing Settings) is not this one's.
            e.preventDefault();
            e.stopPropagation();
            onClose(true);
          }
        }}
      />
      <div ref={list} id="app-choices" role="listbox" aria-label="Apps" className={up ? "menu up" : "menu"}>
        {!own && !matching.length ? (
          <p className="none">
            {taken.includes(clean)
              ? "Already on the list."
              : offered.length || needle
                ? "No app matches. Type a bundle id, like com.apple.Notes."
                : "Type a bundle id, like com.apple.Notes."}
          </p>
        ) : (
          <>
            {!needle && <small>From your history</small>}
            {choices.map((choice, index) => (
              <div
                key={choice.id}
                id={`app-choice-${index}`}
                data-at={index}
                role="option"
                aria-selected={index === at}
                className={index === at ? "choice on" : "choice"}
                title={choice.id}
                // Keeps the caret in the field, so the list stays open.
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => index !== at && setActive(index)}
                onClick={() => pick(choice)}
              >
                {choice.typed ? (
                  <>
                    <span className="initial plus">+</span>
                    <span className="name">Add “{choice.id}”</span>
                  </>
                ) : (
                  <>
                    <span className="initial" style={{ background: tint(choice.id) }}>
                      {choice.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="name">{choice.name}</span>
                    <span className="id">{choice.id}</span>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** A steady colour per app, for its initial. */
function tint(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 52%)`;
}

/** The pattern list, and a sample to try it on — tried by the extension,
 *  with the engine the history itself uses. */
function Patterns({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [sample, setSample] = useState("");
  const [tried, setTried] = useState<Tried | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      ask<Tried>({ kind: "tryPatterns", patterns: value, sample }).then(
        (t) => live && setTried(t),
        () => {},
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value, sample]);

  const lines = value.split("\n");
  return (
    <div className="patterns">
      <textarea
        className="mono"
        value={value}
        rows={Math.min(8, Math.max(3, lines.length + 1))}
        spellCheck={false}
        placeholder={"^sk-[A-Za-z0-9]{20,}$\n\\b\\d{6}\\b"}
        aria-label="Never keep text matching"
        onChange={(e) => onChange(e.target.value)}
      />
      {tried?.errors.map((e) => (
        <p key={e.line} className="bad small">
          Line {e.line} is skipped: {e.error.split("\n").filter(Boolean).pop()}
        </p>
      ))}
      <div className="probe">
        <input
          value={sample}
          placeholder="Try a copy…"
          spellCheck={false}
          aria-label="Try a copy against the patterns"
          onChange={(e) => setSample(e.target.value)}
        />
        {sample && tried && (
          <span className={tried.matched ? "verdict no" : "verdict yes"}>
            {tried.matched ? `Not kept · line ${tried.matched}` : "Kept"}
          </span>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
