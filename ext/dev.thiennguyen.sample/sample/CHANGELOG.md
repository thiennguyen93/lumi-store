# Changelog

## [0.16.1] - 2026-10-06

### Changed

- The rename sheet says when the name is empty, and grows to fit the line saying so.

## [0.16.0] - 2026-10-06

### Added

- Rename in a sheet, on the Settings page: a dialog over the whole of Lumi's window, in Lumi's own frame, that answers the new name back to the page. Needs Lumi 1.38.

## [0.15.0] - 2026-10-06

### Added

- Hold input from a window or a panel: for ten seconds no key reaches any app, and the keys pressed are listed. A second button holds the trackpad too. Needs Lumi 1.38.

## [0.14.1] - 2026-10-06

### Changed

- A new icon: Lucide's translate mark on the macOS icon grid, in place of the hand-set A and 文.

## [0.14.0] - 2026-10-02

### Added

- Rows of its own in Lumi's menu bar menu: **Translate Selection**, a **Translate To** submenu whose tick follows the language picked, and **Sample Settings…** — the `lumi::menu` calls, set on install and update.

### Changed

- Declares `menu`, the capability its menu bar rows need.

## [0.13.0] - 2026-10-02

### Added

- A **Permissions** part on the settings page: check, ask with Lumi's own sheet, ask macOS directly, and open System Settings — the four calls in `lumi::permissions`, for Screen Recording.

### Changed

- Needs Lumi 1.33.0, and declares `screen`, the capability Screen Recording is for.

## [0.12.0] - 2026-10-02

### Added

- The Changelog tab on its page in Lumi is renamed **What's new**, to show how an extension changes one of Lumi's own tabs.
- Two windows whose toolbar is their title bar, one with a taller band, to show `titlebar = "unified"`.

### Changed

- Needs Lumi 1.31.0.

## [0.11.1] - 2026-09-30

### Added

- Screenshots of the About and Settings pages for the Extension Store.

## [0.11.0] - 2026-09-29

### Changed

- Rebuilt against the latest extension SDK. Still runs on Lumi 1.22.

## [0.10.0] - 2026-09-28

### Added

- A Welcome window that opens when the extension is installed.
- An installer page, a note when the extension is updated, and a page shown before it is uninstalled.

### Changed

- Built for version 0.2 of Lumi's extension interface.

## [0.8.0] - 2026-09-28

### Changed

- Built for version 0.1 of Lumi's extension interface.

## [0.7.0] - 2026-09-27

### Added

- Translate can open the text in more languages at once: pick them under "Also open in" and each gets its own tab.
- A short note under each of Translate's four tabs.

### Fixed

- Languages with special characters in their code now open the right translation page.

## [0.6.0] - 2026-09-27

### Added

- An About page and a Settings tab in the extension's page.
- An icon for each command.
- Translate's tab is chosen from a segmented picker.

## [0.5.0] - 2026-09-27

### Added

- The settings window shows which Lumi it is running in, and the edition when it is Pro.

## [0.4.0] - 2026-09-27

### Changed

- The default language is kept per profile: each profile can have its own, and the settings window says whose value you are editing.

## [0.3.0] - 2026-09-27

### Added

- The settings window shows which profile is live.

## [0.2.0] - 2026-09-27

### Added

- A settings window, opened from the new Configure command.
- An icon for the extension.

## [0.1.0] - 2026-09-27

### Added

- First release: a small extension to learn from, with commands to copy from when you write your own.
