# Changelog

## [0.80.1] - 2026-10-05

### Changed

- In Settings, **Confirm it's you before showing** is greyed out while **Lock history** is on, and says "Lock history already asks before anything is shown". A locked history already asks "Is it you?" before you see anything, and that answer covers showing items too, so the setting did nothing alongside it. Its value is kept, and it works again once Lock history is off. It now sits under **Lock again after panel closes**.
- With **Lock history** on, turning privacy mode off no longer asks "Is it you?": the panel itself still asks before it shows anything.
- The Welcome tour's Touch ID step no longer offers **Ask before showing** once your history is locked.

## [0.80.0] - 2026-10-05

### Changed

- With **Confirm it's you before showing** on, turning privacy mode off asks "Is it you?" first, from Settings, from Lumi's menu bar or with the **Toggle privacy mode** key. Someone at your Mac can no longer switch it off to see your previews. If you cancel, privacy mode stays on. Turning it on never asks.

## [0.79.0] - 2026-10-05

### Changed

- **Cover again after panel closes** (was **Cover again after**) now counts from when the panel closes. Reopen the panel within that time and what you showed is still shown. While the panel is open, nothing is covered again by itself, and a pinned panel stays as it is when you switch to another app. The choices are **Immediately** (the new default), 30 seconds, 1 minute and 5 minutes.
- **Lock again after panel closes** (was **Lock again**) now counts from when the panel closes, not from when you unlocked. While the panel is open, it stays unlocked. The choices are **Immediately**, 1 minute, 5 minutes and 15 minutes.
- **Lock again after panel closes** is greyed out while **Lock history** is off.
- Needs Lumi 1.37.0 or later, which tells the extension when the panel closes.

## [0.78.1] - 2026-10-05

### Changed

- In Settings, the settings that only act on covered previews (**Show or hide content**, **Show or hide all**, **Cover again after** and **Confirm it's you before showing**) are greyed out while privacy mode is off, and say "Works while privacy mode is on". They keep their values, and become available again when privacy mode is turned on.

## [0.78.0] - 2026-10-05

### Changed

- Privacy mode can no longer be turned on or off from the panel. The eye in the panel's title bar now only shows that privacy mode is on, and **⌘K** no longer offers **Turn on privacy mode** or **Turn off privacy mode**. Turn it on or off in the extension's Settings tab, from Lumi's menu bar, or with the **Toggle privacy mode** key. Showing covered content in the panel works as before.

## [0.77.2] - 2026-10-05

### Fixed

- **Copy all** in the Math section has its copy icon and lines up with the cards under it, instead of running into the preview's right edge.

## [0.77.1] - 2026-10-05

### Fixed

- Rich text copied while 0.76.0 was installed now shows its **Math** section too. Those items had been marked as having no math, and copying the same text again did not look again. They are worked out the first time you preview them, and their row shows the answer from then on.

## [0.77.0] - 2026-10-05

### Added

- Rich text copies get the **Math** section too. The math is read from the copy's text and marked where it is written in the formatted preview, even when it runs across bold, italic or coloured words. The row in the list shows its answer, as for plain text.

## [0.76.0] - 2026-10-05

### Added

- Math in copied plain text is worked out in the preview. Under the text, a **Math** section shows each sum with its result (`1 + 2 + 5 + 10 = 18`), each equation in one unknown of degree one or two solved (`x² − 5x + 6 = 0` gives `x = 2` and `x = 3`, with exact roots like `2 ± √3` and complex ones), each written equality checked as true or false, and each `15% of 200` taken. Every result is typeset, and a click copies it; **Copy all** copies every answer. Where each one is written is marked in the text, and the row in the list shows its answer (`= 18`), or how many there are.
- Dates, times, phone numbers, version numbers, ranges like `1-2` and sizes like `1920x1080` are left alone.

## [0.75.3] - 2026-10-05

### Fixed

- A pinned panel no longer locks your history again when you switch to another app. With **Lock again** set to **When the panel closes**, a pinned panel in the background has not closed, so it stays unlocked until you close it. Lock it by hand with **Lock history now** in **⌘K**, or pick one of the timed **Lock again** choices. Privacy mode still covers previews when you switch away, and with history unlocked, showing one again doesn't ask "Is it you?".

## [0.75.2] - 2026-10-05

### Fixed

- With **Lock history** on, the panel no longer flashes the open history's search box, filters and paste keys before it shows it is locked. Until the panel knows whether your history is locked, it shows an empty frame where nothing can be typed or pasted, then the lock card or the history.

## [0.75.1] - 2026-10-05

### Fixed

- **Lock history** no longer locks again right after you confirm it's you, and an item shown after "Is it you?" no longer covers itself again a moment later. After the dialog answers, Lumi briefly loses the keyboard and takes it straight back, and the panel was treating that as you leaving. Now only the keyboard staying away counts as leaving (a pinned panel still locks and covers itself when you switch apps), and answering the dialog never counts.

## [0.75.0] - 2026-10-05

### Added

- The Welcome tour has a Touch ID step: the panel opens locked, macOS asks "Is it you?", and the history opens behind it. Buttons there lock your history or ask before showing, straight away; on a Lumi older than 1.36 the step says what it needs instead.

## [0.74.0] - 2026-10-05

### Added

- The Welcome tour has a step on privacy mode: the panel covers a budget, shows it with your key, shows a colour that is never covered, shows everything at once and covers it all again. A button there turns privacy mode on, and the keys it names are the ones you set.

## [0.73.0] - 2026-10-05

### Added

- **Confirm it's you before showing.** In privacy mode, the first item you show asks macOS's "Is it you?" — Touch ID, your Apple Watch or your password. After that, showing more items, or all of them, does not ask again until they are covered again.
- **Lock history.** The panel opens locked: no list, no preview and nothing to paste until you confirm it's you. It asks as soon as the panel opens; **Cancel** leaves an **Unlock** button. Choose under **Lock again** whether it locks every time the panel closes or a while after you unlock, and lock it at once with **Lock history now** in **⌘K**.
- Turning either of them off in Settings asks "Is it you?" first, so someone at your Mac cannot switch them off.
- Both need Lumi 1.36. On an older Lumi the switches say so, and nothing else changes.

## [0.72.1] - 2026-10-05

### Changed

- Privacy mode leaves colours uncovered. A colour's row already shows its whole value and its swatch, so covering its preview kept nothing private and only cost a press. Everything else is covered as before.

## [0.72.0] - 2026-10-05

### Added

- Show every item at once in privacy mode with **⌥⇧⌘H**, instead of showing them one by one: they stay shown until the panel covers them again, and the same key covers them all. **⇧⌘H** still covers or shows the selected item on its own. Also in the **⌘K** menu, as **Show all content** and **Hide all content**.
- Choose your own key for it under **Privacy** in Settings, next to the key for one item. A key another of the panel's shortcuts holds is refused with what it does.

## [0.71.1] - 2026-10-05

### Changed

- The key that shows or hides an item is set under **Privacy** in Settings, next to **Privacy mode**, instead of under **Shortcuts**.

### Fixed

- **Reset** no longer shows beside a shortcut that is already its default.

## [0.71.0] - 2026-10-05

### Added

- Choose your own key for showing and hiding an item in privacy mode in Settings, the way you choose Pin's. It is ⇧⌘H until you change it, and a key the panel already uses — Pin's among them — is refused with what it does.

### Fixed

- A Pin key held with ⇧, such as ⇧⌘K, no longer opens the actions menu or does what the key without ⇧ does: the keys you set are answered first.

## [0.70.1] - 2026-10-05

### Fixed

- The ninth pinned item could be given the letter K, but **⌘K** always opens the actions menu, so that item could never be pasted with its key. Pins skip K now, and an item already pinned to K moves to the first free letter when the panel opens.

## [0.70.0] - 2026-10-05

### Added

- Privacy mode. While it is on, the preview of every item is covered until you show it, so whatever you copied is not on screen just because the selection landed on it. Click the cover or press **⌘⇧H** to show an item; it stays shown while you move around the list, and **⌘⇧H** covers it again. Everything is covered again when the panel closes, when a pinned panel loses the keyboard to another app, and after a minute with nothing done in the panel (**Cover again after** in Settings).
- Turn privacy mode on or off with the eye in the panel's title bar, from **⌘K**, from **Turn On Privacy Mode** in Lumi's menu bar menu, in Settings, or with a key of your own for the new **Toggle privacy mode** command — so it can be turned on before the panel is ever opened.
- A covered item can still be pasted, dragged out, copied, pinned and deleted. The list itself is unchanged: titles, thumbnails and search matches still show.

## [0.69.1] - 2026-10-04

### Fixed

- "Clipboard Manager is already doing 4 things at once" no longer turns up when you move through the list quickly, or while the panel is reading the text in your images. The preview, and the words on a picture, are now asked for one at a time and only for the row you stopped on; reading images steps aside whenever you do something. A request Lumi turns away because the extension is full is asked again for a moment before it is given up on.

## [0.69.0] - 2026-10-03

### Added

- Select text right on a copied image in the preview: press on a word and drag across the words you want, or double-click a line. **⌘C** or **Copy** copies just those words; **⎋** lets them go. A press between words still drags the image out.

### Fixed

- Images whose text was never read are read now, when the panel opens or when **Search text in images** is turned on, so every image can be found by its words. This covers images copied while that setting was off, while Lumi was quitting, or in a quick run of copies.

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
