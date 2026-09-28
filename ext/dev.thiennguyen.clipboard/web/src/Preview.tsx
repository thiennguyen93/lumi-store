import { useEffect, useState } from "react";
import { blobUrl, call } from "./bridge";
import { KindGlyph } from "./icons";
import { RichText } from "./richText";
import { HEX, KIND_WORDS } from "./Row";
import { ago } from "./search";
import type { Entry } from "./types";

/** How long the selection must rest on a row before its full text is
 *  asked for. Arrow keys held down walk many rows a second, and each ask
 *  is a fresh instantiation of the extension. */
const SETTLE_MS = 90;

export function Preview({ row }: { row: Entry | undefined }) {
  // The full text, keyed by the row it belongs to, so a late answer for a
  // row the selection has already left is never drawn under another.
  const [full, setFull] = useState<{ id: string; text: string; html?: string | null } | null>(null);

  useEffect(() => {
    if (!row || row.kind === "image") return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const { text, html } = await call({ kind: "preview", id: row.id });
        if (live && (text || html)) setFull({ id: row.id, text, html });
      } catch {
        // The title stays in the pane; a preview is not worth an error.
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [row]);

  if (!row) return <aside className="preview empty-card" />;

  // The title until the full text arrives, so the pane is never empty
  // while the extension is asked.
  const mine = full?.id === row.id ? full : null;
  const text = mine?.text || row.title;
  const html = row.kind === "rich" ? mine?.html : null;

  const from = row.appName || row.app;
  const times = row.count > 1 ? `${row.count}×` : "once";

  return (
    <aside className="preview" aria-live="polite">
      <div className="card">
        <header className="card-head">
          <KindGlyph kind={row.kind} />
          <span>
            {KIND_WORDS[row.kind]}
            {from ? ` · ${from}` : ""}
          </span>
        </header>
        {row.kind === "image" && row.thumb && (
          <div className="picture">
            <img alt="Copied image" src={blobUrl(row.thumb)} />
          </div>
        )}
        {row.kind === "color" && HEX.test(row.title) && (
          <div className="chip" style={{ background: row.title }} />
        )}
        {html ? (
          <RichText key={row.id} html={html} />
        ) : (
          row.kind !== "image" && <div className={row.kind === "rich" ? "body rich" : "body"}>{text}</div>
        )}
        <footer className="card-foot">
          Copied {ago(row.last)} · {times}
        </footer>
      </div>
    </aside>
  );
}
