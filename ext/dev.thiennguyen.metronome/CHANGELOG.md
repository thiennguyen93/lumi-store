# Changelog

## [0.3.0] - 2026-10-31

### Changed

- The tempo counts the beat you hear, the time signature's bottom note: 7/8 at 132 is now 132 eighth notes a minute, where it was 264. Tapping along with the clicks sets the tempo they are at, and going from 4/4 to 6/8 keeps the clicks at the same speed. What you had set and your presets are carried over so they sound as they did, up to 300.
- Allegro, Andante and the rest are judged in quarter notes, so 6/8 at 240 reads Moderato.

### Fixed

- A new tempo is heard from the next click. Going from 20 to 120 in 2/2 used to wait for the click already planned, seconds away.
- Changing the clicks in a beat while it plays keeps the beat where it is: it is no longer struck again halfway through, and the rest of the beat falls on the new clicks.
- Taking beats out of the bar while it plays lets the beat finish before the next bar's first beat, instead of accenting halfway through it.

## [0.2.4] - 2026-10-31

### Fixed

- Your presets are no longer lost when the Metronome tab opens while Lumi is busy or Settings is behind another app. The tab waits for what you kept, instead of starting empty and saving that over it.
- A change made while Settings is behind another app, such as turning Orbit's ring, is kept: it is sent again until Lumi takes it, instead of being dropped.

## [0.2.3] - 2026-10-29

### Fixed

- Beat Pads: − and + and the tempo slider stay where they are as the tempo goes from two figures to three, from 99 to 100 or 20 to 250. In every theme the tempo now keeps the width of 300, the widest it can be.

## [0.2.2] - 2026-10-29

### Changed

- Beat Pads: the volume now sits at the end of the Sound heading, beside the sounds it sets, instead of in a row of its own. Time signature and Subdivision share one row.

## [0.2.1] - 2026-10-29

### Fixed

- In Orbit, the blue ring round the dial when it has the keyboard is whole again; its left side was cut off.

## [0.2.0] - 2026-10-29

### Added

- Type the tempo in: double-click the number, in any theme, type a tempo and press Return. Escape leaves it as it was, and ↑ and ↓ step what you typed (hold ⇧ for 10). In Orbit, Return on the ring does the same.

## [0.1.0] - 2026-10-29

### Added

- A metronome in a tab of its own here in Lumi. Set the tempo from 20 to 300 beats a minute with − and + (hold ⇧ for 10), the slider, the arrow keys, or by tapping it in.
- Time signatures from 2/4 to 12/8, or one of your own: any number of beats of half, quarter, eighth or sixteenth notes.
- Subdivisions: two, three or four clicks inside each beat.
- Eight sounds — Click, Woodblock, Beep, Wind-up, Cowbell, Hi-hat, Sticks and Clave — heard as you pick one when the metronome is stopped, and simply from the next click when it is playing.
- An accent on the first beat, louder and higher. With Beat Pads, any beat can be accented or left silent.
- Presets: save what is set now with one click and come back to it with another. Name one by double-clicking it; rename, replace or delete one from its menu, and undo a delete.
- Four themes, chosen in the Settings tab or at the foot of the Metronome tab: Classic, a wind-up pendulum; Orbit, a ring; Beat Pads; and Simple.
- Space starts and stops, T taps the tempo, and Reduce Motion and Increase Contrast are followed.
