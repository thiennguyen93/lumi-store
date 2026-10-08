# The store's pictures

Four pictures at 1280 × 800, drawn by the preview's promo page
(`/__promo__/?shot=N`, from `promo.json`) around the game as the browser
preview runs it, in a window with Lumi's unified title bar.

`scenes/shot.js` is one scene for all four. Each run is a fresh Chrome
profile, so the scene builds what the picture needs from nothing:

- **Songs**, added the way a person adds them: eight Openverse entries
  (Jamendo, CC BY or CC BY-SA), downloaded through the preview's bridge,
  then read and charted in the page. The network has to reach Jamendo.
- **Collections, favourites and a week's progress** (settings, some best
  scores, a six-day streak), through the library's calls and the page's
  own saved progress.
- **A player** for pictures 1 and 4: real key events at each note of the
  chart the game plays, a little late on average, with a note dropped now
  and then. The game judges them as it judges anybody.

From lumi-store, with the promo server up (`rhythm-promo`, port 5196, in
`.claude/launch.json`):

    while read -r n name; do
      node scripts/screenshot.mjs "http://127.0.0.1:5196/__promo__/?shot=$n" \
        "ext/dev.thiennguyen.rhythm/shots/$name.png" \
        ext/dev.thiennguyen.rhythm/shots/scenes/shot.js 1280 800 1 </dev/null
    done <<'EOF'
    1 1-play
    2 2-library
    3 3-free-music
    4 4-results
    EOF

Each run says "ok", or the step it could not get to. Pictures 1 and 4 play
through the song on the audio clock, so they take as long as the song
does: under two minutes each. Restart the promo server after editing
`promo.json`; it reads the spec once.
