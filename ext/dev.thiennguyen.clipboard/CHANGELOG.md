# Changelog

## [0.68.0] - 2026-10-03

### Added

- Icons beside every row of Clipboard Manager's menu in Lumi's menu bar.

### Changed

- **Pause Recording** in the menu bar reads **Resume Recording** while paused, in place of a tick.
- Needs Lumi 1.34.0.

## [0.67.0] - 2026-10-02

### Added

- Clipboard Manager in Lumi's menu bar menu: **Show Clipboard History**, **Pause Recording**, **Delete All Unpinned…** and **Settings…**.
- **Pause Recording** stops keeping what you copy until you untick it. Nothing copied while paused is recorded.
- **Delete All Unpinned…** opens the panel and deletes there, so ⌘Z still brings everything back.

### Fixed

- The preview's width and split, and what a PDF fits, are kept between openings of the panel. They were never saved before.

### Changed

- Needs Lumi 1.33.0, and declares `menu`, the capability its menu bar rows need. The menu shows nothing you copied.

## [0.66.1] - 2026-10-02

### Changed

- With the panel pinned and you working in another app, Show clipboard history gives it the keyboard back the moment you press it, before the selected item blinks: Clipboard Manager now asks Lumi where the panel stands instead of finding out from the panel. Needs Lumi 1.31.0.

## [0.66.0] - 2026-10-02

### Added

- Two more commands, Hide clipboard history and Toggle clipboard history, for keys of your own in Lumi's Settings. The shortcut the extension comes with stays on Show clipboard history.

### Changed

- Show clipboard history only ever brings the panel up. Pressed while the panel is already up, pinned or not, it no longer puts it away: the panel takes the keyboard back if you were working in another app, and the selected item blinks so you know you can search or move through the list. Escape, Hide or Toggle put it away.

## [0.65.1] - 2026-10-02

### Fixed

- A long copy's scroll bar no longer covers its last letters. Every scroll bar in the preview — the copy, what it expands to, the text read in an image, the list of links — now sits in one line along the right edge.

## [0.65.0] - 2026-10-02

### Added

- Drag the line across the preview up or down to give more room to either side: the picture or the text read in it, or a copy or what it expands to. The line stays where you leave it for both kinds, so it holds still as you move through the list. Double-click the line to put it back where it was.

## [0.64.0] - 2026-10-02

### Added

- With the panel pinned and you working in another app, the shortcut gives the panel the keyboard back where it stands, and the selected item now blinks to say so, so you know you can search or move through the list right away. With the ⌘K menu up, its chosen action blinks instead. Press the shortcut again to put the panel away.

## [0.63.26] - 2026-10-02

### Added

- Copy one of your snippet triggers, such as `;addr`, and the preview shows what it expands to: its web addresses read as plain text and turn into links under the pointer, a button copies it, and clicking its heading folds it away. A snippet that comes out the same every time is remembered with the copy. One that changes, such as a date, is expanded again each time the panel shows it.
- Settings has a new Snippets section. Match snippets switches it on or off. Look in picks the profile you're using (the default), every profile, or Selected Profiles. Once Selected Profiles is chosen, its submenu lists every profile with a search field on top, to find them by name and tick them however many you have. An open panel, pinned or not, follows at once when you switch, rename or remove a profile, change these settings or edit a snippet in Lumi, and a snippet that can change is expanded again each time you come back to it. Needs Lumi 1.31.0.

## [0.62.1] - 2026-10-01

### Fixed

- The ⌘K actions menu's search field fits inside the menu instead of running past its right edge.

## [0.62.0] - 2026-10-01

### Added

- The ⌘K actions menu highlights the letters you typed in each action it found, the way the history search does.

## [0.61.0] - 2026-10-01

### Added

- The ⌘K actions menu takes shorthand: string together the starts of an action's words, as in "delall" for "Delete all…" or "sif" for "Show in Finder". The closest match comes first, right above the search field.

## [0.60.8] - 2026-10-01

### Fixed

- Searching the ⌘K actions menu matches the start of a word: "de" finds the Delete actions, no longer "Show in Finder" for the "de" inside "Finder".

## [0.60.7] - 2026-10-01

### Changed

- The ⌘K actions menu reads from the bottom up: Paste sits right above the search field, the delete actions furthest from it. The arrow keys move the way they point.

## [0.60.6] - 2026-10-01

### Changed

- The ⌘K actions menu has its search field at the bottom, next to the ⌘K that opens it. The field stays in place while you type and the list narrows above it.

## [0.60.5] - 2026-10-01

### Fixed

- The ⌘K actions menu shows all its actions instead of cutting the last one in half. When the panel is too short for them all, the list scrolls, fades at the edge that has more, and the arrow keys keep the chosen action in view.

## [0.60.4] - 2026-10-01

### Changed

- The panel opens faster with a long history: it reads the history once, and brings items kept by older versions up to date only once.

## [0.60.3] - 2026-10-01

### Fixed

- What you copy while the panel is open, pinned or not, shows up in it straight away.

## [0.60.2] - 2026-10-01

### Changed

- A copy's links are found once, when it is copied, instead of each time its preview is shown.

## [0.60.1] - 2026-10-01

### Added

- Links in rich text can be clicked in the preview. Plain text stays plain, to select and copy; its links are listed under it.

## [0.59.0] - 2026-10-01

### Added

- Text and rich text show the links they contain under their preview, each opened in the browser with a click.

### Fixed

- Links in rich text copied from TextEdit or Pages no longer drop out of the preview.

## [0.58.3] - 2026-09-30

### Changed

- The extension's homepage is now its page on lumikeys.app.

## [0.58.2] - 2026-09-30

### Changed

- About's Docs opens this extension's page on lumikeys.app, and Store page opens the extensions list there.

## [0.58.1] - 2026-09-30

### Changed

- About's buttons stay at the bottom of the panel while the changelog scrolls above them.

## [0.58.0] - 2026-09-30

### Added

- About in the ⌘K menu: the extension's version, what's new, the full changelog, and links to the docs, the store page and the Welcome tour, right in the panel.

## [0.57.0] - 2026-09-30

### Added

- Colours written as `rgb()`, `rgba()`, `hsl()` or `hsla()` are recognised as colours.
- A copied colour's preview lists it in the other formats (hex, `rgb()`, `hsl()`) to copy from.

## [0.54.11] - 2026-09-30

### Changed

- Long lists fade at the edge while there is more to scroll.

### Fixed

- The text-recognition panel no longer collapses when it has little to show.

## [0.54.6] - 2026-09-30

### Added

- Each panel remembers how you like PDFs fitted.

## [0.54.2] - 2026-09-30

### Fixed

- ⌘Y expands the preview, so an item pinned to Y moves to another letter.

## [0.53.3] - 2026-09-30

### Added

- A zoomed view for PDF previews.

## [0.52.4] - 2026-09-30

### Changed

- Simpler wording in the Welcome tour.

## [0.52.3] - 2026-09-30

### Added

- ⌘⇧P pins the panel, so it stays open while you paste one item after another.

### Changed

- Pinning an item is ⌘P by default (it was ⌥P).

## [0.51.6] - 2026-09-30

### Changed

- File icons are easier to tell apart in light and dark mode.

## [0.51.5] - 2026-09-30

### Added

- Images in the preview can be dragged into other apps.

## [0.51.4] - 2026-09-30

### Added

- Choosing an app in Settings suggests matches as you type its name or bundle id.

## [0.51.2] - 2026-09-30

### Fixed

- Search no longer loses letter case the first time it reads the history.

## [0.51.1] - 2026-09-30

### Fixed

- Search keeps text cased as it was copied.

## [0.51.0] - 2026-09-30

### Added

- A sixth step in the Welcome tour, on privacy.

## [0.50.0] - 2026-09-30

### Changed

- Searching the text recognised in images is separate from searching what you copied.

## [0.49.1] - 2026-09-30

### Changed

- The Welcome tour has five steps.

### Fixed

- Keyboard focus in the Welcome tour.

## [0.46.15] - 2026-09-30

### Changed

- The Welcome window's example copies lumikeys.app.

## [0.46.14] - 2026-09-30

### Added

- Screenshots for the Extension Store.

## [0.46.13] - 2026-09-29

### Added

- Links in the preview can be clicked.

## [0.46.11] - 2026-09-29

### Changed

- Renamed to Clipboard Manager.
- Better search.

## [0.46.8] - 2026-09-29

### Changed

- The Welcome window is redesigned around a live preview of the panel.

## [0.46.0] - 2026-09-29

### Added

- A Welcome tour.

## [0.45.6] - 2026-09-29

### Changed

- An empty history shows an icon and a clearer layout.

## [0.45.2] - 2026-09-29

### Fixed

- Escape closes an open menu before it closes the panel.

## [0.45.1] - 2026-09-29

### Added

- A Copy path action for files.

## [0.43.0] - 2026-09-29

### Added

- Items can be dragged out of the history into other apps.

## [0.42.0] - 2026-09-29

### Added

- Copies of several files show a list of them in the preview, with highlighting.

## [0.39.0] - 2026-09-29

### Added

- JSON is previewed as a tree, and text files are previewed.

## [0.37.0] - 2026-09-29

### Added

- Previews for copied image files, with their size in pixels and on disk.

## [0.36.0] - 2026-09-29

### Added

- Previews for PDFs.

## [0.30.0] - 2026-09-29

### Added

- Copied files show an icon for their type, their path and their extension.

## [0.28.0] - 2026-09-29

### Added

- The preview shows a copied file's size.
- Each item shows the icon of the app it was copied from, with the name on hover.

## [0.26.2] - 2026-09-29

### Added

- Save image as… in the actions menu for images. Needs Lumi 1.26.0.

### Fixed

- Rich text previews no longer go blank or flash as plain text.

## [0.25.2] - 2026-09-29

### Fixed

- Text recognised in images is left out of search when reading images is off.

## [0.23.0] - 2026-09-29

### Added

- The text recognised in a copied image is shown in its preview.

## [0.22.1] - 2026-09-29

### Added

- The key used for pinning can be changed.

## [0.21.0] - 2026-09-29

### Changed

- Deleting an item takes ⌘⌥⌫, so it is not done by accident.

## [0.19.0] - 2026-09-29

### Added

- A Settings page, and a choice of how long history is kept.

## [0.15.1] - 2026-09-29

### Added

- Rich text is previewed with its formatting.

## [0.13.1] - 2026-09-29

### Changed

- The About page is now the Dashboard tab.

## [0.12.0] - 2026-09-29

### Added

- A choice of glass material for the panel.

## [0.10.0] - 2026-09-29

### Added

- A menu entry and a shortcut for Settings.

## [0.9.3] - 2026-09-29

### Added

- Text in copied images is recognised, so they can be found by what they say.
- Clear all.
- Actions for links and files.

## [0.8.0] - 2026-09-29

### Added

- Undo for deleted items, which also restores their pins.

## [0.5.2] - 2026-09-29

### Added

- First release: a history of what you copy — text, links, images and files — with a panel to search it and paste an item back.
