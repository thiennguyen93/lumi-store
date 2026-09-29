// What a file row's icon is drawn from: the extension src/history.rs keeps
// on the row (`fileExt`), mapped to a family of files. Only the name is
// ever read — no file is opened.

export type FileFamily =
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "code"
  | "audio"
  | "video"
  | "image"
  | "archive"
  | "folder"
  | "file";

const FAMILIES: Record<Exclude<FileFamily, "folder" | "file">, string> = {
  pdf: "pdf",
  doc: "doc docx pages rtf txt md markdown odt log",
  sheet: "xls xlsx numbers csv tsv ods",
  slides: "ppt pptx key odp",
  code: "html htm css js jsx ts tsx json xml yaml yml toml rs py rb go java kt swift c cc cpp h hpp cs php sh zsh sql lua vue svelte",
  audio: "mp3 m4a aac wav aiff aif flac ogg opus wma",
  video: "mp4 m4v mov avi mkv webm wmv flv mpg mpeg",
  image: "png jpg jpeg gif webp heic heif tiff tif bmp svg ico raw psd",
  archive: "zip rar 7z tar gz tgz bz2 xz dmg iso pkg",
};

const BY_EXT = new Map<string, FileFamily>(
  Object.entries(FAMILIES).flatMap(([family, exts]) => exts.split(" ").map((ext) => [ext, family as FileFamily] as const)),
);

/** `fileExt` is "/" for folders, empty when unknown or mixed. */
export function fileFamily(ext: string | undefined): FileFamily {
  if (!ext) return "file";
  if (ext === "/") return "folder";
  return BY_EXT.get(ext) ?? "file";
}

/** Extensions Lumi serves as plain text (lumi `events::playable_type`), so a
 *  file row can show its start. Word, Pages and RTF are documents, not text. */
const TEXT = new Set(
  ("txt md markdown log csv tsv ini cfg conf html htm css js mjs cjs jsx ts tsx json xml yaml yml toml rs py rb go " +
    "java kt swift c cc cpp h hpp cs php sh zsh bash fish sql lua vue svelte graphql proto dart scala ex exs zig").split(" "),
);

export function isTextFile(ext: string | undefined): boolean {
  return !!ext && TEXT.has(ext);
}
