(async () => {
  const frame = document.querySelector("iframe");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // English in Terminal, and the other apps it is English in. The page asks its component what to
  // show (`call("state")`) and Lumi for the toggle's key; both are answered
  // here as they would be, and the page is told to ask again, as Lumi tells
  // it when the popover is shown.
  const state = {
    v: 1,
    on: false,
    method: "telex",
    options: { modernTone: true, escRestore: true, englishRestore: false, perApp: true },
    app: "Terminal",
    alike: [
      { id: "com.microsoft.VSCode", name: "Visual Studio Code" },
      { id: "com.github.wez.wezterm", name: "WezTerm" },
      { id: "com.apple.dt.Xcode", name: "Xcode" },
    ],
    language: "en",
  };
  const answer = (body) => Promise.resolve(new win.Response(JSON.stringify(body), { status: 200 }));
  const fetched = win.fetch.bind(win);
  win.fetch = (url, init = {}) => {
    const path = String(url);
    if (path === "/__lumi__/call") return answer(state);
    if (path === "/__lumi__/shortcuts") {
      return answer({ on: true, commands: [], ess: [{ command: "toggle", key: "Tap+Fn+Shift", declared: "Tap+Fn+Shift", state: "set" }] });
    }
    return fetched(url, init);
  };
  await win.refresh();
  // The remembered apps' icons are this Mac's own, drawn by preview_ui.py.
  for (let i = 0; i < 80; i++) {
    const icons = [...doc.querySelectorAll("#alike img")];
    if (icons.length && icons.every((icon) => icon.complete)) return "ok";
    await sleep(100);
  }
  return "the remembered apps' icons never loaded";
})()
