# Changelog

## [0.4.4] - 2026-10-06

### Changed

- A new look for cleaning, in Lumi's own light or dark colours instead of black: the keyboard is outlined while it is locked, a line along its top runs down with the time, and a ring under it counts down the seconds left. The last ten seconds turn amber.

## [0.4.3] - 2026-10-06

### Changed

- While cleaning, the keyboard stays exactly where it was: the time left and Hold to unlock take the place of the top bar, and the other ways out are one line under the keyboard.

## [0.4.2] - 2026-10-06

### Changed

- The keyboard layout is chosen only on the Keyboard test tab; the Settings tab is for Clean keyboard alone. If you had picked ISO, pick it once more — it is kept from then on.

## [0.4.1] - 2026-10-06

### Changed

- Clean keyboard starts right away. How long it locks the keys, and whether it locks the trackpad too, are set in the new Settings tab, beside the keyboard layout.

## [0.4.0] - 2026-10-06

### Added

- Clean keyboard: lock every key for 30 seconds to 5 minutes so you can wipe the keyboard without typing anything, in any app. Brightness, volume, media, Mission Control and Spotlight keys are held too, and the trackpad can be locked as well.
- While cleaning, each key you wipe lights up on the board and is checked for double-typing, so cleaning is a test too. A summary says how many keys were pressed when it ends.
- Unlock by holding the button for 2 seconds, by holding esc and right shift together for 2 seconds, or let the time run out. Touch ID locking your Mac ends cleaning too.
- While cleaning, F1–F12 light up without fn, and ⌘Tab, ⌘Space and other shortcuts macOS takes first can be tested.

### Changed

- Needs Lumi 1.38 or later.

## [0.3.1] - 2026-09-30

### Added

- Screenshots for the Extension Store: a test in progress and the ISO layout in dark mode.

## [0.3.0] - 2026-09-29

### Changed

- Rebuilt against the latest extension SDK.

## [0.2.1] - 2026-09-28

### Added

- F11 can be tested: while the tab is in front, F1–F12 reach the test instead of macOS, so F11 no longer sweeps the window aside for Show Desktop.

## [0.2.0] - 2026-09-28

### Added

- fn / Globe is tested on its own: it lights when pressed and is counted and checked for double presses like any other key. Needs Lumi's Accessibility permission; without it, fn is still worked out from fn with delete or an arrow.

## [0.1.9] - 2026-09-28

### Fixed

- fn with delete or an arrow now counts fn on a real MacBook.

## [0.1.8] - 2026-09-28

### Added

- fn / Globe is a counted key, tested by pressing it with delete or an arrow (forward delete, Home, End, Page Up, Page Down). Its tooltip and the notes say how.

## [0.1.7] - 2026-09-28

### Fixed

- Opening "Keys this page cannot hear" scrolls the notes only; the keyboard stays in view.

## [0.1.6] - 2026-09-28

### Changed

- The keyboard is drawn as a MacBook Pro's (2021 and later): real key sizes, a full-height function row with Touch ID, half-height left and right arrows, and modifier keycaps with their symbols. ISO's Return is one L-shaped key.
- Key labels scale with the pane, so they fit a narrow window.

## [0.1.5] - 2026-09-28

### Added

- A hint under the keyboard on how to test Caps Lock, depending on whether Lumi's Hyper key is on.

## [0.1.4] - 2026-09-28

### Added

- The test takes the keyboard as soon as the tab opens, so the first key press counts without a click.

### Changed

- When the test loses the keyboard, a cover says "Click to test keys" and one click brings it back.

## [0.1.3] - 2026-09-28

### Fixed

- Caps Lock counts when Lumi's Hyper key is set to toggle Caps Lock on a tap.

## [0.1.2] - 2026-09-28

### Added

- The last key shown also lists the modifiers it came with.

### Fixed

- Caps Lock counts when Lumi's Hyper key remap is active but not running (for example without Accessibility permission).

## [0.1.1] - 2026-09-28

### Fixed

- Caps Lock can be tested with Lumi's Hyper key on.

## [0.1.0] - 2026-09-28

### Added

- First release: a "Keyboard test" tab with a MacBook keyboard (ANSI or ISO) that lights each key as you press it, counts the keys tested, shows what is held, and flags a key that registers twice from one press — the sign of a worn switch.
