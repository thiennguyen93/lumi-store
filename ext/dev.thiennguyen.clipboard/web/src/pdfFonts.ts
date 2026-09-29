/** pdf.js' standard fonts (Foxit, Liberation), for PDFs that name Helvetica,
 *  Times and the like without embedding them. pdf.js asks for one by file
 *  name; the build hashes the names, so this maps the name to the file it
 *  became. Same origin and fetched by the page, not the worker, as the CSP
 *  needs. Loaded with pdf.js, never with the panel. The licences are in the
 *  glob so the build ships them beside the fonts (vite.config.ts). */
const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/node_modules/pdfjs-dist/standard_fonts/*", { query: "?url", import: "default", eager: true }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]),
);

/** pdf.js' `BinaryDataFactory`: only standard fonts; CMaps and wasm are not shipped. */
export class ShippedFonts {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "standardFontDataUrl" ? FILES[filename] : undefined;
    if (!url) throw new Error(`No shipped ${kind} data for ${filename}`);
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`${url}: ${answer.status}`);
    return new Uint8Array(await answer.arrayBuffer());
  }
}
