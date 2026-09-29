import { useEffect, useRef, useState } from "react";
import { JsonTree, type Json } from "./JsonTree";

/** How much of a text file is shown: enough to see what it is, and a
 *  log of a gigabyte costs the same as a note. */
const HEAD_BYTES = 64 * 1024;

/** How much of a JSON file is read to draw it as a tree — the whole file,
 *  since half a JSON does not parse. A bigger one shows as text. */
const JSON_BYTES = 1024 * 1024;

type Head = { text: string; cut: boolean; tree: Json | undefined };

/** The start of a copied text or code file, as plain text — or, for a JSON
 *  file small enough to read whole, a tree, with the text a click away.
 *  Lumi serves it as `text/plain` under `nosniff` whatever its name, and it
 *  is drawn here as text nodes — an HTML file shows its markup, nothing in
 *  it runs. A file with a NUL in its start is not text after all: `onFail`,
 *  the tile. */
export function TextFile({ src, json, onFail }: { src: string; json: boolean; onFail: () => void }) {
  const [head, setHead] = useState<Head | null>(null);
  const [asText, setAsText] = useState(false);
  // The latest `onFail`, so a new closure from the parent does not read the file again.
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    const stop = new AbortController();
    const want = json ? JSON_BYTES : HEAD_BYTES;
    void (async () => {
      try {
        const answer = await fetch(src, { headers: { Range: `bytes=0-${want - 1}` }, signal: stop.signal });
        // An empty file has no range to give.
        if (answer.status === 416) return setHead({ text: "", cut: false, tree: undefined });
        if (!answer.ok) throw new Error(String(answer.status));
        const bytes = new Uint8Array(await answer.arrayBuffer());
        if (bytes.includes(0)) throw new Error("binary");
        const total = Number(answer.headers.get("Content-Range")?.split("/")[1]) || bytes.length;
        const whole = new TextDecoder().decode(bytes);
        const tree = json && total <= JSON_BYTES ? parse(whole) : undefined;
        const cut = whole.length > HEAD_BYTES || total > bytes.length;
        // Cut at the last whole line, so the end is not half a character.
        let text = whole.slice(0, HEAD_BYTES);
        if (cut) text = text.slice(0, text.lastIndexOf("\n") + 1) || text;
        setHead({ text, cut, tree });
      } catch {
        if (!stop.signal.aborted) fail.current();
      }
    })();
    return () => stop.abort();
  }, [src, json]);

  if (!head) return <div className="file-text" />;
  const tree = head.tree !== undefined && !asText;
  // The caret stays in the search field, as it does for a row.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  return (
    <div className="file-text">
      {tree ? <JsonTree value={head.tree!} /> : <pre>{head.text || "Empty file"}</pre>}
      {(head.tree !== undefined || head.cut) && (
        <div className="file-text-more">
          {head.cut && !tree && <span>First {Math.round(HEAD_BYTES / 1024)} KB of the file</span>}
          {head.tree !== undefined && (
            <span className="file-text-modes" role="group" aria-label="Show as">
              <button type="button" aria-pressed={tree} onMouseDown={keepFocus} onClick={() => setAsText(false)}>
                Tree
              </button>
              <button type="button" aria-pressed={!tree} onMouseDown={keepFocus} onClick={() => setAsText(true)}>
                Text
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** The file as JSON, or `undefined` when it is not. */
function parse(text: string): Json | undefined {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return undefined;
  }
}
