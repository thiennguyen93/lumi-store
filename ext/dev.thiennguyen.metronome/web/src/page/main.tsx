// The Metronome tab's page. The practice and the presets are the
// extension's own storage, through the bridge (engine/store.ts). The theme
// is the extension's `look` setting, read from Lumi's bridge as the page
// opens and switched from its foot (ThemePicker.tsx) — Lumi draws the
// same setting on the Settings tab, and moving to that tab closes this
// page, so a read at load is always the current one. Light or dark comes
// on the address (`?theme=`), which Lumi's embedding script also writes on
// the root.

import { StrictMode, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { useMetronome, type MetronomeApi } from "../engine/useMetronome";
import { load, type Saved } from "../engine/store";
import { DEFAULT_LOOK, isLook, type Look } from "../looks";
import { LookContext } from "../controls/ThemePicker";
import { Footer } from "../controls/PresetMenu";
import { Pendulum } from "../variants/Pendulum";
import { Pads } from "../variants/Pads";
import { Dial } from "../variants/Dial";
import { List } from "../variants/List";
import "../controls/controls.css";

const DRAWN: Record<Look, (props: { m: MetronomeApi }) => JSX.Element> = {
  orbit: Dial,
  classic: Pendulum,
  pads: Pads,
  simple: List,
};

const appearance = new URLSearchParams(location.search).get("theme");
if (appearance === "light" || appearance === "dark") document.documentElement.dataset.theme = appearance;

/** The chosen theme, or the default when the bridge answers nothing we
 *  know — a value from a newer version, or a file somebody edited. */
async function chosenLook(): Promise<Look> {
  // `pnpm dev` only: `?look=` opens one theme without touching the saved
  // setting, for looking at them side by side. Folded away in a build.
  if (import.meta.env.DEV) {
    const asked = new URLSearchParams(location.search).get("look");
    if (isLook(asked)) return asked;
  }
  try {
    const response = await fetch("/__lumi__/settings");
    const settings = (await response.json()) as { look?: unknown };
    return isLook(settings.look) ? settings.look : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

/** `pnpm dev` only: a page opened with `?store=` or `?look=` is a test's,
 *  and a theme switched there is not saved over the person's. */
const testing = import.meta.env.DEV && /[?&](store|look)=/.test(location.search);

function Page({ initial, saved }: { initial: Look; saved: Saved }) {
  // The metronome lives here, above the theme, so switching themes
  // changes the picture and nothing playing.
  const m = useMetronome(saved);
  const [look, setLook] = useState(initial);
  const choose = (next: Look) => {
    setLook(next);
    document.documentElement.dataset.look = next;
    if (!testing) void fetch("/__lumi__/settings", { method: "PUT", body: JSON.stringify({ look: next }) });
  };
  const Drawn = DRAWN[look];
  return (
    <LookContext.Provider value={{ look, choose }}>
      {/* The foot is the page's, not the theme's: it stays on the page's
          last line while a theme taller than the tab scrolls above it, so
          the presets and the theme are always a press away. */}
      <div className="m-page">
        <div className="m-page-body">
          <Drawn m={m} />
        </div>
        <Footer m={m} />
      </div>
    </LookContext.Provider>
  );
}

// Both read before anything is drawn, so the page opens as it was left
// rather than on the defaults and then jumping.
void Promise.all([chosenLook(), load()]).then(([look, saved]) => {
  document.documentElement.dataset.look = look;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Page initial={look} saved={saved} />
    </StrictMode>,
  );
});
