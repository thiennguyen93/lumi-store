// The Metronome tab's themes: one setting, `look`, kept by Lumi, chosen on
// the Settings tab — which is the extension's own page, so Lumi draws no
// form for it there — and from the Metronome tab's foot. In the manifest:
//
//   [[settings]]
//   name = "look"
//   label = "Theme"        # required by Lumi, though no form shows it
//   kind = "select"
//   default = "classic"
//   # one [[settings.options]] per entry below
//
//   [tabs.settings]
//   page = "settings.html"
//
// Lumi's form was the first plan, and it is why the page is the extension's
// now: a field there always has its label (an empty one reads "Unnamed"),
// so the heading and the label said Appearance and Theme one under the
// other.
//
// The values are wire values, kept in somebody's settings for good; the
// labels and notes are words, free to change.

export const LOOKS = [
  // `note` is each theme's accessible description on the Settings tab.
  { value: "classic", label: "Classic", note: "A wind-up pendulum swinging on the beat. Drag its weight to change the tempo." },
  { value: "orbit", label: "Orbit", note: "The bar as a ring with a hand sweeping round it. Turn the ring to change the tempo." },
  { value: "pads", label: "Beat Pads", note: "One pad per beat, lit as it plays. Click a pad to accent it or leave it silent." },
  { value: "simple", label: "Simple", note: "Lumi's settings rows, with a card that flashes on the beat." },
] as const;

export type Look = (typeof LOOKS)[number]["value"];

/** Classic: the metronome everybody already knows, the one that needs no
 *  explaining on a first opening (the owner's choice, 2026-10-29; Orbit
 *  was the default before it). First in the list for the same reason. */
export const DEFAULT_LOOK: Look = "classic";

export function isLook(value: unknown): value is Look {
  return LOOKS.some((one) => one.value === value);
}
