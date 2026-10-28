// `pnpm dev` only: Lumi's Settings window drawn by hand, at its own size
// (820 × 817), open on this extension's page, with the real Metronome page
// in an iframe where Lumi puts its child webview. The frame wears App.css,
// the page lumi.css alone, as in Lumi.
//
// The tabs are Lumi's order: the extension's `[[page]]` first, then
// Settings and About. Settings is the extension's own page too
// (`[tabs.settings] page`), so both are iframes where Lumi puts its child
// webviews; About is Lumi's, drawn here by hand from the manifest.
//
// Leaving the Metronome tab unmounts the iframe, which is what Lumi does
// too — `ExtensionsPane` keys the page on its tab, so leaving the tab closes
// it — and so the mock stops the sound exactly where the real one would,
// and the page reads the theme afresh each time it opens.

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  Puzzle,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
  MousePointerClick,
  TextQuote,
} from "lucide-react";
import icon from "../../../icon.svg?url";
import "./mock.css";

type Tab = "metronome" | "settings" | "about";
type Theme = "light" | "dark";

const NAV = [
  { label: "General", Icon: Settings2 },
  { label: "Shortcuts", Icon: Keyboard },
  { label: "Snippets", Icon: TextQuote },
  { label: "Flows", Icon: Workflow },
  { label: "Hyper key", Icon: Zap },
  { label: "Double tap", Icon: MousePointerClick },
  { label: "Extensions", Icon: Puzzle, on: true },
  { label: "AI", Icon: Sparkles },
  { label: "About", Icon: Info },
];

const SUMMARY =
  "A metronome in Lumi's Settings. Pick a tempo — or tap it in — a time signature, a sound and a volume, and accent the first beat of every bar so you always know where the one is. Notes are placed on the Mac's audio clock, so the beat stays steady however busy the Mac is. Nothing leaves this Mac, and it asks for nothing.";

function read<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const value = localStorage.getItem(key);
    if (value && allowed.includes(value)) return value as T;
  } catch {
    // The default is fine.
  }
  return fallback;
}

function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Lasts the page.
  }
}

function Mock() {
  const [theme, setTheme] = useState<Theme>(() => read("metronome.mock.appearance", "light", ["light", "dark"]));
  const [tab, setTab] = useState<Tab>("metronome");
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    keep("metronome.mock.appearance", theme);
  }, [theme]);


  return (
    <div className="mk">
      <header className="mk-bar">
        <div className="mk-title">
          <strong>Metronome</strong>
          <span>mock · the theme is on the Settings tab and at the page's foot</span>
        </div>
        <div className="mk-variants mk-theme" role="radiogroup" aria-label="Appearance">
          {(["light", "dark"] as const).map((one) => (
            <button key={one} type="button" role="radio" aria-checked={theme === one} className={theme === one ? "on" : ""} onClick={() => setTheme(one)}>
              {one === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </header>

      <div className="mk-window">
        <div className="mk-titlebar">
          <span className="mk-light red" />
          <span className="mk-light yellow" />
          <span className="mk-light green" />
        </div>
        <aside className="sidebar mk-sidebar">
          {NAV.map(({ label, Icon, on }) => (
            <button key={label} type="button" className={`nav${on ? " on" : ""}`}>
              <Icon size={16} strokeWidth={1.7} />
              {label}
            </button>
          ))}
        </aside>
        <main className="mk-content">
          <div className="mk-back">
            <button type="button" className="mk-back-button">
              <ChevronLeft size={16} strokeWidth={2} />
              Installed
            </button>
          </div>
          <div className="ext-detail fill mk-detail">
            <div className="ext-detail-head">
              <span className="ext-mark" style={{ width: 64, height: 64 }}>
                <img src={icon} width={64} height={64} alt="" />
              </span>
              <div className="grow">
                <h2 className="ellipsis">Metronome</h2>
                <p className="ext-detail-desc">A steady beat to practise with: tempo, time signature, sound and an accented first beat.</p>
                <p className="small ext-detail-meta">
                  <span className="muted">0.1.0</span>
                  <span className="ext-meta-dot">·</span>
                  <span className="muted">by Thien Nguyen</span>
                  <span className="ext-meta-dot">·</span>
                  <button type="button" className="link ext-reach-link">
                    <ShieldCheck size={13} strokeWidth={1.8} />
                    No permissions
                  </button>
                  <span className="ext-meta-dot">·</span>
                  <button type="button" className="link ext-uninstall-link">
                    Uninstall…
                  </button>
                </p>
              </div>
              <div className="ext-detail-controls">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  className={`switch${enabled ? " on" : ""}`}
                  onClick={() => setEnabled(!enabled)}
                >
                  <span />
                </button>
              </div>
            </div>

            <div className="ext-tabs" role="tablist">
              {(["metronome", "settings", "about"] as const).map((one) => (
                <button
                  key={one}
                  type="button"
                  role="tab"
                  aria-selected={tab === one}
                  className={`store-tab${tab === one ? " on" : ""}`}
                  onClick={() => setTab(one)}
                >
                  {one === "metronome" ? "Metronome" : one === "settings" ? "Settings" : "About"}
                </button>
              ))}
            </div>

            <div className="ext-detail-body">
              {tab === "metronome" ? (
                <iframe
                  key={`${theme}:${enabled}`}
                  className={`mk-page${enabled ? "" : " off"}`}
                  title="Metronome"
                  src={`/metronome.html?theme=${theme}`}
                />
              ) : tab === "settings" ? (
                // The extension's own page in Lumi's Settings tab
                // (`[tabs.settings] page`), a child webview as the
                // Metronome tab's is.
                <iframe
                  key={`${theme}:${enabled}`}
                  className={`mk-page${enabled ? "" : " off"}`}
                  title="Metronome settings"
                  src={`/settings.html?theme=${theme}`}
                />
              ) : (
                <div className="page-body mk-about">
                  <p>{SUMMARY}</p>
                  <section className="section">
                    <h3>
                      <button type="button" className="page-fold" aria-expanded="true">
                        <span className="move-twist open">
                          <ChevronRight size={13} strokeWidth={2.2} />
                        </span>
                        Package
                      </button>
                    </h3>
                    <dl className="ext-facts">
                      <dt className="muted">Developer</dt>
                      <dd>Thien Nguyen</dd>
                      <dt className="muted">Version</dt>
                      <dd>0.1.0</dd>
                      <dt className="muted">Identifier</dt>
                      <dd className="mono">dev.thiennguyen.metronome</dd>
                    </dl>
                  </section>
                  <p className="small muted mk-note">
                    Drawn by Lumi from the manifest — the extension writes none of it. Leaving the Metronome tab closes its page, so the beat stops here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Mock />
  </StrictMode>,
);
