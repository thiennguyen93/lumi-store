// The extension's own global key — its `[[shortcut]]`, which Lumi arms at
// install, in every profile, and lets the extension change over
// `PUT /__lumi__/shortcuts` — as words: the line under its row in Settings,
// and who a key it wants is taken off. Nothing but types imported, so
// `node --test` reads it as it is.

import type { ExtensionShortcut, ShortcutHolder } from "./types";

/** The line under the key's row, and whether it says something is wrong. */
export interface Hint {
  text: string;
  bad: boolean;
}

/** What the row says under the key: where it works, or why there is none.
 *  `on` is Lumi's Shortcuts switch, which every global key waits on;
 *  `declared` the manifest's key as glyphs (`acceleratorGlyphs`). */
export function ownKeyHint(own: ExtensionShortcut, on: boolean, declared: string): Hint {
  if (own.key) {
    if (!on) return { text: "Shortcuts are switched off in Lumi", bad: true };
    return own.key === own.declared
      ? { text: "In every profile, from any app", bad: false }
      : { text: `In every profile, from any app · instead of ${declared}`, bad: false };
  }
  if ((own.state === "taken" || own.state === "invalid") && own.reason) return { text: own.reason, bad: true };
  return { text: "No key yet — click to record one", bad: false };
}

/** Whether a key `holders` hold may be taken off them with `replace`: a
 *  person's row or Lumi's own, never another extension's — Lumi refuses
 *  that, and the other extension's page is where it changes. */
export function takeable(holders: readonly ShortcutHolder[]): boolean {
  return holders.length > 0 && holders.every((holder) => holder.kind !== "extension");
}

/** Who a key comes off, in a sentence: "“Paste” in the Work profile and
 *  Lumi's own Show Lumi". */
export function holdersText(holders: readonly ShortcutHolder[]): string {
  const names = holders.map((holder) =>
    holder.kind === "shortcut"
      ? holder.name
        ? `“${holder.name}” in the ${holder.profileName} profile`
        : `a shortcut in the ${holder.profileName} profile`
      : holder.kind === "app"
        ? `Lumi's own ${holder.label}`
        : `${holder.extensionName}'s ${holder.commandLabel}`,
  );
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
