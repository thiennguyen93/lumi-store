// ⌘K: what can be done with the selected row, and with the whole history.
// A menu the macOS way — a small raised list with its keys on the right —
// with a filter field at the top, so a few letters reach any action. The
// field takes the keyboard while the menu is up; the panel's search keeps
// its text underneath.

import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { fold as foldText } from "./search";

export interface Action {
  id: string;
  label: string;
  glyph: ReactNode;
  /** A key the panel already answers, shown as a reminder; ↩ in the menu
   *  runs the action whatever it says. */
  keys?: string;
  /** Red, and in the section below the line. */
  danger?: boolean;
  /** Asked twice: the first ↩ turns the item into this sentence. */
  confirm?: string;
  run: () => void;
}

export function ActionsMenu({ actions, onClose }: { actions: Action[]; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const [at, setAt] = useState(0);
  // The action waiting for its second ↩, if any.
  const [armed, setArmed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const wanted = foldText(filter.trim());
    return wanted ? actions.filter((a) => foldText(a.label).includes(wanted)) : actions;
  }, [actions, filter]);
  const current = shown[Math.min(at, shown.length - 1)];

  useEffect(() => input.current?.focus(), []);
  // A press anywhere else puts the menu away, as a macOS menu goes — the
  // footer's own ⌘K button excepted, which toggles it itself. Capture, so
  // a row or chip that stops the press still closes the menu first.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (box.current?.contains(target) || target?.closest("[data-menu-toggle]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  // Moving off an armed item disarms it.
  useEffect(() => {
    if (armed && current?.id !== armed) setArmed(null);
  }, [armed, current]);

  const run = (action: Action | undefined) => {
    if (!action) return;
    if (action.confirm && armed !== action.id) {
      setArmed(action.id);
      return;
    }
    onClose();
    action.run();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // The panel's own keys stop here while the menu is up.
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const key = event.key;
    if (key === "ArrowDown") setAt((i) => Math.min(shown.length - 1, i + 1));
    else if (key === "ArrowUp") setAt((i) => Math.max(0, i - 1));
    else if (key === "Enter") run(current);
    // ⎋ takes back one step at a time: a waiting confirmation first, the
    // menu only when nothing is waiting.
    else if (key === "Escape" && armed) setArmed(null);
    else if (key === "Escape" || (event.metaKey && key.toLowerCase() === "k")) onClose();
    else return;
    event.preventDefault();
  };

  // One line between the row's actions and the dangerous ones.
  const firstDanger = shown.findIndex((a) => a.danger);

  return (
    <div ref={box} className="menu" role="dialog" aria-label="Actions">
      <input
        ref={input}
        className="menu-filter"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
          setAt(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search actions"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search actions"
        aria-controls="menu-list"
        aria-activedescendant={current ? `action-${current.id}` : undefined}
      />
      <div id="menu-list" className="menu-list" role="listbox" aria-label="Actions">
        {!shown.length && <div className="menu-empty">No action by that name</div>}
        {shown.map((action, index) => [
          index === firstDanger && index > 0 ? <div key="line" className="menu-line" role="separator" /> : null,
          <div
            key={action.id}
            id={`action-${action.id}`}
            role="option"
            aria-selected={action === current}
            className={["menu-item", action.danger ? "danger" : "", armed === action.id ? "armed" : ""]
              .filter(Boolean)
              .join(" ")}
            // The filter keeps the keyboard.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setAt(index)}
            onClick={() => run(action)}
          >
            {action.glyph}
            <span className="menu-label">{armed === action.id ? action.confirm : action.label}</span>
            {action.keys && armed !== action.id && <kbd className="cap quiet">{action.keys}</kbd>}
          </div>,
        ])}
      </div>
    </div>
  );
}
