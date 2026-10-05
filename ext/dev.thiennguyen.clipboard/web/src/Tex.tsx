// TeX the extension wrote (src/math.rs), typeset by KaTeX. Loaded the first
// time a copy with math is previewed, with its stylesheet and fonts: most
// panels never show any.
//
// `render` into an element rather than `renderToString` into markup: it
// builds nodes and sets their sizes through the CSSOM, which the page's
// CSP (`default-src 'self'`) allows, where the `style="…"` attributes in
// KaTeX's markup would be refused. The TeX is the extension's own, made
// from the numbers and operators it parsed — never the copy's text.

import { useLayoutEffect, useRef } from "react";

type Render = (tex: string, element: HTMLElement, options: { throwOnError: boolean; output: "htmlAndMathml" }) => void;

let loading: Promise<Render> | null = null;

function katex(): Promise<Render> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([module]) => module.default.render);
  return loading;
}

export function Tex({ tex, className }: { tex: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    let live = true;
    katex()
      .then((render) => {
        if (live) render(tex, element, { throwOnError: false, output: "htmlAndMathml" });
      })
      // KaTeX did not load: the TeX as written still says what it is.
      .catch(() => {
        if (live) element.textContent = tex;
      });
    return () => {
      live = false;
    };
  }, [tex]);
  return <span ref={box} className={className ? `tex ${className}` : "tex"} />;
}
