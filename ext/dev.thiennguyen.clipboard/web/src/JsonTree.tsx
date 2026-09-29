import { useState } from "react";

/** A branch shows this many children at first, and this many more each
 *  time it is asked: an array of 10 000 rows must not stall the pane. */
const PAGE = 100;

/** How deep the tree opens by itself: the top and one level under it. */
const OPEN_DEPTH = 2;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A parsed JSON file as a tree to fold and unfold. Every key and value is
 *  drawn as a text node; nothing in the file is markup to the page. The
 *  caret stays in the search field — rows take no focus. */
export function JsonTree({ value }: { value: Json }) {
  return (
    <div className="json-tree" role="tree">
      <Node label={null} value={value} depth={0} last />
    </div>
  );
}

function Node({ label, value, depth, last }: { label: string | null; value: Json; depth: number; last: boolean }) {
  const branch = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < OPEN_DEPTH);
  const [shown, setShown] = useState(PAGE);
  const comma = last ? "" : ",";
  const key = label !== null && (
    <>
      <span className="json-key">{label}</span>
      <span className="json-punct">: </span>
    </>
  );

  if (!branch) {
    return (
      <div className="json-row" role="treeitem" style={{ paddingLeft: indent(depth) }}>
        <span className="json-caret" />
        {key}
        <Leaf value={value} />
        <span className="json-punct">{comma}</span>
      </div>
    );
  }

  const list = Array.isArray(value);
  const entries: [string, Json][] = list ? value.map((item, i) => [String(i), item]) : Object.entries(value);
  const [start, end] = list ? ["[", "]"] : ["{", "}"];
  const toggle = () => entries.length && setOpen(!open);
  return (
    <>
      <div
        className="json-row json-branch"
        role="treeitem"
        aria-expanded={entries.length ? open : undefined}
        style={{ paddingLeft: indent(depth) }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        <span className="json-caret">{entries.length ? (open ? "▾" : "▸") : ""}</span>
        {key}
        <span className="json-punct">{start}</span>
        {!open && (
          <>
            {entries.length > 0 && <span className="json-count">{list ? `${entries.length} items` : `${entries.length} keys`}</span>}
            <span className="json-punct">
              {end}
              {comma}
            </span>
          </>
        )}
      </div>
      {open && (
        <>
          {entries.slice(0, shown).map(([name, item], i) => (
            <Node
              key={name}
              label={list ? null : JSON.stringify(name)}
              value={item}
              depth={depth + 1}
              last={i === entries.length - 1}
            />
          ))}
          {entries.length > shown && (
            <div
              className="json-row json-more"
              style={{ paddingLeft: indent(depth + 1) }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShown(shown + PAGE)}
            >
              … {(entries.length - shown).toLocaleString()} more
            </div>
          )}
          <div className="json-row" style={{ paddingLeft: indent(depth) }}>
            <span className="json-caret" />
            <span className="json-punct">
              {end}
              {comma}
            </span>
          </div>
        </>
      )}
    </>
  );
}

function Leaf({ value }: { value: null | boolean | number | string }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-string">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="json-number">{String(value)}</span>;
  return <span className="json-bool">{String(value)}</span>;
}

/** Each level one caret's width in; a leaf lines up with its branch's key. */
function indent(depth: number): string {
  return `${depth * 14}px`;
}
