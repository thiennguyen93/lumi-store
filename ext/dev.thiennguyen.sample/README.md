# The sample extension (and the SDK, for now)

First-party and in-tree, where a third-party submission is a pinned
submodule: the promise the registry keeps is that the reviewed source is
the shipped artifact, and for the store's own reference extension the
review history *is* this repository's.

`api/` is `lumi-extension-api` — here because `sample/` depends on it by
path, and because this is currently where extension developers can read
it. Its canonical home is the Lumi repository (whose CI holds the WIT
world byte-identical to the host's); changes flow one way, Lumi → here,
until the crate is on crates.io and this copy becomes a plain dependency.
