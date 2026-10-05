// A rich copy's HTML, drawn on the panel's glass. The markup is parsed by
// DOMParser — an inert document: no script runs, no image loads — and
// rebuilt as React elements from a short list of tags and a shorter list of
// styles, so what reaches the page is text and formatting, never the
// copy's markup itself.
//
// What is kept: bold, italic, underline, strike-through, the font, and a
// text colour that is a colour. Black and grey are dropped — they were
// chosen for a white page and would vanish on dark glass — and so are
// backgrounds and sizes, for the same reason.
//
// A link is link-coloured text. Given the copy's links (`links`, as the
// extension listed them), one whose href is among them — and any of them
// written out in the text — opens on a click (LinkedText.tsx). The href
// itself is never put on the page.

import { type CSSProperties, type ReactNode, type Ref, createElement } from "react";
import type { Link } from "./bridge";
import { linked, liveLink } from "./LinkedText";
import { linkOfHref } from "./links";

/** Tags drawn as themselves, or as the tag they mean. */
const TAGS: Record<string, string> = {
  b: "b", strong: "strong", i: "i", em: "em", u: "u", ins: "u", s: "s", strike: "s", del: "del",
  mark: "mark", code: "code", kbd: "kbd", pre: "pre", sup: "sup", sub: "sub", small: "small",
  p: "p", div: "div", br: "br", hr: "hr", blockquote: "blockquote",
  ul: "ul", ol: "ol", li: "li", h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6",
  table: "table", thead: "thead", tbody: "tbody", tr: "tr", td: "td", th: "th",
  span: "span", font: "span", a: "span",
  section: "div", article: "div", header: "div", footer: "div", figure: "div", figcaption: "div",
};

/** Tags whose contents are not text to show. */
const DROPPED = new Set(["script", "style", "head", "title", "template", "noscript", "svg", "math", "iframe", "object", "img", "video", "audio", "canvas", "button", "input", "select", "textarea"]);

/** Past these, the rest is not drawn: the pane shows a few lines. A
 *  markdown file, read to the end, may ask for more nodes. */
const MAX_NODES = 3000;
const MAX_DEPTH = 40;

let paint: CanvasRenderingContext2D | null | undefined;

/** The colour if it is one — not black, white or a grey — else undefined. */
function colour(value: string): string | undefined {
  if (!value) return undefined;
  paint ??= document.createElement("canvas").getContext("2d");
  if (!paint) return undefined;
  paint.fillStyle = "#000";
  paint.fillStyle = value;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(paint.fillStyle));
  if (!hex) return undefined;
  const [r = 0, g = 0, b = 0] = hex.slice(1).map((h) => parseInt(h, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) >= 40 ? `rgb(${r}, ${g}, ${b})` : undefined;
}

function styleOf(el: Element): CSSProperties | undefined {
  const s = (el as HTMLElement).style;
  const style: CSSProperties = {};
  const weight = s?.fontWeight;
  if (weight) style.fontWeight = weight === "bold" || weight === "bolder" || Number(weight) >= 600 ? "bold" : "normal";
  if (s?.fontStyle === "italic" || s?.fontStyle === "oblique") style.fontStyle = "italic";
  else if (s?.fontStyle === "normal") style.fontStyle = "normal";
  const line = s?.textDecorationLine || s?.textDecoration || "";
  const lines = ["underline", "line-through"].filter((l) => line.includes(l));
  if (lines.length) style.textDecorationLine = lines.join(" ");
  const family = s?.fontFamily || (el.tagName === "FONT" ? el.getAttribute("face") : null) || "";
  if (family) style.fontFamily = `${family}, -apple-system, system-ui, sans-serif`;
  const tint = colour(s?.color || (el.tagName === "FONT" ? el.getAttribute("color") ?? "" : ""));
  if (tint) style.color = tint;
  return Object.keys(style).length ? style : undefined;
}

/** The copy's formatting, or `fallback` when nothing of it would show —
 *  markup whose words all sit in tags dropped above, or none at all — so
 *  a rich row's pane is never blank while its plain text has something. */
export function RichText({
  html,
  fallback,
  maxNodes = MAX_NODES,
  links = [],
  onOpen,
  bodyRef,
}: {
  html: string;
  fallback: ReactNode;
  maxNodes?: number;
  /** The copy's links, as the extension listed them, and how to open one. */
  links?: readonly Link[];
  onOpen?: (url: string) => void;
  /** The element the formatting is drawn in, for marks laid over it. */
  bodyRef?: Ref<HTMLDivElement>;
}) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let nodes = 0;
  let shown = false;

  // `inLink`: inside an `<a>`, whose words are its own link or none.
  const walk = (node: Node, depth: number, key: number, inLink = false): ReactNode => {
    if (++nodes > maxNodes) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim()) shown = true;
      return inLink ? text : linked(text, links, onOpen);
    }
    if (node.nodeType !== Node.ELEMENT_NODE || depth > MAX_DEPTH) return null;
    const el = node as Element;
    const name = el.tagName.toLowerCase();
    // A task list's box (markdown's `- [x]`): its state, as text.
    if (name === "input" && el.getAttribute("type") === "checkbox") {
      shown = true;
      return el.hasAttribute("checked") ? "☑ " : "☐ ";
    }
    if (DROPPED.has(name)) return null;
    const kids = Array.from(el.childNodes, (child, i) => walk(child, depth + 1, i, inLink || name === "a"));
    const tag = TAGS[name];
    // html, body and the tags nobody listed: their contents, unwrapped.
    if (!tag) return createElement("span", { key, style: styleOf(el) }, ...kids);
    if (tag === "br" || tag === "hr") return createElement(tag, { key });
    const props: Record<string, unknown> = { key, style: styleOf(el) };
    if (name === "a") {
      const link = onOpen && linkOfHref(el.getAttribute("href"), links);
      Object.assign(props, link ? liveLink(link.url, onOpen) : { className: "link" });
    }
    return createElement(tag, props, ...kids);
  };

  const drawn = walk(doc.body, 0, 0);
  return shown ? (
    <div ref={bodyRef} className="body rich-html">
      {drawn}
    </div>
  ) : (
    fallback
  );
}
