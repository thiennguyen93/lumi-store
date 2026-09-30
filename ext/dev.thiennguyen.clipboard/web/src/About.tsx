// ⌘K › About: the extension's own card, drawn in the panel in place of the
// list and the preview. Its words come from the crate, bundled at build
// time — the manifest's `[extension]` table and CHANGELOG.md — so it says
// what this build is, and asks the extension nothing. Its links go
// through `run-ui`, which holds the addresses; the page only names them.

import { useState } from "react";
import changelog from "../../CHANGELOG.md?raw";
import manifest from "../../manifest.toml?raw";
import { codeRuns, identityOf, parseChangelog, type Release } from "./changelog";
import { BookGlyph, ExtensionIcon, HistoryGlyph, KeyboardGlyph, StoreGlyph } from "./icons";

const me = identityOf(manifest);
const releases = parseChangelog(changelog);

export type AboutLink = "openDocs" | "openStore" | "tour";

export function About({ onLink }: { onLink: (link: AboutLink) => void }) {
  // The newest release, or every one.
  const [all, setAll] = useState(false);
  const shown = all ? releases : releases.slice(0, 1);

  return (
    <section className="about" aria-label={`About ${me.name}`}>
      {/* The card and its notes scroll; the links stay at the foot. */}
      <div className="about-body">
        <header className="about-head">
          <ExtensionIcon />
          <div className="about-title">
            <h1>{me.name}</h1>
            <p>
              Version {me.version} · by {me.author}
            </p>
            <p className="about-id">{me.id}</p>
          </div>
        </header>
        <p className="about-lede">{me.description}</p>
        <div className="about-log">
          {shown.map((release, index) => (
            <ReleaseNotes key={release.version} release={release} newest={index === 0} />
          ))}
        </div>
      </div>
      <nav className="about-links" aria-label="More">
        {releases.length > 1 && (
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setAll(!all)}>
            <HistoryGlyph />
            {all ? "Latest changes only" : "Full changelog"}
          </button>
        )}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onLink("openDocs")}>
          <BookGlyph />
          Docs
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onLink("openStore")}>
          <StoreGlyph />
          Store page
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onLink("tour")}>
          <KeyboardGlyph />
          Welcome tour
        </button>
      </nav>
    </section>
  );
}

function ReleaseNotes({ release, newest }: { release: Release; newest: boolean }) {
  return (
    <article className="about-release">
      <h2>
        {newest ? `What's new in ${release.version}` : release.version}
        {!newest && release.date && <span className="about-date">{release.date}</span>}
      </h2>
      {release.groups.map((group, index) => (
        <div key={index}>
          {group.title && release.groups.length > 1 && <h3>{group.title}</h3>}
          <ul>
            {group.notes.map((note, at) => (
              <li key={at}>
                {codeRuns(note).map((run, i) => (i % 2 ? <code key={i}>{run}</code> : run))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  );
}
