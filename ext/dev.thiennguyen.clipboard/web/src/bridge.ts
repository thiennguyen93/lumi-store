// The page's only way out: same-origin requests to Lumi's bridge. The CSP
// Lumi stamps on every response (`default-src 'self'`) means a request to
// anywhere else never leaves the webview, so this file is the whole of
// what the panel can reach.
//
//   POST /__lumi__/call        → the extension's run-ui export
//   GET  /__lumi__/blob/<id>   → an image Lumi stored for this extension
//   POST /__lumi__/drag        → hand this press to macOS as a window drag
//   GET|POST /__lumi__/authenticate → macOS's "Is it you?" dialog (Lumi 1.36)

import { backoff, Foreground, isBusy, newest, serial } from "./lanes";
import type { Entry, ExtensionShortcut, Layout, ListAnswer, OwnShortcuts, Request, ShortcutRefusal, Stats } from "./types";

export type FileItem = { name: string; dir?: string; size?: number; folder?: boolean };

/** A web address in a text or rich copy (src/links.rs): where it goes, and
 *  the words a rich copy links it under, when they are not the address. */
export type Link = { url: string; text?: string };

/** What a copy expands to as a snippet trigger (src/snippets.rs): the text,
 *  the profiles whose snippet gives it, whether it was expanded fresh for
 *  this preview (a date, a random value), and the web addresses in it. */
export type Expansion = { text: string; profiles: string[]; dynamic: boolean; links: Link[] };

type Answers = {
  list: ListAnswer;
  welcome: { from: string | null; version: string; privacy?: boolean };
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
    /** A text or rich copy's web addresses (at most 50), and how many in all. */
    links?: Link[] | null;
    linkCount?: number;
    /** What the copy expands to, when it is a snippet trigger; Lumi 1.31. */
    snippets?: Expansion[] | null;
    /** Where the image's text is, when the extension has read it itself. */
    layout?: Layout | null;
  };
  readImages: { read: number; more: boolean };
  layout: { layout: Layout | null };
  paste: Record<string, never>;
  drag: Record<string, never>;
  pin: { pin: string | null };
  delete: Record<string, never>;
  restore: { restored: boolean; count: number };
  copy: Record<string, never>;
  copyText: Record<string, never>;
  copyPath: Record<string, never>;
  copyColor: Record<string, never>;
  copySnippet: Record<string, never>;
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
  /** History lock: an unlock said yes to — kept until `until` for "Lock
   *  again" after a while, null for until the panel closes — and Lock now. */
  unlocked: { until: number | null };
  lock: Record<string, never>;
  /** `privacy` asks or sets it; the answer is how it stands now. */
  privacy: { privacy: boolean };
  setPrivacy: { privacy: boolean };
  stats: Stats;
  previewWidth: Record<string, never>;
  previewSplit: Record<string, never>;
  pdfFit: Record<string, never>;
  apps: { apps: { id: string; name: string }[] };
  profiles: { active: string; profiles: { id: string; name: string }[] };
  dress: Record<string, never>;
  tryPatterns: { errors: { line: number; error: string }[]; matched: number | null };
};

/** The requests a person made that are still waiting for an answer. */
const foreground = new Foreground();

/** One request, retried while Lumi says the extension is full. Not a
 *  queue: the extension's other runs are what is in the way, and they end
 *  within moments or the person's request is not worth waiting for. */
async function send<R extends Request>(request: R): Promise<Answers[R["kind"]]> {
  for (let attempt = 0; ; attempt++) {
    const answer = await fetch("/__lumi__/call", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const body = await answer.text();
    const wait = isBusy(answer.status) ? backoff(attempt) : null;
    if (wait !== null) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    // A refusal comes back as the extension's (or Lumi's) own sentence,
    // written for the person — shown as is.
    if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
    return (body ? JSON.parse(body) : {}) as Answers[R["kind"]];
  }
}

/** A request the person made — a press, a search, the panel opening. */
export async function call<R extends Request>(request: R): Promise<Answers[R["kind"]]> {
  foreground.enter();
  try {
    return await send(request);
  } finally {
    foreground.leave();
  }
}

/** The longest background work stands aside for a person's request. */
const STAND_ASIDE_MS = 5000;

const oneAtATime = serial();

/** A request nobody made — reading the images the extension has not got to.
 *  One at a time, and each waits for the person's own requests to finish
 *  first, so this is never what fills the extension's four runs. */
export function callBackground<R extends Request>(request: R): Promise<Answers[R["kind"]]> {
  return oneAtATime(async () => {
    await foreground.idle(STAND_ASIDE_MS);
    return send(request);
  });
}

/** One lane per kind of request: asking for the preview of the row being
 *  looked at must not drop the request for the words on its picture. */
const latestLanes = new Map<string, ReturnType<typeof newest>>();

/** A request about what is on screen, which the person is waiting for but
 *  which can be slow — a row's preview, the words on its picture. One at a
 *  time per kind, and a request still queued when another of its kind
 *  arrives is dropped (`Superseded`), because the answer would be about a
 *  row nobody is looking at. Holding the arrow key down used to start a
 *  preview per row passed, every one of them occupying one of the
 *  extension's four runs until it finished. */
export function callLatest<R extends Request>(request: R): Promise<Answers[R["kind"]]> {
  let lane = latestLanes.get(request.kind);
  if (!lane) {
    lane = newest();
    latestLanes.set(request.kind, lane);
  }
  return lane(() => send(request));
}

/** Whether macOS's "Is it you?" dialog can be shown here — false on a Lumi
 *  older than 1.36, which has no such route, and on a Mac that cannot ask. */
export async function canAuthenticate(): Promise<boolean> {
  try {
    const answer = await fetch("/__lumi__/authenticate");
    if (!answer.ok) return false;
    return ((await answer.json()) as { available?: unknown }).available === true;
  } catch {
    return false;
  }
}

/** macOS's "Is it you?" dialog — Touch ID, a Watch or the login password —
 *  for `reason` ("show hidden clipboard content"). True only for a yes; a
 *  cancel is false; a dialog that cannot be shown, or another one already
 *  up, throws Lumi's sentence. Either way it is not a yes. */
export async function authenticate(reason: string): Promise<boolean> {
  const answer = await fetch("/__lumi__/authenticate", { method: "POST", body: JSON.stringify({ reason }) });
  const body = await answer.text();
  if (!answer.ok) throw new Error(body || `Lumi answered ${answer.status}`);
  return (JSON.parse(body) as { authenticated?: unknown }).authenticated === true;
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
