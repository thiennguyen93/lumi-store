// "Match snippets" on the Settings tab: a pop-up menu, the macOS way. Off,
// Current Profile, All Profiles and Selected are picked like a select's
// choices. Only once Selected is the one picked does it have a submenu: the
// profiles, ticked one by one while the menu stays up. Picking Selected
// opens it at once. The ticks are kept while another choice is picked, so
// Selected comes back with them. ↑ ↓ move, → and ← go into and out of the
// submenu, ↩ or space picks or ticks, esc closes; so does a press anywhere
// else.

import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckGlyph, ChevronDownGlyph, ChevronRightGlyph } from "./icons";

export type Matching = "off" | "current" | "all" | "selected";

/** Lumi's profiles, as `profiles.read` answers them. */
export interface Book {
  active: string;
  profiles: { id: string; name: string }[];
}

const MODES: { value: Exclude<Matching, "selected">; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "current", label: "Current Profile" },
  { value: "all", label: "All Profiles" },
];

/** Where the keyboard is: one of the three modes, Selected (index 3), or a
 *  row of the submenu. */
type At = { menu: "main"; index: number } | { menu: "sub"; index: number };

export function MatchMenu({
  matching,
  picked,
  book,
  onChange,
}: {
  matching: Matching;
  picked: string[];
  book: Book | null;
  onChange: (patch: { matchSnippets?: Matching; snippetProfiles?: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const [at, setAt] = useState<At>({ menu: "main", index: 0 });
  // The submenu flies out to the left when the window has no room right.
  const [left, setLeft] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const subMenu = useRef<HTMLDivElement>(null);

  const profiles = book?.profiles ?? [];
  // A profile ticked once and deleted since is listed until it is unticked,
  // so it does not leave the setting without anybody seeing it go.
  const gone = picked.filter((id) => !profiles.some((p) => p.id === id));
  const rows = [
    ...profiles.map((p) => ({ id: p.id, name: p.name, live: p.id === book?.active, gone: false })),
    ...gone.map((id) => ({ id, name: "A deleted profile", live: false, gone: true })),
  ];

  const names = profiles.filter((p) => picked.includes(p.id)).map((p) => p.name);
  const shown =
    matching === "selected" ? `Selected: ${names.length ? names.join(", ") : "none"}` : MODES.find((m) => m.value === matching)!.label;

  const close = (refocus: boolean) => {
    setOpen(false);
    setSub(false);
    if (refocus) setTimeout(() => button.current?.focus());
  };

  const openMenu = () => {
    const index = matching === "selected" ? 3 : MODES.findIndex((m) => m.value === matching);
    setAt({ menu: "main", index: Math.max(index, 0) });
    setSub(false);
    setOpen(true);
  };

  const pick = (value: Exclude<Matching, "selected">) => {
    onChange({ matchSnippets: value });
    close(true);
  };

  /** A profile pressed in the submenu, which is only there while Selected
   *  is picked: ticked or unticked. */
  const tick = (id: string) => {
    onChange({ snippetProfiles: picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id] });
  };

  /** Selected pressed: picked, with the profiles ticked before, and its
   *  submenu opened to change them. */
  const pickSelected = () => {
    if (matching !== "selected") onChange({ matchSnippets: "selected" });
    if (!rows.length) return;
    setSub(true);
    setAt({ menu: "sub", index: 0 });
  };

  // A press anywhere outside closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  // Right of the menu unless the window ends first.
  useLayoutEffect(() => {
    const fly = subMenu.current;
    if (!sub || !fly) return;
    const parent = fly.parentElement!.getBoundingClientRect();
    setLeft(parent.right + fly.offsetWidth + 8 > window.innerWidth);
  }, [sub, rows.length]);

  // The row the keyboard is on has the focus, so ↩ and space reach it.
  useEffect(() => {
    if (!open) return;
    const selector = at.menu === "main" ? `[data-main="${at.index}"]` : `[data-sub="${at.index}"]`;
    box.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [open, sub, at]);

  const onKey = (e: KeyboardEvent) => {
    const step = (by: number) => {
      e.preventDefault();
      if (at.menu === "main") setAt({ menu: "main", index: (at.index + by + 4) % 4 });
      else if (rows.length) setAt({ menu: "sub", index: (at.index + by + rows.length) % rows.length });
    };
    switch (e.key) {
      case "ArrowDown":
        return step(1);
      case "ArrowUp":
        return step(-1);
      case "ArrowRight":
        if (at.menu === "main" && at.index === 3 && matching === "selected" && rows.length) {
          e.preventDefault();
          setSub(true);
          setAt({ menu: "sub", index: 0 });
        }
        return;
      case "ArrowLeft":
        if (at.menu === "sub") {
          e.preventDefault();
          setSub(false);
          setAt({ menu: "main", index: 3 });
        }
        return;
      case "Escape":
        // The page's own Escape (closing Settings) is not this one's.
        e.preventDefault();
        e.stopPropagation();
        if (at.menu === "sub") {
          setSub(false);
          setAt({ menu: "main", index: 3 });
        } else {
          close(true);
        }
        return;
      case "Tab":
        close(false);
        return;
    }
  };

  return (
    <div ref={box} className="pop" onKeyDown={open ? onKey : undefined}>
      <button
        ref={button}
        type="button"
        className="pop-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Match snippets: ${shown}`}
        title={shown}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="pop-value">{shown}</span>
        <ChevronDownGlyph />
      </button>
      {open && (
        <div className="pop-menu" role="menu" aria-label="Match snippets">
          {MODES.map((mode, index) => (
            <button
              key={mode.value}
              type="button"
              role="menuitemradio"
              aria-checked={matching === mode.value}
              tabIndex={-1}
              data-main={index}
              className={at.menu === "main" && at.index === index ? "pop-item on" : "pop-item"}
              onMouseEnter={() => {
                setSub(false);
                setAt({ menu: "main", index });
              }}
              onClick={() => pick(mode.value)}
            >
              <span className="pop-mark">{matching === mode.value && <CheckGlyph />}</span>
              {mode.label}
            </button>
          ))}
          <hr />
          <div className="pop-parent">
            <button
              type="button"
              // A choice like the three above until it is the one picked;
              // then the way into its submenu.
              role={matching === "selected" ? "menuitem" : "menuitemradio"}
              aria-haspopup={matching === "selected" ? "menu" : undefined}
              aria-expanded={matching === "selected" ? sub : undefined}
              aria-checked={matching === "selected" ? undefined : false}
              tabIndex={-1}
              data-main={3}
              className={(at.menu === "main" && at.index === 3) || sub ? "pop-item on" : "pop-item"}
              onMouseEnter={() => {
                setAt({ menu: "main", index: 3 });
                if (matching === "selected" && rows.length) setSub(true);
              }}
              onClick={pickSelected}
            >
              <span className="pop-mark">{matching === "selected" && <CheckGlyph />}</span>
              Selected
              {matching === "selected" && (
                <span className="pop-more">
                  <ChevronRightGlyph />
                </span>
              )}
            </button>
            {sub && matching === "selected" && (
              <div ref={subMenu} className={left ? "pop-menu pop-sub left" : "pop-menu pop-sub"} role="menu" aria-label="Profiles to match">
                {rows.map((row, index) => (
                  <button
                    key={row.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={picked.includes(row.id)}
                    tabIndex={-1}
                    data-sub={index}
                    title={row.live ? "The profile in use" : undefined}
                    className={`pop-item${at.menu === "sub" && at.index === index ? " on" : ""}${row.gone ? " gone" : ""}`}
                    onMouseEnter={() => setAt({ menu: "sub", index })}
                    onClick={() => tick(row.id)}
                  >
                    <span className="pop-mark">{picked.includes(row.id) && <CheckGlyph />}</span>
                    <span className="pop-name">{row.name}</span>
                    {row.live && <span className="pop-tag">In use</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!book && <p className="pop-none">Lumi did not list the profiles.</p>}
        </div>
      )}
    </div>
  );
}
