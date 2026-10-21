// The About tab (about.html): what the extension can reach and its licence,
// drawn in the display language the person chose. An extension
// page may run no inline script (its CSP is `default-src 'self'`), so this is
// a file of its own.

// Every word the page draws, in both languages. The source's address is the
// same in either, so it is not here.
const WORDS = {
  vi: {
    privacyTitle: "Riêng tư",
    privacyLead: "Mọi phím bạn gõ đều đi qua extension này để thành chữ Việt, và nó không làm gì khác.",
    netName: "Không dùng mạng",
    netSays: "Nó không có quyền truy cập mạng.",
    keepName: "Không giữ phím",
    keepSays: "Phím bạn gõ không được lưu lại.",
    wordName: "Chỉ sửa từ đang gõ",
    wordSays: "Lumi chỉ cho nó thay đổi từ bạn đang gõ.",
    permsNote: "Lumi ghi đủ những gì nó được phép làm ở nút Permissions phía trên.",
    licenceTitle: "Giấy phép",
    licenceLead: "Phần mềm tự do, theo giấy phép GNU GPL phiên bản 2 trở lên.",
    sourceName: "Mã nguồn",
    gplName: "Giấy phép GNU GPL",
    gplSays: "Toàn văn, bằng tiếng Anh.",
    noticesName: "Ghi nhận bên thứ ba",
    noticesSays: "Giấy phép của các thành phần bên thứ ba.",
    unread: "Không đọc được tệp này.",
  },
  en: {
    privacyTitle: "Privacy",
    privacyLead: "Every key you type passes through this extension to become Vietnamese, and it does nothing else.",
    netName: "No network",
    netSays: "It holds no network access.",
    keepName: "Keeps no keys",
    keepSays: "The keys you type are not stored.",
    wordName: "Only the word you are typing",
    wordSays: "Lumi lets it change only the word you are typing.",
    permsNote: "Lumi lists everything it may do under Permissions, above.",
    licenceTitle: "Licence",
    licenceLead: "Free software under the GNU General Public License, version 2 or later.",
    sourceName: "Source code",
    gplName: "GNU General Public License",
    gplSays: "The full text.",
    noticesName: "Third-party notices",
    noticesSays: "The licences of the components it is built on.",
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

// The page may not leave its own files, so the source on GitHub is opened in
// the browser by the component (`OPEN_SOURCE` in src/lib.rs), which holds the
// address.
document.querySelector("[data-source]").addEventListener("click", () => {
  fetch("/__lumi__/call", { method: "POST", body: "source" }).catch(() => {});
});

// The licence and the notices ship beside this page as text. Followed as a
// link, a file would take the tab over, unstyled, with no way back to the
// page; so each opens under its own row instead, read on the first press.
for (const row of document.querySelectorAll("[data-file]")) {
  const text = document.getElementById(row.getAttribute("aria-controls"));
  row.addEventListener("click", async () => {
    const open = row.getAttribute("aria-expanded") !== "true";
    row.setAttribute("aria-expanded", String(open));
    text.hidden = !open;
    if (!open || text.dataset.read) return;
    try {
      const answer = await fetch(row.dataset.file);
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
