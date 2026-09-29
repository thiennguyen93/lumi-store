// A markdown file's text as HTML, loaded with the first markdown file shown
// and never before. marked does not sanitise, and does not have to here: its
// output is only ever handed to `RichText`, which parses it inert and keeps a
// short list of tags as React elements — raw HTML, scripts, images and link
// targets in the file never reach the page.

import { Marked } from "marked";

const marked = new Marked({ gfm: true, breaks: false, async: false });

export function markdownHtml(text: string): string {
  return marked.parse(text, { async: false });
}
