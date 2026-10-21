// The About tab (about.html): what the extension can reach, who made it,
// where to find it and its licence, drawn in the display language the person
// chose. An extension page may run no inline script (its CSP is
// `default-src 'self'`), so this is a file of its own.

// Every word the page draws, in both languages. The author's name, the
// addresses and the licence's short name are the same in either, so they are
// not here.
const WORDS = {
  vi: {
    privacy: "Riêng tư",
    privacyTitle: "Chỉ để gõ tiếng Việt",
    noNetwork: "Không dùng mạng",
    noKeys: "Không lưu phím",
    onlyWord: "Chỉ sửa từ đang gõ",
    author: "Tác giả",
    links: "Liên kết",
    homepage: "Trang chủ",
    source: "Mã nguồn",
    licence: "GNU GPL 2.0 trở lên",
    licenceSays: "Phần mềm tự do, mã nguồn mở.",
    licenceText: "Giấy phép",
    notices: "Bên thứ ba",
    copyright: "Bản quyền © 2026 Thien Nguyen.",
    unread: "Không đọc được tệp này.",
  },
  en: {
    privacy: "Privacy",
    privacyTitle: "Just for typing Vietnamese",
    noNetwork: "No network",
    noKeys: "Keeps no keys",
    onlyWord: "Only the word you are typing",
    author: "Author",
    links: "Links",
    homepage: "Website",
    source: "Source code",
    licence: "GNU GPL 2.0 or later",
    licenceSays: "Free and open source.",
    licenceText: "Licence",
    notices: "Third-party",
    copyright: "Copyright © 2026 Thien Nguyen.",
    unread: "This file could not be read.",
  },
};

// What Lumi holds, read the way the Settings tab reads it (settings.js): the
// value arrives as text, and anything unknown falls back to the manifest's
// default. Only what this page needs: the display language.
function fromLumi(raw) {
  const value = (name) => (raw && raw[name] != null ? String(raw[name]) : "");
  return { language: value("language") === "en" ? "en" : "vi" };
}

let state = fromLumi({});

// The number of the newest read: an answer to an older one is dropped, so
// settings told meanwhile (`lumi:settings`) are never undone by it.
let asked = 0;

async function reread() {
  const mine = ++asked;
  let raw = {};
  try {
    const answer = await fetch("/__lumi__/settings");
    if (answer.ok) raw = await answer.json();
  } catch {
    // Lumi out of reach: the defaults stand.
  }
  if (mine !== asked) return;
  state = fromLumi(raw);
  draw();
}

function draw() {
  const words = WORDS[state.language];
  document.documentElement.lang = state.language;
  for (const el of document.querySelectorAll("[data-t]")) {
    el.textContent = words[el.dataset.t];
  }
  // Shown only once there is something true to show: drawn before the first
  // read, somebody who chose English would see the Vietnamese defaults flash.
  document.querySelector(".about").hidden = false;
}

// The page may not leave its own files, so the store page, the source and the
// mail are opened by the component (`ABOUT_LINKS` in src/lib.rs), which holds
// the addresses: the page only says which one.
for (const link of document.querySelectorAll("[data-open]")) {
  link.addEventListener("click", () => {
    fetch("/__lumi__/call", { method: "POST", body: link.dataset.open }).catch(() => {});
  });
}

// The licence and the notices ship beside this page as text. Followed as a
// link, a file would take the tab over, unstyled, with no way back to the
// page; so each opens under the licence card instead, one at a time, read on
// the first press.
const openers = [...document.querySelectorAll("[data-file]")];
for (const opener of openers) {
  const text = document.getElementById(opener.getAttribute("aria-controls"));
  opener.addEventListener("click", async () => {
    const open = opener.getAttribute("aria-expanded") !== "true";
    for (const other of openers) {
      other.setAttribute("aria-expanded", "false");
      document.getElementById(other.getAttribute("aria-controls")).hidden = true;
    }
    opener.setAttribute("aria-expanded", String(open));
    text.hidden = !open;
    if (!open || text.dataset.read) return;
    try {
      const answer = await fetch(opener.dataset.file);
      if (!answer.ok) throw new Error(String(answer.status));
      text.textContent = await answer.text();
      text.dataset.read = "true";
      delete text.dataset.t;
    } catch {
      // Said in the display language, and again in the other if it changes.
      text.dataset.t = "unread";
      text.textContent = WORDS[state.language].unread;
    }
  });
}

// Changed while the tab is up — the language saved in the Settings tab, or a
// profile switch: Lumi tells every page of ours.
window.addEventListener("lumi:settings", (event) => {
  asked++;
  state = fromLumi(event.detail || {});
  draw();
});

// A preview outside Lumi is told its theme on the URL, as Lumi tells a pane
// page; inside Lumi the embedding script has already written it.
const theme = new URLSearchParams(location.search).get("theme");
if ((theme === "light" || theme === "dark") && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = theme;
}

void reread();
