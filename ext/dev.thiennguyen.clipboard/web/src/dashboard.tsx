import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { call, shortcuts } from "./bridge";
import { CopyGlyph } from "./icons";
import { acceleratorGlyphs } from "./keys";
import { KEEP_LABELS, type Stats } from "./types";
import "./pages.css";

// Same as the panel: `pnpm dev` answers the bridge from a mock, which the
// shipped bundle does not carry. `?empty` shows a fresh install.
if (import.meta.env.DEV) {
  await import("./dev/mock");
}

const DAY = 86_400_000;

/** How long the oldest row has been kept: "Today", "5 d", "3 mo". */
function age(since: number): string {
  const days = Math.floor((Date.now() - since) / DAY);
  if (days < 1) return "Today";
  if (days < 60) return `${days} d`;
  return `${Math.floor(days / 30)} mo`;
}

function Dashboard() {
  // `undefined` while asking, `null` when the ask failed: both draw the
  // tiles with dashes, so an empty history is only claimed once it is known.
  const [stats, setStats] = useState<Stats | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const take = (next: Stats) => {
      if (alive) setStats((was) => (was && same(was, next) ? was : next));
    };
    // Asked once, and again whenever Settings comes forward.
    const ask = () =>
      call({ kind: "stats" }).then(take, () => alive && setStats((was) => was ?? null));
    // Told by the extension after each copy, pin or delete — `ui.post`.
    // Lumi refuses this page's own `call` while Settings is behind the app
    // being copied in, so this is how the counts move while you work.
    const told = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isStats(detail)) take(detail);
    };
    ask();
    window.addEventListener("focus", ask);
    window.addEventListener("lumi:message", told);
    return () => {
      alive = false;
      window.removeEventListener("focus", ask);
      window.removeEventListener("lumi:message", told);
    };
  }, []);

  return <main>{stats?.kept === 0 ? <Welcome /> : <Tiles stats={stats ?? null} />}</main>;
}

/** A post is the extension's own JSON; checked anyway, so a message of
 *  another shape — a later version's — is ignored rather than drawn. */
function isStats(value: unknown): value is Stats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ["kept", "pinned", "images"].every((k) => typeof v[k] === "number") &&
    (v.since === null || typeof v.since === "number")
  );
}

function same(a: Stats, b: Stats): boolean {
  return (
    a.kept === b.kept &&
    a.keep === b.keep &&
    a.pinned === b.pinned &&
    a.images === b.images &&
    a.since === b.since
  );
}

function Tiles({ stats }: { stats: Stats | null }) {
  return (
    <div className="tiles">
      <div className="tile">
        <span className="label">Kept</span>
        <span className="value">
          {stats ? stats.kept : "—"}
        </span>
        {stats && <span className="of">for {KEEP_LABELS[stats.keep] ?? stats.keep}</span>}
      </div>
      <div className="tile">
        <span className="label">Pinned</span>
        <span className="value">{stats ? stats.pinned : "—"}</span>
      </div>
      <div className="tile">
        <span className="label">Images</span>
        <span className="value">{stats ? stats.images : "—"}</span>
      </div>
      <div className="tile">
        <span className="label">Since</span>
        <span className="value">{stats?.since != null ? age(stats.since) : "—"}</span>
      </div>
    </div>
  );
}

function Welcome() {
  // The extension's own key, as the install left it: the second step names
  // it when it is armed, and sends people to the Settings tab when not.
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    shortcuts()
      .then((all) => setKey(all.ess?.find((one) => one.command === "open")?.key ?? null))
      .catch(() => setKey(null));
  }, []);
  return (
    <div className="welcome">
      <span className="mark"><CopyGlyph /></span>
      <div>
        <p className="title">Copy something to start</p>
        <p className="body">Your history is empty. Anything you copy from now on shows up here.</p>
        <ol>
          <li>Copy as usual — text, links, colours, files, screenshots</li>
          <li>
            {key ? (
              <>
                Press <kbd>{acceleratorGlyphs(key)}</kbd> anywhere
              </>
            ) : (
              <>
                Give <strong>Show clipboard history</strong> a key on the Settings tab, then press it
              </>
            )}
          </li>
          <li>
            Type to search, <kbd>↩</kbd> pastes, <kbd>⌥</kbd><kbd>↩</kbd> as plain text
          </li>
        </ol>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Dashboard />
    </StrictMode>,
  );
}
