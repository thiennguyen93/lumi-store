// The extension's CHANGELOG.md, read for the panel's About: Keep a
// Changelog's shape, the one the store's `publish.py` holds every release
// to — `## [version] - date`, `### Added` and the rest, `- ` lines. Parsed
// into plain data and drawn by React as text, so nothing in the file is
// ever markup on the page; a backtick span is the one thing kept.

export interface Release {
  version: string;
  date: string;
  groups: { title: string; notes: string[] }[];
}

const RELEASE = /^## \[([^\]]+)\](?:\s*-\s*(\S+))?/;

/** Newest first, as the file is written. */
export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  for (const line of text.split(/\r?\n/)) {
    const release = RELEASE.exec(line);
    if (release) {
      releases.push({ version: release[1]!, date: release[2] ?? "", groups: [] });
      continue;
    }
    const at = releases.at(-1);
    if (!at) continue;
    if (line.startsWith("### ")) {
      at.groups.push({ title: line.slice(4).trim(), notes: [] });
    } else if (/^[-*] /.test(line)) {
      if (!at.groups.length) at.groups.push({ title: "", notes: [] });
      at.groups.at(-1)!.notes.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line)) {
      // A note wrapped onto the next line.
      const notes = at.groups.at(-1)?.notes;
      if (notes?.length) notes[notes.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}

/** A note as runs of text, odd ones inside backticks. */
export function codeRuns(note: string): string[] {
  return note.split("`");
}

export interface Identity {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

/** The `[extension]` table's words, from manifest.toml's text: the first
 *  of each key, which is the table's — it comes first in the file. Only
 *  plain `key = "value"` lines, which is how the manifest writes them. */
export function identityOf(manifest: string): Identity {
  const key = (name: string) => new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m").exec(manifest)?.[1] ?? "";
  return { id: key("id"), name: key("name"), version: key("version"), author: key("author"), description: key("description") };
}
