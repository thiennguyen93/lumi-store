// ⌘K: what can be done with the selected row, and with the whole history.
// A menu the macOS way — a small raised list with its keys on the right —
// with a filter field at the bottom, so a few letters reach any action. The
// field takes the keyboard while the menu is up; the panel's search keeps
// its text underneath. The menu rises from the footer's ⌘K, so it reads
// bottom-up: the first action sits right above the field, the dangerous
// ones furthest from it.

import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useScrollFade } from "./scrollFade";
import { Title } from "./Row";
import { byWordStarts, wordStarts } from "./search";

export interface Action {
  id: string;
  label: string;
  glyph: ReactNode;
  /** A key the panel already answers, shown as a reminder; ↩ in the menu
   *  runs the action whatever it says. */
  keys?: string;
  /** Red, and in the section above the line. */
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
  const list = useRef<HTMLDivElement>(null);
  useScrollFade(list);

  // Closest first, but each kind on its own side of the line.
  const shown = useMemo(() => {
    const found = byWordStarts(actions, (action) => action.label, filter);
    return [...found.filter((action) => !action.danger), ...found.filter((action) => action.danger)];
  }, [actions, filter]);
  const current = shown[Math.min(at, shown.length - 1)];

  useEffect(() => input.current?.focus(), []);
  // Opened or narrowed, a list too long for the panel shows its first
  // actions — its bottom, by the field — before it is painted.
  useLayoutEffect(() => {
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [filter]);
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
    // And so does the panel losing the keyboard — a click in another app,
    // ⌘-Tab — as a macOS menu goes when its app does. A panel used to close
    // then, menu and all; a pinned one stays up, and a menu left open over
    // an app the person is now typing in is a menu nobody can reach with
    // the keys it lists. The pointer crossing a pinned panel is a focus and
    // a blur too (Lumi's hover without the keyboard), but only while the
    // panel does not hold the keyboard — never while this menu is up.
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  // Moving off an armed item disarms it.
  useEffect(() => {
    if (armed && current?.id !== armed) setArmed(null);
  }, [armed, current]);

  // The arrow keys bring the action they land on into view. The pointer
  // does not: an item scrolled out from under it would put the next one
  // there, and the list would run on by itself.
  const move = (step: number) => {
    const next = Math.max(0, Math.min(shown.length - 1, Math.min(at, shown.length - 1) + step));
    const action = shown[next];
    if (!action) return;
    setAt(next);
    document.getElementById(`action-${action.id}`)?.scrollIntoView({ block: "nearest" });
  };

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
    // The arrows go the way they point: up is further from the field.
    if (key === "ArrowUp") move(1);
    else if (key === "ArrowDown") move(-1);
    else if (key === "Enter") run(current);
    // ⎋ takes back one step at a time: a waiting confirmation first, the
    // menu only when nothing is waiting.
    else if (key === "Escape" && armed) setArmed(null);
    else if (key === "Escape" || (event.metaKey && key.toLowerCase() === "k")) onClose();
    else return;
    event.preventDefault();
  };

  // One line between the row's actions and the dangerous ones, above them.
  const firstDanger = shown.findIndex((a) => a.danger);

  return (
    <div ref={box} className="menu" role="dialog" aria-label="Actions">
      <div ref={list} id="menu-list" className="menu-list" role="listbox" aria-label="Actions">
        {!shown.length && <div className="menu-empty">No action by that name</div>}
        {/* Bottom-up: the first action last, right above the field. */}
        {shown
          .map((action, index) => [
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
              <span className="menu-label">
                {armed === action.id ? (
                  action.confirm
                ) : (
                  <Title text={action.label} marks={wordStarts(action.label, filter)?.marks ?? []} />
                )}
              </span>
              {action.keys && armed !== action.id && <kbd className="cap quiet">{action.keys}</kbd>}
            </div>,
            index === firstDanger && index > 0 ? <div key="line" className="menu-line" role="separator" /> : null,
          ])
          .reverse()}
      </div>
      {/* At the foot, by the ⌘K that opened the menu: the menu grows and
          shrinks upward from it, so the field stays where the eye already is
          while a filter narrows the list. */}
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
    </div>
  );
}
