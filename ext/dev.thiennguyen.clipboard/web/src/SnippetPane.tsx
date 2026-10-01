// What a copy expands to when it is one of the person's snippet triggers
// (src/snippets.rs): each expansion, the profiles whose snippet gives it,
// its web addresses live, and a button that copies it. Lumi matched and
// expanded it; the extension copies or opens only what the item still
// expands to.

import type { Expansion } from "./bridge";
import { CopyGlyph } from "./icons";
import { linked } from "./LinkedText";

export function SnippetPane({
  expansions,
  onCopy,
  onOpen,
}: {
  expansions: Expansion[];
  onCopy?: (text: string) => void;
  onOpen?: (url: string) => void;
}) {
  return (
    <section className="snippet" aria-label="Expands to">
      {expansions.map((one, at) => (
        <div className="expansion" key={at}>
          <header className="snippet-head">
            <span className="snippet-from">
              Expands to{one.profiles.length ? ` · ${one.profiles.join(", ")}` : ""}
            </span>
            {onCopy && (
              <button
                type="button"
                className="bare"
                title="Copy"
                aria-label="Copy what it expands to"
                // The caret stays in the search field, as it does for a row.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onCopy(one.text)}
              >
                <CopyGlyph />
              </button>
            )}
          </header>
          <div className="body snippet-text">{linked(one.text, one.links, onOpen)}</div>
          {one.dynamic && <p className="snippet-fresh">Changes each time the panel shows it</p>}
        </div>
      ))}
    </section>
  );
}
