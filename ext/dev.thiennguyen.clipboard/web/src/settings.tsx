// Clipboard History's Settings tab — the manifest's `settings-page`, drawn
// in place of the form Lumi would make from [[settings]]. It saves through
// Lumi's own `PUT /__lumi__/settings`, so the manifest still decides what
// can be stored; the extension is asked only things that read: how full the
// history is, which apps it has seen, and what a pattern list would keep out.

import { StrictMode, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { acceleratorGlyphs, comboOf, comboText, DEFAULT_PIN_KEY, glyphs, parseCombo, refusal } from "./keys";
import { KEEP_LABELS, type Stats } from "./types";
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
  ocr: boolean;
  sort: Order;
  appearance: Glass;
  ignoreApps: string[];
  ignorePatterns: string;
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
    ocr: text(raw.ocr, "true") !== "false",
    sort: (["last", "first", "used"].includes(text(raw.sort, "")) ? raw.sort : "last") as Order,
    appearance: (["popover", "hud", "sidebar"].includes(text(raw.appearance, "")) ? raw.appearance : "popover") as Glass,
    ignoreApps: text(raw.ignoreApps, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    ignorePatterns: text(raw.ignorePatterns, ""),
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
    ocr: String(v.ocr),
    sort: v.sort,
    appearance: v.appearance,
    ignoreApps: v.ignoreApps.join("\n"),
    ignorePatterns: v.ignorePatterns,
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
    // Lumi drops the page when its tab is left: what is still waiting to
    // be saved goes now.
    const flush = () => saving.current !== undefined && save();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
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
        <h3>Pasting</h3>
        <div className="group">
          <Row label="Paste the item you pick" hint="Off: picking only puts it on the clipboard">
            <Toggle
              on={values.pasteOnSelect}
              label="Paste the item you pick"
              onChange={(pasteOnSelect) => change({ pasteOnSelect }, true)}
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

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="lbl">
        {label}
        {hint && <small>{hint}</small>}
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

interface OwnShortcuts {
  on: boolean;
  commands: { name: string; label: string; rows: { trigger: string; enabled: boolean }[] }[];
}

/** One of the extension's commands and the global shortcuts that run it —
 *  Lumi's, set in its Shortcuts pane and only shown here, with a button
 *  that goes there. One place sets a global key, so two cannot disagree. */
function GlobalShortcut({ command }: { command: string }) {
  const [own, setOwn] = useState<OwnShortcuts | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    fetch("/__lumi__/shortcuts")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: OwnShortcuts | null) => setOwn(body))
      .catch(() => setOwn(null));
  }, []);

  const mine = own?.commands.find((c) => c.name === command);
  const keys = (mine?.rows ?? []).filter((row) => row.trigger);
  const live = keys.filter((row) => row.enabled && own?.on);
  const hint = !own
    ? "Global — set in Lumi's Shortcuts"
    : !own.on
      ? "Shortcuts are switched off in Lumi"
      : keys.length === 0
        ? "No key yet — give it one in Shortcuts"
        : live.length < keys.length
          ? "Global · a switched-off row is dimmed"
          : "Global — works from any app";

  return (
    <Row label={mine?.label ?? "Show clipboard history"} hint={failed || hint}>
      <div className="recorder">
        {keys.length === 0 ? (
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
 *  added from the apps the history has seen, or by bundle id. */
function Apps({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [seen, setSeen] = useState<App[]>([]);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    ask<{ apps: App[] }>({ kind: "apps" }).then((a) => setSeen(a.apps), () => {});
  }, []);

  const name = (id: string) => seen.find((a) => a.id === id)?.name ?? id;
  const add = (id: string) => {
    const clean = id.trim();
    if (clean && !ids.includes(clean)) onChange([...ids, clean]);
    setTyped("");
    setAdding(false);
  };
  const offered = seen.filter((a) => !ids.includes(a.id));
  const typedOk = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(typed.trim());

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
      {!adding ? (
        <button type="button" className="add" onClick={() => setAdding(true)}>
          + Add app…
        </button>
      ) : (
        <div className="picker">
          <input
            autoFocus
            value={typed}
            placeholder="Bundle id, e.g. com.apple.keychainaccess"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedOk) add(typed);
              if (e.key === "Escape") setAdding(false);
            }}
          />
          {offered.length > 0 && (
            <div className="offered">
              <small>From your history</small>
              {offered
                .filter((a) => !typed || `${a.name} ${a.id}`.toLowerCase().includes(typed.toLowerCase()))
                .slice(0, 8)
                .map((a) => (
                  <button key={a.id} type="button" onClick={() => add(a.id)}>
                    <span className="initial" style={{ background: tint(a.id) }}>
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    {a.name}
                    <span className="id">{a.id}</span>
                  </button>
                ))}
            </div>
          )}
          <div className="picker-foot">
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!typedOk} onClick={() => add(typed)}>
              Add
            </button>
          </div>
        </div>
      )}
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
