// Help tags for the controls that are only a picture — the notes, the
// subdivisions, ▷, the speaker, −/+ — as macOS shows one: after the
// pointer rests on a control, under it, gone at the first press, key or
// scroll. Any element with `data-tip` gets one; nothing else does.
//
// Drawn in the page rather than with `title`, which wry draws nothing for
// in Lumi; and kept inside the page's own box, since an embedded page is a
// webview that clips whatever crosses its edge. (In Lumi proper a page can
// ask for Lumi's own tooltip window, `POST /__lumi__/tip`; the mock draws
// its own.)

// A module, not a script: its names are its own.
export {};

const REST = 600;
const GAP = 6;
const MARGIN = 4;

let tip: HTMLDivElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let over: HTMLElement | null = null;

function element(): HTMLDivElement {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "m-tip";
    tip.setAttribute("role", "tooltip");
    document.body.append(tip);
  }
  return tip;
}

function hide() {
  clearTimeout(timer);
  over = null;
  tip?.classList.remove("shown");
}

function show(target: HTMLElement) {
  const text = target.dataset.tip;
  if (!text || !target.isConnected) return;
  const box = element();
  box.textContent = text;
  box.classList.add("shown");
  const anchor = target.getBoundingClientRect();
  const size = box.getBoundingClientRect();
  const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - size.width / 2), innerWidth - size.width - MARGIN);
  // Under the control, or over it where there is no room under.
  const below = anchor.bottom + GAP;
  const top = below + size.height <= innerHeight - MARGIN ? below : anchor.top - GAP - size.height;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

addEventListener(
  "pointerover",
  (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-tip]") ?? null;
    if (target === over) return;
    hide();
    if (!target) return;
    over = target;
    timer = setTimeout(() => show(target), REST);
  },
  true,
);
for (const type of ["pointerdown", "keydown", "wheel", "blur"] as const) addEventListener(type, hide, true);
document.addEventListener("pointerleave", hide);
