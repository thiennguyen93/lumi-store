# Vietnamese Typing

A Lumi extension for typing Vietnamese with Telex or VNI in every app, on
Lumi's `text-input` primitive (Lumi 1.61.0). Lumi knows no language: every
key of the word reaches this extension's sealed run, which replays the word
through the engine and answers how the text before the caret changes.

The engine is the core of [Gõ Nhanh](https://github.com/khaphanspace/gonhanh.org),
BSD-3-Clause — see `THIRD-PARTY-NOTICES.md`, which also ships in the package
as `ui/THIRD-PARTY-NOTICES.txt`.

```bash
cargo test
cargo build --release --target wasm32-wasip2
```
