(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dark = document.documentElement.dataset.theme === "dark";

  // --- The desk: a Mac in the middle of a call, the same in every Mic Mute
  // shot (-1 … -4; change it in all four). The screen, the menu bar and the
  // call are stand-ins; Mic Mute's icon is its own (ui/icons), and what it
  // draws on the screen is its own page — the promo page's one window,
  // moved onto the desk where Lumi puts it, on a stand-in for the glass Lumi
  // draws under it. The call is the app in front, so the menu bar is its
  // menus — a click on a menu bar icon leaves the front app where it is.
  const MIC_OFF = '<path d="M12 19v3"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M16.95 16.95A7 7 0 0 1 5 12v-2"/><path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/><path d="m2 2 20 20"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>';
  const MIC = '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>';
  const glyph = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  async function desk({ left, top, width, height, zoom, icon, you, whole = false, call = { left: 28, top: 52 } }) {
    const style = document.createElement("style");
    style.textContent = `
      .mm-desk { position: absolute; overflow: hidden; border-radius: ${whole ? "14px" : "14px 14px 0 0"};
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1); }
      .mm-in { position: absolute; left: 0; top: 0; zoom: ${zoom}; overflow: hidden;
        font: 13px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        --ink: ${dark ? "#f2f2f7" : "#1d1d1f"};
        --bar: ${dark ? "rgba(28, 28, 30, 0.55)" : "rgba(246, 246, 246, 0.6)"};
        --glass: ${dark ? "rgba(44, 44, 48, 0.78)" : "rgba(242, 242, 245, 0.82)"};
        --edge: ${dark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.14)"};
        color: var(--ink);
        background: ${dark
          ? "radial-gradient(70% 90% at 15% 10%, #3b3f8c, transparent 70%), radial-gradient(60% 80% at 90% 90%, #7a2f4d, transparent 70%), linear-gradient(160deg, #1c2046, #2a1f3d 55%, #3d1f2c)"
          : "radial-gradient(70% 90% at 15% 10%, #9fb8ff, transparent 70%), radial-gradient(60% 80% at 90% 90%, #ffc2b3, transparent 70%), linear-gradient(160deg, #b9c8ff, #d9c2f0 55%, #f6cdd6)"}; }
      .mm-bar { position: absolute; left: 0; right: 0; top: 0; height: 24px; display: flex; align-items: center; gap: 18px; padding: 0 14px;
        background: var(--bar); -webkit-backdrop-filter: blur(30px) saturate(1.6); backdrop-filter: blur(30px) saturate(1.6); white-space: nowrap; }
      .mm-bar .apple { font-size: 15px; margin-right: 2px; }
      .mm-bar .sp { flex: 1; }
      .mm-bar .gl { width: 16px; height: 16px; }
      .mm-item { display: grid; place-items: center; height: 20px; padding: 0 6px; margin: 0 -6px; border-radius: 5px; }
      .mm-item svg { height: 16px; width: auto; }
      .mm-item.lit { background: ${dark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.12)"}; }
      .mm-call { position: absolute; display: flex; flex-direction: column; border-radius: 11px; overflow: hidden; background: #1c1c1e; color: #fff;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(0, 0, 0, 0.4); }
      .mm-call .tb { flex: none; height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #2a2a2c; font-size: 13px; font-weight: 600; color: #d1d1d6; }
      .mm-call .tb i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; }
      .mm-call .tb i:nth-child(2) { background: #febc2e; }
      .mm-call .tb i:nth-child(3) { background: #28c840; margin-right: 10px; }
      .mm-call .tiles { flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 6px; padding: 6px; }
      .mm-call .tile { position: relative; display: grid; place-items: center; border-radius: 8px; background: #2c2f38; }
      .mm-call .tile:nth-child(2) { background: #2f3530; }
      .mm-call .tile:nth-child(3) { background: #372e33; }
      .mm-call .tile:nth-child(4) { background: #2e3138; }
      .mm-call .face { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; font-size: 22px; font-weight: 600; background: var(--c); }
      .mm-call .tile em { position: absolute; left: 9px; bottom: 7px; font-style: normal; font-size: 12px; color: #e5e5ea; }
      .mm-call .badge { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #ff3b30; }
      .mm-call .badge svg { width: 13px; height: 13px; stroke-width: 2.4; }
      .mm-call .tile.talking { box-shadow: inset 0 0 0 3px #30d158; }
      .mm-call .tools { flex: none; height: 52px; display: flex; align-items: center; justify-content: center; gap: 12px; background: #232325; }
      .mm-call .tool { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #3a3a3c; }
      .mm-call .tool svg { width: 17px; height: 17px; }
      .mm-call .leave { height: 30px; padding: 0 16px; border-radius: 15px; display: grid; place-items: center; background: #ff3b30; font-size: 13px; font-weight: 600; }
      .mm-glass { border-radius: 12px; overflow: hidden; background: var(--glass); box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3), 0 0 0 0.5px var(--edge);
        -webkit-backdrop-filter: blur(40px) saturate(1.8); backdrop-filter: blur(40px) saturate(1.8); }
      .mm-arrow { position: absolute; width: 24px; height: 11px; background: var(--glass); clip-path: polygon(50% 0, 100% 100%, 0 100%);
        -webkit-backdrop-filter: blur(40px) saturate(1.8); backdrop-filter: blur(40px) saturate(1.8); }
    `;
    document.head.append(style);
    const frame = document.createElement("div");
    frame.className = "mm-desk";
    Object.assign(frame.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const inner = document.createElement("div");
    inner.className = "mm-in";
    Object.assign(inner.style, { width: `${width / zoom}px`, height: `${height / zoom}px` });
    const itemIcon = await (await fetch(`/icons/${icon}${dark ? ".dark" : ""}.svg`)).text();
    inner.innerHTML = `
      <div class="mm-call" style="left: ${call.left}px; top: ${call.top}px; width: 460px; height: 340px">
        <div class="tb"><i></i><i></i><i></i>Weekly Sync</div>
        <div class="tiles">
          <div class="tile you"><span class="face" style="--c: #5e5ce6">Y</span><em>You</em></div>
          <div class="tile"><span class="face" style="--c: #30b0c7">L</span><em>Linh</em></div>
          <div class="tile"><span class="face" style="--c: #ff9f0a">S</span><em>Sam</em></div>
          <div class="tile"><span class="face" style="--c: #34c759">A</span><em>Ana</em></div>
        </div>
        <div class="tools">
          <span class="tool">${glyph(MIC)}</span>
          <span class="tool">${glyph('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>')}</span>
          <span class="tool">${glyph('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>')}</span>
          <span class="leave">Leave</span>
        </div>
      </div>
      <div class="mm-bar">
        <span class="apple">&#xF8FF;</span><b>Meeting</b><span>File</span><span>Edit</span><span>View</span><span>Call</span><span>Window</span><span>Help</span>
        <span class="sp"></span>
        <span class="mm-item">${itemIcon}</span>
        <svg class="gl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>
        <svg class="gl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect width="16" height="10" x="2" y="7" rx="2"/><path d="M22 11v2"/><rect x="4.5" y="9.5" width="9" height="5" rx="0.6" fill="currentColor" stroke="none"/></svg>
        <span>Wed 10:30 AM</span>
      </div>`;
    const tile = inner.querySelector(".tile.you");
    if (you === "muted") tile.insertAdjacentHTML("beforeend", `<span class="badge">${glyph(MIC_OFF)}</span>`);
    if (you === "talking") tile.classList.add("talking");
    frame.append(inner);
    document.querySelector("p.sub").after(frame);
    const item = inner.querySelector(".mm-item");
    // Where the icon is, in the desk's own points.
    const at = () => {
      const a = item.getBoundingClientRect();
      const b = inner.getBoundingClientRect();
      const scale = b.width / inner.offsetWidth;
      return { x: (a.left - b.left + a.width / 2) / scale, bottom: (a.bottom - b.top) / scale };
    };
    return { inner, item, at };
  }
  // The page's window, moved onto the desk: an iframe moved loads its page
  // again, so this waits for the page's own `ready` to be there.
  async function onDesk(inner, box, ready) {
    inner.append(box);
    const frame = box.querySelector("iframe");
    for (let n = 0; n < 100; n++) {
      await sleep(50);
      const win = frame.contentWindow;
      if ((!ready || typeof win[ready] === "function") && frame.contentDocument.readyState === "complete") return { win, doc: frame.contentDocument };
    }
    return null;
  }

  // --- This shot: the panel open under the icon, every microphone muted ---
  const box = document.querySelector(".window");
  const { inner, item, at } = await desk({ left: 100, top: 226, width: 1080, height: 600, zoom: 1.4, icon: "muted", you: "muted" });
  item.classList.add("lit");
  // Under the icon, centred on it (`anchor = { at = "center" }`), its arrow
  // on the icon.
  const { x, bottom } = at();
  const width = 300;
  const panelTop = bottom + 2 + 10;
  box.className = "window mm-glass";
  Object.assign(box.style, { left: `${x - width / 2}px`, top: `${panelTop}px`, width: `${width}px` });
  const arrow = document.createElement("div");
  arrow.className = "mm-arrow";
  Object.assign(arrow.style, { left: `${x - 12}px`, top: `${panelTop - 11}px` });
  inner.append(arrow);
  const page = await onDesk(inner, box, "refresh");
  if (!page) return "the panel never loaded on the desk";
  const { win, doc } = page;
  // The panel's microphones, from the stand-in bridge
  // (scripts/preview/dev.thiennguyen.mic-mute.json). The page asks Mic
  // Mute's component with a plain word, `call("state")`; the stand-in
  // answers by `kind`, so it is asked here and its answer handed to the
  // page. Lumi's key for the toggle, and the panel's height — Lumi sizes the
  // panel to what the page asks — are answered as Lumi would.
  const fetched = win.fetch.bind(win);
  const state = await (await fetched("/__lumi__/call", { method: "POST", body: JSON.stringify({ kind: "state" }) })).json();
  const answer = (body) => Promise.resolve(new win.Response(JSON.stringify(body), { status: 200 }));
  win.fetch = (url, init = {}) => {
    const path = String(url);
    if (path === "/__lumi__/call") return answer(state);
    if (path === "/__lumi__/shortcuts") {
      return answer({ on: true, commands: [], ess: [{ command: "toggle", key: "Alt+Super+KeyM", declared: "alt+cmd+m", state: "set" }] });
    }
    if (path === "/__lumi__/size") {
      box.style.height = `${JSON.parse(init.body).height}px`;
      return answer({});
    }
    return fetched(url, init);
  };
  await win.refresh();
  await sleep(200);
  return doc.querySelectorAll("#devices li").length === state.devices.length ? "ok" : "the microphones were not drawn";
})()
