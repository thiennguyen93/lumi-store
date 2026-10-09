// Clipboard Manager's panel.
//
// The whole history index is read once when the panel opens and searched
// here: typing in the search field costs no call into the extension. The
// extension is asked only for what the index does not hold — a row's full
// text, for the preview — and for what changes storage: paste, pin, delete.
//
// Everything a row shows was copied from somewhere, so none of it is ever
// put into the page as markup; React renders it as text, and nothing here
// uses dangerouslySetInnerHTML. A rich copy's HTML is parsed inert and
// rebuilt from a short list of tags and styles (richText.tsx).

import { type CSSProperties, type KeyboardEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { authenticate, call, callBackground, canAuthenticate, message } from "./bridge";
import {
  ClipboardGlyph,
  CollapseGlyph,
  CopyGlyph,
  ExpandGlyph,
  ExternalGlyph,
  DownloadGlyph,
  EyeGlyph,
  EyeOffGlyph,
  FolderGlyph,
  GearGlyph,
  InfoGlyph,
  KeepOpenGlyph,
  KindGlyph,
  LockGlyph,
  LumiMark,
  PasteGlyph,
  PinGlyph,
  PlainGlyph,
  ScanTextGlyph,
  SearchGlyph,
  TrashGlyph,
} from "./icons";
import { About, type AboutLink } from "./About";
import { type Action, ActionsMenu } from "./ActionsMenu";
import { foldAll, hail, moving, slide, tops } from "./motion";
import { canZoom, Preview } from "./Preview";
import { adoptFits } from "./pdfFit";
import { MIN_LIST, usePreviewWidth } from "./PreviewWidth";
import { usePreviewSplit } from "./PreviewSplit";
import { useScrollFade } from "./scrollFade";
import { useWindowDrag } from "./windowDrag";
import { Row } from "./Row";
import {
  type Combo,
  DEFAULT_LOCK_KEY,
  DEFAULT_PIN_KEY,
  DEFAULT_REVEAL_ALL_KEY,
  DEFAULT_REVEAL_KEY,
  glyphs,
  panelKeys,
  parseCombo,
  pressed,
} from "./keys";
import {
  adopt,
  allShown,
  conceals,
  confirm,
  coverAll,
  covers,
  isLocked,
  isUnlocked,
  type Lock,
  lockAfter,
  LOCK_UNKNOWN,
  needsConfirm,
  restore,
  show,
  shownOf,
  showsLock,
  toggle,
  toggleAll,
  type Veil,
  VEIL_OFF,
} from "./privacy";
import { badPattern, FILTER_LABELS, FILTERS, type Filter, inFilter, search, searchWith, type SearchMode, shortcuts } from "./search";
import type { Entry, ListAnswer } from "./types";
import { reconcile } from "./rows";
import { currentGeneration, isHidden, whenShown } from "./visibility";

export function App() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  // How the query is read — the Search setting; `reload` sets it.
  const [mode, setMode] = useState<SearchMode>("mixed");
  const modeRef = useRef<SearchMode>("mixed");
  // Pin's key — the Pin shortcut setting; ⌘P until the list says.
  const [pinKey, setPinKey] = useState<Combo>(() => parseCombo(DEFAULT_PIN_KEY)!);
  // Privacy mode's show or hide key — its setting; ⌘⇧H until the list says.
  // None when Pin's key is ⌘⇧H and the person has not picked another.
  const [revealKey, setRevealKey] = useState<Combo | null>(() => parseCombo(DEFAULT_REVEAL_KEY));
  // And its show or hide of every item at once; ⌥⇧⌘H until the list says.
  const [revealAllKey, setRevealAllKey] = useState<Combo | null>(() => parseCombo(DEFAULT_REVEAL_ALL_KEY));
  // Lock history now — its setting; ⌘⇧L until the list says.
  const [lockKey, setLockKey] = useState<Combo | null>(() => parseCombo(DEFAULT_LOCK_KEY));
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState("");
  // The moment the rows' ages are counted from ("3m"): when the list was
  // last read on screen, and when the panel is shown again.
  const [now, setNow] = useState(() => Date.now());
  // Pinned in the title bar: up while the person works elsewhere, and a
  // paste, a copy or a link opened leaves it up. Every open starts
  // unpinned — Lumi takes the pin off when the panel goes.
  const [pinned, setPinned] = useState(false);
  // Privacy mode (privacy.ts): whether previews are covered until shown,
  // and which rows were shown since the panel opened. `reload` adopts the
  // switch, wherever it was flipped.
  const [veil, setVeil] = useState<Veil>(VEIL_OFF);
  // "Confirm it's you before showing": the first show after everything was
  // covered asks macOS's "Is it you?" dialog.
  const [privacyConfirm, setPrivacyConfirm] = useState(false);
  // History lock (privacy.ts `Lock`): the list, the preview and every
  // action wait for "Is it you?". Once unlocked, unlocked until the panel
  // closes. Until the first list says how it stands, locked but drawn as
  // neither (`LOCK_UNKNOWN`).
  const [lock, setLock] = useState<Lock>(LOCK_UNKNOWN);
  const locked = isLocked(lock);
  const lockShown = showsLock(lock);
  // What is shown in privacy mode, told to the extension as it changes: it
  // keeps it for "Cover again after panel closes", timed from the closing.
  // Not while the panel is put away and kept (`keep-alive`): what it covers
  // then is the reset for the next opening, not something the person did,
  // and telling it would end what "Cover again" keeps from the closing.
  useEffect(() => {
    if (!veil.on || isHidden()) return;
    void call({ kind: "shown", ...shownOf(veil) }).catch(() => {});
  }, [veil]);
  // Whether "Is it you?" can be asked here at all; asked once.
  const [canAsk, setCanAsk] = useState<boolean | null>(null);
  // A dialog is up: another press waits for it rather than asking again.
  const asking = useRef(false);
  // The menu bar's Delete All Unpinned…, waiting for the rows it deletes to
  // be on screen — they fold away as the panel's own delete folds them.
  const [clearAsked, setClearAsked] = useState(false);
  // The preview has the whole panel, the list put aside. Kept while the
  // arrow keys move between rows, the way Quick Look stays up; a row that
  // cannot have it (`canZoom` — none today, or no row at all) ends it, so the
  // list is never back on screen with a zoom still waiting to take it away.
  const [zoom, setZoom] = useState(false);
  // ⌘K › About: the extension's card in place of the list and the preview.
  // The search stays mounted under it, so a letter typed puts the card
  // away and lands in the search.
  const [about, setAbout] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = usePreviewWidth();
  const split = usePreviewSplit();
  const windowDrag = useWindowDrag();
  const list = useRef<HTMLDivElement>(null);
  useScrollFade(list);
  // Where the rows were before a pin or unpin, for the next render to
  // slide them from; null for every other change (typing, filtering).
  const slideFrom = useRef<Map<string, number> | null>(null);
  // The row just pinned, so its pin can pop in once.
  const [popped, setPopped] = useState<string | null>(null);
  // A delete is folding: a second ⌘⌥⌫ waits for it rather than racing it.
  const folding = useRef(false);
  // Everything done since the panel opened, newest last, for ⌘Z. The panel
  // starts over when it goes — the page blanked, or, kept between openings,
  // mounted afresh (`main.tsx`) — and the extension empties its trash when
  // the next one opens, so the two forget together.
  const undos = useRef<Undo[]>([]);
  // What ⌘Z took back, for ⌘⇧Z to do again; anything new done clears it.
  const redos = useRef<Undo[]>([]);
  const adoptWidth = preview.adopt;
  const adoptSplit = split.adopt;
  // `reload` is made once; it reads the filter through this.
  const filterRef = useRef<Filter>("all");
  filterRef.current = filter;

  const { rows: shown, used } = useMemo(
    () => searchWith((rows ?? []).filter((row) => inFilter(row, filter)), query, mode),
    [rows, query, filter, mode],
  );
  const keys = useMemo(() => shortcuts(shown), [shown]);
  const current = shown[selected];
  const zoomed = zoom && canZoom(current);
  useEffect(() => {
    if (zoom && !canZoom(current)) setZoom(false);
  }, [zoom, current]);

  // What a list answer says, taken in: as it is read, and — remounted while
  // the panel is put away and kept — from the last one read (`kept`). A row
  // that did not change keeps its object (`reconcile`), so a list read again
  // draws only what changed. Put away, a locked history is held nowhere: no
  // rows, and the lock not known until the opening list says (`lockAfter`).
  const adoptAnswer = useCallback((answer: ListAnswer, keepId: string | null, opening: boolean) => {
    const hidden = isHidden();
    const lockOn = answer.lock?.on ?? false;
    kept = lockOn ? { ...answer, items: [] } : answer;
    setRows((rows) => (hidden && lockOn ? null : reconcile(rows, answer.items)));
    if (!hidden) setNow(Date.now());
    if (opening && answer.clear) setClearAsked(true);
    adoptWidth(answer.previewWidth);
    adoptSplit(answer.previewSplit);
    adoptFits(answer.pdfFit);
    wear(answer.appearance, answer.theme);
    // Checked as the Settings tab checks them, so a key the panel answers
    // otherwise — or the other one's — is never taken from it.
    const own = panelKeys(answer.pinKey, answer.revealKey, answer.revealAllKey, answer.lockKey);
    setPinKey(own.pin);
    setRevealKey(own.reveal);
    setRevealAllKey(own.revealAll);
    setLockKey(own.lock);
    modeRef.current = answer.searchMode ?? "mixed";
    setMode(modeRef.current);
    // On opening, what was shown before the panel last closed, while
    // "Cover again after panel closes" has not run out.
    setVeil((veil) => restore(adopt(veil, answer.privacy ?? false), answer.shown));
    setPrivacyConfirm(answer.privacyConfirm ?? false);
    setLock((lock) => lockAfter(lock, answer.lock, { opening, hidden }));
    if (keepId) {
      const at = search(
        answer.items.filter((row) => inFilter(row, filterRef.current)),
        input.current?.value ?? "",
        modeRef.current,
      ).findIndex((row) => row.id === keepId);
      if (at >= 0) setSelected(at);
    }
  }, [adoptWidth, adoptSplit]);

  // The list read again — or, `opening`, the panel's first list since it
  // opened, which the extension tidies the history on and which alone says
  // whether this opening is unlocked. `asked`: that list, asked already
  // (`openEarly`). An answer to an opening that is over — the panel put away
  // while it was on its way — is not taken.
  const reload = useCallback(
    async (keepId: string | null, opening = false, asked: Promise<ListAnswer> | null = null) => {
      const generation = currentGeneration();
      const answer = await (asked ?? call({ kind: "list", opening }));
      if (generation === currentGeneration()) adoptAnswer(answer, keepId, opening);
    },
    [adoptAnswer],
  );

  // Remounted while the panel is put away and kept (`main.tsx`): drawn
  // straight away from the last list, before anybody sees it, so the next
  // opening shows rows on its first frame. A page loaded afresh has none.
  useLayoutEffect(() => {
    if (isHidden() && kept) adoptAnswer(kept, null, false);
  }, [adoptAnswer]);

  // The opening: the opening list — asked as the page loads (`openEarly`),
  // else now — once the panel is on screen. On a page Lumi keeps between
  // openings, that is when `lumi:shown` says so, not when the page mounted
  // as it was put away or loaded ahead. The search has the keys from the
  // start, so a letter typed the moment the panel shows lands in it.
  useEffect(() => {
    input.current?.focus();
    // Loaded hidden — ahead of its first opening (Lumi 1.45 loads a kept
    // panel's page as the extension loads), or put away before it finished
    // loading: the rows read now, as any list read again, so the opening
    // shows them on its first frame.
    if (isHidden() && !kept) void reload(null).catch(() => {});
    return whenShown(() => {
      setNow(Date.now());
      reload(null, true, takeEarly())
        .catch((err) => setNotice(message(err)))
        .finally(() => {
          input.current?.focus();
          readUnread();
        });
    });
  }, [reload]);

  // The row a reread of the list keeps chosen: the one the person is on,
  // wherever it moves to — except the top row, where a new copy lands, so
  // resting there follows it.
  const following = useRef<string | null>(null);
  following.current = selected > 0 ? (current?.id ?? null) : null;

  // A copy made while the panel is up — pinned over another app, or not —
  // comes as news from the extension (`ui.post`, src/lib.rs `tell_panel`),
  // as does privacy mode flipped from the menu bar, a key or the Settings
  // tab (`PRIVACY_CHANGED`), and a change to the settings from Lumi
  // (`lumi:settings`, Lumi 1.31): either way the list is read again, and
  // with it the order, the search mode, the Pin key, the glass and the
  // privacy switch. One read at a time; news during one
  // asks for one more after it. A failed read leaves the list as it was —
  // nobody asked for it, so it is no notice either.
  // Put away and kept (`keep-alive`), news is still heard, so the panel is
  // current the moment it is shown again — read at once, as on screen: a
  // timer would wait, since WebKit holds a hidden page's timers back (measured:
  // a copy 0.8 s before the shortcut was not in the list on the first frame),
  // and a burst of copies is already one read and one more (`again`). Not at
  // all while the history is locked: nothing of it is held then, and the
  // opening list reads it.
  const lockOn = useRef(lock.on);
  lockOn.current = lock.on;
  useEffect(() => {
    let reading = false;
    let again = false;
    const reread = async () => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      try {
        do {
          again = false;
          await reload(following.current).catch(() => {});
        } while (again);
      } finally {
        reading = false;
      }
    };
    const told = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isNews(detail, "history") && !isNews(detail, "privacy")) return;
      if (isHidden() && lockOn.current) return;
      void reread();
    };
    // Reading images may have just been turned on: the ones never read
    // are read now, not at the next opening.
    const settled = () => {
      void reread();
      readUnread();
    };
    window.addEventListener("lumi:message", told);
    window.addEventListener("lumi:settings", settled);
    return () => {
      window.removeEventListener("lumi:message", told);
      window.removeEventListener("lumi:settings", settled);
    };
  }, [reload]);

  // A selection past the end — after a delete, or a search that narrowed
  // the list — lands on the last row rather than on nothing.
  useEffect(() => {
    if (selected > 0 && selected >= shown.length) setSelected(Math.max(0, shown.length - 1));
  }, [selected, shown.length]);

  useEffect(() => {
    document.getElementById(`row-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected, shown]);

  const act = useCallback(async (work: () => Promise<unknown>) => {
    setNotice("");
    try {
      await work();
    } catch (err) {
      setNotice(message(err));
    }
  }, []);

  // The shortcut pressed while the panel is up does not put it away — only
  // Escape does — and the extension says it was pressed (src/lib.rs
  // `SUMMONED`), the keyboard already back if the panel was pinned and left
  // for another app. What the keys work on now hails, so a press that
  // changed nothing on screen still says it was heard: the ⌘K menu's chosen
  // action while it is up, else the selected row while the list is in
  // sight, else the search.
  useEffect(() => {
    const told = (event: Event) => {
      if (!isNews((event as CustomEvent<unknown>).detail, "summoned")) return;
      const row = zoomed || about ? null : list.current?.querySelector<HTMLElement>('.row[aria-selected="true"]');
      row?.scrollIntoView({ block: "nearest" });
      hail(
        document.querySelector<HTMLElement>('.menu-item[aria-selected="true"], .menu-filter') ??
          row ??
          (about ? null : document.querySelector<HTMLElement>(".search")),
      );
    };
    window.addEventListener("lumi:message", told);
    return () => window.removeEventListener("lumi:message", told);
  }, [zoomed, about]);

  const paste = useCallback(
    (plain: boolean, row: Entry | undefined = current) => {
      if (!row) return;
      // Lumi closes the panel before it pastes, so nothing after this runs
      // in a page anybody can see — unless it is pinned, when Lumi only
      // hands the keyboard back and the panel stays as it was.
      void act(() => call({ kind: "paste", id: row.id, plain, pinned }));
    },
    [act, current, pinned],
  );

  // A row's own two callbacks, made once: a row whose props did not change
  // is not drawn again (`Row`'s memo), so a press of an arrow key draws the
  // two rows it moves between, not every row in the history.
  const pick = useCallback((at: number) => {
    setSelected(at);
    // Back from the preview, the next letter is the search's.
    input.current?.focus();
  }, []);
  const pasteNow = useRef(paste);
  pasteNow.current = paste;
  const pasteRow = useCallback((plain: boolean, row: Entry) => pasteNow.current(plain, row), []);

  const togglePinned = useCallback(() => {
    const next = !pinned;
    void act(async () => {
      await call({ kind: "pinPanel", pinned: next });
      setPinned(next);
    });
  }, [act, pinned]);

  /** macOS's "Is it you?" dialog, once at a time: true for a yes. A no, or
   *  a dialog that could not be shown, says so and is not a yes. */
  const isItYou = useCallback(async (reason: string): Promise<boolean> => {
    if (asking.current) return false;
    asking.current = true;
    setNotice("");
    try {
      const yes = await authenticate(reason);
      if (!yes) setNotice("Not confirmed");
      return yes;
    } catch (err) {
      setNotice(message(err));
      return false;
    } finally {
      asking.current = false;
    }
  }, []);

  /** Show something covered: straight away, or — "Confirm it's you before
   *  showing" — once "Is it you?" says yes. Covering never asks. */
  const reveal = useCallback(
    (change: (veil: Veil) => Veil) => {
      if (!needsConfirm(veil, privacyConfirm, isUnlocked(lock))) {
        setVeil(change);
        return;
      }
      void (async () => {
        if (await isItYou("show hidden clipboard content")) setVeil((veil) => change(confirm(veil)));
      })();
    },
    [isItYou, lock, privacyConfirm, veil],
  );

  /** The show or hide key (⇧⌘H): the selected row's preview shown, or
   *  covered again. */
  const toggleShown = useCallback(() => {
    // A kind privacy mode never covers — a colour — has nothing to show.
    if (!current || !conceals(current.kind)) return;
    if (covers(veil, current)) reveal((veil) => show(veil, current.id));
    else setVeil((veil) => toggle(veil, current.id));
  }, [current, reveal, veil]);

  const showRow = useCallback((id: string) => reveal((veil) => show(veil, id)), [reveal]);

  /** The show-or-hide-all key (⌥⇧⌘H): every preview shown at once for the
   *  rest of this opening, so none has to be shown one by one — or, all
   *  shown already, every one covered again. */
  const toggleAllShown = useCallback(() => {
    if (allShown(veil)) setVeil(toggleAll);
    else reveal(toggleAll);
  }, [reveal, veil]);

  /** Unlock the history: "Is it you?", then unlocked until the panel
   *  closes — the extension is told, for "Lock again after panel closes".
   *  The yes counts for showing too. */
  const unlock = useCallback(async () => {
    const generation = currentGeneration();
    if (!(await isItYou("open your clipboard history"))) return;
    // A yes for an opening that is over unlocks nothing.
    if (generation !== currentGeneration()) return;
    setVeil(confirm);
    setLock((lock) => ({ ...lock, here: true }));
    // Not kept: unlocked for this opening all the same, locked when it
    // closes. The extension hands a locked panel no rows, so the list is
    // read once it knows.
    await call({ kind: "unlocked" }).catch(() => {});
    await reload(following.current).catch(() => {});
  }, [isItYou, reload]);

  /** ⌘K's Lock history now: locked, previews covered, the next unlock asks. */
  const lockNow = useCallback(() => {
    setLock((lock) => ({ ...lock, here: false }));
    setVeil(coverAll);
    void call({ kind: "lock" }).catch(() => {});
  }, []);

  // Whether "Is it you?" can be asked at all — the lock card says so when
  // it cannot, rather than asking for nothing.
  useEffect(() => {
    void (canAsk_ ??= canAuthenticate()).then(setCanAsk);
  }, []);

  // A locked history asks as soon as the panel is up: ⇧⌘C, Touch ID, the
  // list. Once per opening — Cancel leaves the lock card and its Unlock.
  const askedOnOpen = useRef(false);
  useEffect(() => {
    if (!lockShown || rows === null || canAsk !== true || askedOnOpen.current || isHidden()) return;
    askedOnOpen.current = true;
    void unlock();
  }, [lockShown, rows, canAsk, unlock]);

  // The keys go where they are answered: the panel itself while locked —
  // the search field is disabled, and a key on nothing reaches no handler —
  // and the search again once unlocked.
  useEffect(() => {
    if (locked) document.querySelector<HTMLElement>("main.panel")?.focus();
    else input.current?.focus();
  }, [locked]);




  const togglePin = useCallback(() => {
    if (!current) return;
    const id = current.id;
    void act(async () => {
      slideFrom.current = moving() ? tops(list.current) : null;
      try {
        const { pin } = await call({ kind: "pin", id });
        undos.current.push({ kind: "pin", id, was: current.pin, now: pin });
        redos.current = [];
        setPopped(pin ? id : null);
        await reload(id);
      } catch (err) {
        slideFrom.current = null;
        throw err;
      }
    });
  }, [act, current, reload]);

  /** The rows on screen for these ids, for folding. */
  const rowsOf = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => list.current?.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`))
        .filter((row): row is HTMLElement => Boolean(row)),
    [],
  );

  /** Fold `ids` away, then `work` — which deletes them and answers which
   *  went — onto the undo stack. Back as they were if it fails. */
  const deleting = useCallback(
    (ids: string[], work: () => Promise<string[]>) => {
      if (folding.current) return;
      void act(async () => {
        folding.current = true;
        const unfold = await foldAll(rowsOf(ids));
        try {
          const gone = await work();
          if (gone.length) undos.current.push({ kind: "delete", ids: gone });
          redos.current = [];
          await reload(null);
        } catch (err) {
          unfold();
          throw err;
        } finally {
          folding.current = false;
        }
      });
    },
    [act, reload, rowsOf],
  );

  const remove = useCallback(() => {
    if (!current) return;
    const id = current.id;
    deleting([id], async () => {
      await call({ kind: "delete", id });
      return [id];
    });
  }, [current, deleting]);

  /** Delete all — or all but the pins. Every row in the history, not only
   *  the ones the search or filter shows. */
  const removeAll = useCallback(
    (keepPins: boolean) => {
      const going = (rows ?? []).filter((row) => !(keepPins && row.pin)).map((row) => row.id);
      if (!going.length) return;
      deleting(going, async () => (await call({ kind: keepPins ? "clear" : "clearAll" })).ids);
    },
    [deleting, rows],
  );

  // Asked from the menu bar: the opening list said so, or the extension told
  // a panel already up. Done once the rows are drawn, so they fold away.
  useEffect(() => {
    // A locked history deletes nothing until it is unlocked: the person
    // asking from the menu bar may not be its owner.
    if (!clearAsked || rows === null || locked) return;
    setClearAsked(false);
    removeAll(true);
  }, [clearAsked, rows, removeAll, locked]);

  useEffect(() => {
    const told = (event: Event) => {
      if (isNews((event as CustomEvent<unknown>).detail, "clear")) setClearAsked(true);
    };
    window.addEventListener("lumi:message", told);
    return () => window.removeEventListener("lumi:message", told);
  }, []);

  /** ⌘Z: take back the last pin, unpin or delete — and the one before,
   *  and so on to when the panel opened. */
  const undo = useCallback(() => {
    const last = undos.current.pop();
    if (!last) return;
    void act(async () => {
      slideFrom.current = moving() ? tops(list.current) : null;
      try {
        if (last.kind === "pin") {
          const { pin } = await call({ kind: "setPin", id: last.id, pin: last.was });
          setPopped(pin ? last.id : null);
          redos.current.push({ ...last, now: pin ?? last.now });
        } else {
          const { count } = await call({ kind: "restore", ids: last.ids });
          if (count) redos.current.push(last);
          if (count < last.ids.length) {
            setNotice(
              last.ids.length === 1
                ? "That item was copied again since, so the newer one stays."
                : "Some items were copied again since, so the newer ones stay.",
            );
          }
        }
        await reload(last.kind === "pin" ? last.id : (last.ids[0] ?? null));
      } catch (err) {
        slideFrom.current = null;
        throw err;
      }
    });
  }, [act, reload]);

  /** ⌘⇧Z: do again what ⌘Z took back, newest first. */
  const redo = useCallback(() => {
    const next = redos.current.pop();
    if (!next || folding.current) return;
    void act(async () => {
      if (next.kind === "pin") {
        slideFrom.current = moving() ? tops(list.current) : null;
        try {
          const { pin } = await call({ kind: "setPin", id: next.id, pin: next.now });
          setPopped(pin ? next.id : null);
          undos.current.push({ ...next, now: pin });
          await reload(next.id);
        } catch (err) {
          slideFrom.current = null;
          throw err;
        }
        return;
      }
      folding.current = true;
      const unfold = await foldAll(rowsOf(next.ids));
      try {
        await call({ kind: "delete", ids: next.ids });
        undos.current.push(next);
        await reload(null);
      } catch (err) {
        unfold();
        throw err;
      } finally {
        folding.current = false;
      }
    });
  }, [act, reload, rowsOf]);

  /** Settings… / ⌘,: this extension's tab in Lumi's Settings. */
  const openSettings = useCallback(() => {
    void act(() => call({ kind: "settings" }));
  }, [act]);

  const followLink = useCallback(
    (link: AboutLink) => void act(() => call(link === "tour" ? { kind: link } : { kind: link, pinned })),
    [act, pinned],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    input.current?.focus();
  }, []);

  /** The show or hide key as its key-cap says it, when there is one. */
  const revealCap = revealKey ? glyphs(revealKey) : undefined;
  const revealAllCap = revealAllKey ? glyphs(revealAllKey) : undefined;
  const lockCap = lockKey ? glyphs(lockKey) : undefined;

  /** What ⌘K offers for the selected row, then for the whole history. */
  const actions = useMemo((): Action[] => {
    const row = current;
    const run = (kind: "copy" | "copyText" | "copyPath" | "open" | "reveal", plain?: boolean) => () => {
      if (row) void act(() => call(kind === "copy" ? { kind, id: row.id, plain, pinned } : { kind, id: row.id, pinned }));
    };
    const unpinned = (rows ?? []).filter((r) => !r.pin).length;
    const all = rows?.length ?? 0;
    const textual = row && (row.kind === "text" || row.kind === "rich" || row.kind === "link");
    // Locked: nothing that reads, changes or shows the history — Unlock, and
    // the two that show none of it.
    if (locked) {
      return [
        ...(canAsk && lockShown ? [{ id: "unlock", label: "Unlock history", glyph: <LockGlyph open />, keys: "↩", run: () => void unlock() }] : []),
        { id: "settings", label: "Settings…", glyph: <GearGlyph />, keys: "⌘,", run: openSettings },
        {
          id: "about",
          label: about ? "Back to the history" : "About Clipboard Manager",
          glyph: <InfoGlyph />,
          run: () => setAbout(!about),
        },
      ];
    }
    return [
      // With About up the row is out of sight, and so are its actions.
      ...(row && !about
        ? [
            { id: "paste", label: "Paste", glyph: <PasteGlyph />, keys: "↩", run: () => paste(false, row) },
            ...(textual
              ? [{ id: "plain", label: "Paste as plain text", glyph: <PlainGlyph />, keys: "⌥↩", run: () => paste(true, row) }]
              : []),
            ...(zoomed || canZoom(row)
              ? [
                  {
                    id: "zoom",
                    label: zoomed ? "Back to the list" : "Expand preview",
                    glyph: zoomed ? <CollapseGlyph /> : <ExpandGlyph />,
                    keys: "⌘Y",
                    run: () => setZoom(!zoomed),
                  },
                ]
              : []),
            { id: "copy", label: "Copy", glyph: <CopyGlyph />, run: run("copy") },
            ...(row.kind === "file"
              ? [
                  {
                    id: "copyPath",
                    label: (row.fileCount ?? 0) > 1 ? "Copy paths" : "Copy path",
                    glyph: <CopyGlyph />,
                    run: run("copyPath"),
                  },
                ]
              : []),
            ...(row.ocr ? [{ id: "copyText", label: "Copy text in image", glyph: <ScanTextGlyph />, run: run("copyText") }] : []),
            ...(row.kind === "link" ? [{ id: "open", label: "Open in browser", glyph: <ExternalGlyph />, run: run("open") }] : []),
            ...(row.kind === "file" ? [{ id: "reveal", label: "Show in Finder", glyph: <FolderGlyph />, run: run("reveal") }] : []),
            ...(row.kind === "image"
              ? [
                  {
                    id: "saveImage",
                    label: "Save image as…",
                    glyph: <DownloadGlyph />,
                    run: () => void act(() => call({ kind: "saveImage", id: row.id, name: savedName(row.last) })),
                  },
                ]
              : []),
            { id: "pin", label: row.pin ? "Unpin" : "Pin", glyph: <PinGlyph />, keys: glyphs(pinKey), run: togglePin },
            ...(veil.on && conceals(row.kind)
              ? [
                  covers(veil, row)
                    ? { id: "showContent", label: "Show content", glyph: <EyeGlyph />, keys: revealCap, run: toggleShown }
                    : { id: "hideContent", label: "Hide content", glyph: <EyeOffGlyph />, keys: revealCap, run: toggleShown },
                ]
              : []),
          ]
        : []),
      ...(veil.on && !about
        ? [
            allShown(veil)
              ? { id: "hideAll", label: "Hide all content", glyph: <EyeOffGlyph />, keys: revealAllCap, run: toggleAllShown }
              : { id: "showAll", label: "Show all content", glyph: <EyeGlyph />, keys: revealAllCap, run: toggleAllShown },
          ]
        : []),
      ...(lock.on ? [{ id: "lockNow", label: "Lock history now", glyph: <LockGlyph />, keys: lockCap, run: lockNow }] : []),
      { id: "settings", label: "Settings…", glyph: <GearGlyph />, keys: "⌘,", run: openSettings },
      {
        id: "about",
        label: about ? "Back to the history" : "About Clipboard Manager",
        glyph: <InfoGlyph />,
        run: () => setAbout(!about),
      },
      ...(row && !about
        ? [{ id: "delete", label: "Delete entry", glyph: <TrashGlyph />, keys: "⌘⌥⌫", danger: true, run: remove }]
        : []),
      ...(unpinned && unpinned < all
        ? [
            {
              id: "clear",
              label: "Delete all unpinned…",
              glyph: <TrashGlyph />,
              danger: true,
              confirm: `Press ↩ again to delete ${unpinned} ${unpinned === 1 ? "entry" : "entries"}`,
              run: () => removeAll(true),
            },
          ]
        : []),
      ...(all
        ? [
            {
              id: "clearAll",
              label: "Delete all…",
              glyph: <TrashGlyph />,
              danger: true,
              confirm: `Press ↩ again to delete all ${all} ${all === 1 ? "entry" : "entries"}`,
              run: () => removeAll(false),
            },
          ]
        : []),
    ];
  }, [about, act, canAsk, current, lock.on, lockCap, lockNow, lockShown, locked, openSettings, paste, pinKey, pinned, remove, removeAll, revealAllCap, revealCap, rows, togglePin, toggleAllShown, toggleShown, unlock, veil, zoomed]);

  // After a pin or unpin has re-sorted the list: slide rows from where
  // they were. Before paint, so nobody sees them at the new place first.
  useLayoutEffect(() => {
    const from = slideFrom.current;
    if (!from) return;
    slideFrom.current = null;
    slide(list.current, from);
  }, [shown]);

  // The pop plays once; forget it so a later render does not replay it.
  useEffect(() => {
    if (!popped) return;
    const timer = setTimeout(() => setPopped(null), 400);
    return () => clearTimeout(timer);
  }, [popped]);

  const choose = (next: Filter) => {
    setFilter(next);
    setSelected(0);
    setNotice("");
  };

  /** ⇥ / ⇧⇥: the next or previous kind, round the ends. */
  const cycle = (by: number) => {
    const at = FILTERS.indexOf(filter);
    choose(FILTERS[(at + by + FILTERS.length) % FILTERS.length] ?? "all");
  };

  /** ↓ / ↑ go round the ends; a page stops at them. */
  const move = (by: number, round = false) => {
    const count = shown.length;
    if (!count) return;
    setSelected((at) =>
      round ? (((at + by) % count) + count) % count : Math.max(0, Math.min(count - 1, at + by)),
    );
  };

  /** The field a letter belongs in: the menu's own filter while it is up,
   *  the search otherwise. */
  const field = () => document.querySelector<HTMLInputElement>(".menu-filter") ?? input.current;

  /** A click that leaves the focus on no field — the list's gaps, the
   *  preview's padding, the crumbs — hands it back to the search, so the
   *  next key is typed rather than sent to a page with nothing to type in.
   *  A drag that selected preview text keeps its selection until a key. */
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest("input, textarea, select, video, audio, .menu")) return;
    if (window.getSelection()?.isCollapsed === false) return;
    field()?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // A key typed with the focus on no field — after a click on the
    // preview's text, say — is the search's. Moved there before the key is
    // taken, so the character lands in the field; a key with nowhere to be
    // typed used to leave the panel blank.
    const typing = !event.metaKey && !event.ctrlKey && (event.key.length === 1 || event.keyCode === 229);
    if (typing && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      field()?.focus();
    }

    // While an input method is composing — Telex turning `aa` into `â` —
    // Return and the arrows belong to it: taking Return here would paste a
    // row in the middle of somebody spelling a search word.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const cmd = event.metaKey && !event.ctrlKey;
    const key = event.key;
    // Locked: ↩ unlocks, ⎋ closes, ⌘K and ⌘, work; no row key, paste, pin
    // or show reaches a history nobody has unlocked. Before the first list
    // says whether it is locked, the same — but ↩ asks nothing yet.
    if (locked && !about) {
      if (key === "Escape") {
        if (menuOpen) closeMenu();
        else void call({ kind: "close" }).catch(() => {});
      } else if (key === "Enter") {
        if (lockShown) void unlock();
      } else if (cmd && key.toLowerCase() === "k") setMenuOpen(true);
      else if (cmd && key === ",") openSettings();
      else if (!event.metaKey && !event.ctrlKey && !event.altKey) return;
      event.preventDefault();
      return;
    }
    // About up: ⎋ puts it away, ⌘K and ⌘, work, and nothing else here
    // acts on the rows it hides. A letter goes on to the search, which
    // puts the card away itself.
    if (about) {
      if (key === "Escape") {
        if (menuOpen) closeMenu();
        else setAbout(false);
      } else if (cmd && key.toLowerCase() === "k") setMenuOpen(true);
      else if (cmd && key === ",") openSettings();
      else return;
      event.preventDefault();
      return;
    }
    // The person's own keys first: the Settings tab refuses any key the
    // panel answers below (`keys.refusal`), but several of those answers
    // match loosely — ⌘K with ⇧ held still opens the menu — and must not
    // take a key that was the person's choice.
    if (pressed(event, pinKey)) togglePin();
    // Taken with privacy mode off as well, so the key never pastes a row it
    // does not name.
    else if (revealKey && pressed(event, revealKey)) toggleShown();
    else if (revealAllKey && pressed(event, revealAllKey)) toggleAllShown();
    // Lock history now. Taken with the lock off as well, as the show or hide
    // keys are, so it never reaches the search or a row's key.
    else if (lockKey && pressed(event, lockKey)) {
      if (lock.on) lockNow();
    }
    else if (key === "ArrowDown") move(1, true);
    else if (key === "ArrowUp") move(-1, true);
    else if (key === "PageDown") move(8);
    else if (key === "PageUp") move(-8);
    else if (key === "Enter") paste(event.altKey);
    else if (key === "Tab") cycle(event.shiftKey ? -1 : 1);
    else if (key === "Escape") {
      // Undo what narrows the list first — the search, then the filter —
      // and only then put the panel away. The menu keeps its own ⎋; one that
      // gets here anyway while it is up puts away the menu, never the panel.
      if (menuOpen) {
        closeMenu();
      } else if (zoomed) {
        setZoom(false);
      } else if (query) {
        setQuery("");
        setSelected(0);
      } else if (filter !== "all") {
        choose("all");
      } else {
        void call({ kind: "close" }).catch(() => {});
      }
    } else if (cmd && key.toLowerCase() === "k") setMenuOpen(true);
    else if (cmd && key === ",") openSettings();
    // ⌘⌥⌫, Finder's "Delete Immediately": ⌘⌫ (to the line's start) and ⌥⌫
    // (a word) stay the search field's, where people reach for them while
    // typing — ⌘⌫ alone used to delete the selected row too.
    else if (cmd && event.altKey && key === "Backspace") remove();
    // ⌘Z / ⌘⇧Z are the history's while there is something to take back or
    // do again; with nothing, they stay the search field's own text undo.
    else if (cmd && !event.shiftKey && key.toLowerCase() === "z" && undos.current.length) undo();
    else if (cmd && event.shiftKey && key.toLowerCase() === "z" && redos.current.length) redo();
    // Before ⌘+letter below, which would take ⌘⇧P as row P's.
    else if (cmd && event.shiftKey && !event.altKey && key.toLowerCase() === "p") togglePinned();
    // ⌘Y, Quick Look's key in the Finder, Raycast and Alfred: the preview
    // takes the whole panel, and back. No row is ever given `y`
    // (`history::PIN_LETTERS`), so it never pastes one.
    else if (cmd && !event.shiftKey && !event.altKey && key.toLowerCase() === "y") {
      if (zoomed || canZoom(current)) setZoom(!zoomed);
    } else if (cmd && /^[1-9a-z]$/i.test(key)) {
      const wanted = key.toLowerCase();
      const at = shown.findIndex((row) => keys.get(row.id) === wanted);
      // ⌘A, ⌘C, ⌘V and the rest stay the text field's when no row owns them.
      if (at < 0) return;
      setSelected(at);
      paste(event.altKey, shown[at]);
    } else return;
    event.preventDefault();
  };

  const empty = rows !== null && !shown.length;

  return (
    // Focusable itself, so a click on what is not — the preview's text,
    // which stays selectable — leaves the focus in here rather than on the
    // body, where no key reaches `onKeyDown`.
    <main
      className={["panel", zoomed && !about ? "zoomed" : "", about ? "about-up" : "", locked ? "locked" : ""].filter(Boolean).join(" ")}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      {/* The breadcrumb is the panel's title bar: drag it to move the panel. */}
      <header className="crumbs" {...windowDrag}>
        <LumiMark />
        <span className="brand">Lumi</span>
        <span className="sep">›</span>
        <span>Clipboard Manager</span>
        <span className="sep">›</span>
        <span className="here">{about ? "About" : FILTER_LABELS[filter]}</span>
        <nav className="filters" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={f === filter ? "cap quiet on" : "cap quiet"}
              aria-pressed={f === filter}
              // A kind is drawn as its glyph; its name is the tooltip, the
              // label, and — once chosen — the breadcrumb's last step.
              title={FILTER_LABELS[f]}
              aria-label={FILTER_LABELS[f]}
              // The caret stays in the search field, as it does for a row.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(f)}
            >
              {f === "all" ? FILTER_LABELS[f] : <KindGlyph kind={f} />}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={pinned ? "keep on" : "keep"}
          aria-pressed={pinned}
          title={pinned ? "Pinned: stays open while you work elsewhere (⌘⇧P)" : "Keep the panel open while you work elsewhere (⌘⇧P)"}
          aria-label="Keep the panel open"
          onMouseDown={(event) => event.preventDefault()}
          onClick={togglePinned}
        >
          <KeepOpenGlyph />
        </button>
      </header>
      <div className="search" aria-hidden={about || undefined}>
        <SearchGlyph />
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
            setNotice("");
            // A search is typed to see the list, so it comes back.
            setZoom(false);
            setAbout(false);
          }}
          placeholder={!locked ? "Search history" : lockShown ? "History locked" : ""}
          // Nothing to search while locked; the keys go to the panel.
          disabled={locked}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search history"
          aria-controls="list"
          aria-activedescendant={current ? `row-${selected}` : undefined}
        />
      </div>
      {about && <About onLink={followLink} />}
      {lockShown && !about && <LockCard canAsk={canAsk} onUnlock={() => void unlock()} onSettings={openSettings} />}
      {/* Not yet known whether locked: the body kept, with nothing in it. */}
      {locked && !lockShown && !about && <div className="waiting" aria-hidden="true" />}
      {!locked && <section
        className="body-grid"
        // Nothing to preview: the list takes the width, so the empty note
        // sits in the middle of the panel rather than of the list.
        // Zoomed, the list keeps its column at no width rather than leaving
        // the page, so it comes back where it was scrolled to.
        style={{
          gridTemplateColumns: empty
            ? "minmax(0, 1fr)"
            : zoomed
              ? "0 minmax(0, 1fr)"
              : `minmax(0, 1fr) min(${preview.width}px, calc(100% - ${MIN_LIST}px))`,
        }}
      >
        <div ref={list} id="list" className="list" role="listbox" aria-label="Clipboard history">
          {rows !== null && empty && (
            <div className="empty">
              {rows.length > 0 && query ? <SearchGlyph /> : <ClipboardGlyph />}
              <span>{emptyText(rows.length, query, filter, mode)}</span>
            </div>
          )}
          {shown.map((row, index) => [
            // One hairline where the pins end — only when rows follow them.
            index > 0 && shown[index - 1]?.pin && !row.pin ? (
              <div key="divider" className="divider" role="separator" />
            ) : null,
            <Row
              key={row.id}
              row={row}
              index={index}
              selected={index === selected}
              shortcut={keys.get(row.id)}
              query={query}
              used={used}
              now={now}
              popped={popped === row.id}
              onPick={pick}
              onPaste={pasteRow}
            />,
          ])}
        </div>
        <div
          className="preview-slot"
          hidden={empty}
          // The line across the card, where it was dragged to (`--upper-basis`),
          // and the floors a dragged line goes down to (`[data-split]`).
          data-split={split.height == null ? undefined : ""}
          style={split.height == null ? undefined : ({ "--split": `${split.height}px` } as CSSProperties)}
        >
          <div
            className="grip"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize preview"
            title="Drag to resize · double-click to reset"
            {...preview.grip}
          />
          <Preview
            row={current}
            covered={current ? covers(veil, current) : false}
            revealCap={revealCap}
            revealAllCap={revealAllCap}
            onShow={showRow}
            query={query}
            used={used}
            onOpen={(id, url, snippet) => void act(() => call({ kind: "open", id, url, snippet, pinned }))}
            onCopyColor={(text) => void act(() => call({ kind: "copyColor", text, pinned }))}
            onCopySnippet={(id, text) => void act(() => call({ kind: "copySnippet", id, text, pinned }))}
            onCopyMath={(id, text) => void act(() => call({ kind: "copyMath", id, text, pinned }))}
            onCopyWords={(id, { from, to }) => void act(() => call({ kind: "copyText", id, from, to, pinned }))}
            zoomed={zoomed}
            onZoom={() => setZoom(!zoomed)}
            split={split.grip}
          />
        </div>
      </section>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {menuOpen && <ActionsMenu actions={actions} onClose={closeMenu} />}
      <footer className="hints">
        {about ? (
          <span><kbd className="cap quiet">⎋</kbd> back to the history</span>
        ) : locked ? (
          <>
            {canAsk && lockShown && <span><kbd className="cap quiet">↩</kbd> unlock</span>}
            <span><kbd className="cap quiet">⎋</kbd> close</span>
          </>
        ) : (
          <>
            <span><kbd className="cap quiet">↩</kbd> paste</span>
            <span><kbd className="cap quiet">⌥↩</kbd> plain</span>
            <span><kbd className="cap quiet">{glyphs(pinKey)}</kbd> pin</span>
            <span><kbd className="cap quiet">⌘⌥⌫</kbd> delete</span>
            <span><kbd className="cap quiet">⇥</kbd> filter</span>
          </>
        )}
        <button
          type="button"
          className="exit"
          data-menu-toggle
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        >
          <kbd className="cap quiet">⌘K</kbd> actions
        </button>
      </footer>
    </main>
  );
}

/** What a locked panel shows in place of the list and the preview: that it
 *  is locked, and the way in. Where "Is it you?" cannot be asked — a Mac
 *  with no password — it says so and points at Settings, where the lock is
 *  turned off, rather than offering a button that cannot work. */
function LockCard({ canAsk, onUnlock, onSettings }: { canAsk: boolean | null; onUnlock: () => void; onSettings: () => void }) {
  return (
    <section className="lock-card" aria-live="polite">
      <LockGlyph />
      <h2>Clipboard history is locked</h2>
      {canAsk === false ? (
        <p>
          Unlocking asks “Is it you?”, which needs a password on this Mac. Turn the lock off in{" "}
          <button type="button" className="link" onMouseDown={(event) => event.preventDefault()} onClick={onSettings}>
            Settings
          </button>
          .
        </p>
      ) : (
        <>
          <p>Confirm it’s you to see and paste what you copied.</p>
          <button type="button" className="unlock" onMouseDown={(event) => event.preventDefault()} onClick={onUnlock}>
            Unlock <kbd className="cap quiet">↩</kbd>
          </button>
        </>
      )}
    </section>
  );
}

/** The last list read, for a panel mounted afresh while it is put away and
 *  kept (`keep-alive`) to draw before it is shown: its rows left out while
 *  the history is locked. */
let kept: ListAnswer | null = null;

/** The opening list asked as the page loads, before React and the panel are
 *  (`openEarly`), for the first opening to take. */
let early: Promise<ListAnswer> | null = null;

/** Ask the opening list now — `main.tsx`, first thing, with the panel on
 *  screen — so its answer is on its way while the page is still being
 *  drawn. A failure is the first opening's to say. */
export function openEarly() {
  early = call({ kind: "list", opening: true });
  early.catch(() => {});
}

function takeEarly(): Promise<ListAnswer> | null {
  const asked = early;
  early = null;
  return asked;
}

/** Whether "Is it you?" can be shown here: asked once a page. */
let canAsk_: Promise<boolean> | null = null;

/** Whether the images Lumi's reader never reached are being read. */
let readingImages = false;

/** Have the extension read the images Lumi's own reader never reached, a
 *  few per ask, behind whatever the person is doing: each ask is one of the
 *  extension's runs, so the panel's other requests go on beside it. The
 *  extension tells the panel when rows changed (`history` news), and the
 *  list is read again from that. Stops when nothing is left, on a refusal,
 *  and when the panel goes — the page thrown away, or put away and kept,
 *  which starts again at the next opening. */
function readUnread() {
  if (readingImages || isHidden()) return;
  readingImages = true;
  void (async () => {
    try {
      // A bound, not a schedule: three images an ask, a full history of
      // images is a few hundred asks at most.
      for (let ask = 0; ask < 400 && !isHidden(); ask++) {
        const { more } = await callBackground({ kind: "readImages" });
        if (!more) break;
      }
    } catch {
      // Nobody asked for this; a failure is no notice either.
    } finally {
      readingImages = false;
    }
  })();
}

/** The extension's `{"kind": …}` news: `history`, the history changed under
 *  the panel; `summoned`, the panel was asked for again; `clear`, the menu
 *  bar's Delete All Unpinned… pressed while the panel is up; `privacy`,
 *  privacy mode flipped somewhere else. A post is the
 *  extension's own JSON; checked anyway, so news of another shape — a later
 *  version's — is ignored. */
function isNews(detail: unknown, kind: "history" | "summoned" | "clear" | "privacy"): boolean {
  return typeof detail === "object" && detail !== null && (detail as { kind?: unknown }).kind === kind;
}

function emptyText(kept: number, query: string, filter: Filter, mode: SearchMode): string {
  if (!kept) return "Copy something and it shows up here";
  if (badPattern(query, mode)) return "Not a regular expression yet";
  if (query) return "Nothing matches that search";
  return `No ${FILTER_LABELS[filter].toLowerCase()} yet`;
}

/** One thing ⌘Z can take back and ⌘⇧Z do again: a pin or unpin (with the
 *  pin it had before and after), or a delete — of one row, or of all. */
type Undo = { kind: "pin"; id: string; was: string | null; now: string | null } | { kind: "delete"; ids: string[] };

/** Match the page to the panel's glass and theme. Lumi puts the chosen
 *  theme on the window, so the glass and `prefers-color-scheme` already
 *  follow it; `data-theme` says it too, for lumi.css and panel.css, which
 *  key on it. "Dark glass" is always dark; "system" follows macOS. */
function wear(appearance: ListAnswer["appearance"], theme: ListAnswer["theme"]) {
  const root = document.documentElement;
  root.dataset.material = appearance ?? "popover";
  const shown = appearance === "hud" ? "dark" : theme;
  if (shown === "light" || shown === "dark") root.dataset.theme = shown;
  else delete root.dataset.theme;
}

/** The name Save image as… suggests, macOS's screenshot shape in the
 *  local clock: "Image 2026-09-29 at 11.07.12". The suffix is the
 *  extension's to add, from the image's type. */
function savedName(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `Image ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} at ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
}
