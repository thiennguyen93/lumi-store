# The sample extension (and the store's copy of the SDK)

First-party and in-tree, where a third-party submission is a pinned
submodule: the promise the registry keeps is that the reviewed source is
the shipped artifact, and for the store's own reference extension the
review history *is* this repository's.

`api/` is `lumi-extension-api`, the crate extension developers take from
crates.io (`lumi-extension-api = "0.3"`). Its canonical home is the Lumi
repository (whose CI holds the WIT world byte-identical to the host's);
changes flow one way, Lumi → here, and each crates.io release is published
from this copy at a tag, `api-v<version>`.

It stays here, published or not, because the store's own extensions build
against it by path — `sample/`, the other in-tree extensions and the
private ones alike. Every check and every publish builds each listed
extension, a version already served included, so a sync from Lumi is
compiled against all of them before the release cut from it goes out, and
a store change can call an interface Lumi has added before crates.io has
it.
