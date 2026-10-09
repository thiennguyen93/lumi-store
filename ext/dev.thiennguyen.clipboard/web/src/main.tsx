import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, openEarly } from "./App";
import { forgetIcons } from "./AppMark";
import { forgetPreviews } from "./Preview";
import { currentGeneration, isHidden, listen, onHidden } from "./visibility";
import "./panel.css";

// First, before anything is drawn: whether the panel is on screen, as Lumi
// tells a page it keeps between openings (`keep-alive`) — a page put away
// before it finished loading starts hidden (visibility.ts). What one browse
// asked for is forgotten as the panel goes, as a page loaded afresh at each
// opening forgot it.
listen();
onHidden(() => {
  forgetPreviews();
  forgetIcons();
});

// `pnpm dev` has no Lumi behind it: the mock answers the bridge with a
// history of its own. `import.meta.env.DEV` is a constant `false` in
// `pnpm build`, so the branch — and the mock module with it — is not in
// the bundle the store ships.
if (import.meta.env.DEV) {
  await import("./dev/mock");
}

// The opening list, asked before React is even loaded: its answer is on its
// way while the page is drawn. Only with the panel on screen — a page loaded
// hidden opens when it is shown.
if (!isHidden()) openEarly();

/** The panel, mounted afresh each time it is put away: every state in it —
 *  the search, the selection, the pin, what privacy mode showed, ⌘Z, a menu
 *  left open, a film playing — starts over as a page loaded afresh started
 *  it, while the page itself, and the list it read, stay for the next
 *  opening to show on its first frame. */
function Panel() {
  const [generation, setGeneration] = useState(currentGeneration);
  useEffect(() => {
    const stop = onHidden(() => setGeneration(currentGeneration()));
    // Put away before this ran.
    setGeneration(currentGeneration());
    return stop;
  }, []);
  return <App key={generation} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
}
