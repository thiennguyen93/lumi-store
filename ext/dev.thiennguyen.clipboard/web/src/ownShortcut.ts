// Recording and writing the extension's own global key — its `[[shortcut]]`
// — from a page: the Settings tab's row and the Welcome tour's shortcut step
// both. Lumi keeps the key, in every profile (`PUT /__lumi__/shortcuts`);
// this is the one place a page here records it.
//
// While it records, Lumi lets go of every global shortcut
// (`POST /__lumi__/shortcut-recording`, Lumi 1.45), so pressing a
// combination something already holds — ⇧⌘C itself — reaches the page
// instead of opening the panel. Lumi ends that by itself when the page loses
// the keyboard or after 30 seconds, and says so with
// `lumi:shortcut-recording-ended`; the recorder stops with it. On an older
// Lumi the ask is a 404 and the recorder works as it always did.

import { useCallback, useEffect, useState } from "react";
import { beginRecording, endRecording, Held, message, setShortcut, shortcuts } from "./bridge";
import { acceleratorGlyphs, acceleratorOf, acceleratorRefusal } from "./keys";
import { takeable } from "./ownKey";
import type { ExtensionShortcut, ShortcutHolder } from "./types";

/** A key someone holds, pressed or asked for: offered to take with `replace`. */
export interface HeldKey {
  key: string;
  holders: ShortcutHolder[];
  said: string;
}

export interface OwnShortcut {
  /** `undefined` while it is read; `null` when Lumi has none for `command`. */
  own: ExtensionShortcut | null | undefined;
  /** Lumi's Shortcuts switch, which every global key waits on. */
  on: boolean;
  recording: boolean;
  /** Why the last press or write did not land, or "". */
  said: string;
  held: HeldKey | null;
  busy: boolean;
  /** Record the next combination pressed — a second call stops. */
  record: () => void;
  stop: () => void;
  /** Arm `key`, or clear with null; `replace` takes it off its holders. */
  write: (key: string | null, replace?: boolean) => Promise<void>;
  /** Leave a held key with its holders. */
  keepTheirs: () => void;
}

export function useOwnShortcut(command: string): OwnShortcut {
  const [own, setOwn] = useState<ExtensionShortcut | null | undefined>(undefined);
  const [on, setOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [said, setSaid] = useState("");
  const [held, setHeld] = useState<HeldKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    shortcuts()
      .then((all) => {
        setOn(all.on);
        setOwn(all.ess?.find((one) => one.command === command) ?? null);
      })
      .catch(() => setOwn(null));
  }, [command]);

  const write = useCallback(
    async (key: string | null, replace = false) => {
      setBusy(true);
      setSaid("");
      try {
        setOwn(await setShortcut(command, key, replace));
        setHeld(null);
      } catch (err) {
        // Another extension's key comes back as a holder too, and is not
        // offered: Lumi would refuse the replace.
        if (key && err instanceof Held && takeable(err.holders)) {
          setHeld({ key, holders: err.holders, said: err.message });
        } else {
          setHeld(null);
          setSaid(message(err));
        }
      } finally {
        setBusy(false);
      }
    },
    [command],
  );

  useEffect(() => {
    if (!recording) return;
    let live = true;
    beginRecording()
      .then((refused) => {
        if (refused && live) {
          setSaid(refused);
          setRecording(false);
        }
      })
      .catch(() => {});
    const take = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const got = acceleratorOf(event);
      if (!got) return; // a modifier on its own, still being held
      const why = acceleratorRefusal(got);
      if (why) {
        setSaid(`${acceleratorGlyphs(got)}: ${why}`);
        return;
      }
      setRecording(false);
      void write(got);
    };
    // Lumi ended it — the page lost the keyboard, 30 seconds passed, or
    // Lumi's own recorder started — and its shortcuts are back: a key
    // pressed now would run, not be recorded.
    const ended = () => setRecording(false);
    window.addEventListener("keydown", take, true);
    window.addEventListener("lumi:shortcut-recording-ended", ended);
    return () => {
      live = false;
      window.removeEventListener("keydown", take, true);
      window.removeEventListener("lumi:shortcut-recording-ended", ended);
      void endRecording().catch(() => {});
    };
  }, [recording, write]);

  const record = useCallback(() => {
    setSaid("");
    setHeld(null);
    setRecording((was) => !was);
  }, []);
  const stop = useCallback(() => setRecording(false), []);
  const keepTheirs = useCallback(() => setHeld(null), []);

  return { own, on, recording, said, held, busy, record, stop, write, keepTheirs };
}
