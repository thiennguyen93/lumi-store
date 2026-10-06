// Keyboard Cleaner's sheet: says what Clean keyboard is about to do — read
// from the extension's settings, the same ones the Settings tab sets — and
// answers the page that opened it: "lock", or nothing.

(() => {
  "use strict";

  const lock = document.getElementById("confirm-lock");
  const cancel = document.getElementById("confirm-cancel");

  function durationWords(seconds) {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  function show(settings) {
    const seconds = Number(settings["clean-seconds"]);
    // On unless turned off, as the manifest's default says.
    const pointer = settings["clean-pointer"] !== "false";
    document.getElementById("confirm-time").textContent = durationWords(
      [30, 60, 120, 300].includes(seconds) ? seconds : 60,
    );
    document.getElementById("confirm-held").textContent = pointer ? "No key, click or scroll" : "No key";
    // With the trackpad locked nothing can be pressed, so the button is not
    // offered while cleaning — and not listed here either.
    document.getElementById("way-button").hidden = pointer;
    document.getElementById("way-keys-or").textContent = pointer ? "Hold" : "Or hold";
  }

  // The room in Lumi's frame, fitted to what is shown: the manifest's height
  // holds every way out, and with the trackpad locked one fewer is listed.
  // An older Lumi refuses, and the sheet keeps its declared size.
  function fit() {
    const { height } = document.querySelector("main").getBoundingClientRect();
    fetch("/__lumi__/size", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width: document.documentElement.clientWidth, height: Math.ceil(height) }),
    }).catch(() => {});
  }

  const answer = (result) =>
    fetch("/__lumi__/sheet/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    }).catch(() => {});
  const dismiss = () => fetch("/__lumi__/sheet", { method: "DELETE" }).catch(() => {});

  lock.addEventListener("click", () => answer("lock"));
  cancel.addEventListener("click", dismiss);

  // Escape cancels; Enter or Space presses the button in focus — Lock
  // keyboard to begin with; Tab moves between the two.
  document.addEventListener("keydown", (event) => {
    // A key already held down as the sheet opened is no answer: the
    // keyboard locks only on a press made while reading this.
    if (event.repeat) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      (document.activeElement === cancel ? cancel : lock).click();
    } else if (event.key === "Tab") {
      event.preventDefault();
      (document.activeElement === lock ? cancel : lock).focus();
    }
  });

  lock.focus();
  // Unread settings are the defaults, so the sheet still says what the
  // page will do.
  fetch("/__lumi__/settings")
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
    .then(show)
    .catch(() => {})
    .then(fit);
})();
