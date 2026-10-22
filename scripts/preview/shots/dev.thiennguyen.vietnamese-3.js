(async () => {
  const frame = document.querySelector("iframe");
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The Settings tab in English, every switch as it ships, and the toggle's
  // key as Lumi set it at install. The page reads both from Lumi; they are
  // answered here, and the page asked again.
  const settings = {
    language: "en",
    method: "telex",
    modernTone: "true",
    escRestore: "true",
    englishRestore: "false",
    perApp: "true",
    popoverAppearance: "system",
  };
  const answer = (body) => Promise.resolve(new win.Response(JSON.stringify(body), { status: 200 }));
  const fetched = win.fetch.bind(win);
  win.fetch = (url, init = {}) => {
    const path = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (path === "/__lumi__/settings" && method === "GET") return answer(settings);
    if (path === "/__lumi__/shortcuts" && method === "GET") {
      return answer({ on: true, commands: [], ess: [{ command: "toggle", key: "Ctrl+Shift+KeyV", declared: "Ctrl+Shift+KeyV", state: "set" }] });
    }
    return fetched(url, init);
  };
  await Promise.all([win.reread(), win.readKey()]);
  // Down to Escape's switch, high enough to stand clear of the callout over
  // the window's corner; the rows above it fade under the tab's top edge.
  const escape = doc.querySelector('[data-switch="escRestore"]');
  win.scrollTo(0, escape.getBoundingClientRect().top + win.scrollY - 110);
  await sleep(400);
  return doc.documentElement.lang === "en" ? "ok" : "the page is not in English";
})()
