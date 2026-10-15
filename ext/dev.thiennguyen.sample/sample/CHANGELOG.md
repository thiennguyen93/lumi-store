# Changelog

## [0.28.0] - 2026-10-15

### Added

- The peek panel has a **Summarize** button. It sums up the text you selected in a sentence or two, with the AI you set up in Lumi, and writes the summary into the panel as it comes; while it comes, the button is **Stop**. If your model runs online, Lumi asks you first.
- The panel offers Summarize only when you have set up a model in Settings › AI.
- The peek panel grows to fit what it shows: its buttons wrap onto a second row instead of running past its edge, and a summary is shown whole.
- Needs Lumi 1.52.0.

## [0.27.0] - 2026-10-14

### Added

- When the languages Translate needs aren't on your Mac yet, the peek panel says so and offers **Download…**. It opens macOS's own download prompt at the top of the screen; once the languages are on your Mac, the panel shows the translation. If you close the prompt without downloading, or macOS is still downloading, the panel says so and you can try again later.
- Needs Lumi 1.51.0 and macOS 26.

## [0.26.0] - 2026-10-14

### Added

- The peek panel has a **Translate** button. It translates the text you selected into your own language, or into your next one when the text is already in it, with the translator built into macOS. The text is translated on your Mac and never leaves it. The panel shows the start of the translation and the two languages.
- Translate works on text you can't edit too, since a translation is only read.
- Needs Lumi 1.51.0 and macOS 26. On an older Mac the panel offers no Translate button.

## [0.25.0] - 2026-10-12

### Added

- When the text you select is the trigger of one of your snippets, the peek panel shows what it expands to. A snippet that expands to a web address gets an **Open** button that opens it in your browser, even on text you can't edit. Any other snippet gets an **Expand** button that puts its text in place of what you selected.
- Snippets set to **Never from typing** work here too, so you can keep a snippet only for this: `otr-(\d+)` returning a link to that ticket never expands while you type, and selecting `OTR-123` anywhere offers to open it.
- The sample now asks for the **snippets** permission, to look up what you selected among your snippets.

## [0.24.0] - 2026-10-12

### Changed

- After a button on the peek panel changes your text, the new text stays selected and the panel stays beside it, so you can press another button on it straight away. This works even when the text changes length.
- Needs Lumi 1.48.0.

## [0.23.0] - 2026-10-11

### Added

- The peek panel has a search field, filled in with the text you selected. Click it and press Return to search the web for it, or change the words first: what you type goes into the field, not over the text you selected. The panel stays up while you type, and goes when you click elsewhere.
- Needs Lumi 1.48.0.

## [0.22.0] - 2026-10-11

### Changed

- The peek panel goes on the side of your selection the pointer is at: below it after you drag down over several lines, above it after you drag up. On a single line it stays above.
- Each shortcut for Peek at the selection can choose **Pointer's side** too, besides Above and Below. It is the new default.
- Needs Lumi 1.48.0.

## [0.21.0] - 2026-10-11

### Added

- The peek panel comes up by itself when you select text with the mouse in any app: drag across it, double-click a word or triple-click a line. It never takes the keyboard, and goes away when you click, type or scroll.
- The sample now asks for the **selection-watch** permission. **See text you select in any app** on the sample's Permissions sheet turns it off; **Peek at the selection** still works from its shortcut and the menu bar.
- Needs Lumi 1.47.0.

## [0.20.0] - 2026-10-11

### Added

- The peek panel has buttons: UPPERCASE, lowercase, Title Case and Sentence case. Pressing one changes the text you selected, in the app you selected it in.
- On text that can't be edited, such as a web page, the panel says so instead of showing the buttons.
- The sample now asks for the **input** permission, which the buttons need to type the change in when an app won't take it otherwise.
- Needs Lumi 1.47.0.

## [0.19.0] - 2026-10-11

### Added

- **Peek at the selection** opens a small panel beside the text you selected, in whatever app holds it: above it, or below when there is no room above. It shows the first words and how many characters you selected, and an arrow pointing at the text. It never takes the keyboard — the app you are in keeps it and its selection — and goes away at your next click, key or scroll anywhere else. Also in the sample's menu bar menu, as **Peek at the Selection**, with a row for each place it can stand.
- Each shortcut for Peek at the selection chooses where the panel stands: by the pointer, at the start, at the end or in the middle of what you selected, and above or below it. A small mark on the panel's edge points at the spot.
- Needs Lumi 1.47.0.

## [0.18.0] - 2026-10-09

### Added

- The background card keeps its page while it is put away: opened again, it is there at once, as you left it — still taller, if you made it so — and says how many times it has been shown since it loaded.
- It is loaded ahead when Lumi starts, so the first opening is as quick — the new **preload** permission, which the sample now asks for. **Load ahead when Lumi starts** on the card turns that on or off — the same switch as **Preload** on the sample's Permissions sheet, and each follows the other.
- Needs Lumi 1.45.0.

## [0.17.0] - 2026-10-07

### Added

- The background card comes back where you left it, at the size you left it, on Lumi 1.40.0 and later. An older Lumi opens it at its corner, as before.

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
