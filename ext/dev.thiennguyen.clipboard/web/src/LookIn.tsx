// "Look in" under Match snippets on the Settings tab: a pop-up button whose
// label sums up the choice, and a menu, the macOS way. Current Profile and
// All Profiles are picked and the menu closes. Selected Profiles, once it is
// the one picked, has a submenu beside it: a search field over every
// profile, in Lumi's order, ticked or unticked with the menu staying up. The
// submenu scrolls rather than growing, so a hundred profiles take the room
// of a dozen. The ticks are kept while another choice is picked, so
// Selected Profiles comes back with them.
//
// ↑ ↓ move, → opens the submenu and ← or esc leaves it, ↩ picks or ticks,
// esc closes the menu; so does a press anywhere else.

import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckGlyph, ChevronDownGlyph, ChevronRightGlyph, SearchGlyph } from "./icons";

export type Scope = "current" | "all" | "selected";

/** Lumi's profiles, as `profiles.read` answers them. */
export interface Book {
  active: string;
  profiles: { id: string; name: string }[];
}

export const SCOPES: { value: Scope; label: string }[] = [
  { value: "current", label: "Current Profile" },
  { value: "all", label: "All Profiles" },
  { value: "selected", label: "Selected Profiles" },
];

/** Selected Profiles' place among `SCOPES`. */
const SELECTED = 2;

type Row = { id: string; name: string; live: boolean; gone: boolean };

/** The ticked profiles that still exist — what Selected Profiles looks in.
 *  One ticked and deleted since is listed in the submenu to be unticked,
 *  but counted nowhere: nothing is looked in for it. Every one, while Lumi
 *  has not said which exist. */
export function countedPicks(picked: string[], book: Book | null): string[] {
  return book ? picked.filter((id) => book.profiles.some((p) => p.id === id)) : picked;
}

/** What the button says: the choice, or for Selected Profiles the one
 *  ticked or how many. */
export function scopeLabel(scope: Scope, picked: string[], book: Book | null): string {
  if (scope !== "selected") return SCOPES.find((s) => s.value === scope)!.label;
  const counted = countedPicks(picked, book);
  if (counted.length === 0) return "No Profiles";
  if (counted.length === 1) return book?.profiles.find((p) => p.id === counted[0])?.name ?? "1 Profile";
  return `${counted.length} Profiles`;
}

export function LookIn({
  scope,
  picked,
  book,
  onChange,
}: {
  scope: Scope;
  picked: string[];
  book: Book | null;
  onChange: (patch: { snippetsIn?: Scope; snippetProfiles?: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const [typed, setTyped] = useState("");
  const [main, setMain] = useState(0);
  const [row, setRow] = useState(0);
  const [up, setUp] = useState(false);
  // The submenu flies out to the left when the window has no room right,
  // and is nudged up when it would run past the bottom.
  const [left, setLeft] = useState(false);
  const [lift, setLift] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const flyout = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const profiles = book?.profiles ?? [];
  const needle = typed.trim().toLowerCase();
  // Every profile, in Lumi's order — a ticked one keeps its place, so a row
  // never jumps away from the pointer that just ticked it. A profile ticked
  // and deleted since is listed first until it is unticked, so it does not
  // leave the setting without anybody seeing it go.
  const rows: Row[] = [
    ...picked
      .filter((id) => !profiles.some((p) => p.id === id))
      .map((id) => ({ id, name: "A deleted profile", live: false, gone: true })),
    ...profiles.map((p) => ({ id: p.id, name: p.name, live: p.id === book?.active, gone: false })),
  ].filter((r) => !needle || (!r.gone && r.name.toLowerCase().includes(needle)));
  const at = Math.min(row, Math.max(rows.length - 1, 0));
  const hasSub = scope === "selected";

  const close = (refocus: boolean) => {
    setOpen(false);
    setSub(false);
    setTyped("");
    if (refocus) setTimeout(() => button.current?.focus());
  };

  const openMenu = () => {
    setMain(SCOPES.findIndex((s) => s.value === scope));
    setSub(false);
    setTyped("");
    setOpen(true);
  };

  const openSub = () => {
    setRow(0);
    setSub(true);
  };

  const leaveSub = () => {
    setSub(false);
    setTyped("");
    setMain(SELECTED);
    setTimeout(() => menu.current?.focus());
  };

  const choose = (index: number) => {
    const value = SCOPES[index]!.value;
    setMain(index);
    if (value !== scope) onChange({ snippetsIn: value });
    if (value === "selected") openSub();
    else close(true);
  };

  const tick = (id: string) =>
    onChange({ snippetProfiles: picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id] });

  // A press anywhere outside closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  // The keyboard goes to the menu when it opens, and to the search field
  // when the submenu does.
  useEffect(() => {
    if (open && !sub) menu.current?.focus();
  }, [open, sub]);
  useEffect(() => {
    if (sub) search.current?.focus();
  }, [sub]);

  // The menu opens downward unless the window has more room above.
  useLayoutEffect(() => {
    const anchor = button.current;
    const drawn = menu.current;
    if (!open || !anchor || !drawn) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setUp(below < drawn.offsetHeight + 8 && rect.top > below);
  }, [open]);

  // Placed once per opening: right of the menu unless the window ends
  // first, and lifted as far as it would run past the bottom.
  useLayoutEffect(() => {
    const fly = flyout.current;
    if (!sub || !fly) return;
    const parent = fly.parentElement!.getBoundingClientRect();
    setLeft(parent.right + fly.offsetWidth + 8 > window.innerWidth);
    const top = parent.top - 6;
    const over = top + fly.offsetHeight + 8 - window.innerHeight;
    setLift(Math.max(0, Math.min(over, top - 8)));
  }, [sub]);

  // The active row stays in sight as ↑ ↓ move past the list's edge.
  useLayoutEffect(() => {
    if (sub) flyout.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sub, at]);

  // A new narrowing starts at the top.
  useEffect(() => setRow(0), [needle]);

  const onMainKey = (e: KeyboardEvent) => {
    switch (e.key) {
      // From the last value, not this render's: a held key repeats faster
      // than the menu is drawn again.
      case "ArrowDown":
        e.preventDefault();
        setMain((was) => (was + 1) % SCOPES.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        setMain((was) => (was - 1 + SCOPES.length) % SCOPES.length);
        return;
      case "ArrowRight":
        if (main === SELECTED && hasSub) {
          e.preventDefault();
          openSub();
        }
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(main);
        return;
      case "Escape":
        // The page's own Escape (closing Settings) is not this one's.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
    }
  };

  const onSubKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (rows.length) setRow((was) => (Math.min(was, rows.length - 1) + 1) % rows.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (rows.length) setRow((was) => (Math.min(was, rows.length - 1) - 1 + rows.length) % rows.length);
        return;
      case "Enter":
        e.preventDefault();
        if (rows[at]) tick(rows[at]!.id);
        return;
      case "ArrowLeft":
        // Only while there is no text to move through.
        if (!typed) {
          e.preventDefault();
          leaveSub();
        }
        return;
      case "Escape":
        e.preventDefault();
        if (typed) setTyped("");
        else leaveSub();
        return;
      case "Tab":
        close(false);
        return;
    }
  };

  const label = scopeLabel(scope, picked, book);

  return (
    <div ref={box} className="pop">
      <button
        ref={button}
        type="button"
        className="pop-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Look in: ${label}`}
        title={label}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="pop-value">{label}</span>
        <ChevronDownGlyph />
      </button>
      {open && (
        <div
          ref={menu}
          className={up ? "pop-menu up" : "pop-menu"}
          role="menu"
          aria-label="Look in"
          tabIndex={-1}
          onKeyDown={onMainKey}
        >
          {SCOPES.map((one, index) => {
            const parent = index === SELECTED && hasSub;
            const item = (
              <div
                key={one.value}
                // A choice like the two above until it is the one picked;
                // then the way into its submenu.
                role={parent ? "menuitem" : "menuitemradio"}
                aria-checked={parent ? undefined : scope === one.value}
                aria-haspopup={parent ? "menu" : undefined}
                aria-expanded={parent ? sub : undefined}
                // While the submenu is up, its row is the one lit.
                className={(sub ? parent : main === index) ? "pop-item on" : "pop-item"}
                onMouseEnter={() => {
                  setMain(index);
                  if (parent && !sub) openSub();
                  else if (!parent && sub) leaveSub();
                }}
                onClick={() => choose(index)}
              >
                <span className="pop-mark">{scope === one.value && <CheckGlyph />}</span>
                {one.label}
                {parent && (
                  <span className="pop-more">
                    <ChevronRightGlyph />
                  </span>
                )}
              </div>
            );
            if (!parent) return item;
            return (
              <div key={one.value} className="pop-parent">
                {item}
                {sub && (
                  <div
                    ref={flyout}
                    className={left ? "pop-menu pop-sub left" : "pop-menu pop-sub"}
                    style={lift ? { transform: `translateY(-${lift}px)` } : undefined}
                    role="menu"
                    aria-label="Selected Profiles"
                    onKeyDown={onSubKey}
                    onMouseEnter={() => setMain(SELECTED)}
                  >
                    <label className="pop-search">
                      <SearchGlyph />
                      <input
                        ref={search}
                        value={typed}
                        placeholder={`Search ${profiles.length} ${profiles.length === 1 ? "profile" : "profiles"}`}
                        aria-label="Search profiles"
                        spellCheck={false}
                        onChange={(e) => setTyped(e.target.value)}
                      />
                    </label>
                    <div className="pop-list" role="group" aria-label="Profiles">
                      {rows.map((r, index) => (
                        <div
                          key={r.id}
                          role="menuitemcheckbox"
                          aria-checked={picked.includes(r.id)}
                          data-row={index}
                          title={r.gone ? r.id : r.live ? "The profile in use" : undefined}
                          className={`pop-item${at === index ? " on" : ""}${r.gone ? " gone" : ""}`}
                          // Keeps the caret in the search field.
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseMove={() => at !== index && setRow(index)}
                          onClick={() => tick(r.id)}
                        >
                          <span className="pop-mark">{picked.includes(r.id) && <CheckGlyph />}</span>
                          <span className="pop-name">{r.name}</span>
                          {r.live && <span className="pop-tag">In use</span>}
                        </div>
                      ))}
                      {!book && <p className="pop-none">Lumi did not list the profiles.</p>}
                      {book && !rows.length && <p className="pop-none">No profile matches “{typed.trim()}”.</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
