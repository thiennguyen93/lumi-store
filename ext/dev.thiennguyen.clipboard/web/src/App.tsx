// Clipboard History's panel.
//
// The whole history index is read once when the panel opens and searched
// here: typing in the search field costs no call into the extension. The
// extension is asked only for what the index does not hold — a row's full
// text, for the preview — and for what changes storage: paste, pin, delete.
//
// Everything a row shows was copied from somewhere, so none of it is ever
// put into the page as markup; React renders it as text, and nothing here
// uses dangerouslySetInnerHTML. A rich copy's HTML is parsed inert and
// rebuilt from a short list of tags and styles (richText.tsx).

import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { call, message } from "./bridge";
import {
  CopyGlyph,
  ExternalGlyph,
  FolderGlyph,
  GearGlyph,
  KindGlyph,
  LumiMark,
  PasteGlyph,
  PinGlyph,
  PlainGlyph,
  ScanTextGlyph,
  SearchGlyph,
  TrashGlyph,
} from "./icons";
import { type Action, ActionsMenu } from "./ActionsMenu";
import { foldAll, moving, slide, tops } from "./motion";
import { Preview } from "./Preview";
import { MIN_LIST, usePreviewWidth } from "./PreviewWidth";
import { useWindowDrag } from "./windowDrag";
import { Row } from "./Row";
import { badPattern, FILTER_LABELS, FILTERS, type Filter, inFilter, search, type SearchMode, shortcuts } from "./search";
import type { Entry, ListAnswer } from "./types";

export function App() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  // How the query is read — the Search setting; `reload` sets it.
  const [mode, setMode] = useState<SearchMode>("mixed");
  const modeRef = useRef<SearchMode>("mixed");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const preview = usePreviewWidth();
  const windowDrag = useWindowDrag();
  const list = useRef<HTMLDivElement>(null);
  // Where the rows were before a pin or unpin, for the next render to
  // slide them from; null for every other change (typing, filtering).
  const slideFrom = useRef<Map<string, number> | null>(null);
  // The row just pinned, so its pin can pop in once.
  const [popped, setPopped] = useState<string | null>(null);
  // A delete is folding: a second ⌥⌫ waits for it rather than racing it.
  const folding = useRef(false);
  // Everything done since the panel opened, newest last, for ⌘Z. The page
  // is blanked when the panel goes, and the extension empties its trash
  // when the next one opens, so the two forget together.
  const undos = useRef<Undo[]>([]);
  // What ⌘Z took back, for ⌘⇧Z to do again; anything new done clears it.
  const redos = useRef<Undo[]>([]);
  const adoptWidth = preview.adopt;
  // `reload` is made once; it reads the filter through this.
  const filterRef = useRef<Filter>("all");
  filterRef.current = filter;

  const shown = useMemo(
    () => search((rows ?? []).filter((row) => inFilter(row, filter)), query, mode),
    [rows, query, filter, mode],
  );
  const keys = useMemo(() => shortcuts(shown), [shown]);
  const current = shown[selected];

  const reload = useCallback(async (keepId: string | null, opening = false) => {
    const answer = await call({ kind: "list", opening });
    setRows(answer.items);
    adoptWidth(answer.previewWidth);
    wear(answer.appearance, answer.theme);
    modeRef.current = answer.searchMode ?? "mixed";
    setMode(modeRef.current);
    if (keepId) {
      const at = search(
        answer.items.filter((row) => inFilter(row, filterRef.current)),
        input.current?.value ?? "",
        modeRef.current,
      ).findIndex((row) => row.id === keepId);
      if (at >= 0) setSelected(at);
    }
  }, [adoptWidth]);

  useEffect(() => {
    reload(null, true)
      .catch((err) => setNotice(message(err)))
      .finally(() => input.current?.focus());
  }, [reload]);

  // A selection past the end — after a delete, or a search that narrowed
  // the list — lands on the last row rather than on nothing.
  useEffect(() => {
    if (selected > 0 && selected >= shown.length) setSelected(Math.max(0, shown.length - 1));
  }, [selected, shown.length]);

  useEffect(() => {
    document.getElementById(`row-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected, shown]);

  const act = useCallback(async (work: () => Promise<unknown>) => {
    setNotice("");
    try {
      await work();
    } catch (err) {
      setNotice(message(err));
    }
  }, []);

  const paste = useCallback(
    (plain: boolean, row: Entry | undefined = current) => {
      if (!row) return;
      // Lumi closes the panel before it pastes, so nothing after this runs
      // in a page anybody can see.
      void act(() => call({ kind: "paste", id: row.id, plain }));
    },
    [act, current],
  );

  const togglePin = useCallback(() => {
    if (!current) return;
    const id = current.id;
    void act(async () => {
      slideFrom.current = moving() ? tops(list.current) : null;
      try {
        const { pin } = await call({ kind: "pin", id });
        undos.current.push({ kind: "pin", id, was: current.pin, now: pin });
        redos.current = [];
        setPopped(pin ? id : null);
        await reload(id);
      } catch (err) {
        slideFrom.current = null;
        throw err;
      }
    });
  }, [act, current, reload]);

  /** The rows on screen for these ids, for folding. */
  const rowsOf = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => list.current?.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`))
        .filter((row): row is HTMLElement => Boolean(row)),
    [],
  );

  /** Fold `ids` away, then `work` — which deletes them and answers which
   *  went — onto the undo stack. Back as they were if it fails. */
  const deleting = useCallback(
    (ids: string[], work: () => Promise<string[]>) => {
      if (folding.current) return;
      void act(async () => {
        folding.current = true;
        const unfold = await foldAll(rowsOf(ids));
        try {
          const gone = await work();
          if (gone.length) undos.current.push({ kind: "delete", ids: gone });
          redos.current = [];
          await reload(null);
        } catch (err) {
          unfold();
          throw err;
        } finally {
          folding.current = false;
        }
      });
    },
    [act, reload, rowsOf],
  );

  const remove = useCallback(() => {
    if (!current) return;
    const id = current.id;
    deleting([id], async () => {
      await call({ kind: "delete", id });
      return [id];
    });
  }, [current, deleting]);

  /** Delete all — or all but the pins. Every row in the history, not only
   *  the ones the search or filter shows. */
  const removeAll = useCallback(
    (keepPins: boolean) => {
      const going = (rows ?? []).filter((row) => !(keepPins && row.pin)).map((row) => row.id);
      if (!going.length) return;
      deleting(going, async () => (await call({ kind: keepPins ? "clear" : "clearAll" })).ids);
    },
    [deleting, rows],
  );

  /** ⌘Z: take back the last pin, unpin or delete — and the one before,
   *  and so on to when the panel opened. */
  const undo = useCallback(() => {
    const last = undos.current.pop();
    if (!last) return;
    void act(async () => {
      slideFrom.current = moving() ? tops(list.current) : null;
      try {
        if (last.kind === "pin") {
          const { pin } = await call({ kind: "setPin", id: last.id, pin: last.was });
          setPopped(pin ? last.id : null);
          redos.current.push({ ...last, now: pin ?? last.now });
        } else {
          const { count } = await call({ kind: "restore", ids: last.ids });
          if (count) redos.current.push(last);
          if (count < last.ids.length) {
            setNotice(
              last.ids.length === 1
                ? "That item was copied again since, so the newer one stays."
                : "Some items were copied again since, so the newer ones stay.",
            );
          }
        }
        await reload(last.kind === "pin" ? last.id : (last.ids[0] ?? null));
      } catch (err) {
        slideFrom.current = null;
        throw err;
      }
    });
  }, [act, reload]);

  /** ⌘⇧Z: do again what ⌘Z took back, newest first. */
  const redo = useCallback(() => {
    const next = redos.current.pop();
    if (!next || folding.current) return;
    void act(async () => {
      if (next.kind === "pin") {
        slideFrom.current = moving() ? tops(list.current) : null;
        try {
          const { pin } = await call({ kind: "setPin", id: next.id, pin: next.now });
          setPopped(pin ? next.id : null);
          undos.current.push({ ...next, now: pin });
          await reload(next.id);
        } catch (err) {
          slideFrom.current = null;
          throw err;
        }
        return;
      }
      folding.current = true;
      const unfold = await foldAll(rowsOf(next.ids));
      try {
        await call({ kind: "delete", ids: next.ids });
        undos.current.push(next);
        await reload(null);
      } catch (err) {
        unfold();
        throw err;
      } finally {
        folding.current = false;
      }
    });
  }, [act, reload, rowsOf]);

  /** Settings… / ⌘,: this extension's tab in Lumi's Settings. */
  const openSettings = useCallback(() => {
    void act(() => call({ kind: "settings" }));
  }, [act]);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    input.current?.focus();
  }, []);

  /** What ⌘K offers for the selected row, then for the whole history. */
  const actions = useMemo((): Action[] => {
    const row = current;
    const run = (kind: "copy" | "copyText" | "open" | "reveal", plain?: boolean) => () => {
      if (row) void act(() => call(kind === "copy" ? { kind, id: row.id, plain } : { kind, id: row.id }));
    };
    const unpinned = (rows ?? []).filter((r) => !r.pin).length;
    const all = rows?.length ?? 0;
    const textual = row && (row.kind === "text" || row.kind === "rich" || row.kind === "link");
    return [
      ...(row
        ? [
            { id: "paste", label: "Paste", glyph: <PasteGlyph />, keys: "↩", run: () => paste(false, row) },
            ...(textual
              ? [{ id: "plain", label: "Paste as plain text", glyph: <PlainGlyph />, keys: "⌥↩", run: () => paste(true, row) }]
              : []),
            { id: "copy", label: "Copy", glyph: <CopyGlyph />, run: run("copy") },
            ...(row.ocr ? [{ id: "copyText", label: "Copy text in image", glyph: <ScanTextGlyph />, run: run("copyText") }] : []),
            ...(row.kind === "link" ? [{ id: "open", label: "Open in browser", glyph: <ExternalGlyph />, run: run("open") }] : []),
            ...(row.kind === "file" ? [{ id: "reveal", label: "Show in Finder", glyph: <FolderGlyph />, run: run("reveal") }] : []),
            { id: "pin", label: row.pin ? "Unpin" : "Pin", glyph: <PinGlyph />, keys: "⌘P", run: togglePin },
          ]
        : []),
      { id: "settings", label: "Settings…", glyph: <GearGlyph />, keys: "⌘,", run: openSettings },
      ...(row
        ? [{ id: "delete", label: "Delete entry", glyph: <TrashGlyph />, keys: "⌥⌫", danger: true, run: remove }]
        : []),
      ...(unpinned && unpinned < all
        ? [
            {
              id: "clear",
              label: "Delete all unpinned…",
              glyph: <TrashGlyph />,
              danger: true,
              confirm: `Press ↩ again to delete ${unpinned} ${unpinned === 1 ? "entry" : "entries"}`,
              run: () => removeAll(true),
            },
          ]
        : []),
      ...(all
        ? [
            {
              id: "clearAll",
              label: "Delete all…",
              glyph: <TrashGlyph />,
              danger: true,
              confirm: `Press ↩ again to delete all ${all} ${all === 1 ? "entry" : "entries"}`,
              run: () => removeAll(false),
            },
          ]
        : []),
    ];
  }, [act, current, openSettings, paste, remove, removeAll, rows, togglePin]);

  // After a pin or unpin has re-sorted the list: slide rows from where
  // they were. Before paint, so nobody sees them at the new place first.
  useLayoutEffect(() => {
    const from = slideFrom.current;
    if (!from) return;
    slideFrom.current = null;
    slide(list.current, from);
  }, [shown]);

  // The pop plays once; forget it so a later render does not replay it.
  useEffect(() => {
    if (!popped) return;
    const timer = setTimeout(() => setPopped(null), 400);
    return () => clearTimeout(timer);
  }, [popped]);

  const choose = (next: Filter) => {
    setFilter(next);
    setSelected(0);
    setNotice("");
  };

  /** ⇥ / ⇧⇥: the next or previous kind, round the ends. */
  const cycle = (by: number) => {
    const at = FILTERS.indexOf(filter);
    choose(FILTERS[(at + by + FILTERS.length) % FILTERS.length] ?? "all");
  };

  /** ↓ / ↑ go round the ends; a page stops at them. */
  const move = (by: number, round = false) => {
    const count = shown.length;
    if (!count) return;
    setSelected((at) =>
      round ? (((at + by) % count) + count) % count : Math.max(0, Math.min(count - 1, at + by)),
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // While an input method is composing — Telex turning `aa` into `â` —
    // Return and the arrows belong to it: taking Return here would paste a
    // row in the middle of somebody spelling a search word.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cmd = event.metaKey && !event.ctrlKey;
    const key = event.key;
    if (key === "ArrowDown") move(1, true);
    else if (key === "ArrowUp") move(-1, true);
    else if (key === "PageDown") move(8);
    else if (key === "PageUp") move(-8);
    else if (key === "Enter") paste(event.altKey);
    else if (key === "Tab") cycle(event.shiftKey ? -1 : 1);
    else if (key === "Escape") {
      // Undo what narrows the list first — the search, then the filter —
      // and only then put the panel away.
      if (query) {
        setQuery("");
        setSelected(0);
      } else if (filter !== "all") {
        choose("all");
      } else {
        void call({ kind: "close" }).catch(() => {});
      }
    } else if (cmd && key.toLowerCase() === "k") setMenuOpen(true);
    else if (cmd && key === ",") openSettings();
    // ⌥⌫, not ⌘⌫: ⌘⌫ is how people clear what they typed in a field, and
    // it stays the search field's — it used to delete the selected row too.
    else if (event.altKey && !event.metaKey && !event.ctrlKey && key === "Backspace") remove();
    // ⌘Z / ⌘⇧Z are the history's while there is something to take back or
    // do again; with nothing, they stay the search field's own text undo.
    else if (cmd && !event.shiftKey && key.toLowerCase() === "z" && undos.current.length) undo();
    else if (cmd && event.shiftKey && key.toLowerCase() === "z" && redos.current.length) redo();
    else if (cmd && key.toLowerCase() === "p") togglePin();
    else if (cmd && /^[1-9a-z]$/i.test(key)) {
      const wanted = key.toLowerCase();
      const at = shown.findIndex((row) => keys.get(row.id) === wanted);
      // ⌘A, ⌘C, ⌘V and the rest stay the text field's when no row owns them.
      if (at < 0) return;
      setSelected(at);
      paste(event.altKey, shown[at]);
    } else return;
    event.preventDefault();
  };

  return (
    <main className="panel" onKeyDown={onKeyDown}>
      {/* The breadcrumb is the panel's title bar: drag it to move the panel. */}
      <header className="crumbs" {...windowDrag}>
        <LumiMark />
        <span className="brand">Lumi</span>
        <span className="sep">›</span>
        <span>Clipboard History</span>
        <span className="sep">›</span>
        <span className="here">{FILTER_LABELS[filter]}</span>
        <nav className="filters" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={f === filter ? "cap quiet on" : "cap quiet"}
              aria-pressed={f === filter}
              // A kind is drawn as its glyph; its name is the tooltip, the
              // label, and — once chosen — the breadcrumb's last step.
              title={FILTER_LABELS[f]}
              aria-label={FILTER_LABELS[f]}
              // The caret stays in the search field, as it does for a row.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(f)}
            >
              {f === "all" ? FILTER_LABELS[f] : <KindGlyph kind={f} />}
            </button>
          ))}
        </nav>
      </header>
      <div className="search">
        <SearchGlyph />
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
            setNotice("");
          }}
          placeholder="Search history"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search history"
          aria-controls="list"
          aria-activedescendant={current ? `row-${selected}` : undefined}
        />
      </div>
      <section className="body-grid" style={{ gridTemplateColumns: `minmax(0, 1fr) min(${preview.width}px, calc(100% - ${MIN_LIST}px))` }}>
        <div ref={list} id="list" className="list" role="listbox" aria-label="Clipboard history">
          {rows !== null && !shown.length && (
            <div className="empty">{emptyText(rows.length, query, filter, mode)}</div>
          )}
          {shown.map((row, index) => [
            // One hairline where the pins end — only when rows follow them.
            index > 0 && shown[index - 1]?.pin && !row.pin ? (
              <div key="divider" className="divider" role="separator" />
            ) : null,
            <Row
              key={row.id}
              row={row}
              index={index}
              selected={index === selected}
              shortcut={keys.get(row.id)}
              popped={popped === row.id}
              onPick={setSelected}
              onPaste={(plain) => paste(plain, row)}
            />,
          ])}
        </div>
        <div className="preview-slot">
          <div
            className="grip"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize preview"
            title="Drag to resize · double-click to reset"
            {...preview.grip}
          />
          <Preview row={current} />
        </div>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {menuOpen && <ActionsMenu actions={actions} onClose={closeMenu} />}
      <footer className="hints">
        <span><kbd className="cap quiet">↩</kbd> paste</span>
        <span><kbd className="cap quiet">⌥↩</kbd> plain</span>
        <span><kbd className="cap quiet">⌘P</kbd> pin</span>
        <span><kbd className="cap quiet">⌥⌫</kbd> delete</span>
        <span><kbd className="cap quiet">⇥</kbd> filter</span>
        <button
          type="button"
          className="exit"
          data-menu-toggle
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        >
          <kbd className="cap quiet">⌘K</kbd> actions
        </button>
      </footer>
    </main>
  );
}

function emptyText(kept: number, query: string, filter: Filter, mode: SearchMode): string {
  if (!kept) return "Copy something and it shows up here";
  if (badPattern(query, mode)) return "Not a regular expression yet";
  if (query) return "Nothing matches that search";
  return `No ${FILTER_LABELS[filter].toLowerCase()} yet`;
}

/** One thing ⌘Z can take back and ⌘⇧Z do again: a pin or unpin (with the
 *  pin it had before and after), or a delete — of one row, or of all. */
type Undo = { kind: "pin"; id: string; was: string | null; now: string | null } | { kind: "delete"; ids: string[] };

/** Match the page to the panel's glass and theme. Lumi puts the chosen
 *  theme on the window, so the glass and `prefers-color-scheme` already
 *  follow it; `data-theme` says it too, for lumi.css and panel.css, which
 *  key on it. "Dark glass" is always dark; "system" follows macOS. */
function wear(appearance: ListAnswer["appearance"], theme: ListAnswer["theme"]) {
  const root = document.documentElement;
  root.dataset.material = appearance ?? "popover";
  const shown = appearance === "hud" ? "dark" : theme;
  if (shown === "light" || shown === "dark") root.dataset.theme = shown;
  else delete root.dataset.theme;
}
