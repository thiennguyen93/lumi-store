// The page's only way out: same-origin requests to Lumi's bridge. The CSP
// Lumi stamps on every response (`default-src 'self'`) means a request to
// anywhere else never leaves the webview, so this file is the whole of
// what the panel can reach.
//
//   POST /__lumi__/call        → the extension's run-ui export
//   GET  /__lumi__/blob/<id>   → an image Lumi stored for this extension
//   POST /__lumi__/drag        → hand this press to macOS as a window drag

import type { Entry, ExtensionShortcut, ListAnswer, OwnShortcuts, Request, ShortcutRefusal, Stats } from "./types";

export type FileItem = { name: string; dir?: string; size?: number; folder?: boolean };

type Answers = {
  list: ListAnswer;
  welcome: { from: string | null; version: string };
  openPanel: Record<string, never>;
  /** `html`: a rich copy's markup, to draw in a sandbox. */
  /** `fileSize`: a file row's files together, in bytes, when Lumi measured them. */
  preview: {
    text: string; html?: string | null; ocr?: string | null; fileSize?: number | null;
    /** A lone PDF, sound or film's grant for `fileUrl`; Lumi 1.26. */
    fileToken?: string | null;
    /** A copy of several files, one by one (at most 200), and how many in all. */
    files?: FileItem[] | null;
    fileCount?: number;
  };
  paste: Record<string, never>;
  drag: Record<string, never>;
  pin: { pin: string | null };
  delete: Record<string, never>;
  restore: { restored: boolean; count: number };
  copy: Record<string, never>;
  copyText: Record<string, never>;
  copyPath: Record<string, never>;
  copyColor: Record<string, never>;
  open: Record<string, never>;
  reveal: Record<string, never>;
  saveImage: Record<string, never>;
  clearAll: { ids: string[] };
  settings: Record<string, never>;
  openDocs: Record<string, never>;
  openStore: Record<string, never>;
  tour: Record<string, never>;
  setPin: { pin: string | null };
  clear: { ids: string[] };
  close: Record<string, never>;
  pinPanel: { pinned: boolean };
  stats: Stats;
  previewWidth: Record<string, never>;
  pdfFit: Record<string, never>;
  apps: { apps: { id: string; name: string }[] };
  dress: Record<string, never>;
  tryPatterns: { errors: { line: number; error: string }[]; matched: number | null };
};

export async function call<R extends Request>(request: R): Promise<Answers[R["kind"]]> {
  const answer = await fetch("/__lumi__/call", {
    method: "POST",
    body: JSON.stringify(request),
  });
  const body = await answer.text();
  // A refusal comes back as the extension's (or Lumi's) own sentence,
  // written for the person — shown as is.
  if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
  return (body ? JSON.parse(body) : {}) as Answers[R["kind"]];
}

/** The shortcuts that run this extension's commands: the person's rows and,
 *  under `ess`, the extension's own `[[shortcut]]`s as Lumi holds them. */
export async function shortcuts(): Promise<OwnShortcuts> {
  const answer = await fetch("/__lumi__/shortcuts");
  if (!answer.ok) throw new Error((await answer.text()) || `Lumi answered ${answer.status}`);
  return (await answer.json()) as OwnShortcuts;
}

/** A `PUT /__lumi__/shortcuts` refused because somebody holds the key:
 *  `holders` names them, for a second ask with `replace`. */
export class Held extends Error {
  constructor(
    said: string,
    public readonly holders: ShortcutRefusal["holders"],
  ) {
    super(said);
  }
}

/** Arm, change or clear one of the extension's own shortcuts. Throws `Held`
 *  on a 409 — the key is somebody's — and a plain `Error` for anything
 *  else. `replace` takes the key off the person's row, wherever it is. */
export async function setShortcut(command: string, key: string | null, replace = false): Promise<ExtensionShortcut> {
  const answer = await fetch("/__lumi__/shortcuts", {
    method: "PUT",
    body: JSON.stringify({ command, key, replace }),
  });
  const body = await answer.text();
  if (answer.status === 409) {
    const refusal = JSON.parse(body) as ShortcutRefusal;
    throw new Held(refusal.said, refusal.holders);
  }
  if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
  return JSON.parse(body) as ExtensionShortcut;
}

/** Where an image blob is served. Swappable so the dev mock can hand back
 *  pictures of its own; Lumi mints the ids, so they need only escaping. */
export let blobUrl = (id: string): string => `/__lumi__/blob/${encodeURIComponent(id)}`;

export function setBlobUrl(resolve: (id: string) => string) {
  blobUrl = resolve;
}

/** Where a copied file is served for a player or a viewer, by the grant
 *  Lumi gave with the copy — never a path. Swappable for the dev mock. */
export let fileUrl = (token: string): string => `/__lumi__/file/${encodeURIComponent(token)}`;

export function setFileUrl(resolve: (token: string) => string) {
  fileUrl = resolve;
}

/** Where an application's icon is served, by bundle id — Lumi draws it.
 *  Swappable for the dev mock, like `blobUrl`. */
export let appIconUrl = (bundleId: string): string => `/__lumi__/app-icon/${encodeURIComponent(bundleId)}`;

export function setAppIconUrl(resolve: (bundleId: string) => string) {
  appIconUrl = resolve;
}

export function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type { Entry };
