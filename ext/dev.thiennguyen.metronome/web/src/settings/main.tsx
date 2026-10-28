// The Settings tab, drawn by the extension (`[tabs.settings] page`): the
// one setting there is, the theme, chosen from pictures of the four under
// one heading. Lumi's own form would have put a field label under the
// heading saying the same thing again — a field there cannot go without
// one — and a line of help saying what anybody expects.
//
// The value is still the `[[settings]]` field `look`, kept by Lumi: read
// and saved through `GET`/`PUT /__lumi__/settings`, the same as the
// Metronome tab's own theme pop-up, so the two agree.

import { StrictMode, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_LOOK, isLook, LOOKS, type Look } from "../looks";
import { Thumb } from "./Thumbs";
import "./settings.css";

const appearance = new URLSearchParams(location.search).get("theme");
if (appearance === "light" || appearance === "dark") document.documentElement.dataset.theme = appearance;

function Settings({ initial }: { initial: Look }) {
  const [look, setLook] = useState(initial);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (next: Look) => {
    setLook(next);
    void fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ look: next }) });
  };

  // A radio group to the keyboard: one Tab stop, the arrows move the choice.
  const move = (event: ReactKeyboardEvent, index: number) => {
    const last = LOOKS.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    event.preventDefault();
    choose(LOOKS[to]!.value);
    tiles.current[to]?.focus();
  };

  return (
    <div className="st">
      <section>
        <h3 id="st-appearance">Appearance</h3>
        <div className="st-looks" role="radiogroup" aria-labelledby="st-appearance">
          {LOOKS.map((one, index) => (
            <button
              key={one.value}
              ref={(element) => {
                tiles.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={look === one.value}
              aria-description={one.note}
              tabIndex={look === one.value ? 0 : -1}
              className={`st-look${look === one.value ? " on" : ""}`}
              onClick={() => choose(one.value)}
              onKeyDown={(event) => move(event, index)}
            >
              <span className="st-thumb">
                <Thumb look={one.value} />
              </span>
              <span className="st-name">{one.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

async function current(): Promise<Look> {
  try {
    const settings = (await (await fetch("/__lumi__/settings")).json()) as { look?: unknown };
    return isLook(settings.look) ? settings.look : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

void current().then((look) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Settings initial={look} />
    </StrictMode>,
  );
});
