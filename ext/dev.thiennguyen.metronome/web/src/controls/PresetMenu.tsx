// The page's foot, the same in every theme: the presets as a row of chips,
// the theme beside them, and a button for the keyboard shortcuts.
//
// The presets are on show rather than behind a menu, because coming back
// to one is the whole point of having them — one press, as picking a
// station is. The rest follows from that and from presets.ts's model:
//
// - The chip holding exactly what is set now is lit; change anything and
//   none is. Nothing is "edited", so there is nothing to update or lose.
// - ＋ keeps what is set now as a new preset at once, with no name asked
//   for: an unnamed one is called by what it holds, so it can never say
//   4/4 about a 7/8. A double-click names it, in place.
// - What can be done to one preset is on that preset: its context menu
//   (right-click, Control-click, or the Menu key / ⇧F10 on a focused chip).
// - Delete asks nothing and can be undone — the chip's place offers Undo
//   for a few seconds, and ⌘Z works while it does — as macOS prefers to a
//   question for anything that can be taken back.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard, Plus, Undo2 } from "lucide-react";
import type { MetronomeApi } from "../engine/useMetronome";
import { cleanName, facts, titleOf } from "../engine/presets";
import type { Preset } from "../engine/store";
import { ThemePicker } from "./ThemePicker";
import "./presets.css";

export function Footer({ m }: { m: MetronomeApi }) {
  return (
    <div className="m-footer">
      <PresetBar m={m} />
      <ThemePicker />
      <ShortcutsButton />
    </div>
  );
}

/** The keys the page answers to, each with what it does. */
const SHORTCUTS: { keys: string[]; does: string }[] = [
  { keys: ["Space"], does: "Start or stop" },
  { keys: ["←", "→"], does: "Slower or faster" },
  { keys: ["⇧", "←", "→"], does: "Slower or faster by 10" },
  { keys: ["T"], does: "Tap the tempo" },
  { keys: ["⌘", "Z"], does: "Undo deleting a preset" },
];

/** The shortcuts, behind a button that shows them — a picture that only
 *  answered a resting pointer looked like a button and did nothing when
 *  pressed. Pressed, it opens a small panel over the foot; pressed again,
 *  Escape or a press elsewhere puts it away, and the keyboard goes back to
 *  the button. */
function ShortcutsButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="m-keys" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`m-keys-button${open ? " on" : ""}`}
        aria-label="Keyboard Shortcuts"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tip={open ? undefined : "Keyboard Shortcuts"}
        onClick={() => setOpen(!open)}
      >
        <Keyboard size={15} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <div className="m-shortcuts" role="dialog" aria-label="Keyboard Shortcuts">
          <strong>Keyboard Shortcuts</strong>
          <dl>
            {SHORTCUTS.map((one) => (
              <div key={one.does} className="m-shortcut">
                <dt>
                  {one.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{one.does}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

const UNDO_FOR = 6000;

function PresetBar({ m }: { m: MetronomeApi }) {
  const p = m.presets;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [undo, setUndo] = useState<{ at: number; title: string; back(): void } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const added = useRef<string | null>(null);

  // A new preset is scrolled to and given the keyboard, so the next
  // Return or double-click names it.
  useLayoutEffect(() => {
    const id = added.current;
    if (!id) return;
    added.current = null;
    const row = strip.current;
    const chip = chips.current.get(id);
    if (row && chip) row.scrollLeft = row.scrollWidth;
    chip?.focus({ preventScroll: true });
  }, [p.all.length]);

  // The lit chip is kept in sight — on opening, and when what is set now
  // comes to match a preset further along the row. By the row's own
  // scroll, not scrollIntoView, which would move the page as well.
  const lit = p.matching?.id;
  useLayoutEffect(() => {
    const row = strip.current;
    const chip = lit ? chips.current.get(lit) : undefined;
    if (!row || !chip) return;
    // The row is the chips' offset parent (presets.css), so this is the
    // chip's place along the row's content, whatever its scroll.
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (right > row.scrollLeft + row.clientWidth - 18) row.scrollLeft = right - row.clientWidth + 18;
  }, [lit]);

  // Undo is offered for a while, and ⌘Z takes it while it is.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_FOR);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo.back();
        setUndo(null);
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      removeEventListener("keydown", onKey);
    };
  }, [undo]);

  const remove = (preset: Preset) => {
    const at = p.all.findIndex((one) => one.id === preset.id);
    const back = p.remove(preset.id);
    setUndo({ at, title: titleOf(preset), back });
    setMenu(null);
  };

  const save = () => {
    if (p.matching) return;
    setUndo(null);
    added.current = p.save();
  };

  // A row of chips is one Tab stop; the arrows move along it.
  const ids = p.all.map((one) => one.id);
  const tabStop = p.matching?.id ?? ids[0];
  const onChipKey = (event: ReactKeyboardEvent, preset: Preset, index: number) => {
    const to = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : null;
    if (to !== null) {
      event.preventDefault();
      chips.current.get(ids[Math.max(0, Math.min(ids.length - 1, to))]!)?.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const next = ids[index + 1] ?? ids[index - 1];
      remove(preset);
      if (next) requestAnimationFrame(() => chips.current.get(next)?.focus());
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      setMenu({ id: preset.id, x: box.left, y: box.top });
    } else if (event.key === "F2") {
      event.preventDefault();
      setRenaming(preset.id);
    }
  };

  const items = p.all.map((preset, index) => {
    if (renaming === preset.id) {
      return (
        <NameField
          key={preset.id}
          preset={preset}
          onDone={(name) => {
            if (name !== undefined) p.rename(preset.id, name);
            setRenaming(null);
            requestAnimationFrame(() => chips.current.get(preset.id)?.focus());
          }}
        />
      );
    }
    const on = p.matching?.id === preset.id;
    return (
      <button
        key={preset.id}
        ref={(element) => {
          if (element) chips.current.set(preset.id, element);
          else chips.current.delete(preset.id);
        }}
        type="button"
        className={`m-chip${on ? " on" : ""}`}
        aria-pressed={on}
        aria-label={`${titleOf(preset)}${preset.name ? `, ${facts(preset.practice)}` : ""}`}
        data-tip={`${preset.name ? `${facts(preset.practice)} — ` : ""}Double-click to name it`}
        tabIndex={preset.id === tabStop ? 0 : -1}
        onClick={() => p.load(preset.id)}
        onDoubleClick={() => setRenaming(preset.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ id: preset.id, x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => onChipKey(event, preset, index)}
      >
        <span className="m-chip-title">{titleOf(preset)}</span>
        {preset.name && <span className="m-chip-facts">{preset.practice.bpm}</span>}
      </button>
    );
  });

  // Undo stands where the chip was.
  if (undo) {
    items.splice(
      Math.min(undo.at, items.length),
      0,
      <button
        key="undo"
        type="button"
        className="m-chip undo"
        aria-label={`Undo deleting ${undo.title}`}
        data-tip={`Put “${undo.title}” back — ⌘Z`}
        onClick={() => {
          undo.back();
          setUndo(null);
        }}
      >
        <Undo2 size={12} strokeWidth={2} aria-hidden="true" />
        <span>Undo</span>
      </button>,
    );
  }

  const empty = p.all.length === 0 && !undo;
  const openFor = menu ? p.all.find((one) => one.id === menu.id) : undefined;
  return (
    <div className="m-presets">
      <button
        type="button"
        className={`m-preset-add${empty ? " labelled" : ""}`}
        aria-label="Save as preset"
        aria-disabled={p.matching ? true : undefined}
        data-tip={p.matching ? `Saved already, as “${titleOf(p.matching)}”` : "Keep what is set now as a preset"}
        onClick={save}
      >
        <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
        {empty && <span>Save Preset</span>}
      </button>
      {!empty && (
        <div
          className="m-preset-strip"
          ref={strip}
          role="toolbar"
          aria-label="Presets"
          onWheel={(event) => {
            // A mouse's wheel scrolls the row along as well as a trackpad does.
            if (strip.current && Math.abs(event.deltaY) > Math.abs(event.deltaX)) strip.current.scrollLeft += event.deltaY;
          }}
        >
          {items}
        </div>
      )}
      {menu && openFor && (
        <ChipMenu
          x={menu.x}
          y={menu.y}
          matches={p.matching?.id === openFor.id}
          onClose={() => {
            setMenu(null);
            chips.current.get(openFor.id)?.focus();
          }}
          onRename={() => {
            setMenu(null);
            setRenaming(openFor.id);
          }}
          onReplace={() => {
            p.replace(openFor.id);
            setMenu(null);
          }}
          onDelete={() => remove(openFor)}
        />
      )}
    </div>
  );
}

/** A preset's name, edited where it stands. Return or leaving the field
 *  keeps it; Escape leaves it as it was; emptied, the preset goes back to
 *  being called by what it holds. */
function NameField({ preset, onDone }: { preset: Preset; onDone(name?: string | null): void }) {
  const [typed, setTyped] = useState(preset.name ?? "");
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (name?: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      ref={field}
      className="m-chip-field"
      value={typed}
      placeholder={facts(preset.practice)}
      aria-label="Preset name"
      maxLength={40}
      size={Math.max(8, Math.min(24, (typed || facts(preset.practice)).length + 1))}
      onChange={(event) => setTyped(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(cleanName(typed));
        else if (event.key === "Escape") finish(undefined);
      }}
      onBlur={() => finish(cleanName(typed))}
    />
  );
}

/** One preset's own commands, at the pointer (or the chip), kept inside
 *  the page and opening upward from the foot. */
function ChipMenu({
  x,
  y,
  matches,
  onClose,
  onRename,
  onReplace,
  onDelete,
}: {
  x: number;
  y: number;
  matches: boolean;
  onClose(): void;
  onRename(): void;
  onReplace(): void;
  onDelete(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const size = box.current!.getBoundingClientRect();
    setPlace({
      left: Math.max(4, Math.min(x, innerWidth - size.width - 4)),
      top: Math.max(4, y - size.height - 4),
    });
    box.current!.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    addEventListener("pointerdown", away, true);
    addEventListener("blur", onClose);
    return () => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKey = (event: ReactKeyboardEvent) => {
    const rows = [...box.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={box}
      className="m-menu"
      role="menu"
      aria-label="Preset"
      style={place ? { left: place.left, top: place.top } : { visibility: "hidden", left: 0, top: 0 }}
      onKeyDown={onKey}
    >
      <button type="button" role="menuitem" className="m-menu-item" onClick={onRename}>
        Rename
      </button>
      <button type="button" role="menuitem" className="m-menu-item" disabled={matches} onClick={onReplace}>
        Replace with Current Settings
      </button>
      <div className="m-menu-rule" role="separator" />
      <button type="button" role="menuitem" className="m-menu-item" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
