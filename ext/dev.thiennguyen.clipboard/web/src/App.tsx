// Clipboard History's panel.
//
// The whole history index is read once when the panel opens and searched
// here: typing in the search field costs no call into the extension. The
// extension is asked only for what the index does not hold — a row's full
// text, for the preview — and for what changes storage: paste, pin, delete.
//
// Everything a row shows was copied from somewhere, so none of it is ever
// put into the page as markup; React renders it as text, and nothing here
// uses dangerouslySetInnerHTML.

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { call, message } from "./bridge";
import { KindGlyph, LumiMark, SearchGlyph } from "./icons";
import { Preview } from "./Preview";
import { MIN_LIST, usePreviewWidth } from "./PreviewWidth";
import { Row } from "./Row";
import { FILTER_LABELS, FILTERS, type Filter, inFilter, matches, shortcuts, words } from "./search";
import type { Entry } from "./types";

export function App() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const preview = usePreviewWidth();
  const adoptWidth = preview.adopt;
  // `reload` is made once; it reads the filter through this.
  const filterRef = useRef<Filter>("all");
  filterRef.current = filter;

  const shown = useMemo(() => {
    const wanted = words(query);
    return (rows ?? []).filter((row) => inFilter(row, filter) && matches(row, wanted));
  }, [rows, query, filter]);
  const keys = useMemo(() => shortcuts(shown), [shown]);
  const current = shown[selected];

  const reload = useCallback(async (keepId: string | null) => {
    const answer = await call({ kind: "list" });
    setRows(answer.items);
    adoptWidth(answer.previewWidth);
    if (keepId) {
      const wanted = words(input.current?.value ?? "");
      const at = answer.items
        .filter((row) => inFilter(row, filterRef.current) && matches(row, wanted))
        .findIndex((row) => row.id === keepId);
      if (at >= 0) setSelected(at);
    }
  }, [adoptWidth]);

  useEffect(() => {
    reload(null)
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
    void act(async () => {
      await call({ kind: "pin", id: current.id });
      await reload(current.id);
    });
  }, [act, current, reload]);

  const remove = useCallback(() => {
    if (!current) return;
    void act(async () => {
      await call({ kind: "delete", id: current.id });
      await reload(null);
    });
  }, [act, current, reload]);

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

  const move = (by: number) => {
    if (!shown.length) return;
    setSelected((at) => Math.max(0, Math.min(shown.length - 1, at + by)));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // While an input method is composing — Telex turning `aa` into `â` —
    // Return and the arrows belong to it: taking Return here would paste a
    // row in the middle of somebody spelling a search word.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cmd = event.metaKey && !event.ctrlKey;
    const key = event.key;
    if (key === "ArrowDown") move(1);
    else if (key === "ArrowUp") move(-1);
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
    } else if (cmd && key === "Backspace") remove();
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
      <header className="crumbs">
        <LumiMark />
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
        <div id="list" className="list" role="listbox" aria-label="Clipboard history">
          {rows !== null && !shown.length && (
            <div className="empty">{emptyText(rows.length, query, filter)}</div>
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
      <footer className="hints">
        <span><kbd className="cap quiet">↩</kbd> paste</span>
        <span><kbd className="cap quiet">⌥↩</kbd> plain</span>
        <span><kbd className="cap quiet">⌘P</kbd> pin</span>
        <span><kbd className="cap quiet">⌘⌫</kbd> delete</span>
        <span><kbd className="cap quiet">⇥</kbd> filter</span>
        <span className="exit"><kbd className="cap quiet">esc</kbd> close</span>
      </footer>
    </main>
  );
}

function emptyText(kept: number, query: string, filter: Filter): string {
  if (!kept) return "Copy something and it shows up here";
  if (query) return "Nothing matches that search";
  return `No ${FILTER_LABELS[filter].toLowerCase()} yet`;
}
