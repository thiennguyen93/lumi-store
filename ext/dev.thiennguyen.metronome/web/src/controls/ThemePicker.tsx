// The theme, switched from the page's foot: the same `look` setting Lumi
// draws on the Settings tab, saved the same way (`PUT /__lumi__/settings`)
// — so the two never disagree, and Settings shows this choice the next
// time it is opened. A pop-up button, macOS's control for one choice among
// several, drawn by macOS itself: WebKit's `<select>` is the system menu.
//
// Switching draws the new theme in place: the page, its metronome and
// whatever is playing stay as they are, and only the picture changes.

import { createContext, useContext } from "react";
import { Palette } from "lucide-react";
import { LOOKS, type Look } from "../looks";
import { Popup } from "./controls";

export const LookContext = createContext<{ look: Look; choose(look: Look): void } | null>(null);

export function ThemePicker() {
  const theme = useContext(LookContext);
  if (!theme) return null;
  return (
    <label className="m-theme" data-tip="Theme — also on the Settings tab">
      <Palette size={13} strokeWidth={1.8} aria-hidden="true" />
      <Popup aria-label="Theme" value={theme.look} onChange={(event) => theme.choose(event.target.value as Look)}>
        {LOOKS.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </Popup>
    </label>
  );
}
