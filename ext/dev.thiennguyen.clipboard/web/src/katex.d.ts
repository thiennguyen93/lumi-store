// KaTeX 0.19 ships no type declarations in its package; this is the one
// call Tex.tsx makes.

declare module "katex" {
  export interface KatexOptions {
    displayMode?: boolean;
    throwOnError?: boolean;
    output?: "html" | "mathml" | "htmlAndMathml";
    trust?: boolean;
    strict?: boolean | "ignore" | "warn" | "error";
  }
  export function render(tex: string, element: HTMLElement, options?: KatexOptions): void;
  const katex: { render: typeof render };
  export default katex;
}
