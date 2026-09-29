// Syntax colours for a code file's text, loaded with the first code file
// shown and never before. lowlight runs highlight.js and hands back a hast
// tree, which `codeNodes` turns into React elements: nothing the file says is
// ever parsed as markup (no `innerHTML`). Plain JS — the CSP allows no wasm.

import type { ReactNode } from "react";
import { createElement } from "react";
import type { LanguageFn } from "highlight.js";
import { createLowlight } from "lowlight";

/** Each grammar its own small chunk, fetched the first time it is needed. */
const GRAMMARS: Record<string, () => Promise<{ default: LanguageFn }>> = {
  typescript: () => import("highlight.js/lib/languages/typescript"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  python: () => import("highlight.js/lib/languages/python"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  java: () => import("highlight.js/lib/languages/java"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  swift: () => import("highlight.js/lib/languages/swift"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  php: () => import("highlight.js/lib/languages/php"),
  bash: () => import("highlight.js/lib/languages/bash"),
  sql: () => import("highlight.js/lib/languages/sql"),
  lua: () => import("highlight.js/lib/languages/lua"),
  css: () => import("highlight.js/lib/languages/css"),
  xml: () => import("highlight.js/lib/languages/xml"),
  json: () => import("highlight.js/lib/languages/json"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  protobuf: () => import("highlight.js/lib/languages/protobuf"),
  dart: () => import("highlight.js/lib/languages/dart"),
  scala: () => import("highlight.js/lib/languages/scala"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
};

const lowlight = createLowlight();

// hast's types, as lowlight's own answer gives them (no `@types/hast` of ours).
type Root = ReturnType<typeof lowlight.highlight>;
type Content = Root["children"][number];

/** `text` coloured as `language` (a key of `GRAMMARS`). Throws on an unknown
 *  language or a grammar that failed to load; the caller keeps plain text. */
export async function highlight(text: string, language: string): Promise<ReactNode[]> {
  if (!lowlight.registered(language)) {
    const load = GRAMMARS[language];
    if (!load) throw new Error(`no grammar for ${language}`);
    lowlight.register(language, (await load()).default);
  }
  return codeNodes(lowlight.highlight(language, text));
}

function codeNodes(tree: Root): ReactNode[] {
  const walk = (nodes: readonly Content[]): ReactNode[] =>
    nodes.map((node, i) => {
      if (node.type === "text") return node.value;
      if (node.type !== "element") return null;
      const names = node.properties.className;
      const className = Array.isArray(names) ? names.join(" ") : undefined;
      return createElement("span", { key: i, className }, ...walk(node.children));
    });
  return walk(tree.children);
}
