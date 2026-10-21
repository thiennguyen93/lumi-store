# Lumi Gõ tiếng Việt

A Lumi extension for typing Vietnamese with Telex or VNI in every app, on
Lumi's `text-input` primitive (Lumi 1.61.0). Lumi knows no language: every
key of the word reaches this extension's sealed run, which replays the word
through the engine and answers how the text before the caret changes.

The engine is the core of [Gõ Nhanh](https://github.com/khaphanspace/gonhanh.org),
BSD-3-Clause, and it carries a Vietnamese word list from the GNU Aspell
dictionary, under the GPL — see `THIRD-PARTY-NOTICES.md`, which also ships in
the package as `ui/THIRD-PARTY-NOTICES.txt`.

```bash
cargo test
cargo build --release --target wasm32-wasip2
```

## License

Copyright (C) 2026 Thien Nguyen.

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See `LICENSE` (shipped as `ui/LICENSE.txt`) for details.
